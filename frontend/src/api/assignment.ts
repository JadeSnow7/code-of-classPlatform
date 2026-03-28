import { api, apiClient } from '@/lib/api-client';
import type { BaseListQuery, PaginatedResponse } from '@/types/api';

type ApiListQuery = Record<string, string | number | boolean | undefined>;

export interface SubmissionModel {
    id: number;
    assignmentId?: number;
    studentId?: number;
    status?: string;
    score?: number;
    grade?: number | null;
    content?: string;
    feedback?: string | null;
    fileUrl?: string | null;
    submittedAt?: string;
    gradedAt?: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface AssignmentModel {
    id: number;
    courseId?: number;
    chapterId?: number | null;
    teacherId?: number;
    title: string;
    description?: string;
    status?: string;
    deadline?: string | null;
    dueDate?: string;
    allowFile?: boolean;
    maxFileSize?: number;
    maxScore?: number;
    courseName?: string;
    submission?: SubmissionModel;
    createdAt?: string;
    updatedAt?: string;
}

export interface LegacySubmission {
    ID: number;
    id: number;
    assignment_id?: number;
    student_id?: number;
    status?: string;
    score?: number;
    grade?: number | null;
    content?: string;
    feedback?: string | null;
    file_url?: string | null;
    submitted_at?: string;
    graded_at?: string;
    CreatedAt?: string;
    UpdatedAt?: string;
}

export interface LegacyAssignment {
    ID: number;
    id: number;
    course_id?: number;
    chapter_id?: number | null;
    teacher_id?: number;
    title: string;
    description?: string;
    status?: string;
    deadline?: string | null;
    due_date?: string;
    allow_file?: boolean;
    max_file_size?: number;
    max_score?: number;
    updated_at?: string;
    course_name?: string;
    submission?: LegacySubmission;
    CreatedAt?: string;
    UpdatedAt?: string;
}

export type Assignment = LegacyAssignment;
export type Submission = LegacySubmission;

export interface AssignmentListQuery extends Omit<BaseListQuery, 'page_size' | 'sort_by' | 'sort_order'> {
    pageSize?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    status?: string;
}

export type SubmitRequest = {
    content?: string;
    fileIds?: string[];
};

export type GradeRequest = {
    score?: number;
    feedback?: string;
    rubric?: Record<string, unknown>;
    grade?: number;
    comment?: string;
};

export interface CreateAssignmentRequest {
    title: string;
    description?: string;
    deadline?: string;
    allowFile?: boolean;
    maxFileSize?: number;
    maxScore?: number;
}

export interface LegacyCreateAssignmentRequest extends CreateAssignmentRequest {
    courseId?: number;
    course_id?: number;
    allow_file?: boolean;
    max_file_size?: number;
    max_score?: number;
}

export type AssignmentDetailedStats = Record<string, unknown>;
export type CourseAssignmentStats = Record<string, unknown>;

function toApiListQuery(query?: AssignmentListQuery): ApiListQuery | undefined {
    if (!query) {
        return undefined;
    }

    return {
        page: query.page,
        pageSize: query.pageSize,
        keyword: query.keyword,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
        status: query.status,
    };
}

function toLegacySubmission(submission: SubmissionModel): LegacySubmission {
    return {
        ID: submission.id,
        id: submission.id,
        assignment_id: submission.assignmentId,
        student_id: submission.studentId,
        status: submission.status,
        score: submission.score,
        grade: submission.grade,
        content: submission.content,
        feedback: submission.feedback,
        file_url: submission.fileUrl,
        submitted_at: submission.submittedAt,
        graded_at: submission.gradedAt,
    };
}

function toLegacyAssignment(assignment: AssignmentModel): LegacyAssignment {
    return {
        ID: assignment.id,
        id: assignment.id,
        course_id: assignment.courseId,
        chapter_id: assignment.chapterId,
        teacher_id: assignment.teacherId,
        title: assignment.title,
        description: assignment.description,
        status: assignment.status,
        deadline: assignment.deadline,
        due_date: assignment.dueDate,
        allow_file: assignment.allowFile,
        max_file_size: assignment.maxFileSize,
        max_score: assignment.maxScore,
        updated_at: assignment.updatedAt,
        course_name: assignment.courseName,
        submission: assignment.submission ? toLegacySubmission(assignment.submission) : undefined,
    };
}

export const assignmentApi = {
    async listCourseAssignments(courseId: number | string, query?: AssignmentListQuery): Promise<PaginatedResponse<AssignmentModel>> {
        return apiClient.get<PaginatedResponse<AssignmentModel>>(`/courses/${courseId}/assignments`, {
            query: toApiListQuery(query),
        });
    },

    async getDetail(assignmentId: number | string): Promise<AssignmentModel> {
        return apiClient.get<AssignmentModel>(`/assignments/${assignmentId}`);
    },

    async createAssignment(courseId: number | string, payload: CreateAssignmentRequest): Promise<AssignmentModel> {
        return apiClient.post<AssignmentModel>(
            `/courses/${courseId}/assignments`,
            {
                title: payload.title,
                description: payload.description,
                deadline: payload.deadline,
                allowFile: payload.allowFile,
                maxFileSize: payload.maxFileSize,
                maxScore: payload.maxScore,
            },
            {
                idempotent: true,
            }
        );
    },

    async submitAssignment(assignmentId: number | string, payload: { content?: string; fileUrl?: string }): Promise<SubmissionModel> {
        return apiClient.post<SubmissionModel>(`/assignments/${assignmentId}/submissions`, payload, {
            idempotent: true,
        });
    },

    async listAssignmentSubmissions(assignmentId: number | string, query?: AssignmentListQuery): Promise<SubmissionModel[]> {
        const payload = await apiClient.get<PaginatedResponse<SubmissionModel>>(`/assignments/${assignmentId}/submissions`, {
            query: toApiListQuery(query),
        });
        return payload.items;
    },

    async gradeSubmission(submissionId: number | string, payload: GradeRequest): Promise<SubmissionModel> {
        return apiClient.patch<SubmissionModel>(`/submissions/${submissionId}/grading`, payload);
    },

    async listByCourse(courseId: number | string, query?: AssignmentListQuery): Promise<LegacyAssignment[]> {
        const payload = await this.listCourseAssignments(courseId, query);
        return payload.items.map(toLegacyAssignment);
    },

    async create(payload: LegacyCreateAssignmentRequest): Promise<LegacyAssignment> {
        const courseId = payload.courseId ?? payload.course_id;
        if (!courseId) {
            throw new Error('courseId is required');
        }
        const created = await this.createAssignment(courseId, {
            title: payload.title,
            description: payload.description,
            deadline: payload.deadline,
            allowFile: payload.allowFile ?? payload.allow_file,
            maxFileSize: payload.maxFileSize ?? payload.max_file_size,
            maxScore: payload.maxScore ?? payload.max_score,
        });
        return toLegacyAssignment(created);
    },

    async get(assignmentId: number | string): Promise<LegacyAssignment> {
        const assignment = await this.getDetail(assignmentId);
        return toLegacyAssignment(assignment);
    },

    async submit(assignmentId: number | string, payload: SubmitRequest | Record<string, unknown>): Promise<LegacySubmission> {
        const submissionPayload = payload as SubmitRequest & { file_url?: string };
        const submission = await this.submitAssignment(assignmentId, {
            content: submissionPayload.content,
            fileUrl: submissionPayload.fileIds?.[0] ?? submissionPayload.file_url,
        });
        return toLegacySubmission(submission);
    },

    async listSubmissions(assignmentId: number | string, query?: AssignmentListQuery): Promise<LegacySubmission[]> {
        const payload = await this.listAssignmentSubmissions(assignmentId, query);
        return payload.map(toLegacySubmission);
    },

    async grade(submissionId: number | string, payload: GradeRequest): Promise<LegacySubmission> {
        const submission = await this.gradeSubmission(submissionId, payload);
        return toLegacySubmission(submission);
    },

    async aiGrade(submissionId: number | string) {
        return api.assignment.aiGrade(Number(submissionId));
    },

    async getCourseAssignmentStats(courseId: number | string) {
        return api.assignment.getCourseAssignmentStats(Number(courseId));
    },
};
