import { useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Bot, ArrowLeft, Send, Square, Sparkles } from 'lucide-react';
import { ThoughtTimeline } from '@/components/chat/ThoughtTimeline';
import { useOrchestratedChat } from '@/hooks/useOrchestratedChat';

const MULTI_AGENT_ENABLED = import.meta.env.VITE_MULTI_AGENT_EXPERIMENTAL === 'true';

export function MultiAgentChatPage() {
    const { courseId } = useParams();
    const { status, error, thoughts, messages, send, stop } = useOrchestratedChat();
    const [input, setInput] = useState('请结合代码和理论，分析为什么仿真边界会出现明显反射。');
    const isStreaming = status === 'streaming';

    const placeholderThoughts = useMemo(() => [
        '调度员会先拆分任务',
        '代码专家会尝试静态分析或沙箱验证',
        '理论专家会在需要时补充课程依据',
    ], []);

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        if (!input.trim() || isStreaming || !MULTI_AGENT_ENABLED) {
            return;
        }
        await send({
            prompt: input.trim(),
            courseId,
            workspaceContext: {
                open_files: ['fdtd.py'],
                selected_snippets: [
                    {
                        path: 'fdtd.py',
                        content: 'for step in range(100):\n    field[1:-1] += 0.1',
                    },
                ],
            },
        });
        setInput('');
    };

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),_transparent_38%),linear-gradient(180deg,_#07111f_0%,_#020617_48%,_#020617_100%)] px-4 py-6 text-slate-100 md:px-8">
            <div className="mx-auto max-w-6xl">
                <div className="mb-6 flex items-center justify-between gap-4">
                    <div>
                        <Link to={`/courses/${courseId}/chat`} className="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-slate-100">
                            <ArrowLeft className="h-4 w-4" />
                            返回普通聊天
                        </Link>
                        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Multi-Agent 实验聊天</h1>
                        <p className="mt-2 max-w-3xl text-sm text-slate-400">
                            展示调度、代码、理论与合成阶段的透明进度流。一期默认走云端编排 PoC。
                        </p>
                    </div>
                    <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
                        <div className="flex items-center gap-2 font-medium">
                            <Sparkles className="h-4 w-4" />
                            {MULTI_AGENT_ENABLED ? '实验功能已启用' : '实验功能已关闭'}
                        </div>
                        {!MULTI_AGENT_ENABLED && (
                            <p className="mt-1 text-xs text-cyan-200/80">设置 `VITE_MULTI_AGENT_EXPERIMENTAL=true` 后可启用。</p>
                        )}
                    </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                    <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 shadow-2xl shadow-slate-950/30">
                        <div className="mb-4 flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-500/15 text-cyan-300">
                                <Bot className="h-5 w-5" />
                            </div>
                            <div>
                                <h2 className="font-semibold">对话输出</h2>
                                <p className="text-xs text-slate-400">`thought` 事件在右侧，最终回答在左侧流式累积。</p>
                            </div>
                        </div>

                        <div className="min-h-[380px] space-y-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                            {messages.length === 0 && (
                                <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 p-5 text-sm text-slate-400">
                                    <p className="font-medium text-slate-200">推荐演示问题</p>
                                    <ul className="mt-3 space-y-2">
                                        {placeholderThoughts.map((item) => (
                                            <li key={item}>{item}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {messages.map((message, index) => (
                                <div
                                    key={`${message.role}-${index}`}
                                    className={message.role === 'user' ? 'ml-auto max-w-[80%]' : 'mr-auto max-w-[85%]'}
                                >
                                    <div
                                        className={
                                            message.role === 'user'
                                                ? 'rounded-2xl rounded-br-md bg-cyan-500 px-4 py-3 text-sm text-slate-950'
                                                : 'rounded-2xl rounded-bl-md border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-100'
                                        }
                                    >
                                        <p className="whitespace-pre-wrap">
                                            {message.content}
                                            {message.role === 'assistant' && isStreaming && index === messages.length - 1 && (
                                                <span className="ml-1 inline-block h-4 w-2 animate-pulse bg-cyan-300" />
                                            )}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <form onSubmit={handleSubmit} className="mt-4 flex gap-3">
                            <textarea
                                value={input}
                                onChange={(event) => setInput(event.target.value)}
                                rows={4}
                                disabled={!MULTI_AGENT_ENABLED || isStreaming}
                                className="min-h-[112px] flex-1 rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400"
                            />
                            {isStreaming ? (
                                <button
                                    type="button"
                                    onClick={stop}
                                    className="inline-flex items-center gap-2 self-end rounded-2xl bg-rose-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-rose-400"
                                >
                                    <Square className="h-4 w-4" />
                                    停止
                                </button>
                            ) : (
                                <button
                                    type="submit"
                                    disabled={!MULTI_AGENT_ENABLED || !input.trim()}
                                    className="inline-flex items-center gap-2 self-end rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <Send className="h-4 w-4" />
                                    发送
                                </button>
                            )}
                        </form>

                        {error && (
                            <div className="mt-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                                {error}
                            </div>
                        )}
                    </section>

                    <ThoughtTimeline thoughts={thoughts} />
                </div>
            </div>
        </div>
    );
}
