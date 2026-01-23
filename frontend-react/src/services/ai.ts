import { getAuthHeaders } from './api/getAuthHeaders';

const MOCK_MODE = import.meta.env.VITE_MOCK_API === 'true';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

export interface ChatPayload {
    messages: ChatMessage[];
    mode?: 'tutor' | 'grader' | 'sim_explain';
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
 * Stream chat with AI service
 * Note: Backend doesn't support true streaming, so we fetch the full response
 * and simulate streaming by outputting character by character
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

        const data = await response.json() as { reply: string; model: string | null };

        // Simulate streaming by outputting character by character
        const reply = data.reply || '';
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
