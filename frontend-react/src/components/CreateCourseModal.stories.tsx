import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';

// Extracted CreateCourseModal component for Storybook
/**
 * Props for CreateCourseModal.
 */
export interface CreateCourseModalProps {
    /** Called when the modal should close. */
    onClose: () => void;
    /** Called when the user submits the form. */
    onCreate: (name: string, code: string, semester: string) => Promise<void>;
    /** Whether the modal is visible. */
    isOpen?: boolean;
}

/**
 * Modal dialog for creating a new course.
 *
 * @param props Component props.
 * @returns The modal UI or null when closed.
 */
export function CreateCourseModal({ onClose, onCreate, isOpen = true }: CreateCourseModalProps) {
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [semester, setSemester] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;
        setIsSubmitting(true);
        try {
            await onCreate(name, code, semester);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md mx-4">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-white">创建课程</h2>
                    <button onClick={onClose} className="p-1 text-gray-500 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">课程名称 *</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="如：电磁场理论"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">课程代码</label>
                        <input
                            type="text"
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="如：EE301"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">学期</label>
                        <input
                            type="text"
                            value={semester}
                            onChange={(e) => setSemester(e.target.value)}
                            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="如：2024春季"
                        />
                    </div>
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
                        >
                            取消
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || !name.trim()}
                            className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                        >
                            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                            创建
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

const meta: Meta<typeof CreateCourseModal> = {
    title: 'Pages/Courses/CreateCourseModal',
    component: CreateCourseModal,
    decorators: [
        (Story) => (
            <div className="min-h-screen bg-gray-900">
                <Story />
            </div>
        ),
    ],
    args: {
        onClose: () => console.log('Modal closed'),
        onCreate: async (name: string, code: string, semester: string) => {
            console.log('Creating course:', { name, code, semester });
            await new Promise((r) => setTimeout(r, 1000));
        },
        isOpen: true,
    },
};

export default meta;
type Story = StoryObj<typeof CreateCourseModal>;

export const Default: Story = {};

export const Closed: Story = {
    args: {
        isOpen: false,
    },
};
