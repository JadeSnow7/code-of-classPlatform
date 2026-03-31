import React from 'react';
import { act } from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithQueryClient } from '@/test/render-with-query';
import { Simulations } from '@/pages/edugraph/Simulations';

const { createSimulationMock, getJobMock } = vi.hoisted(() => ({
    createSimulationMock: vi.fn(),
    getJobMock: vi.fn(),
}));

function suppressUnhandledRejection(event: PromiseRejectionEvent) {
    event.preventDefault();
}

function suppressNodeUnhandledRejection() {
    // Ignore expected mutation failures triggered by void mutateAsync in the component.
}

vi.mock('motion/react', () => ({
    motion: {
        div: ({ children, layout: _layout, ...props }: React.HTMLAttributes<HTMLDivElement> & { layout?: boolean }) => <div {...props}>{children}</div>,
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/api/sim', () => ({
    simApi: {
        createSimulation: createSimulationMock,
        getJob: getJobMock,
    },
}));

describe('Simulations', () => {
    async function flushMicrotasks() {
        await act(async () => {
            await Promise.resolve();
        });
    }

    beforeEach(() => {
        vi.useFakeTimers();
        createSimulationMock.mockReset();
        getJobMock.mockReset();
        window.addEventListener('unhandledrejection', suppressUnhandledRejection);
        process.on('unhandledRejection', suppressNodeUnhandledRejection);
    });

    afterEach(() => {
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
        window.removeEventListener('unhandledrejection', suppressUnhandledRejection);
        process.off('unhandledRejection', suppressNodeUnhandledRejection);
    });

    it('shows an empty state before any jobs are created', () => {
        renderWithQueryClient(<Simulations />);

        expect(screen.getByText('暂无模拟任务')).toBeTruthy();
    });

    it('creates a job, enters the polling flow, and stops polling after the job reaches a terminal state', async () => {
        createSimulationMock.mockResolvedValue({
            jobId: 'job-1',
            status: 'queued',
        });
        getJobMock
            .mockResolvedValueOnce({
                id: 'job-1',
                status: 'running',
                progress: 35,
                error: null,
                result: null,
            })
            .mockResolvedValueOnce({
                id: 'job-1',
                status: 'succeeded',
                progress: 100,
                error: null,
                result: { summary: 'done' },
            });

        renderWithQueryClient(<Simulations />);

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /新建任务/ }));
            await Promise.resolve();
        });
        await flushMicrotasks();

        expect(screen.getByText(/KG 概念提取/)).toBeTruthy();
        expect(screen.getAllByText('排队中').length).toBeGreaterThan(0);
        expect(getJobMock).toHaveBeenCalledTimes(1);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(3000);
        });
        await flushMicrotasks();

        expect(screen.getAllByText('运行中').length).toBeGreaterThan(0);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(3000);
        });
        await flushMicrotasks();

        expect(screen.getAllByText('已完成').length).toBeGreaterThan(0);
        const callsAfterTerminal = getJobMock.mock.calls.length;

        await act(async () => {
            await vi.advanceTimersByTimeAsync(9000);
        });
        await flushMicrotasks();
        expect(getJobMock.mock.calls.length).toBe(callsAfterTerminal);
    });

    it('recovers button state when simulation creation fails', async () => {
        createSimulationMock.mockRejectedValue(new Error('API failure'));
        renderWithQueryClient(<Simulations />);

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /新建任务/ }));
        });
        
        const recoveredBtn = screen.getByRole('button', { name: /新建任务/ }) as HTMLButtonElement;
        expect(recoveredBtn.disabled).toBe(false);
        expect(screen.getByText('暂无模拟任务')).toBeTruthy();
    });
});
