import type { ApiClient } from './http';
import type { Resource, CreateResourceRequest } from '../types';

export function createResourceApi(client: ApiClient) {
  return {
    listByCourse: (courseId: number, type?: string) =>
      client.get<Resource[]>(`/courses/${courseId}/resources`, {
        query: type ? { type } : undefined,
      }),
    create: (data: CreateResourceRequest) => client.post<Resource>('/resources', data),
    delete: (id: number) => client.delete<void>(`/resources/${id}`),
  };
}
