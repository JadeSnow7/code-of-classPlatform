import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { aiStreamClient } from '@/lib/ai-stream';
import type { ChatMessage } from '@/api/ai';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type ChatStatus = 'idle' | 'streaming' | 'error';

interface Conversation {
    id: string;
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
    selectConversation: (id: string) => void;
    deleteConversation: (id: string) => void;
    clearHistory: () => void;

    // Message actions
    sendMessage: (prompt: string) => Promise<void>;
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

            // Select existing conversation
            selectConversation: (id: string) => {
                // Abort any ongoing stream when switching
                abortController?.abort();
                set({ currentConversationId: id, status: 'idle', error: null });
            },

            // Delete conversation
            deleteConversation: (id: string) => {
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
            sendMessage: async (prompt: string) => {
                let { currentConversationId, conversations, mode, rag } = get();

                // Create new conversation if none exists
                if (!currentConversationId) {
                    currentConversationId = get().newConversation();
                }

                // Add user message and assistant placeholder
                const conv = conversations.find(c => c.id === currentConversationId)!;
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

                try {
                    await aiStreamClient.streamChat(filteredMessages, {
                        mode: effectiveMode,
                        signal: abortController.signal,
                        onMessage: (token: string) => get().appendToken(token),
                        onFinish: () => get().finishStreaming(),
                        onError: (error: Error) => get().setError(error.message),
                    });
                } catch (err: any) {
                    if (err.name !== 'AbortError') {
                        get().setError(err.message || 'Stream failed');
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
