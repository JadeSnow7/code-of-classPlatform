import type { Meta, StoryObj } from '@storybook/react';
import { MemoryRouter } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { Link } from 'react-router-dom';

// Extracted CourseCard component for Storybook
export interface CourseCardProps {
    id: number;
    name: string;
    code?: string;
    semester?: string;
}

export function CourseCard({ id, name, code, semester }: CourseCardProps) {
    return (
        <Link
            to={`/courses/${id}`}
            className="group block bg-gray-800/50 border border-gray-700 rounded-2xl p-6 hover:border-blue-500/50 hover:bg-gray-800 transition-all duration-300"
        >
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <BookOpen className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-blue-400 transition-colors">
                {name}
            </h3>
            <div className="flex items-center gap-2 text-gray-500 text-sm">
                {code && <span className="px-2 py-0.5 bg-gray-700 rounded">{code}</span>}
                {semester && <span>{semester}</span>}
            </div>
        </Link>
    );
}

const meta: Meta<typeof CourseCard> = {
    title: 'Pages/Courses/CourseCard',
    component: CourseCard,
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
        name: '电磁场理论',
        code: 'EE301',
        semester: '2026春季',
    },
};

export default meta;
type Story = StoryObj<typeof CourseCard>;

export const Default: Story = {};

export const WithoutCode: Story = {
    args: {
        id: 2,
        name: '高等数学',
        semester: '2026春季',
    },
};

export const WithoutSemester: Story = {
    args: {
        id: 3,
        name: '大学物理',
        code: 'PHY101',
    },
};

export const LongName: Story = {
    args: {
        id: 4,
        name: '人工智能与机器学习导论：面向电子信息类本科生',
        code: 'AI001',
        semester: '2026秋季',
    },
};

export const Minimal: Story = {
    args: {
        id: 5,
        name: '编程基础',
    },
};
