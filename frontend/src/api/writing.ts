import { apiClient } from '@/lib/api-client';
import type { PaginatedResponse } from '@/types/api';

export type WritingType = 'course_paper' | 'literature_review' | 'thesis' | 'abstract';

export interface WritingSubmission {
    id: string;
    title: string;
    writingType: WritingType;
    content?: string | null;
    wordCount?: number | null;
    status?: 'draft' | 'submitted' | 'reviewed';
    createdAt?: string;
    updatedAt?: string | null;
    studentId?: number | string;
    feedback?: WritingFeedback | null;
}

export interface WritingFeedbackDimension {
    key: string;
    label: string;
    score: number;
    comment: string;
    suggestions?: string[];
}

export interface WritingFeedback {
    overallScore: number;
    summary: string;
    dimensions: WritingFeedbackDimension[];
    inlineSuggestions?: Array<Record<string, unknown>>;
}

export interface Revision {
    id: string;
    createdAt: string;
    wordCount: number;
    summary?: string | null;
}

export const writingApi = {
    createSubmission(courseId: number | string, payload: { title: string; writingType: WritingType }) {
        return apiClient.post<WritingSubmission>(`/courses/${courseId}/writing-submissions`, payload);
    },
    getSubmission(id: number | string) {
        return apiClient.get<WritingSubmission>(`/writing-submissions/${id}`);
    },
    updateSubmission(id: number | string, payload: { title?: string; content?: string; wordCount?: number }) {
        return apiClient.patch<WritingSubmission>(`/writing-submissions/${id}`, payload);
    },
    requestAiFeedback(id: number | string, payload?: { targetDimensions?: string[] }) {
        return apiClient.post<WritingFeedback>(`/writing-submissions/${id}/ai-feedback`, payload ?? {});
    },
    getRevisions(id: number | string, query?: { page?: number; pageSize?: number }) {
        return apiClient.get<PaginatedResponse<Revision>>(`/writing-submissions/${id}/revisions`, {
            query,
        });
    },
};

