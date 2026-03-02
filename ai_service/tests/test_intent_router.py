from __future__ import annotations

import httpx
import pytest

from app.services.router import EdgeIntentRouter, IntentLabel, IntentRouterContext


@pytest.fixture(autouse=True)
def reset_router_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("EDGE_ROUTER_BASE_URL", raising=False)
    monkeypatch.delenv("EDGE_ROUTER_API_KEY", raising=False)
    monkeypatch.delenv("EDGE_ROUTER_ENGINE", raising=False)
    monkeypatch.delenv("EDGE_ROUTER_TIMEOUT_SEC", raising=False)
    monkeypatch.delenv("EDGE_ROUTER_CONFIDENCE_THRESHOLD", raising=False)
    monkeypatch.delenv("LLM_BASE_URL_LOCAL", raising=False)
    monkeypatch.delenv("LLM_API_KEY_LOCAL", raising=False)
    monkeypatch.delenv("LLM_MODEL_LOCAL", raising=False)


def _router_context(mode: str | None = "tutor", query: str = "hello") -> IntentRouterContext:
    return IntentRouterContext(
        mode=mode,
        latest_user_query=query,
        message_history=[{"role": "user", "content": query}],
    )


def _configured_router(monkeypatch: pytest.MonkeyPatch) -> EdgeIntentRouter:
    monkeypatch.setenv("EDGE_ROUTER_BASE_URL", "https://edge.example.com")
    monkeypatch.setenv("EDGE_ROUTER_API_KEY", "edge-key")
    monkeypatch.setenv("EDGE_ROUTER_ENGINE", "qwen-1.5b")
    return EdgeIntentRouter()


@pytest.mark.asyncio
async def test_classify_simple_chat(monkeypatch: pytest.MonkeyPatch) -> None:
    router = _configured_router(monkeypatch)

    async def fake_request(self, prompt: str) -> str:
        return '{"intent":"SIMPLE_CHAT","confidence":0.92,"reason":"small_talk"}'

    monkeypatch.setattr(EdgeIntentRouter, "_request_intent", fake_request)

    decision = await router.classify(_router_context(query="你好"))
    assert decision.label == IntentLabel.SIMPLE_CHAT
    assert decision.reason == "small_talk"
    assert decision.engine == "qwen-1.5b"
    assert decision.fallback_used is False


@pytest.mark.asyncio
async def test_classify_complex_reasoning(monkeypatch: pytest.MonkeyPatch) -> None:
    router = _configured_router(monkeypatch)

    async def fake_request(self, prompt: str) -> str:
        return '{"intent":"COMPLEX_REASONING","confidence":0.98,"reason":"cross_chapter"}'

    monkeypatch.setattr(EdgeIntentRouter, "_request_intent", fake_request)

    decision = await router.classify(_router_context(query="散度定理和麦克斯韦方程组有什么联系？"))
    assert decision.label == IntentLabel.COMPLEX_REASONING
    assert decision.reason == "cross_chapter"
    assert decision.fallback_used is False


@pytest.mark.asyncio
async def test_low_confidence_falls_back_to_complex_reasoning(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EDGE_ROUTER_CONFIDENCE_THRESHOLD", "0.8")
    router = _configured_router(monkeypatch)

    async def fake_request(self, prompt: str) -> str:
        return '{"intent":"SIMPLE_CHAT","confidence":0.55,"reason":"uncertain"}'

    monkeypatch.setattr(EdgeIntentRouter, "_request_intent", fake_request)

    decision = await router.classify(_router_context(query="解释边界条件"))
    assert decision.label == IntentLabel.COMPLEX_REASONING
    assert decision.reason == "low_confidence"
    assert decision.fallback_used is True


@pytest.mark.asyncio
async def test_timeout_falls_back_to_complex_reasoning(monkeypatch: pytest.MonkeyPatch) -> None:
    router = _configured_router(monkeypatch)

    async def fake_request(self, prompt: str) -> str:
        raise httpx.ReadTimeout("timeout")

    monkeypatch.setattr(EdgeIntentRouter, "_request_intent", fake_request)

    decision = await router.classify(_router_context(query="证明高斯定律"))
    assert decision.label == IntentLabel.COMPLEX_REASONING
    assert decision.reason == "router_timeout"
    assert decision.fallback_used is True


@pytest.mark.asyncio
async def test_invalid_json_falls_back_to_complex_reasoning(monkeypatch: pytest.MonkeyPatch) -> None:
    router = _configured_router(monkeypatch)

    async def fake_request(self, prompt: str) -> str:
        return "not-json"

    monkeypatch.setattr(EdgeIntentRouter, "_request_intent", fake_request)

    decision = await router.classify(_router_context(query="解释散度定理"))
    assert decision.label == IntentLabel.COMPLEX_REASONING
    assert decision.reason == "invalid_json"
    assert decision.fallback_used is True


@pytest.mark.asyncio
async def test_rag_mode_forces_complex_without_calling_model(monkeypatch: pytest.MonkeyPatch) -> None:
    router = EdgeIntentRouter()

    async def explode(self, prompt: str) -> str:
        raise AssertionError("router model should not be called")

    monkeypatch.setattr(EdgeIntentRouter, "_request_intent", explode)

    decision = await router.classify(_router_context(mode="tutor_rag", query="hello"))
    assert decision.label == IntentLabel.COMPLEX_REASONING
    assert decision.reason == "mode_forced_rag"
    assert decision.fallback_used is False
