export type Quiz = {
    ID: number;
    course_id: number;
    chapter_id?: number | null;
    created_by_id: number;
    title: string;
    description?: string;
    time_limit?: number;
    start_time?: string | null;
    end_time?: string | null;
    max_attempts?: number;
    show_answer_after_end?: boolean;
    is_published?: boolean;
    total_points?: number;
    CreatedAt?: string;
    UpdatedAt?: string;
};

export type Question = {
    ID: number;
    quiz_id: number;
    type: 'single_choice' | 'multiple_choice' | 'true_false' | 'fill_blank';
    content: string;
    options?: string[];
    match_rule?: string;
    points?: number;
    order_num?: number;
};

export type QuizAttempt = {
    ID: number;
    quiz_id: number;
    student_id: number;
    attempt_number: number;
    started_at: string;
    deadline: string;
    submitted_at?: string | null;
    answers?: string;
    score?: number | null;
    max_score: number;
};

export type CreateQuizRequest = {
    course_id: number;
    title: string;
    description?: string;
    time_limit?: number;
    start_time?: string;
    end_time?: string;
    max_attempts?: number;
    show_answer_after_end?: boolean;
};

export type CreateQuestionRequest = {
    type: 'single_choice' | 'multiple_choice' | 'true_false' | 'fill_blank';
    content: string;
    options?: string[];
    answer: string;
    match_rule?: string;
    points?: number;
    order_num?: number;
};

export type SubmitQuizRequest = {
    answers: Record<string, string | string[]>;
};
