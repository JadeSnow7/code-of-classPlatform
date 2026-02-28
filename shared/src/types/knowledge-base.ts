export type KnowledgeBase = {
  id: number;
  name: string;
  file_count: number;
  updated_at?: string;
};

export type CreateKnowledgeBaseRequest = {
  name: string;
};

export type KnowledgeBaseFile = {
  id: number;
  knowledge_base_id: number;
  name: string;
  size_bytes?: number;
  mime_type?: string;
  status?: 'uploaded' | 'indexing' | 'ready' | 'failed' | string;
  download_url?: string;
  created_at?: string;
  updated_at?: string;
};

export type ReindexKnowledgeBaseRequest = {
  force?: boolean;
};

export type ReindexKnowledgeBaseResponse = {
  job_id?: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | string;
};
