from __future__ import annotations

import uuid
import json

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import main
from app.graphrag.index import GraphRAGIndex
from app.services.graphrag.retriever import CommunitySubgraph, RetrievalBundle
from app.services.router import IntentDecision, IntentLabel


@pytest.fixture(autouse=True)
def reset_env(monkeypatch: pytest.MonkeyPatch) -> None:
    main.invalidate_graphrag_cache()
    monkeypatch.setenv("LLM_ROUTING_POLICY", "local_first")
    monkeypatch.setenv("APP_ENV", "dev")
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
    main.invalidate_graphrag_cache()


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    async def fake_post(payload: dict, decision: main.RoutingDecision):
        return {"choices": [{"message": {"content": "ok"}}]}, "local", "", "local-model"

    monkeypatch.setattr(main, "_post_chat_completions_with_routing", fake_post)
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

    monkeypatch.setattr(main, "_post_chat_completions_once", timeout_once)

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

    monkeypatch.setattr(main, "_post_chat_completions_once", fake_once)

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

    monkeypatch.setattr(main, "_post_chat_completions_once", timeout_once)

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


class _SimpleIntentRouter:
    async def classify(self, ctx):
        return IntentDecision(
            label=IntentLabel.SIMPLE_CHAT,
            confidence=0.95,
            reason="simple",
            engine="edge-router",
            raw_output='{"intent":"SIMPLE_CHAT","confidence":0.95,"reason":"simple"}',
        )


class _ComplexIntentRouter:
    async def classify(self, ctx):
        return IntentDecision(
            label=IntentLabel.COMPLEX_REASONING,
            confidence=0.99,
            reason="complex",
            engine="edge-router",
            raw_output='{"intent":"COMPLEX_REASONING","confidence":0.99,"reason":"complex"}',
        )


class _FixedRetriever:
    def __init__(self, *, context: str = "## Retrieved Text Evidence\n[1] em.md#bridge\ncontent") -> None:
        self.context = context
        self.calls: list[dict] = []

    async def retrieve(self, **kwargs):
        self.calls.append(kwargs)
        return RetrievalBundle(
            query=str(kwargs.get("query", "")),
            sources=[],
            subgraph=CommunitySubgraph(community_ids=["community-1"], nodes=[], edges=[]),
            text_context_markdown="[1] em.md#bridge\ncontent",
            graph_context_markdown="## Community Subgraph",
            assembled_context=self.context,
        )


def _sample_course_index() -> GraphRAGIndex:
    return GraphRAGIndex.from_dict(
        {
            "nodes": [
                {"id": "doc:em", "title": "电磁场课件", "chunk_ids": ["c1", "c3"]},
                {"id": "doc:qm", "title": "量子力学课件", "chunk_ids": ["c2"]},
                {"id": "concept:bridge", "title": "高斯定律联系", "chunk_ids": ["c3"]},
            ],
            "chunks": [
                {
                    "id": "c1",
                    "text": "麦克斯韦方程组描述电场与磁场的基本关系。",
                    "source": "em_ch1.md",
                    "section": "麦克斯韦方程组",
                    "metadata": {"course_id": "em", "user_id": "student-1"},
                },
                {
                    "id": "c2",
                    "text": "量子态演化由薛定谔方程支配。",
                    "source": "qm_ch1.md",
                    "section": "量子态演化",
                    "metadata": {"course_id": "qm", "user_id": "student-2"},
                },
                {
                    "id": "c3",
                    "text": "利用散度定理可以把高斯定律从积分形式转为微分形式。",
                    "source": "em_ch2.md",
                    "section": "散度定理",
                    "metadata": {"course_id": "em", "user_id": "student-1"},
                },
            ],
            "edges": [
                {"source": "doc:em", "target": "concept:bridge", "relation": "contains"},
                {"source": "doc:qm", "target": "concept:bridge", "relation": "references"},
            ],
        }
    )


def test_chat_simple_intent_skips_structured_retriever(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GRAPH_RAG_ENABLED", "true")
    retriever = _FixedRetriever()
    seen_payloads: list[dict] = []

    async def fake_post(payload: dict, decision: main.RoutingDecision):
        seen_payloads.append(payload)
        return {"choices": [{"message": {"content": "ok"}}]}, "local", "", "local-model"

    monkeypatch.setattr(main, "_post_chat_completions_with_routing", fake_post)
    monkeypatch.setattr(main, "_get_intent_router", lambda: _SimpleIntentRouter())
    monkeypatch.setattr(main, "_get_graphrag_retriever", lambda: retriever)
    monkeypatch.setattr(main, "_load_graphrag_index", lambda _path: object())

    with TestClient(main.app) as test_client:
        resp = test_client.post(
            "/v1/chat",
            json={"mode": "tutor", "messages": [{"role": "user", "content": "hello"}]},
        )

    assert resp.status_code == 200
    assert retriever.calls == []
    assert seen_payloads and all("Knowledge Graph Community" not in json.dumps(payload, ensure_ascii=False) for payload in seen_payloads)


def test_chat_complex_intent_injects_structured_context(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GRAPH_RAG_ENABLED", "true")
    retriever = _FixedRetriever(context="## Retrieved Text Evidence\n[1] em.md#bridge\nbridge\n\n## Knowledge Graph Community\n## Community Subgraph")
    captured_payloads: list[dict] = []

    async def fake_post(payload: dict, decision: main.RoutingDecision):
        captured_payloads.append(payload)
        return {"choices": [{"message": {"content": "ok"}}]}, "local", "", "local-model"

    monkeypatch.setattr(main, "_post_chat_completions_with_routing", fake_post)
    monkeypatch.setattr(main, "_get_intent_router", lambda: _ComplexIntentRouter())
    monkeypatch.setattr(main, "_get_graphrag_retriever", lambda: retriever)
    monkeypatch.setattr(main, "_load_graphrag_index", lambda _path: object())
    monkeypatch.setattr(main, "_get_vector_store", lambda route="local": object())
    monkeypatch.setattr(main, "_get_embedding", lambda route="local": object())

    with TestClient(main.app) as test_client:
        resp = test_client.post(
            "/v1/chat",
            json={
                "mode": "tutor",
                "messages": [{"role": "user", "content": "散度定理和麦克斯韦方程组有什么联系？"}],
                "course_id": "em",
                "user_id": "student-1",
                "user_role": "student",
            },
        )

    assert resp.status_code == 200
    assert retriever.calls
    payload_messages = captured_payloads[-1]["messages"]
    assert any("Knowledge Graph Community" in message.get("content", "") for message in payload_messages if message.get("role") == "system")
    assert retriever.calls[-1]["course_id"] == "em"
    assert retriever.calls[-1]["user_id"] == "student-1"
    assert retriever.calls[-1]["user_role"] == "student"


def test_hybrid_embedding_route_inherits_chat_route(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: list[str] = []

    monkeypatch.setenv("GRAPH_RAG_ENABLED", "true")
    monkeypatch.setenv("AI_GATEWAY_SHARED_TOKEN", "gw-token")

    async def fake_post(payload: dict, decision: main.RoutingDecision):
        return {"choices": [{"message": {"content": "ok"}}]}, "cloud", "", "cloud-model"

    retriever = _FixedRetriever(context="## Retrieved Text Evidence\n[1] em.md#bridge\ncontent\n\n## Knowledge Graph Community\n## Community Subgraph")

    monkeypatch.setattr(main, "_post_chat_completions_with_routing", fake_post)
    monkeypatch.setattr(main, "_load_graphrag_index", lambda _path: object())
    monkeypatch.setattr(main, "_get_graphrag_retriever", lambda: retriever)
    monkeypatch.setattr(main, "_get_vector_store", lambda route="local": object())

    def fake_get_embedding(route="local"):
        captured.append(route)
        return object()

    monkeypatch.setattr(main, "_get_embedding", fake_get_embedding)

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
    assert retriever.calls


def test_hybrid_endpoint_skips_intent_router(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GRAPH_RAG_ENABLED", "true")
    monkeypatch.setenv("AI_GATEWAY_SHARED_TOKEN", "gw-token")
    retriever = _FixedRetriever(context="## Retrieved Text Evidence\n[1] em.md#bridge\ncontent\n\n## Knowledge Graph Community\n## Community Subgraph")

    async def fake_post(payload: dict, decision: main.RoutingDecision):
        return {"choices": [{"message": {"content": "ok"}}]}, "local", "", "local-model"

    def explode():
        raise AssertionError("intent router should not be used for /v1/chat/hybrid")

    monkeypatch.setattr(main, "_post_chat_completions_with_routing", fake_post)
    monkeypatch.setattr(main, "_get_intent_router", explode)
    monkeypatch.setattr(main, "_get_graphrag_retriever", lambda: retriever)
    monkeypatch.setattr(main, "_load_graphrag_index", lambda _path: object())
    monkeypatch.setattr(main, "_get_vector_store", lambda route="local": object())
    monkeypatch.setattr(main, "_get_embedding", lambda route="local": object())

    with TestClient(main.app) as test_client:
        resp = test_client.post(
            "/v1/chat/hybrid",
            json={
                "mode": "tutor",
                "messages": [{"role": "user", "content": "散度定理和麦克斯韦方程组有什么联系？"}],
                "privacy": "public",
                "route": "local",
            },
            headers={"X-AI-Gateway-Token": "gw-token"},
        )

    assert resp.status_code == 200
    assert retriever.calls


def test_chat_complex_intent_falls_back_to_keyword_context_when_structured_bundle_is_empty(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GRAPH_RAG_ENABLED", "true")
    retriever = _FixedRetriever(context="   ")
    captured_payloads: list[dict] = []

    async def fake_post(payload: dict, decision: main.RoutingDecision):
        captured_payloads.append(payload)
        return {"choices": [{"message": {"content": "ok"}}]}, "local", "", "local-model"

    monkeypatch.setattr(main, "_post_chat_completions_with_routing", fake_post)
    monkeypatch.setattr(main, "_get_intent_router", lambda: _ComplexIntentRouter())
    monkeypatch.setattr(main, "_get_graphrag_retriever", lambda: retriever)
    monkeypatch.setattr(main, "_load_graphrag_index", lambda _path: _sample_course_index())
    monkeypatch.setattr(main, "_get_vector_store", lambda route="local": object())
    monkeypatch.setattr(main, "_get_embedding", lambda route="local": object())
    monkeypatch.setattr(
        main,
        "build_rag_context",
        lambda index, query, **kwargs: "## Retrieved Text Evidence\n[1] em_fallback.md#bridge\nkeyword fallback context",
    )

    with TestClient(main.app) as test_client:
        resp = test_client.post(
            "/v1/chat",
            json={
                "mode": "tutor",
                "messages": [{"role": "user", "content": "散度定理和麦克斯韦方程组有什么联系？"}],
                "course_id": "em",
                "user_id": "student-1",
                "user_role": "student",
            },
        )

    assert resp.status_code == 200
    payload_messages = captured_payloads[-1]["messages"]
    system_messages = [message.get("content", "") for message in payload_messages if message.get("role") == "system"]
    assert any("keyword fallback context" in content for content in system_messages)
    assert all("Knowledge Graph Community" not in content for content in system_messages)


def test_chat_hybrid_falls_back_to_keyword_context_when_structured_retrieval_raises(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GRAPH_RAG_ENABLED", "true")
    monkeypatch.setenv("AI_GATEWAY_SHARED_TOKEN", "gw-token")
    captured_payloads: list[dict] = []

    async def fake_post(payload: dict, decision: main.RoutingDecision):
        captured_payloads.append(payload)
        return {"choices": [{"message": {"content": "ok"}}]}, "local", "", "local-model"

    async def exploding_structured_retrieval(**kwargs):
        raise RuntimeError("structured retrieval boom")

    monkeypatch.setattr(main, "_post_chat_completions_with_routing", fake_post)
    monkeypatch.setattr(main, "_load_graphrag_index", lambda _path: _sample_course_index())
    monkeypatch.setattr(main, "_retrieve_structured_graphrag_bundle", exploding_structured_retrieval)
    monkeypatch.setattr(
        main,
        "build_rag_context",
        lambda index, query, **kwargs: "## Retrieved Text Evidence\n[1] em_fallback.md#hybrid\nhybrid fallback context",
    )

    with TestClient(main.app) as test_client:
        resp = test_client.post(
            "/v1/chat/hybrid",
            json={
                "mode": "tutor_rag",
                "messages": [{"role": "user", "content": "hello"}],
                "privacy": "public",
                "route": "local",
                "course_id": "em",
                "user_id": "student-1",
                "user_role": "student",
            },
            headers={"X-AI-Gateway-Token": "gw-token"},
        )

    assert resp.status_code == 200
    payload_messages = captured_payloads[-1]["messages"]
    system_messages = [message.get("content", "") for message in payload_messages if message.get("role") == "system"]
    assert any("hybrid fallback context" in content for content in system_messages)
    assert all("Knowledge Graph Community" not in content for content in system_messages)


def test_keyword_fallback_scopes_index_to_course_id(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    def fake_build_rag_context(index: GraphRAGIndex, query: str, **kwargs) -> str:
        captured["query"] = query
        captured["chunk_ids"] = set(index.chunks.keys())
        captured["course_ids"] = {(chunk.metadata or {}).get("course_id") for chunk in index.chunks.values()}
        return "scoped fallback"

    monkeypatch.setattr(main, "build_rag_context", fake_build_rag_context)

    result = main._build_keyword_rag_fallback_context(
        _sample_course_index(),
        "麦克斯韦方程组",
        "em",
    )

    assert result == "scoped fallback"
    assert captured["query"] == "麦克斯韦方程组"
    assert captured["chunk_ids"] == {"c1", "c3"}
    assert captured["course_ids"] == {"em"}


def test_complex_request_falls_back_when_graphrag_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    captured_payloads: list[dict] = []

    async def fake_post(payload: dict, decision: main.RoutingDecision):
        captured_payloads.append(payload)
        return {"choices": [{"message": {"content": "ok"}}]}, "local", "", "local-model"

    monkeypatch.setattr(main, "_post_chat_completions_with_routing", fake_post)
    monkeypatch.setattr(main, "_get_intent_router", lambda: _ComplexIntentRouter())

    with TestClient(main.app) as test_client:
        resp = test_client.post(
            "/v1/chat",
            json={"mode": "tutor", "messages": [{"role": "user", "content": "散度定理和麦克斯韦方程组有什么联系？"}]},
        )

    assert resp.status_code == 200
    assert captured_payloads
    assert all("Knowledge Graph Community" not in json.dumps(payload, ensure_ascii=False) for payload in captured_payloads)


def test_streaming_complex_route_preserves_sse_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GRAPH_RAG_ENABLED", "true")
    retriever = _FixedRetriever(context="## Retrieved Text Evidence\n[1] em.md#bridge\ncontent\n\n## Knowledge Graph Community\n## Community Subgraph")

    class FakeStreamResponse:
        status_code = 200

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def aiter_lines(self):
            yield 'data: {"choices":[{"delta":{"content":"甲"}}]}'
            yield 'data: [DONE]'

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        def stream(self, method, url, json, headers):
            return FakeStreamResponse()

    monkeypatch.setattr(main, "_get_intent_router", lambda: _ComplexIntentRouter())
    monkeypatch.setattr(main, "_get_graphrag_retriever", lambda: retriever)
    monkeypatch.setattr(main, "_load_graphrag_index", lambda _path: object())
    monkeypatch.setattr(main, "_get_vector_store", lambda route="local": object())
    monkeypatch.setattr(main, "_get_embedding", lambda route="local": object())
    monkeypatch.setattr(main.httpx, "AsyncClient", FakeAsyncClient)
    monkeypatch.setattr(main, "_upstream_config", lambda upstream, model_family="qwen3": {"base_url": "https://local.example.com", "api_key": "key", "model": "local-model"})

    with TestClient(main.app) as test_client:
        resp = test_client.post(
            "/v1/chat",
            json={
                "mode": "tutor",
                "stream": True,
                "messages": [{"role": "user", "content": "散度定理和麦克斯韦方程组有什么联系？"}],
            },
        )

    assert resp.status_code == 200
    assert '"type": "start"' in resp.text
    assert '"content": "\\u7532"' in resp.text
    assert '"type": "done"' in resp.text



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

    monkeypatch.setattr(main, "_post_chat_completions_with_routing", fake_post)

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

    monkeypatch.setattr(main, "_post_chat_completions_with_routing", fake_post)

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

    monkeypatch.setattr(main, "_post_chat_completions_once", fake_once)

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
    main._audit_event(
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
