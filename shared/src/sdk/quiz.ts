import type { ApiClient } from './http';
import type {
  Quiz,
  QuizWithAttempt,
  Question,
  QuestionWithAnswer,
  QuizAttempt,
  CreateQuizRequest,
  CreateQuestionRequest,
  SubmitQuizRequest,
} from '../types';

export function createQuizApi(client: ApiClient) {
  return {
    listByCourse: (courseId: number) => client.get<Array<Quiz | QuizWithAttempt>>(`/courses/${courseId}/quizzes`),
    create: (data: CreateQuizRequest) => client.post<Quiz>('/quizzes', data),
    get: (quizId: number) =>
      client.get<{ quiz: Quiz; questions: Array<Question | QuestionWithAnswer> }>(`/quizzes/${quizId}`),
    update: (quizId: number, data: Partial<CreateQuizRequest>) => client.put<Quiz>(`/quizzes/${quizId}`, data),
    delete: (quizId: number) => client.delete<void>(`/quizzes/${quizId}`),
    publish: (quizId: number) => client.post<Quiz>(`/quizzes/${quizId}/publish`, {}),
    unpublish: (quizId: number) => client.post<Quiz>(`/quizzes/${quizId}/unpublish`, {}),
    addQuestion: (quizId: number, data: CreateQuestionRequest) =>
      client.post<QuestionWithAnswer>(`/quizzes/${quizId}/questions`, data),
    updateQuestion: (questionId: number, data: Partial<CreateQuestionRequest>) =>
      client.put<QuestionWithAnswer>(`/questions/${questionId}`, data),
    deleteQuestion: (questionId: number) => client.delete<void>(`/questions/${questionId}`),
    start: (quizId: number) =>
      client.post<{ attempt: QuizAttempt; questions: Question[]; resumed: boolean }>(`/quizzes/${quizId}/start`, {}),
    submit: (quizId: number, answers: SubmitQuizRequest['answers']) =>
      client.post<{ score: number; max_score: number; attempt: QuizAttempt }>(`/quizzes/${quizId}/submit`, {
        answers,
      }),
    getResult: (quizId: number) =>
      client.get<{ quiz: Quiz; attempts: QuizAttempt[]; questions?: QuestionWithAnswer[] }>(
        `/quizzes/${quizId}/result`
      ),
  };
}
