/**
 * 本地推理相关类型定义
 * 用于云端-本地协同推理机制
 */

import type { ChatMessage } from './ai';

/** 推理来源 */
export type InferenceSource = 'local' | 'cloud' | 'hybrid';

/** 推理请求 */
export interface InferenceRequest {
    messages: ChatMessage[];
    courseId?: string;           // 关联课程（用于知识库检索）
    useKnowledgeBase?: boolean;  // 是否使用知识库
    forceSource?: InferenceSource; // 强制指定来源（调试用）
}

/** 推理响应（流式 chunk） */
export interface InferenceChunk {
    type: 'content' | 'metadata' | 'error' | 'done';
    content?: string;
    metadata?: InferenceMetadata;
    error?: string;
}

/** 推理元数据 */
export interface InferenceMetadata {
    source: InferenceSource;
    latencyMs?: number;
    tokensGenerated?: number;
    knowledgeRefs?: KnowledgeRef[];
}

/** 知识库引用 */
export interface KnowledgeRef {
    id: string;
    title: string;
    snippet: string;
    source: 'personal' | 'course';
    relevance: number;
}

/** 本地 LLM 配置 */
export interface LocalLlmConfig {
    modelPath: string;           // GGUF 模型路径
    contextSize?: number;        // 上下文长度，默认 4096
    gpuLayers?: number;          // GPU 加载层数，-1 = 全部
    threads?: number;            // CPU 线程数
}

/** 本地 LLM 状态 */
export interface LocalLlmStatus {
    initialized: boolean;
    modelName: string | null;
    backend: 'metal' | 'cuda' | 'vulkan' | 'cpu';
    memoryUsageMB: number;
    contextSize: number;
}

/** 推理结果统计 */
export interface LlmChatResult {
    tokensGenerated: number;
    latencyMs: number;
}

/** 复杂度评估结果 */
export interface ComplexityResult {
    score: number;          // 0-1，越高越复杂
    factors: string[];      // 影响因素
    suggestedSource: InferenceSource;
}

/** 模型信息 */
export interface ModelInfo {
    id: string;
    name: string;
    size: string;           // 如 "0.6B", "3B"
    sizeBytes: number;
    downloaded: boolean;
    path?: string;
}
