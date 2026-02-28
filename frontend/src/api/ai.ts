import { api } from '@/lib/api-client';
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

export const aiApi = api.ai;
