import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { getToken, clearToken } from './getAuthHeaders';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export const apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor: attach JWT token
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const token = getToken();
    if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Response interceptor: handle errors
apiClient.interceptors.response.use(
    (response) => {
        // Unwrap { success, data } pattern if present
        if (response.data && typeof response.data === 'object' && 'data' in response.data) {
            return { ...response, data: response.data.data };
        }
        return response;
    },
    (error: AxiosError) => {
        if (error.response?.status === 401) {
            clearToken();
            window.location.href = '/login';
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
