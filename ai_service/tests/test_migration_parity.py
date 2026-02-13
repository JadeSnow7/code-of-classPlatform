from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app import legacy, legacy_impl, main
from app.core.contracts import (
    ChatResponse,
    ChatWithToolsResponse,
    GuidedChatResponse,
    IndexDocumentResponse,
    WritingAnalysisResponse,
)
from app.core.migration import (
    handler_impl,
    legacy_fallback_enabled,
    legacy_fallback_endpoints,
    should_fallback,
    use_modular_handlers,
)
from app.services import chat_service, guided_service, hybrid_service, tools_service, writing_service


def _enable_fallback(monkeypatch: pytest.MonkeyPatch, endpoints: str) -> None:
    monkeypatch.setenv("AI_SERVICE_HANDLER_IMPL", "modular")
    monkeypatch.setenv("AI_SERVICE_LEGACY_FALLBACK", "true")
    monkeypatch.setenv("AI_SERVICE_LEGACY_FALLBACK_ENDPOINTS", endpoints)


def test_migration_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("AI_SERVICE_HANDLER_IMPL", raising=False)
    monkeypatch.delenv("AI_SERVICE_LEGACY_FALLBACK", raising=False)
    monkeypatch.delenv("AI_SERVICE_LEGACY_FALLBACK_ENDPOINTS", raising=False)

    assert handler_impl() == "modular"
    assert use_modular_handlers() is True
    assert legacy_fallback_enabled() is True
    assert "chat" in legacy_fallback_endpoints()
    assert should_fallback("chat") is True


def test_endpoint_filter_respected(monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_fallback(monkeypatch, "chat,hybrid")

    assert should_fallback("chat") is True
    assert should_fallback("hybrid") is True
    assert should_fallback("writing") is False


def test_chat_router_falls_back_to_legacy(monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_fallback(monkeypatch, "chat")

    async def crash_modular(*_args, **_kwargs):
        raise RuntimeError("modular crash")

    async def legacy_ok(*_args, **_kwargs):
        return ChatResponse(reply="legacy-ok", model="legacy-model")

    monkeypatch.setattr(chat_service, "chat", crash_modular)
    monkeypatch.setattr(legacy, "chat", legacy_ok)

    with TestClient(main.app) as client:
        resp = client.post("/v1/chat", json={"messages": [{"role": "user", "content": "hello"}]})

    assert resp.status_code == 200
    assert resp.json()["reply"] == "legacy-ok"


def test_chat_router_returns_500_when_fallback_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AI_SERVICE_HANDLER_IMPL", "modular")
    monkeypatch.setenv("AI_SERVICE_LEGACY_FALLBACK", "false")

    async def crash_modular(*_args, **_kwargs):
        raise RuntimeError("modular crash")

    monkeypatch.setattr(chat_service, "chat", crash_modular)

    with TestClient(main.app, raise_server_exceptions=False) as client:
        resp = client.post("/v1/chat", json={"messages": [{"role": "user", "content": "hello"}]})

    assert resp.status_code == 500


def test_chat_router_fallback_uses_bound_legacy_impl(monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_fallback(monkeypatch, "chat")

    async def crash_modular(*_args, **_kwargs):
        raise RuntimeError("modular crash")

    async def fake_post(payload: dict, decision, **_kwargs):
        return {"choices": [{"message": {"content": "legacy-bound-ok"}}]}, "local", "", "legacy-model"

    monkeypatch.setattr(chat_service, "chat", crash_modular)
    monkeypatch.setattr(legacy_impl, "_post_chat_completions_with_routing", fake_post)

    with TestClient(main.app) as client:
        resp = client.post("/v1/chat", json={"messages": [{"role": "user", "content": "hello"}]})

    assert resp.status_code == 200
    assert resp.json()["reply"] == "legacy-bound-ok"


def test_multimodal_router_falls_back_to_legacy(monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_fallback(monkeypatch, "multimodal")

    async def crash_modular(*_args, **_kwargs):
        raise RuntimeError("multimodal crash")

    async def legacy_ok(*_args, **_kwargs):
        return ChatResponse(reply="legacy-mm", model="legacy-mm-model")

    monkeypatch.setattr(chat_service, "chat_multimodal", crash_modular)
    monkeypatch.setattr(legacy, "chat_multimodal", legacy_ok)

    with TestClient(main.app) as client:
        resp = client.post(
            "/v1/chat/multimodal",
            json={"messages": [{"role": "user", "content": "hello"}]},
        )

    assert resp.status_code == 200
    assert resp.json()["reply"] == "legacy-mm"


def test_hybrid_router_falls_back_to_legacy(monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_fallback(monkeypatch, "hybrid")
    captured: dict[str, str | None] = {}

    async def crash_modular(*_args, **_kwargs):
        raise RuntimeError("hybrid crash")

    async def legacy_ok(_req, request, _response):
        captured["course_id"] = request.headers.get("X-Course-Id")
        captured["user_role"] = request.headers.get("X-User-Role")
        return ChatResponse(reply="legacy-hybrid", model="legacy-hybrid-model")

    monkeypatch.setattr(hybrid_service, "chat_hybrid", crash_modular)
    monkeypatch.setattr(legacy, "chat_hybrid", legacy_ok)

    with TestClient(main.app) as client:
        resp = client.post(
            "/v1/chat/hybrid",
            json={"messages": [{"role": "user", "content": "hello"}]},
            headers={"X-Course-Id": "C001", "X-User-Role": "student"},
        )

    assert resp.status_code == 200
    assert resp.json()["reply"] == "legacy-hybrid"
    assert captured["course_id"] == "C001"
    assert captured["user_role"] == "student"


def test_hybrid_router_fallback_uses_legacy_impl(monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_fallback(monkeypatch, "hybrid")

    async def crash_modular(*_args, **_kwargs):
        raise RuntimeError("hybrid crash")

    async def fake_post(payload: dict, decision, **_kwargs):
        return {"choices": [{"message": {"content": "legacy-hybrid-safe"}}]}, "local", "", "legacy-model"

    monkeypatch.setattr(hybrid_service, "chat_hybrid", crash_modular)
    monkeypatch.setattr(legacy_impl, "_post_chat_completions_with_routing", fake_post)

    with TestClient(main.app) as client:
        resp = client.post(
            "/v1/chat/hybrid",
            json={"messages": [{"role": "user", "content": "hello"}]},
            headers={"X-Course-Id": "C001", "X-User-Role": "student"},
        )

    assert resp.status_code == 200
    assert resp.json()["reply"] == "legacy-hybrid-safe"


def test_tools_router_falls_back_to_legacy(monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_fallback(monkeypatch, "tools")

    async def crash_modular(*_args, **_kwargs):
        raise RuntimeError("tools crash")

    async def legacy_ok(*_args, **_kwargs):
        return ChatWithToolsResponse(
            reply="legacy-tools",
            model="legacy-tools-model",
            tool_calls=[],
            tool_results=[],
        )

    monkeypatch.setattr(tools_service, "chat_with_tools", crash_modular)
    monkeypatch.setattr(legacy, "chat_with_tools", legacy_ok)

    with TestClient(main.app) as client:
        resp = client.post(
            "/v1/chat_with_tools",
            json={
                "messages": [{"role": "user", "content": "请帮我算一下"}],
                "enable_tools": True,
                "max_tool_calls": 3,
            },
        )

    assert resp.status_code == 200
    assert resp.json()["reply"] == "legacy-tools"


def test_guided_router_falls_back_to_legacy(monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_fallback(monkeypatch, "guided")

    async def crash_modular(*_args, **_kwargs):
        raise RuntimeError("guided crash")

    async def legacy_ok(*_args, **_kwargs):
        return GuidedChatResponse(
            reply="legacy-guided",
            session_id="s1",
            current_step=1,
            total_steps=3,
            progress_percentage=33.3,
            weak_points=[],
            citations=[],
            tool_results=[],
            model="legacy-model",
            learning_path=[],
        )

    monkeypatch.setattr(guided_service, "chat_guided", crash_modular)
    monkeypatch.setattr(legacy, "chat_guided", legacy_ok)

    with TestClient(main.app) as client:
        resp = client.post(
            "/v1/chat/guided",
            json={
                "messages": [{"role": "user", "content": "hello"}],
                "user_id": "u1",
            },
        )

    assert resp.status_code == 200
    assert resp.json()["reply"] == "legacy-guided"


def test_writing_router_falls_back_to_legacy(monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_fallback(monkeypatch, "writing")

    async def crash_modular(*_args, **_kwargs):
        raise RuntimeError("writing crash")

    async def legacy_ok(*_args, **_kwargs):
        return WritingAnalysisResponse(
            overall_score=8.0,
            dimensions=[],
            strengths=["s"],
            improvements=["i"],
            summary="ok",
            raw_feedback="ok",
            word_count=100,
            writing_type="course_paper",
            model="legacy-model",
        )

    monkeypatch.setattr(writing_service, "analyze_writing", crash_modular)
    monkeypatch.setattr(legacy, "analyze_writing", legacy_ok)

    with TestClient(main.app) as client:
        resp = client.post(
            "/v1/writing/analyze",
            json={
                "content": "A" * 100,
                "writing_type": "course_paper",
            },
        )

    assert resp.status_code == 200
    assert resp.json()["model"] == "legacy-model"


def test_writing_router_fallback_uses_legacy_impl(monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_fallback(monkeypatch, "writing")

    async def crash_modular(*_args, **_kwargs):
        raise RuntimeError("writing crash")

    async def fake_post(payload: dict, decision, **_kwargs):
        return {
            "choices": [
                {
                    "message": {
                        "content": "总体评分：8.5/10\n优点：\n- 结构清晰\n改进建议：\n- 强化论证链条"
                    }
                }
            ]
        }, "local", "", "legacy-writing-model"

    monkeypatch.setattr(writing_service, "analyze_writing", crash_modular)
    monkeypatch.setattr(legacy_impl, "_post_chat_completions_with_routing", fake_post)

    with TestClient(main.app) as client:
        resp = client.post(
            "/v1/writing/analyze",
            json={
                "content": "A" * 100,
                "writing_type": "course_paper",
            },
        )

    assert resp.status_code == 200
    assert resp.json()["model"] == "legacy-writing-model"
    assert resp.json()["overall_score"] == pytest.approx(8.5)


def test_index_router_falls_back_to_legacy(monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_fallback(monkeypatch, "index")

    async def crash_add(*_args, **_kwargs):
        raise RuntimeError("index add crash")

    async def crash_delete(*_args, **_kwargs):
        raise RuntimeError("index delete crash")

    async def legacy_add(*_args, **_kwargs):
        return IndexDocumentResponse(success=True, chunks_affected=2, message="legacy-add")

    async def legacy_delete(*_args, **_kwargs):
        return IndexDocumentResponse(success=True, chunks_affected=1, message="legacy-delete")

    monkeypatch.setattr(tools_service, "add_to_index", crash_add)
    monkeypatch.setattr(tools_service, "delete_from_index", crash_delete)
    monkeypatch.setattr(legacy, "add_to_index", legacy_add)
    monkeypatch.setattr(legacy, "delete_from_index", legacy_delete)

    with TestClient(main.app) as client:
        resp_add = client.post(
            "/v1/graphrag/index",
            json={
                "doc_id": "d1",
                "content": "hello world",
                "source": "assignment:1",
            },
        )
        resp_delete = client.request("DELETE", "/v1/graphrag/index", json={"doc_id": "d1"})

    assert resp_add.status_code == 200
    assert resp_add.json()["message"] == "legacy-add"
    assert resp_delete.status_code == 200
    assert resp_delete.json()["message"] == "legacy-delete"


@pytest.mark.parametrize(
    ("module", "fn_name", "method", "path", "payload"),
    [
        (chat_service, "chat", "post", "/v1/chat", {"messages": [{"role": "user", "content": "hello"}]}),
        (
            chat_service,
            "chat_multimodal",
            "post",
            "/v1/chat/multimodal",
            {"messages": [{"role": "user", "content": "hello"}]},
        ),
        (hybrid_service, "chat_hybrid", "post", "/v1/chat/hybrid", {"messages": [{"role": "user", "content": "hello"}]}),
        (
            tools_service,
            "chat_with_tools",
            "post",
            "/v1/chat_with_tools",
            {"messages": [{"role": "user", "content": "hello"}], "enable_tools": True, "max_tool_calls": 1},
        ),
        (
            guided_service,
            "chat_guided",
            "post",
            "/v1/chat/guided",
            {"messages": [{"role": "user", "content": "hello"}], "user_id": "u1"},
        ),
        (
            writing_service,
            "analyze_writing",
            "post",
            "/v1/writing/analyze",
            {"content": "A" * 100, "writing_type": "course_paper"},
        ),
        (
            tools_service,
            "add_to_index",
            "post",
            "/v1/graphrag/index",
            {"doc_id": "d1", "content": "hello", "source": "assignment:1"},
        ),
        (
            tools_service,
            "delete_from_index",
            "delete",
            "/v1/graphrag/index",
            {"doc_id": "d1"},
        ),
    ],
)
def test_fallback_disabled_returns_error(
    monkeypatch: pytest.MonkeyPatch,
    module,
    fn_name: str,
    method: str,
    path: str,
    payload: dict,
) -> None:
    monkeypatch.setenv("AI_SERVICE_HANDLER_IMPL", "modular")
    monkeypatch.setenv("AI_SERVICE_LEGACY_FALLBACK", "false")

    async def crash_modular(*_args, **_kwargs):
        raise RuntimeError("modular crash")

    monkeypatch.setattr(module, fn_name, crash_modular)

    with TestClient(main.app, raise_server_exceptions=False) as client:
        if method == "delete":
            resp = client.request("DELETE", path, json=payload)
        else:
            call = getattr(client, method)
            resp = call(path, json=payload)

    assert resp.status_code == 500


def test_endpoint_granularity_filter_runtime(monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_fallback(monkeypatch, "guided,index")

    async def crash_chat(*_args, **_kwargs):
        raise RuntimeError("chat crash")

    async def crash_guided(*_args, **_kwargs):
        raise RuntimeError("guided crash")

    async def legacy_guided(*_args, **_kwargs):
        return GuidedChatResponse(
            reply="legacy-guided",
            session_id="s2",
            current_step=1,
            total_steps=2,
            progress_percentage=50.0,
            weak_points=[],
            citations=[],
            tool_results=[],
            model="legacy-model",
            learning_path=[],
        )

    monkeypatch.setattr(chat_service, "chat", crash_chat)
    monkeypatch.setattr(guided_service, "chat_guided", crash_guided)
    monkeypatch.setattr(legacy, "chat_guided", legacy_guided)

    with TestClient(main.app, raise_server_exceptions=False) as client:
        chat_resp = client.post("/v1/chat", json={"messages": [{"role": "user", "content": "hello"}]})
        guided_resp = client.post(
            "/v1/chat/guided",
            json={"messages": [{"role": "user", "content": "hello"}], "user_id": "u1"},
        )

    assert chat_resp.status_code == 500
    assert guided_resp.status_code == 200
    assert guided_resp.json()["reply"] == "legacy-guided"


def test_fallback_audit_event_fields(monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture) -> None:
    _enable_fallback(monkeypatch, "tools")
    caplog.set_level("INFO", logger="ai_service.audit")

    async def crash_modular(*_args, **_kwargs):
        raise RuntimeError("tools crash")

    async def legacy_ok(*_args, **_kwargs):
        return ChatWithToolsResponse(
            reply="legacy-tools",
            model="legacy-tools-model",
            tool_calls=[],
            tool_results=[],
        )

    monkeypatch.setattr(tools_service, "chat_with_tools", crash_modular)
    monkeypatch.setattr(legacy, "chat_with_tools", legacy_ok)

    with TestClient(main.app) as client:
        resp = client.post(
            "/v1/chat_with_tools",
            headers={"X-Request-ID": "req-fallback-1"},
            json={
                "messages": [{"role": "user", "content": "hello"}],
                "enable_tools": True,
                "max_tool_calls": 1,
            },
        )

    assert resp.status_code == 200

    records = [json.loads(record.message) for record in caplog.records if record.name == "ai_service.audit"]
    fallback_events = [r for r in records if r.get("event") == "legacy_fallback"]
    assert fallback_events, "expected at least one legacy_fallback audit event"
    event = fallback_events[-1]
    assert event["request_id"] == "req-fallback-1"
    assert event["endpoint"] == "/v1/chat_with_tools"
    assert event["fallback_reason"].startswith("tools:")
