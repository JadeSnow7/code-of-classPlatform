export type WorkspaceJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export type WorkspaceSimulationParams = {
  type: 'laplace2d' | 'fdtd' | 'waveguide' | string;
  frequency_mhz?: number;
  grid_resolution: 'coarse' | 'medium' | 'fine';
  boundary_condition: 'pml' | 'pec' | 'periodic';
  duration_ns?: number;
  [key: string]: unknown;
};

export type WorkspaceSimulationResult = {
  id?: string;
  png_base64?: string;
  metadata?: {
    computation_time?: number;
    iterations?: number;
    grid_size?: number[];
    peak_field_value?: number;
    [key: string]: unknown;
  };
  created_at?: string;
};

export type WorkspaceJob = {
  id: string;
  name: string;
  status: WorkspaceJobStatus;
  progress: number;
  cpu_usage?: number;
  gpu_usage?: number;
  memory_used?: string;
  estimated_seconds?: number;
  result?: WorkspaceSimulationResult | null;
  error?: string;
  created_at: string;
  completed_at?: string;
};

export type SubmitWorkspaceSimulationResponse = {
  id: string;
  status: Extract<WorkspaceJobStatus, 'queued' | 'running'>;
};
