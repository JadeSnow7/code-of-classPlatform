from __future__ import annotations

import json
import os
from functools import lru_cache
from typing import Any, AsyncIterator, Literal

# Load environment variables from .env file
from dotenv import load_dotenv
load_dotenv()

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.graphrag.index import GraphRAGIndex
from app.graphrag.retrieve import build_rag_context, build_rag_context_hybrid, RetrievalContext
from app.graphrag.embedding import get_embedding_provider, EmbeddingProvider
from app.graphrag.vector_store import get_vector_store, VectorStore
from app.graphrag.updater import IndexUpdater, Document

app = FastAPI(title="AI Service", version="0.2.0")

# Global instances for hybrid retrieval (lazy initialized)
_embedding_provider: EmbeddingProvider | None = None
_vector_store: VectorStore | None = None
_index_updater: IndexUpdater | None = None


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"] = "user"
    content: str = Field(min_length=0, max_length=8000)


class ChatRequest(BaseModel):
    mode: str | None = None
    messages: list[ChatMessage] = Field(min_length=1)
    stream: bool = False


class ChatResponse(BaseModel):
    reply: str
    model: str | None = None


def _get_env(name: str) -> str:
    v = os.getenv(name, "")
    return v.strip()


def _get_bool_env(name: str, default: bool = False) -> bool:
    v = _get_env(name).lower()
    if v in {"1", "true", "yes", "y", "on"}:
        return True
    if v in {"0", "false", "no", "n", "off"}:
        return False
    return default


def _get_int_env(name: str, default: int) -> int:
    v = _get_env(name)
    if not v:
        return default
    try:
        return int(v)
    except ValueError:
        return default


def _parse_mode(mode: str | None) -> tuple[str | None, bool]:
    if not mode:
        return None, False
    m = mode.strip().lower()
    if m.endswith("_rag"):
        base = m[: -len("_rag")].strip() or None
        return base, True
    return m, False


def _system_prompt(mode: str | None, context: dict | None = None) -> str | None:
    """
    Get system prompt for a mode/skill.
    
    Uses the new Skill system if available, falls back to legacy prompts.
    """
    base_mode, _ = _parse_mode(mode)
    if not base_mode:
        return None
    
    # Try new Skill system first
    try:
        from app.skills import get_skill
        skill = get_skill(base_mode)
        if skill:
            return skill.build_system_prompt(context)
    except ImportError:
        pass  # Fall back to legacy prompts
    
    # Legacy prompts for backward compatibility
    if base_mode == "tutor":
        return (
            "你是高校《电磁场》课程助教。"
            "回答要循序渐进，先给结论，再给推导思路与关键公式，必要时给直观类比。"
            "如果问题涉及计算，请说明变量含义与单位；避免编造来源。"
        )
    if base_mode == "grader":
        return (
            "你是《电磁场》课程助教，任务是辅助批改作业。"
            "请指出关键错误与缺失步骤，给出改进建议与提示。"
            "默认不要直接给出完整最终答案，除非用户明确请求并且具有相应权限（此处按提示模式处理）。"
        )
    if base_mode == "sim_explain":
        return (
            "你是《电磁场》课程助教，任务是解释仿真结果。"
            "请结合参数与图像趋势解释物理含义，并给出课堂提问建议。"
        )
    if base_mode == "formula_verify":
        return (
            "你是《电磁场》课程助教，任务是帮助验证和推导公式。"
            "请按以下步骤处理：\n"
            "1. 首先确认公式是否正确，指出可能的错误\n"
            "2. 给出完整的推导过程，每一步都要说明依据（如麦克斯韦方程、边界条件等）\n"
            "3. 说明公式的适用范围和限制条件\n"
            "4. 如有必要，给出数值计算示例验证公式\n"
            "使用 LaTeX 格式书写公式，如 $\\nabla \\times \\mathbf{E} = -\\frac{\\partial \\mathbf{B}}{\\partial t}$"
        )
    if base_mode == "sim_tutor":
        return (
            "你是《电磁场》课程助教，专门负责仿真结果的教学解读。"
            "你的任务是：\n"
            "1. 解释仿真图像中的物理现象，如电场线分布、电势等值线含义\n"
            "2. 将仿真结果与理论公式关联，说明数值解与解析解的对应关系\n"
            "3. 引导学生发现仿真中的关键特征（如边界效应、对称性等）\n"
            "4. 提出思考问题帮助学生深入理解\n"
            "5. 如果用户提供了仿真参数，请分析参数变化对结果的影响\n"
            "回答时要图文结合，引用仿真结果中的具体数据。"
        )
    if base_mode == "problem_solver":
        return (
            "你是《电磁场》课程助教，擅长解决电磁场计算题。"
            "解题步骤：\n"
            "1. 分析问题，明确已知条件和求解目标\n"
            "2. 选择合适的坐标系和求解方法\n"
            "3. 列出相关的基本方程（如泊松方程、拉普拉斯方程、边界条件）\n"
            "4. 进行推导，每步给出详细说明\n"
            "5. 代入数值计算，注意单位换算\n"
            "6. 检验结果的合理性（量纲、极限情况、物理直觉）\n"
            "使用 LaTeX 格式书写公式。"
        )
    return None


@lru_cache(maxsize=4)
def _load_graphrag_index(path: str) -> GraphRAGIndex | None:
    try:
        if not path:
            return None
        return GraphRAGIndex.load(path)
    except Exception:
        return None


def _get_embedding() -> EmbeddingProvider:
    """Get or create embedding provider."""
    global _embedding_provider
    if _embedding_provider is None:
        _embedding_provider = get_embedding_provider()
    return _embedding_provider


def _get_vector_store() -> VectorStore:
    """Get or create vector store."""
    global _vector_store
    if _vector_store is None:
        embedding = _get_embedding()
        _vector_store = get_vector_store(dimension=embedding.dimension)
        # Load from disk if exists
        vector_path = _get_env("VECTOR_STORE_PATH") or "app/data/vector_index"
        import asyncio
        try:
            asyncio.get_event_loop().run_until_complete(_vector_store.load(vector_path))
        except Exception:
            pass  # Fresh start
    return _vector_store


def _get_index_updater(index: GraphRAGIndex) -> IndexUpdater:
    """Get or create index updater."""
    global _index_updater
    if _index_updater is None:
        _index_updater = IndexUpdater(
            index=index,
            vector_store=_get_vector_store(),
            embedding=_get_embedding(),
            index_path=_get_env("GRAPH_RAG_INDEX_PATH") or "app/data/graphrag_index.json",
            vector_path=_get_env("VECTOR_STORE_PATH") or "app/data/vector_index",
        )
    return _index_updater


def invalidate_graphrag_cache():
    """Invalidate all GraphRAG caches for hot reload."""
    global _index_updater
    _load_graphrag_index.cache_clear()
    _index_updater = None


def _build_graphrag_system_message(context: str) -> str:
    return (
        "以下是从课程知识库检索到的片段（带编号与来源）。\n"
        "回答要求：\n"
        "1) 优先基于片段作答；如果片段不足以支撑结论，请明确说明“不足以从知识库确定”，并给出需要补充的信息。\n"
        "2) 用 [编号] 标注你依据的片段，例如 [1][3]。\n"
        "3) 不要编造不存在的引用。\n\n"
        f"{context}"
    ).strip()


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/v1/skills")
def list_skills() -> dict[str, Any]:
    """List all available AI skills."""
    try:
        from app.skills import get_skill_info
        return {"skills": get_skill_info()}
    except ImportError:
        return {"skills": [], "error": "Skill system not available"}


@app.post("/v1/chat", response_model=None)
async def chat(req: ChatRequest) -> ChatResponse | StreamingResponse:
    base_url = _get_env("LLM_BASE_URL")
    api_key = _get_env("LLM_API_KEY")
    model = _get_env("LLM_MODEL") or "qwen-plus"

    system = _system_prompt(req.mode)
    messages: list[dict[str, str]] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.extend([m.model_dump() for m in req.messages])

    _, rag_requested = _parse_mode(req.mode)
    if rag_requested and _get_bool_env("GRAPH_RAG_ENABLED", default=False):
        index_path = _get_env("GRAPH_RAG_INDEX_PATH") or "app/data/graphrag_index.json"
        index = _load_graphrag_index(index_path)
        if index:
            query = ""
            for m in reversed(req.messages):
                if m.role == "user":
                    query = m.content
                    break
            context = build_rag_context(
                index,
                query,
                seed_top_k=_get_int_env("GRAPH_RAG_SEED_TOP_K", default=4),
                expand_hops=_get_int_env("GRAPH_RAG_EXPAND_HOPS", default=1),
                final_top_k=_get_int_env("GRAPH_RAG_FINAL_TOP_K", default=8),
                max_chars=_get_int_env("GRAPH_RAG_MAX_CONTEXT_CHARS", default=4000),
            )
            if context:
                insert_at = 1 if system else 0
                messages.insert(insert_at, {"role": "system", "content": _build_graphrag_system_message(context)})

    if not base_url or not api_key:
        error_msg = (
            "AI 服务已启动，但未配置上游大模型。"
            "请设置环境变量 LLM_BASE_URL / LLM_API_KEY / LLM_MODEL 后重试。"
        )
        if req.stream:
            async def error_gen() -> AsyncIterator[str]:
                yield f"data: {json.dumps({'error': error_msg})}\n\n"
            return StreamingResponse(error_gen(), media_type="text/event-stream")
        return ChatResponse(reply=error_msg, model=None)

    url = base_url.rstrip("/") + "/v1/chat/completions"
    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": 0.2,
        "stream": req.stream,
    }
    headers = {"Authorization": f"Bearer {api_key}"}

    # Streaming mode
    if req.stream:
        async def stream_generator() -> AsyncIterator[str]:
            # Send initial event to prevent gateway timeout
            yield f"data: {json.dumps({'type': 'start', 'model': model})}\n\n"
            try:
                # Use no read timeout for streaming (only connect timeout)
                timeout = httpx.Timeout(timeout=None, connect=30.0)
                async with httpx.AsyncClient(timeout=timeout, proxy=None) as client:
                    async with client.stream("POST", url, json=payload, headers=headers) as resp:
                        if resp.status_code >= 300:
                            yield f"data: {json.dumps({'error': f'upstream error: {resp.status_code}'})}\n\n"
                            return
                        # Parse OpenAI-compatible SSE or Ollama NDJSON
                        async for line in resp.aiter_lines():
                            line = line.strip()
                            if not line:
                                continue
                            # OpenAI SSE format: "data: {...}"
                            if line.startswith("data: "):
                                data_str = line[6:]
                                if data_str == "[DONE]":
                                    break
                                try:
                                    data = json.loads(data_str)
                                    delta = data.get("choices", [{}])[0].get("delta", {})
                                    content = delta.get("content", "")
                                    # Support for reasoning models (e.g., DeepSeek R1, newer Gemini)
                                    reasoning = delta.get("reasoning_content") or delta.get("reasoning")
                                    
                                    response_data = {}
                                    if content:
                                        response_data["content"] = content
                                    if reasoning:
                                        response_data["reasoning"] = reasoning
                                        
                                    if response_data:
                                        yield f"data: {json.dumps(response_data)}\n\n"
                                except json.JSONDecodeError:
                                    pass
                            # Ollama NDJSON format: plain JSON per line
                            else:
                                try:
                                    data = json.loads(line)
                                    content = data.get("message", {}).get("content", "")
                                    # Ollama might not support reasoning in NDJSON yet, but just in case
                                    reasoning = data.get("message", {}).get("reasoning_content") or data.get("message", {}).get("reasoning")
                                    
                                    response_data = {}
                                    if content:
                                        response_data["content"] = content
                                    if reasoning:
                                        response_data["reasoning"] = reasoning

                                    if response_data:
                                        yield f"data: {json.dumps(response_data)}\n\n"
                                        
                                    if data.get("done"):
                                        break
                                except json.JSONDecodeError:
                                    pass
            except httpx.HTTPError as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
            finally:
                yield f"data: {json.dumps({'type': 'done'})}\n\n"

        return StreamingResponse(
            stream_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    # Non-streaming mode (original logic)
    try:
        timeout = httpx.Timeout(timeout=300.0, connect=30.0)
        async with httpx.AsyncClient(timeout=timeout, proxy=None) as client:
            resp = await client.post(url, json=payload, headers=headers)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"upstream request failed: {e}") from e

    if resp.status_code >= 300:
        raise HTTPException(status_code=502, detail=f"upstream error: {resp.status_code} {resp.text}")

    data = resp.json()
    try:
        content = data["choices"][0]["message"]["content"]
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"invalid upstream response: {e}") from e

    return ChatResponse(reply=str(content).strip(), model=model)


# ============================================================================
# Tool Calling Endpoint
# ============================================================================

from app.tools import AVAILABLE_TOOLS, execute_tool, get_tool_result_message


class ChatWithToolsRequest(BaseModel):
    """Request for chat with tool calling support."""
    mode: str | None = None
    messages: list[ChatMessage] = Field(min_length=1)
    enable_tools: bool = True  # Enable tool calling by default
    max_tool_calls: int = Field(default=3, ge=0, le=10)  # 0 means use default (3)
    context: dict | None = None


class ToolCall(BaseModel):
    """A single tool call."""
    name: str
    arguments: dict


class ChatWithToolsResponse(BaseModel):
    """Response with tool call information."""
    reply: str
    model: str | None = None
    tool_calls: list[ToolCall] = []
    tool_results: list[dict] = []


def _build_tool_prompt() -> str:
    """Build system prompt for tool calling."""
    return (
        "\n\n【工具使用说明】\n"
        "你可以调用以下工具来辅助计算：\n"
        "1. calculate_integral - 计算积分\n"
        "2. calculate_derivative - 计算导数\n"
        "3. evaluate_expression - 表达式数值求值\n"
        "4. vector_operation - 矢量运算（梯度/散度/旋度/拉普拉斯）\n"
        "5. run_simulation - 运行电磁场仿真\n\n"
        "遇到需要精确计算的问题时，请主动调用工具获取准确结果，不要凭记忆猜测数值。\n"
        "调用工具后，请解释工具返回的结果并结合理论进行说明。"
    )


@app.post("/v1/chat_with_tools", response_model=ChatWithToolsResponse)
async def chat_with_tools(req: ChatWithToolsRequest) -> ChatWithToolsResponse:
    """
    Chat endpoint with tool calling support.
    
    The AI can automatically invoke tools to perform calculations.
    """
    base_url = _get_env("LLM_BASE_URL")
    api_key = _get_env("LLM_API_KEY")
    model = _get_env("LLM_MODEL") or "qwen-plus"

    if not base_url or not api_key:
        return ChatWithToolsResponse(
            reply="AI 服务未配置，请设置 LLM_BASE_URL / LLM_API_KEY 环境变量。",
            model=None
        )

    # Build messages
    system = _system_prompt(req.mode, req.context)
    if system and req.enable_tools:
        system += _build_tool_prompt()
    
    messages: list[dict[str, Any]] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.extend([m.model_dump() for m in req.messages])

    # Add RAG context if requested
    _, rag_requested = _parse_mode(req.mode)
    if rag_requested and _get_bool_env("GRAPH_RAG_ENABLED", default=False):
        index_path = _get_env("GRAPH_RAG_INDEX_PATH") or "app/data/graphrag_index.json"
        index = _load_graphrag_index(index_path)
        if index:
            query = ""
            for m in reversed(req.messages):
                if m.role == "user":
                    query = m.content
                    break
            context = build_rag_context(
                index,
                query,
                seed_top_k=_get_int_env("GRAPH_RAG_SEED_TOP_K", default=4),
                expand_hops=_get_int_env("GRAPH_RAG_EXPAND_HOPS", default=1),
                final_top_k=_get_int_env("GRAPH_RAG_FINAL_TOP_K", default=8),
                max_chars=_get_int_env("GRAPH_RAG_MAX_CONTEXT_CHARS", default=4000),
            )
            if context:
                insert_at = 1 if system else 0
                messages.insert(insert_at, {"role": "system", "content": _build_graphrag_system_message(context)})

    url = base_url.rstrip("/") + "/v1/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}"}

    # Prepare payload with tools
    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": 0.2,
        "stream": False,
    }
    
    if req.enable_tools:
        payload["tools"] = AVAILABLE_TOOLS
        payload["tool_choice"] = "auto"

    tool_calls_made: list[ToolCall] = []
    tool_results: list[dict] = []

    # Use default value if max_tool_calls is 0
    max_calls = req.max_tool_calls if req.max_tool_calls > 0 else 3

    # Loop for handling tool calls
    for _ in range(max_calls + 1):
        try:
            timeout = httpx.Timeout(timeout=120.0, connect=30.0)
            async with httpx.AsyncClient(timeout=timeout, proxy=None) as client:
                resp = await client.post(url, json=payload, headers=headers)
        except httpx.HTTPError as e:
            return ChatWithToolsResponse(
                reply=f"请求上游服务失败: {e}",
                model=model
            )

        if resp.status_code >= 300:
            return ChatWithToolsResponse(
                reply=f"上游服务错误: {resp.status_code}",
                model=model
            )

        data = resp.json()
        choice = data.get("choices", [{}])[0]
        message = choice.get("message", {})
        finish_reason = choice.get("finish_reason", "")

        # Check if there are tool calls
        tool_calls_data = message.get("tool_calls", [])
        
        if finish_reason == "tool_calls" or tool_calls_data:
            # Process tool calls
            messages.append(message)  # Add assistant message with tool calls
            
            for tc in tool_calls_data:
                func = tc.get("function", {})
                name = func.get("name", "")
                try:
                    args = json.loads(func.get("arguments", "{}"))
                except json.JSONDecodeError:
                    args = {}
                
                tool_calls_made.append(ToolCall(name=name, arguments=args))
                
                # Execute tool
                result = await execute_tool(name, args)
                tool_results.append({
                    "name": name,
                    "success": result.success,
                    "result": result.result,
                    "error": result.error
                })
                
                # Add tool result to messages
                result_message = get_tool_result_message(name, result)
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.get("id", ""),
                    "content": result_message
                })
            
            # Continue loop to get final response
            payload["messages"] = messages
            continue
        
        # No more tool calls, return final response
        content = message.get("content", "")
        return ChatWithToolsResponse(
            reply=str(content).strip(),
            model=model,
            tool_calls=tool_calls_made,
            tool_results=tool_results
        )

    # Max iterations reached
    return ChatWithToolsResponse(
        reply="达到最大工具调用次数限制。",
        model=model,
        tool_calls=tool_calls_made,
        tool_results=tool_results
    )


# ============================================================================
# GraphRAG Index Management Endpoints
# ============================================================================

class IndexDocumentRequest(BaseModel):
    """Request to add/update a document in the index."""
    doc_id: str = Field(..., description="Unique document ID")
    content: str = Field(..., description="Document content")
    source: str = Field(..., description="Source identifier, e.g., 'assignment:123'")
    course_id: str | None = Field(None, description="Course ID for ACL filtering")
    user_id: str | None = Field(None, description="User ID for ACL filtering")
    doc_type: str = Field("markdown", description="Document type: markdown, assignment, faq")


class IndexDocumentResponse(BaseModel):
    """Response from index operations."""
    success: bool
    chunks_affected: int
    message: str


@app.post("/v1/graphrag/index", response_model=IndexDocumentResponse)
async def add_to_index(req: IndexDocumentRequest) -> IndexDocumentResponse:
    """
    Add or update a document in the GraphRAG index.
    
    Called by the Go backend when assignments are submitted or content is updated.
    """
    if not _get_bool_env("GRAPH_RAG_ENABLED", default=False):
        return IndexDocumentResponse(
            success=False,
            chunks_affected=0,
            message="GraphRAG is not enabled"
        )

    try:
        index_path = _get_env("GRAPH_RAG_INDEX_PATH") or "app/data/graphrag_index.json"
        index = _load_graphrag_index(index_path)
        if not index:
            # Create empty index if not exists
            from app.graphrag.index import GraphRAGIndex
            index = GraphRAGIndex(
                nodes={}, chunks={}, edges=(),
                node_neighbors={}, chunk_to_nodes={}
            )

        updater = _get_index_updater(index)
        doc = Document(
            id=req.doc_id,
            content=req.content,
            source=req.source,
            course_id=req.course_id,
            user_id=req.user_id,
            doc_type=req.doc_type,
        )
        
        chunks = await updater.update_document(doc)
        
        # Invalidate cache so next request picks up changes
        invalidate_graphrag_cache()
        
        return IndexDocumentResponse(
            success=True,
            chunks_affected=chunks,
            message=f"Document {req.doc_id} indexed with {chunks} chunks"
        )
    except Exception as e:
        return IndexDocumentResponse(
            success=False,
            chunks_affected=0,
            message=f"Indexing failed: {str(e)}"
        )


class DeleteDocumentRequest(BaseModel):
    """Request to delete a document from the index."""
    doc_id: str = Field(..., description="Document ID to delete")


@app.delete("/v1/graphrag/index", response_model=IndexDocumentResponse)
async def delete_from_index(req: DeleteDocumentRequest) -> IndexDocumentResponse:
    """Delete a document from the GraphRAG index."""
    if not _get_bool_env("GRAPH_RAG_ENABLED", default=False):
        return IndexDocumentResponse(
            success=False,
            chunks_affected=0,
            message="GraphRAG is not enabled"
        )

    try:
        index_path = _get_env("GRAPH_RAG_INDEX_PATH") or "app/data/graphrag_index.json"
        index = _load_graphrag_index(index_path)
        if not index:
            return IndexDocumentResponse(
                success=True,
                chunks_affected=0,
                message="Index is empty"
            )

        updater = _get_index_updater(index)
        chunks = await updater.remove_document(req.doc_id)
        
        invalidate_graphrag_cache()
        
        return IndexDocumentResponse(
            success=True,
            chunks_affected=chunks,
            message=f"Document {req.doc_id} removed, {chunks} chunks deleted"
        )
    except Exception as e:
        return IndexDocumentResponse(
            success=False,
            chunks_affected=0,
            message=f"Deletion failed: {str(e)}"
        )


# ============================================================================
# Hybrid RAG Chat Endpoint (with ACL)
# ============================================================================

class HybridChatRequest(BaseModel):
    """Request for hybrid RAG chat with ACL support."""
    mode: str | None = None
    messages: list[ChatMessage] = Field(min_length=1)
    stream: bool = False
    # ACL context (injected by Go gateway via headers or body)
    course_id: str | None = None
    user_id: str | None = None
    user_role: str | None = None


@app.post("/v1/chat/hybrid", response_model=None)
async def chat_hybrid(req: HybridChatRequest, request: Request) -> ChatResponse | StreamingResponse:
    """
    Chat endpoint with hybrid RAG (keyword + semantic) and ACL filtering.
    
    Reads ACL context from headers if not in request body:
    - X-Course-Id
    - X-User-Id  
    - X-User-Role
    """
    base_url = _get_env("LLM_BASE_URL")
    api_key = _get_env("LLM_API_KEY")
    model = _get_env("LLM_MODEL") or "qwen-plus"

    # Get ACL from request body or headers
    course_id = req.course_id or request.headers.get("X-Course-Id")
    user_id = req.user_id or request.headers.get("X-User-Id")
    user_role = req.user_role or request.headers.get("X-User-Role")

    system = _system_prompt(req.mode)
    messages: list[dict[str, str]] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.extend([m.model_dump() for m in req.messages])

    _, rag_requested = _parse_mode(req.mode)
    if rag_requested and _get_bool_env("GRAPH_RAG_ENABLED", default=False):
        index_path = _get_env("GRAPH_RAG_INDEX_PATH") or "app/data/graphrag_index.json"
        index = _load_graphrag_index(index_path)
        if index:
            query = ""
            for m in reversed(req.messages):
                if m.role == "user":
                    query = m.content
                    break

            # Use hybrid retrieval with ACL
            ctx = RetrievalContext(
                query=query,
                course_id=course_id,
                user_id=user_id,
                user_role=user_role,
            )
            
            try:
                context = await build_rag_context_hybrid(
                    index,
                    ctx,
                    _get_vector_store(),
                    _get_embedding(),
                    seed_top_k=_get_int_env("GRAPH_RAG_SEED_TOP_K", default=4),
                    expand_hops=_get_int_env("GRAPH_RAG_EXPAND_HOPS", default=1),
                    final_top_k=_get_int_env("GRAPH_RAG_FINAL_TOP_K", default=8),
                    max_chars=_get_int_env("GRAPH_RAG_MAX_CONTEXT_CHARS", default=4000),
                )
            except Exception:
                # Fallback to keyword-only
                context = build_rag_context(
                    index,
                    query,
                    seed_top_k=_get_int_env("GRAPH_RAG_SEED_TOP_K", default=4),
                    expand_hops=_get_int_env("GRAPH_RAG_EXPAND_HOPS", default=1),
                    final_top_k=_get_int_env("GRAPH_RAG_FINAL_TOP_K", default=8),
                    max_chars=_get_int_env("GRAPH_RAG_MAX_CONTEXT_CHARS", default=4000),
                )

            if context:
                insert_at = 1 if system else 0
                messages.insert(insert_at, {"role": "system", "content": _build_graphrag_system_message(context)})

    if not base_url or not api_key:
        error_msg = "AI 服务未配置，请设置 LLM_BASE_URL / LLM_API_KEY 环境变量。"
        if req.stream:
            async def error_gen() -> AsyncIterator[str]:
                yield f"data: {json.dumps({'error': error_msg})}\n\n"
            return StreamingResponse(error_gen(), media_type="text/event-stream")
        return ChatResponse(reply=error_msg, model=None)

    url = base_url.rstrip("/") + "/v1/chat/completions"
    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": 0.2,
        "stream": req.stream,
    }
    headers = {"Authorization": f"Bearer {api_key}"}

    if req.stream:
        # Reuse streaming logic from chat endpoint
        async def stream_generator() -> AsyncIterator[str]:
            yield f"data: {json.dumps({'type': 'start', 'model': model})}\n\n"
            try:
                timeout = httpx.Timeout(timeout=None, connect=30.0)
                async with httpx.AsyncClient(timeout=timeout, proxy=None) as client:
                    async with client.stream("POST", url, json=payload, headers=headers) as resp:
                        if resp.status_code >= 300:
                            yield f"data: {json.dumps({'error': f'upstream error: {resp.status_code}'})}\n\n"
                            return
                        async for line in resp.aiter_lines():
                            line = line.strip()
                            if not line:
                                continue
                            if line.startswith("data: "):
                                data_str = line[6:]
                                if data_str == "[DONE]":
                                    break
                                try:
                                    data = json.loads(data_str)
                                    delta = data.get("choices", [{}])[0].get("delta", {})
                                    content = delta.get("content", "")
                                    if content:
                                        yield f"data: {json.dumps({'content': content})}\n\n"
                                except json.JSONDecodeError:
                                    pass
            except httpx.HTTPError as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
            finally:
                yield f"data: {json.dumps({'type': 'done'})}\n\n"

        return StreamingResponse(
            stream_generator(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
        )

    # Non-streaming
    try:
        timeout = httpx.Timeout(timeout=300.0, connect=30.0)
        async with httpx.AsyncClient(timeout=timeout, proxy=None) as client:
            resp = await client.post(url, json=payload, headers=headers)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"upstream request failed: {e}") from e

    if resp.status_code >= 300:
        raise HTTPException(status_code=502, detail=f"upstream error: {resp.status_code}")

    data = resp.json()
    content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
    return ChatResponse(reply=str(content).strip(), model=model)


# ============================================================================
# Guided Learning Chat Endpoint
# ============================================================================

from app.session import LearningSession, LearningStep, SessionManager
from app.skills.guided_learning import GuidedLearningSkill
from app.graphrag.retrieve import build_rag_context_with_citations, Citation
from app.weak_point_detector import detect_weak_points, get_weak_point_detector
import re


class GuidedChatRequest(BaseModel):
    """Request for guided learning chat."""
    mode: str = "guided"  # Always guided
    session_id: str | None = None  # None = create new session
    topic: str | None = None  # Required for new session
    messages: list[ChatMessage] = Field(min_length=1)
    user_id: str = ""  # From JWT, injected by gateway
    course_id: str | None = None


class GuidedChatResponse(BaseModel):
    """Response with learning session state."""
    reply: str
    session_id: str
    current_step: int
    total_steps: int
    progress_percentage: float
    weak_points: list[str] = []
    citations: list[dict] = []  # Structured citations
    tool_results: list[dict] = []
    model: str | None = None
    learning_path: list[dict] = []  # Learning path steps


def _parse_learning_path(llm_output: str) -> list[LearningStep] | None:
    """Extract and validate learning path from LLM output."""
    # Find JSON block
    match = re.search(r"```json\s*(.*?)\s*```", llm_output, re.DOTALL)
    if not match:
        # Try to find raw JSON
        match = re.search(r"\{[^{}]*\"steps\"[^{}]*\[.*?\][^{}]*\}", llm_output, re.DOTALL)
        if not match:
            return None
        json_str = match.group(0)
    else:
        json_str = match.group(1)
    
    try:
        data = json.loads(json_str)
        steps = []
        for s in data.get("steps", []):
            steps.append(LearningStep(
                step=s.get("step", len(steps) + 1),
                title=s.get("title", ""),
                description=s.get("description", ""),
                prerequisite_concepts=s.get("prerequisite_concepts", []),
                requires_tool_verification=s.get("requires_tool_verification", False),
            ))
        return steps if steps else None
    except (json.JSONDecodeError, KeyError, TypeError):
        return None


async def _call_llm_with_tools(
    messages: list[dict],
    base_url: str,
    api_key: str,
    model: str,
    enable_tools: bool = True,
    max_tool_calls: int = 3,
) -> tuple[str, list[dict]]:
    """Call LLM with optional tool support."""
    url = base_url.rstrip("/") + "/v1/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}"}
    
    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": 0.3,  # Slightly higher for more natural responses
        "stream": False,
    }
    
    if enable_tools:
        payload["tools"] = AVAILABLE_TOOLS
        payload["tool_choice"] = "auto"
    
    tool_results: list[dict] = []
    
    for _ in range(max_tool_calls + 1):
        timeout = httpx.Timeout(timeout=120.0, connect=30.0)
        # Disable proxy for localhost (Ollama) to avoid SOCKS proxy issues
        async with httpx.AsyncClient(timeout=timeout, proxy=None) as client:
            resp = await client.post(url, json=payload, headers=headers)
        
        if resp.status_code >= 300:
            return f"LLM 请求失败: {resp.status_code}", tool_results
        
        data = resp.json()
        choice = data.get("choices", [{}])[0]
        message = choice.get("message", {})
        finish_reason = choice.get("finish_reason", "")
        
        tool_calls_data = message.get("tool_calls", [])
        
        if finish_reason == "tool_calls" or tool_calls_data:
            messages.append(message)
            
            for tc in tool_calls_data:
                func = tc.get("function", {})
                name = func.get("name", "")
                try:
                    args = json.loads(func.get("arguments", "{}"))
                except json.JSONDecodeError:
                    args = {}
                
                result = await execute_tool(name, args)
                tool_results.append({
                    "name": name,
                    "success": result.success,
                    "result": result.result,
                    "error": result.error
                })
                
                result_message = get_tool_result_message(name, result)
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.get("id", ""),
                    "content": result_message
                })
            
            payload["messages"] = messages
            continue
        
        content = message.get("content", "")
        return str(content).strip(), tool_results
    
    return "达到最大工具调用次数限制。", tool_results


@app.post("/v1/chat/guided", response_model=GuidedChatResponse)
async def chat_guided(req: GuidedChatRequest, request: Request) -> GuidedChatResponse:
    """
    Guided learning chat endpoint.
    
    First message analyzes the topic and generates a learning path.
    Subsequent messages guide student through the path step by step.
    """
    base_url = _get_env("LLM_BASE_URL")
    api_key = _get_env("LLM_API_KEY")
    model = _get_env("LLM_MODEL") or "qwen-plus"
    
    if not base_url or not api_key:
        return GuidedChatResponse(
            reply="AI 服务未配置，请设置 LLM_BASE_URL / LLM_API_KEY 环境变量。",
            session_id="",
            current_step=0,
            total_steps=0,
            progress_percentage=0.0,
        )
    
    # Get user_id from request or header
    user_id = req.user_id or request.headers.get("X-User-Id", "anonymous")
    course_id = req.course_id or request.headers.get("X-Course-Id")
    
    # Get or create session
    session: LearningSession | None = None
    
    if req.session_id:
        session = SessionManager.get_for_user(req.session_id, user_id)
        if not session:
            return GuidedChatResponse(
                reply="会话不存在或已过期，请开始新的学习。",
                session_id="",
                current_step=0,
                total_steps=0,
                progress_percentage=0.0,
            )
    
    # New session - need topic
    if not session:
        if not req.topic:
            # Extract topic from first message
            topic = req.messages[-1].content if req.messages else "电磁场学习"
        else:
            topic = req.topic
        
        session = SessionManager.create(user_id, topic, course_id)
        
        # Generate learning path
        skill = GuidedLearningSkill()
        path_prompt = skill.build_learning_path_prompt(topic)
        
        messages = [
            {"role": "system", "content": path_prompt},
            {"role": "user", "content": f"请为以下学习主题生成学习路径：{topic}"}
        ]
        
        path_response, _ = await _call_llm_with_tools(
            messages, base_url, api_key, model, enable_tools=False
        )
        
        # Parse learning path
        learning_path = _parse_learning_path(path_response)
        if learning_path:
            session.learning_path = learning_path
            session.learning_goal = topic
        else:
            # Fallback: create a simple path
            session.learning_path = [
                LearningStep(step=1, title="理解基本概念", description="掌握核心定义和原理"),
                LearningStep(step=2, title="公式推导", description="理解关键公式的推导过程"),
                LearningStep(step=3, title="应用练习", description="通过例题巩固理解"),
            ]
            session.learning_goal = topic
        
        SessionManager.update(session)
    
    # Build RAG context with structured citations
    citations: list[Citation] = []
    rag_context = ""
    
    if _get_bool_env("GRAPH_RAG_ENABLED", default=False):
        index_path = _get_env("GRAPH_RAG_INDEX_PATH") or "app/data/graphrag_index.json"
        index = _load_graphrag_index(index_path)
        if index:
            query = req.messages[-1].content if req.messages else ""
            ctx = RetrievalContext(
                query=query,
                course_id=course_id,
                user_id=None,  # Don't filter by user for course content
                user_role="student",
            )
            
            try:
                rag_context, citations = await build_rag_context_with_citations(
                    index,
                    ctx,
                    _get_vector_store(),
                    _get_embedding(),
                    seed_top_k=_get_int_env("GRAPH_RAG_SEED_TOP_K", default=4),
                    expand_hops=_get_int_env("GRAPH_RAG_EXPAND_HOPS", default=1),
                    final_top_k=_get_int_env("GRAPH_RAG_FINAL_TOP_K", default=6),
                    max_chars=_get_int_env("GRAPH_RAG_MAX_CONTEXT_CHARS", default=3000),
                )
            except Exception:
                rag_context = ""
                citations = []
    
    # Build system prompt with session context
    skill = GuidedLearningSkill()
    learning_path_dicts = [
        {
            "step": s.step,
            "title": s.title,
            "description": s.description,
            "completed": s.completed,
        }
        for s in session.learning_path
    ]
    
    system_prompt = skill.build_system_prompt(context={
        "learning_goal": session.learning_goal,
        "learning_path": learning_path_dicts,
        "current_step": session.current_step,
        "total_steps": len(session.learning_path),
        "weak_points": session.weak_points,
        "rag_context": rag_context if rag_context else "暂无相关知识库内容",
    })
    
    # Build messages
    messages: list[dict[str, Any]] = [{"role": "system", "content": system_prompt}]
    
    # Add conversation history from session
    for m in session.messages[-10:]:  # Keep last 10 messages
        messages.append(m)
    
    # Add current message
    for m in req.messages:
        messages.append(m.model_dump())
    
    # Check if current step needs tool verification
    enable_tools = False
    if session.learning_path and session.current_step < len(session.learning_path):
        current_step = session.learning_path[session.current_step]
        enable_tools = current_step.requires_tool_verification
    
    # Call LLM
    reply, tool_results = await _call_llm_with_tools(
        messages, base_url, api_key, model, enable_tools=enable_tools
    )
    
    # Update session with new messages
    for m in req.messages:
        session.messages.append(m.model_dump())
    session.messages.append({"role": "assistant", "content": reply})
    
    # Check if step should advance (simple heuristic: positive response)
    positive_indicators = ["正确", "很好", "太棒了", "完全正确", "进入下一步", "接下来"]
    if any(ind in reply for ind in positive_indicators):
        session.advance_step()
    
    # Detect weak points using NLP-based detector
    detected_weak_points = detect_weak_points(reply)
    for concept in detected_weak_points:
        session.add_weak_point(concept)
    
    SessionManager.update(session)
    
    # Convert citations to dict
    citations_dict = [
        {
            "index": c.index,
            "source": c.source,
            "section": c.section,
            "chunk_id": c.chunk_id,
            "text": c.text,
            "score": c.score,
        }
        for c in citations
    ]
    
    return GuidedChatResponse(
        reply=reply,
        session_id=session.session_id,
        current_step=session.current_step,
        total_steps=len(session.learning_path),
        progress_percentage=session.get_progress_percentage(),
        weak_points=session.weak_points,
        citations=citations_dict,
        tool_results=tool_results,
        model=model,
        learning_path=learning_path_dicts,
    )


# ============================================================================
# Writing Analysis Endpoint (Student-Centric)
# ============================================================================

from app.writing_prompts import get_writing_analysis_prompt, TYPE_PROMPTS
from app.writing_concepts import WRITING_TYPES, NEGATIVE_INDICATORS, POSITIVE_INDICATORS

class WritingAnalysisRequest(BaseModel):
    """Request for writing analysis."""
    content: str = Field(..., min_length=50, description="Writing content to analyze")
    writing_type: str = Field("course_paper", description="Type: literature_review, course_paper, thesis, abstract")
    title: str | None = Field(None, description="Optional title")
    student_profile: dict | None = Field(None, description="Optional student profile for personalization")


class DimensionScore(BaseModel):
    """Score for a single evaluation dimension."""
    name: str
    score: float = Field(..., ge=0, le=10)
    weight: float = Field(..., ge=0, le=1)
    comment: str


class WritingAnalysisResponse(BaseModel):
    """Structured writing analysis response."""
    overall_score: float = Field(..., ge=0, le=10)
    dimensions: list[DimensionScore]
    strengths: list[str]
    improvements: list[str]
    summary: str
    raw_feedback: str  # Full AI response for display
    word_count: int
    writing_type: str
    model: str | None = None


@app.post("/v1/writing/analyze", response_model=WritingAnalysisResponse)
async def analyze_writing(req: WritingAnalysisRequest) -> WritingAnalysisResponse:
    """
    Analyze a writing sample using type-specific evaluation criteria.
    
    Returns structured feedback with dimension scores and improvement suggestions.
    """
    base_url = _get_env("LLM_BASE_URL")
    api_key = _get_env("LLM_API_KEY")
    model = _get_env("LLM_MODEL") or "qwen-plus"

    if not base_url or not api_key:
        raise HTTPException(status_code=503, detail="AI service not configured")

    # Validate writing type
    if req.writing_type not in WRITING_TYPES:
        req.writing_type = "course_paper"

    # Get type-specific prompts
    system_prompt, user_prompt = get_writing_analysis_prompt(
        content=req.content,
        writing_type=req.writing_type,
        student_profile=req.student_profile,
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    url = base_url.rstrip("/") + "/v1/chat/completions"
    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.3,  # Slightly higher for varied feedback
        "stream": False,
    }
    headers = {"Authorization": f"Bearer {api_key}"}

    try:
        timeout = httpx.Timeout(timeout=180.0, connect=30.0)  # Longer timeout for analysis
        async with httpx.AsyncClient(timeout=timeout, proxy=None) as client:
            resp = await client.post(url, json=payload, headers=headers)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Upstream request failed: {e}")

    if resp.status_code >= 300:
        raise HTTPException(status_code=502, detail=f"Upstream error: {resp.status_code}")

    data = resp.json()
    try:
        raw_feedback = data["choices"][0]["message"]["content"]
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Invalid response: {e}")

    # Parse structured feedback from AI response
    dimensions, strengths, improvements, overall_score = _parse_writing_feedback(
        raw_feedback, req.writing_type
    )

    # Generate summary
    type_name = WRITING_TYPES[req.writing_type]["name"]
    summary = f"您的{type_name}总体评分为 {overall_score:.1f}/10。"
    if improvements:
        summary += f"主要需要改进的方面：{improvements[0]}"

    word_count = len(req.content.split())

    return WritingAnalysisResponse(
        overall_score=overall_score,
        dimensions=dimensions,
        strengths=strengths,
        improvements=improvements,
        summary=summary,
        raw_feedback=raw_feedback,
        word_count=word_count,
        writing_type=req.writing_type,
        model=model,
    )


def _parse_writing_feedback(
    feedback: str, writing_type: str
) -> tuple[list[DimensionScore], list[str], list[str], float]:
    """
    Parse AI feedback into structured components.
    
    Uses heuristics to extract scores, strengths, and improvements.
    """
    lines = feedback.split("\n")
    
    # Get expected dimensions for this writing type
    type_info = WRITING_TYPES.get(writing_type, WRITING_TYPES["course_paper"])
    expected_weights = type_info.get("weights", {})
    
    dimensions: list[DimensionScore] = []
    strengths: list[str] = []
    improvements: list[str] = []
    
    current_section = None
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        # Detect section headers
        if "优点" in line or "strengths" in line.lower():
            current_section = "strengths"
            continue
        elif "改进" in line or "improvements" in line.lower() or "建议" in line:
            current_section = "improvements"
            continue
        elif "总体" in line or "overall" in line.lower():
            current_section = "overall"
            continue
        
        # Parse dimension scores (format: **维度名** (NN%): X/10 or X分)
        if "**" in line or "(" in line:
            for dim_name in expected_weights.keys():
                if dim_name in line:
                    # Try to extract score
                    score = _extract_score(line)
                    if score is not None:
                        dimensions.append(DimensionScore(
                            name=dim_name,
                            score=score,
                            weight=expected_weights.get(dim_name, 0.1),
                            comment=line,
                        ))
                    break
        
        # Collect strengths and improvements
        if current_section == "strengths" and (line.startswith("-") or line.startswith("•") or line[0].isdigit()):
            text = line.lstrip("-•0123456789. ")
            if text:
                strengths.append(text)
        elif current_section == "improvements" and (line.startswith("-") or line.startswith("•") or line[0].isdigit()):
            text = line.lstrip("-•0123456789. ")
            if text:
                improvements.append(text)
    
    # Calculate overall score
    if dimensions:
        total_weight = sum(d.weight for d in dimensions)
        if total_weight > 0:
            overall_score = sum(d.score * d.weight for d in dimensions) / total_weight
        else:
            overall_score = sum(d.score for d in dimensions) / len(dimensions)
    else:
        # Fallback: try to find overall score in text
        overall_score = _extract_score(feedback) or 6.0
    
    # Ensure we have at least some content
    if not strengths:
        strengths = ["写作内容已提交，请查看详细反馈"]
    if not improvements:
        improvements = ["请查看详细反馈中的具体建议"]
    
    return dimensions, strengths[:5], improvements[:5], min(10.0, max(0.0, overall_score))


def _extract_score(text: str) -> float | None:
    """Extract a score from text (e.g., '8/10', '8分', '8.5')."""
    import re
    
    # Try X/10 format
    match = re.search(r"(\d+\.?\d*)\s*/\s*10", text)
    if match:
        return float(match.group(1))
    
    # Try X分 format
    match = re.search(r"(\d+\.?\d*)\s*分", text)
    if match:
        score = float(match.group(1))
        if score <= 10:
            return score
        return score / 10  # Assume it's out of 100
    
    # Try standalone number
    match = re.search(r"[：:]\s*(\d+\.?\d*)", text)
    if match:
        score = float(match.group(1))
        if score <= 10:
            return score
    
    return None
