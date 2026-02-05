import type { ApiClient } from './http';
import type { Chapter, ChapterStudentStats } from '../types';

export function createChapterApi(client: ApiClient) {
  return {
    list: (courseId: number | string) => client.get<Chapter[]>(`/courses/${courseId}/chapters`),
    get: (id: number | string) => client.get<Chapter>(`/chapters/${id}`),
    getMyStats: (id: number | string) => client.get<ChapterStudentStats>(`/chapters/${id}/my-stats`),
    heartbeat: (id: number | string) => client.post<{ message: string; duration: number }>(`/chapters/${id}/heartbeat`, {}),
    recordStudyTime: (id: number | string, durationSeconds?: number) =>
      client.post<{ message: string; duration: number }>(`/chapters/${id}/study-time`, {
        duration_seconds: durationSeconds,
      }),
  };
}
