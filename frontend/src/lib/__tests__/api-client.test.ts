import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { notifyApiErrorMock } = vi.hoisted(() => ({
    notifyApiErrorMock: vi.fn(),
}));

vi.mock('@/lib/api-feedback', () => ({
    notifyApiError: notifyApiErrorMock,
    notifyApiSuccess: vi.fn(),
}));

vi.mock('@classplatform/shared', () => ({
    createApi: () => ({
        ai: {
            streamChat: vi.fn(),
            streamOrchestratedChat: vi.fn(),
        },
        quiz: {
            create: vi.fn(),
            publish: vi.fn(),
            unpublish: vi.fn(),
            addQuestion: vi.fn(),
            deleteQuestion: vi.fn(),
        },
    }),
    createApiClient: () => ({}),
    createBrowserUploadFn: () => vi.fn(),
}));

import { apiClient, ApiRequestError } from '@/lib/api-client';
import { authStore } from '@/lib/auth-store';

describe('apiClient', () => {
    const fetchMock = vi.fn<typeof fetch>();

    beforeEach(() => {
        vi.stubGlobal('fetch', fetchMock);
        localStorage.clear();
        fetchMock.mockReset();
        notifyApiErrorMock.mockReset();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('parses the response envelope and maps request and response keys across casing conventions', async () => {
        fetchMock.mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    code: '0',
                    message: 'ok',
                    data: {
                        submission_id: 'sub-1',
                        nested_value: {
                            updated_at: '2026-03-21T10:00:00Z',
                        },
                    },
                }),
                {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                },
            ),
        );

        const result = await apiClient.post('/writing-submissions', {
            courseId: 1,
            nestedValue: { wordCount: 128 },
        });

        expect(result).toEqual({
            submissionId: 'sub-1',
            nestedValue: {
                updatedAt: '2026-03-21T10:00:00Z',
            },
        });
        expect(fetchMock).toHaveBeenCalledWith(
            '/api/v1/writing-submissions',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({
                    course_id: 1,
                    nested_value: {
                        word_count: 128,
                    },
                }),
            }),
        );
    });

    it('surfaces a business error when the envelope code is not 0 even on http 200', async () => {
        fetchMock.mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    code: 'QUIZ_LOCKED',
                    message: '测验已锁定',
                    data: {
                        retry_after_seconds: 30,
                    },
                }),
                {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                },
            ),
        );

        await expect(apiClient.get('/quizzes/12')).rejects.toMatchObject({
            name: 'ApiRequestError',
            message: '测验已锁定',
            payload: {
                error: {
                    code: 'QUIZ_LOCKED',
                    message: '测验已锁定',
                    details: {
                        retryAfterSeconds: 30,
                    },
                },
            },
        });

        expect(notifyApiErrorMock).toHaveBeenCalledWith('测验已锁定', { silent: undefined });
    });

    it('refreshes the session once after a 401 and retries the original request with the new token', async () => {
        authStore.setSession({
            accessToken: 'expired-token',
            refreshToken: 'refresh-token',
            tokenType: 'Bearer',
        });

        fetchMock
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        error: {
                            message: 'unauthorized',
                        },
                    }),
                    {
                        status: 401,
                        headers: { 'content-type': 'application/json' },
                    },
                ),
            )
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        code: '0',
                        message: 'ok',
                        data: {
                            access_token: 'fresh-token',
                            refresh_token: 'fresh-refresh-token',
                            token_type: 'Bearer',
                        },
                    }),
                    {
                        status: 200,
                        headers: { 'content-type': 'application/json' },
                    },
                ),
            )
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        code: '0',
                        message: 'ok',
                        data: {
                            session_id: 'session-2',
                        },
                    }),
                    {
                        status: 200,
                        headers: { 'content-type': 'application/json' },
                    },
                ),
            );

        const result = await apiClient.get<{ sessionId: string }>('/ai/sessions/current');

        expect(result).toEqual({ sessionId: 'session-2' });
        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            '/api/v1/ai/sessions/current',
            expect.objectContaining({
                headers: expect.objectContaining({
                    Authorization: 'Bearer expired-token',
                }),
            }),
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            '/api/v1/auth/refresh',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({
                    refresh_token: 'refresh-token',
                }),
            }),
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            3,
            '/api/v1/ai/sessions/current',
            expect.objectContaining({
                headers: expect.objectContaining({
                    Authorization: 'Bearer fresh-token',
                }),
            }),
        );
        expect(authStore.getSession()).toMatchObject({
            accessToken: 'fresh-token',
            refreshToken: 'fresh-refresh-token',
        });
    });

    it('preserves validation details from a 422 response for the caller', async () => {
        fetchMock.mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: '标题不能为空',
                        details: {
                            field_errors: {
                                title: ['required'],
                            },
                        },
                    },
                }),
                {
                    status: 422,
                    headers: { 'content-type': 'application/json' },
                },
            ),
        );

        let thrown: unknown;
        try {
            await apiClient.post('/writing-submissions', { title: '' });
        } catch (error) {
            thrown = error;
        }

        expect(thrown).toBeInstanceOf(ApiRequestError);
        expect(thrown).toMatchObject({
            message: '标题不能为空',
            httpStatus: 422,
            payload: {
                error: {
                    code: 'VALIDATION_ERROR',
                    message: '标题不能为空',
                    details: {
                        fieldErrors: {
                            title: ['required'],
                        },
                    },
                },
            },
        });
        expect(notifyApiErrorMock).toHaveBeenCalledWith('标题不能为空', { silent: undefined });
    });
});
