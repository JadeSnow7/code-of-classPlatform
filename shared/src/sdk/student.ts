import type { ApiClient } from './http';
import type {
  StudentGlobalProfile,
  LearningEvent,
  WritingSubmission,
  WritingType,
} from '../types';

export type LearningTimelineParams = {
  page?: number;
  page_size?: number;
  course_id?: number;
};

export type LearningTimelineResponse = {
  items: LearningEvent[];
  total: number;
  page: number;
  page_size: number;
};

export function createStudentApi(client: ApiClient) {
  return {
    getGlobalProfile: (studentId: number) => client.get<StudentGlobalProfile>(`/students/${studentId}/global-profile`),
    saveGlobalProfile: (studentId: number, profile: Partial<StudentGlobalProfile>) =>
      client.post<StudentGlobalProfile>(`/students/${studentId}/global-profile`, profile),
    getLearningTimeline: async (studentId: number, params?: LearningTimelineParams) => {
      const payload = await client.get<LearningTimelineResponse | { items?: LearningEvent[]; data?: LearningEvent[]; total?: number; page?: number; page_size?: number }>(
        `/students/${studentId}/learning-timeline`,
        { query: params }
      );

      const items = (payload as LearningTimelineResponse).items ?? (payload as { data?: LearningEvent[] }).data ?? [];
      return {
        items,
        total: (payload as LearningTimelineResponse).total ?? items.length,
        page: (payload as LearningTimelineResponse).page ?? params?.page ?? 1,
        page_size: (payload as LearningTimelineResponse).page_size ?? params?.page_size ?? items.length,
      } satisfies LearningTimelineResponse;
    },
    recordLearningEvent: (event: {
      student_id: number;
      course_id?: number;
      event_type: string;
      payload: string;
    }) => client.post<LearningEvent>('/learning-events', event),
    submitWriting: (courseId: number, data: { title: string; content: string; writing_type: WritingType; assignment_id?: number }) =>
      client.post<WritingSubmission>(`/courses/${courseId}/writing`, data),
    getWritingSubmissions: (courseId: number, writingType?: WritingType) =>
      client.get<WritingSubmission[]>(`/courses/${courseId}/writing`, {
        query: writingType ? { writing_type: writingType } : undefined,
      }),
    getWritingSubmission: (submissionId: number) => client.get<WritingSubmission>(`/writing/${submissionId}`),
    getWritingStats: (courseId: number) =>
      client.get<{ weakness_stats: Array<{ name: string; count: number }>; student_count: number }>(
        `/courses/${courseId}/writing/stats`
      ),
  };
}
