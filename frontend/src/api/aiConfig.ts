import { api } from '@/lib/api-client';
import type { AIConfigProfile, UpdateAIConfigRequest } from '@classplatform/shared';
import { authStore } from '@/lib/auth-store';

export type { AIConfigProfile, UpdateAIConfigRequest };

export const aiConfigApi = api.aiConfig;

export async function testProviderConnection(): Promise<boolean> {
    try {
        const token = authStore.getToken();
        const resp = await fetch('/api/v1/auth/me', {
            method: 'GET',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        // Web only verifies platform-backend reachability.
        return resp.ok || resp.status === 401 || resp.status === 403;
    } catch {
        return false;
    }
}
