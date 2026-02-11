"""
Model routing helpers for Qwen3/Qwen3-VL.

This module keeps route decision logic isolated from endpoint handlers.
"""
from __future__ import annotations

from typing import Any, Literal

ModelFamily = Literal["qwen3", "qwen3_vl"]
RequestedModelFamily = Literal["qwen3", "qwen3_vl", "auto"]

_ALLOWED_REQUESTED_FAMILIES = {"qwen3", "qwen3_vl", "auto"}
_VISION_PART_TYPES = {"image_url", "video_url"}


def normalize_requested_model_family(value: str | None) -> RequestedModelFamily:
    """Normalize requested model family, defaulting to auto."""
    if value is None or not value.strip():
        return "auto"
    normalized = value.strip().lower()
    if normalized not in _ALLOWED_REQUESTED_FAMILIES:
        raise ValueError(
            "model_family must be one of: qwen3, qwen3_vl, auto"
        )
    return normalized  # type: ignore[return-value]


def message_needs_vision(message: dict[str, Any]) -> bool:
    """Return True if message contains image/video parts."""
    parts = message.get("parts")
    if not isinstance(parts, list):
        return False
    for part in parts:
        if not isinstance(part, dict):
            continue
        part_type = str(part.get("type", "")).strip().lower()
        if part_type in _VISION_PART_TYPES:
            return True
    return False


def needs_vision(messages: list[dict[str, Any]]) -> bool:
    """Return True if any message requires vision support."""
    return any(message_needs_vision(m) for m in messages)


def resolve_model_family(
    requested: RequestedModelFamily,
    *,
    needs_vision_input: bool,
) -> ModelFamily:
    """Resolve final model family from request and payload."""
    if requested == "qwen3":
        return "qwen3"
    if requested == "qwen3_vl":
        return "qwen3_vl"
    return "qwen3_vl" if needs_vision_input else "qwen3"


def validate_message_parts(message: dict[str, Any]) -> None:
    """
    Validate multimodal message shape.

    Accepted shape:
    - content: optional text
    - parts: optional list of
      - {"type": "text", "text": "..."}
      - {"type": "image_url", "url": "https://..."}
      - {"type": "video_url", "url": "https://..."}
    """
    content = message.get("content")
    parts = message.get("parts")

    if (content is None or str(content).strip() == "") and not parts:
        raise ValueError("message must include non-empty content or parts")

    if parts is None:
        return
    if not isinstance(parts, list):
        raise ValueError("parts must be a list")

    for part in parts:
        if not isinstance(part, dict):
            raise ValueError("each part must be an object")
        part_type = str(part.get("type", "")).strip().lower()
        if part_type not in {"text", "image_url", "video_url"}:
            raise ValueError("part.type must be text, image_url, or video_url")
        if part_type == "text":
            text = str(part.get("text", "")).strip()
            if not text:
                raise ValueError("text part requires non-empty text")
            continue
        url = str(part.get("url", "")).strip()
        if not url:
            raise ValueError(f"{part_type} part requires non-empty url")


def to_openai_content(parts: list[dict[str, Any]], content: str | None = None) -> list[dict[str, Any]]:
    """Convert internal part format to OpenAI-compatible content parts."""
    normalized: list[dict[str, Any]] = []
    if content and content.strip():
        normalized.append({"type": "text", "text": content.strip()})
    for part in parts:
        part_type = str(part.get("type", "")).strip().lower()
        if part_type == "text":
            normalized.append({"type": "text", "text": str(part.get("text", ""))})
            continue
        url = str(part.get("url", "")).strip()
        normalized.append({"type": part_type, part_type: {"url": url}})
    return normalized

