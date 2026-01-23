import { NavLink, Outlet, Link } from 'react-router-dom';
import { CourseProvider, useCourse } from '@/domains/course/useCourse';
import {
    LayoutDashboard,
    MessageSquare,
    BookOpen, // Use BookOpen for chapters
    Atom,
    FileText,
    FolderOpen,
    ChevronLeft,
    Loader2,
    User,
    ClipboardList,
    Menu,
    PenLine,
} from 'lucide-react';
import { clsx } from 'clsx';
import { authStore } from '@/lib/auth-store';
import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const navItems = [
    { path: 'overview', label: '课程概览', icon: LayoutDashboard },
    { path: 'chapters', label: '章节学习', icon: BookOpen },
    { path: 'chat', label: 'AI 答疑', icon: MessageSquare },
    { path: 'writing', label: '写作提交', icon: PenLine },
    { path: 'simulation', label: '电磁仿真', icon: Atom },
    { path: 'assignments', label: '作业', icon: FileText },
    { path: 'quizzes', label: '测验', icon: ClipboardList },
    { path: 'resources', label: '资料', icon: FolderOpen },
];

function CourseLayoutInner() {
    const { course, isLoading } = useCourse();
    const user = authStore.getUser();
    const location = useLocation();

    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    useEffect(() => {
        setIsMobileMenuOpen(false);
    }, [location.pathname]);

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex flex-col md:flex-row">
            {/* Mobile Header */}
            <div className="md:hidden flex items-center justify-between px-4 h-16 bg-gray-900/95 border-b border-gray-700/50 sticky top-0 z-40">
                <button
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                    className="p-2 -ml-2 text-gray-400 hover:text-white"
                >
                    <Menu className="w-6 h-6" />
                </button>
                <span className="font-semibold text-white">{course?.name}</span>
                <Link to="/profile" className="p-2 -mr-2">
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                        <User className="w-4 h-4 text-white" />
                    </div>
                </Link>
            </div>

            {/* Mobile Overlay */}
            {isMobileMenuOpen && (
                <div
                    className="fixed inset-0 bg-black/60 z-40 md:hidden"
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={clsx(
                "fixed inset-y-0 left-0 z-50 w-64 bg-gray-900/95 backdrop-blur-xl border-r border-gray-700/50 flex flex-col transition-transform duration-300 md:translate-x-0 md:static md:bg-gray-900/80",
                isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
            )}>
                {/* Back link + Profile */}
                <div className="flex items-center justify-between px-4 h-16 border-b border-gray-700/50">
                    <Link
                        to="/courses"
                        className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
                    >
                        <ChevronLeft className="w-5 h-5" />
                        <span>返回</span>
                    </Link>
                    <Link
                        to="/profile"
                        className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-gray-800 transition-colors"
                        title="个人中心"
                    >
                        <span className="text-sm text-gray-400 hidden sm:inline">{user?.name}</span>
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                            <User className="w-4 h-4 text-white" />
                        </div>
                    </Link>
                </div>

                {/* Course title */}
                <div className="px-4 py-4 border-b border-gray-700/50">
                    <h2 className="text-lg font-semibold text-white truncate">
                        {course?.name || '课程'}
                    </h2>
                    <p className="text-sm text-gray-500 truncate">Teacher ID: {course?.teacher_id}</p>
                </div>

                {/* Navigation */}
                <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            className={({ isActive }) =>
                                clsx(
                                    'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all',
                                    isActive
                                        ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                                        : 'text-gray-400 hover:text-white hover:bg-gray-800'
                                )
                            }
                            onClick={() => setIsMobileMenuOpen(false)}
                        >
                            <item.icon className="w-5 h-5" />
                            {item.label}
                        </NavLink>
                    ))}
                </nav>
            </aside>

            {/* Main content */}
            <main className="flex-1 overflow-auto h-[calc(100vh-64px)] md:h-screen">
                <Outlet />
            </main>
        </div>
    );
}

export function CourseLayout() {
    return (
        <CourseProvider>
            <CourseLayoutInner />
        </CourseProvider>
    );
}
