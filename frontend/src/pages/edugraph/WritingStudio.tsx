import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
    FileText, BarChart2, GitMerge, BookOpen,
    Sparkles, RotateCcw, Clock, CheckCircle2, History
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { KnowledgeNodePill } from '@/components/edugraph/KnowledgeNodePill';
import { EmptyState, SectionSkeleton } from '@/components/edugraph/SkeletonLoader';
import { writingApi, type WritingFeedbackDimension, type WritingType } from '@/api/writing';

const DEFAULT_COURSE_ID = 1;

const WRITING_TYPES: Array<{ key: WritingType; label: string; icon: typeof FileText; color: string }> = [
    { key: 'course_paper', label: '课程论文', icon: FileText, color: 'from-blue-500 to-blue-600' },
    { key: 'literature_review', label: '文献综述', icon: BookOpen, color: 'from-purple-500 to-purple-600' },
    { key: 'thesis', label: '毕业论文', icon: BarChart2, color: 'from-emerald-500 to-emerald-600' },
    { key: 'abstract', label: '摘要', icon: GitMerge, color: 'from-amber-500 to-amber-600' },
];

const DETECTED_CONCEPTS = ['向量空间', '基变换', '线性映射', '矩阵'];

const AIFeedbackPanel: React.FC<{
    loading: boolean;
    score: number;
    dimensions: WritingFeedbackDimension[];
    summary: string;
    onAnalyze: () => void;
    hasContent: boolean;
}> = ({ loading, score, dimensions, summary, onAnalyze, hasContent }) => {
    const radarData = dimensions.map((dimension) => ({
        subject: dimension.label,
        score: dimension.score,
        fullMark: 100,
    }));

    return (
        <aside className="w-full lg:w-[360px] xl:w-[400px] flex-shrink-0 flex flex-col bg-slate-50 dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">AI 评分分析</h3>
                    {score > 0 && (
                        <span className={cn(
                            'text-3xl font-bold',
                            score >= 85 ? 'text-emerald-500' : score >= 70 ? 'text-blue-500' : 'text-amber-500'
                        )}>
                            {score}
                        </span>
                    )}
                </div>

                <button
                    onClick={onAnalyze}
                    disabled={loading || !hasContent}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm font-semibold rounded-xl disabled:opacity-40 hover:opacity-90 transition-opacity"
                >
                    {loading ? <RotateCcw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    {loading ? '分析中...' : '获取 AI 反馈'}
                </button>
            </div>

            <div className="flex-1 overflow-y-auto">
                {loading ? (
                    <div className="p-5">
                        <SectionSkeleton rows={3} />
                    </div>
                ) : score > 0 ? (
                    <div className="p-5 space-y-5">
                        {dimensions.length > 0 && (
                            <div className="h-52">
                                <ResponsiveContainer width="100%" height="100%">
                                    <RadarChart data={radarData}>
                                        <PolarGrid stroke="#e2e8f0" />
                                        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: '#64748b' }} />
                                        <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                                        <Radar name="得分" dataKey="score" stroke="#8B5CF6" fill="#8B5CF6" fillOpacity={0.3} strokeWidth={2} />
                                        <Tooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 11 }} />
                                    </RadarChart>
                                </ResponsiveContainer>
                            </div>
                        )}

                        {summary && (
                            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4">
                                <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-1.5">综合评语</p>
                                <p className="text-xs text-blue-600 dark:text-blue-300 leading-relaxed">{summary}</p>
                            </div>
                        )}

                        {dimensions.length > 0 && (
                            <div className="space-y-3">
                                <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">维度详情</p>
                                {dimensions.map((dimension) => (
                                    <div key={dimension.key} className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-100 dark:border-slate-700">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{dimension.label}</span>
                                            <span className="text-sm font-bold text-blue-600">{dimension.score}</span>
                                        </div>
                                        <p className="text-[11px] text-slate-500 leading-relaxed">{dimension.comment}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <EmptyState
                        variant="generic"
                        title="开始写作后获取反馈"
                        description="稿件自动保存成功后，可以触发 AI 评分和修改建议。"
                        className="h-full"
                    />
                )}
            </div>
        </aside>
    );
};

export const WritingStudio: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'editor' | 'revisions'>('editor');
    const [writingType, setWritingType] = useState<WritingType>('course_paper');
    const [title, setTitle] = useState('未命名稿件');
    const [text, setText] = useState('');
    const [submissionId, setSubmissionId] = useState<string | null>(null);
    const [autoSaveStatus, setAutoSaveStatus] = useState<'saved' | 'saving' | 'idle'>('idle');
    const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const wordCount = useMemo(
        () => text.split(/\s+/).filter(Boolean).length + (text.match(/[\u4e00-\u9fa5]/g) || []).length,
        [text]
    );

    const createSubmissionMutation = useMutation({
        mutationFn: () => writingApi.createSubmission(DEFAULT_COURSE_ID, { title, writingType }),
        onSuccess(submission) {
            setSubmissionId(submission.id);
            setTitle(submission.title);
            setText(submission.content ?? '');
        },
    });

    const updateSubmissionMutation = useMutation({
        mutationFn: (payload: { title?: string; content?: string; wordCount?: number }) => {
            if (!submissionId) {
                throw new Error('submissionId is required');
            }
            return writingApi.updateSubmission(submissionId, payload);
        },
        onSuccess(submission) {
            setTitle(submission.title);
            setText(submission.content ?? '');
            setAutoSaveStatus('saved');
            window.setTimeout(() => setAutoSaveStatus('idle'), 1500);
        },
        onError() {
            setAutoSaveStatus('idle');
        },
    });

    const feedbackMutation = useMutation({
        mutationFn: () => {
            if (!submissionId) {
                throw new Error('submissionId is required');
            }
            return writingApi.requestAiFeedback(submissionId);
        },
    });

    const revisionsQuery = useQuery({
        queryKey: ['writing-revisions', submissionId],
        queryFn: () => writingApi.getRevisions(submissionId as string, { page: 1, pageSize: 10 }),
        enabled: activeTab === 'revisions' && !!submissionId,
    });

    useEffect(() => {
        if (!submissionId && !createSubmissionMutation.isPending) {
            void createSubmissionMutation.mutateAsync();
        }
    }, [submissionId, createSubmissionMutation.isPending]);

    useEffect(() => {
        if (!submissionId) {
            return;
        }

        if (autoSaveTimer.current) {
            clearTimeout(autoSaveTimer.current);
        }

        setAutoSaveStatus('saving');
        autoSaveTimer.current = setTimeout(() => {
            void updateSubmissionMutation.mutateAsync({
                title,
                content: text,
                wordCount,
            });
        }, 1200);

        return () => {
            if (autoSaveTimer.current) {
                clearTimeout(autoSaveTimer.current);
            }
        };
    }, [submissionId, title, text]);

    const feedback = feedbackMutation.data;
    const score = feedback?.overallScore ?? 0;
    const dimensions = feedback?.dimensions ?? [];
    const summary = feedback?.summary ?? '';

    return (
        <div className="h-full flex flex-col overflow-hidden bg-white dark:bg-slate-900">
            <div className="flex items-center gap-0 border-b border-slate-200 dark:border-slate-800 px-6 bg-white dark:bg-slate-900 flex-shrink-0">
                {[
                    { key: 'editor', label: '✍️ 写作台' },
                    { key: 'revisions', label: '🕐 修改历史' },
                ].map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key as typeof activeTab)}
                        className={cn(
                            'px-4 py-3.5 text-sm font-medium border-b-2 transition-all',
                            activeTab === tab.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
                        )}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === 'editor' && (
                <div className="flex items-center gap-3 px-6 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex-shrink-0 overflow-x-auto">
                    {WRITING_TYPES.map((writing) => (
                        <button
                            key={writing.key}
                            onClick={() => setWritingType(writing.key)}
                            className={cn(
                                'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap',
                                writingType === writing.key
                                    ? `bg-gradient-to-r ${writing.color} text-white shadow-sm`
                                    : 'bg-white dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700'
                            )}
                        >
                            <writing.icon className="w-3.5 h-3.5" />
                            {writing.label}
                        </button>
                    ))}
                    <input
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        placeholder="论文标题..."
                        className="ml-2 flex-1 min-w-[180px] px-3 py-1.5 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
            )}

            {activeTab === 'editor' && (
                <div className="flex flex-1 overflow-hidden">
                    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                        <div className="flex-1 p-6 lg:p-10 overflow-y-auto">
                            {createSubmissionMutation.isPending ? (
                                <SectionSkeleton rows={4} />
                            ) : (
                                <textarea
                                    value={text}
                                    onChange={(event) => setText(event.target.value)}
                                    placeholder="开始写作你的论文..."
                                    className="w-full h-full min-h-[400px] resize-none border-none focus:outline-none focus:ring-0 text-base leading-8 text-slate-700 dark:text-slate-200 dark:bg-slate-900 placeholder:text-slate-300 font-serif"
                                />
                            )}
                        </div>

                        <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-400 flex-shrink-0 bg-white dark:bg-slate-900">
                            <div className="flex gap-4">
                                <span>{wordCount} 字</span>
                                <span>{text.length} 字符</span>
                                <span className="flex items-center gap-1.5">
                                    检测到概念:
                                    <div className="flex gap-1">
                                        {DETECTED_CONCEPTS.slice(0, 3).map((concept) => (
                                            <KnowledgeNodePill key={concept} concept={concept} mastery="in_progress" size="sm" />
                                        ))}
                                    </div>
                                </span>
                            </div>
                            <div className={cn(
                                'flex items-center gap-1.5 transition-colors',
                                autoSaveStatus === 'saved' ? 'text-green-500' : autoSaveStatus === 'saving' ? 'text-blue-500' : 'text-slate-400'
                            )}>
                                {autoSaveStatus === 'saved' && <><CheckCircle2 className="w-3 h-3" /> 已保存</>}
                                {autoSaveStatus === 'saving' && <><RotateCcw className="w-3 h-3 animate-spin" /> 保存中...</>}
                                {autoSaveStatus === 'idle' && <><Clock className="w-3 h-3" /> 自动保存</>}
                            </div>
                        </div>
                    </div>

                    <AIFeedbackPanel
                        loading={feedbackMutation.isPending}
                        score={score}
                        dimensions={dimensions}
                        summary={summary}
                        onAnalyze={() => void feedbackMutation.mutateAsync()}
                        hasContent={text.trim().length > 50}
                    />
                </div>
            )}

            {activeTab === 'revisions' && (
                <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full">
                    <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                        <History className="w-4 h-4" /> 修改历史
                    </h3>
                    {revisionsQuery.isLoading ? (
                        <SectionSkeleton rows={3} />
                    ) : revisionsQuery.data?.items.length ? (
                        <div className="space-y-3">
                            {revisionsQuery.data.items.map((revision, index) => (
                                <div key={revision.id} className="flex items-center gap-4 p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 hover:shadow-md transition-shadow">
                                    <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-500 font-bold text-sm flex-shrink-0">
                                        v{revisionsQuery.data.items.length - index}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{revision.summary || '自动保存版本'}</p>
                                        <p className="text-xs text-slate-400 mt-0.5">{revision.createdAt}</p>
                                    </div>
                                    <div className="text-right text-xs text-slate-400">
                                        <div>{revision.wordCount} 字</div>
                                        <div className="mt-1 text-blue-600">只读快照</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <EmptyState variant="generic" title="暂无修订历史" description="自动保存完成后，历史版本会展示在这里。" />
                    )}
                </div>
            )}
        </div>
    );
};
