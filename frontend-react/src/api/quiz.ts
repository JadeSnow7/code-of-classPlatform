import { apiClient } from '@/lib/api-client';

export interface Quiz {
    ID: number;
    CreatedAt: string;
    course_id: number;
    created_by_id: number;
    title: string;
    description: string;
    time_limit: number;
    start_time: string | null;
    end_time: string | null;
    max_attempts: number;
    show_answer_after_end: boolean;
    is_published: boolean;
    total_points: number;
}

export interface QuizWithAttempt extends Quiz {
    attempt_count: number;
    best_score: number | null;
}

export interface Question {
    ID: number;
    quiz_id: number;
    type: 'single_choice' | 'multiple_choice' | 'true_false' | 'fill_blank';
    content: string;
    options: string;
    match_rule: string;
    points: number;
    order_num: number;
}

export interface QuestionWithAnswer extends Question {
    answer: string;
}

export interface QuizAttempt {
    ID: number;
    quiz_id: number;
    student_id: number;
    attempt_number: number;
    started_at: string;
    deadline: string;
    submitted_at: string | null;
    answers: string;
    score: number | null;
    max_score: number;
}

export interface CreateQuizRequest {
    course_id: number;
    title: string;
    description?: string;
    time_limit?: number;
    start_time?: string;
    end_time?: string;
    max_attempts?: number;
    show_answer_after_end?: boolean;
}

export interface CreateQuestionRequest {
    type: 'single_choice' | 'multiple_choice' | 'true_false' | 'fill_blank';
    content: string;
    options?: string[];
    answer: string;
    match_rule?: string;
    points?: number;
    order_num?: number;
}

export const quizApi = {
    // List quizzes for a course
    listByCourse: async (courseId: number): Promise<Quiz[] | QuizWithAttempt[]> => {
        const response = await apiClient.get<Quiz[] | QuizWithAttempt[]>(`/courses/${courseId}/quizzes`);
        return response.data;
    },

    // Create a new quiz
    create: async (data: CreateQuizRequest): Promise<Quiz> => {
        const response = await apiClient.post<Quiz>('/quizzes', data);
        return response.data;
    },

    // Get quiz details with questions
    get: async (quizId: number): Promise<{ quiz: Quiz; questions: Question[] | QuestionWithAnswer[] }> => {
        const response = await apiClient.get<{ quiz: Quiz; questions: Question[] | QuestionWithAnswer[] }>(`/quizzes/${quizId}`);
        return response.data;
    },

    // Update quiz
    update: async (quizId: number, data: Partial<CreateQuizRequest>): Promise<Quiz> => {
        const response = await apiClient.put<Quiz>(`/quizzes/${quizId}`, data);
        return response.data;
    },

    // Delete quiz
    delete: async (quizId: number): Promise<void> => {
        await apiClient.delete(`/quizzes/${quizId}`);
    },

    // Publish quiz
    publish: async (quizId: number): Promise<Quiz> => {
        const response = await apiClient.post<Quiz>(`/quizzes/${quizId}/publish`);
        return response.data;
    },

    // Unpublish quiz
    unpublish: async (quizId: number): Promise<Quiz> => {
        const response = await apiClient.post<Quiz>(`/quizzes/${quizId}/unpublish`);
        return response.data;
    },

    // Add question
    addQuestion: async (quizId: number, data: CreateQuestionRequest): Promise<QuestionWithAnswer> => {
        const response = await apiClient.post<QuestionWithAnswer>(`/quizzes/${quizId}/questions`, data);
        return response.data;
    },

    // Update question
    updateQuestion: async (questionId: number, data: Partial<CreateQuestionRequest>): Promise<QuestionWithAnswer> => {
        const response = await apiClient.put<QuestionWithAnswer>(`/questions/${questionId}`, data);
        return response.data;
    },

    // Delete question
    deleteQuestion: async (questionId: number): Promise<void> => {
        await apiClient.delete(`/questions/${questionId}`);
    },

    // Start quiz attempt
    start: async (quizId: number): Promise<{ attempt: QuizAttempt; questions: Question[]; resumed: boolean }> => {
        const response = await apiClient.post<{ attempt: QuizAttempt; questions: Question[]; resumed: boolean }>(`/quizzes/${quizId}/start`);
        return response.data;
    },

    // Submit quiz answers
    submit: async (quizId: number, answers: Record<string, string | string[]>): Promise<{ score: number; max_score: number; attempt: QuizAttempt }> => {
        const response = await apiClient.post<{ score: number; max_score: number; attempt: QuizAttempt }>(`/quizzes/${quizId}/submit`, { answers });
        return response.data;
    },

    // Get quiz result
    getResult: async (quizId: number): Promise<{ quiz: Quiz; attempts: QuizAttempt[]; questions?: QuestionWithAnswer[] }> => {
        const response = await apiClient.get<{ quiz: Quiz; attempts: QuizAttempt[]; questions?: QuestionWithAnswer[] }>(`/quizzes/${quizId}/result`);
        return response.data;
    },
};
