import { apiClient } from './api/client';

const MOCK_MODE = import.meta.env.VITE_MOCK_API === 'true';

export interface SimulationParams {
    boundary?: string;
    grid?: [number, number];
    [key: string]: unknown;
}

export interface SimulationResult {
    png_base64: string;
    metadata?: Record<string, unknown>;
}

// Static mock image (1x1 gray pixel)
const MOCK_IMAGE =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

export const simService = {
    async runLaplace2D(params: SimulationParams): Promise<SimulationResult> {
        if (MOCK_MODE) {
            await new Promise((r) => setTimeout(r, 500)); // Simulate latency
            return { png_base64: MOCK_IMAGE };
        }

        const response = await apiClient.post<SimulationResult>('/sim/laplace2d', params);
        return response.data;
    },

    async runPointCharges(params: SimulationParams): Promise<SimulationResult> {
        if (MOCK_MODE) {
            await new Promise((r) => setTimeout(r, 500));
            return { png_base64: MOCK_IMAGE };
        }

        const response = await apiClient.post<SimulationResult>('/sim/point_charges', params);
        return response.data;
    },

    async runWireField(params: SimulationParams): Promise<SimulationResult> {
        if (MOCK_MODE) {
            await new Promise((r) => setTimeout(r, 500));
            return { png_base64: MOCK_IMAGE };
        }

        const response = await apiClient.post<SimulationResult>('/sim/wire_field', params);
        return response.data;
    },
};
