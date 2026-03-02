from __future__ import annotations

import pytest

from app.graphrag_neo4j import BackendKnowledgeExportClient


@pytest.fixture(autouse=True)
def reset_sync_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("BACKEND_INTERNAL_BASE_URL", raising=False)
    monkeypatch.delenv("BACKEND_BASE_URL", raising=False)
    monkeypatch.delenv("AI_GATEWAY_SHARED_TOKEN", raising=False)


def test_backend_export_client_prefers_internal_base_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BACKEND_INTERNAL_BASE_URL", "http://backend:8080")
    monkeypatch.setenv("BACKEND_BASE_URL", "http://127.0.0.1:8080")

    client = BackendKnowledgeExportClient()

    assert client.base_url == "http://backend:8080"


def test_backend_export_client_falls_back_without_internal_base_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BACKEND_BASE_URL", "http://backend.example:8080/")

    client = BackendKnowledgeExportClient()

    assert client.base_url == "http://backend.example:8080"


def test_backend_export_client_includes_shared_token_header(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AI_GATEWAY_SHARED_TOKEN", "gw-token")

    client = BackendKnowledgeExportClient()

    assert client._headers()["X-AI-Gateway-Token"] == "gw-token"
