import { apiClient } from '@/lib/api-client';

export interface Resource {
    ID: number;
    course_id: number;
    created_by_id: number;
    title: string;
    type: 'video' | 'paper' | 'link';
    url: string;
    description: string;
    CreatedAt: string;
    UpdatedAt: string;
}

export interface CreateResourceRequest {
    course_id: number;
    title: string;
    type: 'video' | 'paper' | 'link';
    url: string;
    description?: string;
}

export const resourceApi = {
    // List resources for a course
    listByCourse: async (courseId: number, type?: string): Promise<Resource[]> => {
        const params = type ? `?type=${type}` : '';
        const response = await apiClient.get<Resource[]>(`/courses/${courseId}/resources${params}`);
        return response.data;
    },

    // Create resource (teacher only)
    create: async (data: CreateResourceRequest): Promise<Resource> => {
        const response = await apiClient.post<Resource>('/resources', data);
        return response.data;
    },

    // Delete resource (teacher only)
    delete: async (id: number): Promise<void> => {
        await apiClient.delete(`/resources/${id}`);
    },
};
