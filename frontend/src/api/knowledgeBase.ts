import { api } from '@/lib/api-client';
import type {
    KnowledgeBase,
    CreateKnowledgeBaseRequest,
    KnowledgeBaseFile,
    ReindexKnowledgeBaseRequest,
    ReindexKnowledgeBaseResponse,
} from '@classplatform/shared';

export type {
    KnowledgeBase,
    CreateKnowledgeBaseRequest,
    KnowledgeBaseFile,
    ReindexKnowledgeBaseRequest,
    ReindexKnowledgeBaseResponse,
};
export const knowledgeBaseApi = api.knowledgeBase;
