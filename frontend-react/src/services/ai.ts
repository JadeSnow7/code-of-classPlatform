import { getAuthHeaders } from './api/getAuthHeaders';

const MOCK_MODE = import.meta.env.VITE_MOCK_API === 'true';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

/**
 * Single chat message exchanged with the AI service.
 */
export interface ChatMessage {
    /** Author role of the message. */
    role: 'user' | 'assistant';
    /** Text content of the message. */
    content: string;
}

/**
 * Payload accepted by the AI chat endpoint.
 */
export interface ChatPayload {
    /** Conversation history in order. */
    messages: ChatMessage[];
    /** Optional AI behavior mode. */
    mode?: 'tutor' | 'grader' | 'sim_explain';
    /** Whether to enable retrieval-augmented generation. */
    rag?: boolean;
}

/**
 * Mock stream generator for development
 */
async function* mockStreamGenerator(): AsyncGenerator<string> {
    const mockResponse = '这是一个模拟的 AI 回复。高斯定律描述了电场与电荷之间的关系，是电磁学的基本定律之一。';
    for (const char of mockResponse) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        yield char;
    }
}

/**
 * Stream chat with AI service.
 *
 * Note: Backend doesn't support true streaming, so we fetch the full response
 * and simulate streaming by outputting character by character.
 *
 * @param payload Chat payload including messages and mode.
 * @param options Streaming callbacks and abort signal.
 * @returns Resolves when the stream completes or aborts.
 */
export async function streamChat(
    payload: ChatPayload,
    options: {
        signal: AbortSignal;
        onToken: (token: string) => void;
        onFinish?: () => void;
        onError?: (error: Error) => void;
    }
): Promise<void> {
    // Mock mode
    if (MOCK_MODE) {
        try {
            for await (const token of mockStreamGenerator()) {
                if (options.signal.aborted) break;
                options.onToken(token);
            }
            options.onFinish?.();
        } catch (error) {
            options.onError?.(error as Error);
        }
        return;
    }

    // Real API call (non-streaming, then simulate stream)
    try {
        const response = await fetch(`${API_BASE_URL}/ai/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders(),
            },
            body: JSON.stringify({
                mode: payload.mode || 'tutor',
                messages: payload.messages,
            }),
            signal: options.signal,
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const raw = await response.json();
        let responseData = raw;
        if (raw && typeof raw === 'object' && 'success' in raw) {
            if (!raw.success) {
                throw new Error(raw.error?.message ?? 'AI request failed');
            }
            responseData = raw.data;
        }

        const reply = (responseData?.reply ?? responseData?.response ?? '') as string;
        for (let i = 0; i < reply.length; i++) {
            if (options.signal.aborted) break;
            options.onToken(reply[i]);
            // Small delay to simulate streaming effect
            await new Promise((resolve) => setTimeout(resolve, 15));
        }

        options.onFinish?.();
    } catch (error) {
        if ((error as Error).name === 'AbortError') {
            return;
        }
        options.onError?.(error as Error);
    }
}
