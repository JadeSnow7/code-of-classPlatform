import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@classplatform/shared', () => ({
    createApi: () => ({
        ai: {
            streamChat: vi.fn(),
            streamOrchestratedChat: vi.fn(),
        },
        quiz: {},
    }),
    createApiClient: () => ({}),
    createBrowserUploadFn: () => vi.fn(),
}));

import { courseApi } from '@/api/course';

describe('courseApi', () => {
    const fetchMock = vi.fn<typeof fetch>();

    beforeEach(() => {
        localStorage.clear();
        vi.stubGlobal('fetch', fetchMock);
    });

    it('uses the backend courses route for my courses listing', async () => {
        fetchMock.mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    code: '0',
                    message: 'ok',
                    data: {
                        items: [],
                        total: 0,
                        page: 1,
                        page_size: 20,
                        total_pages: 0,
                        has_more: false,
                    },
                }),
                {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                },
            ),
        );

        await courseApi.listMy({ page: 1, pageSize: 20, sortBy: 'updatedAt', sortOrder: 'desc' });

        expect(fetchMock).toHaveBeenCalledWith(
            '/api/v1/courses?page=1&page_size=20&sort_by=updated_at&sort_order=desc',
            expect.objectContaining({
                method: 'GET',
            }),
        );
    });
});
