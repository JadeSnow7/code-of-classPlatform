import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithQueryClient } from '@/test/render-with-query';
import { AIAssistant } from '@/pages/edugraph/AIAssistant';

const { createAiSessionMock, streamRunMock } = vi.hoisted(() => ({
    createAiSessionMock: vi.fn(),
    streamRunMock: vi.fn(),
}));

vi.mock('@/api/ai', () => ({
    aiApi: {
        createAiSession: createAiSessionMock,
        streamRun: streamRunMock,
    },
}));

describe('AIAssistant', () => {
    beforeEach(() => {
        createAiSessionMock.mockReset();
        streamRunMock.mockReset();
        Element.prototype.scrollIntoView = vi.fn();
    });

    it('shows a chat skeleton while the session handshake is still loading', async () => {
        createAiSessionMock.mockImplementation(
            () =>
                new Promise(() => {
                    // Keep pending to verify skeleton state.
                }),
        );

        renderWithQueryClient(<AIAssistant />);

        expect(screen.getByPlaceholderText('输入问题，Enter 发送，Shift+Enter 换行...')).toBeTruthy();
        await waitFor(() => {
            expect(document.querySelector('.animate-pulse')).toBeTruthy();
        });
    });

    it('streams token chunks into the assistant bubble progressively', async () => {
        createAiSessionMock.mockResolvedValue({ sessionId: 'session-1' });
        streamRunMock.mockImplementation(async (_sessionId, _payload, options) => {
            options.onEvent({ event: 'token', data: { text: '第一段' } });
            await Promise.resolve();
            options.onEvent({ event: 'token', data: { text: '第二段' } });
            options.onEvent({ event: 'done', data: { runId: 'run-1' } });
        });

        renderWithQueryClient(<AIAssistant />);

        await screen.findByText('AI 会话已创建。你可以直接提问，系统会通过新的 Session / Runs 协议流式返回回答。');

        fireEvent.change(screen.getByPlaceholderText('输入问题，Enter 发送，Shift+Enter 换行...'), {
            target: { value: '解释矩阵分解' },
        });
        fireEvent.keyDown(screen.getByPlaceholderText('输入问题，Enter 发送，Shift+Enter 换行...'), {
            key: 'Enter',
            code: 'Enter',
        });

        await screen.findByText('解释矩阵分解');
        await waitFor(() => {
            expect(screen.getByText('第一段第二段')).toBeTruthy();
        });
    });

    it('recovers from a stream failure and surfaces the error state', async () => {
        createAiSessionMock.mockResolvedValue({ sessionId: 'session-2' });
        streamRunMock.mockRejectedValue(new Error('network down'));

        renderWithQueryClient(<AIAssistant />);

        await screen.findByText('AI 会话已创建。你可以直接提问，系统会通过新的 Session / Runs 协议流式返回回答。');

        fireEvent.change(screen.getByPlaceholderText('输入问题，Enter 发送，Shift+Enter 换行...'), {
            target: { value: '解释特征值' },
        });
        fireEvent.click(screen.getByRole('button', { name: '发送消息' }));

        await screen.findByText('network down');
        fireEvent.change(screen.getByPlaceholderText('输入问题，Enter 发送，Shift+Enter 换行...'), {
            target: { value: '继续提问' },
        });
        await waitFor(() => {
            expect(screen.getByRole('button', { name: '发送消息' }).hasAttribute('disabled')).toBe(false);
            expect(screen.getByText(/Session session-/)).toBeTruthy();
        });
    });
});
