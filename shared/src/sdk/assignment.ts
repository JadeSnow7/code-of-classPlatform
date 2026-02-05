import type { ApiClient } from './http';
import type {
  Assignment,
  AssignmentSubmission,
  AssignmentDetailedStats,
  CourseAssignmentStats,
  CreateAssignmentRequest,
  SubmitAssignmentRequest,
  GradeSubmissionRequest,
} from '../types';

export function createAssignmentApi(client: ApiClient) {
  return {
    listByCourse: (courseId: number) => client.get<Assignment[]>(`/courses/${courseId}/assignments`),
    get: (id: number) => client.get<Assignment>(`/assignments/${id}`),
    create: (data: CreateAssignmentRequest) =>
      client.post<Assignment>(`/courses/${data.course_id}/assignments`, data),
    submit: (assignmentId: number, data: SubmitAssignmentRequest) =>
      client.post<AssignmentSubmission>(`/assignments/${assignmentId}/submit`, data),
    listSubmissions: (assignmentId: number) =>
      client.get<AssignmentSubmission[]>(`/assignments/${assignmentId}/submissions`),
    grade: (submissionId: number, data: GradeSubmissionRequest) =>
      client.post<AssignmentSubmission>(`/submissions/${submissionId}/grade`, data),
    aiGrade: (submissionId: number) =>
      client.post<{ suggestion: string; recommended_grade: number | null }>(`/submissions/${submissionId}/ai-grade`),
    getAssignmentStats: (id: number) =>
      client.get<AssignmentDetailedStats>(`/assignments/${id}/stats`),
    getCourseAssignmentStats: (courseId: number) =>
      client.get<CourseAssignmentStats>(`/courses/${courseId}/assignments/stats`),
  };
}
