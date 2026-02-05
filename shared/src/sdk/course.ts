import type { ApiClient } from './http';
import type { Course } from '../types';

export type CreateCourseRequest = {
  name: string;
  code?: string;
  semester?: string;
};

export function createCourseApi(client: ApiClient) {
  return {
    list: () => client.get<Course[]>('/courses'),
    get: (id: number | string) => client.get<Course>(`/courses/${id}`),
    create: (data: CreateCourseRequest) => client.post<Course>('/courses', data),
  };
}
