/**
 * useLocalInference Hook
 * React Hook 封装本地推理调用
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type {
    LocalLlmStatus,
    LocalLlmConfig,
    ChatMessage,
    LlmChatResult,
} from '@classplatform/shared';
import type { LlmStreamEvent } from '../types/electron';

// 检测是否在 Electron 环境
const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.isElectron;

interface UseLocalInferenceReturn {
    /** 初始化本地模型 */
    initialize: (config: LocalLlmConfig) => Promise<void>;
    /** 发送消息并流式接收响应 */
    chat: (messages: ChatMessage[], onChunk: (chunk: string) => void) => Promise<LlmChatResult>;
    /** 中止当前推理 */
    abort: () => void;
    /** 卸载模型 */
    unload: () => Promise<void>;
    /** 当前状态 */
    status: LocalLlmStatus;
    /** 是否正在加载模型 */
    isLoading: boolean;
    /** 是否正在推理 */
    isInferring: boolean;
    /** 错误信息 */
    error: string | null;
    /** 是否在 Electron 环境 */
    isElectron: boolean;
}

const defaultStatus: LocalLlmStatus = {
    initialized: false,
    modelName: null,
    backend: 'cpu',
    memoryUsageMB: 0,
    contextSize: 0,
};

export function useLocalInference(): UseLocalInferenceReturn {
    const [status, setStatus] = useState<LocalLlmStatus>(defaultStatus);
    const [isLoading, setIsLoading] = useState(false);
    const [isInferring, setIsInferring] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const currentRequestId = useRef<string | null>(null);

    // 刷新状态
    const refreshStatus = useCallback(async () => {
        if (!isElectron) return;
        try {
            const newStatus = await window.electronAPI!.localLlm.getStatus();
            setStatus(newStatus);
        } catch (err) {
            console.error('[useLocalInference] Failed to get status:', err);
        }
    }, []);

    // 初始化时获取状态
    useEffect(() => {
        refreshStatus();
    }, [refreshStatus]);

    // 初始化模型
    const initialize = useCallback(async (config: LocalLlmConfig) => {
        if (!isElectron) {
            throw new Error('Local inference only available in Electron');
        }

        setIsLoading(true);
        setError(null);

        try {
            await window.electronAPI!.localLlm.init(config);
            await refreshStatus();
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setError(message);
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [refreshStatus]);

    // 发送消息
    const chat = useCallback(async (
        messages: ChatMessage[],
        onChunk: (chunk: string) => void
    ): Promise<LlmChatResult> => {
        if (!isElectron) {
            throw new Error('Local inference only available in Electron');
        }

        if (!status.initialized) {
            throw new Error('Local model not initialized');
        }

        const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        currentRequestId.current = requestId;

        setIsInferring(true);
        setError(null);

        try {
            const result = await window.electronAPI!.localLlm.chat(
                requestId,
                messages,
                (event: LlmStreamEvent) => {
                    if (event.type === 'chunk' && event.data) {
                        onChunk(event.data);
                    } else if (event.type === 'error' && event.error) {
                        setError(event.error);
                    }
                }
            );
            return result;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setError(message);
            throw err;
        } finally {
            setIsInferring(false);
            currentRequestId.current = null;
        }
    }, [status.initialized]);

    // 中止推理
    const abort = useCallback(() => {
        if (!isElectron || !currentRequestId.current) return;
        window.electronAPI!.localLlm.abort(currentRequestId.current);
        currentRequestId.current = null;
        setIsInferring(false);
    }, []);

    // 卸载模型
    const unload = useCallback(async () => {
        if (!isElectron) return;

        abort();
        await window.electronAPI!.localLlm.unload();
        await refreshStatus();
    }, [abort, refreshStatus]);

    return {
        initialize,
        chat,
        abort,
        unload,
        status,
        isLoading,
        isInferring,
        error,
        isElectron,
    };
}
