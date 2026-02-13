"""Legacy compatibility surface delegating to modular core/services.

This module keeps the previous import paths stable during migration while all
runtime behavior is served by app.core and app.services.
"""

from __future__ import annotations

import json
import re
import time
from typing import Any, AsyncIterator

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import StreamingResponse

from app.core import audit as audit_core
from app.core import chat_runtime as chat_core
from app.core import contracts
from app.core import graphrag_runtime as graphrag_core
from app.core import routing as routing_core
from app.core import upstream as upstream_core
from app.writing_concepts import WRITING_TYPES
from app.writing_prompts import get_writing_analysis_prompt
from app.services import chat_service, guided_service, hybrid_service, tools_service, writing_service

load_dotenv()

app = FastAPI(title="AI Service", version="0.2.0")

# Bind service function references at import time so fallback can use a stable
# compatibility path even when modular handlers are monkeypatched in tests.
_healthz_impl = chat_service.healthz
_list_skills_impl = chat_service.list_skills
_chat_multimodal_impl = chat_service.chat_multimodal
_chat_with_tools_impl = tools_service.chat_with_tools
_add_to_index_impl = tools_service.add_to_index
_delete_from_index_impl = tools_service.delete_from_index
_chat_guided_impl = guided_service.chat_guided


@app.on_event("startup")
def _validate_on_startup() -> None:
    routing_core._validate_routing_policy()


# Contract aliases kept for migration compatibility.
ChatMessage = contracts.ChatMessage
ChatRequest = contracts.ChatRequest
ChatResponse = contracts.ChatResponse
MultimodalPart = contracts.MultimodalPart
MultimodalChatMessage = contracts.MultimodalChatMessage
MultimodalChatRequest = contracts.MultimodalChatRequest
ChatWithToolsRequest = contracts.ChatWithToolsRequest
ToolCall = contracts.ToolCall
ChatWithToolsResponse = contracts.ChatWithToolsResponse
IndexDocumentRequest = contracts.IndexDocumentRequest
IndexDocumentResponse = contracts.IndexDocumentResponse
DeleteDocumentRequest = contracts.DeleteDocumentRequest
HybridChatRequest = contracts.HybridChatRequest
GuidedChatRequest = contracts.GuidedChatRequest
GuidedChatResponse = contracts.GuidedChatResponse
WritingAnalysisRequest = contracts.WritingAnalysisRequest
DimensionScore = contracts.DimensionScore
WritingAnalysisResponse = contracts.WritingAnalysisResponse

# Routing aliases.
PrivacyLevel = routing_core.PrivacyLevel
RouteLevel = routing_core.RouteLevel
RequestIDSource = routing_core.RequestIDSource
RoutingDecision = routing_core.RoutingDecision
ALLOWED_PRIVACY_LEVELS = routing_core.ALLOWED_PRIVACY_LEVELS
ALLOWED_ROUTE_LEVELS = routing_core.ALLOWED_ROUTE_LEVELS
_get_env = routing_core._get_env
_get_bool_env = routing_core._get_bool_env
_get_int_env = routing_core._get_int_env
_app_env = routing_core._app_env
_routing_policy = routing_core._routing_policy
_validate_routing_policy = routing_core._validate_routing_policy
_family_suffix = routing_core._family_suffix
_upstream_config = routing_core._upstream_config
_upstream_ready = routing_core._upstream_ready
_resolve_request_id = routing_core._resolve_request_id
_normalize_routing_input = routing_core._normalize_routing_input
_raise_api_error = routing_core._raise_api_error
_resolve_privacy_and_route = routing_core._resolve_privacy_and_route
_is_trusted_gateway = routing_core._is_trusted_gateway
_enforce_public_policy = routing_core._enforce_public_policy
_can_cloud_fallback = routing_core._can_cloud_fallback
_timeout_seconds = routing_core._timeout_seconds
_http_timeout = routing_core._http_timeout
_build_routing_decision = routing_core._build_routing_decision

# Audit aliases.
_audit_event = audit_core._audit_event
_audit_request_complete = audit_core._audit_request_complete

# Upstream aliases.
_post_chat_completions_once = upstream_core._post_chat_completions_once
_post_chat_completions_with_routing = upstream_core._post_chat_completions_with_routing

# Chat runtime aliases.
EDGE_TUTOR_SYSTEM_PROMPT = chat_core.EDGE_TUTOR_SYSTEM_PROMPT
EDGE_COMPLEX_CLOUD_HINT = chat_core.EDGE_COMPLEX_CLOUD_HINT
_parse_mode = chat_core._parse_mode
_latest_user_query_from_multimodal = chat_core._latest_user_query_from_multimodal
_latest_user_query = chat_core._latest_user_query
_edge_complex_requires_cloud_hint = chat_core._edge_complex_requires_cloud_hint
_to_openai_multimodal_message = chat_core._to_openai_multimodal_message
_system_prompt = chat_core._system_prompt

# GraphRAG runtime aliases.
_load_graphrag_index = graphrag_core._load_graphrag_index
_embedding_route = graphrag_core._embedding_route
_vector_store_path = graphrag_core._vector_store_path
_get_embedding = graphrag_core._get_embedding
_get_vector_store = graphrag_core._get_vector_store
_get_index_updater = graphrag_core._get_index_updater
invalidate_graphrag_cache = graphrag_core.invalidate_graphrag_cache
_build_graphrag_system_message = graphrag_core._build_graphrag_system_message

# Service-internal helpers surfaced for compatibility tests.
_build_tool_prompt = tools_service._build_tool_prompt
_parse_learning_path = guided_service._parse_learning_path
_call_llm_with_tools = guided_service._call_llm_with_tools


async def _stream_single_response(
    *,
    request_id: str,
    model: str,
    reply: str,
) -> StreamingResponse:
    async def stream_generator() -> AsyncIterator[str]:
        yield "data: {0}\n\n".format(json.dumps({"type": "start", "request_id": request_id}))
        if reply:
            yield "data: {0}\n\n".format(json.dumps({"content": reply}))
        yield "data: {0}\n\n".format(json.dumps({"type": "done", "model": model}))

    return StreamingResponse(
        stream_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "X-Request-ID": request_id,
        },
    )


async def _legacy_chat_completion(
    *,
    endpoint: str,
    mode: str | None,
    body_privacy: str | None,
    body_route: str | None,
    messages: list[dict[str, str]],
    stream: bool,
    request: Request,
    response: Response,
) -> ChatResponse | StreamingResponse:
    started_at = time.monotonic()
    decision = _build_routing_decision(
        request,
        endpoint=endpoint,
        mode=mode,
        body_privacy=body_privacy,
        body_route=body_route,
    )
    response.headers["X-Request-ID"] = decision.request_id

    payload = {"messages": messages, "temperature": 0.2}

    final_upstream = "none"
    fallback_reason = ""
    try:
        data, final_upstream, fallback_reason, model = await _post_chat_completions_with_routing(payload, decision)
        content = str(data.get("choices", [{}])[0].get("message", {}).get("content", "")).strip()
        _audit_request_complete(
            decision,
            status_code=200,
            final_upstream=final_upstream,
            fallback_reason=fallback_reason,
            started_at=started_at,
        )
        if stream:
            return await _stream_single_response(request_id=decision.request_id, model=model, reply=content)
        return ChatResponse(reply=content, model=model)
    except HTTPException as exc:
        _audit_request_complete(
            decision,
            status_code=exc.status_code,
            final_upstream=final_upstream,
            fallback_reason=fallback_reason or "request_failed",
            started_at=started_at,
        )
        raise


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return _healthz_impl()


@app.get("/v1/skills")
def list_skills() -> dict[str, Any]:
    return _list_skills_impl()


@app.post("/v1/chat", response_model=None)
async def chat(
    req: ChatRequest,
    request: Request,
    response: Response,
) -> ChatResponse | StreamingResponse:
    system = _system_prompt(req.mode)
    messages: list[dict[str, str]] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.extend([m.model_dump() for m in req.messages])

    latest_user_query = _latest_user_query(req.messages)
    if _edge_complex_requires_cloud_hint(req.mode, latest_user_query):
        return ChatResponse(reply=EDGE_COMPLEX_CLOUD_HINT, model="edge-local-router")

    return await _legacy_chat_completion(
        endpoint="/v1/chat",
        mode=req.mode,
        body_privacy=req.privacy,
        body_route=req.route,
        messages=messages,
        stream=req.stream,
        request=request,
        response=response,
    )


@app.post("/v1/chat/multimodal", response_model=None)
async def chat_multimodal(
    req: MultimodalChatRequest,
    request: Request,
    response: Response,
) -> ChatResponse | StreamingResponse:
    return await _chat_multimodal_impl(req, request, response)


@app.post("/v1/chat/hybrid", response_model=None)
async def chat_hybrid(
    req: HybridChatRequest,
    request: Request,
    response: Response,
) -> ChatResponse | StreamingResponse:
    system = _system_prompt(req.mode)
    messages: list[dict[str, str]] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.extend([m.model_dump() for m in req.messages])

    return await _legacy_chat_completion(
        endpoint="/v1/chat/hybrid",
        mode=req.mode,
        body_privacy=req.privacy,
        body_route=req.route,
        messages=messages,
        stream=req.stream,
        request=request,
        response=response,
    )


@app.post("/v1/chat_with_tools", response_model=ChatWithToolsResponse)
async def chat_with_tools(
    req: ChatWithToolsRequest,
    request: Request,
    response: Response,
) -> ChatWithToolsResponse:
    return await _chat_with_tools_impl(req, request, response)


@app.post("/v1/graphrag/index", response_model=IndexDocumentResponse)
async def add_to_index(req: IndexDocumentRequest) -> IndexDocumentResponse:
    return await _add_to_index_impl(req)


@app.delete("/v1/graphrag/index", response_model=IndexDocumentResponse)
async def delete_from_index(req: DeleteDocumentRequest) -> IndexDocumentResponse:
    return await _delete_from_index_impl(req)


@app.post("/v1/chat/guided", response_model=GuidedChatResponse)
async def chat_guided(
    req: GuidedChatRequest,
    request: Request,
    response: Response,
) -> GuidedChatResponse:
    return await _chat_guided_impl(req, request, response)


@app.post("/v1/writing/analyze", response_model=WritingAnalysisResponse)
async def analyze_writing(
    req: WritingAnalysisRequest,
    request: Request,
    response: Response,
) -> WritingAnalysisResponse:
    started_at = time.monotonic()
    decision = _build_routing_decision(
        request,
        endpoint="/v1/writing/analyze",
        mode="writing",
        body_privacy=req.privacy,
        body_route=req.route,
    )
    response.headers["X-Request-ID"] = decision.request_id

    writing_type = req.writing_type
    if writing_type not in WRITING_TYPES:
        writing_type = "course_paper"

    system_prompt, user_prompt = get_writing_analysis_prompt(
        content=req.content,
        writing_type=writing_type,
        student_profile=req.student_profile,
    )
    payload = {
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.3,
        "stream": False,
    }

    final_upstream = "none"
    fallback_reason = ""
    try:
        data, final_upstream, fallback_reason, model = await _post_chat_completions_with_routing(payload, decision)
        raw_feedback = str(data.get("choices", [{}])[0].get("message", {}).get("content", ""))
    except HTTPException as exc:
        _audit_request_complete(
            decision,
            status_code=exc.status_code,
            final_upstream=final_upstream,
            fallback_reason=fallback_reason or "request_failed",
            started_at=started_at,
        )
        raise

    dimensions, strengths, improvements, overall_score = _parse_writing_feedback(raw_feedback, writing_type)
    type_name = WRITING_TYPES[writing_type]["name"]
    summary = "您的{0}总体评分为 {1:.1f}/10。".format(type_name, overall_score)
    if improvements:
        summary += "主要需要改进的方面：{0}".format(improvements[0])

    _audit_request_complete(
        decision,
        status_code=200,
        final_upstream=final_upstream,
        fallback_reason=fallback_reason,
        started_at=started_at,
    )
    return WritingAnalysisResponse(
        overall_score=overall_score,
        dimensions=dimensions,
        strengths=strengths,
        improvements=improvements,
        summary=summary,
        raw_feedback=raw_feedback,
        word_count=len(req.content.split()),
        writing_type=writing_type,
        model=model,
    )


def _parse_writing_feedback(
    feedback: str,
    writing_type: str,
) -> tuple[list[DimensionScore], list[str], list[str], float]:
    lines = feedback.split("\n")

    type_info = WRITING_TYPES.get(writing_type, WRITING_TYPES["course_paper"])
    expected_weights = type_info.get("weights", {})

    dimensions: list[DimensionScore] = []
    strengths: list[str] = []
    improvements: list[str] = []
    current_section = None

    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            continue
        lowered = line.lower()
        if "优点" in line or "strengths" in lowered:
            current_section = "strengths"
            continue
        if "改进" in line or "improvements" in lowered or "建议" in line:
            current_section = "improvements"
            continue
        if "总体" in line or "overall" in lowered:
            current_section = "overall"
            continue

        if "**" in line or "(" in line:
            for dim_name in expected_weights.keys():
                if dim_name in line:
                    score = _extract_score(line)
                    if score is not None:
                        dimensions.append(
                            DimensionScore(
                                name=dim_name,
                                score=score,
                                weight=expected_weights.get(dim_name, 0.1),
                                comment=line,
                            )
                        )
                    break

        if current_section == "strengths" and (line.startswith("-") or line.startswith("•") or line[0].isdigit()):
            text = line.lstrip("-•0123456789. ")
            if text:
                strengths.append(text)
        if current_section == "improvements" and (line.startswith("-") or line.startswith("•") or line[0].isdigit()):
            text = line.lstrip("-•0123456789. ")
            if text:
                improvements.append(text)

    if dimensions:
        total_weight = sum(d.weight for d in dimensions)
        if total_weight > 0:
            overall_score = sum(d.score * d.weight for d in dimensions) / total_weight
        else:
            overall_score = sum(d.score for d in dimensions) / len(dimensions)
    else:
        overall_score = _extract_score(feedback) or 6.0

    if not strengths:
        strengths = ["写作内容已提交，请查看详细反馈"]
    if not improvements:
        improvements = ["请查看详细反馈中的具体建议"]

    bounded_score = min(10.0, max(0.0, overall_score))
    return dimensions, strengths[:5], improvements[:5], bounded_score


def _extract_score(text: str) -> float | None:
    match = re.search(r"(\d+\.?\d*)\s*/\s*10", text)
    if match:
        return float(match.group(1))

    match = re.search(r"(\d+\.?\d*)\s*分", text)
    if match:
        score = float(match.group(1))
        return score if score <= 10 else score / 10

    match = re.search(r"[：:]\s*(\d+\.?\d*)", text)
    if match:
        score = float(match.group(1))
        if score <= 10:
            return score
    return None


__all__ = [
    "app",
    "healthz",
    "list_skills",
    "chat",
    "chat_multimodal",
    "chat_hybrid",
    "chat_with_tools",
    "add_to_index",
    "delete_from_index",
    "chat_guided",
    "analyze_writing",
    "ChatMessage",
    "ChatRequest",
    "ChatResponse",
    "MultimodalPart",
    "MultimodalChatMessage",
    "MultimodalChatRequest",
    "ChatWithToolsRequest",
    "ToolCall",
    "ChatWithToolsResponse",
    "IndexDocumentRequest",
    "IndexDocumentResponse",
    "DeleteDocumentRequest",
    "HybridChatRequest",
    "GuidedChatRequest",
    "GuidedChatResponse",
    "WritingAnalysisRequest",
    "DimensionScore",
    "WritingAnalysisResponse",
    "RoutingDecision",
    "_validate_on_startup",
    "_get_env",
    "_get_bool_env",
    "_get_int_env",
    "_app_env",
    "_routing_policy",
    "_validate_routing_policy",
    "_family_suffix",
    "_upstream_config",
    "_upstream_ready",
    "_resolve_request_id",
    "_normalize_routing_input",
    "_audit_event",
    "_raise_api_error",
    "_resolve_privacy_and_route",
    "_is_trusted_gateway",
    "_enforce_public_policy",
    "_can_cloud_fallback",
    "_timeout_seconds",
    "_http_timeout",
    "_build_routing_decision",
    "_audit_request_complete",
    "_post_chat_completions_once",
    "_post_chat_completions_with_routing",
    "_parse_mode",
    "_latest_user_query_from_multimodal",
    "_latest_user_query",
    "_edge_complex_requires_cloud_hint",
    "_to_openai_multimodal_message",
    "_system_prompt",
    "_load_graphrag_index",
    "_embedding_route",
    "_vector_store_path",
    "_get_embedding",
    "_get_vector_store",
    "_get_index_updater",
    "invalidate_graphrag_cache",
    "_build_graphrag_system_message",
    "_build_tool_prompt",
    "_parse_learning_path",
    "_call_llm_with_tools",
    "_parse_writing_feedback",
    "_extract_score",
    "EDGE_TUTOR_SYSTEM_PROMPT",
    "EDGE_COMPLEX_CLOUD_HINT",
]
