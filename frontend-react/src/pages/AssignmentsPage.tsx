import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FileText, Plus, Calendar, User, ChevronRight, Loader2 } from 'lucide-react';
import { assignmentApi, type Assignment } from '@/api/assignment';
import { authStore } from '@/lib/auth-store';

export function AssignmentsPage() {
    const { courseId } = useParams<{ courseId: string }>();
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showCreate, setShowCreate] = useState(false);

    const user = authStore.getUser();
    const canCreate = user?.role === 'admin' || user?.role === 'teacher';

    useEffect(() => {
        if (!courseId) return;
        loadAssignments();
    }, [courseId]);

    const loadAssignments = async () => {
        if (!courseId) return;
        setIsLoading(true);
        setError(null);
        try {
            const data = await assignmentApi.listByCourse(parseInt(courseId));
            setAssignments(data);
        } catch (err: any) {
            setError(err.message || 'Failed to load assignments');
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreate = async (title: string, description: string) => {
        if (!courseId) return;
        try {
            await assignmentApi.create({
                course_id: parseInt(courseId),
                title,
                description,
            });
            setShowCreate(false);
            loadAssignments();
        } catch (err: any) {
            alert('创建失败: ' + err.message);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    return (
        <div className="p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-white">作业列表</h1>
                    <p className="text-gray-400 text-sm mt-1">
                        共 {assignments.length} 个作业
                    </p>
                </div>
                {canCreate && (
                    <button
                        onClick={() => setShowCreate(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        发布作业
                    </button>
                )}
            </div>

            {/* Error */}
            {error && (
                <div className="bg-red-500/20 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg mb-6">
                    {error}
                </div>
            )}

            {/* Empty State */}
            {assignments.length === 0 && !error && (
                <div className="text-center py-16 text-gray-500">
                    <FileText className="w-16 h-16 mx-auto mb-4 opacity-30" />
                    <p className="text-lg">暂无作业</p>
                    {canCreate && (
                        <p className="text-sm mt-2">点击上方按钮发布第一个作业</p>
                    )}
                </div>
            )}

            {/* Assignment List */}
            <div className="space-y-3">
                {assignments.map((assignment) => (
                    <Link
                        key={assignment.ID}
                        to={`/courses/${courseId}/assignments/${assignment.ID}`}
                        className="block bg-gray-800/50 border border-gray-700 rounded-xl p-5 hover:border-blue-500/50 hover:bg-gray-800 transition-all group"
                    >
                        <div className="flex items-start justify-between">
                            <div className="flex-1">
                                <h3 className="text-lg font-semibold text-white group-hover:text-blue-400 transition-colors">
                                    {assignment.title}
                                </h3>
                                <p className="text-gray-400 text-sm mt-1 line-clamp-2">
                                    {assignment.description || '暂无描述'}
                                </p>
                                <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
                                    <div className="flex items-center gap-1">
                                        <Calendar className="w-4 h-4" />
                                        <span>
                                            {assignment.deadline
                                                ? new Date(assignment.deadline).toLocaleDateString('zh-CN')
                                                : '无截止日期'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <User className="w-4 h-4" />
                                        <span>教师 #{assignment.teacher_id}</span>
                                    </div>
                                </div>
                            </div>
                            <ChevronRight className="w-5 h-5 text-gray-600 group-hover:text-blue-400 transition-colors" />
                        </div>
                    </Link>
                ))}
            </div>

            {/* Create Modal */}
            {showCreate && (
                <CreateAssignmentModal
                    onClose={() => setShowCreate(false)}
                    onCreate={handleCreate}
                />
            )}
        </div>
    );
}

function CreateAssignmentModal({
    onClose,
    onCreate,
}: {
    onClose: () => void;
    onCreate: (title: string, description: string) => void;
}) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;
        onCreate(title, description);
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md">
                <h2 className="text-xl font-bold text-white mb-4">发布新作业</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">作业标题 *</label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="输入作业标题"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">描述</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 h-24 resize-none"
                            placeholder="输入作业描述"
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
                            className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
                        >
                            发布
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

