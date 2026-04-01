import { api, apiClient, streamSse } from '@/lib/api-client';
import type {
    ChatMessage,
    ChatRequest,
    ChatResponse,
    ChatMultimodalRequest,
    ChatWithToolsRequest,
    ChatWithToolsResponse,
    GuidedChatRequest,
    GuidedChatResponse,
} from '@classplatform/shared';

export type {
    ChatMessage,
    ChatRequest,
    ChatResponse,
    ChatMultimodalRequest,
    ChatWithToolsRequest,
    ChatWithToolsResponse,
    GuidedChatRequest,
    GuidedChatResponse,
};

export type AiStreamEvent =
    | { event: 'token'; data: { text: string } }
    | { event: 'message'; data: { messageId: string; role: 'assistant'; content: string } }
    | { event: 'tool_call'; data: { toolName: string; arguments: Record<string, unknown>; callId: string } }
    | { event: 'run_status'; data: { status: 'queued' | 'running' | 'completed' | 'failed' } }
    | { event: 'error'; data: { code: string; message: string } }
    | { event: 'done'; data: { runId: string; usage?: { promptTokens: number; completionTokens: number } } };

export interface AiSession {
    sessionId: string;
    mode?: string;
    createdAt?: string;
}

export interface AiMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    createdAt?: string;
}

export const aiApi = {
    async createAiSession(payload: { mode: string; overriddenSystemPrompt?: string }) {
        return apiClient.post<AiSession>('/ai/sessions', payload);
    },

    async listSessionMessages(sessionId: string, query?: { cursor?: string; limit?: number }) {
        return apiClient.get<{
            items: AiMessage[];
            total: number;
            page: number;
            pageSize: number;
            totalPages: number;
            hasMore: boolean;
        }>(`/ai/sessions/${sessionId}/messages`, {
            query,
        });
    },

    async streamRun(sessionId: string, payload: { input: AiMessage[]; tools?: Array<Record<string, unknown>>; stream: true }, options: { signal?: AbortSignal; onEvent: (event: AiStreamEvent) => void }) {
        return streamSse<AiStreamEvent>(`/ai/sessions/${sessionId}/runs`, {
            body: payload,
            signal: options.signal,
            onEvent: options.onEvent,
        });
    },

    async listSessions() {
        return apiClient.get<{ items: AiSession[]; total: number }>('/ai/sessions');
    },

    async deleteSession(sessionId: string) {
        return apiClient.delete<{ deleted: boolean }>(`/ai/sessions/${sessionId}`);
    },

    streamChat: api.ai.streamChat,
    streamOrchestratedChat: api.ai.streamOrchestratedChat,
};
