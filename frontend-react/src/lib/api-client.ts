import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { authStore } from './auth-store';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export const apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor: attach JWT token
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const token = authStore.getToken();
    if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Response interceptor: handle errors & unwrap data
apiClient.interceptors.response.use(
    (response) => {
        const payload = response.data;
        if (payload && typeof payload === 'object') {
            // Envelope format
            if ('success' in payload) {
                if (payload.success) {
                    return { ...response, data: payload.data };
                }
                const message = payload.error?.message ?? 'Request failed';
                return Promise.reject(new Error(message));
            }
            // Legacy { data } format (without success field)
            if ('data' in payload) {
                return { ...response, data: payload.data };
            }
        }
        return response;
    },
    (error: AxiosError) => {
        if (error.response) {
            const url = error.config?.url || '';
            switch (error.response.status) {
                case 401:
                    // Don't redirect to login for login/auth endpoints
                    if (!url.includes('/auth/login') && !url.includes('/auth/wecom')) {
                        authStore.clearToken();
                        window.location.href = '/login';
                    }
                    break;
                case 403:
                    console.error('Permission denied: 403');
                    // Optional: Trigger a global toast or event here
                    break;
            }
        }
        return Promise.reject(error);
    }
);

export interface ApiError {
    code: string;
    message: string;
    details?: unknown;
}

export function isApiError(error: unknown): error is { response: { data: { error: ApiError } } } {
    return (
        axios.isAxiosError(error) &&
        error.response?.data?.error !== undefined
    );
}
