import { useEffect, useRef, useState } from 'react';
import { Button, Input, Progress, Tag, Typography, Tooltip } from 'antd';
import { SendOutlined, PaperClipOutlined, CloudOutlined, DesktopOutlined } from '@ant-design/icons';
import clsx from 'clsx';
import { Sparkles, Wifi, WifiOff } from 'lucide-react';
import { EduEdgeAI as LocalAI } from '@jadesnow7/edge-ai-sdk';
import { useCloudAiHealth } from '@/hooks/useCloudAiHealth';
import { useMobile } from '@/hooks/useMobile';
import { aiStreamClient } from '@/lib/ai-stream';
import type { ChatMessage } from '@/api/ai';

const { Text } = Typography;
type AiSource = 'local' | 'cloud';

function errorToMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    return '未知错误';
}

export function LocalAIHubPage() {
    const isMobile = useMobile();
    const isDesktopRuntime = typeof window !== 'undefined' && Boolean(window.electronAPI?.isElectron);
    const cloudHealth = useCloudAiHealth();
    const [source, setSource] = useState<AiSource>(isDesktopRuntime ? 'local' : 'cloud');
    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            role: 'assistant',
            content: isDesktopRuntime
                ? '你好！这是 Local AI 入口。离线时优先使用本地模式，联网后可切到云端增强。'
                : '你好！这是 AI 会话入口。当前为 Web 环境，默认使用云端 AI 服务。',
        },
    ]);
    const [isLocalAiReady, setIsLocalAiReady] = useState(false);
    const [backendInfo, setBackendInfo] = useState<string | null>(null);
    const [isLocalAiInitializing, setIsLocalAiInitializing] = useState(isDesktopRuntime);
    const [localAiInitError, setLocalAiInitError] = useState<string | null>(null);
    const [streaming, setStreaming] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [networkOnline, setNetworkOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
    const [bannerMode, setBannerMode] = useState<'loading' | 'offline' | 'recovered' | null>(isDesktopRuntime ? 'loading' : null);
    const downloadProgress = 60;
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onOnline = () => {
            setNetworkOnline(true);
            setBannerMode('recovered');
            window.setTimeout(() => setBannerMode(null), 2000);
        };
        const onOffline = () => {
            setNetworkOnline(false);
            if (isDesktopRuntime) {
                setSource('local');
            }
            setBannerMode('offline');
        };
        window.addEventListener('online', onOnline);
        window.addEventListener('offline', onOffline);
        return () => {
            window.removeEventListener('online', onOnline);
            window.removeEventListener('offline', onOffline);
        };
    }, [isDesktopRuntime]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, streaming]);

    useEffect(() => {
        const timer = window.setTimeout(() => setBannerMode(networkOnline ? null : 'offline'), isDesktopRuntime ? 1200 : 0);
        return () => window.clearTimeout(timer);
    }, [isDesktopRuntime, networkOnline]);

    useEffect(() => {
        let cancelled = false;

        const initLocalAi = async () => {
            if (!isDesktopRuntime) {
                setIsLocalAiReady(false);
                setBackendInfo(null);
                setLocalAiInitError(null);
                setIsLocalAiInitializing(false);
                return;
            }

            setIsLocalAiInitializing(true);
            setLocalAiInitError(null);
            try {
                const { status, backend } = await LocalAI.init('default-model');
                if (cancelled) return;
                if (status === 'success') {
                    setIsLocalAiReady(true);
                    setBackendInfo(backend);
                    return;
                }
                setIsLocalAiReady(false);
                setBackendInfo(null);
            } catch (error) {
                if (cancelled) return;
                setIsLocalAiReady(false);
                setBackendInfo(null);
                setLocalAiInitError(errorToMessage(error));
            } finally {
                if (!cancelled) {
                    setIsLocalAiInitializing(false);
                }
            }
        };

        void initLocalAi();

        return () => {
            cancelled = true;
        };
    }, [isDesktopRuntime]);

    const sendWithCloud = async (history: ChatMessage[]) => {
        let content = '';
        try {
            await aiStreamClient.streamChat(history, {
                mode: 'tutor',
                onMessage: (token) => {
                    content += token;
                    setMessages((prev) => {
                        const updated = [...prev];
                        updated[updated.length - 1] = { role: 'assistant', content };
                        return updated;
                    });
                },
                onError: () => {
                    setMessages((prev) => {
                        const updated = [...prev];
                        updated[updated.length - 1] = {
                            role: 'assistant',
                            content: '云端 AI 服务当前不可用，请稍后重试。',
                        };
                        return updated;
                    });
                },
                onFinish: () => undefined,
            });
        } finally {
            setStreaming(false);
        }
    };

    const sendWithLocal = async (prompt: string) => {
        try {
            await LocalAI.streamChat(prompt, (token) => {
                setMessages((prev) => {
                    const updated = [...prev];
                    const lastIndex = updated.length - 1;
                    const lastMessage = updated[lastIndex];
                    if (!lastMessage || lastMessage.role !== 'assistant') {
                        updated.push({ role: 'assistant', content: token });
                        return updated;
                    }
                    updated[lastIndex] = {
                        ...lastMessage,
                        content: `${lastMessage.content}${token}`,
                    };
                    return updated;
                });
            });
        } catch (error) {
            setMessages((prev) => {
                const updated = [...prev];
                const lastIndex = updated.length - 1;
                const friendlyError = `本地推理出现错误：${errorToMessage(error)}。请稍后重试或切换云端模式。`;
                if (!updated[lastIndex] || updated[lastIndex].role !== 'assistant') {
                    updated.push({
                        role: 'assistant',
                        content: friendlyError,
                    });
                    return updated;
                }
                updated[lastIndex] = {
                    role: 'assistant',
                    content: friendlyError,
                };
                return updated;
            });
        }
    };

    const handleSend = async () => {
        if (!inputValue.trim() || streaming) return;
        const userText = inputValue.trim();
        setInputValue('');
        const userMessage: ChatMessage = { role: 'user', content: userText };
        const history = [...messages, userMessage];

        setMessages((prev) => [...prev, userMessage, { role: 'assistant', content: '' }]);
        setStreaming(true);

        try {
            if (source === 'cloud') {
                if (!networkOnline) {
                    setMessages((prev) => {
                        const updated = [...prev];
                        updated[updated.length - 1] = {
                            role: 'assistant',
                            content: '当前网络不可用，云端 AI 服务暂时无法访问。',
                        };
                        return updated;
                    });
                    return;
                }
                await sendWithCloud(history);
                return;
            }

            if (!isLocalAiReady) {
                const fallbackText = isLocalAiInitializing
                    ? '本地推理引擎正在初始化，请稍候再试。'
                    : localAiInitError
                      ? `本地推理引擎初始化失败：${localAiInitError}。请检查桌面端插件或切换云端模式。`
                      : isDesktopRuntime
                        ? '本地推理引擎暂不可用，请稍后重试。'
                        : '当前为 Web 环境，请使用云端 AI 服务。';
                setMessages((prev) => {
                    const updated = [...prev];
                    updated[updated.length - 1] = {
                        role: 'assistant',
                        content: fallbackText,
                    };
                    return updated;
                });
                return;
            }
            await sendWithLocal(userText);
        } finally {
            setStreaming(false);
        }
    };

    const localEngineStatusText = isLocalAiReady
        ? `本地推理引擎已就绪（运行于：${backendInfo ?? 'Unknown'}）。离线可用，请提问。`
        : isLocalAiInitializing
          ? '本地推理引擎初始化中，请稍候...'
          : isDesktopRuntime
            ? '本地推理引擎初始化失败，请切换云端模式或在桌面端检查本地模型配置。'
            : '当前为 Web 环境，默认使用云端 AI 服务。';

    const assistantLabel = source === 'local' && isDesktopRuntime ? '本地 AI' : '云端 AI';

    const banner = (
        <div className="space-y-3">
            {isDesktopRuntime && bannerMode === 'loading' && (
                <div className="rounded-3xl border border-violet-200 bg-violet-50/85 px-5 py-4 dark:border-violet-500/20 dark:bg-violet-500/10">
                    <div className="flex items-center gap-4">
                        <Text className="font-medium text-violet-700 dark:text-violet-200">模型加载中 {downloadProgress}%</Text>
                        <div className="min-w-0 flex-1">
                            <Progress
                                percent={downloadProgress}
                                showInfo={false}
                                strokeColor="#7C3AED"
                                trailColor="rgba(124, 58, 237, 0.14)"
                            />
                        </div>
                    </div>
                </div>
            )}

            {bannerMode === 'offline' && (
                <div className="rounded-3xl border border-slate-200 bg-slate-50/85 px-5 py-4 dark:border-slate-800 dark:bg-slate-800/70">
                    <div className="flex items-center gap-3">
                        <WifiOff size={16} className="text-violet-600 dark:text-violet-300" />
                        <Text className="text-slate-700 dark:text-slate-200">
                            {isDesktopRuntime
                                ? '本地运行中，无网络连接。当前会话将继续优先使用设备端推理。'
                                : '当前网络不可用，云端 AI 服务暂时无法访问。'}
                        </Text>
                    </div>
                </div>
            )}

            {bannerMode === 'recovered' && (
                <div className="rounded-3xl border border-emerald-200 bg-emerald-50/90 px-5 py-4 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <Wifi size={16} className="text-emerald-600 dark:text-emerald-300" />
                            <Text className="text-emerald-800 dark:text-emerald-100">
                                {isDesktopRuntime ? '网络已恢复，可切换到云端增强模式。' : '网络已恢复，可继续使用云端 AI 服务。'}
                            </Text>
                        </div>
                        {isDesktopRuntime ? (
                            <div className="flex gap-2">
                                <Button size="small" onClick={() => setSource('local')}>
                                    保持本地
                                </Button>
                                <Button size="small" type="primary" onClick={() => setSource('cloud')}>
                                    切换云端
                                </Button>
                            </div>
                        ) : null}
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <div className="relative flex h-full min-h-full flex-col overflow-hidden bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100">
            <div className="border-b border-slate-200/80 bg-slate-50/70 px-6 py-4 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/70">
                <div className="mx-auto max-w-4xl space-y-3">
                    {banner}
                    <div className="rounded-3xl border border-slate-200 bg-white/78 p-4 shadow-[0_18px_48px_rgba(15,23,42,0.06)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/78">
                        <div className="flex flex-wrap items-start gap-3">
                            <div className="flex min-w-0 flex-1 items-start gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-50 text-violet-600 dark:bg-violet-500/12 dark:text-violet-200">
                                    <Sparkles size={18} />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Local AI 会话</p>
                                    <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                                        {!isDesktopRuntime && cloudHealth.status !== 'ready'
                                            ? `当前为 Web 环境，默认使用云端 AI 服务。${cloudHealth.title}。`
                                            : localEngineStatusText}
                                    </p>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                {isDesktopRuntime && isLocalAiReady && backendInfo ? (
                                    <Tag color="geekblue">Backend: {backendInfo}</Tag>
                                ) : null}
                                <Tag
                                    color={source === 'local' ? 'purple' : 'blue'}
                                    icon={source === 'local' ? <DesktopOutlined /> : <CloudOutlined />}
                                >
                                    {source === 'local' ? '本地模式' : '云端模式'}
                                </Tag>
                                {isDesktopRuntime ? (
                                    <Button
                                        size="small"
                                        onClick={() => setSource((prev) => (prev === 'local' ? 'cloud' : 'local'))}
                                        disabled={!networkOnline && source === 'local'}
                                    >
                                        切换
                                    </Button>
                                ) : null}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto">
                <div className={clsx('mx-auto flex w-full max-w-4xl flex-col gap-4 px-6 pt-8', isMobile ? 'pb-56' : 'pb-44')}>
                    {messages.map((msg, i) => {
                        const isUser = msg.role === 'user';

                        return (
                            <div key={i} className={clsx('flex', isUser ? 'justify-end' : 'justify-start')}>
                                <div
                                    className={clsx(
                                        'max-w-[min(100%,44rem)] rounded-[26px] border px-5 py-4 shadow-sm',
                                        isUser
                                            ? 'border-blue-600 bg-blue-600 text-white shadow-[0_20px_48px_rgba(37,99,235,0.18)]'
                                            : 'border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-100',
                                    )}
                                >
                                    {!isUser ? (
                                        <div className="mb-3 flex items-center gap-2 text-violet-600 dark:text-violet-200">
                                            <Sparkles size={15} />
                                            <span className="text-sm font-medium">{assistantLabel}</span>
                                        </div>
                                    ) : null}
                                    <p className="whitespace-pre-wrap text-sm leading-7">{msg.content}</p>
                                </div>
                            </div>
                        );
                    })}

                    {streaming ? (
                        <div className="flex justify-start">
                            <div className="rounded-[26px] border border-slate-200 bg-slate-50 px-5 py-4 shadow-sm dark:border-slate-700 dark:bg-slate-800/90">
                                <div className="flex gap-2">
                                    {[0, 1, 2].map((i) => (
                                        <div
                                            key={i}
                                            className="h-2.5 w-2.5 rounded-full bg-violet-500 animate-bounce"
                                            style={{ animationDelay: `${i * 150}ms` }}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : null}

                    <div ref={messagesEndRef} />
                </div>
            </div>

            <div
                className={clsx(
                    'z-20 px-6',
                    isMobile ? 'fixed inset-x-0 bottom-24 pb-2' : 'pointer-events-none absolute inset-x-0 bottom-0 pb-6',
                )}
            >
                <div className="mx-auto max-w-4xl">
                    <div className="pointer-events-auto rounded-[28px] border border-slate-200/80 bg-white/88 p-3 shadow-[0_24px_60px_rgba(15,23,42,0.14)] backdrop-blur-2xl dark:border-slate-700/70 dark:bg-slate-900/88">
                        <div className="flex items-end gap-3">
                            <Tooltip title="附加文件">
                                <Button
                                    type="text"
                                    icon={<PaperClipOutlined />}
                                    className="!flex !h-11 !w-11 !items-center !justify-center !rounded-2xl !text-slate-500 hover:!bg-slate-100 dark:!text-slate-400 dark:hover:!bg-slate-800"
                                />
                            </Tooltip>

                            <Input.TextArea
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        void handleSend();
                                    }
                                }}
                                placeholder="向 AI 提问...（Enter 发送，Shift+Enter 换行）"
                                autoSize={{ minRows: 1, maxRows: 5 }}
                                className="!rounded-2xl !border-0 !bg-transparent !px-2 !py-2 text-[15px] !shadow-none"
                                style={{ resize: 'none', color: 'inherit' }}
                            />

                            <Button
                                type="primary"
                                icon={<SendOutlined />}
                                onClick={() => void handleSend()}
                                disabled={!inputValue.trim() || streaming}
                                className="!flex !h-11 !min-w-11 !items-center !justify-center !rounded-2xl !shadow-[0_16px_36px_rgba(37,99,235,0.2)]"
                            />
                        </div>

                        <div className="flex items-center justify-between px-2 pt-2 text-xs text-slate-400 dark:text-slate-500">
                            <span>{source === 'local' ? '优先使用设备端推理' : '当前已启用云端 AI 服务'}</span>
                            <span>Enter 发送</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
