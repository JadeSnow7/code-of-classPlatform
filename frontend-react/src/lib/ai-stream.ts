import { authStore } from './auth-store';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

interface StreamOptions {
    mode?: string;
    onStart?: (model: string) => void;
    onMessage: (content: string) => void;
    onError: (error: Error) => void;
    onFinish: () => void;
    signal?: AbortSignal;
}

interface SSEEvent {
    type?: 'start' | 'done';
    content?: string;
    model?: string;
    error?: string;
}

export const aiStreamClient = {
    async streamChat(messages: any[], options: StreamOptions) {
        const token = authStore.getToken();

        try {
            const response = await fetch(`${API_BASE_URL}/ai/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'text/event-stream',
                    'Authorization': token ? `Bearer ${token}` : '',
                },
                body: JSON.stringify({
                    messages,
                    mode: options.mode,
                    stream: true,
                }),
                signal: options.signal,
            });

            if (!response.ok) {
                if (response.status === 401) {
                    authStore.clearToken();
                    window.location.href = '/login';
                    throw new Error('Unauthorized');
                }
                if (response.status === 403) {
                    throw new Error('Permission denied (403)');
                }
                const errorText = await response.text();
                throw new Error(`AI Service Error ${response.status}: ${errorText}`);
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();

            if (!reader) throw new Error('No response body');

            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                // Parse SSE events (format: "data: {...}\n\n")
                const events = buffer.split('\n\n');
                buffer = events.pop() || ''; // Keep incomplete event in buffer

                for (const eventStr of events) {
                    const lines = eventStr.split('\n');
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const dataStr = line.slice(6);
                            try {
                                const event: SSEEvent = JSON.parse(dataStr);

                                if (event.error) {
                                    options.onError(new Error(event.error));
                                    return;
                                }

                                if (event.type === 'start') {
                                    options.onStart?.(event.model || '');
                                } else if (event.type === 'done') {
                                    options.onFinish();
                                    return;
                                } else if (event.content) {
                                    options.onMessage(event.content);
                                }
                            } catch (e) {
                                // Not valid JSON, might be raw text
                                console.warn('Failed to parse SSE event:', dataStr);
                            }
                        }
                    }
                }
            }

            // Stream ended without explicit done event
            options.onFinish();
        } catch (error) {
            if (options.signal?.aborted) return;
            options.onError(error instanceof Error ? error : new Error('Unknown error'));
        }
    }
};

