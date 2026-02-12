"""FastAPI app factory and compatibility exports for AI service."""

from __future__ import annotations

from dotenv import load_dotenv
from fastapi import FastAPI

from app.core.audit import _audit_event, _audit_request_complete
from app.core.routing import RoutingDecision, _build_routing_decision, _validate_routing_policy
from app.core.upstream import _post_chat_completions_once, _post_chat_completions_with_routing
from app.core.graphrag_runtime import _get_embedding, _get_vector_store, _load_graphrag_index
from app.graphrag.retrieve import build_rag_context_hybrid
from app.routers import chat, guided, tools, writing

load_dotenv()


def create_app() -> FastAPI:
    application = FastAPI(title="AI Service", version="0.2.0")

    @application.on_event("startup")
    def _validate_on_startup() -> None:
        _validate_routing_policy()

    application.include_router(chat.router)
    application.include_router(tools.router)
    application.include_router(guided.router)
    application.include_router(writing.router)
    return application


app = create_app()


# Compatibility re-exports for tests and migration period.
