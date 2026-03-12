import { useCallback, useEffect, useMemo, useState } from 'react';
import { EduEdgeAI as LocalAI, type BackendName } from '@jadesnow7/edge-ai-sdk';

type SdkState = 'idle' | 'loading' | 'ready' | 'error';

const DEBUG_MODEL_PATH = import.meta.env.VITE_LOCAL_AI_DEBUG_MODEL_PATH || 'debug-model-path';

function errorToMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    try {
        return JSON.stringify(error);
    } catch {
        return 'Unknown error';
    }
}

export function LocalAIDebugPage() {
    const [sdkState, setSdkState] = useState<SdkState>('idle');
    const [backend, setBackend] = useState<BackendName | null>(null);
    const [prompt, setPrompt] = useState('');
    const [responseText, setResponseText] = useState('');
    const [errorText, setErrorText] = useState<string | null>(null);
    const [isStreaming, setIsStreaming] = useState(false);

    const initSdk = useCallback(async () => {
        setSdkState('loading');
        setErrorText(null);
        try {
            const result = await LocalAI.init(DEBUG_MODEL_PATH);
            setBackend(result.backend);
            setSdkState('ready');
        } catch (error) {
            setBackend(null);
            setSdkState('error');
            setErrorText(errorToMessage(error));
        }
    }, []);

    useEffect(() => {
        void initSdk();
    }, [initSdk]);

    const handleSend = useCallback(async () => {
        if (sdkState !== 'ready' || isStreaming) {
            return;
        }

        const trimmedPrompt = prompt.trim();
        if (!trimmedPrompt) {
            return;
        }

        setErrorText(null);
        setIsStreaming(true);
        setResponseText('');

        try {
            await LocalAI.streamChat(trimmedPrompt, (token) => {
                setResponseText((prev) => prev + token);
            });
        } catch (error) {
            setErrorText(errorToMessage(error));
        } finally {
            setIsStreaming(false);
        }
    }, [isStreaming, prompt, sdkState]);

    const stateMeta = useMemo(() => {
        if (sdkState === 'loading') {
            return {
                label: '加载中',
                dotClass: 'bg-yellow-400',
            };
        }
        if (sdkState === 'ready') {
            return {
                label: '就绪',
                dotClass: 'bg-emerald-500',
            };
        }
        if (sdkState === 'error') {
            return {
                label: '错误',
                dotClass: 'bg-red-500',
            };
        }
        return {
            label: '未初始化',
            dotClass: 'bg-red-500',
        };
    }, [sdkState]);

    return (
        <main className="min-h-full bg-slate-100 p-6">
            <div className="mx-auto w-full max-w-4xl space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <header className="space-y-1">
                    <h1 className="text-xl font-semibold text-slate-900">Local AI Debug (MVP)</h1>
                    <p className="text-sm text-slate-600">用于验证 Tauri + 本地大模型 SDK 的初始化与流式对话链路。</p>
                    <p className="text-xs text-slate-500">调试模型路径: <code>{DEBUG_MODEL_PATH}</code></p>
                </header>

                <section className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700">
                        <span
                            className={`h-2.5 w-2.5 rounded-full ${stateMeta.dotClass} ${sdkState === 'loading' ? 'animate-pulse' : ''}`}
                        />
                        SDK 状态: {stateMeta.label}
                    </div>
                    <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700">
                        Backend: {backend ?? '-'}
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            void initSdk();
                        }}
                        className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={sdkState === 'loading'}
                    >
                        {sdkState === 'loading' ? '初始化中...' : '初始化 / 重试'}
                    </button>
                </section>

                <section className="space-y-3">
                    <label htmlFor="local-ai-prompt" className="block text-sm font-medium text-slate-700">
                        Prompt
                    </label>
                    <div className="flex flex-col gap-3 sm:flex-row">
                        <input
                            id="local-ai-prompt"
                            value={prompt}
                            onChange={(event) => setPrompt(event.target.value)}
                            placeholder="输入测试问题，例如：请用三句话介绍二分查找。"
                            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-indigo-500 transition focus:ring-2"
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    event.preventDefault();
                                    void handleSend();
                                }
                            }}
                        />
                        <button
                            type="button"
                            onClick={() => {
                                void handleSend();
                            }}
                            disabled={sdkState !== 'ready' || isStreaming || prompt.trim().length === 0}
                            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isStreaming ? '生成中...' : '发送'}
                        </button>
                    </div>
                </section>

                <section className="space-y-2">
                    <h2 className="text-sm font-medium text-slate-700">Streaming Response</h2>
                    <div className="min-h-48 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-800 whitespace-pre-wrap">
                        {responseText || (isStreaming ? '等待首个 token...' : '响应内容会在这里按 token 流式追加。')}
                    </div>
                </section>

                {errorText && (
                    <section className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        <p className="font-medium">错误信息</p>
                        <p className="mt-1 whitespace-pre-wrap break-words">{errorText}</p>
                    </section>
                )}
            </div>
        </main>
    );
}
