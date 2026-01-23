import { apiClient } from '@/lib/api-client';

// Activity represents a recent activity item
export interface Activity {
    type: 'assignment_submit' | 'quiz_submit';
    title: string;
    course_id: number;
    score?: number;
    max_score?: number;
    created_at: string;
}

// PendingItem represents a pending task
export interface PendingItem {
    type: 'assignment' | 'quiz';
    id: number;
    title: string;
    course_id: number;
    deadline: string;
}

// StudentStats represents statistics for a student
export interface StudentStats {
    courses_count: number;
    assignments_total: number;
    assignments_submitted: number;
    quizzes_taken: number;
    quizzes_avg_score: number;
    pending_count: number;
    pending: PendingItem[];
    recent_activity: Activity[];
}

// TeacherStats represents statistics for a teacher
export interface TeacherStats {
    courses_created: number;
    assignments_created: number;
    quizzes_created: number;
    pending_grades: number;
    recent_submissions: Activity[];
}

export type UserStats = StudentStats | TeacherStats;

export const userApi = {
    async getStats(): Promise<UserStats> {
        const response = await apiClient.get<UserStats>('/user/stats');
        return response.data;
    },
};
