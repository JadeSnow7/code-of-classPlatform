import React from 'react';
import { cn } from '@/lib/utils';
import { BookOpen, MessageSquare, FileText, Briefcase } from 'lucide-react';

// ─── Card Skeleton ───────────────────────────────────────────────────────────
export const CardSkeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn('animate-pulse rounded-2xl border border-slate-200 p-5 space-y-3', className)}>
    <div className="h-4 bg-slate-200 rounded w-3/4" />
    <div className="h-3 bg-slate-100 rounded w-1/2" />
    <div className="h-8 bg-slate-100 rounded mt-4" />
  </div>
);

// ─── Section Skeleton ─────────────────────────────────────────────────────────
export const SectionSkeleton: React.FC<{ rows?: number; className?: string }> = ({ rows = 3, className }) => (
  <div className={cn('animate-pulse space-y-3', className)}>
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex items-center gap-4 p-4 rounded-xl border border-slate-100">
        <div className="w-10 h-10 bg-slate-200 rounded-lg flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-slate-200 rounded w-2/3" />
          <div className="h-3 bg-slate-100 rounded w-1/3" />
        </div>
        <div className="h-6 w-16 bg-slate-200 rounded-full" />
      </div>
    ))}
  </div>
);

// ─── Chat Skeleton ────────────────────────────────────────────────────────────
export const ChatSkeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn('animate-pulse space-y-4 p-6', className)}>
    {[false, true, false].map((isUser, i) => (
      <div key={i} className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
        <div className="w-8 h-8 bg-slate-200 rounded-full flex-shrink-0" />
        <div className={cn('space-y-1', isUser ? 'items-end' : 'items-start', 'flex flex-col')}>
          <div className={cn('h-12 bg-slate-200 rounded-2xl', isUser ? 'w-48 rounded-br-md' : 'w-64 rounded-bl-md')} />
          <div className={cn('h-3 bg-slate-100 rounded w-1/2', isUser ? 'self-end' : '')} />
        </div>
      </div>
    ))}
  </div>
);

// ─── Chart Skeleton ───────────────────────────────────────────────────────────
export const ChartSkeleton: React.FC<{ className?: string; type?: 'bar' | 'radar' }> = ({ className, type = 'bar' }) => (
  <div className={cn('animate-pulse flex items-end justify-center gap-2 p-4', className)}>
    {type === 'bar' ? (
      [60, 40, 75, 55, 30, 85, 45].map((h, i) => (
        <div key={i} className="flex-1 bg-slate-200 rounded-t" style={{ height: `${h}%` }} />
      ))
    ) : (
      <div className="w-full h-full flex items-center justify-center">
        <div className="w-40 h-40 rounded-full border-8 border-slate-200 border-dashed" />
      </div>
    )}
  </div>
);

// ─── Graph Skeleton ───────────────────────────────────────────────────────────
export const GraphSkeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn('animate-pulse relative overflow-hidden bg-slate-50 rounded-2xl', className)}>
    {[
      { x: 45, y: 40, size: 16 }, { x: 25, y: 60, size: 12 }, { x: 65, y: 25, size: 10 },
      { x: 70, y: 65, size: 14 }, { x: 30, y: 25, size: 8 }, { x: 55, y: 75, size: 10 },
    ].map((node, i) => (
      <div
        key={i}
        className="absolute bg-slate-200 rounded-full"
        style={{ left: `${node.x}%`, top: `${node.y}%`, width: node.size, height: node.size, transform: 'translate(-50%, -50%)' }}
      />
    ))}
    <svg className="absolute inset-0 w-full h-full" style={{ opacity: 0.3 }}>
      <line x1="45%" y1="40%" x2="25%" y2="60%" stroke="#CBD5E1" strokeWidth="1" />
      <line x1="45%" y1="40%" x2="65%" y2="25%" stroke="#CBD5E1" strokeWidth="1" />
      <line x1="45%" y1="40%" x2="70%" y2="65%" stroke="#CBD5E1" strokeWidth="1" />
    </svg>
  </div>
);

// ─── Empty State ──────────────────────────────────────────────────────────────
interface EmptyStateProps {
  variant?: 'courses' | 'submissions' | 'chat' | 'jobs' | 'generic';
  title?: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}

const EMPTY_VARIANTS: Record<string, { icon: React.FC<any>; title: string; description: string }> = {
  courses: { icon: BookOpen, title: '暂无课程', description: '当前账号下还没有可进入的课程。课程创建或加入后，这里会自动出现。' },
  submissions: { icon: FileText, title: '暂无提交', description: '还没有提交任何作业或写作，开始学习后会在这里显示。' },
  chat: { icon: MessageSquare, title: '开始对话', description: '向 AI 提问，获取基于知识图谱的个性化解答。' },
  jobs: { icon: Briefcase, title: '暂无任务', description: '还没有创建任何模拟或提取任务。' },
  generic: { icon: FileText, title: '暂无内容', description: '此处尚无数据。' },
};

export const EmptyState: React.FC<EmptyStateProps> = ({
  variant = 'generic', title, description, action, className
}) => {
  const defaults = EMPTY_VARIANTS[variant];
  const Icon = defaults.icon;

  return (
    <div className={cn('flex flex-col items-center justify-center text-center py-16 px-6', className)}>
      <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-slate-400" />
      </div>
      <h3 className="text-base font-semibold text-slate-700 mb-1">{title || defaults.title}</h3>
      <p className="text-sm text-slate-400 max-w-xs leading-relaxed">{description || defaults.description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-6 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-full hover:bg-blue-700 transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
};
