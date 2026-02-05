import type { ApiClient } from './http';
import type { ChatRequest, ChatResponse } from '../types';

export function createAiApi(client: ApiClient) {
  return {
    chat: (request: ChatRequest, signal?: AbortSignal) =>
      client.post<ChatResponse>('/ai/chat', request, signal ? { signal } : undefined),
  };
}
