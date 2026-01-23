import { useState, useEffect } from 'react';
import {
    User, Shield, BookOpen, LogOut, Loader2, Clock, Trophy,
    FileText, ClipboardCheck, Plus, AlertCircle, ChevronRight
} from 'lucide-react';
import { authStore, type User as UserType } from '@/lib/auth-store';
import { useNavigate, Link } from 'react-router-dom';
import { userApi, type StudentStats, type TeacherStats, type Activity, type PendingItem } from '@/api/user';

export function ProfilePage() {
    const navigate = useNavigate();
    const [user, setUser] = useState<UserType | null>(null);
    const [stats, setStats] = useState<StudentStats | TeacherStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const isStudent = user?.role === 'student';

    useEffect(() => {
        const currentUser = authStore.getUser();
        setUser(currentUser);
        loadStats();
    }, []);

    const loadStats = async () => {
        try {
            const data = await userApi.getStats();
            setStats(data);
        } catch (err: any) {
            setError(err.message || '加载统计数据失败');
        } finally {
            setIsLoading(false);
        }
    };

    const handleLogout = () => {
        authStore.clearToken();
        navigate('/login');
    };

    if (!user) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    const roleLabels: Record<string, string> = {
        admin: '管理员',
        teacher: '教师',
        assistant: '助教',
        student: '学生',
    };

    const studentStats = stats as StudentStats;
    const teacherStats = stats as TeacherStats;

    return (
        <div className="min-h-screen bg-gray-950 p-6">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                            <User className="w-10 h-10 text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-white">{user.name}</h1>
                            <span className="inline-block mt-1 px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-sm">
                                {roleLabels[user.role] || user.role}
                            </span>
                        </div>
                    </div>
                    {!isStudent && (
                        <div className="flex gap-2">
                            <Link
                                to="/courses"
                                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg flex items-center gap-2 text-sm"
                            >
                                <Plus className="w-4 h-4" />
                                创建课程
                            </Link>
                        </div>
                    )}
                </div>

                {/* Stats Grid */}
                {isLoading ? (
                    <div className="flex items-center justify-center h-32">
                        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                    </div>
                ) : error ? (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6 flex items-center gap-3 text-red-400">
                        <AlertCircle className="w-5 h-5" />
                        {error}
                    </div>
                ) : stats && (
                    <>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                            {isStudent ? (
                                <>
                                    <StatCard icon={BookOpen} label="课程数" value={studentStats.courses_count} color="blue" />
                                    <StatCard
                                        icon={FileText}
                                        label="作业完成"
                                        value={`${studentStats.assignments_submitted}/${studentStats.assignments_total}`}
                                        color="green"
                                    />
                                    <StatCard
                                        icon={Trophy}
                                        label="测验平均分"
                                        value={studentStats.quizzes_avg_score.toFixed(1)}
                                        color="yellow"
                                    />
                                    <StatCard icon={Clock} label="待办事项" value={studentStats.pending_count} color="red" />
                                </>
                            ) : (
                                <>
                                    <StatCard icon={BookOpen} label="创建课程" value={teacherStats.courses_created} color="blue" />
                                    <StatCard icon={FileText} label="发布作业" value={teacherStats.assignments_created} color="green" />
                                    <StatCard icon={ClipboardCheck} label="创建测验" value={teacherStats.quizzes_created} color="purple" />
                                    <StatCard icon={Clock} label="待批改" value={teacherStats.pending_grades} color="red" />
                                </>
                            )}
                        </div>

                        {/* Main Grid */}
                        <div className="grid md:grid-cols-2 gap-6 mb-6">
                            {/* Left Column */}
                            <div className="space-y-6">
                                {/* Account Info */}
                                <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6">
                                    <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                        <Shield className="w-5 h-5 text-blue-400" />
                                        账户信息
                                    </h2>
                                    <div className="space-y-3">
                                        <InfoRow label="用户ID" value={user.id} />
                                        <InfoRow label="用户名" value={user.name} />
                                        <InfoRow label="角色" value={roleLabels[user.role] || user.role} />
                                    </div>
                                </div>

                                {/* Learning Analysis Entry */}
                                {isStudent && (
                                    <div className="bg-gradient-to-br from-purple-900/50 to-blue-900/50 border border-purple-500/30 rounded-2xl p-6">
                                        <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                                            <Trophy className="w-5 h-5 text-yellow-400" />
                                            学习分析
                                        </h2>
                                        <p className="text-gray-400 text-sm mb-4">
                                            AI 正在根据您的章节学习时长和作业表现生成个性化分析。
                                        </p>
                                        <Link
                                            to="/courses"
                                            className="block w-full text-center py-2 bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 rounded-lg transition-colors border border-purple-500/30"
                                        >
                                            前往课程查看详情
                                        </Link>
                                    </div>
                                )}

                                {/* Pending Items (Student) or Quick Actions (Teacher) */}
                                {isStudent ? (
                                    <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6">
                                        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                            <Clock className="w-5 h-5 text-red-400" />
                                            待办事项
                                        </h2>
                                        {studentStats.pending.length === 0 ? (
                                            <p className="text-gray-500 text-center py-4">暂无待办</p>
                                        ) : (
                                            <div className="space-y-2">
                                                {studentStats.pending.map((item, i) => (
                                                    <PendingCard key={i} item={item} />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6">
                                        <h2 className="text-lg font-semibold text-white mb-4">快捷操作</h2>
                                        <div className="space-y-2">
                                            <Link
                                                to="/courses"
                                                className="flex items-center justify-between p-3 bg-gray-800/50 hover:bg-gray-800 rounded-lg transition-colors"
                                            >
                                                <span className="text-gray-300">创建新课程</span>
                                                <ChevronRight className="w-4 h-4 text-gray-500" />
                                            </Link>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Right Column - Recent Activity */}
                            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6">
                                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                    {isStudent ? (
                                        <>
                                            <Trophy className="w-5 h-5 text-yellow-400" />
                                            最近活动
                                        </>
                                    ) : (
                                        <>
                                            <FileText className="w-5 h-5 text-green-400" />
                                            最近提交
                                        </>
                                    )}
                                </h2>
                                <div className="space-y-3">
                                    {(isStudent ? studentStats.recent_activity : teacherStats.recent_submissions).length === 0 ? (
                                        <p className="text-gray-500 text-center py-4">暂无记录</p>
                                    ) : (
                                        (isStudent ? studentStats.recent_activity : teacherStats.recent_submissions).map((activity, i) => (
                                            <ActivityCard key={i} activity={activity} showScore={isStudent} />
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {/* Actions */}
                <div className="space-y-3">
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center justify-center gap-2 py-3 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 rounded-xl transition-colors"
                    >
                        <LogOut className="w-5 h-5" />
                        退出登录
                    </button>
                </div>

                {/* Footer */}
                <p className="text-center text-gray-600 text-sm mt-8">
                    电磁场教学平台 v1.0
                </p>
            </div>
        </div>
    );
}

function StatCard({
    icon: Icon,
    label,
    value,
    color
}: {
    icon: React.ElementType;
    label: string;
    value: string | number;
    color: 'blue' | 'green' | 'yellow' | 'red' | 'purple';
}) {
    const colorClasses = {
        blue: 'from-blue-500/20 to-blue-600/20 border-blue-500/30 text-blue-400',
        green: 'from-green-500/20 to-green-600/20 border-green-500/30 text-green-400',
        yellow: 'from-yellow-500/20 to-yellow-600/20 border-yellow-500/30 text-yellow-400',
        red: 'from-red-500/20 to-red-600/20 border-red-500/30 text-red-400',
        purple: 'from-purple-500/20 to-purple-600/20 border-purple-500/30 text-purple-400',
    };

    return (
        <div className={`bg-gradient-to-br ${colorClasses[color]} border rounded-xl p-4`}>
            <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4" />
                <span className="text-sm text-gray-400">{label}</span>
            </div>
            <div className="text-2xl font-bold text-white">{value}</div>
        </div>
    );
}

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
            <span className="text-gray-400">{label}</span>
            <span className="text-white">{value}</span>
        </div>
    );
}

function PendingCard({ item }: { item: PendingItem }) {
    const deadline = new Date(item.deadline);
    const now = new Date();
    const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const isUrgent = daysLeft <= 1;

    return (
        <div className={`flex items-center justify-between p-3 rounded-lg ${isUrgent ? 'bg-red-500/10' : 'bg-gray-800/50'}`}>
            <div>
                <span className={`text-xs px-2 py-0.5 rounded ${item.type === 'assignment' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'}`}>
                    {item.type === 'assignment' ? '作业' : '测验'}
                </span>
                <p className="text-white mt-1">{item.title}</p>
            </div>
            <div className="text-right">
                <p className={`text-sm ${isUrgent ? 'text-red-400' : 'text-gray-400'}`}>
                    {daysLeft <= 0 ? '今天截止' : `${daysLeft}天后`}
                </p>
            </div>
        </div>
    );
}

function ActivityCard({ activity, showScore }: { activity: Activity; showScore: boolean }) {
    const date = new Date(activity.created_at);
    const timeStr = date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });

    return (
        <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
            <div className="flex-1">
                <span className={`text-xs px-2 py-0.5 rounded ${activity.type === 'assignment_submit' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                    {activity.type === 'assignment_submit' ? '作业' : '测验'}
                </span>
                <p className="text-white mt-1 truncate">{activity.title}</p>
            </div>
            <div className="text-right ml-4">
                {showScore && activity.score !== undefined && activity.max_score !== undefined && (
                    <p className="text-sm text-white">{activity.score}/{activity.max_score}</p>
                )}
                <p className="text-xs text-gray-500">{timeStr}</p>
            </div>
        </div>
    );
}
