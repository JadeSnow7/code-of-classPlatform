/**
 * Quiz API types and client bindings.
 */
import { api } from '@/lib/api-client';
import type {
    Quiz,
    QuizWithAttempt,
    Question,
    QuestionWithAnswer,
    QuizAttempt,
    CreateQuizRequest,
    CreateQuestionRequest,
} from '@classplatform/shared';

/** Quiz-related payload types. */
export type { Quiz, QuizWithAttempt, Question, QuestionWithAnswer, QuizAttempt, CreateQuizRequest, CreateQuestionRequest };
/** Typed quiz API client. */
export const quizApi = api.quiz;
