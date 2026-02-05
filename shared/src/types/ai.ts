export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
  id?: string;
  createdAt?: number;
};

export type ChatRequest = {
  mode?: string;
  messages: ChatMessage[];
  stream?: boolean;
};

export type ChatResponse = {
  reply: string;
  model?: string | null;
};

export type ChatWithToolsRequest = {
  mode?: string;
  messages: ChatMessage[];
  enable_tools?: boolean;
  max_tool_calls?: number;
  context?: Record<string, unknown>;
};

export type ChatWithToolsResponse = {
  reply: string;
  model?: string | null;
  tool_calls?: Record<string, unknown>[];
  tool_results?: Record<string, unknown>[];
};
