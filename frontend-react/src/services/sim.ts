import { apiClient } from './api/client';

const MOCK_MODE = import.meta.env.VITE_MOCK_API === 'true';

/**
 * Parameters accepted by simulation endpoints.
 */
export interface SimulationParams {
    /** Optional boundary condition descriptor. */
    boundary?: string;
    /** Optional grid size [rows, cols]. */
    grid?: [number, number];
    /** Additional parameters passed to the backend. */
    [key: string]: unknown;
}

/**
 * Simulation response containing a base64 PNG payload.
 */
export interface SimulationResult {
    /** Base64-encoded PNG image string. */
    png_base64: string;
    /** Optional metadata returned by the backend. */
    metadata?: Record<string, unknown>;
}

// Static mock image (1x1 gray pixel)
const MOCK_IMAGE =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

export const simService = {
    /**
     * Run a Laplace 2D simulation.
     *
     * @param params Simulation parameters.
     * @returns The simulation result.
     */
    async runLaplace2D(params: SimulationParams): Promise<SimulationResult> {
        if (MOCK_MODE) {
            await new Promise((r) => setTimeout(r, 500)); // Simulate latency
            return { png_base64: MOCK_IMAGE };
        }

        const response = await apiClient.post<SimulationResult>('/sim/laplace2d', params);
        return response;
    },

    /**
     * Run a point charges simulation.
     *
     * @param params Simulation parameters.
     * @returns The simulation result.
     */
    async runPointCharges(params: SimulationParams): Promise<SimulationResult> {
        if (MOCK_MODE) {
            await new Promise((r) => setTimeout(r, 500));
            return { png_base64: MOCK_IMAGE };
        }

        const response = await apiClient.post<SimulationResult>('/sim/point_charges', params);
        return response;
    },

    /**
     * Run a wire field simulation.
     *
     * @param params Simulation parameters.
     * @returns The simulation result.
     */
    async runWireField(params: SimulationParams): Promise<SimulationResult> {
        if (MOCK_MODE) {
            await new Promise((r) => setTimeout(r, 500));
            return { png_base64: MOCK_IMAGE };
        }

        const response = await apiClient.post<SimulationResult>('/sim/wire_field', params);
        return response;
    },
};
