"""Writing-analysis HTTP routes with fallback."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response

from app import legacy
from app.core.audit import _audit_event
from app.core.contracts import WritingAnalysisRequest, WritingAnalysisResponse
from app.core.migration import should_fallback, use_modular_handlers
from app.services import writing_service

router = APIRouter()


def _audit_legacy_fallback(request: Request, reason: str) -> None:
    request_id = (request.headers.get("X-Request-ID") or "").strip() or "missing_request_id"
    request_id_source = "upstream" if request.headers.get("X-Request-ID") else "generated"
    _audit_event(
        event="legacy_fallback",
        request_id=request_id,
        request_id_source=request_id_source,
        endpoint=request.url.path,
        mode="writing",
        privacy_input="",
        route_input="",
        privacy_resolved="private",
        route_resolved="local",
        caller_trusted=False,
        final_upstream="legacy",
        fallback_reason=f"writing:{reason}",
        status_code=200,
        latency_ms=0,
    )


@router.post("/v1/writing/analyze", response_model=WritingAnalysisResponse)
async def analyze_writing(
    req: WritingAnalysisRequest,
    request: Request,
    response: Response,
) -> WritingAnalysisResponse:
    if not use_modular_handlers():
        return await legacy.analyze_writing(req, request, response)
    try:
        return await writing_service.analyze_writing(req, request, response)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        if should_fallback("writing"):
            _audit_legacy_fallback(request, type(exc).__name__)
            return await legacy.analyze_writing(req, request, response)
        raise
