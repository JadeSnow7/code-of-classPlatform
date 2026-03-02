import type { ThoughtEvent } from '@classplatform/shared';
import { clsx } from 'clsx';

interface ThoughtTimelineProps {
    thoughts: ThoughtEvent[];
}

function phaseLabel(phase: ThoughtEvent['phase']): string {
    switch (phase) {
        case 'dispatch':
            return '调度';
        case 'visual':
            return '视觉';
        case 'code':
            return '代码';
        case 'research':
            return '理论';
        case 'synthesize':
            return '合成';
        case 'edge_route':
            return '端侧';
        default:
            return phase;
    }
}

export function ThoughtTimeline({ thoughts }: ThoughtTimelineProps) {
    if (thoughts.length === 0) {
        return null;
    }

    return (
        <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
            <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-100">Multi-Agent 执行进度</h2>
                <span className="text-xs text-slate-400">{thoughts.length} 条事件</span>
            </div>
            <div className="space-y-3">
                {thoughts.map((thought, index) => (
                    <div
                        key={`${thought.phase}-${thought.status}-${index}`}
                        className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-3"
                    >
                        <div
                            className={clsx(
                                'mt-1 h-2.5 w-2.5 rounded-full',
                                thought.status === 'running' && 'bg-amber-400 animate-pulse',
                                thought.status === 'done' && 'bg-emerald-400',
                                thought.status === 'error' && 'bg-rose-400'
                            )}
                        />
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[11px] uppercase tracking-wide text-slate-300">
                                    {phaseLabel(thought.phase)}
                                </span>
                                <span className="text-xs text-slate-500">{thought.node}</span>
                            </div>
                            <p className="mt-1 text-sm text-slate-100">{thought.label}</p>
                            {thought.detail && (
                                <p className="mt-1 text-xs text-slate-400">{thought.detail}</p>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}
