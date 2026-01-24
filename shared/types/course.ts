export type Course = {
    ID: number;
    name: string;
    code?: string;
    semester?: string;
    teacher_id: number;
    CreatedAt?: string;
    UpdatedAt?: string;
};

export type Chapter = {
    ID: number;
    course_id: number;
    title: string;
    summary?: string;
    knowledge_points?: string;
    content?: string;
    order_num?: number;
    CreatedAt?: string;
    UpdatedAt?: string;
};

export type ChapterStudentStats = {
    chapter_id: number;
    study_duration_seconds: number;
    study_duration_formatted?: string;
    assignment_stats?: Record<string, unknown>;
    quiz_stats?: Record<string, unknown>;
    resources?: Record<string, unknown>[];
    knowledge_points?: string[];
};
