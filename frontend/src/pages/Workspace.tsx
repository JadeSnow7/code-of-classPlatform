import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    ArrowUpRight,
    Bot,
    Code2,
    Grid3X3,
    MessageCircle,
    Play,
    Sparkles,
    Square,
    Zap,
} from 'lucide-react';
import { useAiConfigStore } from '@/domains/ai/useAiConfigStore';
import { useWorkspaceSimulation } from '@/hooks/useWorkspaceSimulation';

const DEFAULT_CODE_SNIPPET = `# 实验仿真示例代码
# 预置模块: np (numpy), plt (matplotlib.pyplot), math
x = np.linspace(-2, 2, 20)
y = np.linspace(-2, 2, 20)
X, Y = np.meshgrid(x, y)

q1_pos = (-1, 0)
q2_pos = (1, 0)

# 在此实现你的计算逻辑
result = np.sqrt((X - q1_pos[0])**2 + (Y - q1_pos[1])**2)`;

const SIM_TYPES = [
    { id: 'python', label: 'Python 代码', desc: '自定义 Python 仿真脚本', Icon: Code2 },
    { id: 'laplace', label: 'Laplace 2D', desc: '二维拉普拉斯方程数值解', Icon: Zap },
    { id: 'point_charge', label: '示例场景', desc: '点电荷网格数据可视化', Icon: Grid3X3 },
] as const;

const AI_MODE_LABEL: Record<'auto' | 'local' | 'cloud', string> = {
    auto: '智能路由（本地优先）',
    local: '仅本地推理',
    cloud: '仅云端推理',
};

const SUGGESTED_PROMPTS = [
    '帮我解释当前参数的物理意义',
    '给这段仿真代码做逐行讲解',
    '如何判断边界条件设置是否合理？',
];

function SimFieldVisualization({ base64 }: { base64?: string }) {
    if (base64) {
        return (
            <div className="overflow-hidden rounded-[24px] border border-slate-700/70 bg-slate-950">
                <img
                    src={`data:image/png;base64,${base64}`}
                    alt="仿真结果"
                    className="max-h-full max-w-full object-contain"
                />
            </div>
        );
    }

    return (
        <div className="overflow-hidden rounded-[24px] border border-slate-700/70 bg-slate-950">
            <div className="flex h-[280px] items-center justify-center px-6 text-center">
                <div>
                    <p className="text-sm font-medium text-slate-200">运行后在此显示真实仿真结果</p>
                    <p className="mt-2 text-sm text-slate-500">输出面板保持统一的 slate 视觉层级，不再混入额外主题色。</p>
                </div>
            </div>
        </div>
    );
}

function FieldLabel({ children }: { children: string }) {
    return <label className="mb-2 block text-xs font-medium tracking-wide text-slate-400">{children}</label>;
}

export function WorkspacePage() {
    const navigate = useNavigate();
    const { courseId } = useParams<{ courseId: string }>();
    const defaultMode = useAiConfigStore((state) => state.defaultMode);
    const [activeSim, setActiveSim] = useState<(typeof SIM_TYPES)[number]['id']>('python');
    const [code, setCode] = useState(DEFAULT_CODE_SNIPPET);
    const [gridResolution, setGridResolution] = useState<'coarse' | 'medium' | 'fine'>('coarse');
    const [boundaryCondition, setBoundaryCondition] = useState<'pec' | 'pml' | 'periodic'>('pec');
    const [frequencyMhz, setFrequencyMhz] = useState<number | null>(null);
    const { running, showResult, resultBase64, statusText, errorMessage, runSimulation } = useWorkspaceSimulation();

    const canRun = useMemo(() => code.trim().length > 0, [code]);

    const handleRun = () => {
        if (!canRun) return;

        const params: Record<string, unknown> = {
            grid_resolution: gridResolution,
            boundary_condition: boundaryCondition,
        };

        if (frequencyMhz !== null && Number.isFinite(frequencyMhz)) {
            params.frequency_mhz = frequencyMhz;
        }

        void runSimulation({
            simulationType: activeSim,
            code,
            params,
        });
    };

    const handleAiQna = () => {
        if (courseId) {
            navigate(`/courses/${courseId}/chat`);
            return;
        }
        navigate('/local-ai');
    };

    return (
        <div className="min-h-full bg-slate-950 px-4 py-4 text-slate-100 md:px-6 md:py-6">
            <div className="mx-auto grid max-w-[1800px] gap-4 lg:min-h-[calc(100vh-7rem)] lg:grid-cols-[280px,minmax(0,1fr),320px]">
                <aside className="rounded-[28px] border border-slate-700/70 bg-slate-900/85 p-5 shadow-[0_20px_60px_rgba(2,6,23,0.28)] backdrop-blur">
                    <div className="mb-6">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Parameter Rail</p>
                        <h2 className="mt-2 text-lg font-semibold text-slate-50">仿真参数</h2>
                        <p className="mt-2 text-sm leading-6 text-slate-400">
                            左侧参数、中央代码、右侧 AI 面板统一使用 slate 系列层级。
                        </p>
                    </div>

                    <div className="space-y-2">
                        {SIM_TYPES.map(({ id, label, desc, Icon }) => {
                            const isActive = activeSim === id;

                            return (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => setActiveSim(id)}
                                    className={`w-full rounded-[22px] border px-4 py-3 text-left transition-colors ${
                                        isActive
                                            ? 'border-blue-500/40 bg-slate-800 text-slate-50'
                                            : 'border-transparent bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:bg-slate-800/70 hover:text-slate-200'
                                    }`}
                                >
                                    <div className="flex items-start gap-3">
                                        <div
                                            className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-2xl ${
                                                isActive ? 'bg-blue-500/12 text-blue-200' : 'bg-slate-800 text-slate-400'
                                            }`}
                                        >
                                            <Icon size={17} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium">{label}</p>
                                            <p className="mt-1 text-xs leading-5 text-slate-500">{desc}</p>
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    <div className="mt-6 space-y-4 rounded-[24px] border border-slate-700/70 bg-slate-800/55 p-4">
                        <div>
                            <FieldLabel>Grid Resolution</FieldLabel>
                            <select
                                value={gridResolution}
                                onChange={(event) => setGridResolution(event.target.value as 'coarse' | 'medium' | 'fine')}
                                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-slate-100 outline-none transition-colors focus:border-blue-500/60"
                            >
                                <option value="coarse">coarse</option>
                                <option value="medium">medium</option>
                                <option value="fine">fine</option>
                            </select>
                        </div>

                        <div>
                            <FieldLabel>Boundary Condition</FieldLabel>
                            <select
                                value={boundaryCondition}
                                onChange={(event) => setBoundaryCondition(event.target.value as 'pec' | 'pml' | 'periodic')}
                                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-slate-100 outline-none transition-colors focus:border-blue-500/60"
                            >
                                <option value="pec">pec</option>
                                <option value="pml">pml</option>
                                <option value="periodic">periodic</option>
                            </select>
                        </div>

                        <div>
                            <FieldLabel>Frequency (MHz)</FieldLabel>
                            <input
                                type="number"
                                value={frequencyMhz ?? ''}
                                onChange={(event) => {
                                    const raw = event.target.value.trim();
                                    setFrequencyMhz(raw ? Number(raw) : null);
                                }}
                                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-500 focus:border-blue-500/60"
                                placeholder="可选"
                            />
                        </div>
                    </div>
                </aside>

                <section className="min-w-0 space-y-4">
                    <div className="rounded-[28px] border border-slate-700/70 bg-slate-900 p-5 shadow-[0_20px_60px_rgba(2,6,23,0.28)]">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/12 text-blue-200">
                                    <Grid3X3 size={20} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-semibold text-slate-50">实验仿真工作台</h2>
                                    <p className="mt-1 text-sm text-slate-400">提交真实代码与参数到后端执行，结果回流到统一输出面板。</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={handleRun}
                                    disabled={running || !canRun}
                                    className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-medium text-white shadow-[0_18px_38px_rgba(37,99,235,0.22)] transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-400/60"
                                >
                                    {running ? <Square size={16} /> : <Play size={16} />}
                                    {running ? '运行中...' : '运行仿真'}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleAiQna}
                                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-medium text-slate-200 transition-colors hover:border-slate-600 hover:bg-slate-700"
                                >
                                    <MessageCircle size={16} />
                                    打开 AI 问答
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-[28px] border border-slate-700/70 bg-slate-900 p-5 shadow-[0_20px_60px_rgba(2,6,23,0.28)]">
                        <div className="mb-3 flex items-center justify-between">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Code Panel</p>
                                <h3 className="mt-2 text-base font-semibold text-slate-50">Simulation Code</h3>
                            </div>
                            <div className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-400">
                                Python / NumPy
                            </div>
                        </div>

                        <textarea
                            value={code}
                            onChange={(event) => setCode(event.target.value)}
                            className="min-h-[360px] w-full rounded-[24px] border border-slate-700/70 bg-slate-950 p-4 font-mono text-sm leading-7 text-slate-100 outline-none transition-colors placeholder:text-slate-500 focus:border-blue-500/60"
                            style={{ resize: 'vertical' }}
                        />
                    </div>

                    <div className="rounded-[28px] border border-slate-700/70 bg-slate-900 p-5 shadow-[0_20px_60px_rgba(2,6,23,0.28)]">
                        <div className="mb-4 flex items-center justify-between">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Output</p>
                                <h3 className="mt-2 text-base font-semibold text-slate-50">运行结果与状态</h3>
                            </div>
                            {statusText ? (
                                <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-400">
                                    {statusText}
                                </span>
                            ) : null}
                        </div>

                        {running ? (
                            <div className="rounded-[24px] border border-slate-700/70 bg-slate-950 px-5 py-6 text-sm text-slate-400">
                                正在运行仿真...
                                {statusText ? `（${statusText}）` : ''}
                            </div>
                        ) : errorMessage ? (
                            <div className="rounded-[24px] border border-amber-500/20 bg-amber-500/10 px-5 py-6 text-sm text-amber-200">
                                {errorMessage}
                            </div>
                        ) : showResult ? (
                            <div className="space-y-4">
                                <p className="text-sm text-emerald-300">仿真完成，结果已回填到工作台。</p>
                                <SimFieldVisualization base64={resultBase64} />
                            </div>
                        ) : (
                            <SimFieldVisualization />
                        )}
                    </div>
                </section>

                <aside className="rounded-[28px] border border-slate-700/70 bg-slate-900/85 p-5 shadow-[0_20px_60px_rgba(2,6,23,0.28)] backdrop-blur">
                    <div className="mb-6 flex items-start gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-800 text-slate-200">
                            <Bot size={20} />
                        </div>
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">AI Rail</p>
                            <h2 className="mt-2 text-lg font-semibold text-slate-50">工作台助手</h2>
                            <p className="mt-2 text-sm leading-6 text-slate-400">
                                右侧面板保留轻量问答引导，不直接嵌入完整会话流。
                            </p>
                        </div>
                    </div>

                    <div className="space-y-4 rounded-[24px] border border-slate-700/70 bg-slate-800/55 p-4">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">当前推理模式</span>
                            <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs text-blue-200">
                                {AI_MODE_LABEL[defaultMode]}
                            </span>
                        </div>

                        <div className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-4">
                            <div className="flex items-center gap-2 text-sm font-medium text-slate-100">
                                <Sparkles size={15} className="text-blue-300" />
                                建议先问这些
                            </div>
                            <div className="mt-3 space-y-2">
                                {SUGGESTED_PROMPTS.map((prompt) => (
                                    <button
                                        key={prompt}
                                        type="button"
                                        onClick={handleAiQna}
                                        className="w-full rounded-2xl border border-slate-800 bg-slate-900 px-3 py-3 text-left text-sm text-slate-300 transition-colors hover:border-slate-700 hover:bg-slate-800"
                                    >
                                        {prompt}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-4 text-sm leading-6 text-slate-400">
                            当前页仅负责参数、代码与输出的轻量联动。深入问答和多轮解释统一跳转到独立 AI 页面。
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={handleAiQna}
                        className="mt-4 inline-flex w-full items-center justify-between rounded-[24px] border border-slate-700 bg-slate-800 px-4 py-4 text-left text-sm font-medium text-slate-100 transition-colors hover:border-slate-600 hover:bg-slate-700"
                    >
                        <span>前往 Local AI / 课程问答</span>
                        <ArrowUpRight size={17} />
                    </button>
                </aside>
            </div>
        </div>
    );
}
