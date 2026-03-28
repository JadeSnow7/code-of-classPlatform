import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Copy, RotateCcw, Brain } from 'lucide-react';
import { KnowledgeNodePill } from './KnowledgeNodePill';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  streamingContent?: string;
  referencedConcepts?: string[];
  toolCalls?: { tool_name: string; arguments: Record<string, any>; call_id: string; status?: 'pending' | 'done' }[];
  timestamp: Date;
}

interface ChatBubbleProps {
  message: Message;
  onRetry?: () => void;
  onConceptClick?: (concept: string) => void;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({ message, onRetry, onConceptClick }) => {
  const isUser = message.role === 'user';
  const displayContent = message.isStreaming ? (message.streamingContent || '') : message.content;

  if (isUser) {
    return (
      <div className="flex justify-end gap-2 group">
        <div className="max-w-[80%]">
          <div className="bg-blue-600 text-white rounded-2xl rounded-br-md px-4 py-3 text-sm leading-relaxed">
            {message.content}
          </div>
          <p className="text-[10px] text-slate-400 mt-1 text-right">
            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 group">
      {/* AI Avatar */}
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center flex-shrink-0 mt-1">
        <Brain className="w-4 h-4 text-white" />
      </div>

      <div className="max-w-[80%] space-y-2">
        {/* Tool Calls Pipeline */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="space-y-1">
            {message.toolCalls.map((tc, i) => (
              <ToolCallCard key={tc.call_id || i} toolCall={tc} />
            ))}
          </div>
        )}

        {/* Main Bubble */}
        <div className="bg-slate-100 text-slate-800 rounded-2xl rounded-bl-md px-4 py-3 text-sm leading-relaxed">
          {displayContent}
          {message.isStreaming && (
            <span className="inline-block w-0.5 h-4 bg-blue-500 ml-0.5 animate-pulse align-middle" />
          )}
        </div>

        {/* Referenced Concepts */}
        {message.referencedConcepts && message.referencedConcepts.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-1">
            <span className="text-[10px] text-slate-400 self-center">📌 相关概念:</span>
            {message.referencedConcepts.map((concept) => (
              <KnowledgeNodePill
                key={concept}
                concept={concept}
                mastery="in_progress"
                onClick={() => onConceptClick?.(concept)}
              />
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center gap-2 px-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <p className="text-[10px] text-slate-400">
            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
          <button
            onClick={() => navigator.clipboard.writeText(message.content)}
            className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
            title="复制"
          >
            <Copy className="w-3 h-3" />
          </button>
          {onRetry && (
            <button
              onClick={onRetry}
              className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
              title="重试"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

interface ToolCallCardProps {
  toolCall: { tool_name: string; arguments: Record<string, any>; call_id: string; status?: 'pending' | 'done' };
}

const TOOL_ICONS: Record<string, string> = {
  search_knowledge_graph: '🔍',
  generate_questions: '📝',
  explain_concept: '🧠',
  retrieve_documents: '📚',
  default: '🔧',
};

export const ToolCallCard: React.FC<ToolCallCardProps> = ({ toolCall }) => {
  const [expanded, setExpanded] = useState(false);
  const icon = TOOL_ICONS[toolCall.tool_name] ?? TOOL_ICONS.default;

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between text-left"
      >
        <span className="flex items-center gap-1.5 font-medium text-slate-600">
          {icon} {toolCall.tool_name}
        </span>
        <span className={cn(
          'text-[10px] px-1.5 py-0.5 rounded-full',
          toolCall.status === 'done' ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600 animate-pulse'
        )}>
          {toolCall.status === 'done' ? '✅ 完成' : '⏳ 运行中'}
        </span>
      </button>
      {expanded && (
        <pre className="mt-2 text-[10px] text-slate-500 overflow-auto max-h-24 bg-white rounded border border-slate-200 p-2">
          {JSON.stringify(toolCall.arguments, null, 2)}
        </pre>
      )}
    </div>
  );
};

// ─── Streaming Chat Composer ──────────────────────────────────────────────────
export type { Message };
