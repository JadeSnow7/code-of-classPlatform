/**
 * IPC Handlers 注册
 * 在 Electron 主进程中注册所有 IPC 处理器
 */

import { ipcMain, type BrowserWindow } from 'electron';
import { IPC_CHANNELS } from './channels';
import * as localLlm from '../services/localLlm';
import type { LocalLlmConfig, ChatMessage } from '@classplatform/shared';

/**
 * 注册所有 IPC handlers
 */
export function registerIpcHandlers(mainWindow: BrowserWindow): void {
    console.log('[IPC] Registering handlers...');

    // =========== 本地推理 ===========

    // 初始化模型
    ipcMain.handle(IPC_CHANNELS.LLM_INIT, async (_event, config: LocalLlmConfig) => {
        await localLlm.initialize(config);
    });

    // 获取状态
    ipcMain.handle(IPC_CHANNELS.LLM_STATUS, () => {
        return localLlm.getStatus();
    });

    // 卸载模型
    ipcMain.handle(IPC_CHANNELS.LLM_UNLOAD, async () => {
        await localLlm.unload();
    });

    // 中止请求
    ipcMain.on(IPC_CHANNELS.LLM_ABORT, (_event, requestId: string) => {
        localLlm.abort(requestId);
    });

    // 流式推理
    ipcMain.handle(
        IPC_CHANNELS.LLM_CHAT,
        async (_event, requestId: string, messages: ChatMessage[]) => {
            try {
                const result = await localLlm.chat(
                    requestId,
                    messages,
                    (chunk: string) => {
                        // 发送流式响应到渲染进程
                        mainWindow.webContents.send(IPC_CHANNELS.LLM_CHAT_STREAM, {
                            requestId,
                            type: 'chunk',
                            data: chunk,
                        });
                    }
                );

                // 发送完成信号
                mainWindow.webContents.send(IPC_CHANNELS.LLM_CHAT_STREAM, {
                    requestId,
                    type: 'done',
                    stats: result,
                });

                return result;
            } catch (error) {
                // 发送错误信号
                mainWindow.webContents.send(IPC_CHANNELS.LLM_CHAT_STREAM, {
                    requestId,
                    type: 'error',
                    error: error instanceof Error ? error.message : String(error),
                });
                throw error;
            }
        }
    );

    // =========== 模型管理 ===========

    ipcMain.handle(IPC_CHANNELS.MODEL_LIST, async () => {
        // TODO: 实现模型列表
        return [];
    });

    ipcMain.handle(IPC_CHANNELS.MODEL_DOWNLOAD, async (_event, _modelId: string) => {
        void _event;
        void _modelId;
        // TODO: 实现模型下载
        void _event;
        void _modelId;
        throw new Error('Not implemented');
    });

    ipcMain.handle(IPC_CHANNELS.MODEL_DELETE, async (_event, _modelId: string) => {
        void _event;
        void _modelId;
        // TODO: 实现模型删除
        void _event;
        void _modelId;
        throw new Error('Not implemented');
    });

    console.log('[IPC] Handlers registered');
}

/**
 * 清理 IPC handlers
 */
export function removeIpcHandlers(): void {
    const channels = Object.values(IPC_CHANNELS);
    for (const channel of channels) {
        ipcMain.removeHandler(channel);
        ipcMain.removeAllListeners(channel);
    }
    console.log('[IPC] Handlers removed');
}
