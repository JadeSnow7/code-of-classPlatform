import { useCallback, useEffect, useRef, useState } from 'react';
import { workspaceApi } from '@/api/workspace';

const POLL_INTERVAL_MS = 2000;

function resolveSimulationType(simulationType: string): string {
  if (simulationType === 'laplace') return 'laplace2d';
  if (simulationType === 'point_charge') return 'fdtd';
  return 'laplace2d';
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return '请求失败';
}

export interface RunSimulationInput {
  simulationType: string;
  code: string;
  params?: Record<string, unknown>;
}

export function useWorkspaceSimulation() {
  const [running, setRunning] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [resultBase64, setResultBase64] = useState<string | undefined>();
  const [statusText, setStatusText] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const pollingRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    pollingRef.current = false;
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const syncJob = useCallback(async (jobId: string): Promise<boolean> => {
    if (pollingRef.current) return false;
    pollingRef.current = true;
    try {
      const job = await workspaceApi.getJob(jobId);
      setStatusText(job.status);
      if (job.status === 'completed') {
        clearTimers();
        setRunning(false);
        setShowResult(true);
        setResultBase64(job.result?.png_base64);
        setErrorMessage(null);
        return true;
      }
      if (job.status === 'failed') {
        clearTimers();
        setRunning(false);
        setShowResult(false);
        setResultBase64(undefined);
        setErrorMessage(job.error ?? '仿真任务失败');
        return true;
      }
    } catch (error) {
      clearTimers();
      setRunning(false);
      setShowResult(false);
      setResultBase64(undefined);
      setStatusText('failed');
      setErrorMessage(getErrorMessage(error));
      return true;
    } finally {
      pollingRef.current = false;
    }
    return false;
  }, [clearTimers]);

  const runSimulation = useCallback(async ({ simulationType, code, params = {} }: RunSimulationInput) => {
    clearTimers();
    setRunning(true);
    setShowResult(false);
    setResultBase64(undefined);
    setStatusText('queued');
    setErrorMessage(null);

    try {
      const gridResolution =
        params.grid_resolution === 'medium' || params.grid_resolution === 'fine' ? params.grid_resolution : 'coarse';
      const boundaryCondition =
        params.boundary_condition === 'pml' || params.boundary_condition === 'periodic' ? params.boundary_condition : 'pec';
      const submitted = await workspaceApi.submitSimulation({
        ...params,
        type: resolveSimulationType(simulationType),
        grid_resolution: gridResolution,
        boundary_condition: boundaryCondition,
        code,
      });

      const terminal = await syncJob(submitted.id);
      if (!terminal && pollTimerRef.current === null) {
        pollTimerRef.current = window.setInterval(() => {
          void syncJob(submitted.id);
        }, POLL_INTERVAL_MS);
      }
    } catch (error) {
      setRunning(false);
      setShowResult(false);
      setResultBase64(undefined);
      setStatusText('failed');
      setErrorMessage(getErrorMessage(error));
    }
  }, [clearTimers, syncJob]);

  return {
    running,
    showResult,
    resultBase64,
    statusText,
    errorMessage,
    runSimulation,
  };
}
