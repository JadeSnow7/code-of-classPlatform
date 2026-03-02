import { useCallback, useMemo, useRef, useState } from 'react';
import { aiStreamClient } from '@/lib/ai-stream';
import type {
    ChatMessage,
    OrchestratedChatRequest,
    TaskAttachment,
    ThoughtEvent,
    WorkspaceContext,
} from '@classplatform/shared';

type ChatStatus = 'idle' | 'streaming' | 'error';

interface UseOrchestratedChatState {
    requestId: string | null;
    status: ChatStatus;
    error: string | null;
    messages: ChatMessage[];
    thoughts: ThoughtEvent[];
}

interface SendPayload {
    prompt: string;
    attachments?: TaskAttachment[];
    workspaceContext?: WorkspaceContext;
    courseId?: string;
}

export function useOrchestratedChat() {
    const [state, setState] = useState<UseOrchestratedChatState>({
        requestId: null,
        status: 'idle',
        error: null,
        messages: [],
        thoughts: [],
    });
    const abortControllerRef = useRef<AbortController | null>(null);

    const send = useCallback(async (payload: SendPayload) => {
        abortControllerRef.current?.abort();
        abortControllerRef.current = new AbortController();

        const request: OrchestratedChatRequest = {
            messages: [...state.messages.filter((message) => message.content.trim() !== ''), { role: 'user', content: payload.prompt }],
            attachments: payload.attachments ?? [],
            workspace_context: payload.workspaceContext,
            course_id: payload.courseId,
            privacy: 'public',
            route: 'cloud',
            stream: true,
        };

        setState((current) => ({
            ...current,
            status: 'streaming',
            error: null,
            thoughts: [],
            messages: [...current.messages, { role: 'user', content: payload.prompt }, { role: 'assistant', content: '' }],
        }));

        await aiStreamClient.streamOrchestratedChat(request, {
            signal: abortControllerRef.current.signal,
            onStart: (requestId) => setState((current) => ({ ...current, requestId })),
            onThought: (thought) => setState((current) => ({ ...current, thoughts: [...current.thoughts, thought] })),
            onMessage: (content) => setState((current) => {
                const nextMessages = [...current.messages];
                const last = nextMessages[nextMessages.length - 1];
                if (last?.role === 'assistant') {
                    nextMessages[nextMessages.length - 1] = { ...last, content: last.content + content };
                } else {
                    nextMessages.push({ role: 'assistant', content });
                }
                return { ...current, messages: nextMessages };
            }),
            onError: (error) => setState((current) => ({ ...current, status: 'error', error: error.message })),
            onFinish: () => setState((current) => ({ ...current, status: 'idle' })),
        });
    }, [state.messages]);

    const stop = useCallback(() => {
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        setState((current) => ({ ...current, status: 'idle' }));
    }, []);

    return useMemo(() => ({
        ...state,
        send,
        stop,
    }), [send, state, stop]);
}
