export type ChatRole = 'system' | 'user' | 'assistant';

export type AiMessageSource = 'local' | 'cloud';

export type TaskAttachmentKind = 'image' | 'code' | 'text' | 'file_ref';

export type ThoughtPhase = 'edge_route' | 'dispatch' | 'visual' | 'code' | 'research' | 'synthesize';

export type ThoughtStatus = 'running' | 'done' | 'error';

export type ThoughtSource = 'edge' | 'orchestrator' | 'expert';

export type ChatMessage = {
  role: ChatRole;
  content: string;
  id?: string;
  createdAt?: number;
  source?: AiMessageSource;
  model_name?: string;
  timestamp?: string;
};

export type WorkspaceSnippet = {
  path: string;
  content: string;
};

export type WorkspaceContext = {
  cwd?: string;
  open_files?: string[];
  selected_snippets?: WorkspaceSnippet[];
};

export type TaskAttachment = {
  kind: TaskAttachmentKind;
  name: string;
  mime_type: string;
  uri?: string;
  text?: string;
};

export type ChatRequest = {
  mode?: string;
  messages: ChatMessage[];
  stream?: boolean;
  course_id?: number | string;
  privacy?: string;
  route?: string;
};

export type OrchestratedChatRequest = {
  messages: ChatMessage[];
  attachments?: TaskAttachment[];
  workspace_context?: WorkspaceContext;
  session_id?: string;
  course_id?: number | string;
  user_id?: number | string;
  privacy?: 'private' | 'public';
  route?: 'local' | 'cloud' | 'auto';
  stream?: boolean;
};

export type ChatResponse = {
  reply: string;
  model?: string | null;
  message?: ChatMessage;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type MultimodalPart = {
  type: string;
  text?: string;
  url?: string;
};

export type MultimodalChatMessage = {
  role: ChatRole;
  content?: string;
  parts?: MultimodalPart[];
};

export type ChatMultimodalRequest = {
  mode?: string;
  messages: MultimodalChatMessage[];
  stream?: boolean;
  privacy?: string;
  route?: string;
  model_family?: string;
};

export type ToolCall = {
  name: string;
  arguments: Record<string, unknown>;
};

export type ToolResult = {
  name: string;
  success: boolean;
  result?: unknown;
  error?: string;
};

export type ChatWithToolsRequest = {
  mode?: string;
  messages: ChatMessage[];
  enable_tools?: boolean;
  max_tool_calls?: number;
  context?: Record<string, unknown>;
  privacy?: string;
  route?: string;
};

export type ChatWithToolsResponse = {
  reply: string;
  model?: string | null;
  tool_calls?: ToolCall[];
  tool_results?: ToolResult[];
};

export type GuidedChatRequest = {
  session_id?: string;
  topic?: string;
  messages: ChatMessage[];
  course_id?: string;
  privacy?: string;
  route?: string;
};

export type GuidedChatResponse = {
  reply: string;
  session_id: string;
  current_step: number;
  total_steps: number;
  progress_percentage: number;
  weak_points: string[];
  citations: Record<string, unknown>[];
  tool_results: ToolResult[];
  model?: string | null;
  learning_path: Record<string, unknown>[];
};

export type AiStreamStartEvent = {
  type: 'start';
  request_id: string;
};

export type ThoughtEvent = {
  type: 'thought';
  phase: ThoughtPhase;
  status: ThoughtStatus;
  label: string;
  detail?: string;
  node: string;
  source: ThoughtSource;
};

export type AiStreamMessageEvent = {
  type: 'message';
  content: string;
  model?: string | null;
};

export type AiStreamErrorEvent = {
  type: 'error';
  error: string;
};

export type AiStreamDoneEvent = {
  type: 'done';
  model?: string | null;
};

export type AiStreamEvent =
  | AiStreamStartEvent
  | ThoughtEvent
  | AiStreamMessageEvent
  | AiStreamErrorEvent
  | AiStreamDoneEvent;
