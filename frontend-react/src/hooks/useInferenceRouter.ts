/**
 * useInferenceRouter Hook
 * 智能路由：根据请求复杂度决定使用本地或云端推理
 */

import { useCallback, useState } from 'react';
import type {
    InferenceRequest,
    InferenceChunk,
    InferenceSource,
    ChatMessage,
} from '@classplatform/shared';
import { useLocalInference } from './useLocalInference';
import { estimateComplexity } from '../utils/complexityEstimator';

interface UseInferenceRouterReturn {
    /** 发送消息，自动路由到最佳推理源 */
    chat: (
        request: InferenceRequest,
        onChunk: (chunk: InferenceChunk) => void
    ) => Promise<void>;
    /** 中止当前推理 */
    abort: () => void;
    /** 当前推理源 */
    currentSource: InferenceSource | null;
    /** 是否正在推理 */
    isInferring: boolean;
    /** 本地推理是否可用 */
    localAvailable: boolean;
    /** 网络是否在线 */
    networkAvailable: boolean;
}

// 云端 API 基础 URL
const CLOUD_API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

export function useInferenceRouter(): UseInferenceRouterReturn {
    const localInference = useLocalInference();
    const [currentSource, setCurrentSource] = useState<InferenceSource | null>(null);
    const [isInferring, setIsInferring] = useState(false);
    const [abortController, setAbortController] = useState<AbortController | null>(null);

    const localAvailable = localInference.isElectron && localInference.status.initialized;
    const networkAvailable = typeof navigator !== 'undefined' ? navigator.onLine : true;

    /**
     * 云端推理
     */
    const cloudChat = useCallback(async (
        messages: ChatMessage[],
        onChunk: (chunk: string) => void,
        signal: AbortSignal
    ): Promise<void> => {
        const response = await fetch(`${CLOUD_API_URL}/api/v1/ai/chat/stream`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
            },
            body: JSON.stringify({ messages, stream: true }),
            signal,
        });

        if (!response.ok) {
            throw new Error(`Cloud API error: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error('No response body');
        }

        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const text = decoder.decode(value, { stream: true });
            // 解析 SSE 格式
            const lines = text.split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') break;
                    try {
                        const json = JSON.parse(data);
                        const content = json.choices?.[0]?.delta?.content;
                        if (content) {
                            onChunk(content);
                        }
                    } catch {
                        // 忽略解析错误
                    }
                }
            }
        }
    }, []);

    /**
     * 智能路由推理
     */
    const chat = useCallback(async (
        request: InferenceRequest,
        onChunk: (chunk: InferenceChunk) => void
    ): Promise<void> => {
        setIsInferring(true);
        const controller = new AbortController();
        setAbortController(controller);

        try {
            // 1. 决定推理源
            let source: InferenceSource;

            if (request.forceSource) {
                source = request.forceSource;
            } else {
                const complexity = estimateComplexity(request);

                if (!networkAvailable && localAvailable) {
                    source = 'local';
                } else if (!localAvailable) {
                    source = 'cloud';
                } else {
                    source = complexity.suggestedSource === 'hybrid' ? 'cloud' : complexity.suggestedSource;
                }
            }

            setCurrentSource(source);

            // 2. 发送 metadata
            onChunk({
                type: 'metadata',
                metadata: { source },
            });

            // 3. 执行推理
            const startTime = Date.now();
            let tokensGenerated = 0;

            if (source === 'local') {
                const result = await localInference.chat(
                    request.messages,
                    (chunk) => {
                        tokensGenerated++;
                        onChunk({ type: 'content', content: chunk });
                    }
                );
                tokensGenerated = result.tokensGenerated;
            } else {
                await cloudChat(
                    request.messages,
                    (chunk) => {
                        tokensGenerated++;
                        onChunk({ type: 'content', content: chunk });
                    },
                    controller.signal
                );
            }

            // 4. 完成
            onChunk({
                type: 'done',
                metadata: {
                    source,
                    latencyMs: Date.now() - startTime,
                    tokensGenerated,
                },
            });

        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                // 用户中止，不报错
                return;
            }

            onChunk({
                type: 'error',
                error: error instanceof Error ? error.message : String(error),
            });
        } finally {
            setIsInferring(false);
            setAbortController(null);
        }
    }, [localAvailable, networkAvailable, localInference, cloudChat]);

    /**
     * 中止推理
     */
    const abort = useCallback(() => {
        if (currentSource === 'local') {
            localInference.abort();
        }
        abortController?.abort();
        setIsInferring(false);
        setCurrentSource(null);
    }, [currentSource, localInference, abortController]);

    return {
        chat,
        abort,
        currentSource,
        isInferring,
        localAvailable,
        networkAvailable,
    };
}
