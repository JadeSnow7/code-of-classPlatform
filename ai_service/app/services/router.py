"""Intent routing for lightweight edge-side classification."""

from __future__ import annotations

import json
import os
import re
import sys
from dataclasses import dataclass
from enum import Enum
from typing import Any

import httpx

if sys.version_info >= (3, 10):
    _router_dataclass = dataclass(slots=True)
else:
    _router_dataclass = dataclass

_MAX_CONTEXT_MESSAGES = 6
_MAX_CONTEXT_CHARS = 2000

_ROUTER_SYSTEM_PROMPT = """
你是高校 AI 教学平台的意图路由器，只负责把问题分成两类：
1. SIMPLE_CHAT
2. COMPLEX_REASONING

判定标准：
- SIMPLE_CHAT：闲聊、简单概念问答、一步式纠错、局部代码修复、不依赖跨章节关系链。
- COMPLEX_REASONING：跨概念关联、证明、推导、机制解释、需要多实体关系、需要跨章节整合。

典型 COMPLEX_REASONING 例子：
- 散度定理和麦克斯韦方程组有什么联系？
- 量子态演化和测量塌缩如何统一理解？
- 边界条件与电磁场基本定律之间如何推导衔接？

只允许输出一行 JSON，不要输出 Markdown，不要输出额外说明：
{"intent":"SIMPLE_CHAT|COMPLEX_REASONING","confidence":0.0,"reason":"一句简短理由"}
""".strip()


class IntentLabel(str, Enum):
    """Intent labels for chat routing."""

    SIMPLE_CHAT = "SIMPLE_CHAT"
    COMPLEX_REASONING = "COMPLEX_REASONING"


@_router_dataclass
class IntentDecision:
    """Result of edge-side intent classification."""

    label: IntentLabel
    confidence: float
    reason: str
    engine: str
    raw_output: str
    fallback_used: bool = False


@_router_dataclass
class IntentRouterContext:
    """Routing context extracted from the incoming request."""

    mode: str | None
    latest_user_query: str
    message_history: list[dict[str, str]]
    course_id: str | None = None
    user_id: str | None = None
    user_role: str | None = None


class EdgeIntentRouter:
    """Route chat requests to simple or complex reasoning paths."""

    def __init__(self) -> None:
        self.base_url = (
            os.getenv("EDGE_ROUTER_BASE_URL", "").strip()
            or os.getenv("LLM_BASE_URL_LOCAL", "").strip()
            or os.getenv("LLM_BASE_URL", "").strip()
        )
        self.api_key = (
            os.getenv("EDGE_ROUTER_API_KEY", "").strip()
            or os.getenv("LLM_API_KEY_LOCAL", "").strip()
            or os.getenv("LLM_API_KEY", "").strip()
        )
        self.engine = (
            os.getenv("EDGE_ROUTER_ENGINE", "").strip()
            or os.getenv("LLM_MODEL_LOCAL", "").strip()
            or "edge-router"
        )
        self.timeout_sec = self._get_float_env("EDGE_ROUTER_TIMEOUT_SEC", 5.0)
        self.confidence_threshold = self._get_float_env("EDGE_ROUTER_CONFIDENCE_THRESHOLD", 0.65)

    async def classify(self, ctx: IntentRouterContext) -> IntentDecision:
        """Classify the request intent using the edge router model."""
        mode = (ctx.mode or "").strip().lower()
        if mode.endswith("_rag"):
            return IntentDecision(
                label=IntentLabel.COMPLEX_REASONING,
                confidence=1.0,
                reason="mode_forced_rag",
                engine=self.engine,
                raw_output='{"intent":"COMPLEX_REASONING","confidence":1.0,"reason":"mode_forced_rag"}',
            )

        prompt = self._build_prompt(ctx)
        if not self.base_url or not self.api_key:
            return self._fallback("router_unconfigured", raw_output=prompt)

        try:
            raw_output = await self._request_intent(prompt)
        except httpx.TimeoutException:
            return self._fallback("router_timeout")
        except (httpx.HTTPError, RuntimeError) as exc:
            return self._fallback("router_unavailable", raw_output=str(exc))

        try:
            payload = self._parse_response(raw_output)
        except ValueError as exc:
            return self._fallback(str(exc), raw_output=raw_output)

        intent_raw = str(payload.get("intent", "")).strip().upper()
        if intent_raw not in {IntentLabel.SIMPLE_CHAT.value, IntentLabel.COMPLEX_REASONING.value}:
            return self._fallback("invalid_intent", raw_output=raw_output)

        try:
            confidence = float(payload.get("confidence", 0.0))
        except (TypeError, ValueError):
            return self._fallback("invalid_confidence", raw_output=raw_output)

        if confidence < self.confidence_threshold:
            return self._fallback("low_confidence", raw_output=raw_output)

        reason = str(payload.get("reason", "")).strip() or "edge_classifier"
        return IntentDecision(
            label=IntentLabel(intent_raw),
            confidence=max(0.0, min(confidence, 1.0)),
            reason=reason,
            engine=self.engine,
            raw_output=raw_output,
        )

    async def _request_intent(self, prompt: str) -> str:
        """Call the edge router model and return raw text output."""
        payload = {
            "model": self.engine,
            "temperature": 0.0,
            "max_tokens": 120,
            "messages": [
                {"role": "system", "content": _ROUTER_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
        }
        headers = {"Authorization": f"Bearer {self.api_key}"}
        timeout = httpx.Timeout(timeout=None, connect=10.0, read=self.timeout_sec, write=10.0, pool=10.0)
        url = self.base_url.rstrip("/") + "/v1/chat/completions"
        async with httpx.AsyncClient(timeout=timeout, trust_env=False) as client:
            response = await client.post(url, json=payload, headers=headers)
        response.raise_for_status()
        data = response.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        return str(content).strip()

    def _build_prompt(self, ctx: IntentRouterContext) -> str:
        """Build a compact text-only classification prompt."""
        history = self._normalize_history(ctx.message_history)
        total_chars = 0
        trimmed: list[dict[str, str]] = []
        for item in reversed(history[-_MAX_CONTEXT_MESSAGES:]):
            content = item.get("content", "").strip()
            if not content:
                continue
            remaining = _MAX_CONTEXT_CHARS - total_chars
            if remaining <= 0:
                break
            snippet = content[:remaining]
            total_chars += len(snippet)
            trimmed.append({"role": item.get("role", "user"), "content": snippet})
        trimmed.reverse()

        lines = [
            f"mode: {ctx.mode or ''}",
            f"latest_user_query: {ctx.latest_user_query.strip()[:800]}",
            "recent_messages:",
        ]
        for item in trimmed:
            role = item.get("role", "user").strip() or "user"
            content = item.get("content", "").strip()
            if content:
                lines.append(f"- {role}: {content}")
        return "\n".join(lines).strip()

    def _normalize_history(self, history: list[dict[str, str]]) -> list[dict[str, str]]:
        normalized: list[dict[str, str]] = []
        for item in history or []:
            if not isinstance(item, dict):
                continue
            role = str(item.get("role", "")).strip() or "user"
            content = str(item.get("content", "")).strip()
            if not content:
                continue
            normalized.append({"role": role, "content": content})
        return normalized

    def _parse_response(self, raw_output: str) -> dict[str, Any]:
        """Parse a JSON object from the router model response."""
        content = raw_output.strip()
        if not content:
            raise ValueError("empty_output")

        if content.startswith("```"):
            content = re.sub(r"^```(?:json)?\s*", "", content)
            content = re.sub(r"\s*```$", "", content)

        start = content.find("{")
        end = content.rfind("}")
        if start >= 0 and end > start:
            content = content[start : end + 1]

        try:
            parsed = json.loads(content)
        except json.JSONDecodeError as exc:
            raise ValueError("invalid_json") from exc
        if not isinstance(parsed, dict):
            raise ValueError("invalid_json")
        return parsed

    def _fallback(self, reason: str, *, raw_output: str = "") -> IntentDecision:
        """Fall back to the complex path for safety."""
        return IntentDecision(
            label=IntentLabel.COMPLEX_REASONING,
            confidence=1.0,
            reason=reason,
            engine=self.engine,
            raw_output=raw_output,
            fallback_used=True,
        )

    def _get_float_env(self, name: str, default: float) -> float:
        raw_value = os.getenv(name, "").strip()
        if not raw_value:
            return default
        try:
            return float(raw_value)
        except ValueError:
            return default
