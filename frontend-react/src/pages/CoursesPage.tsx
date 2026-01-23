import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { courseApi, type Course } from '@/api/course';
import { useAuth } from '@/domains/auth/useAuth';
import { BookOpen, LogOut, Loader2, Plus, X, User } from 'lucide-react';

export function CoursesPage() {
    const { user, logout } = useAuth();
    const [courses, setCourses] = useState<Course[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);

    const canCreate = user?.role === 'admin' || user?.role === 'teacher';

    useEffect(() => {
        loadCourses();
    }, []);

    const loadCourses = async () => {
        setIsLoading(true);
        try {
            const data = await courseApi.list();
            setCourses(data);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateCourse = async (name: string, code: string, semester: string) => {
        try {
            await courseApi.create({ name, code, semester });
            setShowCreateModal(false);
            loadCourses();
        } catch (err: any) {
            alert('创建失败: ' + err.message);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
            {/* Header */}
            <header className="border-b border-gray-700/50 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-10">
                <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center">
                            <BookOpen className="w-5 h-5 text-blue-400" />
                        </div>
                        <span className="text-xl font-semibold text-white">我的课程</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <Link
                            to="/profile"
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
                        >
                            <User className="w-4 h-4" />
                            <span className="hidden sm:inline">{user?.name} ({user?.role})</span>
                        </Link>
                        <button
                            onClick={logout}
                            className="p-2 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                            title="退出登录"
                        >
                            <LogOut className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </header>

            {/* Content */}
            <main className="max-w-6xl mx-auto px-4 py-8">
                {/* Create Button */}
                {canCreate && (
                    <div className="mb-6">
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
                        >
                            <Plus className="w-5 h-5" />
                            创建课程
                        </button>
                    </div>
                )}

                {isLoading ? (
                    <div className="flex items-center justify-center h-64">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    </div>
                ) : courses.length === 0 ? (
                    <div className="text-center py-16">
                        <BookOpen className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                        <h3 className="text-xl font-semibold text-gray-400 mb-2">暂无课程</h3>
                        <p className="text-gray-500">
                            {canCreate ? '点击上方按钮创建第一个课程' : '等待教师添加课程'}
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {courses.map((course) => (
                            <Link
                                key={course.ID}
                                to={`/courses/${course.ID}`}
                                className="group block bg-gray-800/50 border border-gray-700 rounded-2xl p-6 hover:border-blue-500/50 hover:bg-gray-800 transition-all duration-300"
                            >
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                    <BookOpen className="w-6 h-6 text-white" />
                                </div>
                                <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-blue-400 transition-colors">
                                    {course.name}
                                </h3>
                                <div className="flex items-center gap-2 text-gray-500 text-sm">
                                    {course.code && <span className="px-2 py-0.5 bg-gray-700 rounded">{course.code}</span>}
                                    {course.semester && <span>{course.semester}</span>}
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </main>

            {/* Create Modal */}
            {showCreateModal && (
                <CreateCourseModal
                    onClose={() => setShowCreateModal(false)}
                    onCreate={handleCreateCourse}
                />
            )}
        </div>
    );
}

function CreateCourseModal({
    onClose,
    onCreate,
}: {
    onClose: () => void;
    onCreate: (name: string, code: string, semester: string) => void;
}) {
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [semester, setSemester] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

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
