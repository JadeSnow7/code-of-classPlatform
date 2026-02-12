"""Legacy compatibility surface delegating to modular core/services.

This module keeps the previous import paths stable during migration while all
runtime behavior is served by app.core and app.services.
"""

from __future__ import annotations

from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response
from fastapi.responses import StreamingResponse

from app.core import audit as audit_core
from app.core import chat_runtime as chat_core
from app.core import contracts
from app.core import graphrag_runtime as graphrag_core
from app.core import routing as routing_core
from app.core import upstream as upstream_core
from app.services import chat_service, guided_service, hybrid_service, tools_service, writing_service

load_dotenv()

app = FastAPI(title="AI Service", version="0.2.0")

# Bind service function references at import time so fallback can use a stable
# compatibility path even when modular handlers are monkeypatched in tests.
_healthz_impl = chat_service.healthz
_list_skills_impl = chat_service.list_skills
_chat_impl = chat_service.chat
_chat_multimodal_impl = chat_service.chat_multimodal
_chat_hybrid_impl = hybrid_service.chat_hybrid
_chat_with_tools_impl = tools_service.chat_with_tools
_add_to_index_impl = tools_service.add_to_index
_delete_from_index_impl = tools_service.delete_from_index
_chat_guided_impl = guided_service.chat_guided
_analyze_writing_impl = writing_service.analyze_writing


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
_parse_writing_feedback = writing_service._parse_writing_feedback
_extract_score = writing_service._extract_score


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
    return await _chat_impl(req, request, response)


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
    return await _chat_hybrid_impl(req, request, response)


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
    return await _analyze_writing_impl(req, request, response)


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
