/**
 * 本地 LLM 推理服务
 * 使用 node-llama-cpp 在 Electron 主进程中运行本地模型
 */

import type {
    LocalLlmConfig,
    LocalLlmStatus,
    LlmChatResult,
    ChatMessage,
} from '@classplatform/shared';

// 动态 import 以支持 optional dependency
let LlamaCpp: typeof import('node-llama-cpp') | null = null;
// 使用 any 类型因为 node-llama-cpp v3 使用私有构造函数
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let llamaInstance: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let modelInstance: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let contextInstance: any = null;

// 服务状态
let serviceStatus: LocalLlmStatus = {
    initialized: false,
    modelName: null,
    backend: 'cpu',
    memoryUsageMB: 0,
    contextSize: 0,
};

// 活跃请求的 abort controllers
const abortControllers = new Map<string, AbortController>();

/**
 * 初始化本地 LLM 服务
 */
export async function initialize(config: LocalLlmConfig): Promise<void> {
    console.log('[LocalLlm] Initializing with config:', config);

    try {
        // 动态加载 node-llama-cpp
        if (!LlamaCpp) {
            LlamaCpp = await import('node-llama-cpp');
        }

        // 获取 Llama 实例（自动检测最佳后端）
        llamaInstance = await LlamaCpp.getLlama();

        // 检测后端类型
        const gpuInfo = llamaInstance.gpu;
        if (gpuInfo) {
            serviceStatus.backend = gpuInfo.includes('Metal') ? 'metal' :
                gpuInfo.includes('CUDA') ? 'cuda' :
                    gpuInfo.includes('Vulkan') ? 'vulkan' : 'cpu';
        }

        console.log(`[LocalLlm] Using backend: ${serviceStatus.backend}`);

        // 加载模型
        modelInstance = await llamaInstance.loadModel({
            modelPath: config.modelPath,
        });

        // 创建上下文
        const contextSize = config.contextSize ?? 4096;
        contextInstance = await modelInstance.createContext({
            contextSize,
        });

        // 更新状态
        serviceStatus = {
            initialized: true,
            modelName: config.modelPath.split('/').pop() ?? 'unknown',
            backend: serviceStatus.backend,
            memoryUsageMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            contextSize,
        };

        console.log('[LocalLlm] Initialization complete:', serviceStatus);
    } catch (error) {
        console.error('[LocalLlm] Initialization failed:', error);
        throw error;
    }
}

/**
 * 卸载模型释放内存
 */
export async function unload(): Promise<void> {
    console.log('[LocalLlm] Unloading model...');

    // 中止所有活跃请求
    for (const controller of abortControllers.values()) {
        controller.abort();
    }
    abortControllers.clear();

    // 释放资源
    if (contextInstance) {
        await contextInstance.dispose();
        contextInstance = null;
    }
    if (modelInstance) {
        await modelInstance.dispose();
        modelInstance = null;
    }

    serviceStatus = {
        initialized: false,
        modelName: null,
        backend: 'cpu',
        memoryUsageMB: 0,
        contextSize: 0,
    };

    console.log('[LocalLlm] Unloaded');
}

/**
 * 流式推理
 */
export async function chat(
    requestId: string,
    messages: ChatMessage[],
    onChunk: (chunk: string) => void,
    signal?: AbortSignal
): Promise<LlmChatResult> {
    if (!contextInstance || !modelInstance || !LlamaCpp) {
        throw new Error('LocalLlm not initialized');
    }

    const startTime = Date.now();
    let tokensGenerated = 0;

    // 创建 abort controller
    const controller = new AbortController();
    abortControllers.set(requestId, controller);

    // 合并外部 signal
    if (signal) {
        signal.addEventListener('abort', () => controller.abort());
    }

    try {
        // 创建 chat session
        const session = new LlamaCpp.LlamaChatSession({
            contextSequence: contextInstance.getSequence(),
        });

        // 获取最后一条用户消息
        const lastUserMessage = messages.filter(m => m.role === 'user').pop();
        if (!lastUserMessage) {
            throw new Error('No user message found');
        }

        // 流式生成
        await session.prompt(lastUserMessage.content, {
            onTextChunk: (chunk: string) => {
                if (!controller.signal.aborted) {
                    tokensGenerated++;
                    onChunk(chunk);
                }
            },
            signal: controller.signal,
        });

        const latencyMs = Date.now() - startTime;

        console.log(`[LocalLlm] Generated ${tokensGenerated} tokens in ${latencyMs}ms`);

        return { tokensGenerated, latencyMs };
    } finally {
        abortControllers.delete(requestId);
    }
}

/**
 * 中止推理请求
 */
export function abort(requestId: string): void {
    const controller = abortControllers.get(requestId);
    if (controller) {
        controller.abort();
        abortControllers.delete(requestId);
        console.log(`[LocalLlm] Aborted request: ${requestId}`);
    }
}

/**
 * 获取服务状态
 */
export function getStatus(): LocalLlmStatus {
    // 更新内存使用
    if (serviceStatus.initialized) {
        serviceStatus.memoryUsageMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    }
    return { ...serviceStatus };
}

/**
 * 检查是否已初始化
 */
export function isInitialized(): boolean {
    return serviceStatus.initialized;
}
