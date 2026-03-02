import { api } from '@/lib/api-client';
import type { ChatMessage } from '@/api/ai';
import type { OrchestratedChatRequest, ThoughtEvent } from '@classplatform/shared';

interface StreamOptions {
    mode?: string;
    courseId?: number | string;
    onStart?: (model: string) => void;
    onMessage: (content: string) => void;
    onError: (error: Error) => void;
    onFinish: () => void;
    signal?: AbortSignal;
}

interface OrchestratedStreamOptions {
    onStart?: (requestId: string) => void;
    onThought: (thought: ThoughtEvent) => void;
    onMessage: (content: string) => void;
    onError: (error: Error) => void;
    onFinish: (model?: string | null) => void;
    signal?: AbortSignal;
}

export const aiStreamClient = {
    async streamChat(messages: ChatMessage[], options: StreamOptions) {
        try {
            options.onStart?.('');

            for await (const token of api.ai.streamChat(
                {
                    mode: options.mode,
                    messages,
                    stream: true,
                    course_id: options.courseId,
                },
                options.signal
            )) {
                options.onMessage(token);
            }

            options.onFinish();
        } catch (error) {
            if (options.signal?.aborted) return;
            options.onError(error instanceof Error ? error : new Error('Unknown error'));
        }
    },

    async streamOrchestratedChat(request: OrchestratedChatRequest, options: OrchestratedStreamOptions) {
        try {
            for await (const event of api.ai.streamOrchestratedChat(request, options.signal)) {
                switch (event.type) {
                    case 'start':
                        options.onStart?.(event.request_id);
                        break;
                    case 'thought':
                        options.onThought(event);
                        break;
                    case 'message':
                        options.onMessage(event.content);
                        break;
                    case 'done':
                        options.onFinish(event.model);
                        break;
                    case 'error':
                        options.onError(new Error(event.error));
                        break;
                }
            }
        } catch (error) {
            if (options.signal?.aborted) return;
            options.onError(error instanceof Error ? error : new Error('Unknown error'));
        }
    }
};
