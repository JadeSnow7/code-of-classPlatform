import type { ApiClient } from './http';
import type { WorkspaceJob, WorkspaceSimulationParams, SubmitWorkspaceSimulationResponse } from '../types';

export function createWorkspaceApi(client: ApiClient) {
  return {
    listJobs: () => client.get<WorkspaceJob[]>('/workspace/jobs'),
    getJob: (jobId: string) => client.get<WorkspaceJob>(`/workspace/jobs/${jobId}`),
    submitSimulation: (payload: WorkspaceSimulationParams) =>
      client.post<SubmitWorkspaceSimulationResponse>('/workspace/simulations', payload),
  };
}
