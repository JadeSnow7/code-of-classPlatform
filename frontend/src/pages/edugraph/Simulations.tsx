import React, { useMemo, useState } from 'react';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'motion/react';
import { FlaskConical, Plus, RotateCcw, X, FileText, Brain, BarChart2, Eye, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState, SectionSkeleton } from '@/components/edugraph/SkeletonLoader';
import { simApi, type JobStatus, type SimulationJob } from '@/api/sim';

type TrackedJob = {
    id: string;
    type: string;
    label: string;
};

const STATUS_CONFIG: Record<JobStatus, { label: string; dot: string; badge: string; Icon: React.FC<{ className?: string }> }> = {
    queued: { label: '排队中', dot: 'bg-amber-400', badge: 'bg-amber-50 text-amber-700 border-amber-200', Icon: Clock },
    running: { label: '运行中', dot: 'bg-blue-500', badge: 'bg-blue-50 text-blue-700 border-blue-200', Icon: RotateCcw },
    succeeded: { label: '已完成', dot: 'bg-green-500', badge: 'bg-green-50 text-green-700 border-green-200', Icon: CheckCircle2 },
    failed: { label: '失败', dot: 'bg-red-500', badge: 'bg-red-50 text-red-700 border-red-200', Icon: AlertCircle },
    cancelled: { label: '已取消', dot: 'bg-slate-400', badge: 'bg-slate-50 text-slate-500 border-slate-200', Icon: X },
};

const JOB_TYPE_ICONS: Record<string, React.FC<{ className?: string }>> = {
    kg_extract: Brain,
    write_assess: FileText,
    quiz_grade: BarChart2,
};

const JobCard: React.FC<{ job: SimulationJob & TrackedJob; onRetry: () => void }> = ({ job, onRetry }) => {
    const config = STATUS_CONFIG[job.status];
    const TypeIcon = JOB_TYPE_ICONS[job.type] || FlaskConical;
    const StatusIcon = config.Icon;
    const isActive = job.status === 'queued' || job.status === 'running';

    return (
        <motion.div layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, scale: 0.97 }} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
            <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                    <TypeIcon className="w-5 h-5 text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 mb-1.5">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-tight">{job.label}</p>
                        <span className={cn('flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border flex-shrink-0', config.badge)}>
                            <StatusIcon className={cn('w-3 h-3', job.status === 'running' && 'animate-spin')} />
                            {config.label}
                        </span>
                    </div>

                    <div className="flex items-center gap-3 text-[10px] text-slate-400 mb-3">
                        <span className={cn('w-1.5 h-1.5 rounded-full', config.dot, isActive && 'animate-pulse')} />
                        {job.progress}% 完成
                    </div>

                    <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mb-3">
                        <div className={cn('h-full rounded-full transition-all', job.status === 'failed' ? 'bg-red-400' : 'bg-blue-500')} style={{ width: `${job.progress}%` }} />
                    </div>

                    {job.error && (
                        <div className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg mb-3">
                            {job.error.message}
                        </div>
                    )}

                    <div className="flex gap-2">
                        {job.status === 'succeeded' && (
                            <button className="flex items-center gap-1 text-xs text-blue-600 bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors">
                                <Eye className="w-3 h-3" /> 查看结果
                            </button>
                        )}
                        {(job.status === 'failed' || job.status === 'cancelled') && (
                            <button onClick={onRetry} className="flex items-center gap-1 text-xs text-white bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded-lg transition-colors">
                                <RotateCcw className="w-3 h-3" /> 重试
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

export const Simulations: React.FC = () => {
    const [trackedJobs, setTrackedJobs] = useState<TrackedJob[]>([]);
    const queryClient = useQueryClient();

    const createMutation = useMutation({
        mutationFn: async (payload: { type: string; label: string }) => {
            const created = await simApi.createSimulation({
                type: payload.type,
                gridResolution: 'medium',
            });
            return {
                ...payload,
                jobId: created.jobId,
                status: created.status,
            };
        },
        onSuccess(created) {
            setTrackedJobs((prev) => [
                {
                    id: created.jobId,
                    type: created.type,
                    label: created.label,
                },
                ...prev,
            ]);
            queryClient.setQueryData(['simulation-job', created.jobId], {
                id: created.jobId,
                status: created.status,
                progress: 0,
                error: null,
                result: null,
                type: created.type,
                label: created.label,
            } satisfies Partial<SimulationJob>);
        },
    });

    const jobQueries = useQueries({
        queries: trackedJobs.map((job) => ({
            queryKey: ['simulation-job', job.id],
            queryFn: () => simApi.getJob(job.id),
            refetchInterval: (query: { state?: { data?: SimulationJob } }) => {
                const status = query.state?.data?.status;
                return status === 'queued' || status === 'running' || status === undefined ? 3000 : false;
            },
        })),
    });

    const jobs = useMemo(
        () => trackedJobs.map((job, index) => ({
            ...job,
            ...(jobQueries[index]?.data ?? {
                id: job.id,
                status: 'queued' as JobStatus,
                progress: 0,
                error: null,
                result: null,
            }),
        })),
        [trackedJobs, jobQueries]
    );

    const activeJobs = jobs.filter((job) => job.status === 'queued' || job.status === 'running');
    const completedJobs = jobs.filter((job) => job.status === 'succeeded' || job.status === 'failed' || job.status === 'cancelled');

    return (
        <div className="min-h-full p-4 lg:p-6 bg-slate-50 dark:bg-slate-950">
            <div className="max-w-3xl mx-auto">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                            <FlaskConical className="w-5 h-5 text-blue-500" /> 模拟任务
                        </h1>
                        <p className="text-sm text-slate-500 mt-0.5">通过 `/simulations` 发起任务，并用 `/jobs/{'{id}'}` 轮询进度。</p>
                    </div>
                    <button
                        onClick={() => void createMutation.mutateAsync({ type: 'kg_extract', label: `KG 概念提取 — ${new Date().toLocaleTimeString()}` })}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors"
                    >
                        <Plus className="w-4 h-4" /> 新建任务
                    </button>
                </div>

                <div className="grid grid-cols-4 gap-3 mb-6">
                    {[
                        { label: '运行中', value: activeJobs.filter((job) => job.status === 'running').length, color: 'text-blue-600', bg: 'bg-blue-50' },
                        { label: '排队中', value: activeJobs.filter((job) => job.status === 'queued').length, color: 'text-amber-600', bg: 'bg-amber-50' },
                        { label: '已完成', value: jobs.filter((job) => job.status === 'succeeded').length, color: 'text-green-600', bg: 'bg-green-50' },
                        { label: '失败', value: jobs.filter((job) => job.status === 'failed').length, color: 'text-red-600', bg: 'bg-red-50' },
                    ].map((stat) => (
                        <div key={stat.label} className={cn('rounded-xl p-3 text-center', stat.bg)}>
                            <p className={cn('text-2xl font-bold', stat.color)}>{stat.value}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{stat.label}</p>
                        </div>
                    ))}
                </div>

                {createMutation.isPending && <SectionSkeleton rows={1} className="mb-6" />}

                {activeJobs.length > 0 && (
                    <div className="mb-6">
                        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">进行中</h2>
                        <div className="space-y-3">
                            <AnimatePresence>
                                {activeJobs.map((job) => (
                                    <JobCard key={job.id} job={job} onRetry={() => void createMutation.mutateAsync({ type: job.type, label: `${job.label}（重试）` })} />
                                ))}
                            </AnimatePresence>
                        </div>
                    </div>
                )}

                {completedJobs.length > 0 && (
                    <div>
                        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">历史记录</h2>
                        <div className="space-y-3">
                            <AnimatePresence>
                                {completedJobs.map((job) => (
                                    <JobCard key={job.id} job={job} onRetry={() => void createMutation.mutateAsync({ type: job.type, label: `${job.label}（重试）` })} />
                                ))}
                            </AnimatePresence>
                        </div>
                    </div>
                )}

                {jobs.length === 0 && !createMutation.isPending && (
                    <EmptyState variant="jobs" title="暂无模拟任务" description="点击“新建任务”后，页面会每 3 秒轮询一次任务状态直到结束。" />
                )}
            </div>
        </div>
    );
};
