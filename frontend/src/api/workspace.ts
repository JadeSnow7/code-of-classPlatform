import { api } from '@/lib/api-client';
import type {
    WorkspaceJob,
    WorkspaceSimulationParams,
    SubmitWorkspaceSimulationResponse,
} from '@classplatform/shared';

export type { WorkspaceJob, WorkspaceSimulationParams, SubmitWorkspaceSimulationResponse };
export const workspaceApi = api.workspace;
