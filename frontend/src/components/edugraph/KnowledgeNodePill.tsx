import React from 'react';
import { cn } from '@/lib/utils';

export type MasteryLevel = 'not_started' | 'in_progress' | 'mastered' | 'recommended';

interface KnowledgeNodePillProps {
  concept: string;
  mastery?: MasteryLevel;
  masteryPercent?: number;
  onClick?: () => void;
  size?: 'sm' | 'md';
  className?: string;
}

const MASTERY_STYLES: Record<MasteryLevel, string> = {
  not_started: 'border-slate-300 text-slate-500 bg-transparent',
  in_progress: 'border-blue-400 text-blue-700 bg-blue-50',
  mastered: 'border-purple-400 text-purple-700 bg-purple-50',
  recommended: 'border-amber-400 text-amber-700 bg-amber-50',
};

const MASTERY_DOT: Record<MasteryLevel, string> = {
  not_started: 'bg-slate-300',
  in_progress: 'bg-blue-400',
  mastered: 'bg-purple-500',
  recommended: 'bg-amber-400 animate-pulse',
};

export const KnowledgeNodePill: React.FC<KnowledgeNodePillProps> = ({
  concept,
  mastery = 'not_started',
  masteryPercent,
  onClick,
  size = 'sm',
  className,
}) => {
  const isClickable = !!onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!isClickable}
      title={masteryPercent !== undefined ? `掌握度: ${masteryPercent}%` : concept}
      className={cn(
        'inline-flex items-center gap-1 border rounded-full font-medium transition-all',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs',
        MASTERY_STYLES[mastery],
        isClickable && 'hover:shadow-sm hover:-translate-y-px cursor-pointer',
        !isClickable && 'cursor-default',
        className
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', MASTERY_DOT[mastery])} />
      {concept}
    </button>
  );
};

// Mini mastery ring for graph nodes (used in detail panels)
interface MasteryRingProps {
  percent: number;
  size?: number;
  className?: string;
}

export const MasteryRing: React.FC<MasteryRingProps> = ({ percent, size = 40, className }) => {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - percent / 100);
  const color = percent >= 80 ? '#8B5CF6' : percent >= 40 ? '#60A5FA' : '#CBD5E1';

  return (
    <svg width={size} height={size} className={className}>
      <circle cx={size/2} cy={size/2} r={r} fill="transparent" stroke="#E2E8F0" strokeWidth={5} />
      <circle
        cx={size/2} cy={size/2} r={r}
        fill="transparent"
        stroke={color}
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
      />
    </svg>
  );
};
