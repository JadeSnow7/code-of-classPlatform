import { api, apiClient } from '@/lib/api-client';
import type { BaseListQuery, PaginatedResponse } from '@/types/api';

type ApiListQuery = Record<string, string | number | boolean | undefined>;

export interface QuizSummary {
    id: number;
    courseId?: number;
    chapterId?: number | null;
    createdById?: number;
    title: string;
    description?: string;
    durationMinutes?: number;
    startTime?: string | null;
    endTime?: string | null;
    maxAttempts?: number;
    showAnswerAfterEnd?: boolean;
    isPublished?: boolean;
    status?: string;
    totalPoints?: number;
    questionCount?: number;
    attemptCount?: number;
    bestScore?: number | null;
    score?: number;
    maxScore?: number;
    createdAt?: string;
    updatedAt?: string;
}

export interface QuestionOption {
    key: string;
    label: string;
}

export interface Question {
    id: number;
    quizId?: number;
    type: 'single_choice' | 'multiple_choice' | 'true_false' | 'fill_blank' | 'text';
    content: string;
    options?: QuestionOption[];
    answer?: string;
    matchRule?: string;
    points?: number;
    orderNum?: number;
}

export interface QuizDetail {
    quiz: QuizSummary;
    questions: Question[];
}

export interface QuizAttempt {
    id: number;
    quizId?: number;
    studentId?: number;
    attemptNumber?: number;
    startedAt?: string;
    deadline: string;
    submittedAt?: string | null;
    answers?: Array<{ questionId: string; answer: unknown }>;
    score?: number | null;
    maxScore?: number;
}

export interface QuizAttemptState {
    attempt: QuizAttempt;
    answers: Array<{ questionId: string; answer: unknown }>;
    elapsedTime: number;
}

export interface QuizSubmitResult {
    score: number;
    maxScore: number;
    attempt: QuizAttempt;
}

export interface CreateQuizRequest {
    courseId: number;
    title: string;
    description?: string;
    durationMinutes?: number;
    startTime?: string;
    endTime?: string;
    maxAttempts?: number;
    showAnswerAfterEnd?: boolean;
}

export interface CreateQuestionRequest {
    type: Exclude<Question['type'], 'text'>;
    content: string;
    options?: string[];
    answer: string;
    matchRule?: string;
    points?: number;
    orderNum?: number;
}

export interface LegacyQuiz {
    ID: number;
    id: number;
    title: string;
    description?: string;
    time_limit: number;
    total_points: number;
    is_published: boolean;
    status?: string;
    start_time?: string | null;
    end_time?: string | null;
    max_attempts?: number;
    attempt_count?: number;
    best_score?: number | null;
    max_score?: number;
}

export interface LegacyQuestion {
    ID: number;
    id: number;
    quiz_id?: number;
    content: string;
    points?: number;
    type: Question['type'];
    options: string;
    answer?: string;
}

export interface LegacyQuestionWithAnswer extends LegacyQuestion {
    answer: string;
}

export interface LegacyQuizAttempt {
    ID: number;
    id: number;
    deadline: string;
    submitted_at?: string | null;
    answers?: string;
    score?: number | null;
    max_score?: number;
}

export interface LegacyQuizSubmitResult {
    score: number;
    max_score: number;
    attempt: LegacyQuizAttempt;
}

export type Quiz = LegacyQuiz;
export type QuizWithAttempt = LegacyQuiz;
export type QuestionWithAnswer = LegacyQuestionWithAnswer;

export interface QuizListQuery extends Omit<BaseListQuery, 'page_size' | 'sort_by' | 'sort_order'> {
    pageSize?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    status?: string;
}

function toApiListQuery(query?: QuizListQuery): ApiListQuery | undefined {
    if (!query) {
        return undefined;
    }

    return {
        page: query.page,
        pageSize: query.pageSize,
        keyword: query.keyword,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
        status: query.status,
    };
}

function normalizeOptions(raw: unknown): QuestionOption[] | undefined {
    let source = raw;

    if (typeof source === 'string') {
        try {
            source = JSON.parse(source);
        } catch {
            source = undefined;
        }
    }

    if (!Array.isArray(source)) {
        return undefined;
    }

    return source.map((option, index) => {
        if (typeof option === 'string') {
            return {
                key: String.fromCharCode(65 + index),
                label: option,
            };
        }

        if (option && typeof option === 'object') {
            const value = option as { key?: string; label?: string; value?: string };
            return {
                key: value.key ?? String.fromCharCode(65 + index),
                label: value.label ?? value.value ?? '',
            };
        }

        return {
            key: String.fromCharCode(65 + index),
            label: String(option),
        };
    });
}

function normalizeQuizSummary(quiz: {
    ID?: number;
    id?: number;
    course_id?: number;
    courseId?: number;
    chapter_id?: number | null;
    chapterId?: number | null;
    created_by_id?: number;
    createdById?: number;
    title: string;
    description?: string;
    time_limit?: number;
    time_limit_minutes?: number;
    durationMinutes?: number;
    start_time?: string | null;
    startTime?: string | null;
    end_time?: string | null;
    endTime?: string | null;
    max_attempts?: number;
    maxAttempts?: number;
    show_answer_after_end?: boolean;
    showAnswerAfterEnd?: boolean;
    is_published?: boolean;
    isPublished?: boolean;
    status?: string;
    total_points?: number;
    totalPoints?: number;
    question_count?: number;
    questionCount?: number;
    attempt_count?: number;
    attemptCount?: number;
    best_score?: number | null;
    bestScore?: number | null;
    score?: number;
    max_score?: number;
    maxScore?: number;
    CreatedAt?: string;
    createdAt?: string;
    UpdatedAt?: string;
    updatedAt?: string;
}): QuizSummary {
    const id = quiz.id ?? quiz.ID ?? 0;

    return {
        id,
        courseId: quiz.courseId ?? quiz.course_id,
        chapterId: quiz.chapterId ?? quiz.chapter_id,
        createdById: quiz.createdById ?? quiz.created_by_id,
        title: quiz.title,
        description: quiz.description,
        durationMinutes: quiz.durationMinutes ?? quiz.time_limit_minutes ?? quiz.time_limit,
        startTime: quiz.startTime ?? quiz.start_time,
        endTime: quiz.endTime ?? quiz.end_time,
        maxAttempts: quiz.maxAttempts ?? quiz.max_attempts,
        showAnswerAfterEnd: quiz.showAnswerAfterEnd ?? quiz.show_answer_after_end,
        isPublished: quiz.isPublished ?? quiz.is_published,
        status: quiz.status,
        totalPoints: quiz.totalPoints ?? quiz.total_points,
        questionCount: quiz.questionCount ?? quiz.question_count,
        attemptCount: quiz.attemptCount ?? quiz.attempt_count,
        bestScore: quiz.bestScore ?? quiz.best_score,
        score: quiz.score,
        maxScore: quiz.maxScore ?? quiz.max_score,
        createdAt: quiz.createdAt ?? quiz.CreatedAt,
        updatedAt: quiz.updatedAt ?? quiz.UpdatedAt,
    };
}

function normalizeQuestion(question: {
    ID?: number;
    id?: number;
    quiz_id?: number;
    quizId?: number;
    type: Question['type'];
    content: string;
    options?: unknown;
    answer?: string;
    match_rule?: string;
    matchRule?: string;
    points?: number;
    order_num?: number;
    orderNum?: number;
}): Question {
    return {
        id: question.id ?? question.ID ?? 0,
        quizId: question.quizId ?? question.quiz_id,
        type: question.type,
        content: question.content,
        options: normalizeOptions(question.options),
        answer: question.answer,
        matchRule: question.matchRule ?? question.match_rule,
        points: question.points,
        orderNum: question.orderNum ?? question.order_num,
    };
}

function normalizeAttempt(attempt: {
    ID?: number;
    id?: number;
    quiz_id?: number;
    quizId?: number;
    student_id?: number;
    studentId?: number;
    attempt_number?: number;
    attemptNumber?: number;
    started_at?: string;
    startedAt?: string;
    deadline: string;
    submitted_at?: string | null;
    submittedAt?: string | null;
    answers?: string | Array<{ questionId: string; answer: unknown }>;
    score?: number | null;
    max_score?: number;
    maxScore?: number;
}): QuizAttempt {
    let answers: Array<{ questionId: string; answer: unknown }> | undefined;

    if (Array.isArray(attempt.answers)) {
        answers = attempt.answers;
    } else if (typeof attempt.answers === 'string') {
        try {
            const parsed = JSON.parse(attempt.answers) as Record<string, unknown>;
            answers = Object.entries(parsed).map(([questionId, answer]) => ({
                questionId,
                answer,
            }));
        } catch {
            answers = undefined;
        }
    }

    return {
        id: attempt.id ?? attempt.ID ?? 0,
        quizId: attempt.quizId ?? attempt.quiz_id,
        studentId: attempt.studentId ?? attempt.student_id,
        attemptNumber: attempt.attemptNumber ?? attempt.attempt_number,
        startedAt: attempt.startedAt ?? attempt.started_at,
        deadline: attempt.deadline,
        submittedAt: attempt.submittedAt ?? attempt.submitted_at,
        answers,
        score: attempt.score,
        maxScore: attempt.maxScore ?? attempt.max_score,
    };
}



export const quizApi = {
    async listCourseQuizzes(courseId: number | string, query?: QuizListQuery): Promise<PaginatedResponse<QuizSummary>> {
        return apiClient.get<PaginatedResponse<QuizSummary>>(`/courses/${courseId}/quizzes`, {
            query: toApiListQuery(query),
        });
    },

    async getQuizDetail(quizId: number | string): Promise<QuizDetail> {
        const payload = await apiClient.get<{
            quiz: QuizSummary;
            questions: Array<Omit<Question, 'options'> & { options?: unknown }>;
        }>(`/quizzes/${quizId}`);

        return {
            quiz: payload.quiz,
            questions: payload.questions.map((question) => ({
                ...question,
                options: normalizeOptions(question.options),
            })),
        };
    },

    async createAttempt(quizId: number | string): Promise<QuizAttempt> {
        return apiClient.post<QuizAttempt>(`/quizzes/${quizId}/attempts`);
    },

    async getAttempt(attemptId: number | string): Promise<QuizAttemptState> {
        return apiClient.get<QuizAttemptState>(`/quiz-attempts/${attemptId}`);
    },

    async updateAttemptAnswers(attemptId: number | string, answers: Array<{ questionId: string; answer: unknown }>) {
        return apiClient.patch<null>(`/quiz-attempts/${attemptId}/answers`, {
            answers,
        });
    },

    async submitAttempt(attemptId: number | string): Promise<QuizSubmitResult> {
        return apiClient.post<QuizSubmitResult>(`/quiz-attempts/${attemptId}/submit`, undefined, {
            idempotent: true,
        });
    },

    async createQuiz(payload: CreateQuizRequest): Promise<QuizSummary> {
        const created = await api.quiz.create({
            course_id: payload.courseId,
            title: payload.title,
            description: payload.description,
            time_limit: payload.durationMinutes,
            start_time: payload.startTime,
            end_time: payload.endTime,
            max_attempts: payload.maxAttempts,
            show_answer_after_end: payload.showAnswerAfterEnd,
        });

        return normalizeQuizSummary(created);
    },

    async publishQuiz(quizId: number | string): Promise<QuizSummary> {
        const quiz = await api.quiz.publish(Number(quizId));
        return normalizeQuizSummary(quiz);
    },

    async unpublishQuiz(quizId: number | string): Promise<QuizSummary> {
        const quiz = await api.quiz.unpublish(Number(quizId));
        return normalizeQuizSummary(quiz);
    },

    async addQuizQuestion(quizId: number | string, payload: CreateQuestionRequest): Promise<Question> {
        const question = await api.quiz.addQuestion(Number(quizId), {
            type: payload.type,
            content: payload.content,
            options: payload.options,
            answer: payload.answer,
            match_rule: payload.matchRule,
            points: payload.points,
            order_num: payload.orderNum,
        });

        return normalizeQuestion(question);
    },

    async startQuiz(quizId: number | string): Promise<{ attempt: QuizAttempt; questions: Question[]; resumed: boolean }> {
        const payload = await api.quiz.start(Number(quizId));
        return {
            attempt: normalizeAttempt(payload.attempt),
            questions: payload.questions.map((question) => normalizeQuestion(question)),
            resumed: payload.resumed,
        };
    },

    async submitQuiz(quizId: number | string, answers: Record<string, string | string[]>): Promise<QuizSubmitResult> {
        const result = await api.quiz.submit(Number(quizId), answers);
        return {
            score: result.score,
            maxScore: result.max_score,
            attempt: normalizeAttempt(result.attempt),
        };
    },


    async deleteQuestion(questionId: number | string) {
        return api.quiz.deleteQuestion(Number(questionId));
    },
};
