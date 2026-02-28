import type { ChatMessage } from '@classplatform/shared';
import type { LocalAiRuntime, LocalAiStatus } from './types';
import { webLocalAiRuntime } from './webRuntime';

type DesktopAPI = NonNullable<Window['electronAPI']>;

function createDesktopRuntime(electronAPI: DesktopAPI): LocalAiRuntime {
    let activeRequestId: string | null = null;

    return {
        kind: 'desktop',
        async getStatus(): Promise<LocalAiStatus> {
            const status = await electronAPI.localLlm.getStatus();
            if (status.initialized) return 'ready';
            return 'not_ready';
        },
        abort() {
            if (!activeRequestId) return;
            electronAPI.localLlm.abort(activeRequestId);
            activeRequestId = null;
        },
        async *streamChat(messages: ChatMessage[]) {
            const requestId = `local-ai-${Date.now()}`;
            activeRequestId = requestId;
            let done = false;
            let caught: Error | null = null;
            const queue: string[] = [];

            const waitForChunk = () =>
                new Promise<void>((resolve) => {
                    const timer = setInterval(() => {
                        if (queue.length > 0 || done) {
                            clearInterval(timer);
                            resolve();
                        }
                    }, 10);
                });

            electronAPI.localLlm.chat(requestId, messages, (event) => {
                if (event.type === 'chunk' && event.data) queue.push(event.data);
                if (event.type === 'error') {
                    caught = new Error(event.error ?? 'Local AI stream failed');
                    done = true;
                }
                if (event.type === 'done') done = true;
            }).catch((err) => {
                caught = err instanceof Error ? err : new Error(String(err));
                done = true;
            });

            try {
                while (!done || queue.length > 0) {
                    await waitForChunk();
                    while (queue.length > 0) {
                        yield queue.shift() as string;
                    }
                }
            } finally {
                if (activeRequestId === requestId) {
                    activeRequestId = null;
                }
            }

            if (caught) throw caught;
        },
    };
}

export function getLocalAiRuntime(): LocalAiRuntime {
    if (window.electronAPI?.isElectron) {
        return createDesktopRuntime(window.electronAPI);
    }
    return webLocalAiRuntime;
}

export type { LocalAiRuntime, LocalAiStatus } from './types';
