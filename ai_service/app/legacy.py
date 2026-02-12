"""Legacy adapter layer.

This module intentionally keeps a thin surface for compatibility while the
modular services become the default runtime path.
"""

from __future__ import annotations

from fastapi import Request, Response
from fastapi.responses import StreamingResponse

from app.core import contracts as core_contracts
from app.core.routing import RoutingDecision
from app import legacy_impl as _impl

# Contract aliases kept for compatibility during migration.
ChatMessage = core_contracts.ChatMessage
ChatRequest = core_contracts.ChatRequest
ChatResponse = core_contracts.ChatResponse
MultimodalPart = core_contracts.MultimodalPart
MultimodalChatMessage = core_contracts.MultimodalChatMessage
MultimodalChatRequest = core_contracts.MultimodalChatRequest
HybridChatRequest = core_contracts.HybridChatRequest
ChatWithToolsRequest = core_contracts.ChatWithToolsRequest
ChatWithToolsResponse = core_contracts.ChatWithToolsResponse
IndexDocumentRequest = core_contracts.IndexDocumentRequest
IndexDocumentResponse = core_contracts.IndexDocumentResponse
DeleteDocumentRequest = core_contracts.DeleteDocumentRequest
GuidedChatRequest = core_contracts.GuidedChatRequest
GuidedChatResponse = core_contracts.GuidedChatResponse
WritingAnalysisRequest = core_contracts.WritingAnalysisRequest
WritingAnalysisResponse = core_contracts.WritingAnalysisResponse
DimensionScore = core_contracts.DimensionScore
ToolCall = core_contracts.ToolCall


def healthz() -> dict[str, str]:
    return _impl.healthz()


def list_skills() -> dict:
    return _impl.list_skills()


async def chat(
    req: ChatRequest,
    request: Request,
    response: Response,
) -> ChatResponse | StreamingResponse:
    return await _impl.chat(req, request, response)


async def chat_multimodal(
    req: MultimodalChatRequest,
    request: Request,
    response: Response,
) -> ChatResponse | StreamingResponse:
    return await _impl.chat_multimodal(req, request, response)


async def chat_hybrid(
    req: HybridChatRequest,
    request: Request,
    response: Response,
) -> ChatResponse | StreamingResponse:
    return await _impl.chat_hybrid(req, request, response)


async def chat_with_tools(
    req: ChatWithToolsRequest,
    request: Request,
    response: Response,
) -> ChatWithToolsResponse:
    return await _impl.chat_with_tools(req, request, response)


async def add_to_index(req: IndexDocumentRequest) -> IndexDocumentResponse:
    return await _impl.add_to_index(req)


async def delete_from_index(req: DeleteDocumentRequest) -> IndexDocumentResponse:
    return await _impl.delete_from_index(req)


async def chat_guided(
    req: GuidedChatRequest,
    request: Request,
    response: Response,
) -> GuidedChatResponse:
    return await _impl.chat_guided(req, request, response)


async def analyze_writing(
    req: WritingAnalysisRequest,
    request: Request,
    response: Response,
) -> WritingAnalysisResponse:
    return await _impl.analyze_writing(req, request, response)


def __getattr__(name: str):
    # Compatibility passthrough for helpers/tests during migration.
    return getattr(_impl, name)
