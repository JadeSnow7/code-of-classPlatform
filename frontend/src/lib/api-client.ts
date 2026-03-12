import { createApi, createApiClient, createBrowserUploadFn, ApiRequestError } from '@classplatform/shared';
import { authStore } from './auth-store';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';
let refreshPromise: Promise<boolean> | null = null;

async function attemptRefresh(): Promise<boolean> {
    const refreshToken = authStore.getRefreshToken();
    if (!refreshToken) {
        return false;
    }
    if (!refreshPromise) {
        const anonymousClient = createApiClient({
            baseUrl: API_BASE_URL,
            timeoutMs: 60000,
        });
        refreshPromise = anonymousClient
            .post<{
                access_token: string;
                refresh_token?: string;
                token_type?: string;
                expires_in?: number;
                refresh_expires_in?: number;
            }>('/auth/refresh', {
                refresh_token: refreshToken,
            })
            .then((data) => {
                authStore.setSession({
                    accessToken: data.access_token,
                    refreshToken: data.refresh_token,
                    tokenType: data.token_type ?? 'Bearer',
                    expiresIn: data.expires_in,
                    refreshExpiresIn: data.refresh_expires_in,
                });
                return true;
            })
            .catch(() => {
                authStore.clearToken();
                return false;
            })
            .finally(() => {
                refreshPromise = null;
            });
    }
    return refreshPromise;
}

const apiConfig = {
    baseUrl: API_BASE_URL,
    getAccessToken: () => authStore.getToken(),
    getTokenType: () => authStore.getSession()?.tokenType ?? 'Bearer',
    onUnauthorized: async ({ url }: { url: string }) => {
        if (url.includes('/auth/login') || url.includes('/auth/wecom') || url.includes('/auth/refresh') || url.includes('/auth/register/activate')) {
            return false;
        }
        const refreshed = await attemptRefresh();
        if (refreshed) {
            return true;
        }
        authStore.clearToken();
        window.location.href = '/login';
        return false;
    },
    timeoutMs: 60000,
    uploadFn: createBrowserUploadFn(),
};

export const apiClient = createApiClient(apiConfig);
export const api = createApi(apiConfig);

/**
 * Standard error shape returned by backend APIs.
 */
export interface ApiError {
    /** Optional machine-readable error code. */
    code?: string;
    /** Human-readable error message. */
    message: string;
    /** Optional structured error details. */
    details?: unknown;
}

/**
 * Type guard for API request errors with a typed payload.
 *
 * @param error Unknown error value.
 * @returns True when the error matches the API error shape.
 */
export function isApiError(error: unknown): error is ApiRequestError & { payload: { error: ApiError } } {
    return error instanceof ApiRequestError && typeof error.payload === 'object' && error.payload !== null && 'error' in error.payload;
}
