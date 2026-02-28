import type { ApiClient } from './http';
import type { DashboardSummary } from '../types';

export function createDashboardApi(client: ApiClient) {
  return {
    get: () => client.get<DashboardSummary>('/users/me/dashboard'),
  };
}
