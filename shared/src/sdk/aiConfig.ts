import type { ApiClient } from './http';
import type { AIConfigProfile, UpdateAIConfigRequest } from '../types';

export function createAiConfigApi(client: ApiClient) {
  return {
    get: () => client.get<AIConfigProfile>('/users/me/ai-config'),
    patch: (payload: UpdateAIConfigRequest) =>
      client.patch<AIConfigProfile>('/users/me/ai-config', payload),
  };
}
