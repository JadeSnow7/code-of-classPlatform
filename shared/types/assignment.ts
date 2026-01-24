export type Assignment = {
    ID: number;
    course_id: number;
    chapter_id?: number | null;
    teacher_id: number;
    title: string;
    description?: string;
    deadline?: string | null;
    allow_file?: boolean;
    max_file_size?: number;
    CreatedAt?: string;
    UpdatedAt?: string;
};

export type AssignmentSubmission = {
    ID: number;
    assignment_id: number;
    student_id: number;
    content?: string;
    file_url?: string | null;
    grade?: number | null;
    feedback?: string | null;
    graded_by?: number | null;
    CreatedAt?: string;
    UpdatedAt?: string;
};

export type CreateAssignmentRequest = {
    course_id: number;
    title: string;
    description?: string;
    deadline?: string;
    allow_file?: boolean;
};

export type SubmitAssignmentRequest = {
    content?: string;
    file_url?: string;
};

export type GradeSubmissionRequest = {
    grade: number;
    feedback?: string;
};
