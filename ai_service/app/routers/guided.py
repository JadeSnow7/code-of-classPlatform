"""Guided-learning HTTP routes with fallback."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response

from app import legacy
from app.core.audit import _audit_event
from app.core.contracts import GuidedChatRequest, GuidedChatResponse
from app.core.migration import should_fallback, use_modular_handlers
from app.services import guided_service

router = APIRouter()


def _audit_legacy_fallback(request: Request, reason: str) -> None:
    request_id = (request.headers.get("X-Request-ID") or "").strip() or "missing_request_id"
    request_id_source = "upstream" if request.headers.get("X-Request-ID") else "generated"
    _audit_event(
        event="legacy_fallback",
        request_id=request_id,
        request_id_source=request_id_source,
        endpoint=request.url.path,
        mode="guided",
        privacy_input="",
        route_input="",
        privacy_resolved="private",
        route_resolved="local",
        caller_trusted=False,
        final_upstream="legacy",
        fallback_reason=f"guided:{reason}",
        status_code=200,
        latency_ms=0,
    )


@router.post("/v1/chat/guided", response_model=GuidedChatResponse)
async def chat_guided(
    req: GuidedChatRequest,
    request: Request,
    response: Response,
) -> GuidedChatResponse:
    if not use_modular_handlers():
        return await legacy.chat_guided(req, request, response)
    try:
        return await guided_service.chat_guided(req, request, response)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        if should_fallback("guided"):
            _audit_legacy_fallback(request, type(exc).__name__)
            return await legacy.chat_guided(req, request, response)
        raise
