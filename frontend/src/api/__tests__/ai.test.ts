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

import { aiApi } from '@/api/ai';
import { authStore } from '@/lib/auth-store';

function createSseResponse(chunks: string[]) {
    const encoder = new TextEncoder();

    return new Response(
        new ReadableStream({
            start(controller) {
                chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
                controller.close();
            },
        }),
        {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
        },
    );
}

describe('aiApi.streamRun', () => {
    beforeEach(() => {
        localStorage.clear();
        authStore.setSession({
            accessToken: 'token-1',
            tokenType: 'Bearer',
        });
    });

    it('parses token, tool_call, error and done events from the new sse contract', async () => {
        const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
            createSseResponse([
                'event: token\ndata: {"text":"你好"}\n\n',
                'event: tool_call\ndata: {"tool_name":"search_knowledge_graph","arguments":{"course_id":1},"call_id":"call-1"}\n\n',
                'event: error\ndata: {"code":"TOOL_TIMEOUT","message":"检索超时"}\n\n',
                'event: done\ndata: {"run_id":"run-1","usage":{"prompt_tokens":12,"completion_tokens":4}}\n\n',
            ]),
        );

        vi.stubGlobal('fetch', fetchMock);

        const events: Array<Record<string, unknown>> = [];
        await aiApi.streamRun(
            'session-1',
            {
                input: [{ id: 'msg-1', role: 'user', content: '你好' }],
                stream: true,
            },
            {
                onEvent: (event) => events.push(event as unknown as Record<string, unknown>),
            },
        );

        expect(events).toEqual([
            { event: 'token', data: { text: '你好' } },
            {
                event: 'tool_call',
                data: {
                    toolName: 'search_knowledge_graph',
                    arguments: { courseId: 1 },
                    callId: 'call-1',
                },
            },
            { event: 'error', data: { code: 'TOOL_TIMEOUT', message: '检索超时' } },
            {
                event: 'done',
                data: {
                    runId: 'run-1',
                    usage: {
                        promptTokens: 12,
                        completionTokens: 4,
                    },
                },
            },
        ]);
        expect(fetchMock).toHaveBeenCalledWith(
            '/api/v1/ai/sessions/session-1/runs',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    Accept: 'text/event-stream',
                    Authorization: 'Bearer token-1',
                }),
                body: JSON.stringify({
                    input: [{ id: 'msg-1', role: 'user', content: '你好' }],
                    stream: true,
                }),
            }),
        );
    });
});
