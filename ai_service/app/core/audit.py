"""Audit helpers for routing decisions and request lifecycle."""

from __future__ import annotations

import json
import logging
import time
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.core.routing import RoutingDecision

_audit_logger = logging.getLogger("ai_service.audit")


def _audit_event(
    *,
    event: str,
    request_id: str,
    request_id_source: str,
    endpoint: str,
    mode: str | None,
    privacy_input: str | None,
    route_input: str | None,
    privacy_resolved: str,
    route_resolved: str,
    caller_trusted: bool,
    final_upstream: str,
    fallback_reason: str,
    status_code: int,
    latency_ms: int,
    model_family_requested: str = "",
    model_family_resolved: str = "",
    needs_vision: bool = False,
) -> None:
    request_id = request_id or "missing_request_id"
    request_id_source = request_id_source or "unknown"
    endpoint = endpoint or "unknown"
    privacy_resolved = privacy_resolved or "private"
    route_resolved = route_resolved or "local"
    final_upstream = final_upstream or "none"
    fallback_reason = fallback_reason or ""
    payload = {
        "event": event,
        "request_id": request_id,
        "request_id_source": request_id_source,
        "endpoint": endpoint,
        "mode": mode or "",
        "privacy_input": privacy_input or "",
        "route_input": route_input or "",
        "privacy_resolved": privacy_resolved,
        "route_resolved": route_resolved,
        "caller_trusted": caller_trusted,
        "final_upstream": final_upstream,
        "fallback_reason": fallback_reason,
        "status_code": status_code,
        "latency_ms": latency_ms,
        "model_family_requested": model_family_requested,
        "model_family_resolved": model_family_resolved,
        "needs_vision": needs_vision,
    }
    _audit_logger.info(json.dumps(payload, ensure_ascii=False))


def _audit_request_complete(
    decision: RoutingDecision,
    *,
    status_code: int,
    final_upstream: str,
    fallback_reason: str,
    started_at: float,
    model_family_requested: str = "",
    model_family_resolved: str = "",
    needs_vision: bool = False,
) -> None:
    _audit_event(
        event="request_complete",
        request_id=decision.request_id,
        request_id_source=decision.request_id_source,
        endpoint=decision.endpoint,
        mode=decision.mode,
        privacy_input=decision.privacy_input,
        route_input=decision.route_input,
        privacy_resolved=decision.privacy_resolved,
        route_resolved=decision.route_resolved,
        caller_trusted=decision.caller_trusted,
        final_upstream=final_upstream,
        fallback_reason=fallback_reason,
        status_code=status_code,
        latency_ms=max(0, int((time.monotonic() - started_at) * 1000)),
        model_family_requested=model_family_requested,
        model_family_resolved=model_family_resolved,
        needs_vision=needs_vision,
    )


__all__ = ["_audit_event", "_audit_request_complete"]
