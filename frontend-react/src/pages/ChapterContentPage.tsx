import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { chapterApi, type Chapter, type ChapterStudentStats } from '@/api/chapter';
import { StudyTimer } from '@/components/StudyTimer';
import { Loader2, ChevronLeft, Target, FileText, CheckSquare, ExternalLink } from 'lucide-react';
import { useAuth } from '@/domains/auth/useAuth';

export function ChapterContentPage() {
    const { chapterId } = useParams<{ chapterId: string }>();
    const { user } = useAuth();
    const [chapter, setChapter] = useState<Chapter | null>(null);
    const [stats, setStats] = useState<ChapterStudentStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (chapterId) {
            loadData();
        }
    }, [chapterId]);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [chapterData, statsData] = await Promise.all([
                chapterApi.get(chapterId!),
                chapterApi.getMyStats(chapterId!)
            ]);
            setChapter(chapterData);
            setStats(statsData);
        } catch (err: any) {
            setError(err.message || '加载失败');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDurationUpdate = (newDuration: number) => {
        // Optimistically update stats if needed
        if (stats) {
            setStats({
                ...stats,
                study_duration_seconds: newDuration
            });
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-screen bg-gray-900">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    if (error || !chapter) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white">
                <p className="text-red-400 mb-4">{error || '章节不存在'}</p>
                <Link to=".." className="text-blue-400 hover:underline">返回列表</Link>
            </div>
        );
    }

    const isStudent = user?.role === 'student';

    return (
        <div className="min-h-screen bg-gray-900 text-white p-6">
            <div className="max-w-5xl mx-auto space-y-6">
                {/* Header Navigation */}
                <div className="flex items-center justify-between">
                    <Link
                        to={`/courses/${chapter.course_id}/chapters`}
                        className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
                    >
                        <ChevronLeft className="w-5 h-5" />
                        返回章节列表
                    </Link>

                    {/* Timer for students */}
                    {isStudent && stats && (
                        <StudyTimer
                            chapterId={chapter.ID}
                            initialDuration={stats.study_duration_seconds}
                            onDurationUpdate={handleDurationUpdate}
                        />
                    )}
                </div>

                {/* Title & Summary */}
                <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-8">
                    <h1 className="text-3xl font-bold mb-4">{chapter.title}</h1>
                    <div className="prose prose-invert max-w-none">
                        <p className="text-gray-300 text-lg leading-relaxed">
                            {chapter.summary || '暂无简介'}
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left: Knowledge Points */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-6">
                            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                                <Target className="w-5 h-5 text-purple-400" />
                                知识点
                            </h2>
                            <div className="flex flex-wrap gap-3">
                                {stats?.knowledge_points?.length ? (
                                    stats.knowledge_points.map((point, i) => (
                                        <div key={i} className="px-4 py-2 bg-purple-500/10 border border-purple-500/20 rounded-lg text-purple-300">
                                            {point}
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-gray-500">本章暂无知识点标注</p>
                                )}
                            </div>
                        </div>

                        {/* Resources List (from stats) */}
                        <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-6">
                            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                                <FileText className="w-5 h-5 text-blue-400" />
                                学习资料
                            </h2>
                            <div className="space-y-3">
                                {stats?.resources?.length ? (
                                    stats.resources.map((res) => (
                                        <a
                                            key={res.ID}
                                            href={res.url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="flex items-center justify-between p-4 bg-gray-900 rounded-xl hover:bg-gray-700 transition-colors group"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400">
                                                    {res.type === 'video' ? '📺' : '📄'}
                                                </div>
                                                <div>
                                                    <h3 className="font-medium text-gray-200 group-hover:text-blue-400 transition-colors">
                                                        {res.title}
                                                    </h3>
                                                    <p className="text-sm text-gray-500">{res.type}</p>
                                                </div>
                                            </div>
                                            <ExternalLink className="w-4 h-4 text-gray-500 group-hover:text-white" />
                                        </a>
                                    ))
                                ) : (
                                    <p className="text-gray-500">暂无关联资料</p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right: Stats & Quizzes */}
                    <div className="space-y-6">
                        {/* Assignment Stats */}
                        <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-6">
                            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                <FileText className="w-5 h-5 text-green-400" />
                                作业情况
                            </h2>
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-400">已提交</span>
                                    <span className="text-white font-medium">
                                        {stats?.assignment_stats.submitted} / {stats?.assignment_stats.total}
                                    </span>
                                </div>
                                <div className="w-full bg-gray-700 rounded-full h-2">
                                    <div
                                        className="bg-green-500 h-2 rounded-full transition-all"
                                        style={{ width: `${stats?.assignment_stats.total ? (stats.assignment_stats.submitted / stats.assignment_stats.total * 100) : 0}%` }}
                                    />
                                </div>
                                <div className="flex justify-between items-center pt-2 border-t border-gray-700">
                                    <span className="text-gray-400">平均分</span>
                                    <span className="text-green-400 font-bold text-lg">
                                        {stats?.assignment_stats.avg_score.toFixed(1)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Quiz Stats */}
                        <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-6">
                            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                <CheckSquare className="w-5 h-5 text-yellow-400" />
                                测验情况
                            </h2>
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-400">已参加</span>
                                    <span className="text-white font-medium">
                                        {stats?.quiz_stats.attempted} / {stats?.quiz_stats.total}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center pt-2 border-t border-gray-700">
                                    <span className="text-gray-400">平均分</span>
                                    <span className="text-yellow-400 font-bold text-lg">
                                        {stats?.quiz_stats.avg_score.toFixed(1)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
