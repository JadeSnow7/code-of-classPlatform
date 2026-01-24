import { API_BASE_URL, API_PREFIX, NETWORK_TIMEOUT_MS } from './config';
import type { AuthSession, ChatMessage, Course, Chapter, Assignment, Quiz, Resource, UserStats } from './types';

type ApiError = {
    code?: string;
    message?: string;
};

type ApiEnvelope<T> = {
    success?: boolean;
    data?: T;
    message?: string;
    error?: ApiError;
};

function buildUrl(path: string): string {
    return `${API_BASE_URL}${API_PREFIX}${path}`;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const { signal: externalSignal, ...rest } = options;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
    let abortListener: (() => void) | null = null;

    if (externalSignal) {
        if (externalSignal.aborted) {
            controller.abort();
        } else {
            abortListener = () => controller.abort();
            externalSignal.addEventListener('abort', abortListener);
        }
    }

    try {
        const response = await fetch(buildUrl(path), {
            ...rest,
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                ...(rest.headers ?? {}),
            },
        });

        const payload = (await response.json().catch(() => null)) as Record<string, unknown> | unknown[] | null;

        if (!response.ok) {
            const errorPayload = payload as ApiEnvelope<T> | null;
            const message = errorPayload?.error?.message ?? errorPayload?.message ?? `Request failed (${response.status})`;
            throw new Error(message);
        }

        // Handle different response formats from backend
        // Format 1: { success: true, data: T }
        // Format 2: { data: T }
        // Format 3: T (direct array/object)
        if (payload && typeof payload === 'object') {
            // Envelope format
            if ('success' in payload) {
                const envelope = payload as ApiEnvelope<T>;
                if (envelope.success) {
                    return envelope.data as T;
                }
                const message = envelope.error?.message ?? envelope.message ?? 'Request failed';
                throw new Error(message);
            }
            // Legacy { data } format (without success field)
            if ('data' in payload) {
                return (payload as { data: T }).data;
            }
            // Direct response (array or object without wrapper)
            if (Array.isArray(payload) || !('error' in payload)) {
                return payload as unknown as T;
            }
        }

        const errorPayload = payload as ApiEnvelope<T> | null;
        const message = errorPayload?.error?.message ?? errorPayload?.message ?? 'Unexpected response';
        throw new Error(message);
    } catch (error) {
        const isAbortError = error instanceof Error && error.name === 'AbortError';
        if (isAbortError) {
            if (externalSignal?.aborted) {
                throw new Error('Request canceled');
            }
            throw new Error('Request timed out');
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
        if (externalSignal && abortListener) {
            externalSignal.removeEventListener('abort', abortListener);
        }
    }
}

function authHeaders(token: string, tokenType: string): Record<string, string> {
    return { Authorization: `${tokenType} ${token}` };
}

// ============ Auth API ============

type LoginResponse = {
    access_token: string;
    token_type?: string;
    expires_in?: number;
    user_id?: string;
    username?: string;
    role?: string;
};

export async function login(username: string, password: string): Promise<AuthSession> {
    const data = await request<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
    });

    return {
        token: data.access_token,
        tokenType: data.token_type ?? 'Bearer',
        expiresIn: data.expires_in,
        user: {
            id: data.user_id,
            username: data.username,
            role: data.role,
        },
    };
}

// ============ AI Chat API ============

export async function chat(
    token: string,
    tokenType: string,
    messages: ChatMessage[],
    mode: string,
    signal?: AbortSignal
): Promise<string> {
    const data = await request<{ reply: string }>('/ai/chat', {
        method: 'POST',
        headers: authHeaders(token, tokenType),
        signal,
        body: JSON.stringify({
            mode,
            messages: messages.map((m) => ({ role: m.role, content: m.content })),
            stream: false,
        }),
    });
    return data.reply;
}

// ============ Course API ============

export async function getCourses(token: string, tokenType: string): Promise<Course[]> {
    return request<Course[]>('/courses', {
        method: 'GET',
        headers: authHeaders(token, tokenType),
    });
}

export async function getCourseDetail(token: string, tokenType: string, courseId: number): Promise<Course> {
    return request<Course>(`/courses/${courseId}`, {
        method: 'GET',
        headers: authHeaders(token, tokenType),
    });
}

// ============ Chapter API ============

export async function getChapters(token: string, tokenType: string, courseId: number): Promise<Chapter[]> {
    return request<Chapter[]>(`/courses/${courseId}/chapters`, {
        method: 'GET',
        headers: authHeaders(token, tokenType),
    });
}

export async function getChapterContent(token: string, tokenType: string, chapterId: number): Promise<Chapter> {
    return request<Chapter>(`/chapters/${chapterId}`, {
        method: 'GET',
        headers: authHeaders(token, tokenType),
    });
}

export async function recordStudyTime(
    token: string,
    tokenType: string,
    chapterId: number,
    durationSeconds: number
): Promise<void> {
    await request<{}>(`/chapters/${chapterId}/study-time`, {
        method: 'POST',
        headers: authHeaders(token, tokenType),
        body: JSON.stringify({ duration_seconds: durationSeconds }),
    });
}

// ============ Assignment API ============

export async function getAssignments(token: string, tokenType: string, courseId: number): Promise<Assignment[]> {
    return request<Assignment[]>(`/courses/${courseId}/assignments`, {
        method: 'GET',
        headers: authHeaders(token, tokenType),
    });
}

export async function getAssignmentDetail(token: string, tokenType: string, assignmentId: number): Promise<Assignment> {
    return request<Assignment>(`/assignments/${assignmentId}`, {
        method: 'GET',
        headers: authHeaders(token, tokenType),
    });
}

export async function submitAssignment(
    token: string,
    tokenType: string,
    assignmentId: number,
    content: string
): Promise<void> {
    await request<{}>(`/assignments/${assignmentId}/submit`, {
        method: 'POST',
        headers: authHeaders(token, tokenType),
        body: JSON.stringify({ content }),
    });
}

// ============ Quiz API ============

export async function getQuizzes(token: string, tokenType: string, courseId: number): Promise<Quiz[]> {
    return request<Quiz[]>(`/courses/${courseId}/quizzes`, {
        method: 'GET',
        headers: authHeaders(token, tokenType),
    });
}

export async function getQuizDetail(token: string, tokenType: string, quizId: number): Promise<Quiz> {
    return request<Quiz>(`/quizzes/${quizId}`, {
        method: 'GET',
        headers: authHeaders(token, tokenType),
    });
}

export async function submitQuiz(
    token: string,
    tokenType: string,
    quizId: number,
    answers: Record<number, string | string[]>
): Promise<{ score: number; max_score: number }> {
    return request<{ score: number; max_score: number }>(`/quizzes/${quizId}/submit`, {
        method: 'POST',
        headers: authHeaders(token, tokenType),
        body: JSON.stringify({ answers }),
    });
}

// ============ Resource API ============

export async function getResources(token: string, tokenType: string, courseId: number): Promise<Resource[]> {
    return request<Resource[]>(`/courses/${courseId}/resources`, {
        method: 'GET',
        headers: authHeaders(token, tokenType),
    });
}

// ============ Create APIs (Teacher Only) ============

export type CreateAssignmentRequest = {
    course_id: number;
    title: string;
    description?: string;
    deadline?: string;
    allow_file?: boolean;
};

export async function createAssignment(
    token: string,
    tokenType: string,
    data: CreateAssignmentRequest
): Promise<Assignment> {
    return request<Assignment>(`/courses/${data.course_id}/assignments`, {
        method: 'POST',
        headers: authHeaders(token, tokenType),
        body: JSON.stringify(data),
    });
}

export type CreateQuizRequest = {
    course_id: number;
    title: string;
    description?: string;
    time_limit?: number;
    max_attempts?: number;
};

export async function createQuiz(
    token: string,
    tokenType: string,
    data: CreateQuizRequest
): Promise<Quiz> {
    return request<Quiz>('/quizzes', {
        method: 'POST',
        headers: authHeaders(token, tokenType),
        body: JSON.stringify(data),
    });
}

export type CreateResourceRequest = {
    course_id: number;
    title: string;
    type: 'video' | 'paper' | 'link';
    url: string;
    description?: string;
};

export async function createResource(
    token: string,
    tokenType: string,
    data: CreateResourceRequest
): Promise<Resource> {
    return request<Resource>('/resources', {
        method: 'POST',
        headers: authHeaders(token, tokenType),
        body: JSON.stringify(data),
    });
}

// ============ User Stats API ============

export async function getUserStats(token: string, tokenType: string): Promise<UserStats> {
    return request<UserStats>('/users/me/stats', {
        method: 'GET',
        headers: authHeaders(token, tokenType),
    });
}

// ============ Student Global Profile API ============

import { StudentGlobalProfile, WritingSubmission } from './types';

export async function getGlobalProfile(token: string, tokenType: string, studentId: number): Promise<StudentGlobalProfile> {
    return request<StudentGlobalProfile>(`/students/${studentId}/global-profile`, {
        method: 'GET',
        headers: authHeaders(token, tokenType),
    });
}

// ============ Writing API ============

export async function submitWriting(
    token: string,
    tokenType: string,
    courseId: number,
    data: {
        title: string;
        content: string;
        writing_type: string;
        assignment_id?: number;
    }
): Promise<WritingSubmission> {
    return request<WritingSubmission>(`/courses/${courseId}/writing`, {
        method: 'POST',
        headers: authHeaders(token, tokenType),
        body: JSON.stringify(data),
    });
}

export async function getWritingSubmissions(
    token: string,
    tokenType: string,
    courseId: number,
    writingType?: string
): Promise<WritingSubmission[]> {
    const url = writingType
        ? `/courses/${courseId}/writing?writing_type=${writingType}`
        : `/courses/${courseId}/writing`;

    return request<WritingSubmission[]>(url, {
        method: 'GET',
        headers: authHeaders(token, tokenType),
    });
}

export async function getWritingSubmission(
    token: string,
    tokenType: string,
    submissionId: number
): Promise<WritingSubmission> {
    return request<WritingSubmission>(`/writing/${submissionId}`, {
        method: 'GET',
        headers: authHeaders(token, tokenType),
    });
}
