"""Typed models for the Neo4j-backed derivation GraphRAG pipeline."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class KnowledgeExportItem(BaseModel):
    kind: str
    id: str
    source_id: str | None = None
    course_id: str
    visibility: str = "student_public"
    title: str
    content: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)
    updated_at: datetime | str
    deleted: bool = False


class KnowledgeExportBatch(BaseModel):
    cursor: str = ""
    items: list[KnowledgeExportItem] = Field(default_factory=list)


class GraphNodePayload(BaseModel):
    node_id: str
    label: str
    properties: dict[str, Any] = Field(default_factory=dict)


class GraphRelationshipPayload(BaseModel):
    source: str
    target: str
    relation: str
    properties: dict[str, Any] = Field(default_factory=dict)


class MappedKnowledgeDocument(BaseModel):
    source_doc_id: str
    nodes: list[GraphNodePayload] = Field(default_factory=list)
    relationships: list[GraphRelationshipPayload] = Field(default_factory=list)


class ProblemFrame(BaseModel):
    task_type: str = "derivation"
    target_quantity: str = ""
    givens: list[str] = Field(default_factory=list)
    unknowns: list[str] = Field(default_factory=list)
    geometry: str | None = None
    material_model: str | None = None
    boundary_conditions: list[str] = Field(default_factory=list)
    symmetry_hints: list[str] = Field(default_factory=list)
    requires_full_derivation: bool = True
    course_id: str | None = None
    missing_constraints: list[str] = Field(default_factory=list)


class AnchorHit(BaseModel):
    node_id: str
    label: str
    score: float
    title: str = ""
    text: str = ""
    latex: str | None = None
    source_type: str | None = None
    source_id: str | None = None
    course_id: str | None = None
    visibility: str | None = None


class ReasoningNode(BaseModel):
    node_id: str
    labels: list[str] = Field(default_factory=list)
    title: str = ""
    text: str = ""
    latex: str | None = None
    score: float = 0.0
    source_type: str | None = None
    source_id: str | None = None
    course_id: str | None = None
    visibility: str | None = None


class ReasoningEdge(BaseModel):
    source: str
    target: str
    relation: str


class ReasoningSubgraph(BaseModel):
    anchor_ids: list[str] = Field(default_factory=list)
    nodes: list[ReasoningNode] = Field(default_factory=list)
    edges: list[ReasoningEdge] = Field(default_factory=list)


class DerivationPlanStep(BaseModel):
    step_id: str
    goal: str
    method: str
    used_node_ids: list[str] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)
    required_symbolic_check: bool = False
    required_physics_check: bool = True
    alternatives: list[str] = Field(default_factory=list)


class DerivationPlan(BaseModel):
    primary_method: str = ""
    steps: list[DerivationPlanStep] = Field(default_factory=list)
    alternatives: list[str] = Field(default_factory=list)


class StepCitation(BaseModel):
    id: str | None = None
    node_id: str
    source_type: str | None = None
    source_id: str | None = None
    title: str | None = None


class VerificationResult(BaseModel):
    symbolic: str = "not_applicable"
    physics: str = "not_applicable"
    details: list[str] = Field(default_factory=list)


class DerivationStepResult(BaseModel):
    step_id: str
    title: str
    explanation: str
    equations: list[str] = Field(default_factory=list)
    citations: list[StepCitation] = Field(default_factory=list)
    verification_targets: list[str] = Field(default_factory=list)
    verification: VerificationResult = Field(default_factory=VerificationResult)


class RetrievalDebug(BaseModel):
    anchor_ids: list[str] = Field(default_factory=list)
    subgraph_node_count: int = 0


class DeriveGraphRAGRequest(BaseModel):
    problem_text: str = Field(min_length=1)
    course_id: str | None = None
    user_id: str | None = None
    user_role: str | None = None
    mode: str = "formula_derive"
    response_style: str = "full_derivation"
    verification_mode: str = "symbolic_and_physics"
    privacy: str | None = None
    route: str | None = None


class DerivationResponse(BaseModel):
    status: str
    trace_id: str
    problem_frame: ProblemFrame
    steps: list[DerivationStepResult] = Field(default_factory=list)
    final_answer: str
    checks: dict[str, str] = Field(default_factory=dict)
    citations: list[StepCitation] = Field(default_factory=list)
    retrieval_debug: RetrievalDebug = Field(default_factory=RetrievalDebug)


class SyncResult(BaseModel):
    status: str = "ok"
    cursor: str | None = None
    fetched: int = 0
    upserted: int = 0
    deleted: int = 0
    details: list[str] = Field(default_factory=list)
