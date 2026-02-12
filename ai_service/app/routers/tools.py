"""Tool-calling and index-management HTTP routes with fallback."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response

from app import legacy
from app.core.audit import _audit_event
from app.core.contracts import (
    ChatWithToolsRequest,
    ChatWithToolsResponse,
    DeleteDocumentRequest,
    IndexDocumentRequest,
    IndexDocumentResponse,
)
from app.core.migration import should_fallback, use_modular_handlers
from app.services import tools_service

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


@router.post("/v1/chat_with_tools", response_model=ChatWithToolsResponse)
async def chat_with_tools(
    req: ChatWithToolsRequest,
    request: Request,
    response: Response,
) -> ChatWithToolsResponse:
    if not use_modular_handlers():
        return await legacy.chat_with_tools(req, request, response)
    try:
        return await tools_service.chat_with_tools(req, request, response)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        if should_fallback("tools"):
            _audit_legacy_fallback(request, "tools", type(exc).__name__)
            return await legacy.chat_with_tools(req, request, response)
        raise


@router.post("/v1/graphrag/index", response_model=IndexDocumentResponse)
async def add_to_index(req: IndexDocumentRequest, request: Request) -> IndexDocumentResponse:
    if not use_modular_handlers():
        return await legacy.add_to_index(req)
    try:
        return await tools_service.add_to_index(req)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        if should_fallback("index"):
            _audit_legacy_fallback(request, "index_add", type(exc).__name__)
            return await legacy.add_to_index(req)
        raise


@router.delete("/v1/graphrag/index", response_model=IndexDocumentResponse)
async def delete_from_index(req: DeleteDocumentRequest, request: Request) -> IndexDocumentResponse:
    if not use_modular_handlers():
        return await legacy.delete_from_index(req)
    try:
        return await tools_service.delete_from_index(req)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        if should_fallback("index"):
            _audit_legacy_fallback(request, "index_delete", type(exc).__name__)
            return await legacy.delete_from_index(req)
        raise
