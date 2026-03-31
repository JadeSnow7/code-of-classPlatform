import React from 'react';
import { act } from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithQueryClient } from '@/test/render-with-query';
import { WritingStudio } from '@/pages/edugraph/WritingStudio';

const { createSubmissionMock, updateSubmissionMock, requestAiFeedbackMock, getRevisionsMock } = vi.hoisted(() => ({
    createSubmissionMock: vi.fn(),
    updateSubmissionMock: vi.fn(),
    requestAiFeedbackMock: vi.fn(),
    getRevisionsMock: vi.fn(),
}));

function suppressUnhandledRejection(event: PromiseRejectionEvent) {
    event.preventDefault();
}

function suppressNodeUnhandledRejection() {
    // Ignore expected mutation failures triggered by void mutateAsync in the component.
}

vi.mock('recharts', () => ({
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    RadarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Radar: () => <div />,
    PolarGrid: () => <div />,
    PolarAngleAxis: () => <div />,
    PolarRadiusAxis: () => <div />,
    Tooltip: () => <div />,
}));

vi.mock('@/api/writing', () => ({
    writingApi: {
        createSubmission: createSubmissionMock,
        updateSubmission: updateSubmissionMock,
        requestAiFeedback: requestAiFeedbackMock,
        getRevisions: getRevisionsMock,
    },
}));

describe('WritingStudio', () => {
    async function flushMicrotasks() {
        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
        });
    }

    beforeEach(() => {
        createSubmissionMock.mockReset();
        updateSubmissionMock.mockReset();
        requestAiFeedbackMock.mockReset();
        getRevisionsMock.mockReset();
        window.addEventListener('unhandledrejection', suppressUnhandledRejection);
        process.on('unhandledRejection', suppressNodeUnhandledRejection);
    });

    afterEach(() => {
        window.removeEventListener('unhandledrejection', suppressUnhandledRejection);
        process.off('unhandledRejection', suppressNodeUnhandledRejection);
    });

    it('switches autosave status from saving to saved after a successful draft sync', async () => {
        createSubmissionMock.mockResolvedValue({
            id: 'sub-1',
            title: '未命名稿件',
            content: '',
        });
        updateSubmissionMock.mockImplementation(async (_id, payload) => ({
            id: 'sub-1',
            title: payload.title ?? '未命名稿件',
            content: payload.content ?? '',
        }));
        requestAiFeedbackMock.mockResolvedValue({
            overallScore: 0,
            summary: '',
            dimensions: [],
        });

        renderWithQueryClient(<WritingStudio />);
        await flushMicrotasks();

        const editor = screen.getByPlaceholderText('开始写作你的论文...');

        fireEvent.change(editor, {
            target: { value: '这是一次自动保存测试内容，这是一次自动保存测试内容，用于覆盖五十字门槛。' },
        });

        expect(screen.getByText('保存中...')).toBeTruthy();

        await act(async () => {
            await new Promise((resolve) => window.setTimeout(resolve, 1300));
        });
        await flushMicrotasks();

        await waitFor(() => {
            expect(updateSubmissionMock).toHaveBeenCalled();
            expect(screen.getByText('已保存')).toBeTruthy();
        });
    });

    it('restores the autosave indicator when a draft sync fails', async () => {
        createSubmissionMock.mockResolvedValue({
            id: 'sub-2',
            title: '未命名稿件',
            content: '',
        });
        updateSubmissionMock
            .mockImplementationOnce(async (_id, payload) => ({
                id: 'sub-2',
                title: payload.title ?? '未命名稿件',
                content: payload.content ?? '',
            }))
            .mockImplementationOnce(() => {
                throw new Error('save failed');
            });
        requestAiFeedbackMock.mockResolvedValue({
            overallScore: 0,
            summary: '',
            dimensions: [],
        });

        renderWithQueryClient(<WritingStudio />);
        await flushMicrotasks();

        const editor = screen.getByPlaceholderText('开始写作你的论文...');
        await act(async () => {
            await new Promise((resolve) => window.setTimeout(resolve, 1300));
        });
        await flushMicrotasks();

        fireEvent.change(editor, {
            target: { value: '失败恢复测试内容，失败恢复测试内容，失败恢复测试内容，失败恢复测试内容。' },
        });

        expect(screen.getByText('保存中...')).toBeTruthy();

        await act(async () => {
            await new Promise((resolve) => window.setTimeout(resolve, 1300));
        });
        await flushMicrotasks();

        await waitFor(() => {
            expect(screen.getByText('自动保存')).toBeTruthy();
        });
    });

    it('shows an empty state when there are no revision snapshots yet', async () => {
        createSubmissionMock.mockResolvedValue({
            id: 'sub-3',
            title: '未命名稿件',
            content: '',
        });
        updateSubmissionMock.mockImplementation(async (_id, payload) => ({
            id: 'sub-3',
            title: payload.title ?? '未命名稿件',
            content: payload.content ?? '',
        }));
        getRevisionsMock.mockResolvedValue({
            items: [],
            total: 0,
            page: 1,
            pageSize: 10,
            totalPages: 0,
            hasMore: false,
        });

        renderWithQueryClient(<WritingStudio />);

        await flushMicrotasks();
        screen.getByPlaceholderText('开始写作你的论文...');
        fireEvent.click(screen.getByRole('button', { name: '🕐 修改历史' }));

        await waitFor(() => {
            expect(screen.getByText('暂无修订历史')).toBeTruthy();
        });
    });

    it('recovers button state when AI feedback request fails', async () => {
        createSubmissionMock.mockResolvedValue({
            id: 'sub-4',
            title: '测试恢复',
            content: '',
        });
        updateSubmissionMock.mockImplementation(async (_id, payload) => ({
            id: 'sub-4',
            title: payload.title ?? '测试恢复',
            content: payload.content ?? '',
        }));
        requestAiFeedbackMock.mockRejectedValue(new Error('API failure'));

        renderWithQueryClient(<WritingStudio />);
        await flushMicrotasks();

        const editor = screen.getByPlaceholderText('开始写作你的论文...');
        fireEvent.change(editor, {
            target: { value: 'A'.repeat(60) },
        });

        await act(async () => {
            await new Promise((resolve) => window.setTimeout(resolve, 1300));
        });
        await flushMicrotasks();

        const btn = screen.getByRole('button', { name: /获取 AI 反馈/ });
        expect((btn as HTMLButtonElement).disabled).toBe(false);

        await act(async () => {
            fireEvent.click(btn);
        });

        await waitFor(() => {
            expect((btn as HTMLButtonElement).disabled).toBe(false);
        });
        expect(screen.getByRole('button', { name: /获取 AI 反馈/ })).toBeTruthy();
    });
});
