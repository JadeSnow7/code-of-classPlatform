import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, ShieldCheck, Sparkles } from 'lucide-react';
import { authApi } from '@/api/auth';
import type { InvitePreview } from '@classplatform/shared';
import type {
    ActivateRegistrationPayload,
    CurrentTask,
    FeedbackVerbosity,
    GuidanceStyle,
    LearningStylePayload,
    LocalComputeTier,
    MajorTrack,
    NetworkTier,
    OnboardingProfilePayload,
    PainPoint,
    PreferredTime,
    PrimaryPlatform,
    PriorAiTool,
    WritingStage,
} from '@/types/onboarding';

type ChoiceOption<T extends string> = {
    value: T;
    label: string;
    description: string;
};

type FormState = {
    password: string;
    confirmPassword: string;
    realName: string;
    studentId: string;
    consentPersonalization: boolean;
    analyticsOptIn: boolean;
    majorTrack: MajorTrack | '';
    currentTasks: CurrentTask[];
    primaryPlatform: PrimaryPlatform | '';
    localComputeTier: LocalComputeTier | '';
    networkTier: NetworkTier | '';
    writingStage: WritingStage | '';
    painPoints: PainPoint[];
    priorTools: PriorAiTool[];
    preferredTime: PreferredTime | '';
    guidanceStyle: GuidanceStyle | '';
    feedbackVerbosity: FeedbackVerbosity | '';
    latencyTolerance: number;
    guidedRefusalTolerance: number;
    evidenceFirstTolerance: number;
};

const majorTrackOptions: ChoiceOption<MajorTrack>[] = [
    { value: 'ic_design', label: '集成电路设计', description: '更偏芯片设计、EDA、数字/模拟方向。' },
    { value: 'microelectronics', label: '微电子学与固体电子学', description: '更偏器件、工艺、材料与微纳方向。' },
    { value: 'electronic_info', label: '电子信息', description: '更偏系统、应用、信号与交叉实践方向。' },
    { value: 'cross_discipline', label: '交叉方向或其他', description: '跨学科或暂不想按单一方向归类。' },
];

const currentTaskOptions: ChoiceOption<CurrentTask>[] = [
    { value: 'course_paper', label: '课程论文', description: '希望平台协助课程论文写作与修改。' },
    { value: 'lab_report', label: '实验或项目报告', description: '更关注实验报告、项目总结与技术说明。' },
    { value: 'english_abstract_mail', label: '英文摘要或邮件', description: '需要英文摘要、邮件或双语表达支持。' },
    { value: 'literature_review', label: '文献综述', description: '想提升文献梳理、综述结构与相关工作写作。' },
    { value: 'proposal_midterm', label: '开题/中期/组会材料', description: '需要研究汇报、开题和阶段材料支持。' },
    { value: 'thesis_chapter', label: '学位论文章节', description: '已开始推进论文正文或章节撰写。' },
    { value: 'unclear', label: '暂不明确', description: '先体验平台，之后再确定写作任务重点。' },
];

const primaryPlatformOptions: ChoiceOption<PrimaryPlatform>[] = [
    { value: 'windows', label: 'Windows', description: '台式机、轻薄本或工作站均归入这一类。' },
    { value: 'macos_apple_silicon', label: 'macOS（Apple Silicon）', description: 'M 系列芯片设备，可支持一定本地推理。' },
    { value: 'macos_intel', label: 'macOS（Intel）', description: 'Intel 芯片 Mac 设备。' },
    { value: 'linux', label: 'Linux', description: 'Ubuntu、Debian 等桌面或服务器环境。' },
    { value: 'mobile_tablet', label: '手机/平板为主', description: '更常在移动端使用平台，没有固定电脑。' },
];

const localComputeOptions: ChoiceOption<LocalComputeTier>[] = [
    { value: 'cpu_only', label: '仅 CPU / 核显', description: '优先走云端，避免高负载占用本机。' },
    { value: 'nvidia_gpu', label: 'NVIDIA 独显', description: '具备较好的本地推理潜力。' },
    { value: 'apple_silicon_local', label: 'Apple Silicon 可本地推理', description: '更适合轻量本地模型或混合路由。' },
    { value: 'unknown', label: '不确定', description: '不太清楚设备算力情况，先交给平台判断。' },
    { value: 'no_local', label: '不希望占用本地资源', description: '更偏向使用云端能力，减少设备消耗。' },
];

const networkOptions: ChoiceOption<NetworkTier>[] = [
    { value: 'stable_network', label: '校园网 / 家宽稳定', description: '在线使用基本无压力。' },
    { value: 'occasional_hotspot', label: '偶尔使用热点', description: '大多数场景在线，但偶尔网络波动。' },
    { value: 'weak_network', label: '经常弱网', description: '希望平台尽量减少强依赖网络的功能。' },
    { value: 'offline_expected', label: '希望离线也能用', description: '更看重弱网或离线可用性。' },
];

const writingStageOptions: ChoiceOption<WritingStage>[] = [
    { value: 'beginner_zero', label: '零基础', description: '还没写过正式学术论文，想先建立基本框架。' },
    { value: 'first_paper', label: '正在写第一篇', description: '处于起步阶段，需要比较细的结构和表达支持。' },
    { value: 'published_experience', label: '有投稿或发表经历', description: '已有经验，希望提高稳定性和效率。' },
    { value: 'thesis_in_progress', label: '正在推进学位论文', description: '更关注长文组织、章节衔接和持续修改。' },
];

const painPointOptions: ChoiceOption<PainPoint>[] = [
    { value: 'literature_search', label: '文献检索与筛选', description: '找不到关键文献，或难以快速判断取舍。' },
    { value: 'citation_management', label: '引用规范与文献管理', description: '引文格式、参考文献工具和规范核对最耗时。' },
    { value: 'structure_logic', label: '结构搭建与逻辑推进', description: '知道想写什么，但难把论证组织清楚。' },
    { value: 'academic_tone_rewriting', label: '学术语态与改写', description: '想把口语化表达改得更正式、更像论文。' },
    { value: 'results_discussion', label: '结果分析与讨论', description: '写结果、讨论和解释时容易发散或空泛。' },
    { value: 'english_expression', label: '中英转换与英文表达', description: '英文摘要、改写和语法准确性压力较大。' },
    { value: 'research_question', label: '研究问题 / 创新点提炼', description: '难把研究意义、问题意识和亮点说清。' },
    { value: 'other', label: '其他', description: '有其他困扰，但这次先不展开自由填写。' },
];

const priorToolOptions: ChoiceOption<PriorAiTool>[] = [
    { value: 'chatgpt', label: 'ChatGPT / GPT 系列', description: 'OpenAI 系列模型与相关产品。' },
    { value: 'kimi', label: 'Kimi', description: 'Moonshot 平台工具。' },
    { value: 'deepseek', label: 'DeepSeek', description: 'DeepSeek Chat / API 等。' },
    { value: 'wenxin', label: '文心一言', description: '百度相关大模型产品。' },
    { value: 'qwen', label: '通义千问', description: '阿里云相关大模型产品。' },
    { value: 'gemini', label: 'Gemini', description: 'Google Gemini 系列产品。' },
    { value: 'copilot', label: 'GitHub Copilot', description: '主要在代码或开发流程里使用 AI。' },
    { value: 'academic_tools', label: '专业学术工具', description: '如 Elicit、Consensus 等研究辅助工具。' },
    { value: 'other', label: '其他工具', description: '有使用过未列出的 AI 工具。' },
    { value: 'none', label: '从未使用过 AI 工具', description: '希望平台把上手门槛降到最低。' },
];

const preferredTimeOptions: ChoiceOption<PreferredTime>[] = [
    { value: 'morning', label: '上午', description: '更适合早上集中完成写作或修改。' },
    { value: 'afternoon', label: '下午', description: '下午是主要学习和写作时段。' },
    { value: 'evening', label: '晚上', description: '晚上最稳定，适合长一点的写作任务。' },
    { value: 'late_night', label: '深夜', description: '常在夜深时推进写作或查资料。' },
    { value: 'flexible', label: '无固定时段', description: '使用时间受课程和项目安排影响较大。' },
];

const guidanceStyleOptions: ChoiceOption<GuidanceStyle>[] = [
    { value: 'strict_scaffold', label: '严格拆步推进', description: '更像导师，不直接代写，强调思路训练。' },
    { value: 'options_guidance', label: '给我方向再选择', description: '指出问题并给 2-3 种修改思路。' },
    { value: 'rewrite_then_explain', label: '先给可用改写', description: '先看到可落地版本，再理解修改原因。' },
];

const feedbackVerbosityOptions: ChoiceOption<FeedbackVerbosity>[] = [
    { value: 'concise', label: '简洁', description: '只看关键结论，自己再展开。' },
    { value: 'balanced', label: '平衡', description: '常规问题简洁说，复杂问题讲透。' },
    { value: 'detailed', label: '详细', description: '希望拿到尽量完整的分析过程。' },
];

const ratingOptions = [
    { value: 1, label: '1', description: '完全不接受' },
    { value: 2, label: '2', description: '比较不接受' },
    { value: 3, label: '3', description: '中立' },
    { value: 4, label: '4', description: '比较接受' },
    { value: 5, label: '5', description: '完全接受' },
] as const;

const currentTaskLimit = 2;
const painPointLimit = 3;

const initialFormState: FormState = {
    password: '',
    confirmPassword: '',
    realName: '',
    studentId: '',
    consentPersonalization: false,
    analyticsOptIn: false,
    majorTrack: '',
    currentTasks: [],
    primaryPlatform: '',
    localComputeTier: '',
    networkTier: '',
    writingStage: '',
    painPoints: [],
    priorTools: [],
    preferredTime: '',
    guidanceStyle: '',
    feedbackVerbosity: '',
    latencyTolerance: 3,
    guidedRefusalTolerance: 3,
    evidenceFirstTolerance: 3,
};

export function ActivateRegistrationPage() {
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const token = params.get('token') ?? '';
    const [invite, setInvite] = useState<InvitePreview | null>(null);
    const [form, setForm] = useState<FormState>(initialFormState);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!token) {
            setError('缺少激活令牌');
            setLoading(false);
            return;
        }
        void authApi.getInvite(token)
            .then((data) => {
                setInvite(data);
                setForm((current) => ({
                    ...current,
                    realName: current.realName || data.name || '',
                    studentId: current.studentId || data.username || '',
                }));
                if (data.used) {
                    setError('该激活链接已使用');
                } else if (data.expired) {
                    setError('该激活链接已过期');
                }
            })
            .catch((err) => {
                setError(err instanceof Error ? err.message : '激活链接无效');
            })
            .finally(() => {
                setLoading(false);
            });
    }, [token]);

    const selectedSummary = useMemo(() => ({
        currentTasks: form.currentTasks.length,
        painPoints: form.painPoints.length,
        priorTools: form.priorTools.length,
    }), [form.currentTasks.length, form.painPoints.length, form.priorTools.length]);

    const disabled = submitting || loading || !invite || invite.used || invite.expired;

    const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
        setForm((current) => ({ ...current, [key]: value }));
    };

    const toggleMulti = <T extends CurrentTask | PainPoint | PriorAiTool>(
        key: 'currentTasks' | 'painPoints' | 'priorTools',
        value: T,
        limit?: number,
        exclusive?: T,
    ) => {
        setForm((current) => {
            const existing = current[key] as T[];
            const hasValue = existing.includes(value);
            if (hasValue) {
                return { ...current, [key]: existing.filter((item) => item !== value) };
            }

            if (exclusive && value === exclusive) {
                return { ...current, [key]: [value] };
            }
            const filtered = exclusive ? existing.filter((item) => item !== exclusive) : existing;
            if (limit && filtered.length >= limit) {
                return current;
            }
            return { ...current, [key]: [...filtered, value] };
        });
    };

    const buildPayload = (): ActivateRegistrationPayload => {
        if (!form.consentPersonalization) {
            throw new Error('请先同意平台将本表信息用于账号开通与个性化初始化。');
        }
        if (!form.realName.trim()) {
            throw new Error('请填写真实姓名。');
        }
        if (!form.studentId.trim()) {
            throw new Error('请填写学号。');
        }
        if (!form.password || !form.confirmPassword) {
            throw new Error('请完成密码设置。');
        }
        if (!form.majorTrack || !form.primaryPlatform || !form.localComputeTier || !form.networkTier || !form.writingStage) {
            throw new Error('请完成基础画像与设备环境必填项。');
        }
        if (!form.preferredTime || !form.guidanceStyle || !form.feedbackVerbosity) {
            throw new Error('请完成学习风格相关题目。');
        }
        if (form.currentTasks.length === 0) {
            throw new Error('请至少选择 1 个近期最需要帮助的写作任务。');
        }
        if (form.painPoints.length === 0) {
            throw new Error('请至少选择 1 个当前最头疼的环节。');
        }
        if (form.priorTools.length === 0) {
            throw new Error('请至少选择 1 项 AI 工具使用情况。');
        }

        const onboardingProfile: OnboardingProfilePayload = {
            major_track: form.majorTrack,
            current_tasks: form.currentTasks,
            primary_platform: form.primaryPlatform,
            local_compute_tier: form.localComputeTier,
            network_tier: form.networkTier,
            writing_stage: form.writingStage,
            pain_points: form.painPoints,
            prior_tools: form.priorTools,
        };

        const learningStyle: LearningStylePayload = {
            preferred_time: form.preferredTime,
            guidance_style: form.guidanceStyle,
            feedback_verbosity: form.feedbackVerbosity,
            latency_tolerance: form.latencyTolerance,
            guided_refusal_tolerance: form.guidedRefusalTolerance,
            evidence_first_tolerance: form.evidenceFirstTolerance,
        };

        return {
            token,
            password: form.password,
            confirm_password: form.confirmPassword,
            real_name: form.realName.trim(),
            student_id: form.studentId.trim().toUpperCase(),
            consent_personalization: form.consentPersonalization,
            analytics_opt_in: form.analyticsOptIn,
            onboarding_profile: onboardingProfile,
            learning_style: learningStyle,
        };
    };

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        if (!token) {
            setError('缺少激活令牌');
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const payload = buildPayload();
            await authApi.activateRegistration(payload);
            navigate('/courses');
        } catch (err) {
            setError(err instanceof Error ? err.message : '激活失败');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.16),_transparent_32%),linear-gradient(180deg,_#020617_0%,_#0f172a_55%,_#111827_100%)] px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-5xl">
                <div className="mb-6 rounded-[2rem] border border-slate-800/80 bg-slate-900/80 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.55)] backdrop-blur">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                        <div className="max-w-3xl">
                            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-sky-200">
                                <Sparkles className="h-3.5 w-3.5" />
                                首批内测专属
                            </div>
                            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                                AI 学术写作辅助平台 · 激活与用户建档
                            </h1>
                            <p className="mt-3 text-sm leading-6 text-slate-300 sm:text-base">
                                同一份表单完成账号开通与画像初始化。信息将按最小必要原则使用：
                                <span className="text-white">账号信息用于身份开通</span>，
                                <span className="text-white">画像信息用于个性化冷启动与去标识化群体分析</span>。
                            </p>
                            <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-300">
                                <span className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1">14 题 + 2 项同意说明</span>
                                <span className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1">预计 4 分钟</span>
                                <span className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1">非匿名采集，聚合分析去标识化</span>
                            </div>
                        </div>
                        <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-5 text-sm text-emerald-100">
                            <div className="mb-2 flex items-center gap-2 text-base font-medium">
                                <ShieldCheck className="h-5 w-5" />
                                邀请链接校验状态
                            </div>
                            {loading ? (
                                <div className="flex items-center text-emerald-100">
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    正在校验激活链接...
                                </div>
                            ) : invite ? (
                                <div className="space-y-1 text-emerald-50/90">
                                    <div>预置账号：{invite.username || '未填写'}</div>
                                    <div>预置姓名：{invite.name || '未填写'}</div>
                                    <div>角色：{invite.role}</div>
                                </div>
                            ) : (
                                <div>无法读取邀请信息</div>
                            )}
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div className="flex min-h-[320px] items-center justify-center rounded-[2rem] border border-slate-800/80 bg-slate-900/80 p-8 text-slate-200 shadow-[0_24px_80px_rgba(15,23,42,0.55)]">
                        <Loader2 className="mr-3 h-6 w-6 animate-spin" />
                        正在准备问卷...
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <SectionCard
                            eyebrow="Consent"
                            title="同意说明"
                            description="请先确认本次采集的用途边界。A 项为必选，B 项为可选。"
                        >
                            <label className="flex items-start gap-3 rounded-2xl border border-slate-700 bg-slate-950/70 p-4 text-sm text-slate-200">
                                <input
                                    type="checkbox"
                                    checked={form.consentPersonalization}
                                    onChange={(event) => setField('consentPersonalization', event.target.checked)}
                                    className="mt-1 h-4 w-4 rounded border-slate-500 bg-slate-900 text-sky-500 focus:ring-sky-500"
                                />
                                <span>
                                    <span className="font-medium text-white">同意平台将本表信息用于账号开通与个性化初始化</span>
                                    <span className="mt-1 block text-slate-400">
                                        这是完成账号激活、初始推荐和反馈风格配置的前提。
                                    </span>
                                </span>
                            </label>
                            <label className="flex items-start gap-3 rounded-2xl border border-slate-700 bg-slate-950/70 p-4 text-sm text-slate-200">
                                <input
                                    type="checkbox"
                                    checked={form.analyticsOptIn}
                                    onChange={(event) => setField('analyticsOptIn', event.target.checked)}
                                    className="mt-1 h-4 w-4 rounded border-slate-500 bg-slate-900 text-sky-500 focus:ring-sky-500"
                                />
                                <span>
                                    <span className="font-medium text-white">同意平台将去标识化结果用于首批用户群体分析与产品优化</span>
                                    <span className="mt-1 block text-slate-400">
                                        仅输出群体层级结论，不导出您的姓名和学号。
                                    </span>
                                </span>
                            </label>
                        </SectionCard>

                        <SectionCard
                            eyebrow="Account"
                            title="账号开通信息"
                            description="账号信息会与画像信息分权限存储。姓名和学号仅用于身份开通，不进入群体统计报表。"
                        >
                            <div className="grid gap-4 md:grid-cols-2">
                                <Field htmlFor="real-name" label="Q1. 真实姓名" hint="必填，将用于账号实名确认。">
                                    <input
                                        id="real-name"
                                        value={form.realName}
                                        onChange={(event) => setField('realName', event.target.value)}
                                        className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-sky-500"
                                        placeholder="请输入真实姓名"
                                        required
                                    />
                                </Field>
                                <Field htmlFor="student-id" label="Q2. 学号" hint="将作为登录账号与主键，默认读取邀请中的预置账号。">
                                    <input
                                        id="student-id"
                                        value={form.studentId}
                                        onChange={(event) => setField('studentId', event.target.value)}
                                        className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white uppercase outline-none transition focus:border-sky-500"
                                        placeholder="如 M202500123"
                                        required
                                    />
                                </Field>
                                <Field htmlFor="password" label="设置密码" hint="至少 8 位，需包含字母和数字。">
                                    <input
                                        id="password"
                                        type="password"
                                        value={form.password}
                                        onChange={(event) => setField('password', event.target.value)}
                                        className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-sky-500"
                                        placeholder="设置登录密码"
                                        required
                                    />
                                </Field>
                                <Field htmlFor="confirm-password" label="确认密码" hint="请再次输入相同密码。">
                                    <input
                                        id="confirm-password"
                                        type="password"
                                        value={form.confirmPassword}
                                        onChange={(event) => setField('confirmPassword', event.target.value)}
                                        className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-sky-500"
                                        placeholder="再次输入密码"
                                        required
                                    />
                                </Field>
                            </div>
                        </SectionCard>

                        <SectionCard
                            eyebrow="Profile"
                            title="画像初始化信息"
                            description="这部分将直接参与冷启动建模，帮助平台推断适合的反馈方式、任务优先级和端云路由倾向。"
                        >
                            <QuestionHeader title="Q3. 所属专业方向" />
                            <SingleSelectGrid
                                options={majorTrackOptions}
                                selected={form.majorTrack}
                                onSelect={(value) => setField('majorTrack', value)}
                            />

                            <QuestionHeader
                                title="Q4. 未来 1-2 个月最需要平台帮助的写作任务"
                                meta={`最多 ${currentTaskLimit} 项 · 已选 ${selectedSummary.currentTasks}/${currentTaskLimit}`}
                            />
                            <MultiSelectGrid
                                options={currentTaskOptions}
                                selected={form.currentTasks}
                                onToggle={(value) => toggleMulti('currentTasks', value, currentTaskLimit)}
                            />

                            <QuestionHeader title="Q5. 主要使用终端" />
                            <SingleSelectGrid
                                options={primaryPlatformOptions}
                                selected={form.primaryPlatform}
                                onSelect={(value) => setField('primaryPlatform', value)}
                            />

                            <QuestionHeader title="Q6. 本地算力情况" />
                            <SingleSelectGrid
                                options={localComputeOptions}
                                selected={form.localComputeTier}
                                onSelect={(value) => setField('localComputeTier', value)}
                            />

                            <QuestionHeader title="Q7. 常见网络环境" />
                            <SingleSelectGrid
                                options={networkOptions}
                                selected={form.networkTier}
                                onSelect={(value) => setField('networkTier', value)}
                            />

                            <QuestionHeader title="Q8. 学术写作阶段" />
                            <SingleSelectGrid
                                options={writingStageOptions}
                                selected={form.writingStage}
                                onSelect={(value) => setField('writingStage', value)}
                            />

                            <QuestionHeader
                                title="Q9. 当前最头疼的环节"
                                meta={`最多 ${painPointLimit} 项 · 已选 ${selectedSummary.painPoints}/${painPointLimit}`}
                            />
                            <MultiSelectGrid
                                options={painPointOptions}
                                selected={form.painPoints}
                                onToggle={(value) => toggleMulti('painPoints', value, painPointLimit)}
                            />

                            <QuestionHeader title={`Q10. 使用过的 AI 工具 · 已选 ${selectedSummary.priorTools}`} />
                            <MultiSelectGrid
                                options={priorToolOptions}
                                selected={form.priorTools}
                                onToggle={(value) => toggleMulti('priorTools', value, undefined, 'none')}
                            />

                            <QuestionHeader title="Q11. 更常在什么时段使用平台" />
                            <SingleSelectGrid
                                options={preferredTimeOptions}
                                selected={form.preferredTime}
                                onSelect={(value) => setField('preferredTime', value)}
                            />

                            <QuestionHeader title="Q12. 更希望 AI 如何带你改稿" />
                            <SingleSelectGrid
                                options={guidanceStyleOptions}
                                selected={form.guidanceStyle}
                                onSelect={(value) => setField('guidanceStyle', value)}
                            />

                            <QuestionHeader title="Q13. 希望反馈详略程度" />
                            <SingleSelectGrid
                                options={feedbackVerbosityOptions}
                                selected={form.feedbackVerbosity}
                                onSelect={(value) => setField('feedbackVerbosity', value)}
                            />

                            <QuestionHeader title="Q14. 接受度量表" meta="1 = 完全不接受，5 = 完全接受" />
                            <div className="space-y-4">
                                <MatrixRow
                                    title="允许等待 10-15 秒换取更高质量分析"
                                    value={form.latencyTolerance}
                                    onChange={(value) => setField('latencyTolerance', value)}
                                />
                                <MatrixRow
                                    title="接受 AI 拒绝直接代写而转为引导"
                                    value={form.guidedRefusalTolerance}
                                    onChange={(value) => setField('guidedRefusalTolerance', value)}
                                />
                                <MatrixRow
                                    title="接受 AI 因证据不足而要求补文献 / 上下文再回答"
                                    value={form.evidenceFirstTolerance}
                                    onChange={(value) => setField('evidenceFirstTolerance', value)}
                                />
                            </div>
                        </SectionCard>

                        <div className="rounded-[2rem] border border-slate-800/80 bg-slate-900/80 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.55)]">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                <div className="max-w-3xl">
                                    <div className="mb-2 flex items-center gap-2 text-white">
                                        <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                                        提交后将直接完成账号激活与初始建档
                                    </div>
                                    <p className="text-sm leading-6 text-slate-300">
                                        平台会基于问卷生成初始学习风格、能力画像和设备路由偏好。后续您仍可在使用过程中持续修正这些画像。
                                    </p>
                                </div>
                                <button
                                    type="submit"
                                    disabled={disabled}
                                    className="inline-flex min-w-[180px] items-center justify-center rounded-2xl bg-sky-500 px-6 py-3 text-sm font-medium text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                                >
                                    {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : '完成激活并进入平台'}
                                </button>
                            </div>
                            {error ? (
                                <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                                    {error}
                                </div>
                            ) : null}
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}

function SectionCard({
    eyebrow,
    title,
    description,
    children,
}: {
    eyebrow: string;
    title: string;
    description: string;
    children: ReactNode;
}) {
    return (
        <section className="rounded-[2rem] border border-slate-800/80 bg-slate-900/80 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.55)]">
            <div className="mb-6">
                <div className="text-xs font-medium uppercase tracking-[0.24em] text-sky-300/80">{eyebrow}</div>
                <h2 className="mt-2 text-2xl font-semibold text-white">{title}</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">{description}</p>
            </div>
            <div className="space-y-6">{children}</div>
        </section>
    );
}

function Field({
    htmlFor,
    label,
    hint,
    children,
}: {
    htmlFor?: string;
    label: string;
    hint: string;
    children: ReactNode;
}) {
    return (
        <div>
            <label htmlFor={htmlFor} className="mb-2 block text-sm font-medium text-slate-200">{label}</label>
            <div>{children}</div>
            <p className="mt-2 text-xs leading-5 text-slate-400">{hint}</p>
        </div>
    );
}

function QuestionHeader({ title, meta }: { title: string; meta?: string }) {
    return (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <h3 className="text-base font-medium text-white">{title}</h3>
            {meta ? <div className="text-xs text-slate-400">{meta}</div> : null}
        </div>
    );
}

function SingleSelectGrid<T extends string>({
    options,
    selected,
    onSelect,
}: {
    options: ChoiceOption<T>[];
    selected: T | '';
    onSelect: (value: T) => void;
}) {
    return (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {options.map((option) => {
                const active = selected === option.value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        onClick={() => onSelect(option.value)}
                        className={`rounded-2xl border p-4 text-left transition ${
                            active
                                ? 'border-sky-400 bg-sky-400/12 text-white shadow-[0_0_0_1px_rgba(56,189,248,0.2)]'
                                : 'border-slate-700 bg-slate-950/70 text-slate-200 hover:border-slate-500'
                        }`}
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <div className="font-medium">{option.label}</div>
                                <div className="mt-2 text-sm leading-6 text-slate-400">{option.description}</div>
                            </div>
                            <span
                                className={`mt-1 h-4 w-4 rounded-full border ${
                                    active ? 'border-sky-300 bg-sky-300' : 'border-slate-500'
                                }`}
                            />
                        </div>
                    </button>
                );
            })}
        </div>
    );
}

function MultiSelectGrid<T extends string>({
    options,
    selected,
    onToggle,
}: {
    options: ChoiceOption<T>[];
    selected: T[];
    onToggle: (value: T) => void;
}) {
    return (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {options.map((option) => {
                const active = selected.includes(option.value);
                return (
                    <button
                        key={option.value}
                        type="button"
                        onClick={() => onToggle(option.value)}
                        className={`rounded-2xl border p-4 text-left transition ${
                            active
                                ? 'border-emerald-400 bg-emerald-400/10 text-white shadow-[0_0_0_1px_rgba(52,211,153,0.2)]'
                                : 'border-slate-700 bg-slate-950/70 text-slate-200 hover:border-slate-500'
                        }`}
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <div className="font-medium">{option.label}</div>
                                <div className="mt-2 text-sm leading-6 text-slate-400">{option.description}</div>
                            </div>
                            <span
                                className={`mt-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-md border text-[11px] font-medium ${
                                    active
                                        ? 'border-emerald-300 bg-emerald-300 text-emerald-950'
                                        : 'border-slate-500 text-slate-400'
                                }`}
                            >
                                {active ? '✓' : '+'}
                            </span>
                        </div>
                    </button>
                );
            })}
        </div>
    );
}

function MatrixRow({
    title,
    value,
    onChange,
}: {
    title: string;
    value: number;
    onChange: (value: number) => void;
}) {
    return (
        <div className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
            <div className="mb-3 text-sm font-medium text-white">{title}</div>
            <div className="grid grid-cols-5 gap-2">
                {ratingOptions.map((option) => {
                    const active = value === option.value;
                    return (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => onChange(option.value)}
                            className={`rounded-xl border px-3 py-3 text-center transition ${
                                active
                                    ? 'border-sky-400 bg-sky-400/12 text-white'
                                    : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500'
                            }`}
                            aria-label={`${title}-${option.value}`}
                        >
                            <div className="text-sm font-semibold">{option.label}</div>
                            <div className="mt-1 text-[11px] leading-4 text-slate-400">{option.description}</div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
