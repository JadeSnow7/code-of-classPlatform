/**
 * Electron Preload Script
 * 安全地暴露 IPC API 到渲染进程
 */

import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from './ipc/channels';
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

/** 暴露给渲染进程的 API */
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

// 注册流式响应监听器
const streamListeners = new Map<string, (event: LlmStreamEvent) => void>();

ipcRenderer.on(IPC_CHANNELS.LLM_CHAT_STREAM, (_event, data: LlmStreamEvent) => {
    const listener = streamListeners.get(data.requestId);
    if (listener) {
        listener(data);
        if (data.type === 'done' || data.type === 'error') {
            streamListeners.delete(data.requestId);
        }
    }
});

// 暴露 API 到 window 对象
const electronAPI: ElectronAPI = {
    localLlm: {
        init: (config: LocalLlmConfig) =>
            ipcRenderer.invoke(IPC_CHANNELS.LLM_INIT, config),

        chat: async (
            requestId: string,
            messages: ChatMessage[],
            onChunk: (event: LlmStreamEvent) => void
        ): Promise<LlmChatResult> => {
            // 注册流式监听器
            streamListeners.set(requestId, onChunk);

            try {
                return await ipcRenderer.invoke(IPC_CHANNELS.LLM_CHAT, requestId, messages);
            } catch (error) {
                streamListeners.delete(requestId);
                throw error;
            }
        },

        abort: (requestId: string) =>
            ipcRenderer.send(IPC_CHANNELS.LLM_ABORT, requestId),

        getStatus: () =>
            ipcRenderer.invoke(IPC_CHANNELS.LLM_STATUS),

        unload: () =>
            ipcRenderer.invoke(IPC_CHANNELS.LLM_UNLOAD),
    },

    model: {
        list: () =>
            ipcRenderer.invoke(IPC_CHANNELS.MODEL_LIST),

        download: async (modelId: string, onProgress: (progress: number) => void) => {
            const progressHandler = (_event: Electron.IpcRendererEvent, data: { modelId: string; progress: number }) => {
                if (data.modelId === modelId) {
                    onProgress(data.progress);
                }
            };

            ipcRenderer.on(IPC_CHANNELS.MODEL_DOWNLOAD_PROGRESS, progressHandler);

            try {
                await ipcRenderer.invoke(IPC_CHANNELS.MODEL_DOWNLOAD, modelId);
            } finally {
                ipcRenderer.removeListener(IPC_CHANNELS.MODEL_DOWNLOAD_PROGRESS, progressHandler);
            }
        },

        delete: (modelId: string) =>
            ipcRenderer.invoke(IPC_CHANNELS.MODEL_DELETE, modelId),
    },

    isElectron: true,
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// 类型声明
declare global {
    interface Window {
        electronAPI?: ElectronAPI;
    }
}

console.log('[Preload] ElectronAPI exposed to window');
