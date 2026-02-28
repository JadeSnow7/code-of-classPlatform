import { Component, type ErrorInfo, type ReactNode } from 'react';
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/domains/auth/useAuth';
import { ProtectedRoute } from './ProtectedRoute';
import { AppShell } from '@/layouts/AppShell';

// Pages
import { LoginPage } from '@/pages/LoginPage';
import { LearningHubPage } from '@/pages/LearningHubPage';
import { CoursesHubPage } from '@/pages/CoursesHubPage';
import { LocalAIHubPage } from '@/pages/LocalAIHubPage';
import { LocalAIDebugPage } from '@/pages/LocalAIDebugPage';
import WorkspaceHubPage from '@/pages/WorkspaceHubPage';
import { AISettingsPage } from '@/pages/AISettingsPage';
import { CourseLayout } from '@/pages/CourseLayout';
import { OverviewPage } from '@/pages/OverviewPage';
import { ChatPage } from '@/pages/ChatPage';
import { AssignmentsPage } from '@/pages/AssignmentsPage';
import { AssignmentDetailPage } from '@/pages/AssignmentDetailPage';
import { ResourcesPage } from '@/pages/ResourcesPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { QuizzesPage } from '@/pages/QuizzesPage';
import { QuizDetailPage } from '@/pages/QuizDetailPage';
import { ChaptersPage } from '@/pages/ChaptersPage';
import { ChapterContentPage } from '@/pages/ChapterContentPage';
import WeComCallbackPage from '@/pages/WeComCallbackPage';
import WritingPage from '@/pages/WritingPage';
import { AnnouncementsPage } from '@/pages/AnnouncementsPage';
import { AttendancePage } from '@/pages/AttendancePage';
import WritingDetailPage from '@/pages/WritingDetailPage';
import TeacherWritingDashboard from '@/pages/TeacherWritingDashboard';
import { WorkspacePage } from '@/pages/Workspace';

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
                        {/* Public routes */}
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/auth/wecom/callback" element={<WeComCallbackPage />} />

                        {/* Protected routes */}
                        <Route element={<ProtectedRoute />}>
                            <Route path="/" element={<AppShell />}>
                                <Route index element={<Navigate to="/learning" replace />} />
                                <Route path="learning" element={<LearningHubPage />} />
                                <Route path="courses" element={<CoursesHubPage />} />
                                <Route path="local-ai" element={<LocalAIHubPage />} />
                                <Route path="debug/local-ai" element={<LocalAIDebugPage />} />
                                <Route path="workspace" element={<WorkspaceHubPage />} />
                                <Route path="settings/ai" element={<AISettingsPage />} />
                            </Route>
                            <Route path="/profile" element={<ProfilePage />} />
                            <Route path="/courses/:courseId" element={<CourseLayout />}>
                                <Route index element={<Navigate to="overview" replace />} />
                                <Route path="detail" element={<Navigate to="../overview" replace />} />
                                <Route path="overview" element={<OverviewPage />} />
                                <Route path="chat" element={<ChatPage />} />
                                <Route path="assignments" element={<AssignmentsPage />} />
                                <Route path="assignments/:assignmentId" element={<AssignmentDetailPage />} />
                                <Route path="resources" element={<ResourcesPage />} />
                                <Route path="quizzes" element={<QuizzesPage />} />
                                <Route path="quizzes/:quizId" element={<QuizDetailPage />} />
                                <Route path="chapters" element={<ChaptersPage />} />
                                <Route path="chapters/:chapterId" element={<ChapterContentPage />} />
                                <Route path="attendance" element={<AttendancePage />} />
                                <Route path="announcements" element={<AnnouncementsPage />} />
                                <Route path="writing" element={<WritingPage />} />
                                <Route path="writing/dashboard" element={<TeacherWritingDashboard />} />
                                <Route path="writing/:submissionId" element={<WritingDetailPage />} />
                                {/* Electromagnetic simulation workspace */}
                                <Route path="simulation" element={<WorkspacePage />} />
                            </Route>
                        </Route>

                        {/* Fallback */}
                        <Route path="*" element={<Navigate to="/learning" replace />} />
                    </Routes>
                </AuthProvider>
            </Router>
        </RootErrorBoundary>
    );
}
