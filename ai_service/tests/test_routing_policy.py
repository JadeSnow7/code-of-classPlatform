from __future__ import annotations

import uuid
import json

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import main
from app.core import audit as audit_core
from app.core import upstream as upstream_core
from app.services import hybrid_service


@pytest.fixture(autouse=True)
def reset_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LLM_ROUTING_POLICY", "local_first")
    monkeypatch.setenv("APP_ENV", "dev")
    monkeypatch.setenv("AI_SERVICE_HANDLER_IMPL", "modular")
    monkeypatch.setenv("AI_SERVICE_LEGACY_FALLBACK", "true")
    monkeypatch.setenv("AI_SERVICE_LEGACY_FALLBACK_ENDPOINTS", "chat,multimodal,hybrid,tools,guided,writing,index")
    monkeypatch.delenv("AI_GATEWAY_SHARED_TOKEN", raising=False)
    monkeypatch.delenv("LLM_ENABLE_CLOUD_FALLBACK_NONPROD", raising=False)
    monkeypatch.delenv("LLM_BASE_URL_CLOUD", raising=False)
    monkeypatch.delenv("LLM_API_KEY_CLOUD", raising=False)
    monkeypatch.delenv("LLM_BASE_URL_LOCAL", raising=False)
    monkeypatch.delenv("LLM_API_KEY_LOCAL", raising=False)
    monkeypatch.delenv("LLM_BASE_URL_CLOUD_VL", raising=False)
    monkeypatch.delenv("LLM_API_KEY_CLOUD_VL", raising=False)
    monkeypatch.delenv("LLM_MODEL_CLOUD_VL", raising=False)
    monkeypatch.delenv("LLM_BASE_URL_LOCAL_VL", raising=False)
    monkeypatch.delenv("LLM_API_KEY_LOCAL_VL", raising=False)
    monkeypatch.delenv("LLM_MODEL_LOCAL_VL", raising=False)
    monkeypatch.setenv("GRAPH_RAG_ENABLED", "false")
    monkeypatch.setenv("AI_MULTIMODAL_ENABLED", "false")
    monkeypatch.setenv("RERANKER_ENABLED", "false")


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    async def fake_post(payload: dict, decision: main.RoutingDecision):
        return {"choices": [{"message": {"content": "ok"}}]}, "local", "", "local-model"

    monkeypatch.setattr(upstream_core, "_post_chat_completions_with_routing", fake_post)
    return TestClient(main.app)


def test_request_id_generated_when_missing(client: TestClient) -> None:
    resp = client.post("/v1/chat", json={"messages": [{"role": "user", "content": "hello"}]})
    assert resp.status_code == 200
    generated_id = resp.headers.get("X-Request-ID")
    assert generated_id
    uuid.UUID(generated_id)


def test_request_id_passthrough_when_present(client: TestClient) -> None:
    resp = client.post(
        "/v1/chat",
        json={"messages": [{"role": "user", "content": "hello"}]},
        headers={"X-Request-ID": "upstream-req-id"},
    )
    assert resp.status_code == 200
    assert resp.headers.get("X-Request-ID") == "upstream-req-id"


def test_conflicting_route_between_header_and_body_returns_400(client: TestClient) -> None:
    resp = client.post(
        "/v1/chat",
        json={"messages": [{"role": "user", "content": "hello"}], "route": "local"},
        headers={"X-LLM-Route": "cloud"},
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "CONFLICTING_ROUTING_PARAMS"


def test_untrusted_public_request_returns_403(client: TestClient) -> None:
    resp = client.post(
        "/v1/chat",
        json={
            "messages": [{"role": "user", "content": "hello"}],
            "privacy": "public",
            "route": "local",
        },
    )
    assert resp.status_code == 403
    assert resp.json()["detail"]["code"] == "ROUTING_FORBIDDEN"


@pytest.mark.asyncio
async def test_private_request_timeout_does_not_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    async def timeout_once(payload: dict, *, upstream: str):
        raise httpx.ReadTimeout("timeout")

    monkeypatch.setattr(upstream_core, "_post_chat_completions_once", timeout_once)

    decision = main.RoutingDecision(
        request_id="r1",
        request_id_source="upstream",
        endpoint="/v1/chat",
        mode="tutor",
        privacy_input="private",
        route_input="local",
        privacy_resolved="private",
        route_resolved="local",
        caller_trusted=False,
    )

    with pytest.raises(HTTPException) as exc_info:
        await main._post_chat_completions_with_routing({"messages": []}, decision)
    assert exc_info.value.status_code == 504


@pytest.mark.asyncio
async def test_public_trusted_prod_timeout_fallbacks_to_cloud(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []

    monkeypatch.setenv("APP_ENV", "prod")
    monkeypatch.setenv("LLM_BASE_URL_CLOUD", "https://cloud.example.com")
    monkeypatch.setenv("LLM_API_KEY_CLOUD", "cloud-key")

    async def fake_once(payload: dict, *, upstream: str):
        calls.append(upstream)
        if upstream == "local":
            raise httpx.ReadTimeout("timeout")
        request = httpx.Request("POST", "https://cloud.example.com/v1/chat/completions")
        return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]}, request=request), "cloud-model"

    monkeypatch.setattr(upstream_core, "_post_chat_completions_once", fake_once)

    decision = main.RoutingDecision(
        request_id="r2",
        request_id_source="upstream",
        endpoint="/v1/chat",
        mode="tutor",
        privacy_input="public",
        route_input="local",
        privacy_resolved="public",
        route_resolved="local",
        caller_trusted=True,
    )

    _, final_upstream, fallback_reason, model = await main._post_chat_completions_with_routing({"messages": []}, decision)
    assert calls == ["local", "cloud"]
    assert final_upstream == "cloud"
    assert fallback_reason == "local_timeout"
    assert model == "cloud-model"


@pytest.mark.asyncio
async def test_nonprod_default_disables_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "dev")
    monkeypatch.setenv("LLM_BASE_URL_CLOUD", "https://cloud.example.com")
    monkeypatch.setenv("LLM_API_KEY_CLOUD", "cloud-key")

    async def timeout_once(payload: dict, *, upstream: str):
        raise httpx.ReadTimeout("timeout")

    monkeypatch.setattr(upstream_core, "_post_chat_completions_once", timeout_once)

    decision = main.RoutingDecision(
        request_id="r3",
        request_id_source="upstream",
        endpoint="/v1/chat",
        mode="tutor",
        privacy_input="public",
        route_input="local",
        privacy_resolved="public",
        route_resolved="local",
        caller_trusted=True,
    )

    with pytest.raises(HTTPException) as exc_info:
        await main._post_chat_completions_with_routing({"messages": []}, decision)
    assert exc_info.value.status_code == 504


def test_hybrid_embedding_route_inherits_chat_route(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: list[str] = []

    monkeypatch.setenv("GRAPH_RAG_ENABLED", "true")
    monkeypatch.setenv("AI_GATEWAY_SHARED_TOKEN", "gw-token")

    class DummyIndex:
        pass

    async def fake_post(payload: dict, decision: main.RoutingDecision):
        return {"choices": [{"message": {"content": "ok"}}]}, "cloud", "", "cloud-model"

    async def fake_hybrid(*args, **kwargs):
        return "ctx"

    monkeypatch.setattr(upstream_core, "_post_chat_completions_with_routing", fake_post)
    monkeypatch.setattr(hybrid_service.graphrag_core, "_load_graphrag_index", lambda _path: DummyIndex())
    monkeypatch.setattr(hybrid_service, "build_rag_context_hybrid", fake_hybrid)
    monkeypatch.setattr(hybrid_service.graphrag_core, "_get_vector_store", lambda route="local": object())

    def fake_get_embedding(route="local"):
        captured.append(route)
        return object()

    monkeypatch.setattr(hybrid_service.graphrag_core, "_get_embedding", fake_get_embedding)

    with TestClient(main.app) as test_client:
        resp = test_client.post(
            "/v1/chat/hybrid",
            json={
                "mode": "tutor_rag",
                "messages": [{"role": "user", "content": "hello"}],
                "privacy": "public",
                "route": "cloud",
            },
            headers={"X-AI-Gateway-Token": "gw-token"},
        )

    assert resp.status_code == 200
    assert captured and captured[-1] == "cloud"


def test_multimodal_disabled_returns_503(client: TestClient) -> None:
    resp = client.post(
        "/v1/chat/multimodal",
        json={"messages": [{"role": "user", "content": "hello"}]},
    )
    assert resp.status_code == 503
    assert resp.json()["detail"]["code"] == "FEATURE_DISABLED"


def test_multimodal_text_routes_to_qwen3(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AI_MULTIMODAL_ENABLED", "true")
    captured: list[str] = []

    async def fake_post(payload: dict, decision: main.RoutingDecision, **kwargs):
        captured.append(kwargs.get("model_family", "qwen3"))
        return {"choices": [{"message": {"content": "ok"}}]}, "local", "", "text-model"

    monkeypatch.setattr(upstream_core, "_post_chat_completions_with_routing", fake_post)

    with TestClient(main.app) as test_client:
        resp = test_client.post(
            "/v1/chat/multimodal",
            json={"messages": [{"role": "user", "content": "just text"}]},
        )

    assert resp.status_code == 200
    assert captured and captured[-1] == "qwen3"


def test_multimodal_image_routes_to_qwen3_vl(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AI_MULTIMODAL_ENABLED", "true")
    captured: list[str] = []

    async def fake_post(payload: dict, decision: main.RoutingDecision, **kwargs):
        captured.append(kwargs.get("model_family", "qwen3"))
        return {"choices": [{"message": {"content": "ok"}}]}, "local", "", "vl-model"

    monkeypatch.setattr(upstream_core, "_post_chat_completions_with_routing", fake_post)

    with TestClient(main.app) as test_client:
        resp = test_client.post(
            "/v1/chat/multimodal",
            json={
                "messages": [
                    {
                        "role": "user",
                        "parts": [
                            {"type": "text", "text": "看图回答"},
                            {"type": "image_url", "url": "https://example.com/x.png"},
                        ],
                    }
                ]
            },
        )

    assert resp.status_code == 200
    assert captured and captured[-1] == "qwen3_vl"


def test_multimodal_invalid_model_family_returns_400(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AI_MULTIMODAL_ENABLED", "true")
    with TestClient(main.app) as test_client:
        resp = test_client.post(
            "/v1/chat/multimodal",
            json={
                "messages": [{"role": "user", "content": "hello"}],
                "model_family": "invalid",
            },
        )
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "INVALID_MODEL_FAMILY"


@pytest.mark.asyncio
async def test_multimodal_fallback_uses_same_family(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[str, str]] = []
    monkeypatch.setenv("APP_ENV", "prod")
    monkeypatch.setenv("LLM_BASE_URL_CLOUD_VL", "https://cloud.example.com")
    monkeypatch.setenv("LLM_API_KEY_CLOUD_VL", "cloud-vl-key")

    async def fake_once(payload: dict, *, upstream: str, model_family: str = "qwen3"):
        calls.append((upstream, model_family))
        if upstream == "local":
            raise httpx.ReadTimeout("timeout")
        request = httpx.Request("POST", "https://cloud.example.com/v1/chat/completions")
        return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]}, request=request), "cloud-vl-model"

    monkeypatch.setattr(upstream_core, "_post_chat_completions_once", fake_once)

    decision = main.RoutingDecision(
        request_id="r-vl",
        request_id_source="upstream",
        endpoint="/v1/chat/multimodal",
        mode="tutor",
        privacy_input="public",
        route_input="local",
        privacy_resolved="public",
        route_resolved="local",
        caller_trusted=True,
    )

    _, final_upstream, fallback_reason, model = await main._post_chat_completions_with_routing(
        {"messages": []},
        decision,
        model_family="qwen3_vl",
        model_family_requested="qwen3_vl",
        needs_vision=True,
    )
    assert calls == [("local", "qwen3_vl"), ("cloud", "qwen3_vl")]
    assert final_upstream == "cloud"
    assert fallback_reason == "local_timeout"
    assert model == "cloud-vl-model"


def test_audit_event_contains_required_fields(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level("INFO", logger="ai_service.audit")
    audit_core._audit_event(
        event="routing_decision",
        request_id="rid",
        request_id_source="generated",
        endpoint="/v1/chat",
        mode="tutor",
        privacy_input="private",
        route_input="local",
        privacy_resolved="private",
        route_resolved="local",
        caller_trusted=False,
        final_upstream="local",
        fallback_reason="",
        status_code=200,
        latency_ms=1,
    )
    payload = json.loads(caplog.records[-1].message)
    required = {
        "event",
        "request_id",
        "request_id_source",
        "endpoint",
        "mode",
        "privacy_input",
        "route_input",
        "privacy_resolved",
        "route_resolved",
        "caller_trusted",
        "final_upstream",
        "fallback_reason",
        "status_code",
        "latency_ms",
        "model_family_requested",
        "model_family_resolved",
        "needs_vision",
    }
    assert required.issubset(payload.keys())
