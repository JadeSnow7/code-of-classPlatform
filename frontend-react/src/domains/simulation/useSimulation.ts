import { useState, useCallback } from 'react';
import { simService, type SimulationParams, type SimulationResult } from '@/services/sim';

type SimStatus = 'idle' | 'running' | 'success' | 'error';

interface UseSimulationReturn {
    status: SimStatus;
    result: SimulationResult | null;
    error: string | null;
    runLaplace2D: (params: SimulationParams) => Promise<void>;
    runPointCharges: (params: SimulationParams) => Promise<void>;
    runWireField: (params: SimulationParams) => Promise<void>;
    reset: () => void;
}

export function useSimulation(): UseSimulationReturn {
    const [status, setStatus] = useState<SimStatus>('idle');
    const [result, setResult] = useState<SimulationResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const runSimulation = useCallback(
        async (simFn: (params: SimulationParams) => Promise<SimulationResult>, params: SimulationParams) => {
            setStatus('running');
            setError(null);
            try {
                const data = await simFn(params);
                setResult(data);
                setStatus('success');
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Simulation failed');
                setStatus('error');
            }
        },
        []
    );

    const runLaplace2D = useCallback(
        (params: SimulationParams) => runSimulation(simService.runLaplace2D, params),
        [runSimulation]
    );

    const runPointCharges = useCallback(
        (params: SimulationParams) => runSimulation(simService.runPointCharges, params),
        [runSimulation]
    );

    const runWireField = useCallback(
        (params: SimulationParams) => runSimulation(simService.runWireField, params),
        [runSimulation]
    );

    const reset = useCallback(() => {
        setStatus('idle');
        setResult(null);
        setError(null);
    }, []);

    return {
        status,
        result,
        error,
        runLaplace2D,
        runPointCharges,
        runWireField,
        reset,
    };
}
