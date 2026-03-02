import { ApiRequestError, type ApiClient } from './http';
import type {
  ChatRequest,
  ChatResponse,
  ChatMultimodalRequest,
  ChatWithToolsRequest,
  ChatWithToolsResponse,
  GuidedChatRequest,
  GuidedChatResponse,
  AiStreamEvent,
  OrchestratedChatRequest,
  ThoughtEvent,
} from '../types';

type AiRuntimeOptions = {
  baseUrl: string;
  getAccessToken?: () => string | null | undefined;
  getTokenType?: () => string | null | undefined;
  onUnauthorized?: (info: { url: string; status: number }) => void;
  fetchFn?: typeof fetch;
};

function buildUrl(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function getAuthHeaders(options: AiRuntimeOptions): Record<string, string> {
  const token = options.getAccessToken?.();
  if (!token) return {};
  const tokenType = options.getTokenType?.() ?? 'Bearer';
  return { Authorization: `${tokenType} ${token}` };
}

function normalizeStreamEvent(parsed: {
  type?: string;
  request_id?: string;
  content?: string;
  error?: string;
  phase?: string;
  status?: string;
  label?: string;
  detail?: string;
  node?: string;
  source?: string;
  model?: string | null;
  choices?: Array<{ delta?: { content?: string } }>;
}): AiStreamEvent | null {
  if (parsed.error && !parsed.type) {
    return {
      type: 'error',
      error: parsed.error,
    };
  }

  if (parsed.type === 'start' && parsed.request_id) {
    return {
      type: 'start',
      request_id: parsed.request_id,
    };
  }

  if (parsed.type === 'thought' && parsed.phase && parsed.status && parsed.label && parsed.node && parsed.source) {
    return {
      type: 'thought',
      phase: parsed.phase as ThoughtEvent['phase'],
      status: parsed.status as ThoughtEvent['status'],
      label: parsed.label,
      detail: parsed.detail,
      node: parsed.node,
      source: parsed.source as ThoughtEvent['source'],
    };
  }

  if (parsed.type === 'message' && parsed.content) {
    return {
      type: 'message',
      content: parsed.content,
      model: parsed.model ?? null,
    };
  }

  if (parsed.type === 'done') {
    return {
      type: 'done',
      model: parsed.model ?? null,
    };
  }

  if (parsed.type === 'error' && parsed.error) {
    return {
      type: 'error',
      error: parsed.error,
    };
  }

  const content = parsed.content ?? parsed.choices?.[0]?.delta?.content;
  if (content) {
    return {
      type: 'message',
      content,
      model: parsed.model ?? null,
    };
  }

  return null;
}

async function* parseSSEEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<AiStreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;
      if (payload === '[DONE]') return;

      try {
        const parsed = JSON.parse(payload) as {
          type?: string;
          request_id?: string;
          content?: string;
          error?: string;
          phase?: string;
          status?: string;
          label?: string;
          detail?: string;
          node?: string;
          source?: string;
          model?: string | null;
          choices?: Array<{ delta?: { content?: string } }>;
        };

        const normalized = normalizeStreamEvent(parsed);
        if (!normalized) {
          continue;
        }
        if (normalized.type === 'error') {
          throw new Error(normalized.error);
        }
        if (normalized.type === 'done') {
          yield normalized;
          return;
        }
        yield normalized;
      } catch (error) {
        if (error instanceof Error) {
          throw error;
        }
      }
    }
  }
}

export function createAiApi(client: ApiClient, options: AiRuntimeOptions) {
  const fetchFn = options.fetchFn ?? fetch;

  return {
    chat: (request: ChatRequest, signal?: AbortSignal) =>
      client.post<ChatResponse>('/ai/chat', request, signal ? { signal } : undefined),

    streamChat: async function* (request: ChatRequest, signal?: AbortSignal): AsyncGenerator<string> {
      const url = buildUrl(options.baseUrl, '/ai/chat');
      const response = await fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          ...getAuthHeaders(options),
        },
        body: JSON.stringify({ ...request, stream: true }),
        signal,
      });

      if (!response.ok) {
        if (response.status === 401) {
          options.onUnauthorized?.({ url, status: response.status });
        }
        const message = await response.text().catch(() => '');
        throw new ApiRequestError(`AI stream request failed (${response.status}): ${message || 'unknown error'}`, response.status, message || null);
      }

      if (!response.body) {
        throw new ApiRequestError('AI stream response body is empty', 502, null);
      }

      for await (const event of parseSSEEvents(response.body)) {
        if (event.type === 'message') {
          yield event.content;
        }
      }
    },

    streamOrchestratedChat: async function* (
      request: OrchestratedChatRequest,
      signal?: AbortSignal
    ): AsyncGenerator<AiStreamEvent> {
      const url = buildUrl(options.baseUrl, '/ai/orchestrated');
      const response = await fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          ...getAuthHeaders(options),
        },
        body: JSON.stringify({ ...request, stream: true }),
        signal,
      });

      if (!response.ok) {
        if (response.status === 401) {
          options.onUnauthorized?.({ url, status: response.status });
        }
        const message = await response.text().catch(() => '');
        throw new ApiRequestError(`AI orchestrated stream failed (${response.status}): ${message || 'unknown error'}`, response.status, message || null);
      }

      if (!response.body) {
        throw new ApiRequestError('AI orchestrated stream response body is empty', 502, null);
      }

      for await (const event of parseSSEEvents(response.body)) {
        yield event;
      }
    },

    chatMultimodal: (request: ChatMultimodalRequest, signal?: AbortSignal) =>
      client.post<ChatResponse>('/ai/chat/multimodal', request, signal ? { signal } : undefined),

    chatWithTools: (request: ChatWithToolsRequest, signal?: AbortSignal) =>
      client.post<ChatWithToolsResponse>('/ai/chat_with_tools', request, signal ? { signal } : undefined),

    chatGuided: (request: GuidedChatRequest, signal?: AbortSignal) =>
      client.post<GuidedChatResponse>('/ai/chat/guided', request, signal ? { signal } : undefined),
  };
}
