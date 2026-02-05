/**
 * Student-centric API client utilities.
 *
 * Provides functions for global profiles, learning events, and writing submissions.
 */

import { api } from './api-client';
import type {
    StudentGlobalProfile,
    LearningEvent,
    WritingSubmission,
    WritingType,
    WritingFeedback,
} from '@classplatform/shared';

export type { StudentGlobalProfile, LearningEvent, WritingSubmission, WritingType, WritingFeedback };

// ============ Global Profile API ============

/**
 * Get a student's global profile (cross-course aggregated data).
 *
 * @param studentId Student identifier.
 * @returns The global profile record.
 */
export async function getGlobalProfile(studentId: number): Promise<StudentGlobalProfile> {
    return api.student.getGlobalProfile(studentId);
}

/**
 * Save or update a student's global profile.
 *
 * @param studentId Student identifier.
 * @param profile Partial profile payload to upsert.
 * @returns The updated global profile.
 */
export async function saveGlobalProfile(
    studentId: number,
    profile: Partial<StudentGlobalProfile>
): Promise<StudentGlobalProfile> {
    return api.student.saveGlobalProfile(studentId, profile);
}

// ============ Learning Timeline API ============

/**
 * Query parameters for the learning timeline endpoint.
 */
export interface LearningTimelineParams {
    /** Page index (1-based). */
    page?: number;
    /** Page size limit. */
    page_size?: number;
    /** Optional course filter. */
    course_id?: number;
}

/**
 * Paginated learning timeline response.
 */
export interface LearningTimelineResponse {
    /** Timeline items for the current page. */
    items: LearningEvent[];
    /** Total number of events available. */
    total: number;
    /** Current page index. */
    page: number;
    /** Page size used for pagination. */
    page_size: number;
}

/**
 * Get a student's learning timeline (paginated events).
 *
 * @param studentId Student identifier.
 * @param params Optional pagination and filtering parameters.
 * @returns The paginated timeline response.
 */
export async function getLearningTimeline(
    studentId: number,
    params?: LearningTimelineParams
): Promise<LearningTimelineResponse> {
    return api.student.getLearningTimeline(studentId, params);
}

/**
 * Record a learning event.
 *
 * @param event Event payload to record.
 * @returns The persisted learning event.
 */
export async function recordLearningEvent(event: {
    student_id: number;
    course_id?: number;
    event_type: string;
    payload: string;
}): Promise<LearningEvent> {
    return api.student.recordLearningEvent(event);
}

// ============ Writing Submission API ============

/**
 * Submit a writing sample for analysis.
 *
 * @param courseId Course identifier.
 * @param data Writing payload to submit.
 * @returns The created writing submission.
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
    return api.student.submitWriting(courseId, data);
}

/**
 * Get writing submissions for a course.
 *
 * @param courseId Course identifier.
 * @param writingType Optional writing type filter.
 * @returns A list of writing submissions.
 */
export async function getWritingSubmissions(
    courseId: number,
    writingType?: WritingType
): Promise<WritingSubmission[]> {
    return api.student.getWritingSubmissions(courseId, writingType);
}

/**
 * Get a single writing submission with feedback.
 *
 * @param id Submission identifier.
 * @returns The submission with feedback.
 */
export async function getWritingSubmission(id: number): Promise<WritingSubmission> {
    return api.student.getWritingSubmission(id);
}

/**
 * Get writing statistics for a course (teacher-only).
 *
 * @param courseId Course identifier.
 * @returns Aggregated writing statistics.
 */
export async function getWritingStats(courseId: number): Promise<{
    weakness_stats: Array<{ name: string; count: number }>;
    student_count: number;
}> {
    return api.student.getWritingStats(courseId);
}

/**
 * Parse feedback JSON from a writing submission.
 *
 * @param submission Submission containing feedback JSON.
 * @returns Parsed feedback or null when absent/invalid.
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
 * Get display name for a writing type.
 *
 * @param type Writing type identifier.
 * @returns The display name or the raw type string.
 */
export function getWritingTypeName(type: WritingType): string {
    return WRITING_TYPE_INFO[type]?.name || type;
}
