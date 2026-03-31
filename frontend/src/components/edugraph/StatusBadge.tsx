import React from 'react';
import { cn } from '@/lib/utils';

export type AssignmentStatus = 'draft' | 'published' | 'closed';
export type SubmissionStatus = 'submitted' | 'grading' | 'graded' | 'returned';
export type WritingStatus = 'draft' | 'submitted' | 'reviewed';
export type QuizAttemptStatus = 'in_progress' | 'submitted';
export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type AIRunStatus = 'queued' | 'running' | 'completed' | 'failed';

const ASSIGNMENT_STATUS_CONFIG: Record<AssignmentStatus, { label: string; className: string }> = {
  draft: { label: '草稿', className: 'bg-slate-100 text-slate-500 border border-dashed border-slate-300' },
  published: { label: '已发布', className: 'bg-blue-100 text-blue-700' },
  closed: { label: '已截止', className: 'bg-slate-200 text-slate-600' },
};

const SUBMISSION_STATUS_CONFIG: Record<SubmissionStatus, { label: string; className: string }> = {
  submitted: { label: '已提交', className: 'bg-blue-100 text-blue-700' },
  grading: { label: '批改中', className: 'bg-purple-100 text-purple-700 animate-pulse' },
  graded: { label: '已批改', className: 'bg-green-100 text-green-700' },
  returned: { label: '已返回', className: 'bg-green-100 text-green-700' },
};

const WRITING_STATUS_CONFIG: Record<WritingStatus, { label: string; className: string }> = {
  draft: { label: '草稿', className: 'bg-slate-100 text-slate-500' },
  submitted: { label: '已提交', className: 'bg-blue-100 text-blue-700' },
  reviewed: { label: '已批阅', className: 'bg-green-100 text-green-700' },
};

const JOB_STATUS_CONFIG: Record<JobStatus, { label: string; className: string; dot?: string }> = {
  queued: { label: '排队中', className: 'bg-amber-100 text-amber-700', dot: 'bg-amber-400' },
  running: { label: '运行中', className: 'bg-blue-100 text-blue-700 animate-pulse', dot: 'bg-blue-500' },
  succeeded: { label: '已完成', className: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
  failed: { label: '失败', className: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
  cancelled: { label: '已取消', className: 'bg-slate-100 text-slate-500', dot: 'bg-slate-400' },
};

interface StatusBadgeProps {
  type: 'assignment' | 'submission' | 'writing' | 'job';
  status: string;
  score?: number;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ type, status, score, className }) => {
  let config: { label: string; className: string; dot?: string } | undefined;

  if (type === 'assignment') config = ASSIGNMENT_STATUS_CONFIG[status as AssignmentStatus];
  else if (type === 'submission') config = SUBMISSION_STATUS_CONFIG[status as SubmissionStatus];
  else if (type === 'writing') config = WRITING_STATUS_CONFIG[status as WritingStatus];
  else if (type === 'job') config = JOB_STATUS_CONFIG[status as JobStatus];

  if (!config) return null;

  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium',
      config.className,
      className
    )}>
      {config.dot && (
        <span className={cn('w-1.5 h-1.5 rounded-full', config.dot)} />
      )}
      {config.label}
      {score !== undefined && type === 'submission' && status === 'graded' && ` (${score}分)`}
    </span>
  );
};

interface AIStatusDotProps {
  status: AIRunStatus;
  label?: string;
}

export const AIStatusDot: React.FC<AIStatusDotProps> = ({ status, label }) => {
  const config: Record<AIRunStatus, { dot: string; text: string; pulse: boolean }> = {
    queued: { dot: 'bg-gray-400', text: '思考中...', pulse: true },
    running: { dot: 'bg-blue-500', text: '生成中...', pulse: true },
    completed: { dot: 'bg-green-500', text: '完成', pulse: false },
    failed: { dot: 'bg-red-500', text: '失败', pulse: false },
  };
  const c = config[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
      <span className={cn('w-2 h-2 rounded-full', c.dot, c.pulse && 'animate-pulse')} />
      {label || c.text}
    </span>
  );
};
