"""Tool-calling and GraphRAG index service implementation."""

from __future__ import annotations

import json
import time
from typing import Any

from fastapi import HTTPException, Request, Response

from app.core import audit as audit_core
from app.core import chat_runtime as chat_core
from app.core import graphrag_runtime as graphrag_core
from app.core import routing as routing_core
from app.core import upstream as upstream_core
from app.core.contracts import (
    ChatWithToolsRequest,
    ChatWithToolsResponse,
    DeleteDocumentRequest,
    IndexDocumentRequest,
    IndexDocumentResponse,
    ToolCall,
)
from app.graphrag.index import GraphRAGIndex
from app.graphrag.retrieve import build_rag_context
from app.graphrag.updater import Document
from app.tools import AVAILABLE_TOOLS, execute_tool, get_tool_result_message


def _build_tool_prompt() -> str:
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


async def chat_with_tools(
    req: ChatWithToolsRequest,
    request: Request,
    response: Response,
) -> ChatWithToolsResponse:
    started_at = time.monotonic()
    decision = routing_core._build_routing_decision(
        request,
        endpoint="/v1/chat_with_tools",
        mode=req.mode,
        body_privacy=req.privacy,
        body_route=req.route,
    )
    response.headers["X-Request-ID"] = decision.request_id

    system = chat_core._system_prompt(req.mode, req.context)
    if system and req.enable_tools:
        system += _build_tool_prompt()

    messages: list[dict[str, Any]] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.extend([m.model_dump() for m in req.messages])

    _, rag_requested = chat_core._parse_mode(req.mode)
    if rag_requested and routing_core._get_bool_env("GRAPH_RAG_ENABLED", default=False):
        index_path = routing_core._get_env("GRAPH_RAG_INDEX_PATH") or "app/data/graphrag_index.json"
        index = graphrag_core._load_graphrag_index(index_path)
        if index:
            query = ""
            for m in reversed(req.messages):
                if m.role == "user":
                    query = m.content
                    break
            context = build_rag_context(
                index,
                query,
                seed_top_k=routing_core._get_int_env("GRAPH_RAG_SEED_TOP_K", default=4),
                expand_hops=routing_core._get_int_env("GRAPH_RAG_EXPAND_HOPS", default=1),
                final_top_k=routing_core._get_int_env("GRAPH_RAG_FINAL_TOP_K", default=8),
                max_chars=routing_core._get_int_env("GRAPH_RAG_MAX_CONTEXT_CHARS", default=4000),
            )
            if context:
                insert_at = 1 if system else 0
                messages.insert(insert_at, {"role": "system", "content": graphrag_core._build_graphrag_system_message(context)})

    payload: dict[str, Any] = {
        "messages": messages,
        "temperature": 0.2,
        "stream": False,
    }

    if req.enable_tools:
        payload["tools"] = AVAILABLE_TOOLS
        payload["tool_choice"] = "auto"

    tool_calls_made: list[ToolCall] = []
    tool_results: list[dict] = []
    max_calls = req.max_tool_calls if req.max_tool_calls > 0 else 3

    final_upstream = "none"
    fallback_reason = ""
    model = ""
    try:
        for _ in range(max_calls + 1):
            data, final_upstream, fallback_reason, model = await upstream_core._post_chat_completions_with_routing(payload, decision)
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

                    tool_calls_made.append(ToolCall(name=name, arguments=args))
                    result = await execute_tool(name, args)
                    tool_results.append(
                        {
                            "name": name,
                            "success": result.success,
                            "result": result.result,
                            "error": result.error,
                        }
                    )
                    result_message = get_tool_result_message(name, result)
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tc.get("id", ""),
                            "content": result_message,
                        }
                    )
                payload["messages"] = messages
                continue

            content = message.get("content", "")
            audit_core._audit_request_complete(
                decision,
                status_code=200,
                final_upstream=final_upstream,
                fallback_reason=fallback_reason,
                started_at=started_at,
            )
            return ChatWithToolsResponse(
                reply=str(content).strip(),
                model=model,
                tool_calls=tool_calls_made,
                tool_results=tool_results,
            )

        audit_core._audit_request_complete(
            decision,
            status_code=200,
            final_upstream=final_upstream,
            fallback_reason=fallback_reason,
            started_at=started_at,
        )
        return ChatWithToolsResponse(
            reply="达到最大工具调用次数限制。",
            model=model or None,
            tool_calls=tool_calls_made,
            tool_results=tool_results,
        )
    except HTTPException as exc:
        audit_core._audit_request_complete(
            decision,
            status_code=exc.status_code,
            final_upstream=final_upstream,
            fallback_reason=fallback_reason or "request_failed",
            started_at=started_at,
        )
        raise


async def add_to_index(req: IndexDocumentRequest) -> IndexDocumentResponse:
    if not routing_core._get_bool_env("GRAPH_RAG_ENABLED", default=False):
        return IndexDocumentResponse(
            success=False,
            chunks_affected=0,
            message="GraphRAG is not enabled",
        )

    try:
        index_path = routing_core._get_env("GRAPH_RAG_INDEX_PATH") or "app/data/graphrag_index.json"
        index = graphrag_core._load_graphrag_index(index_path)
        if not index:
            index = GraphRAGIndex(nodes={}, chunks={}, edges=(), node_neighbors={}, chunk_to_nodes={})

        updater = graphrag_core._get_index_updater(index)
        doc = Document(
            id=req.doc_id,
            content=req.content,
            source=req.source,
            course_id=req.course_id,
            user_id=req.user_id,
            doc_type=req.doc_type,
        )

        chunks = await updater.update_document(doc)
        graphrag_core.invalidate_graphrag_cache()

        return IndexDocumentResponse(
            success=True,
            chunks_affected=chunks,
            message=f"Document {req.doc_id} indexed with {chunks} chunks",
        )
    except Exception as e:  # noqa: BLE001
        return IndexDocumentResponse(
            success=False,
            chunks_affected=0,
            message=f"Indexing failed: {str(e)}",
        )


async def delete_from_index(req: DeleteDocumentRequest) -> IndexDocumentResponse:
    if not routing_core._get_bool_env("GRAPH_RAG_ENABLED", default=False):
        return IndexDocumentResponse(
            success=False,
            chunks_affected=0,
            message="GraphRAG is not enabled",
        )

    try:
        index_path = routing_core._get_env("GRAPH_RAG_INDEX_PATH") or "app/data/graphrag_index.json"
        index = graphrag_core._load_graphrag_index(index_path)
        if not index:
            return IndexDocumentResponse(
                success=True,
                chunks_affected=0,
                message="Index is empty",
            )

        updater = graphrag_core._get_index_updater(index)
        chunks = await updater.remove_document(req.doc_id)
        graphrag_core.invalidate_graphrag_cache()

        return IndexDocumentResponse(
            success=True,
            chunks_affected=chunks,
            message=f"Document {req.doc_id} removed, {chunks} chunks deleted",
        )
    except Exception as e:  # noqa: BLE001
        return IndexDocumentResponse(
            success=False,
            chunks_affected=0,
            message=f"Deletion failed: {str(e)}",
        )
