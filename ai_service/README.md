# AI服务 (AI Service)

基于 Python 的 AI 服务，提供智能问答能力；支持对接 OpenAI-compatible 接口，并可选启用 GraphRAG 本地知识库检索。

## 技术栈

- Python 3.9+
- FastAPI (Web框架)
- Uvicorn (ASGI Server)
- httpx (调用上游 LLM 接口)
- FAISS (向量检索，按需使用)
- pytest (测试)

## 开发环境

```bash
# 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate   # Windows

# 安装依赖
pip install -r requirements.txt

# 启动开发服务器
uvicorn app.main:app --reload --port 8001
```

## 项目结构

```
app/
├── main.py                # App factory + router 注册
├── core/                  # 路由/审计/上游请求/迁移开关
├── services/              # 业务服务层（chat/hybrid/tools/guided/writing）
├── routers/               # HTTP 路由层（支持 modular -> legacy fallback）
├── graphrag/              # 图RAG实现
└── legacy*.py             # legacy 兼容适配与回退实现
```

## 主要功能

- 智能问答（支持流式输出）
- 多模态问答（`/v1/chat/multimodal`，默认关闭）
- GraphRAG（可选）：知识库检索增强
- 多种对话模式与系统提示模板

## 配置说明

需要设置以下环境变量：
- `LLM_BASE_URL`: OpenAI-compatible Base URL（如 OpenAI/DashScope/Ollama 等）
- `LLM_API_KEY`: API Key（本地模型可填占位值）
- `LLM_MODEL`: 模型名（如 `qwen-plus`）
- `AI_SERVICE_HANDLER_IMPL`: `modular|legacy`，默认 `modular`
- `AI_SERVICE_LEGACY_FALLBACK`: `true|false`，modular 异常时是否回退 legacy
- `AI_SERVICE_LEGACY_FALLBACK_ENDPOINTS`: 允许回退的端点集合（逗号分隔）
- `AI_MULTIMODAL_ENABLED`: 是否启用多模态端点（`true/false`）
- `RERANKER_ENABLED`: 是否启用 reranker（本阶段默认 `false`）
- `LLM_*_TEXT_*`: 文本模型上游配置（local/cloud）
- `LLM_*_VL_*`: 视觉模型上游配置（local/cloud）
- `GRAPH_RAG_ENABLED`: 是否启用 GraphRAG（`true/false`）
- `GRAPH_RAG_INDEX_PATH`: GraphRAG 索引文件路径

## 相关文档

- [GraphRAG 用法](../../docs/ai/graph-rag.md)
- [API 文档](../../docs/api/ai-services.md)
