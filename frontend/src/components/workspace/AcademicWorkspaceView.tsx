import { useEffect, useRef, useState } from 'react';
import { Bot, Cloud, FileText, Network, SendHorizonal, Sparkles } from 'lucide-react';
import { useAiConfigStore, type AiSourceMode } from '@/domains/ai/useAiConfigStore';

type EditorTab = 'abstract' | 'references';
type DocumentType = 'thesis' | 'journal' | 'proposal';
type ThoughtStatus = 'idle' | 'running' | 'done';
type ReviewState = 'idle' | 'running' | 'done';

interface Citation {
    id: string;
    label: string;
}

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    citations?: Citation[];
}

interface ThoughtStep {
    id: string;
    label: string;
    status: ThoughtStatus;
}

interface GraphNode {
    id: string;
    label: string;
    x: number;
    y: number;
    tone: 'blue' | 'purple' | 'slate';
}

interface GraphEdge {
    id: string;
    from: string;
    to: string;
}

const ABSTRACT_TEMPLATE = `# 摘要

本文围绕人工智能辅助学术写作展开研究，证明该系统可以显著提升所有研究生论文的质量，并且在多数场景下都优于传统写作指导方式。实验部分引用了某高校 2025 年的课程数据，结果显示学生写作效率平均提升 42%，但此处尚未给出数据来源与采集条件。本文还认为 GraphRAG 技术已经系统性解决了论文写作中的规范性问题，不过相关论断缺少直接文献支撑。

此外，摘要中交替使用了“论文写作工作台”“智能写作平台”和“写作辅导系统”等表述，术语并不统一。`;

const REFERENCES_TEMPLATE = `# 参考文献

[1] 王明, 李华. 学术写作智能辅导研究[J]. 教育技术, 2024(3).
[2] Brown T，Smith A. Research Writing Support Systems. Journal of Academic Practice, 2023.
[3] 教育部. 研究生学位论文撰写规范 北京: 高等教育出版社, 2022
[4] GB/T 7714-2015 文后参考文献著录规则`;

const BASE_THOUGHT_STEPS: ThoughtStep[] = [
    { id: 'planner', label: 'Planner 正在拆解写作审查任务...', status: 'idle' },
    { id: 'graphrag', label: 'GraphRAG 正在课程图谱中检索标准规范...', status: 'idle' },
    { id: 'verifier', label: 'Verifier 正在核验逻辑冲突...', status: 'idle' },
];

const GRAPH_NODES: GraphNode[] = [
    { id: 'abstract', label: '本文摘要', x: 130, y: 92, tone: 'blue' },
    { id: 'support', label: '缺乏支撑', x: 320, y: 68, tone: 'purple' },
    { id: 'source', label: '实验数据来源', x: 320, y: 176, tone: 'blue' },
    { id: 'paper-a', label: '文献A', x: 520, y: 62, tone: 'slate' },
    { id: 'standard', label: 'GB/T 7714', x: 518, y: 202, tone: 'purple' },
    { id: 'thesis-guide', label: '研究生学位论文撰写规范', x: 520, y: 132, tone: 'blue' },
];

const GRAPH_EDGES: GraphEdge[] = [
    { id: 'abstract-support', from: 'abstract', to: 'support' },
    { id: 'abstract-source', from: 'abstract', to: 'source' },
    { id: 'support-paper-a', from: 'support', to: 'paper-a' },
    { id: 'source-guide', from: 'source', to: 'thesis-guide' },
    { id: 'references-standard', from: 'thesis-guide', to: 'standard' },
];

const DEFAULT_CITATIONS: Citation[] = [
    { id: '1', label: '[1] 研究生学位论文撰写规范' },
    { id: '2', label: '[2] GB/T 7714-2015' },
];

function classNames(...values: Array<string | false | null | undefined>) {
    return values.filter(Boolean).join(' ');
}

function resolveComputeMode(mode: AiSourceMode): 'local' | 'cloud' {
    return mode === 'cloud' ? 'cloud' : 'local';
}

function reviewReply(documentType: DocumentType): string {
    const lead =
        documentType === 'journal'
            ? '我发现您的摘要在学术论证密度上还不足。'
            : documentType === 'proposal'
              ? '我发现您的摘要更像研究设想说明，而非规范的学术摘要。'
              : '我发现您的摘要中缺少了对关键实验数据的来源标注。';

    return `${lead} 根据《研究生学位论文撰写规范》[1]，引用他人数据或课程统计结果时应同步标明来源与语境；同时，您当前参考文献条目的作者、年份和出版信息也未满足 GB/T 7714 的著录要求[2]。建议先补齐数据出处，再为“显著提升 42%”和“系统性解决”这类强结论补充直接证据。`;
}

function questionReply(question: string): string {
    if (question.includes('参考文献')) {
        return '您当前的参考文献条目存在中英文标点混用、作者信息不完整和出版项缺失的问题。建议先按 GB/T 7714[2] 统一著录格式，再在正文引用处补足与摘要论断一一对应的来源说明。';
    }
    if (question.includes('摘要')) {
        return '从摘要表达看，当前文本的问题不在“写得不够长”，而在结论先行、证据滞后。根据《研究生学位论文撰写规范》[1]，摘要应交代研究对象、方法、结果与结论，尤其不能省略关键数据来源。';
    }

    return '我建议您优先检查三类问题：数据来源是否可追溯、核心论断是否有文献支撑、参考文献格式是否符合 GB/T 7714[2]。若摘要中出现“显著提升”“系统性解决”等强结论，应补充直接证据并与引用条目建立对应关系[1]。';
}

export function AcademicWorkspaceView() {
    const defaultMode = useAiConfigStore((state) => state.defaultMode);
    const setDefaultMode = useAiConfigStore((state) => state.setDefaultMode);
    const [activeTab, setActiveTab] = useState<EditorTab>('abstract');
    const [documentType, setDocumentType] = useState<DocumentType>('thesis');
    const [strictCitationCheck, setStrictCitationCheck] = useState(true);
    const [abstractDraft, setAbstractDraft] = useState(ABSTRACT_TEMPLATE);
    const [referencesDraft, setReferencesDraft] = useState(REFERENCES_TEMPLATE);
    const [chatInput, setChatInput] = useState('');
    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            id: 'assistant-intro',
            role: 'assistant',
            content:
                '多智能体学术助教已就绪。您可以直接运行全文智能审查，或输入一个关于摘要、论证和参考文献规范的问题。',
        },
    ]);
    const [reviewState, setReviewState] = useState<ReviewState>('idle');
    const [thoughtSteps, setThoughtSteps] = useState<ThoughtStep[]>(BASE_THOUGHT_STEPS);
    const [graphHighlight, setGraphHighlight] = useState<{ nodeIds: string[]; edgeIds: string[]; focus: string }>({
        nodeIds: [],
        edgeIds: [],
        focus: '等待启动审查',
    });
    const messageViewportRef = useRef<HTMLDivElement | null>(null);
    const timeoutIdsRef = useRef<number[]>([]);

    const computeMode = resolveComputeMode(defaultMode);
    const editorValue = activeTab === 'abstract' ? abstractDraft : referencesDraft;

    useEffect(() => {
        return () => {
            timeoutIdsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
            timeoutIdsRef.current = [];
        };
    }, []);

    useEffect(() => {
        if (messageViewportRef.current && typeof messageViewportRef.current.scrollTo === 'function') {
            messageViewportRef.current.scrollTo({
                top: messageViewportRef.current.scrollHeight,
                behavior: 'smooth',
            });
        }
    }, [messages, thoughtSteps]);

    const clearPlayback = () => {
        timeoutIdsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
        timeoutIdsRef.current = [];
    };

    const startThoughtChain = (onDone: () => void) => {
        clearPlayback();
        setReviewState('running');
        setThoughtSteps(BASE_THOUGHT_STEPS);
        setGraphHighlight({
            nodeIds: ['abstract', 'support', 'source', 'paper-a', 'thesis-guide', 'standard'],
            edgeIds: ['abstract-support', 'abstract-source', 'support-paper-a', 'source-guide', 'references-standard'],
            focus: '当前聚焦：摘要中缺少数据来源标注',
        });

        BASE_THOUGHT_STEPS.forEach((step, index) => {
            const runningTimer = window.setTimeout(() => {
                setThoughtSteps((prev) =>
                    prev.map((item, itemIndex) => {
                        if (itemIndex < index) return { ...item, status: 'done' };
                        if (item.id === step.id) return { ...item, status: 'running' };
                        return { ...item, status: 'idle' };
                    }),
                );
            }, index * 650);

            const doneTimer = window.setTimeout(() => {
                setThoughtSteps((prev) =>
                    prev.map((item, itemIndex) => {
                        if (itemIndex <= index) return { ...item, status: 'done' };
                        return { ...item, status: 'idle' };
                    }),
                );

                if (index === BASE_THOUGHT_STEPS.length - 1) {
                    setReviewState('done');
                    onDone();
                }
            }, index * 650 + 420);

            timeoutIdsRef.current.push(runningTimer, doneTimer);
        });
    };

    const handleRunReview = () => {
        startThoughtChain(() => {
            setMessages((prev) => [
                ...prev,
                {
                    id: `assistant-review-${Date.now()}`,
                    role: 'assistant',
                    content: reviewReply(documentType),
                    citations: DEFAULT_CITATIONS,
                },
            ]);
        });
    };

    const handleSend = () => {
        const prompt = chatInput.trim();
        if (!prompt || reviewState === 'running') return;

        setMessages((prev) => [
            ...prev,
            {
                id: `user-${Date.now()}`,
                role: 'user',
                content: prompt,
            },
        ]);
        setChatInput('');

        startThoughtChain(() => {
            setMessages((prev) => [
                ...prev,
                {
                    id: `assistant-answer-${Date.now()}`,
                    role: 'assistant',
                    content: questionReply(prompt),
                    citations: DEFAULT_CITATIONS,
                },
            ]);
        });
    };

    const updateEditorValue = (value: string) => {
        if (activeTab === 'abstract') {
            setAbstractDraft(value);
            return;
        }
        setReferencesDraft(value);
    };

    return (
        <div className="relative min-h-full overflow-hidden bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.12),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(147,51,234,0.12),_transparent_30%)]" />
            <div className="relative mx-auto grid max-w-[1800px] gap-4 px-4 py-4 md:px-6 md:py-6 xl:min-h-[calc(100vh-7rem)] xl:grid-cols-[290px,minmax(0,1fr),360px]">
                <aside className="rounded-[30px] border border-slate-200 bg-white/88 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/88">
                    <div className="mb-6">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-300">
                            Review Config
                        </p>
                        <h1 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-50">写作辅导与审查配置</h1>
                        <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                            面向学术规范、引文溯源与论证一致性的全文智能审查工作台。
                        </p>
                    </div>

                    <div className="space-y-5">
                        <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60">
                            <label className="mb-2 block text-xs font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                                文体选择
                            </label>
                            <select
                                value={documentType}
                                onChange={(event) => setDocumentType(event.target.value as DocumentType)}
                                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                            >
                                <option value="thesis">学位论文</option>
                                <option value="journal">期刊论文</option>
                                <option value="proposal">开题报告</option>
                            </select>
                        </div>

                        <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60">
                            <div className="flex items-center justify-between gap-4">
                                <div>
                                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                        严格格式审查 (GB/T 7714)
                                    </p>
                                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                                        强化摘要引用、文后参考文献与规范著录一致性检查。
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    aria-pressed={strictCitationCheck}
                                    onClick={() => setStrictCitationCheck((prev) => !prev)}
                                    className={classNames(
                                        'relative inline-flex h-8 w-14 items-center rounded-full transition',
                                        strictCitationCheck ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700',
                                    )}
                                >
                                    <span
                                        className={classNames(
                                            'inline-block h-6 w-6 rounded-full bg-white shadow transition',
                                            strictCitationCheck ? 'translate-x-7' : 'translate-x-1',
                                        )}
                                    />
                                </button>
                            </div>
                        </div>

                        <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60">
                            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-100">
                                <Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-300" />
                                端云协同
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setDefaultMode('local')}
                                    className={classNames(
                                        'inline-flex items-center justify-center gap-2 rounded-2xl px-3 py-3 text-sm font-medium transition',
                                        computeMode === 'local'
                                            ? 'bg-blue-600 text-white shadow-[0_16px_36px_rgba(37,99,235,0.26)]'
                                            : 'border border-slate-200 bg-white text-slate-700 hover:border-blue-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200',
                                    )}
                                >
                                    <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-white/18">
                                        <FileText className="h-4 w-4" />
                                    </span>
                                    Edge CPU
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setDefaultMode('cloud')}
                                    className={classNames(
                                        'inline-flex items-center justify-center gap-2 rounded-2xl px-3 py-3 text-sm font-medium transition',
                                        computeMode === 'cloud'
                                            ? 'bg-purple-600 text-white shadow-[0_16px_36px_rgba(147,51,234,0.22)]'
                                            : 'border border-slate-200 bg-white text-slate-700 hover:border-purple-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200',
                                    )}
                                >
                                    <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-white/18">
                                        <Cloud className="h-4 w-4" />
                                    </span>
                                    Cloud GPU
                                </button>
                            </div>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={handleRunReview}
                        disabled={reviewState === 'running'}
                        className="mt-6 inline-flex w-full items-center justify-center rounded-[24px] bg-gradient-to-r from-blue-600 to-purple-600 px-5 py-4 text-sm font-semibold text-white shadow-[0_22px_52px_rgba(59,130,246,0.24)] transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                        🚀 运行全文智能审查 (Multi-Agent)
                    </button>
                </aside>

                <section className="space-y-4">
                    <div className="rounded-[30px] border border-slate-200 bg-white/88 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/88">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="flex h-12 w-12 items-center justify-center rounded-[20px] bg-blue-50 text-blue-600 dark:bg-blue-500/12 dark:text-blue-200">
                                    <FileText className="h-5 w-5" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">沉浸式写作与规范编辑区</h2>
                                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                        在同一视图中查看摘要、参考文献与规范性反馈。
                                    </p>
                                </div>
                            </div>

                            <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-950">
                                {[
                                    { id: 'abstract', label: '摘要.md' },
                                    { id: 'references', label: '参考文献.md' },
                                ].map((tab) => (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => setActiveTab(tab.id as EditorTab)}
                                        className={classNames(
                                            'rounded-xl px-4 py-2 text-sm font-medium transition',
                                            activeTab === tab.id
                                                ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-900 dark:text-blue-200'
                                                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100',
                                        )}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <textarea
                            aria-label={`${activeTab === 'abstract' ? '摘要.md' : '参考文献.md'} 内容`}
                            value={editorValue}
                            onChange={(event) => updateEditorValue(event.target.value)}
                            className="mt-5 min-h-[320px] w-full rounded-[26px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-7 text-slate-800 outline-none transition focus:border-blue-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                            style={{ resize: 'vertical' }}
                        />
                    </div>

                    <div className="rounded-[30px] border border-slate-200 bg-white/88 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/88">
                        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="flex h-12 w-12 items-center justify-center rounded-[20px] bg-purple-50 text-purple-600 dark:bg-purple-500/12 dark:text-purple-200">
                                    <Network className="h-5 w-5" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">GraphRAG 知识网络</h2>
                                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                        聚焦摘要论断、数据来源与规范条目之间的证据路径。
                                    </p>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-100">
                                {graphHighlight.focus}
                            </div>
                        </div>

                        <div className="overflow-hidden rounded-[26px] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(241,245,249,0.88))] p-3 dark:border-slate-800 dark:bg-[linear-gradient(180deg,rgba(2,6,23,0.9),rgba(15,23,42,0.84))]">
                            <svg viewBox="0 0 660 260" className="h-[280px] w-full">
                                {GRAPH_EDGES.map((edge) => {
                                    const from = GRAPH_NODES.find((node) => node.id === edge.from);
                                    const to = GRAPH_NODES.find((node) => node.id === edge.to);

                                    if (!from || !to) return null;

                                    const isHighlighted = graphHighlight.edgeIds.includes(edge.id);

                                    return (
                                        <line
                                            key={edge.id}
                                            x1={from.x + 58}
                                            y1={from.y + 18}
                                            x2={to.x}
                                            y2={to.y + 18}
                                            stroke={isHighlighted ? '#2563eb' : '#94a3b8'}
                                            strokeOpacity={isHighlighted ? 0.92 : 0.45}
                                            strokeWidth={isHighlighted ? 3 : 1.6}
                                            strokeLinecap="round"
                                        />
                                    );
                                })}

                                {GRAPH_NODES.map((node) => {
                                    const isHighlighted = graphHighlight.nodeIds.includes(node.id);
                                    const palette =
                                        node.tone === 'purple'
                                            ? {
                                                  fill: isHighlighted ? '#7c3aed' : '#ddd6fe',
                                                  darkFill: isHighlighted ? '#7c3aed' : '#4338ca',
                                              }
                                            : node.tone === 'blue'
                                              ? {
                                                    fill: isHighlighted ? '#2563eb' : '#dbeafe',
                                                    darkFill: isHighlighted ? '#2563eb' : '#1d4ed8',
                                                }
                                              : {
                                                    fill: isHighlighted ? '#475569' : '#e2e8f0',
                                                    darkFill: isHighlighted ? '#475569' : '#334155',
                                                };

                                    return (
                                        <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
                                            <rect
                                                width="128"
                                                height="36"
                                                rx="18"
                                                fill={palette.fill}
                                                fillOpacity={isHighlighted ? 1 : 0.8}
                                                className="dark:hidden"
                                            />
                                            <rect
                                                width="128"
                                                height="36"
                                                rx="18"
                                                fill={palette.darkFill}
                                                fillOpacity={isHighlighted ? 1 : 0.88}
                                                className="hidden dark:block"
                                            />
                                            <text
                                                x="64"
                                                y="22"
                                                textAnchor="middle"
                                                className={classNames(
                                                    'fill-slate-700 text-[12px] font-medium dark:fill-slate-100',
                                                    isHighlighted && 'fill-white dark:fill-white',
                                                )}
                                            >
                                                {node.label}
                                            </text>
                                        </g>
                                    );
                                })}
                            </svg>
                        </div>
                    </div>
                </section>

                <aside className="flex flex-col rounded-[30px] border border-slate-200 bg-white/88 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/88">
                    <div className="mb-5 flex items-start gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-[20px] bg-gradient-to-br from-blue-600 to-purple-600 text-white">
                            <Bot className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-purple-600 dark:text-purple-300">
                                Multi-Agent Tutor
                            </p>
                            <h2 className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-50">AI 学术助教</h2>
                            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                                结合 Planner、GraphRAG 与 Verifier 的审查链路，输出带引用溯源的学术建议。
                            </p>
                        </div>
                    </div>

                    <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60">
                        <div className="mb-3 flex items-center justify-between">
                            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">多智能体思考状态</span>
                            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                                {reviewState === 'running' ? '审查进行中' : reviewState === 'done' ? '审查完成' : '等待触发'}
                            </span>
                        </div>
                        <div className="space-y-2">
                            {thoughtSteps.map((step) => (
                                <div
                                    key={step.id}
                                    className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm dark:border-slate-800 dark:bg-slate-900"
                                >
                                    <span className="text-base">
                                        {step.status === 'done' ? '✅' : step.status === 'running' ? '⏳' : '◻️'}
                                    </span>
                                    <span className="text-slate-700 dark:text-slate-200">{step.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div
                        ref={messageViewportRef}
                        className="mt-4 flex min-h-[360px] flex-1 flex-col gap-3 overflow-y-auto rounded-[24px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60"
                    >
                        {messages.map((message) => (
                            <div
                                key={message.id}
                                className={classNames('max-w-[92%]', message.role === 'user' ? 'ml-auto' : 'mr-auto')}
                            >
                                <div
                                    className={classNames(
                                        'rounded-[22px] px-4 py-3 text-sm leading-6',
                                        message.role === 'user'
                                            ? 'rounded-br-md bg-blue-600 text-white'
                                            : 'rounded-bl-md border border-slate-200 bg-white text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100',
                                    )}
                                >
                                    {message.content}
                                </div>
                                {message.citations?.length ? (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {message.citations.map((citation) => (
                                            <span
                                                key={citation.id}
                                                className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-100"
                                            >
                                                {citation.label}
                                            </span>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        ))}
                    </div>

                    <div className="mt-4 rounded-[24px] border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <textarea
                            value={chatInput}
                            onChange={(event) => setChatInput(event.target.value)}
                            placeholder="输入一个关于摘要、引文或参考文献规范的问题..."
                            rows={4}
                            disabled={reviewState === 'running'}
                            className="w-full resize-none border-none bg-transparent px-2 py-2 text-sm leading-6 text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
                        />
                        <div className="flex items-center justify-between border-t border-slate-100 px-2 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                            <span>回复将自动附带规范引用角标</span>
                            <button
                                type="button"
                                onClick={handleSend}
                                disabled={!chatInput.trim() || reviewState === 'running'}
                                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-2 text-sm font-medium text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                <SendHorizonal className="h-4 w-4" />
                                发送
                            </button>
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    );
}
