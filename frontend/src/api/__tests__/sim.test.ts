import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getJobMock, submitSimulationMock } = vi.hoisted(() => ({
    getJobMock: vi.fn(),
    submitSimulationMock: vi.fn(),
}));

vi.mock('@classplatform/shared', () => ({
    createApi: () => ({
        ai: {
            streamChat: vi.fn(),
            streamOrchestratedChat: vi.fn(),
        },
        quiz: {},
        workspace: {
            getJob: getJobMock,
            submitSimulation: submitSimulationMock,
        },
    }),
    createApiClient: () => ({}),
    createBrowserUploadFn: () => vi.fn(),
}));

import { simApi } from '@/api/sim';

describe('simApi', () => {
    beforeEach(() => {
        getJobMock.mockReset();
        submitSimulationMock.mockReset();
    });

    it('delegates simulation creation to the workspace route family', async () => {
        submitSimulationMock.mockResolvedValue({ id: 'job-1', status: 'queued' });

        await expect(simApi.createSimulation({ type: 'kg_extract' })).resolves.toEqual({
            jobId: 'job-1',
            status: 'queued',
        });
        expect(submitSimulationMock).toHaveBeenCalledWith({ type: 'kg_extract' });
    });

    it('delegates job polling to the workspace job endpoint', async () => {
        getJobMock.mockResolvedValue({
            id: 'job-1',
            status: 'running',
            progress: 50,
            error: null,
            result: null,
        });

        await expect(simApi.getJob('job-1')).resolves.toMatchObject({
            id: 'job-1',
            status: 'running',
        });
        expect(getJobMock).toHaveBeenCalledWith('job-1');
    });
});
