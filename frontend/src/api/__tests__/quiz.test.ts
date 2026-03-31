import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import { quizApi } from '@/api/quiz';

describe('quizApi', () => {
    const fetchMock = vi.fn<typeof fetch>();

    beforeEach(() => {
        localStorage.clear();
        vi.stubGlobal('fetch', fetchMock);
    });

    it('sends only the changed question answer when autosaving part of an attempt', async () => {
        fetchMock.mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    code: '0',
                    message: 'ok',
                    data: null,
                }),
                {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                },
            ),
        );

        await quizApi.updateAttemptAnswers(42, [
            {
                questionId: 'q-2',
                answer: 'B',
            },
        ]);

        expect(fetchMock).toHaveBeenCalledWith(
            '/api/v1/quiz-attempts/42/answers',
            expect.objectContaining({
                method: 'PATCH',
                body: JSON.stringify({
                    answers: [
                        {
                            question_id: 'q-2',
                            answer: 'B',
                        },
                    ],
                }),
            }),
        );
    });

    it('submits through the attempt endpoint instead of the quiz endpoint', async () => {
        fetchMock.mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    code: '0',
                    message: 'ok',
                    data: {
                        score: 88,
                        max_score: 100,
                        attempt: {
                            id: 42,
                            deadline: '2026-03-21T12:00:00Z',
                        },
                    },
                }),
                {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                },
            ),
        );

        const result = await quizApi.submitAttempt(42);

        expect(result).toMatchObject({
            score: 88,
            maxScore: 100,
            attempt: {
                id: 42,
            },
        });
        expect(fetchMock).toHaveBeenCalledWith(
            '/api/v1/quiz-attempts/42/submit',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    'Idempotency-Key': expect.any(String),
                }),
            }),
        );
    });
});
