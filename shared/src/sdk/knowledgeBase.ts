import type { ApiClient, UploadRequest } from './http';
import type {
  KnowledgeBase,
  CreateKnowledgeBaseRequest,
  KnowledgeBaseFile,
  ReindexKnowledgeBaseRequest,
  ReindexKnowledgeBaseResponse,
} from '../types';

export function createKnowledgeBaseApi(client: ApiClient) {
  return {
    list: () => client.get<KnowledgeBase[]>('/users/me/knowledge-bases'),
    create: (payload: CreateKnowledgeBaseRequest) =>
      client.post<KnowledgeBase>('/users/me/knowledge-bases', payload),
    listFiles: (knowledgeBaseId: number) =>
      client.get<KnowledgeBaseFile[]>(`/users/me/knowledge-bases/${knowledgeBaseId}/files`),
    uploadFile: (
      knowledgeBaseId: number,
      file: UploadRequest['file'],
      onProgress?: UploadRequest['onProgress']
    ) =>
      client.upload<KnowledgeBaseFile>(`/users/me/knowledge-bases/${knowledgeBaseId}/files`, {
        file,
        onProgress,
      }),
    deleteFile: (knowledgeBaseId: number, fileId: number) =>
      client.delete<void>(`/users/me/knowledge-bases/${knowledgeBaseId}/files/${fileId}`),
    reindex: (knowledgeBaseId: number, payload?: ReindexKnowledgeBaseRequest) =>
      client.post<ReindexKnowledgeBaseResponse>(
        `/users/me/knowledge-bases/${knowledgeBaseId}/reindex`,
        payload ?? {}
      ),
  };
}
