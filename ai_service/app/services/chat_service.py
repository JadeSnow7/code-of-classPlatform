"""Chat and multimodal service implementations."""

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
from app.core.contracts import ChatRequest, ChatResponse, MultimodalChatRequest
from app.graphrag.retrieve import build_rag_context
from app.model_router import (
    needs_vision as payload_needs_vision,
    normalize_requested_model_family,
    resolve_model_family,
    validate_message_parts,
)


def healthz() -> dict[str, str]:
    return {"status": "ok"}


def list_skills() -> dict[str, Any]:
    try:
        from app.skills import get_skill_info

        return {"skills": get_skill_info()}
    except ImportError:
        return {"skills": [], "error": "Skill system not available"}


async def chat(
    req: ChatRequest,
    request: Request,
    response: Response,
) -> ChatResponse | StreamingResponse:
    started_at = time.monotonic()
    decision = routing_core._build_routing_decision(
        request,
        endpoint="/v1/chat",
        mode=req.mode,
        body_privacy=req.privacy,
        body_route=req.route,
    )
    response.headers["X-Request-ID"] = decision.request_id

    system = chat_core._system_prompt(req.mode)
    messages: list[dict[str, str]] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.extend([m.model_dump() for m in req.messages])

    latest_user_query = chat_core._latest_user_query(req.messages)
    if chat_core._edge_complex_requires_cloud_hint(req.mode, latest_user_query):
        audit_core._audit_request_complete(
            decision,
            status_code=200,
            final_upstream="local",
            fallback_reason="edge_complex_cloud_hint",
            started_at=started_at,
        )
        return ChatResponse(reply=chat_core.EDGE_COMPLEX_CLOUD_HINT, model="edge-local-router")

    _, rag_requested = chat_core._parse_mode(req.mode)
    if rag_requested and routing_core._get_bool_env("GRAPH_RAG_ENABLED", default=False):
        index_path = routing_core._get_env("GRAPH_RAG_INDEX_PATH") or "app/data/graphrag_index.json"
        index = graphrag_core._load_graphrag_index(index_path)
        if index:
            query = ""
            for message in reversed(req.messages):
                if message.role == "user":
                    query = message.content
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
                            if line.startswith("data: "):
                                data_str = line[6:]
                                if data_str == "[DONE]":
                                    break
                                try:
                                    data = json.loads(data_str)
                                except json.JSONDecodeError:
                                    continue
                                delta = data.get("choices", [{}])[0].get("delta", {})
                                content = delta.get("content", "")
                                reasoning = delta.get("reasoning_content") or delta.get("reasoning")
                                response_data: dict[str, str] = {}
                                if content:
                                    response_data["content"] = content
                                if reasoning:
                                    response_data["reasoning"] = reasoning
                                if response_data:
                                    emitted_content = True
                                    yield f"data: {json.dumps(response_data)}\n\n"
                                continue

                            try:
                                data = json.loads(line)
                            except json.JSONDecodeError:
                                continue
                            content = data.get("message", {}).get("content", "")
                            reasoning = data.get("message", {}).get("reasoning_content") or data.get("message", {}).get("reasoning")
                            response_data: dict[str, str] = {}
                            if content:
                                response_data["content"] = content
                            if reasoning:
                                response_data["reasoning"] = reasoning
                            if response_data:
                                emitted_content = True
                                yield f"data: {json.dumps(response_data)}\n\n"
                            if data.get("done"):
                                break

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
                "X-Accel-Buffering": "no",
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


async def chat_multimodal(
    req: MultimodalChatRequest,
    request: Request,
    response: Response,
) -> ChatResponse | StreamingResponse:
    started_at = time.monotonic()
    decision = routing_core._build_routing_decision(
        request,
        endpoint="/v1/chat/multimodal",
        mode=req.mode,
        body_privacy=req.privacy,
        body_route=req.route,
    )
    response.headers["X-Request-ID"] = decision.request_id

    try:
        requested_family = normalize_requested_model_family(req.model_family)
    except ValueError as exc:
        audit_core._audit_request_complete(
            decision,
            status_code=400,
            final_upstream="none",
            fallback_reason="invalid_model_family",
            started_at=started_at,
            model_family_requested=req.model_family or "",
            model_family_resolved="",
            needs_vision=False,
        )
        routing_core._raise_api_error(400, "INVALID_MODEL_FAMILY", str(exc), decision.request_id)

    if not routing_core._get_bool_env("AI_MULTIMODAL_ENABLED", default=False):
        audit_core._audit_request_complete(
            decision,
            status_code=503,
            final_upstream="none",
            fallback_reason="multimodal_disabled",
            started_at=started_at,
            model_family_requested=requested_family,
            model_family_resolved="",
            needs_vision=False,
        )
        routing_core._raise_api_error(503, "FEATURE_DISABLED", "multimodal endpoint is disabled", decision.request_id)

    raw_messages: list[dict[str, Any]] = []
    for i, message in enumerate(req.messages):
        message_dict = message.model_dump(exclude_none=True)
        try:
            validate_message_parts(message_dict)
        except ValueError as exc:
            audit_core._audit_request_complete(
                decision,
                status_code=400,
                final_upstream="none",
                fallback_reason="invalid_multimodal_message",
                started_at=started_at,
                model_family_requested=requested_family,
                model_family_resolved="",
                needs_vision=False,
            )
            routing_core._raise_api_error(
                400,
                "INVALID_MULTIMODAL_MESSAGE",
                f"messages[{i}] {exc}",
                decision.request_id,
            )
        raw_messages.append(message_dict)

    needs_vision = payload_needs_vision(raw_messages)
    model_family = resolve_model_family(requested_family, needs_vision_input=needs_vision)

    system = chat_core._system_prompt(req.mode)
    messages: list[dict[str, Any]] = []
    if system:
        messages.append({"role": "system", "content": system})
    for message in req.messages:
        messages.append(chat_core._to_openai_multimodal_message(message))

    _, rag_requested = chat_core._parse_mode(req.mode)
    if rag_requested and routing_core._get_bool_env("GRAPH_RAG_ENABLED", default=False):
        index_path = routing_core._get_env("GRAPH_RAG_INDEX_PATH") or "app/data/graphrag_index.json"
        index = graphrag_core._load_graphrag_index(index_path)
        if index:
            query = chat_core._latest_user_query_from_multimodal(req.messages)
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
                cfg = routing_core._upstream_config(upstream, model_family=model_family)
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
                            if not line or not line.startswith("data: "):
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
                        model_family_requested=requested_family,
                        model_family_resolved=model_family,
                        needs_vision=needs_vision,
                    )
                    if emitted_content or not routing_core._can_cloud_fallback(decision, model_family=model_family):
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
                        model_family_requested=requested_family,
                        model_family_resolved=model_family,
                        needs_vision=needs_vision,
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
                    model_family_requested=requested_family,
                    model_family_resolved=model_family,
                    needs_vision=needs_vision,
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
        data, final_upstream, fallback_reason, model = await upstream_core._post_chat_completions_with_routing(
            payload,
            decision,
            model_family=model_family,
            model_family_requested=requested_family,
            needs_vision=needs_vision,
        )
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        audit_core._audit_request_complete(
            decision,
            status_code=200,
            final_upstream=final_upstream,
            fallback_reason=fallback_reason,
            started_at=started_at,
            model_family_requested=requested_family,
            model_family_resolved=model_family,
            needs_vision=needs_vision,
        )
        return ChatResponse(reply=str(content).strip(), model=model)
    except HTTPException as exc:
        audit_core._audit_request_complete(
            decision,
            status_code=exc.status_code,
            final_upstream=final_upstream,
            fallback_reason=fallback_reason or "request_failed",
            started_at=started_at,
            model_family_requested=requested_family,
            model_family_resolved=model_family,
            needs_vision=needs_vision,
        )
        raise
