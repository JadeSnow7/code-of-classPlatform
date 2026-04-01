import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { aiStreamClient } from '@/lib/ai-stream';
import { aiApi } from '@/api/ai';
import type { ChatMessage } from '@/api/ai';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type ChatStatus = 'idle' | 'streaming' | 'error';

interface Conversation {
    id: string;
    sessionId?: string; // server-side session ID for persistence
    title: string;
    messages: ChatMessage[];
    createdAt: number;
    updatedAt: number;
}

interface ChatStoreState {
    // Current conversation state
    status: ChatStatus;
    currentConversationId: string | null;
    error: string | null;

    // Conversation history
    conversations: Conversation[];

    // Options
    mode: string;
    rag: boolean;

    // Actions
    getCurrentConversation: () => Conversation | null;
    getMessages: () => ChatMessage[];

    // Conversation management
    newConversation: () => string;
    selectConversation: (id: string) => Promise<void>;
    deleteConversation: (id: string) => void;
    clearHistory: () => void;

    // Message actions
    sendMessage: (prompt: string, courseId?: string) => Promise<void>;
    appendToken: (token: string) => void;
    stop: () => void;
    setError: (error: string | null) => void;
    finishStreaming: () => void;

    // Options
    setMode: (mode: string) => void;
    setRag: (rag: boolean) => void;
}

// Track abort controller outside Zustand (non-serializable)
let abortController: AbortController | null = null;

function generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function generateTitle(messages: ChatMessage[]): string {
    const firstUserMsg = messages.find(m => m.role === 'user');
    if (firstUserMsg) {
        return firstUserMsg.content.slice(0, 30) + (firstUserMsg.content.length > 30 ? '...' : '');
    }
    return '新对话';
}

export const useChatStore = create<ChatStoreState>()(
    persist(
        (set, get) => ({
            // Initial state
            status: 'idle',
            currentConversationId: null,
            error: null,
            conversations: [],
            mode: 'tutor',
            rag: false,

            // Get current conversation
            getCurrentConversation: () => {
                const { currentConversationId, conversations } = get();
                if (!currentConversationId) return null;
                return conversations.find(c => c.id === currentConversationId) || null;
            },

            // Get messages of current conversation
            getMessages: () => {
                const conv = get().getCurrentConversation();
                return conv?.messages || [];
            },

            // Create new conversation
            newConversation: () => {
                const id = generateId();
                const newConv: Conversation = {
                    id,
                    title: '新对话',
                    messages: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                };
                set(state => ({
                    conversations: [newConv, ...state.conversations],
                    currentConversationId: id,
                    status: 'idle',
                    error: null,
                }));
                return id;
            },

            // Select existing conversation and sync messages from server if available
            selectConversation: async (id: string) => {
                abortController?.abort();
                set({ currentConversationId: id, status: 'idle', error: null });

                const conv = get().conversations.find(c => c.id === id);
                if (conv?.sessionId) {
                    try {
                        const result = await aiApi.listSessionMessages(conv.sessionId);
                        const messages: ChatMessage[] = result.items.map(m => ({
                            role: m.role as ChatMessage['role'],
                            content: m.content,
                        }));
                        if (messages.length > 0) {
                            set(state => ({
                                conversations: state.conversations.map(c =>
                                    c.id === id ? { ...c, messages } : c
                                ),
                            }));
                        }
                    } catch {
                        // keep local messages on failure
                    }
                }
            },

            // Delete conversation (and server session if exists)
            deleteConversation: (id: string) => {
                const conv = get().conversations.find(c => c.id === id);
                if (conv?.sessionId) {
                    aiApi.deleteSession(conv.sessionId).catch(() => {/* best-effort */});
                }
                set(state => {
                    const filtered = state.conversations.filter(c => c.id !== id);
                    const newCurrentId = state.currentConversationId === id
                        ? (filtered[0]?.id || null)
                        : state.currentConversationId;
                    return {
                        conversations: filtered,
                        currentConversationId: newCurrentId,
                    };
                });
            },

            // Clear all history
            clearHistory: () => {
                set({ conversations: [], currentConversationId: null, status: 'idle' });
            },

            // Send message - async action
            sendMessage: async (prompt: string, courseId?: string) => {
                const { mode, rag, currentConversationId: initialConversationId } = get();
                let currentConversationId = initialConversationId;

                // Create new conversation if none exists
                if (!currentConversationId) {
                    currentConversationId = get().newConversation();
                }

                const conv = get().conversations.find(c => c.id === currentConversationId);
                if (!conv) {
                    set({
                        status: 'error',
                        error: 'Conversation not found',
                    });
                    return;
                }

                // Add user message and assistant placeholder
                const updatedMessages: ChatMessage[] = [
                    ...conv.messages,
                    { role: 'user', content: prompt },
                    { role: 'assistant', content: '' },
                ];

                // Update conversation
                set(state => ({
                    status: 'streaming',
                    error: null,
                    conversations: state.conversations.map(c =>
                        c.id === currentConversationId
                            ? {
                                ...c,
                                messages: updatedMessages,
                                title: c.messages.length === 0 ? generateTitle(updatedMessages) : c.title,
                                updatedAt: Date.now()
                            }
                            : c
                    ),
                }));

                // Start streaming
                abortController?.abort();
                abortController = new AbortController();

                // Build effective mode
                let effectiveMode = mode || 'tutor';
                if (rag) {
                    effectiveMode = `${effectiveMode}_rag`;
                }

                // Filter empty messages for API call
                const filteredMessages = updatedMessages.filter(m => m.content.trim() !== '');

                // Lazily create a server-side session on first message
                let sessionId = conv.sessionId;
                if (!sessionId) {
                    try {
                        const created = await aiApi.createAiSession({ mode: effectiveMode });
                        sessionId = created.sessionId;
                        set(state => ({
                            conversations: state.conversations.map(c =>
                                c.id === currentConversationId ? { ...c, sessionId } : c
                            ),
                        }));
                    } catch {
                        // session creation failed; fall back to stateless chat
                    }
                }

                try {
                    if (sessionId) {
                        const inputMessages = filteredMessages.map(m => ({
                            id: '',
                            role: m.role,
                            content: m.content,
                        }));
                        await aiApi.streamRun(sessionId, { input: inputMessages, stream: true }, {
                            signal: abortController.signal,
                            onEvent: (event) => {
                                if (event.event === 'token') {
                                    get().appendToken(event.data.text);
                                } else if (event.event === 'done') {
                                    get().finishStreaming();
                                } else if (event.event === 'error') {
                                    get().setError(event.data.message);
                                }
                            },
                        });
                    } else {
                        await aiStreamClient.streamChat(filteredMessages, {
                            mode: effectiveMode,
                            courseId,
                            signal: abortController.signal,
                            onMessage: (token: string) => get().appendToken(token),
                            onFinish: () => get().finishStreaming(),
                            onError: (error: Error) => get().setError(error.message),
                        });
                    }
                } catch (err: unknown) {
                    const error = err instanceof Error ? err : new Error('Stream failed');
                    if (error.name !== 'AbortError') {
                        get().setError(error.message);
                    }
                }
            },

            // Append token to current assistant message
            appendToken: (token: string) => {
                const { currentConversationId } = get();
                if (!currentConversationId) return;

                set(state => ({
                    conversations: state.conversations.map(c => {
                        if (c.id !== currentConversationId) return c;
                        const msgs = [...c.messages];
                        const last = msgs[msgs.length - 1];
                        if (last?.role === 'assistant') {
                            msgs[msgs.length - 1] = { ...last, content: last.content + token };
                        }
                        return { ...c, messages: msgs, updatedAt: Date.now() };
                    }),
                }));
            },

            // Stop streaming
            stop: () => {
                abortController?.abort();
                set({ status: 'idle' });
            },

            // Set error
            setError: (error: string | null) => {
                set({ status: error ? 'error' : 'idle', error });
            },

            // Finish streaming
            finishStreaming: () => {
                set({ status: 'idle' });
            },

            // Set mode
            setMode: (mode: string) => set({ mode }),
            setRag: (rag: boolean) => set({ rag }),
        }),
        {
            name: 'chat-storage',
            // Only persist certain fields
            partialize: (state) => ({
                conversations: state.conversations,
                currentConversationId: state.currentConversationId,
                mode: state.mode,
                rag: state.rag,
            }),
        }
    )
);
