import React, { act } from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithQueryClient } from '@/test/render-with-query';
import { Quiz } from '@/pages/edugraph/Quiz';

const {
    listCourseQuizzesMock,
    getQuizDetailMock,
    createAttemptMock,
    updateAttemptAnswersMock,
    submitAttemptMock,
} = vi.hoisted(() => ({
    listCourseQuizzesMock: vi.fn(),
    getQuizDetailMock: vi.fn(),
    createAttemptMock: vi.fn(),
    updateAttemptAnswersMock: vi.fn(),
    submitAttemptMock: vi.fn(),
}));

function suppressUnhandledRejection(event: PromiseRejectionEvent) {
    event.preventDefault();
}

function suppressNodeUnhandledRejection() {}

vi.mock('motion/react', () => ({
    motion: {
        div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/api/quiz', () => ({
    quizApi: {
        listCourseQuizzes: listCourseQuizzesMock,
        getQuizDetail: getQuizDetailMock,
        createAttempt: createAttemptMock,
        updateAttemptAnswers: updateAttemptAnswersMock,
        submitAttempt: submitAttemptMock,
    },
}));

describe('Quiz', () => {
    beforeEach(() => {
        listCourseQuizzesMock.mockReset();
        getQuizDetailMock.mockReset();
        createAttemptMock.mockReset();
        updateAttemptAnswersMock.mockReset();
        submitAttemptMock.mockReset();
        window.addEventListener('unhandledrejection', suppressUnhandledRejection);
        process.on('unhandledRejection', suppressNodeUnhandledRejection);
    });

    afterEach(() => {
        window.removeEventListener('unhandledrejection', suppressUnhandledRejection);
        process.off('unhandledRejection', suppressNodeUnhandledRejection);
    });

    it('shows a loading skeleton while published quizzes are loading', () => {
        listCourseQuizzesMock.mockImplementation(
            () =>
                new Promise(() => {
                    // Keep pending to verify skeleton state.
                }),
        );

        renderWithQueryClient(<Quiz />);

        expect(document.querySelector('.animate-pulse')).toBeTruthy();
    });

    it('shows an empty state when the course has no published quizzes', async () => {
        listCourseQuizzesMock.mockResolvedValue({
            items: [],
            total: 0,
            page: 1,
            pageSize: 20,
            totalPages: 0,
            hasMore: false,
        });

        renderWithQueryClient(<Quiz />);

        await screen.findByText('暂无测验');
    });

    it('renders the result view after the attempt is submitted', async () => {
        listCourseQuizzesMock.mockResolvedValue({
            items: [
                {
                    id: 7,
                    title: '矩阵测验',
                    status: 'published',
                    durationMinutes: 30,
                    questionCount: 1,
                },
            ],
            total: 1,
            page: 1,
            pageSize: 20,
            totalPages: 1,
            hasMore: false,
        });
        getQuizDetailMock.mockResolvedValue({
            quiz: {
                id: 7,
                title: '矩阵测验',
                status: 'published',
                durationMinutes: 30,
            },
            questions: [
                {
                    id: 101,
                    type: 'single_choice',
                    content: '矩阵 A 的秩是多少？',
                    points: 10,
                    options: [
                        { key: 'A', label: '1' },
                        { key: 'B', label: '2' },
                    ],
                },
            ],
        });
        createAttemptMock.mockResolvedValue({
            id: 55,
            deadline: '2026-03-21T12:00:00Z',
        });
        updateAttemptAnswersMock.mockResolvedValue(null);
        submitAttemptMock.mockResolvedValue({
            score: 9,
            maxScore: 10,
            attempt: {
                id: 55,
                deadline: '2026-03-21T12:00:00Z',
            },
        });

        renderWithQueryClient(<Quiz />);

        fireEvent.click(await screen.findByRole('button', { name: '开始测验' }));
        await screen.findByText(/矩阵 A 的秩是多少/);

        fireEvent.click(screen.getAllByText('1')[1].closest('button') as HTMLButtonElement);
        await waitFor(() => {
            expect(updateAttemptAnswersMock).toHaveBeenCalledWith(55, [{ questionId: '101', answer: 'A' }]);
        });

        fireEvent.click(screen.getByRole('button', { name: '交卷' }));

        await screen.findByText('测验完成');
        expect(screen.getByText('9')).toBeTruthy();
        expect(screen.getByText('90%')).toBeTruthy();
    });

    it('recovers button loading state if submission fails', async () => {
        listCourseQuizzesMock.mockResolvedValue({
            items: [
                {
                    id: 8,
                    title: '错误恢复测验',
                    status: 'published',
                    durationMinutes: 30,
                    questionCount: 1,
                },
            ],
            total: 1,
            page: 1,
            pageSize: 20,
            totalPages: 1,
            hasMore: false,
        });
        getQuizDetailMock.mockResolvedValue({
            quiz: {
                id: 8,
                title: '错误恢复测验',
                status: 'published',
                durationMinutes: 30,
            },
            questions: [
                {
                    id: 102,
                    type: 'single_choice',
                    content: '测试题',
                    points: 10,
                    options: [
                        { key: 'A', label: '1' },
                        { key: 'B', label: '2' },
                    ],
                },
            ],
        });
        createAttemptMock.mockResolvedValue({
            id: 56,
            deadline: '2026-03-21T12:00:00Z',
        });
        updateAttemptAnswersMock.mockResolvedValue(null);
        submitAttemptMock.mockRejectedValue(new Error('Submit Error'));

        renderWithQueryClient(<Quiz />);

        fireEvent.click(await screen.findByRole('button', { name: '开始测验' }));
        await screen.findByText(/测试题/);

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: '交卷' }));
        });

        await waitFor(() => {
            const btn = screen.getByRole('button', { name: '交卷' }) as HTMLButtonElement;
            expect(btn.disabled).toBe(false);
        });
    });
});
