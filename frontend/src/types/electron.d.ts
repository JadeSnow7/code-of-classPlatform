/**
 * 全局类型声明
 * 扩展 Window 接口以包含 Electron API
 */

import type {
    LocalLlmConfig,
    LocalLlmStatus,
    LlmChatResult,
    ChatMessage,
    ModelInfo,
} from '@classplatform/shared';

/** 流式响应事件 */
export interface LlmStreamEvent {
    requestId: string;
    type: 'chunk' | 'done' | 'error';
    data?: string;
    stats?: LlmChatResult;
    error?: string;
}

/** Electron API 接口 */
export interface ElectronAPI {
    localLlm: {
        init: (config: LocalLlmConfig) => Promise<void>;
        chat: (
            requestId: string,
            messages: ChatMessage[],
            onChunk: (event: LlmStreamEvent) => void
        ) => Promise<LlmChatResult>;
        abort: (requestId: string) => void;
        getStatus: () => Promise<LocalLlmStatus>;
        unload: () => Promise<void>;
    };
    model: {
        list: () => Promise<ModelInfo[]>;
        download: (modelId: string, onProgress: (progress: number) => void) => Promise<void>;
        delete: (modelId: string) => Promise<void>;
    };
    isElectron: boolean;
}

declare global {
    interface Window {
        electronAPI?: ElectronAPI;
    }
}

export { };
