import { createApi, createApiClient as createLegacyApiClient, createBrowserUploadFn } from '@classplatform/shared';
import { authStore } from './auth-store';
import { notifyApiError } from './api-feedback';
import type { ApiError, ApiResponse } from '@/types/api';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';
let refreshPromise: Promise<boolean> | null = null;

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date) && !(value instanceof FormData) && !(value instanceof Blob);
}

function toSnakeCase(input: string): string {
    return input
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/[-\s]+/g, '_')
        .toLowerCase();
}

function toCamelCase(input: string): string {
    return input.replace(/[_-]([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

export function toSnakeCaseKeys<T>(value: T): T {
    if (Array.isArray(value)) {
        return value.map((item) => toSnakeCaseKeys(item)) as T;
    }
    if (!isPlainObject(value)) {
        return value;
    }

    return Object.entries(value).reduce<Record<string, unknown>>((result, [key, nestedValue]) => {
        result[toSnakeCase(key)] = toSnakeCaseKeys(nestedValue);
        return result;
    }, {}) as T;
}

export function toCamelCaseKeys<T>(value: T): T {
    if (Array.isArray(value)) {
        return value.map((item) => toCamelCaseKeys(item)) as T;
    }
    if (!isPlainObject(value)) {
        return value;
    }

    return Object.entries(value).reduce<Record<string, unknown>>((result, [key, nestedValue]) => {
        result[toCamelCase(key)] = toCamelCaseKeys(nestedValue);
        return result;
    }, {}) as T;
}

export function buildQueryParams(query?: Record<string, unknown>): string {
    if (!query) {
        return '';
    }

    const params = new URLSearchParams();
    const entries = Object.entries(toSnakeCaseKeys(query));
    for (const [key, value] of entries) {
        if (value === undefined || value === null || value === '') {
            continue;
        }
        if (Array.isArray(value)) {
            value.forEach((item) => params.append(key, String(item)));
            continue;
        }
        params.set(key, String(value));
    }
    const serialized = params.toString();
    return serialized ? `?${serialized}` : '';
}

function createIdempotencyKey(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isApiEnvelope(payload: unknown): payload is ApiResponse<unknown> {
    return isPlainObject(payload) && typeof payload.code === 'string' && typeof payload.message === 'string' && 'data' in payload;
}

function isAuthPath(url: string): boolean {
    return url.includes('/auth/login') || url.includes('/auth/refresh') || url.includes('/auth/wecom') || url.includes('/auth/register/activate');
}

export class ApiRequestError extends Error {
    httpStatus?: number;
    payload: { error: ApiError };

    constructor(message: string, payload: { error: ApiError }, httpStatus?: number) {
        super(message);
        this.name = 'ApiRequestError';
        this.httpStatus = httpStatus;
        this.payload = payload;
    }
}

async function parseResponseBody(response: Response): Promise<unknown> {
    if (response.status === 204) {
        return null;
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
        return response.json();
    }
    if (contentType.startsWith('text/')) {
        return response.text();
    }
    return response.arrayBuffer();
}

function normalizeErrorPayload(body: unknown, status: number): { error: ApiError } {
    if (isApiEnvelope(body)) {
        return {
            error: {
                code: body.code,
                message: body.message || `Request failed with status ${status}`,
                request_id: body.request_id,
                details: isPlainObject(body.data) ? (toCamelCaseKeys(body.data) as Record<string, unknown>) : undefined,
            },
        };
    }

    if (isPlainObject(body) && 'error' in body && isPlainObject(body.error)) {
        const error = body.error;
        return {
            error: {
                code: typeof error.code === 'string' ? error.code : undefined,
                message: typeof error.message === 'string' ? error.message : `Request failed with status ${status}`,
                request_id: typeof error.request_id === 'string' ? error.request_id : undefined,
                details: isPlainObject(error.details) ? (toCamelCaseKeys(error.details) as Record<string, unknown>) : undefined,
            },
        };
    }

    if (isPlainObject(body)) {
        return {
            error: {
                code: typeof body.code === 'string' ? body.code : undefined,
                message: typeof body.message === 'string' ? body.message : `Request failed with status ${status}`,
                request_id: typeof body.request_id === 'string' ? body.request_id : undefined,
                details: isPlainObject(body.details) ? (toCamelCaseKeys(body.details) as Record<string, unknown>) : undefined,
            },
        };
    }

    return {
        error: {
            message: typeof body === 'string' && body.trim() ? body : `Request failed with status ${status}`,
        },
    };
}

async function refreshSession(): Promise<boolean> {
    const refreshToken = authStore.getRefreshToken();
    if (!refreshToken) {
        return false;
    }

    if (!refreshPromise) {
        refreshPromise = fetch(`${API_BASE_URL}/auth/refresh`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                refresh_token: refreshToken,
            }),
        })
            .then(async (response) => {
                const body = await parseResponseBody(response);
                if (!response.ok || !isApiEnvelope(body) || body.code !== '0' || !body.data || !isPlainObject(body.data)) {
                    throw new Error('Refresh failed');
                }

                const data = toCamelCaseKeys(body.data) as {
                    accessToken: string;
                    refreshToken?: string;
                    tokenType?: string;
                    expiresIn?: number;
                    refreshExpiresIn?: number;
                };

                authStore.setSession({
                    accessToken: data.accessToken,
                    refreshToken: data.refreshToken,
                    tokenType: data.tokenType ?? 'Bearer',
                    expiresIn: data.expiresIn,
                    refreshExpiresIn: data.refreshExpiresIn,
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

type RequestOptions = {
    body?: unknown;
    headers?: Record<string, string>;
    query?: Record<string, unknown>;
    signal?: AbortSignal;
    idempotent?: boolean;
    rawBody?: boolean;
    rawResponse?: boolean;
    suppressErrorToast?: boolean;
    skipAuth?: boolean;
    retryUnauthorized?: boolean;
};

async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const retryUnauthorized = options.retryUnauthorized ?? true;
    const query = buildQueryParams(options.query);
    const url = `${API_BASE_URL}${path}${query}`;

    const headers: Record<string, string> = {
        Accept: 'application/json',
        ...(options.headers ?? {}),
    };

    if (!options.skipAuth) {
        const token = authStore.getToken();
        const tokenType = authStore.getSession()?.tokenType ?? 'Bearer';
        if (token) {
            headers.Authorization = `${tokenType} ${token}`;
        }
    }

    let body: BodyInit | undefined;
    if (options.body !== undefined) {
        if (options.body instanceof FormData || options.body instanceof Blob || typeof options.body === 'string') {
            body = options.body;
        } else {
            headers['Content-Type'] = 'application/json';
            body = JSON.stringify(options.rawBody ? options.body : toSnakeCaseKeys(options.body));
        }
    }

    if (options.idempotent && (method === 'POST' || method === 'PATCH')) {
        headers['Idempotency-Key'] = headers['Idempotency-Key'] ?? createIdempotencyKey();
    }

    const response = await fetch(url, {
        method,
        headers,
        body,
        signal: options.signal,
    });

    if (response.status === 401 && retryUnauthorized && !isAuthPath(path)) {
        const refreshed = await refreshSession();
        if (refreshed) {
            return request<T>(method, path, {
                ...options,
                retryUnauthorized: false,
            });
        }
        const redirect = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        authStore.clearToken();
        window.location.href = `/login?redirect=${encodeURIComponent(redirect)}`;
    }

    const parsedBody = await parseResponseBody(response);

    if (!response.ok) {
        const payload = normalizeErrorPayload(parsedBody, response.status);
        notifyApiError(payload.error.message, { silent: options.suppressErrorToast });
        throw new ApiRequestError(payload.error.message, payload, response.status);
    }

    if (options.rawResponse) {
        return parsedBody as T;
    }

    if (isApiEnvelope(parsedBody)) {
        if (parsedBody.code !== '0') {
            const payload = normalizeErrorPayload(parsedBody, response.status);
            notifyApiError(payload.error.message, { silent: options.suppressErrorToast });
            throw new ApiRequestError(payload.error.message, payload, response.status);
        }
        return toCamelCaseKeys(parsedBody.data) as T;
    }

    return toCamelCaseKeys(parsedBody) as T;
}

export const apiClient = {
    get<T>(path: string, options?: Omit<RequestOptions, 'body'>) {
        return request<T>('GET', path, options);
    },
    post<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>) {
        return request<T>('POST', path, { ...options, body });
    },
    patch<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>) {
        return request<T>('PATCH', path, { ...options, body });
    },
    delete<T>(path: string, options?: Omit<RequestOptions, 'body'>) {
        return request<T>('DELETE', path, options);
    },
    request,
    buildQueryParams,
    toSnakeCaseKeys,
    toCamelCaseKeys,
    createIdempotencyKey,
};

type SseListener<TEvent> = {
    onEvent: (event: TEvent) => void;
    signal?: AbortSignal;
    headers?: Record<string, string>;
    body?: unknown;
};

export async function streamSse<TEvent>(path: string, options: SseListener<TEvent>) {
    const token = authStore.getToken();
    const tokenType = authStore.getSession()?.tokenType ?? 'Bearer';
    const headers: Record<string, string> = {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
    };

    if (token) {
        headers.Authorization = `${tokenType} ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(toSnakeCaseKeys(options.body ?? {})),
        signal: options.signal,
    });

    if (!response.ok || !response.body) {
        const parsedBody = await parseResponseBody(response);
        const payload = normalizeErrorPayload(parsedBody, response.status);
        throw new ApiRequestError(payload.error.message, payload, response.status);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }

        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() ?? '';

        for (const chunk of chunks) {
            const lines = chunk.split('\n');
            let eventName = 'message';
            const dataLines: string[] = [];

            for (const line of lines) {
                if (line.startsWith('event:')) {
                    eventName = line.slice(6).trim();
                } else if (line.startsWith('data:')) {
                    dataLines.push(line.slice(5).trim());
                }
            }

            if (!dataLines.length) {
                continue;
            }

            const raw = dataLines.join('\n');
            const parsed = raw ? JSON.parse(raw) : null;
            options.onEvent(
                toCamelCaseKeys({
                    event: eventName,
                    data: parsed,
                }) as TEvent
            );
        }
    }
}

const legacyApiConfig = {
    baseUrl: API_BASE_URL,
    getAccessToken: () => authStore.getToken(),
    getTokenType: () => authStore.getSession()?.tokenType ?? 'Bearer',
    onUnauthorized: async ({ url }: { url: string }) => {
        if (isAuthPath(url)) {
            return false;
        }
        const refreshed = await refreshSession();
        if (refreshed) {
            return true;
        }
        authStore.clearToken();
        const redirect = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        window.location.href = `/login?redirect=${encodeURIComponent(redirect)}`;
        return false;
    },
    timeoutMs: 60000,
    uploadFn: createBrowserUploadFn(),
};

export const legacyApiClient = createLegacyApiClient(legacyApiConfig);
export const api = createApi(legacyApiConfig);

export function isApiError(error: unknown): error is ApiRequestError {
    return error instanceof ApiRequestError;
}
