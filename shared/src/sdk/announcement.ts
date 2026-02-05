import type { ApiClient } from './http';
import type { Announcement, AnnouncementSummary, CreateAnnouncementRequest } from '../types';

export function createAnnouncementApi(client: ApiClient) {
  return {
    getSummary: (courseId: number) =>
      client.get<AnnouncementSummary>(`/courses/${courseId}/announcements/summary`),
    list: (courseId: number) => client.get<Announcement[]>(`/courses/${courseId}/announcements`),
    create: (courseId: number, data: CreateAnnouncementRequest) =>
      client.post<Announcement>(`/courses/${courseId}/announcements`, data),
    update: (id: number, data: Partial<CreateAnnouncementRequest>) =>
      client.put<Announcement>(`/announcements/${id}`, data),
    delete: (id: number) => client.delete<void>(`/announcements/${id}`),
    markRead: (id: number) => client.post<void>(`/announcements/${id}/read`, {}),
  };
}
