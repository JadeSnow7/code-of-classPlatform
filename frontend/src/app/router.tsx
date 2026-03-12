import { Component, Suspense, lazy, type ErrorInfo, type ReactNode } from 'react';
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/domains/auth/useAuth';
import { ProtectedRoute } from './ProtectedRoute';
import { AppShell } from '@/layouts/AppShell';

const LoginPage = lazy(() => import('@/pages/LoginPage').then((module) => ({ default: module.LoginPage })));
const ActivateRegistrationPage = lazy(() =>
    import('@/pages/ActivateRegistrationPage').then((module) => ({ default: module.ActivateRegistrationPage })),
);
const LearningHubPage = lazy(() => import('@/pages/LearningHubPage').then((module) => ({ default: module.LearningHubPage })));
const CoursesHubPage = lazy(() => import('@/pages/CoursesHubPage').then((module) => ({ default: module.CoursesHubPage })));
const LocalAIHubPage = lazy(() => import('@/pages/LocalAIHubPage').then((module) => ({ default: module.LocalAIHubPage })));
const LocalAIDebugPage = lazy(() =>
    import('@/pages/LocalAIDebugPage').then((module) => ({ default: module.LocalAIDebugPage })),
);
const WorkspaceHubPage = lazy(() => import('@/pages/WorkspaceHubPage'));
const AISettingsPage = lazy(() => import('@/pages/AISettingsPage').then((module) => ({ default: module.AISettingsPage })));
const CourseLayout = lazy(() => import('@/pages/CourseLayout').then((module) => ({ default: module.CourseLayout })));
const OverviewPage = lazy(() => import('@/pages/OverviewPage').then((module) => ({ default: module.OverviewPage })));
const ChatPage = lazy(() => import('@/pages/ChatPage').then((module) => ({ default: module.ChatPage })));
const MultiAgentChatPage = lazy(() =>
    import('@/pages/MultiAgentChatPage').then((module) => ({ default: module.MultiAgentChatPage })),
);
const AssignmentsPage = lazy(() => import('@/pages/AssignmentsPage').then((module) => ({ default: module.AssignmentsPage })));
const AssignmentDetailPage = lazy(() =>
    import('@/pages/AssignmentDetailPage').then((module) => ({ default: module.AssignmentDetailPage })),
);
const ResourcesPage = lazy(() => import('@/pages/ResourcesPage').then((module) => ({ default: module.ResourcesPage })));
const ProfilePage = lazy(() => import('@/pages/ProfilePage').then((module) => ({ default: module.ProfilePage })));
const QuizzesPage = lazy(() => import('@/pages/QuizzesPage').then((module) => ({ default: module.QuizzesPage })));
const QuizDetailPage = lazy(() => import('@/pages/QuizDetailPage').then((module) => ({ default: module.QuizDetailPage })));
const ChaptersPage = lazy(() => import('@/pages/ChaptersPage').then((module) => ({ default: module.ChaptersPage })));
const ChapterContentPage = lazy(() =>
    import('@/pages/ChapterContentPage').then((module) => ({ default: module.ChapterContentPage })),
);
const WeComCallbackPage = lazy(() => import('@/pages/WeComCallbackPage'));
const WritingPage = lazy(() => import('@/pages/WritingPage'));
const AnnouncementsPage = lazy(() =>
    import('@/pages/AnnouncementsPage').then((module) => ({ default: module.AnnouncementsPage })),
);
const AttendancePage = lazy(() => import('@/pages/AttendancePage').then((module) => ({ default: module.AttendancePage })));
const WritingDetailPage = lazy(() => import('@/pages/WritingDetailPage'));
const TeacherWritingDashboard = lazy(() => import('@/pages/TeacherWritingDashboard'));
const WorkspacePage = lazy(() => import('@/pages/Workspace').then((module) => ({ default: module.WorkspacePage })));

interface RootErrorBoundaryProps {
    children: ReactNode;
}

interface RootErrorBoundaryState {
    hasError: boolean;
    message: string;
}

class RootErrorBoundary extends Component<RootErrorBoundaryProps, RootErrorBoundaryState> {
    state: RootErrorBoundaryState = {
        hasError: false,
        message: '',
    };

    static getDerivedStateFromError(error: unknown): RootErrorBoundaryState {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
            hasError: true,
            message,
        };
    }

    componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
        console.error('AppRouter crashed', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <main className="min-h-screen bg-slate-100 p-6">
                    <section className="mx-auto max-w-3xl rounded-xl border border-red-200 bg-white p-6 shadow-sm">
                        <h1 className="text-xl font-semibold text-red-700">页面加载失败</h1>
                        <p className="mt-2 text-sm text-slate-700">
                            React 运行时发生异常。请打开 DevTools 的 Console 面板查看完整堆栈。
                        </p>
                        <pre className="mt-4 overflow-auto rounded-lg bg-slate-900 p-4 text-xs text-red-200">
                            {this.state.message || 'Unknown error'}
                        </pre>
                    </section>
                </main>
            );
        }
        return this.props.children;
    }
}

function RouteLoadingFallback() {
    return (
        <main className="flex min-h-[40vh] items-center justify-center bg-transparent px-4 py-10">
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-200">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-blue-600 dark:bg-blue-300" />
                正在加载页面模块...
            </div>
        </main>
    );
}

function routeElement(element: ReactNode) {
    return <Suspense fallback={<RouteLoadingFallback />}>{element}</Suspense>;
}

function shouldUseHashRouter(): boolean {
    if (typeof window === 'undefined') {
        return false;
    }
    const { protocol } = window.location;
    return protocol === 'tauri:' || protocol === 'file:';
}

export function AppRouter() {
    const Router = shouldUseHashRouter() ? HashRouter : BrowserRouter;

    return (
        <RootErrorBoundary>
            <Router>
                <AuthProvider>
                    <Routes>
                        <Route path="/login" element={routeElement(<LoginPage />)} />
                        <Route path="/register/activate" element={routeElement(<ActivateRegistrationPage />)} />
                        <Route path="/auth/wecom/callback" element={routeElement(<WeComCallbackPage />)} />

                        <Route element={<ProtectedRoute />}>
                            <Route path="/" element={<AppShell />}>
                                <Route index element={<Navigate to="/learning" replace />} />
                                <Route path="learning" element={routeElement(<LearningHubPage />)} />
                                <Route path="courses" element={routeElement(<CoursesHubPage />)} />
                                <Route path="local-ai" element={routeElement(<LocalAIHubPage />)} />
                                <Route path="debug/local-ai" element={routeElement(<LocalAIDebugPage />)} />
                                <Route path="workspace" element={routeElement(<WorkspaceHubPage />)} />
                                <Route path="settings/ai" element={routeElement(<AISettingsPage />)} />
                            </Route>
                            <Route path="/profile" element={routeElement(<ProfilePage />)} />
                            <Route path="/courses/:courseId" element={routeElement(<CourseLayout />)}>
                                <Route index element={<Navigate to="overview" replace />} />
                                <Route path="detail" element={<Navigate to="../overview" replace />} />
                                <Route path="overview" element={routeElement(<OverviewPage />)} />
                                <Route path="chat" element={routeElement(<ChatPage />)} />
                                <Route path="chat/experimental" element={routeElement(<MultiAgentChatPage />)} />
                                <Route path="assignments" element={routeElement(<AssignmentsPage />)} />
                                <Route
                                    path="assignments/:assignmentId"
                                    element={routeElement(<AssignmentDetailPage />)}
                                />
                                <Route path="resources" element={routeElement(<ResourcesPage />)} />
                                <Route path="quizzes" element={routeElement(<QuizzesPage />)} />
                                <Route path="quizzes/:quizId" element={routeElement(<QuizDetailPage />)} />
                                <Route path="chapters" element={routeElement(<ChaptersPage />)} />
                                <Route path="chapters/:chapterId" element={routeElement(<ChapterContentPage />)} />
                                <Route path="attendance" element={routeElement(<AttendancePage />)} />
                                <Route path="announcements" element={routeElement(<AnnouncementsPage />)} />
                                <Route path="writing" element={routeElement(<WritingPage />)} />
                                <Route path="writing/dashboard" element={routeElement(<TeacherWritingDashboard />)} />
                                <Route path="writing/:submissionId" element={routeElement(<WritingDetailPage />)} />
                                <Route path="simulation" element={routeElement(<WorkspacePage />)} />
                            </Route>
                        </Route>

                        <Route path="*" element={<Navigate to="/learning" replace />} />
                    </Routes>
                </AuthProvider>
            </Router>
        </RootErrorBoundary>
    );
}
