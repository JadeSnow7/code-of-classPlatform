"""Routing policy and request authorization helpers."""

from __future__ import annotations

import hmac
import os
import sys
import uuid
from dataclasses import dataclass
from typing import Literal

import httpx
from fastapi import HTTPException, Request

from app.core.audit import _audit_event
from app.model_router import ModelFamily

PrivacyLevel = Literal["private", "public"]
RouteLevel = Literal["local", "cloud", "auto"]
RequestIDSource = Literal["upstream", "generated"]

ALLOWED_PRIVACY_LEVELS = {"private", "public"}
ALLOWED_ROUTE_LEVELS = {"local", "cloud", "auto"}

if sys.version_info >= (3, 10):
    _routing_decision_dataclass = dataclass(slots=True)
else:
    _routing_decision_dataclass = dataclass


@_routing_decision_dataclass
class RoutingDecision:
    request_id: str
    request_id_source: RequestIDSource
    endpoint: str
    mode: str | None
    privacy_input: str | None
    route_input: str | None
    privacy_resolved: PrivacyLevel
    route_resolved: RouteLevel
    caller_trusted: bool


def _get_env(name: str) -> str:
    value = os.getenv(name, "")
    return value.strip()


def _get_bool_env(name: str, default: bool = False) -> bool:
    value = _get_env(name).lower()
    if value in {"1", "true", "yes", "y", "on"}:
        return True
    if value in {"0", "false", "no", "n", "off"}:
        return False
    return default


def _get_int_env(name: str, default: int) -> int:
    value = _get_env(name)
    if not value:
        return default
    try:
        return int(value)
    except ValueError:
        return default


def _app_env() -> str:
    return (_get_env("APP_ENV") or "dev").lower()


def _routing_policy() -> str:
    return (_get_env("LLM_ROUTING_POLICY") or "local_first").lower()


def _validate_routing_policy() -> None:
    if _app_env() == "prod" and _routing_policy() != "local_first":
        raise RuntimeError("APP_ENV=prod requires LLM_ROUTING_POLICY=local_first")


def _family_suffix(model_family: ModelFamily) -> str:
    return "VL" if model_family == "qwen3_vl" else "TEXT"


def _upstream_config(
    upstream: Literal["local", "cloud"],
    model_family: ModelFamily = "qwen3",
) -> dict[str, str]:
    suffix = _family_suffix(model_family)
    default_model = "qwen3-vl" if model_family == "qwen3_vl" else "qwen-plus"

    if upstream == "local":
        base_url = (
            _get_env(f"LLM_BASE_URL_LOCAL_{suffix}")
            or _get_env("LLM_BASE_URL_LOCAL")
            or _get_env("LLM_BASE_URL")
        )
        api_key = (
            _get_env(f"LLM_API_KEY_LOCAL_{suffix}")
            or _get_env("LLM_API_KEY_LOCAL")
            or _get_env("LLM_API_KEY")
        )
        model = (
            _get_env(f"LLM_MODEL_LOCAL_{suffix}")
            or _get_env("LLM_MODEL_LOCAL")
            or _get_env("LLM_MODEL")
            or default_model
        )
        return {"base_url": base_url, "api_key": api_key, "model": model}

    base_url = _get_env(f"LLM_BASE_URL_CLOUD_{suffix}") or _get_env("LLM_BASE_URL_CLOUD")
    api_key = _get_env(f"LLM_API_KEY_CLOUD_{suffix}") or _get_env("LLM_API_KEY_CLOUD")
    model = (
        _get_env(f"LLM_MODEL_CLOUD_{suffix}")
        or _get_env("LLM_MODEL_CLOUD")
        or _get_env("LLM_MODEL_LOCAL")
        or _get_env("LLM_MODEL")
        or default_model
    )
    return {"base_url": base_url, "api_key": api_key, "model": model}


def _upstream_ready(
    upstream: Literal["local", "cloud"],
    model_family: ModelFamily = "qwen3",
) -> bool:
    cfg = _upstream_config(upstream, model_family=model_family)
    return bool(cfg["base_url"] and cfg["api_key"])


def _resolve_request_id(request: Request) -> tuple[str, RequestIDSource]:
    request_id = (request.headers.get("X-Request-ID") or "").strip()
    if request_id:
        return request_id, "upstream"
    return str(uuid.uuid4()), "generated"


def _normalize_routing_input(value: str | None, allowed: set[str]) -> str | None:
    if value is None:
        return None
    normalized = value.strip().lower()
    if not normalized:
        return None
    if normalized not in allowed:
        return "__invalid__"
    return normalized


def _raise_api_error(status_code: int, code: str, message: str, request_id: str) -> None:
    raise HTTPException(
        status_code=status_code,
        detail={"code": code, "message": message},
        headers={"X-Request-ID": request_id},
    )


def _resolve_privacy_and_route(
    request: Request,
    body_privacy: str | None,
    body_route: str | None,
    *,
    request_id: str,
    request_id_source: str,
    endpoint: str,
    mode: str | None,
    caller_trusted: bool,
) -> tuple[PrivacyLevel, RouteLevel, str | None, str | None]:
    header_privacy_raw = request.headers.get("X-Privacy-Level")
    header_route_raw = request.headers.get("X-LLM-Route")

    header_privacy = _normalize_routing_input(header_privacy_raw, ALLOWED_PRIVACY_LEVELS)
    body_privacy_normalized = _normalize_routing_input(body_privacy, ALLOWED_PRIVACY_LEVELS)
    header_route = _normalize_routing_input(header_route_raw, ALLOWED_ROUTE_LEVELS)
    body_route_normalized = _normalize_routing_input(body_route, ALLOWED_ROUTE_LEVELS)

    if "__invalid__" in {header_privacy, body_privacy_normalized, header_route, body_route_normalized}:
        _audit_event(
            event="routing_conflict",
            request_id=request_id,
            request_id_source=request_id_source,
            endpoint=endpoint,
            mode=mode,
            privacy_input=header_privacy_raw or body_privacy,
            route_input=header_route_raw or body_route,
            privacy_resolved="private",
            route_resolved="local",
            caller_trusted=caller_trusted,
            final_upstream="none",
            fallback_reason="invalid_routing_value",
            status_code=400,
            latency_ms=0,
        )
        _raise_api_error(400, "INVALID_ROUTING_PARAMS", "invalid privacy/route value", request_id)

    if header_privacy and body_privacy_normalized and header_privacy != body_privacy_normalized:
        _audit_event(
            event="routing_conflict",
            request_id=request_id,
            request_id_source=request_id_source,
            endpoint=endpoint,
            mode=mode,
            privacy_input="header={0},body={1}".format(header_privacy, body_privacy_normalized),
            route_input=header_route_raw or body_route,
            privacy_resolved="private",
            route_resolved="local",
            caller_trusted=caller_trusted,
            final_upstream="none",
            fallback_reason="privacy_conflict",
            status_code=400,
            latency_ms=0,
        )
        _raise_api_error(
            400,
            "CONFLICTING_ROUTING_PARAMS",
            "conflicting privacy between header and body",
            request_id,
        )

    if header_route and body_route_normalized and header_route != body_route_normalized:
        _audit_event(
            event="routing_conflict",
            request_id=request_id,
            request_id_source=request_id_source,
            endpoint=endpoint,
            mode=mode,
            privacy_input=header_privacy_raw or body_privacy,
            route_input="header={0},body={1}".format(header_route, body_route_normalized),
            privacy_resolved="private",
            route_resolved="local",
            caller_trusted=caller_trusted,
            final_upstream="none",
            fallback_reason="route_conflict",
            status_code=400,
            latency_ms=0,
        )
        _raise_api_error(
            400,
            "CONFLICTING_ROUTING_PARAMS",
            "conflicting route between header and body",
            request_id,
        )

    privacy: PrivacyLevel = header_privacy or body_privacy_normalized or "private"  # type: ignore[assignment]
    route: RouteLevel = header_route or body_route_normalized or "local"  # type: ignore[assignment]
    return privacy, route, header_privacy_raw or body_privacy, header_route_raw or body_route


def _is_trusted_gateway(request: Request) -> bool:
    provided = (request.headers.get("X-AI-Gateway-Token") or "").strip()
    expected = _get_env("AI_GATEWAY_SHARED_TOKEN")
    return bool(expected and provided) and hmac.compare_digest(provided, expected)


def _enforce_public_policy(
    *,
    request_id: str,
    request_id_source: str,
    endpoint: str,
    mode: str | None,
    privacy_input: str | None,
    route_input: str | None,
    privacy: PrivacyLevel,
    route: RouteLevel,
    caller_trusted: bool,
) -> None:
    if (privacy == "public" or route in {"cloud", "auto"}) and not caller_trusted:
        _audit_event(
            event="routing_forbidden",
            request_id=request_id,
            request_id_source=request_id_source,
            endpoint=endpoint,
            mode=mode,
            privacy_input=privacy_input,
            route_input=route_input,
            privacy_resolved=privacy,
            route_resolved=route,
            caller_trusted=caller_trusted,
            final_upstream="none",
            fallback_reason="untrusted_gateway",
            status_code=403,
            latency_ms=0,
        )
        _raise_api_error(
            403,
            "ROUTING_FORBIDDEN",
            "public/cloud routing requires trusted gateway",
            request_id,
        )

    if privacy == "private" and route in {"cloud", "auto"}:
        _audit_event(
            event="routing_conflict",
            request_id=request_id,
            request_id_source=request_id_source,
            endpoint=endpoint,
            mode=mode,
            privacy_input=privacy_input,
            route_input=route_input,
            privacy_resolved=privacy,
            route_resolved=route,
            caller_trusted=caller_trusted,
            final_upstream="none",
            fallback_reason="private_requires_local",
            status_code=400,
            latency_ms=0,
        )
        _raise_api_error(400, "INVALID_ROUTING_PARAMS", "private requests must use local route", request_id)


def _can_cloud_fallback(
    decision: RoutingDecision,
    model_family: ModelFamily = "qwen3",
) -> bool:
    if decision.route_resolved == "cloud":
        return False
    if decision.privacy_resolved != "public":
        return False
    if not decision.caller_trusted:
        return False
    if not _upstream_ready("cloud", model_family=model_family):
        return False
    if _app_env() == "prod":
        return True
    return _get_bool_env("LLM_ENABLE_CLOUD_FALLBACK_NONPROD", default=False)


def _timeout_seconds(upstream: Literal["local", "cloud"]) -> float:
    raw_default = 30 if upstream == "local" else 60
    value = _get_int_env(
        "LLM_LOCAL_TIMEOUT_SEC" if upstream == "local" else "LLM_CLOUD_TIMEOUT_SEC",
        raw_default,
    )
    return float(max(1, value))


def _http_timeout(upstream: Literal["local", "cloud"], *, stream: bool) -> httpx.Timeout:
    read_timeout = _timeout_seconds(upstream)
    if stream:
        return httpx.Timeout(timeout=None, connect=30.0, read=read_timeout, write=30.0, pool=30.0)
    return httpx.Timeout(timeout=None, connect=30.0, read=read_timeout, write=30.0, pool=30.0)


def _build_routing_decision(
    request: Request,
    *,
    endpoint: str,
    mode: str | None,
    body_privacy: str | None,
    body_route: str | None,
) -> RoutingDecision:
    request_id, request_id_source = _resolve_request_id(request)
    caller_trusted = _is_trusted_gateway(request)
    privacy, route, privacy_input, route_input = _resolve_privacy_and_route(
        request,
        body_privacy,
        body_route,
        request_id=request_id,
        request_id_source=request_id_source,
        endpoint=endpoint,
        mode=mode,
        caller_trusted=caller_trusted,
    )
    _enforce_public_policy(
        request_id=request_id,
        request_id_source=request_id_source,
        endpoint=endpoint,
        mode=mode,
        privacy_input=privacy_input,
        route_input=route_input,
        privacy=privacy,
        route=route,
        caller_trusted=caller_trusted,
    )
    decision = RoutingDecision(
        request_id=request_id,
        request_id_source=request_id_source,
        endpoint=endpoint,
        mode=mode,
        privacy_input=privacy_input,
        route_input=route_input,
        privacy_resolved=privacy,
        route_resolved=route,
        caller_trusted=caller_trusted,
    )
    _audit_event(
        event="routing_decision",
        request_id=decision.request_id,
        request_id_source=decision.request_id_source,
        endpoint=decision.endpoint,
        mode=decision.mode,
        privacy_input=decision.privacy_input,
        route_input=decision.route_input,
        privacy_resolved=decision.privacy_resolved,
        route_resolved=decision.route_resolved,
        caller_trusted=decision.caller_trusted,
        final_upstream="none",
        fallback_reason="",
        status_code=200,
        latency_ms=0,
    )
    return decision


__all__ = [
    "ALLOWED_PRIVACY_LEVELS",
    "ALLOWED_ROUTE_LEVELS",
    "PrivacyLevel",
    "RequestIDSource",
    "RouteLevel",
    "RoutingDecision",
    "_app_env",
    "_build_routing_decision",
    "_can_cloud_fallback",
    "_enforce_public_policy",
    "_family_suffix",
    "_get_bool_env",
    "_get_env",
    "_get_int_env",
    "_http_timeout",
    "_is_trusted_gateway",
    "_normalize_routing_input",
    "_raise_api_error",
    "_resolve_privacy_and_route",
    "_resolve_request_id",
    "_routing_policy",
    "_timeout_seconds",
    "_upstream_config",
    "_upstream_ready",
    "_validate_routing_policy",
]
