import type { Meta, StoryObj } from '@storybook/react';
import { MemoryRouter } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { ClipboardList, Clock, Trophy } from 'lucide-react';

// Extracted QuizCard component for Storybook
export interface QuizCardProps {
    id: number;
    courseId: number;
    title: string;
    description?: string;
    timeLimit?: number;
    totalPoints: number;
    status: 'draft' | 'not_started' | 'ended' | 'in_progress';
    attemptCount?: number;
    maxAttempts?: number;
    bestScore?: number | null;
}

const statusStyles = {
    draft: { label: '草稿', color: 'bg-gray-500/20 text-gray-400' },
    not_started: { label: '未开始', color: 'bg-yellow-500/20 text-yellow-400' },
    ended: { label: '已结束', color: 'bg-red-500/20 text-red-400' },
    in_progress: { label: '进行中', color: 'bg-green-500/20 text-green-400' },
};

export function QuizCard({
    id,
    courseId,
    title,
    description,
    timeLimit,
    totalPoints,
    status,
    attemptCount,
    maxAttempts,
    bestScore,
}: QuizCardProps) {
    const statusStyle = statusStyles[status];

    return (
        <Link
            to={`/courses/${courseId}/quizzes/${id}`}
            className="block bg-gray-800/50 border border-gray-700 rounded-xl p-5 hover:border-purple-500/50 transition-colors"
        >
            <div className="flex items-start justify-between mb-3">
                <h3 className="text-lg font-semibold text-white line-clamp-2">
                    {title}
                </h3>
                <span className={`px-2 py-1 rounded text-xs ${statusStyle.color}`}>
                    {statusStyle.label}
                </span>
            </div>

            <p className="text-gray-400 text-sm line-clamp-2 mb-4">
                {description || '暂无描述'}
            </p>

            <div className="flex items-center gap-4 text-sm text-gray-500">
                {(timeLimit ?? 0) > 0 && (
                    <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        <span>{timeLimit}分钟</span>
                    </div>
                )}
                <div className="flex items-center gap-1">
                    <Trophy className="w-4 h-4" />
                    <span>{totalPoints}分</span>
                </div>
            </div>

            {attemptCount !== undefined && maxAttempts !== undefined && (
                <div className="mt-3 pt-3 border-t border-gray-700 flex items-center justify-between">
                    <span className="text-sm text-gray-400">
                        已尝试 {attemptCount}/{maxAttempts} 次
                    </span>
                    {bestScore !== null && bestScore !== undefined && (
                        <span className="text-sm text-green-400">
                            最高分: {bestScore}
                        </span>
                    )}
                </div>
            )}
        </Link>
    );
}

const meta: Meta<typeof QuizCard> = {
    title: 'Pages/Quizzes/QuizCard',
    component: QuizCard,
    decorators: [
        (Story) => (
            <MemoryRouter>
                <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-8">
                    <div className="max-w-sm">
                        <Story />
                    </div>
                </div>
            </MemoryRouter>
        ),
    ],
    args: {
        id: 1,
        courseId: 1,
        title: '电磁场期中测验',
        description: '涵盖高斯定律、安培环路定律等内容',
        timeLimit: 60,
        totalPoints: 100,
        status: 'in_progress',
    },
};

export default meta;
type Story = StoryObj<typeof QuizCard>;

export const InProgress: Story = {};

export const Draft: Story = {
    args: {
        status: 'draft',
        title: '新测验草稿',
    },
};

export const NotStarted: Story = {
    args: {
        status: 'not_started',
        title: '即将开始的测验',
    },
};

export const Ended: Story = {
    args: {
        status: 'ended',
        title: '已结束的测验',
    },
};

export const WithAttemptInfo: Story = {
    args: {
        status: 'ended',
        title: '已完成的测验',
        attemptCount: 2,
        maxAttempts: 3,
        bestScore: 85,
    },
};

export const NoTimeLimit: Story = {
    args: {
        title: '无时限测验',
        timeLimit: 0,
    },
};
