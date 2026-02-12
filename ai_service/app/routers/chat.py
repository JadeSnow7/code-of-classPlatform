"""Chat and hybrid chat HTTP routes with modular->legacy fallback."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import StreamingResponse

from app import legacy
from app.core.audit import _audit_event
from app.core.contracts import ChatRequest, ChatResponse, HybridChatRequest, MultimodalChatRequest
from app.core.migration import should_fallback, use_modular_handlers
from app.services import chat_service, hybrid_service

router = APIRouter()


def _audit_legacy_fallback(request: Request, endpoint_name: str, reason: str) -> None:
    request_id = (request.headers.get("X-Request-ID") or "").strip() or "missing_request_id"
    request_id_source = "upstream" if request.headers.get("X-Request-ID") else "generated"
    _audit_event(
        event="legacy_fallback",
        request_id=request_id,
        request_id_source=request_id_source,
        endpoint=request.url.path,
        mode="",
        privacy_input="",
        route_input="",
        privacy_resolved="private",
        route_resolved="local",
        caller_trusted=False,
        final_upstream="legacy",
        fallback_reason=f"{endpoint_name}:{reason}",
        status_code=200,
        latency_ms=0,
    )


@router.get("/healthz")
def healthz() -> dict[str, str]:
    if not use_modular_handlers():
        return legacy.healthz()
    return chat_service.healthz()


@router.get("/v1/skills")
def list_skills() -> dict:
    if not use_modular_handlers():
        return legacy.list_skills()
    return chat_service.list_skills()


@router.post("/v1/chat", response_model=None)
async def chat(
    req: ChatRequest,
    request: Request,
    response: Response,
) -> ChatResponse | StreamingResponse:
    if not use_modular_handlers():
        return await legacy.chat(req, request, response)
    try:
        return await chat_service.chat(req, request, response)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        if should_fallback("chat"):
            _audit_legacy_fallback(request, "chat", type(exc).__name__)
            return await legacy.chat(req, request, response)
        raise


@router.post("/v1/chat/multimodal", response_model=None)
async def chat_multimodal(
    req: MultimodalChatRequest,
    request: Request,
    response: Response,
) -> ChatResponse | StreamingResponse:
    if not use_modular_handlers():
        return await legacy.chat_multimodal(req, request, response)
    try:
        return await chat_service.chat_multimodal(req, request, response)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        if should_fallback("multimodal"):
            _audit_legacy_fallback(request, "multimodal", type(exc).__name__)
            return await legacy.chat_multimodal(req, request, response)
        raise


@router.post("/v1/chat/hybrid", response_model=None)
async def chat_hybrid(
    req: HybridChatRequest,
    request: Request,
    response: Response,
) -> ChatResponse | StreamingResponse:
    if not use_modular_handlers():
        return await legacy.chat_hybrid(req, request, response)
    try:
        return await hybrid_service.chat_hybrid(req, request, response)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        if should_fallback("hybrid"):
            _audit_legacy_fallback(request, "hybrid", type(exc).__name__)
            return await legacy.chat_hybrid(req, request, response)
        raise
