import { apiClient } from './api/client';

const MOCK_MODE = import.meta.env.VITE_MOCK_API === 'true';

export interface Course {
    id: string;
    name: string;
    description: string;
    instructor: string;
    coverImage?: string;
}

const MOCK_COURSES: Course[] = [
    {
        id: '1',
        name: '电磁场与电磁波',
        description: '学习电磁场的基本理论与应用',
        instructor: '张教授',
    },
    {
        id: '2',
        name: '微波技术基础',
        description: '微波传输线与微波器件',
        instructor: '李教授',
    },
];

// Backend response format
interface BackendCourse {
    ID: number;
    name: string;
    description?: string;
    teacher_id: number;
}

export const courseService = {
    async list(): Promise<Course[]> {
        if (MOCK_MODE) {
            return MOCK_COURSES;
        }

        const response = await apiClient.get<BackendCourse[]>('/courses');
        // Map backend format to frontend format
        return response.data.map((c) => ({
            id: String(c.ID),
            name: c.name,
            description: c.description || '暂无描述',
            instructor: `教师 ID: ${c.teacher_id}`,
        }));
    },

    async getById(id: string): Promise<Course | undefined> {
        if (MOCK_MODE) {
            return MOCK_COURSES.find((c) => c.id === id);
        }

        const response = await apiClient.get<Course>(`/courses/${id}`);
        return response.data;
    },
};
