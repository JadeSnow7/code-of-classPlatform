import { apiClient } from './api/client';

const MOCK_MODE = import.meta.env.VITE_MOCK_API === 'true';

/**
 * Course representation used by the frontend.
 */
export interface Course {
    /** Course identifier. */
    id: string;
    /** Course display name. */
    name: string;
    /** Course description text. */
    description: string;
    /** Instructor display name or label. */
    instructor: string;
    /** Optional cover image URL. */
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
    /**
     * Fetch the list of courses.
     *
     * @returns The list of courses.
     */
    async list(): Promise<Course[]> {
        if (MOCK_MODE) {
            return MOCK_COURSES;
        }

        const data = await apiClient.get<BackendCourse[]>('/courses');
        // Map backend format to frontend format
        return data.map((c) => ({
            id: String(c.ID),
            name: c.name,
            description: c.description || '暂无描述',
            instructor: `教师 ID: ${c.teacher_id}`,
        }));
    },

    /**
     * Fetch a course by its identifier.
     *
     * @param id Course identifier.
     * @returns The course or undefined if not found.
     */
    async getById(id: string): Promise<Course | undefined> {
        if (MOCK_MODE) {
            return MOCK_COURSES.find((c) => c.id === id);
        }

        const data = await apiClient.get<Course>(`/courses/${id}`);
        return data;
    },
};
