/**
 * 本地 LLM 服务独立测试脚本
 * 使用 node-llama-cpp 验证 Qwen3-0.6B 模型推理
 * 
 * 运行: npx tsx electron/test-local-llm.ts
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
    console.log('🚀 Loading node-llama-cpp...');

    const { getLlama, LlamaChatSession } = await import('node-llama-cpp');

    // 获取 Llama 实例
    console.log('🔧 Initializing Llama (auto-detecting best backend)...');
    const llama = await getLlama();

    // 输出后端信息
    console.log(`✅ Backend: ${llama.gpu || 'CPU'}`);

    // 模型路径
    const modelPath = path.join(__dirname, '../models/qwen3-0.6b-q4_k_m.gguf');
    console.log(`📦 Loading model: ${modelPath}`);

    const startLoad = Date.now();
    const model = await llama.loadModel({ modelPath });
    console.log(`✅ Model loaded in ${Date.now() - startLoad}ms`);

    // 创建上下文
    console.log('🔧 Creating context (4096 tokens)...');
    const context = await model.createContext({ contextSize: 4096 });

    // 创建聊天会话
    const session = new LlamaChatSession({
        contextSequence: context.getSequence(),
    });

    // 测试推理
    console.log('\n💬 Testing inference...\n');
    console.log('User: 什么是机器学习？请简短回答。\n');

    const startInfer = Date.now();
    let tokens = 0;

    console.log('Assistant: ');
    const response = await session.prompt('什么是机器学习？请简短回答。', {
        onTextChunk: (chunk) => {
            process.stdout.write(chunk);
            tokens++;
        },
        maxTokens: 200,
    });

    const latency = Date.now() - startInfer;
    console.log(`\n\n📊 Stats: ${tokens} tokens in ${latency}ms (${(tokens / latency * 1000).toFixed(1)} tokens/s)`);

    // 清理
    await context.dispose();
    await model.dispose();

    console.log('\n✅ Test completed successfully!');
}

main().catch(console.error);
