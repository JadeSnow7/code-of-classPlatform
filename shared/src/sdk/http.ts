import type { ApiEnvelope, ApiError } from '../types/response';

export type RequestQuery = Record<string, string | number | boolean | null | undefined>;

export type RequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  rawBody?: BodyInit;
  signal?: AbortSignal;
  timeoutMs?: number;
  query?: RequestQuery;
};

export type UploadRequest = {
  file: File | Blob;
  fieldName?: string;
  onProgress?: (percent: number) => void;
  headers?: Record<string, string>;
};

export type UploadFn = (url: string, options: UploadRequest & { method: string; headers: Record<string, string> }) => Promise<unknown>;

export type ApiClientConfig = {
  baseUrl: string;
  getAccessToken?: () => string | null | undefined;
  getTokenType?: () => string | null | undefined;
  onUnauthorized?: (info: { url: string; status: number }) => void;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
  uploadFn?: UploadFn;
};

export class ApiRequestError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.payload = payload;
  }
}

export type ApiClient = {
  request<T>(path: string, options?: RequestOptions): Promise<T>;
  get<T>(path: string, options?: RequestOptions): Promise<T>;
  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  delete<T>(path: string, options?: RequestOptions): Promise<T>;
  upload<T>(path: string, options: UploadRequest): Promise<T>;
};

function isBodyInit(body: unknown): body is BodyInit {
  return (
    typeof body === 'string' ||
    body instanceof ArrayBuffer ||
    body instanceof Blob ||
    body instanceof FormData ||
    body instanceof URLSearchParams
  );
}

function buildUrl(baseUrl: string, path: string, query?: RequestQuery): string {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  let url = `${normalizedBase}${normalizedPath}`;

  if (query) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      params.append(key, String(value));
    });
    const queryString = params.toString();
    if (queryString) {
      url += url.includes('?') ? `&${queryString}` : `?${queryString}`;
    }
  }

  return url;
}

function extractErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object') {
    const record = payload as ApiEnvelope<unknown> & { message?: string };
    const error = record.error as ApiError | undefined;
    if (error?.message) return error.message;
    if (typeof record.message === 'string') return record.message;
  }
  if (typeof payload === 'string' && payload.trim().length > 0) return payload;
  return `Request failed (${status})`;
}

function unwrapPayload<T>(payload: unknown): T {
  if (payload && typeof payload === 'object') {
    const record = payload as ApiEnvelope<T> & { data?: T };
    if ('success' in record) {
      if (record.success) {
        return record.data as T;
      }
      const message = record.error?.message ?? record.message ?? 'Request failed';
      throw new ApiRequestError(message, 200, payload);
    }
    if ('data' in record) {
      return record.data as T;
    }
  }
  return payload as T;
}

async function readPayload(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json().catch(() => null);
  }
  const text = await response.text().catch(() => '');
  return text || null;
}

export function createApiClient(config: ApiClientConfig): ApiClient {
  const fetchFn = config.fetchFn ?? fetch;
  const timeoutDefault = config.timeoutMs ?? 60000;
  const baseUrl = config.baseUrl;

  const getAuthHeaders = (): Record<string, string> => {
    const token = config.getAccessToken?.();
    if (!token) return {};
    const tokenType = config.getTokenType?.() ?? 'Bearer';
    return { Authorization: `${tokenType} ${token}` };
  };

  async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const {
      method = 'GET',
      headers = {},
      body,
      rawBody,
      signal,
      timeoutMs,
      query,
    } = options;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs ?? timeoutDefault);

    let abortListener: (() => void) | null = null;
    if (signal) {
      if (signal.aborted) {
        controller.abort();
      } else {
        abortListener = () => controller.abort();
        signal.addEventListener('abort', abortListener);
      }
    }

    try {
      const url = buildUrl(baseUrl, path, query);
      const authHeaders = getAuthHeaders();
      const mergedHeaders: Record<string, string> = {
        ...headers,
        ...authHeaders,
      };

      let requestBody: BodyInit | undefined;
      if (rawBody !== undefined) {
        requestBody = rawBody;
      } else if (body !== undefined) {
        if (isBodyInit(body)) {
          requestBody = body;
        } else {
          requestBody = JSON.stringify(body);
          if (!mergedHeaders['Content-Type']) {
            mergedHeaders['Content-Type'] = 'application/json';
          }
        }
      }

      const response = await fetchFn(url, {
        method,
        headers: mergedHeaders,
        body: requestBody,
        signal: controller.signal,
      });

      if (response.status === 401 && config.onUnauthorized) {
        config.onUnauthorized({ url, status: response.status });
      }

      const payload = await readPayload(response);

      if (!response.ok) {
        throw new ApiRequestError(extractErrorMessage(payload, response.status), response.status, payload);
      }

      return unwrapPayload<T>(payload);
    } catch (error) {
      if (error instanceof ApiRequestError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ApiRequestError(signal?.aborted ? 'Request canceled' : 'Request timed out', 408, null);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      if (signal && abortListener) {
        signal.removeEventListener('abort', abortListener);
      }
    }
  }

  const client: ApiClient = {
    request,
    get: (path, options) => request(path, { ...options, method: 'GET' }),
    post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
    put: (path, body, options) => request(path, { ...options, method: 'PUT', body }),
    patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
    delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
    upload: async <T>(path: string, options: UploadRequest) => {
      const url = buildUrl(baseUrl, path);
      const authHeaders = getAuthHeaders();
      const mergedHeaders = { ...options.headers, ...authHeaders };

      if (config.uploadFn) {
        return config.uploadFn(url, {
          ...options,
          method: 'POST',
          headers: mergedHeaders,
        }) as Promise<T>;
      }

      const formData = new FormData();
      formData.append(options.fieldName ?? 'file', options.file);

      return request<T>(path, {
        method: 'POST',
        headers: mergedHeaders,
        body: formData,
      });
    },
  };

  return client;
}

export function createBrowserUploadFn(): UploadFn {
  if (typeof XMLHttpRequest === 'undefined') {
    throw new Error('XMLHttpRequest is not available in this environment');
  }

  return (url, options) =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(options.method, url, true);

      Object.entries(options.headers).forEach(([key, value]) => {
        xhr.setRequestHeader(key, value);
      });

      xhr.upload.onprogress = (event) => {
        if (!options.onProgress) return;
        if (event.lengthComputable) {
          options.onProgress(Math.round((event.loaded / event.total) * 100));
        } else {
          options.onProgress(-1);
        }
      };

      xhr.onerror = () => {
        reject(new ApiRequestError('Network error', xhr.status || 0, null));
      };

      xhr.onload = () => {
        const status = xhr.status;
        const contentType = xhr.getResponseHeader('content-type') ?? '';
        let payload: unknown = xhr.responseText || null;

        if (contentType.includes('application/json')) {
          try {
            payload = JSON.parse(xhr.responseText || 'null');
          } catch {
            payload = null;
          }
        }

        if (status >= 200 && status < 300) {
          try {
            resolve(unwrapPayload(payload));
          } catch (error) {
            reject(error);
          }
          return;
        }

        reject(new ApiRequestError(extractErrorMessage(payload, status), status, payload));
      };

      const formData = new FormData();
      formData.append(options.fieldName ?? 'file', options.file);
      xhr.send(formData);
    });
}
