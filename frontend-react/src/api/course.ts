import { apiClient } from '@/lib/api-client';

export interface Course {
    ID: number;
    name: string;
    code?: string;
    semester?: string;
    teacher_id: number;
    CreatedAt: string;
    UpdatedAt: string;
}

export interface CreateCourseRequest {
    name: string;
    code?: string;
    semester?: string;
}

export const courseApi = {
    async list(): Promise<Course[]> {
        const response = await apiClient.get<Course[]>('/courses');
        // API client unwraps .data if structure is { code: 0, data: [...] }
        // If backend returns pure array [ ... ], response.data is the array.
        return response.data;
    },

    async get(id: number | string): Promise<Course> {
        const response = await apiClient.get<Course>(`/courses/${id}`);
        return response.data;
    },

    async create(data: CreateCourseRequest): Promise<Course> {
        const response = await apiClient.post<Course>('/courses', data);
        return response.data;
    }
};
