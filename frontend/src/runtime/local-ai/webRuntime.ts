import type { LocalAiRuntime, LocalAiStatus } from './types';

// eslint-disable-next-line require-yield
async function* unavailableStream(): AsyncGenerator<string> {
    throw new Error('Local AI runtime is not available in web mode.');
}

export const webLocalAiRuntime: LocalAiRuntime = {
    kind: 'web',
    async getStatus(): Promise<LocalAiStatus> {
        return 'not_ready';
    },
    streamChat: unavailableStream,
    abort: () => undefined,
};
