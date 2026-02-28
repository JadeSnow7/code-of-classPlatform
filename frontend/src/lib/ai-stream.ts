import { api } from '@/lib/api-client';
import type { ChatMessage } from '@/api/ai';

interface StreamOptions {
    mode?: string;
    onStart?: (model: string) => void;
    onMessage: (content: string) => void;
    onError: (error: Error) => void;
    onFinish: () => void;
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
    }
};
