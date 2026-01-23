import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/domains/auth/useAuth';
import { ProtectedRoute } from './ProtectedRoute';

// Pages
import { LoginPage } from '@/pages/LoginPage';
import { CoursesPage } from '@/pages/CoursesPage';
import { CourseLayout } from '@/pages/CourseLayout';
import { OverviewPage } from '@/pages/OverviewPage';
import { ChatPage } from '@/pages/ChatPage';
import { SimPage } from '@/pages/SimPage';
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

export function AppRouter() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <Routes>
                    {/* Public routes */}
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/auth/wecom/callback" element={<WeComCallbackPage />} />

                    {/* Protected routes */}
                    <Route element={<ProtectedRoute />}>
                        <Route path="/courses" element={<CoursesPage />} />
                        <Route path="/profile" element={<ProfilePage />} />
                        <Route path="/courses/:courseId" element={<CourseLayout />}>
                            <Route index element={<Navigate to="overview" replace />} />
                            <Route path="overview" element={<OverviewPage />} />
                            <Route path="chat" element={<ChatPage />} />
                            <Route path="simulation" element={<SimPage />} />
                            <Route path="assignments" element={<AssignmentsPage />} />
                            <Route path="assignments/:assignmentId" element={<AssignmentDetailPage />} />
                            <Route path="resources" element={<ResourcesPage />} />
                            <Route path="quizzes" element={<QuizzesPage />} />
                            <Route path="quizzes/:quizId" element={<QuizDetailPage />} />
                            <Route path="chapters" element={<ChaptersPage />} />
                            <Route path="chapters/:chapterId" element={<ChapterContentPage />} />
                            <Route path="writing" element={<WritingPage />} />
                        </Route>
                    </Route>

                    {/* Fallback */}
                    <Route path="*" element={<Navigate to="/courses" replace />} />
                </Routes>
            </AuthProvider>
        </BrowserRouter>
    );
}
