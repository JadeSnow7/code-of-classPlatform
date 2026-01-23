import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
    ClipboardList, Plus, Clock,
    AlertCircle, Loader2, Trophy
} from 'lucide-react';
import { quizApi, type Quiz, type QuizWithAttempt } from '@/api/quiz';
import { authStore } from '@/lib/auth-store';

export function QuizzesPage() {
    const { courseId } = useParams<{ courseId: string }>();
    const navigate = useNavigate();
    const [quizzes, setQuizzes] = useState<(Quiz | QuizWithAttempt)[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showCreate, setShowCreate] = useState(false);

    const user = authStore.getUser();
    const isTeacher = user?.role === 'admin' || user?.role === 'teacher' || user?.role === 'assistant';

    useEffect(() => {
        if (!courseId) return;
        loadQuizzes();
    }, [courseId]);

    const loadQuizzes = async () => {
        if (!courseId) return;
        setIsLoading(true);
        setError(null);
        try {
            const data = await quizApi.listByCourse(parseInt(courseId));
            setQuizzes(data);
        } catch (err: any) {
            setError(err.message || 'Failed to load quizzes');
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreate = async (title: string, description: string, timeLimit: number) => {
        if (!courseId) return;
        try {
            const quiz = await quizApi.create({
                course_id: parseInt(courseId),
                title,
                description,
                time_limit: timeLimit,
                max_attempts: 1,
            });
            setShowCreate(false);
            navigate(`/courses/${courseId}/quizzes/${quiz.ID}`);
        } catch (err: any) {
            alert('创建失败: ' + err.message);
        }
    };

    const getQuizStatus = (quiz: Quiz | QuizWithAttempt) => {
        const now = new Date();
        if (!quiz.is_published) {
            return { label: '草稿', color: 'bg-gray-500/20 text-gray-400' };
        }
        if (quiz.start_time && new Date(quiz.start_time) > now) {
            return { label: '未开始', color: 'bg-yellow-500/20 text-yellow-400' };
        }
        if (quiz.end_time && new Date(quiz.end_time) < now) {
            return { label: '已结束', color: 'bg-red-500/20 text-red-400' };
        }
        return { label: '进行中', color: 'bg-green-500/20 text-green-400' };
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center py-12">
                <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                <p className="text-gray-400">{error}</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <ClipboardList className="w-6 h-6 text-purple-400" />
                    <h1 className="text-2xl font-bold text-white">在线测验</h1>
                </div>
                {isTeacher && (
                    <button
                        onClick={() => setShowCreate(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        创建测验
                    </button>
                )}
            </div>

            {/* Quiz List */}
            {quizzes.length === 0 ? (
                <div className="text-center py-12 bg-gray-800/50 rounded-xl border border-gray-700">
                    <ClipboardList className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                    <p className="text-gray-400">暂无测验</p>
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {quizzes.map((quiz) => {
                        const status = getQuizStatus(quiz);


                        return (
                            <Link
                                key={quiz.ID}
                                to={`/courses/${courseId}/quizzes/${quiz.ID}`}
                                className="block bg-gray-800/50 border border-gray-700 rounded-xl p-5 hover:border-purple-500/50 transition-colors"
                            >
                                <div className="flex items-start justify-between mb-3">
                                    <h3 className="text-lg font-semibold text-white line-clamp-2">
                                        {quiz.title}
                                    </h3>
                                    <span className={`px-2 py-1 rounded text-xs ${status.color}`}>
                                        {status.label}
                                    </span>
                                </div>

                                <p className="text-gray-400 text-sm line-clamp-2 mb-4">
                                    {quiz.description || '暂无描述'}
                                </p>

                                <div className="flex items-center gap-4 text-sm text-gray-500">
                                    {quiz.time_limit > 0 && (
                                        <div className="flex items-center gap-1">
                                            <Clock className="w-4 h-4" />
                                            <span>{quiz.time_limit}分钟</span>
                                        </div>
                                    )}
                                    <div className="flex items-center gap-1">
                                        <Trophy className="w-4 h-4" />
                                        <span>{quiz.total_points}分</span>
                                    </div>
                                </div>

                                {/* Student: show attempt info */}
                                {'attempt_count' in quiz && (
                                    <div className="mt-3 pt-3 border-t border-gray-700 flex items-center justify-between">
                                        <span className="text-sm text-gray-400">
                                            已尝试 {quiz.attempt_count}/{quiz.max_attempts} 次
                                        </span>
                                        {quiz.best_score !== null && (
                                            <span className="text-sm text-green-400">
                                                最高分: {quiz.best_score}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </Link>
                        );
                    })}
                </div>
            )}

            {/* Create Modal */}
            {showCreate && (
                <CreateQuizModal
                    onClose={() => setShowCreate(false)}
                    onCreate={handleCreate}
                />
            )}
        </div>
    );
}

function CreateQuizModal({
    onClose,
    onCreate,
}: {
    onClose: () => void;
    onCreate: (title: string, description: string, timeLimit: number) => void;
}) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [timeLimit, setTimeLimit] = useState(30);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;
        onCreate(title, description, timeLimit);
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md">
                <h2 className="text-xl font-bold text-white mb-4">创建测验</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">标题 *</label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                            placeholder="输入测验标题"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">描述</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 h-20 resize-none"
                            placeholder="输入测验描述"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">时间限制（分钟）</label>
                        <input
                            type="number"
                            value={timeLimit}
                            onChange={(e) => setTimeLimit(parseInt(e.target.value) || 0)}
                            min="0"
                            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                            placeholder="0 = 无限制"
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
                            className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors"
                        >
                            创建
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
