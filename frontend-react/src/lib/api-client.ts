import { createApi, createApiClient, createBrowserUploadFn, ApiRequestError } from '@classplatform/shared';
import { authStore } from './auth-store';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

const apiConfig = {
    baseUrl: API_BASE_URL,
    getAccessToken: () => authStore.getToken(),
    getTokenType: () => 'Bearer',
    onUnauthorized: ({ url }: { url: string }) => {
        if (url.includes('/auth/login') || url.includes('/auth/wecom')) return;
        authStore.clearToken();
        window.location.href = '/login';
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
