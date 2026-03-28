import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
    Send, Plus, Brain, MessageSquare, Book, FileText,
    Settings, Cloud, Cpu, Zap, ChevronRight, FlaskConical
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ChatBubble, type Message } from '@/components/edugraph/ChatBubble';
import { AIStatusDot } from '@/components/edugraph/StatusBadge';
import { ChatSkeleton, EmptyState } from '@/components/edugraph/SkeletonLoader';
import { aiApi, type AiMessage, type AiStreamEvent } from '@/api/ai';

const PROMPT_TEMPLATES = [
    { id: '1', category: '学习', icon: Book, title: '解释概念', prompt: '请用简明易懂的语言解释「{概念}」，并给出一个具体的例子。', color: 'from-blue-500 to-blue-600' },
    { id: '2', category: '练习', icon: FileText, title: '生成练习题', prompt: '请为「{主题}」生成 5 道由易到难的练习题，并附上详细解题思路。', color: 'from-emerald-500 to-emerald-600' },
    { id: '3', category: '写作', icon: FileText, title: '改进写作', prompt: '请帮我改进以下段落，使其更符合学术写作规范：\n\n{段落内容}', color: 'from-purple-500 to-purple-600' },
    { id: '4', category: '研究', icon: FlaskConical, title: '梳理论点', prompt: '请帮我梳理「{主题}」的主要论点和反驳观点，以结构化方式呈现。', color: 'from-amber-500 to-amber-600' },
    { id: '5', category: '学习', icon: Brain, title: '知识关联', prompt: '请解释「{概念A}」和「{概念B}」之间的关系，并举例说明。', color: 'from-rose-500 to-rose-600' },
    { id: '6', category: '练习', icon: Zap, title: '快速测验', prompt: '针对「{主题}」，快速生成 10 道判断题，用于自我检测。', color: 'from-cyan-500 to-cyan-600' },
];

const DEFAULT_ASSISTANT_MESSAGE: Message = {
    id: 'welcome',
    role: 'assistant',
    content: 'AI 会话已创建。你可以直接提问，系统会通过新的 Session / Runs 协议流式返回回答。',
    timestamp: new Date(),
};

function toAiInput(messages: Message[]): AiMessage[] {
    return messages
        .filter((message) => message.role === 'user' || message.role === 'assistant')
        .map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content,
        }));
}

const ModelConfigPanel: React.FC = () => {
    const [cloudModel, setCloudModel] = useState('gpt-4o');
    const [mode, setMode] = useState<'cloud' | 'local' | 'hybrid'>('cloud');

    return (
        <div className="p-6 max-w-xl space-y-6">
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">AI 模型配置</h3>
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
                <div className="flex items-center gap-2">
                    <Cloud className="w-4 h-4 text-blue-500" />
                    <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">云端 LLM</h4>
                    <span className="ml-auto flex items-center gap-1 text-xs text-green-600"><span className="w-1.5 h-1.5 rounded-full bg-green-500" /> 已连接</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <select className="w-full text-sm bg-slate-100 dark:bg-slate-700 border-none rounded-lg px-3 py-2 outline-none">
                        <option>OpenAI</option>
                        <option>Anthropic</option>
                    </select>
                    <select value={cloudModel} onChange={(event) => setCloudModel(event.target.value)} className="w-full text-sm bg-slate-100 dark:bg-slate-700 border-none rounded-lg px-3 py-2 outline-none">
                        <option value="gpt-4o">GPT-4o</option>
                        <option value="gpt-4.1">GPT-4.1</option>
                    </select>
                </div>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 space-y-3">
                <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">推理模式</h4>
                {[
                    ['cloud', '仅云端'],
                    ['local', '仅本地'],
                    ['hybrid', '混合模式'],
                ].map(([value, label]) => (
                    <label key={value} className="flex items-center gap-3 cursor-pointer">
                        <input type="radio" name="mode" checked={mode === value} onChange={() => setMode(value as typeof mode)} />
                        <span className="text-sm text-slate-600 dark:text-slate-300">{label}</span>
                    </label>
                ))}
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <Cpu className="w-4 h-4 text-slate-400" />
                    本地模型处于待机状态，当前页不直接改写本地运行时配置。
                </div>
            </div>
        </div>
    );
};

export const AIAssistant: React.FC = () => {
    const [activeSection, setActiveSection] = useState<'chat' | 'prompts' | 'config'>('chat');
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([DEFAULT_ASSISTANT_MESSAGE]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [toolCalls, setToolCalls] = useState<Array<{ toolName: string; arguments: Record<string, unknown>; callId: string }>>([]);
    const [streamError, setStreamError] = useState('');
    const [sessions, setSessions] = useState<Array<{ id: string; title: string; preview: string; time: string }>>([]);
    const bottomRef = useRef<HTMLDivElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    const createSessionMutation = useMutation({
        mutationFn: () => aiApi.createAiSession({ mode: 'general' }),
        onSuccess(session) {
            setActiveSessionId(session.sessionId);
            setMessages([DEFAULT_ASSISTANT_MESSAGE]);
            setToolCalls([]);
            setStreamError('');
            setSessions((prev) => [
                {
                    id: session.sessionId,
                    title: '新对话',
                    preview: '等待输入',
                    time: '刚刚',
                },
                ...prev.filter((item) => item.id !== session.sessionId),
            ]);
        },
    });

    const runMutation = useMutation({
        mutationFn: async ({ sessionId, outbound }: { sessionId: string; outbound: Message[] }) => {
            abortControllerRef.current?.abort();
            const controller = new AbortController();
            abortControllerRef.current = controller;

            const streamId = `assistant-${Date.now()}`;
            setMessages((prev) => [
                ...prev,
                {
                    id: streamId,
                    role: 'assistant',
                    content: '',
                    isStreaming: true,
                    streamingContent: '',
                    toolCalls: [],
                    timestamp: new Date(),
                },
            ]);
            setToolCalls([]);
            setStreamError('');

            await aiApi.streamRun(
                sessionId,
                {
                    input: toAiInput(outbound),
                    stream: true,
                },
                {
                    signal: controller.signal,
                    onEvent: (event: AiStreamEvent) => {
                        if (event.event === 'token') {
                            setMessages((prev) => prev.map((message) => (
                                message.id === streamId
                                    ? {
                                        ...message,
                                        streamingContent: `${message.streamingContent ?? ''}${event.data.text}`,
                                    }
                                    : message
                            )));
                            return;
                        }

                        if (event.event === 'tool_call') {
                            setToolCalls((prev) => [...prev, event.data]);
                            setMessages((prev) => prev.map((message) => (
                                message.id === streamId
                                    ? {
                                        ...message,
                                        toolCalls: [
                                            ...(message.toolCalls ?? []),
                                            {
                                                tool_name: event.data.toolName,
                                                arguments: event.data.arguments,
                                                call_id: event.data.callId,
                                                status: 'pending',
                                            },
                                        ],
                                    }
                                    : message
                            )));
                            return;
                        }

                        if (event.event === 'message') {
                            setMessages((prev) => prev.map((message) => (
                                message.id === streamId
                                    ? {
                                        ...message,
                                        content: event.data.content,
                                    }
                                    : message
                            )));
                            return;
                        }

                        if (event.event === 'error') {
                            setStreamError(event.data.message);
                            setMessages((prev) => prev.map((message) => (
                                message.id === streamId
                                    ? {
                                        ...message,
                                        isStreaming: false,
                                        content: message.streamingContent ?? message.content,
                                    }
                                    : message
                            )));
                            return;
                        }

                        if (event.event === 'done') {
                            setMessages((prev) => prev.map((message) => (
                                message.id === streamId
                                    ? {
                                        ...message,
                                        isStreaming: false,
                                        content: message.streamingContent ?? message.content,
                                        streamingContent: undefined,
                                        toolCalls: message.toolCalls?.map((toolCall) => ({ ...toolCall, status: 'done' })),
                                    }
                                    : message
                            )));
                        }
                    },
                }
            );

            setSessions((prev) => prev.map((session) => (
                session.id === sessionId
                    ? {
                        ...session,
                        title: outbound.find((message) => message.role === 'user')?.content.slice(0, 16) || session.title,
                        preview: outbound[outbound.length - 1]?.content.slice(0, 24) || session.preview,
                        time: '刚刚',
                    }
                    : session
            )));
        },
        onError(error) {
            const message = error instanceof Error ? error.message : 'AI 对话请求失败，请稍后重试。';
            setStreamError(message);
            setMessages((prev) => prev.map((item) => (
                item.isStreaming
                    ? {
                        ...item,
                        isStreaming: false,
                        content: item.streamingContent ?? item.content,
                        streamingContent: undefined,
                    }
                    : item
            )));
        },
    });

    useEffect(() => {
        void createSessionMutation.mutateAsync();
        return () => {
            abortControllerRef.current?.abort();
        };
    }, []);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, toolCalls]);

    const canSend = input.trim().length > 0 && !!activeSessionId && !runMutation.isPending;
    const activeTools = useMemo(
        () => toolCalls.map((toolCall) => ({
            tool_name: toolCall.toolName,
            arguments: toolCall.arguments,
            call_id: toolCall.callId,
            status: 'pending' as const,
        })),
        [toolCalls]
    );

    async function handleSend() {
        if (!activeSessionId || !input.trim() || runMutation.isPending) {
            return;
        }

        const userMessage: Message = {
            id: `user-${Date.now()}`,
            role: 'user',
            content: input.trim(),
            timestamp: new Date(),
        };

        const nextMessages = [...messages, userMessage];
        setMessages(nextMessages);
        setInput('');
        try {
            await runMutation.mutateAsync({
                sessionId: activeSessionId,
                outbound: nextMessages,
            });
        } catch {
            // Error state is handled by the mutation lifecycle so the composer can recover.
        }
    }

    return (
        <div className="h-full flex overflow-hidden bg-slate-50 dark:bg-slate-950">
            <aside className="hidden md:flex flex-col w-60 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex-shrink-0">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 space-y-1">
                    {[
                        { key: 'chat', Icon: MessageSquare, label: 'AI 对话' },
                        { key: 'prompts', Icon: Zap, label: '提示词库' },
                        { key: 'config', Icon: Settings, label: '模型配置' },
                    ].map(({ key, Icon, label }) => (
                        <button
                            key={key}
                            onClick={() => setActiveSection(key as typeof activeSection)}
                            className={cn(
                                'w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all',
                                activeSection === key ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50'
                            )}
                        >
                            <Icon className="w-4 h-4" /> {label}
                        </button>
                    ))}
                </div>

                {activeSection === 'chat' && (
                    <div className="flex-1 overflow-y-auto p-3">
                        <button
                            onClick={() => void createSessionMutation.mutateAsync()}
                            disabled={createSessionMutation.isPending}
                            className="w-full flex items-center gap-2 px-3 py-2 mb-2 text-sm text-blue-600 border border-blue-200 rounded-xl hover:bg-blue-50 transition-colors disabled:opacity-50"
                        >
                            <Plus className="w-4 h-4" /> 新建对话
                        </button>
                        <div className="space-y-1">
                            {sessions.map((session) => (
                                <button
                                    key={session.id}
                                    onClick={() => setActiveSessionId(session.id)}
                                    className={cn(
                                        'w-full text-left px-3 py-2.5 rounded-xl transition-all',
                                        activeSessionId === session.id ? 'bg-blue-50 text-blue-800' : 'hover:bg-slate-50'
                                    )}
                                >
                                    <p className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">{session.title}</p>
                                    <p className="text-[10px] text-slate-400 mt-0.5 truncate">{session.preview}</p>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </aside>

            <div className="flex-1 overflow-hidden">
                {activeSection === 'chat' && (
                    <div className="flex flex-col h-full">
                        <div className="flex-1 overflow-y-auto p-5 space-y-5">
                            {createSessionMutation.isPending ? (
                                <ChatSkeleton />
                            ) : messages.length === 0 ? (
                                <EmptyState variant="chat" />
                            ) : (
                                messages.map((message) => (
                                    <ChatBubble key={message.id} message={message} />
                                ))
                            )}

                            {activeTools.length > 0 && messages.length > 0 && !runMutation.isPending && (
                                <ChatBubble
                                    message={{
                                        id: 'tools-preview',
                                        role: 'assistant',
                                        content: '',
                                        toolCalls: activeTools,
                                        timestamp: new Date(),
                                    }}
                                />
                            )}

                            {streamError && (
                                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                                    {streamError}
                                </div>
                            )}
                            <div ref={bottomRef} />
                        </div>

                        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex-shrink-0">
                            <div className="flex gap-2 items-end">
                                <div className="flex-1 relative">
                                    <textarea
                                        value={input}
                                        onChange={(event) => setInput(event.target.value)}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter' && !event.shiftKey) {
                                                event.preventDefault();
                                                void handleSend();
                                            }
                                        }}
                                        placeholder="输入问题，Enter 发送，Shift+Enter 换行..."
                                        rows={1}
                                        className="w-full resize-none px-4 py-3 pr-12 text-sm bg-slate-100 dark:bg-slate-800 rounded-xl border-none outline-none focus:ring-2 focus:ring-blue-500 max-h-32"
                                        style={{ minHeight: 48 }}
                                    />
                                </div>
                                <button
                                    onClick={() => void handleSend()}
                                    disabled={!canSend}
                                    aria-label="发送消息"
                                    className="w-10 h-10 flex-shrink-0 bg-blue-600 text-white rounded-xl flex items-center justify-center hover:bg-blue-700 disabled:opacity-40 transition-colors"
                                >
                                    <Send className="w-4 h-4" />
                                </button>
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                                {runMutation.isPending && <AIStatusDot status="running" />}
                                <span className="text-[10px] text-slate-400">
                                    Session {activeSessionId ? activeSessionId.slice(0, 8) : '准备中'} · SSE 流式对话
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {activeSection === 'prompts' && (
                    <div className="h-full overflow-y-auto p-5">
                        <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-4">提示词模板库</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {PROMPT_TEMPLATES.map((template) => (
                                <div key={template.id} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 hover:shadow-md transition-shadow">
                                    <div className={cn('w-10 h-10 rounded-xl bg-gradient-to-br text-white flex items-center justify-center mb-3', template.color)}>
                                        <template.icon className="w-5 h-5" />
                                    </div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">{template.category}</span>
                                        <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{template.title}</h4>
                                    </div>
                                    <p className="text-xs text-slate-500 leading-relaxed mb-4 line-clamp-2">{template.prompt}</p>
                                    <button
                                        onClick={() => {
                                            setInput(template.prompt);
                                            setActiveSection('chat');
                                        }}
                                        className="w-full text-xs text-blue-600 border border-blue-200 py-1.5 rounded-lg hover:bg-blue-50 transition-colors flex items-center justify-center gap-1"
                                    >
                                        使用此模板 <ChevronRight className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {activeSection === 'config' && (
                    <div className="h-full overflow-y-auto">
                        <ModelConfigPanel />
                    </div>
                )}
            </div>
        </div>
    );
};
