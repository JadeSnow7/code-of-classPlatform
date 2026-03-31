import { api } from '@/lib/api-client';

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface SimulationJob {
    id: string;
    status: JobStatus;
    progress: number;
    error: { code: string; message: string } | null;
    result: Record<string, unknown> | null;
    createdAt?: string;
    startedAt?: string | null;
    finishedAt?: string | null;
    type?: string;
    label?: string;
}

function fromWorkspaceStatus(status: string): JobStatus {
    switch (status) {
        case 'completed':
            return 'succeeded';
        case 'failed':
            return 'failed';
        case 'queued':
            return 'queued';
        case 'running':
            return 'running';
        default:
            return 'cancelled';
    }
}

export const simApi = {
    async createSimulation(payload: Record<string, unknown>) {
        const result = await api.workspace.submitSimulation(payload as never);
        return {
            jobId: result.id,
            status: fromWorkspaceStatus(result.status),
        };
    },
    async getJob(jobId: string): Promise<SimulationJob> {
        const job = await api.workspace.getJob(jobId);
        return {
            id: job.id,
            status: fromWorkspaceStatus(job.status),
            progress: job.progress,
            error: job.error ? { code: 'WORKSPACE_JOB_ERROR', message: job.error } : null,
            result: job.result ?? null,
            createdAt: job.created_at,
            startedAt: undefined,
            finishedAt: job.completed_at ?? null,
        };
    },
};
