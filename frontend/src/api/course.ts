import { apiClient } from '@/lib/api-client';
import type { BaseListQuery, PaginatedResponse } from '@/types/api';

type ApiListQuery = Record<string, string | number | boolean | undefined>;

function toSortField(value?: string): string | undefined {
    if (!value) {
        return value;
    }

    return value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

export interface CourseModel {
    id: number;
    name: string;
    code?: string;
    semester?: string;
    description?: string;
    role?: string;
    teacherName?: string;
    teacherId?: number;
    enrolledCount?: number;
    createdAt?: string;
    updatedAt?: string;
}

export interface LegacyCourse {
    ID: number;
    id: number;
    name: string;
    code?: string;
    semester?: string;
    description?: string;
    teacher_name?: string;
    teacher_id?: number;
    enrolled_count?: number;
    student_count?: number;
    updated_at?: string;
}

export type Course = LegacyCourse;

export interface CreateCourseRequest {
    name: string;
    code?: string;
    semester?: string;
    description?: string;
}

export interface CourseListQuery extends Omit<BaseListQuery, 'page_size' | 'sort_by' | 'sort_order'> {
    pageSize?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    role?: string;
    status?: string;
    semester?: string;
}

function toApiListQuery(query?: CourseListQuery): ApiListQuery | undefined {
    if (!query) {
        return undefined;
    }

    return {
        page: query.page,
        pageSize: query.pageSize,
        keyword: query.keyword,
        sortBy: toSortField(query.sortBy),
        sortOrder: query.sortOrder,
        role: query.role,
        status: query.status,
        semester: query.semester,
    };
}

function toLegacyCourse(course: CourseModel): LegacyCourse {
    return {
        ID: course.id,
        id: course.id,
        name: course.name,
        code: course.code,
        semester: course.semester,
        description: course.description,
        teacher_name: course.teacherName,
        teacher_id: course.teacherId,
        enrolled_count: course.enrolledCount,
        student_count: course.enrolledCount,
        updated_at: course.updatedAt,
    };
}

export const courseApi = {
    async listMy(query?: CourseListQuery): Promise<PaginatedResponse<CourseModel>> {
        return apiClient.get<PaginatedResponse<CourseModel>>('/courses', {
            query: toApiListQuery(query),
        });
    },

    async listPublic(query?: CourseListQuery): Promise<PaginatedResponse<CourseModel>> {
        return apiClient.get<PaginatedResponse<CourseModel>>('/courses', {
            query: toApiListQuery(query),
        });
    },

    async getDetail(courseId: number | string): Promise<CourseModel> {
        return apiClient.get<CourseModel>(`/courses/${courseId}`);
    },

    async get(courseId: number | string): Promise<LegacyCourse> {
        const course = await this.getDetail(courseId);
        return toLegacyCourse(course);
    },

    async list(query?: CourseListQuery): Promise<LegacyCourse[]> {
        const payload = await this.listPublic(query);
        return payload.items.map(toLegacyCourse);
    },

    async create(payload: CreateCourseRequest): Promise<LegacyCourse> {
        const created = await apiClient.post<CourseModel>('/courses', payload);
        return toLegacyCourse(created);
    },

    async getChapters(courseId: number | string): Promise<Array<Record<string, unknown>>> {
        return apiClient.get<Array<Record<string, unknown>>>(`/courses/${courseId}/chapters`);
    },
};
