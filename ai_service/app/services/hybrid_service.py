"""Hybrid ACL-aware chat service implementation."""

from __future__ import annotations

import json
import time
from typing import Any, AsyncIterator, Literal

import httpx
from fastapi import HTTPException, Request, Response
from fastapi.responses import StreamingResponse

from app.core import audit as audit_core
from app.core import chat_runtime as chat_core
from app.core import graphrag_runtime as graphrag_core
from app.core import routing as routing_core
from app.core import upstream as upstream_core
from app.core.contracts import ChatResponse, HybridChatRequest
from app.graphrag.retrieve import RetrievalContext, build_rag_context, build_rag_context_hybrid


async def chat_hybrid(
    req: HybridChatRequest,
    request: Request,
    response: Response,
) -> ChatResponse | StreamingResponse:
    started_at = time.monotonic()
    decision = routing_core._build_routing_decision(
        request,
        endpoint="/v1/chat/hybrid",
        mode=req.mode,
        body_privacy=req.privacy,
        body_route=req.route,
    )
    response.headers["X-Request-ID"] = decision.request_id

    course_id = req.course_id or request.headers.get("X-Course-Id")
    user_id = req.user_id or request.headers.get("X-User-Id")
    user_role = req.user_role or request.headers.get("X-User-Role")

    system = chat_core._system_prompt(req.mode)
    messages: list[dict[str, str]] = []
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

            ctx = RetrievalContext(
                query=query,
                course_id=course_id,
                user_id=user_id,
                user_role=user_role,
            )

            context = ""
            embedding_upstream = graphrag_core._embedding_route(decision.route_resolved)
            try:
                context = await build_rag_context_hybrid(
                    index,
                    ctx,
                    graphrag_core._get_vector_store(embedding_upstream),
                    graphrag_core._get_embedding(embedding_upstream),
                    seed_top_k=routing_core._get_int_env("GRAPH_RAG_SEED_TOP_K", default=4),
                    expand_hops=routing_core._get_int_env("GRAPH_RAG_EXPAND_HOPS", default=1),
                    final_top_k=routing_core._get_int_env("GRAPH_RAG_FINAL_TOP_K", default=8),
                    max_chars=routing_core._get_int_env("GRAPH_RAG_MAX_CONTEXT_CHARS", default=4000),
                )
            except Exception as exc:  # noqa: BLE001
                if embedding_upstream == "local" and routing_core._can_cloud_fallback(decision):
                    audit_core._audit_event(
                        event="cloud_fallback",
                        request_id=decision.request_id,
                        request_id_source=decision.request_id_source,
                        endpoint=decision.endpoint,
                        mode=decision.mode,
                        privacy_input=decision.privacy_input,
                        route_input=decision.route_input,
                        privacy_resolved=decision.privacy_resolved,
                        route_resolved=decision.route_resolved,
                        caller_trusted=decision.caller_trusted,
                        final_upstream="cloud",
                        fallback_reason=f"embedding_local_error:{type(exc).__name__}",
                        status_code=200,
                        latency_ms=0,
                    )
                    try:
                        context = await build_rag_context_hybrid(
                            index,
                            ctx,
                            graphrag_core._get_vector_store("cloud"),
                            graphrag_core._get_embedding("cloud"),
                            seed_top_k=routing_core._get_int_env("GRAPH_RAG_SEED_TOP_K", default=4),
                            expand_hops=routing_core._get_int_env("GRAPH_RAG_EXPAND_HOPS", default=1),
                            final_top_k=routing_core._get_int_env("GRAPH_RAG_FINAL_TOP_K", default=8),
                            max_chars=routing_core._get_int_env("GRAPH_RAG_MAX_CONTEXT_CHARS", default=4000),
                        )
                    except Exception:  # noqa: BLE001
                        context = ""

            if not context:
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
    }

    if req.stream:
        primary_upstream: Literal["local", "cloud"] = "cloud" if decision.route_resolved == "cloud" else "local"

        async def stream_generator() -> AsyncIterator[str]:
            status_code = 200
            fallback_reason = ""
            final_upstream = "none"
            emitted_content = False
            model_name = ""

            async def stream_once(upstream: Literal["local", "cloud"]) -> AsyncIterator[str]:
                nonlocal emitted_content, model_name
                cfg = routing_core._upstream_config(upstream)
                if not cfg["base_url"] or not cfg["api_key"]:
                    raise ValueError(f"{upstream} upstream is not configured")
                model_name = cfg["model"] or "qwen-plus"
                request_payload = dict(payload)
                request_payload["model"] = model_name
                request_payload["stream"] = True
                headers = {"Authorization": f"Bearer {cfg['api_key']}"}
                url = cfg["base_url"].rstrip("/") + "/v1/chat/completions"
                timeout = routing_core._http_timeout(upstream, stream=True)
                async with httpx.AsyncClient(timeout=timeout, trust_env=False) as client:
                    async with client.stream("POST", url, json=request_payload, headers=headers) as upstream_resp:
                        if upstream_resp.status_code >= 300:
                            raise RuntimeError(f"upstream error: {upstream_resp.status_code}")
                        async for raw_line in upstream_resp.aiter_lines():
                            line = raw_line.strip()
                            if not line:
                                continue
                            if not line.startswith("data: "):
                                continue
                            data_str = line[6:]
                            if data_str == "[DONE]":
                                break
                            try:
                                data = json.loads(data_str)
                            except json.JSONDecodeError:
                                continue
                            delta = data.get("choices", [{}])[0].get("delta", {})
                            content = delta.get("content", "")
                            if content:
                                emitted_content = True
                                yield f"data: {json.dumps({'content': content})}\n\n"

            try:
                yield f"data: {json.dumps({'type': 'start', 'request_id': decision.request_id})}\n\n"
                try:
                    final_upstream = primary_upstream
                    async for chunk in stream_once(primary_upstream):
                        yield chunk
                except httpx.TimeoutException:
                    if primary_upstream != "local":
                        raise
                    audit_core._audit_event(
                        event="local_timeout",
                        request_id=decision.request_id,
                        request_id_source=decision.request_id_source,
                        endpoint=decision.endpoint,
                        mode=decision.mode,
                        privacy_input=decision.privacy_input,
                        route_input=decision.route_input,
                        privacy_resolved=decision.privacy_resolved,
                        route_resolved=decision.route_resolved,
                        caller_trusted=decision.caller_trusted,
                        final_upstream="local",
                        fallback_reason="local_timeout",
                        status_code=504,
                        latency_ms=0,
                    )
                    if emitted_content or not routing_core._can_cloud_fallback(decision):
                        raise
                    audit_core._audit_event(
                        event="cloud_fallback",
                        request_id=decision.request_id,
                        request_id_source=decision.request_id_source,
                        endpoint=decision.endpoint,
                        mode=decision.mode,
                        privacy_input=decision.privacy_input,
                        route_input=decision.route_input,
                        privacy_resolved=decision.privacy_resolved,
                        route_resolved=decision.route_resolved,
                        caller_trusted=decision.caller_trusted,
                        final_upstream="cloud",
                        fallback_reason="local_timeout",
                        status_code=200,
                        latency_ms=0,
                    )
                    fallback_reason = "local_timeout"
                    final_upstream = "cloud"
                    async for chunk in stream_once("cloud"):
                        yield chunk
            except ValueError as exc:
                status_code = 503
                yield f"data: {json.dumps({'error': str(exc)})}\n\n"
            except httpx.TimeoutException as exc:
                status_code = 504
                yield f"data: {json.dumps({'error': str(exc)})}\n\n"
            except (RuntimeError, httpx.HTTPError) as exc:
                status_code = 502
                yield f"data: {json.dumps({'error': str(exc)})}\n\n"
            finally:
                yield f"data: {json.dumps({'type': 'done', 'model': model_name})}\n\n"
                audit_core._audit_request_complete(
                    decision,
                    status_code=status_code,
                    final_upstream=final_upstream,
                    fallback_reason=fallback_reason,
                    started_at=started_at,
                )

        return StreamingResponse(
            stream_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Request-ID": decision.request_id,
            },
        )

    final_upstream = "none"
    fallback_reason = ""
    try:
        data, final_upstream, fallback_reason, model = await upstream_core._post_chat_completions_with_routing(payload, decision)
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        audit_core._audit_request_complete(
            decision,
            status_code=200,
            final_upstream=final_upstream,
            fallback_reason=fallback_reason,
            started_at=started_at,
        )
        return ChatResponse(reply=str(content).strip(), model=model)
    except HTTPException as exc:
        audit_core._audit_request_complete(
            decision,
            status_code=exc.status_code,
            final_upstream=final_upstream,
            fallback_reason=fallback_reason or "request_failed",
            started_at=started_at,
        )
        raise
