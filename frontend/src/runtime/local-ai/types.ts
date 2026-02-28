import type { ChatMessage } from '@classplatform/shared';

export type LocalAiStatus = 'not_ready' | 'loading' | 'ready' | 'error';

export type LocalAiRuntime = {
    kind: 'web' | 'desktop';
    getStatus: () => Promise<LocalAiStatus>;
    streamChat: (messages: ChatMessage[]) => AsyncGenerator<string>;
    abort: () => void;
};
