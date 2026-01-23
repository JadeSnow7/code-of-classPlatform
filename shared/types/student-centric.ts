/**
 * Shared API Types for Student-Centric Platform
 * 
 * These types are shared between frontend-react and mobile applications
 * to ensure consistent data handling across platforms.
 */

// ============ Global Profile Types ============

export interface StudentGlobalProfile {
    student_id: number;
    global_competencies: Record<string, number>; // e.g., {"academic_writing": 0.7}
    total_study_hours: number;
    learning_style: Record<string, string>; // e.g., {"preferred_time": "evening"}
    updated_at?: string;
}

export interface CourseProfile {
    id: number;
    student_id: number;
    course_id: number;
    weak_points: Record<string, number>; // e.g., {"学术语气": 3}
    completed_topics: string[];
    total_sessions: number;
    total_study_minutes: number;
    last_session_at?: string;
    recommended_topics?: string[];
}

// ============ Learning Event Types ============

export type LearningEventType =
    | 'chat'
    | 'quiz_submit'
    | 'assignment_submit'
    | 'heartbeat'
    | 'writing_submit';

export interface LearningEvent {
    id: number;
    student_id: number;
    course_id?: number;
    event_type: LearningEventType;
    payload: string; // JSON string
    created_at: string;
}

export interface LearningTimelineResponse {
    data: LearningEvent[];
    total: number;
    page: number;
    page_size: number;
}

// ============ Writing Submission Types ============

export type WritingType =
    | 'literature_review'
    | 'course_paper'
    | 'thesis'
    | 'abstract';

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

export interface WritingFeedback {
    overall_score: number;
    dimensions: WritingDimensionScore[];
    strengths: string[];
    improvements: string[];
    summary: string;
}

export interface WritingDimensionScore {
    name: string;
    score: number;
    weight: number;
    comment: string;
}

// ============ API Request Types ============

export interface SubmitWritingRequest {
    title: string;
    content: string;
    writing_type: WritingType;
    assignment_id?: number;
}

export interface RecordLearningEventRequest {
    student_id: number;
    course_id?: number;
    event_type: LearningEventType;
    payload: string;
}

export interface SaveGlobalProfileRequest {
    global_competencies: string; // JSON string
    total_study_hours: number;
    learning_style: string; // JSON string
}

// ============ API Response Types ============

export interface ApiResponse<T> {
    data: T;
    message?: string;
}

export interface PaginatedResponse<T> {
    data: T[];
    total: number;
    page: number;
    page_size: number;
}

// ============ Writing Type Information ============

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

// ============ Writing Dimensions ============

export const WRITING_DIMENSIONS = [
    '学术语气',
    '被动语态',
    '段落结构',
    '逻辑连接',
    '论点展开',
    '引用规范',
    '文献综合',
    '批判性思维',
    '研究问题',
    '证据支持',
    '语法准确性',
    '词汇丰富度',
] as const;

export type WritingDimension = typeof WRITING_DIMENSIONS[number];
