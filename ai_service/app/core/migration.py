"""Migration feature flags for modular-vs-legacy routing."""

from __future__ import annotations

from app.core.routing import _get_bool_env, _get_env

_VALID_IMPLS = {"modular", "legacy"}
_DEFAULT_ENDPOINTS = {"chat", "multimodal", "hybrid", "tools", "guided", "writing", "index"}


def handler_impl() -> str:
    raw = (_get_env("AI_SERVICE_HANDLER_IMPL") or "modular").strip().lower()
    return raw if raw in _VALID_IMPLS else "modular"


def legacy_fallback_enabled() -> bool:
    return _get_bool_env("AI_SERVICE_LEGACY_FALLBACK", default=True)


def legacy_fallback_endpoints() -> set[str]:
    raw = _get_env("AI_SERVICE_LEGACY_FALLBACK_ENDPOINTS")
    if not raw:
        return set(_DEFAULT_ENDPOINTS)
    out: set[str] = set()
    for part in raw.split(","):
        normalized = part.strip().lower()
        if normalized:
            out.add(normalized)
    return out or set(_DEFAULT_ENDPOINTS)


def use_modular_handlers() -> bool:
    return handler_impl() == "modular"


def should_fallback(endpoint: str) -> bool:
    if not use_modular_handlers():
        return False
    if not legacy_fallback_enabled():
        return False
    return endpoint.strip().lower() in legacy_fallback_endpoints()
