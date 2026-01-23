/**
 * Student-Centric API Client
 * 
 * API functions for global profiles, learning events, and writing submissions.
 */

import { apiClient } from './api-client';

// ============ Types ============

export interface StudentGlobalProfile {
    student_id: number;
    global_competencies: string; // JSON string
    total_study_hours: number;
    learning_style: string; // JSON string
    updated_at?: string;
}

export interface LearningEvent {
    id: number;
    student_id: number;
    course_id?: number;
    event_type: string;
    payload: string;
    created_at: string;
}

export interface WritingSubmission {
    id: number;
    student_id: number;
    course_id: number;
    assignment_id?: number;
    writing_type: WritingType;
    title: string;
    content: string;
    word_count: number;
    feedback_json?: string;
    dimension_json?: string;
    created_at: string;
    updated_at: string;
}

export type WritingType = 'literature_review' | 'course_paper' | 'thesis' | 'abstract';

export interface WritingFeedback {
    overall_score: number;
    dimensions: Array<{
        name: string;
        score: number;
        weight: number;
        comment: string;
    }>;
    strengths: string[];
    improvements: string[];
    summary: string;
}

// ============ Global Profile API ============

/**
 * Get a student's global profile (cross-course aggregated data)
 */
export async function getGlobalProfile(studentId: number): Promise<StudentGlobalProfile> {
    const response = await apiClient.get(`/students/${studentId}/global-profile`);
    return response.data;
}

/**
 * Save or update a student's global profile
 */
export async function saveGlobalProfile(
    studentId: number,
    profile: Partial<StudentGlobalProfile>
): Promise<StudentGlobalProfile> {
    const response = await apiClient.post(`/students/${studentId}/global-profile`, profile);
    return response.data;
}

// ============ Learning Timeline API ============

export interface LearningTimelineParams {
    page?: number;
    page_size?: number;
    course_id?: number;
}

export interface LearningTimelineResponse {
    data: LearningEvent[];
    total: number;
    page: number;
    page_size: number;
}

/**
 * Get a student's learning timeline (paginated events)
 */
export async function getLearningTimeline(
    studentId: number,
    params?: LearningTimelineParams
): Promise<LearningTimelineResponse> {
    const response = await apiClient.get(`/students/${studentId}/learning-timeline`, { params });
    return response.data;
}

/**
 * Record a learning event
 */
export async function recordLearningEvent(event: {
    student_id: number;
    course_id?: number;
    event_type: string;
    payload: string;
}): Promise<LearningEvent> {
    const response = await apiClient.post('/learning-events', event);
    return response.data;
}

// ============ Writing Submission API ============

/**
 * Submit a writing sample for analysis
 */
export async function submitWriting(
    courseId: number,
    data: {
        title: string;
        content: string;
        writing_type: WritingType;
        assignment_id?: number;
    }
): Promise<WritingSubmission> {
    const response = await apiClient.post(`/courses/${courseId}/writing`, data);
    return response.data;
}

/**
 * Get writing submissions for a course
 */
export async function getWritingSubmissions(
    courseId: number,
    writingType?: WritingType
): Promise<WritingSubmission[]> {
    const params = writingType ? { writing_type: writingType } : {};
    const response = await apiClient.get(`/courses/${courseId}/writing`, { params });
    return response.data;
}

/**
 * Get a single writing submission with feedback
 */
export async function getWritingSubmission(id: number): Promise<WritingSubmission> {
    const response = await apiClient.get(`/writing/${id}`);
    return response.data;
}

/**
 * Parse feedback JSON from a writing submission
 */
export function parseFeedback(submission: WritingSubmission): WritingFeedback | null {
    if (!submission.feedback_json) return null;
    try {
        return JSON.parse(submission.feedback_json);
    } catch {
        return null;
    }
}

// ============ Writing Type Utilities ============

export const WRITING_TYPE_INFO: Record<WritingType, { name: string; description: string }> = {
    literature_review: {
        name: '文献综述',
        description: '对某一研究领域现有文献的系统性回顾与分析',
    },
    course_paper: {
        name: '课程论文',
        description: '针对课程主题撰写的学术论文',
    },
    thesis: {
        name: '学位论文',
        description: '硕士或博士学位论文章节',
    },
    abstract: {
        name: '摘要',
        description: '论文或报告的摘要部分',
    },
};

/**
 * Get display name for a writing type
 */
export function getWritingTypeName(type: WritingType): string {
    return WRITING_TYPE_INFO[type]?.name || type;
}
