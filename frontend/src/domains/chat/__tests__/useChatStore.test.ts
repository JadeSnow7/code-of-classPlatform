import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '@/api/ai';

const { streamChatMock } = vi.hoisted(() => ({
    streamChatMock: vi.fn(
        async (_messages: ChatMessage[], options: {
            courseId?: string;
            onMessage: (token: string) => void;
            onFinish: () => void;
        }) => {
            options.onMessage('ok');
            options.onFinish();
        }
    ),
}));

vi.mock('@/lib/ai-stream', () => ({
    aiStreamClient: {
        streamChat: streamChatMock,
    },
}));

import { useChatStore } from '../useChatStore';

describe('useChatStore', () => {
    beforeEach(() => {
        localStorage.clear();
        streamChatMock.mockClear();
        useChatStore.setState({
            status: 'idle',
            currentConversationId: null,
            error: null,
            conversations: [],
            mode: 'tutor',
            rag: false,
        });
    });

    it('creates a new conversation safely when sending first message', async () => {
        await expect(useChatStore.getState().sendMessage('hello', '42')).resolves.toBeUndefined();

        const state = useChatStore.getState();
        expect(state.error).toBeNull();
        expect(state.currentConversationId).not.toBeNull();
        expect(state.conversations.length).toBe(1);
        expect(state.conversations[0]?.messages[0]?.content).toBe('hello');
        expect(state.conversations[0]?.messages[1]?.content).toBe('ok');
        expect(state.status).toBe('idle');
        expect(streamChatMock).toHaveBeenCalledTimes(1);
        expect(streamChatMock.mock.calls[0]?.[1]?.courseId).toBe('42');
    });
});
