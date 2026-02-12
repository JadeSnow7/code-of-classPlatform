"""Shared request/response contracts for routers and services."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.core.routing import PrivacyLevel, RouteLevel


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"] = "user"
    content: str = Field(min_length=0, max_length=8000)


class ChatRequest(BaseModel):
    mode: str | None = None
    messages: list[ChatMessage] = Field(min_length=1)
    stream: bool = False
    privacy: PrivacyLevel | None = None
    route: RouteLevel | None = None


class ChatResponse(BaseModel):
    reply: str
    model: str | None = None


class MultimodalPart(BaseModel):
    type: Literal["text", "image_url", "video_url"]
    text: str | None = Field(default=None, max_length=8000)
    url: str | None = None


class MultimodalChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"] = "user"
    content: str | None = Field(default=None, max_length=8000)
    parts: list[MultimodalPart] | None = None


class MultimodalChatRequest(BaseModel):
    mode: str | None = None
    messages: list[MultimodalChatMessage] = Field(min_length=1)
    stream: bool = False
    privacy: PrivacyLevel | None = None
    route: RouteLevel | None = None
    model_family: str | None = None


class ChatWithToolsRequest(BaseModel):
    mode: str | None = None
    messages: list[ChatMessage] = Field(min_length=1)
    enable_tools: bool = True
    max_tool_calls: int = Field(default=3, ge=0, le=10)
    context: dict | None = None
    privacy: PrivacyLevel | None = None
    route: RouteLevel | None = None


class ToolCall(BaseModel):
    name: str
    arguments: dict


class ChatWithToolsResponse(BaseModel):
    reply: str
    model: str | None = None
    tool_calls: list[ToolCall] = []
    tool_results: list[dict] = []


class IndexDocumentRequest(BaseModel):
    doc_id: str = Field(..., description="Unique document ID")
    content: str = Field(..., description="Document content")
    source: str = Field(..., description="Source identifier, e.g., 'assignment:123'")
    course_id: str | None = Field(None, description="Course ID for ACL filtering")
    user_id: str | None = Field(None, description="User ID for ACL filtering")
    doc_type: str = Field("markdown", description="Document type: markdown, assignment, faq")


class IndexDocumentResponse(BaseModel):
    success: bool
    chunks_affected: int
    message: str


class DeleteDocumentRequest(BaseModel):
    doc_id: str = Field(..., description="Document ID to delete")


class HybridChatRequest(BaseModel):
    mode: str | None = None
    messages: list[ChatMessage] = Field(min_length=1)
    stream: bool = False
    privacy: PrivacyLevel | None = None
    route: RouteLevel | None = None
    course_id: str | None = None
    user_id: str | None = None
    user_role: str | None = None


class GuidedChatRequest(BaseModel):
    mode: str = "guided"
    session_id: str | None = None
    topic: str | None = None
    messages: list[ChatMessage] = Field(min_length=1)
    user_id: str = ""
    course_id: str | None = None
    privacy: PrivacyLevel | None = None
    route: RouteLevel | None = None


class GuidedChatResponse(BaseModel):
    reply: str
    session_id: str
    current_step: int
    total_steps: int
    progress_percentage: float
    weak_points: list[str] = []
    citations: list[dict] = []
    tool_results: list[dict] = []
    model: str | None = None
    learning_path: list[dict] = []


class WritingAnalysisRequest(BaseModel):
    content: str = Field(..., min_length=50, description="Writing content to analyze")
    writing_type: str = Field(
        "course_paper",
        description="Type: literature_review, course_paper, thesis, abstract",
    )
    title: str | None = Field(None, description="Optional title")
    student_profile: dict | None = Field(None, description="Optional student profile for personalization")
    privacy: PrivacyLevel | None = None
    route: RouteLevel | None = None


class DimensionScore(BaseModel):
    name: str
    score: float = Field(..., ge=0, le=10)
    weight: float = Field(..., ge=0, le=1)
    comment: str


class WritingAnalysisResponse(BaseModel):
    overall_score: float = Field(..., ge=0, le=10)
    dimensions: list[DimensionScore]
    strengths: list[str]
    improvements: list[str]
    summary: str
    raw_feedback: str
    word_count: int
    writing_type: str
    model: str | None = None
