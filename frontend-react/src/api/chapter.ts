import { apiClient } from '@/lib/api-client';

// Resource type definition matching backend
export interface Resource {
    ID: number;
    course_id: number;
    chapter_id?: number;
    created_by_id: number;
    title: string;
    type: string; // video, paper, link
    url: string;
    description: string;
    CreatedAt: string;
}

export interface Chapter {
    ID: number;
    course_id: number;
    title: string;
    order_num: number;
    summary: string;
    knowledge_points: string; // JSON string
    CreatedAt: string;
    UpdatedAt: string;
}

export interface AssignmentStats {
    total: number;
    submitted: number;
    graded: number;
    avg_score: number;
    accuracy_rate: number;
}

export interface QuizStats {
    total: number;
    attempted: number;
    avg_score: number;
}

export interface ChapterStudentStats {
    chapter_id: number;
    study_duration_seconds: number;
    study_duration_formatted: string;
    assignment_stats: AssignmentStats;
    quiz_stats: QuizStats;
    resources: Resource[];
    knowledge_points: string[];
}

export const chapterApi = {
    // List chapters for a course
    async list(courseId: number | string): Promise<Chapter[]> {
        const response = await apiClient.get<Chapter[]>(`/courses/${courseId}/chapters`);
        return response.data;
    },

    // Get single chapter details
    async get(id: number | string): Promise<Chapter> {
        const response = await apiClient.get<Chapter>(`/chapters/${id}`);
        return response.data;
    },

    // Get student's stats for a specific chapter
    async getMyStats(id: number | string): Promise<ChapterStudentStats> {
        const response = await apiClient.get<ChapterStudentStats>(`/chapters/${id}/my-stats`);
        return response.data;
    },

    // Send heartbeat (record study time)
    // Backend adds 30s if call is within 35s of previous
    async heartbeat(id: number | string): Promise<{ message: string; duration: number }> {
        const response = await apiClient.post<{ message: string; duration: number }>(`/chapters/${id}/heartbeat`, {});
        return response.data;
    }
};
