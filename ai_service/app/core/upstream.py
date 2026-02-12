"""Upstream LLM request helpers used by modular services."""

from __future__ import annotations

from typing import Any, Literal

import httpx

from app.core.audit import _audit_event
from app.core.routing import (
    RoutingDecision,
    _can_cloud_fallback,
    _family_suffix,
    _http_timeout,
    _raise_api_error,
    _timeout_seconds,
    _upstream_config,
    _upstream_ready,
)
from app.model_router import ModelFamily


async def _post_chat_completions_once(
    payload: dict[str, Any],
    *,
    upstream: Literal["local", "cloud"],
    model_family: ModelFamily = "qwen3",
) -> tuple[httpx.Response, str]:
    cfg = _upstream_config(upstream, model_family=model_family)
    if not cfg["base_url"] or not cfg["api_key"]:
        raise ValueError("{0} upstream is not configured".format(upstream))
    model = cfg["model"] or "qwen-plus"
    request_payload = dict(payload)
    request_payload["model"] = model
    url = cfg["base_url"].rstrip("/") + "/v1/chat/completions"
    headers = {"Authorization": "Bearer {0}".format(cfg["api_key"])}
    timeout = _http_timeout(upstream, stream=False)
    async with httpx.AsyncClient(timeout=timeout, trust_env=False) as client:
        response = await client.post(url, json=request_payload, headers=headers)
    return response, model


async def _post_chat_completions_with_routing(
    payload: dict[str, Any],
    decision: RoutingDecision,
    *,
    model_family: ModelFamily = "qwen3",
    model_family_requested: str = "qwen3",
    needs_vision: bool = False,
) -> tuple[dict[str, Any], str, str, str]:
    primary: Literal["local", "cloud"] = "cloud" if decision.route_resolved == "cloud" else "local"
    fallback_reason = ""

    try:
        once_kwargs: dict[str, Any] = {"upstream": primary}
        if model_family != "qwen3":
            once_kwargs["model_family"] = model_family
        resp, model = await _post_chat_completions_once(payload, **once_kwargs)
        final_upstream = primary
    except httpx.TimeoutException as exc:
        if primary == "local":
            _audit_event(
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
                model_family_requested=model_family_requested,
                model_family_resolved=model_family,
                needs_vision=needs_vision,
            )
            if _can_cloud_fallback(decision, model_family=model_family):
                _audit_event(
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
                    model_family_requested=model_family_requested,
                    model_family_resolved=model_family,
                    needs_vision=needs_vision,
                )
                try:
                    cloud_kwargs: dict[str, Any] = {"upstream": "cloud"}
                    if model_family != "qwen3":
                        cloud_kwargs["model_family"] = model_family
                    resp, model = await _post_chat_completions_once(payload, **cloud_kwargs)
                except ValueError as cloud_cfg_error:
                    _raise_api_error(503, "UPSTREAM_NOT_CONFIGURED", str(cloud_cfg_error), decision.request_id)
                except httpx.HTTPError as cloud_exc:
                    _raise_api_error(
                        502,
                        "UPSTREAM_REQUEST_FAILED",
                        "cloud request failed: {0}".format(cloud_exc),
                        decision.request_id,
                    )
                final_upstream = "cloud"
                fallback_reason = "local_timeout"
            else:
                _raise_api_error(
                    504,
                    "LOCAL_TIMEOUT",
                    "local upstream timeout and cloud fallback disabled",
                    decision.request_id,
                )
        else:
            _raise_api_error(504, "CLOUD_TIMEOUT", "cloud upstream timeout: {0}".format(exc), decision.request_id)
    except ValueError as cfg_error:
        _raise_api_error(503, "UPSTREAM_NOT_CONFIGURED", str(cfg_error), decision.request_id)
    except httpx.HTTPError as exc:
        _raise_api_error(502, "UPSTREAM_REQUEST_FAILED", "upstream request failed: {0}".format(exc), decision.request_id)

    if resp.status_code >= 300:
        _raise_api_error(
            502,
            "UPSTREAM_ERROR",
            "upstream error: {0} {1}".format(resp.status_code, resp.text),
            decision.request_id,
        )

    try:
        data = resp.json()
    except ValueError as exc:
        _raise_api_error(
            502,
            "INVALID_UPSTREAM_RESPONSE",
            "invalid upstream response: {0}".format(exc),
            decision.request_id,
        )

    return data, final_upstream, fallback_reason, model


__all__ = [
    "_family_suffix",
    "_upstream_config",
    "_upstream_ready",
    "_can_cloud_fallback",
    "_timeout_seconds",
    "_http_timeout",
    "_post_chat_completions_once",
    "_post_chat_completions_with_routing",
]
