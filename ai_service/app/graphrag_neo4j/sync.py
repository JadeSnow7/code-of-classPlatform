"""Backend export syncing for the Neo4j GraphRAG pipeline."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import httpx

from app.graphrag.embedding import EmbeddingProvider
from app.graphrag_neo4j.client import Neo4jGraphRAGClient
from app.graphrag_neo4j.schema import (
    build_source_specific_concepts,
    extract_formula_snippets,
    infer_source_label,
    match_catalog_nodes,
    node_relation_for_label,
    split_text_chunks,
)
from app.graphrag_neo4j.types import (
    GraphNodePayload,
    GraphRelationshipPayload,
    KnowledgeExportBatch,
    KnowledgeExportItem,
    MappedKnowledgeDocument,
    SyncResult,
)


class BackendKnowledgeExportClient:
    """Fetch canonical content from the Go backend."""

    def __init__(self, base_url: str | None = None, shared_token: str | None = None) -> None:
        self.base_url = (
            (base_url or os.getenv("BACKEND_INTERNAL_BASE_URL", "")).strip()
            or os.getenv("BACKEND_BASE_URL", "").strip()
            or "http://127.0.0.1:8080"
        ).rstrip("/")
        self.shared_token = (shared_token or os.getenv("AI_GATEWAY_SHARED_TOKEN", "")).strip()

    async def fetch_bootstrap(self, course_id: str | None = None) -> KnowledgeExportBatch:
        return await self._fetch_batch("/internal/knowledge-export/bootstrap", course_id=course_id)

    async def fetch_changes(self, cursor: str | None = None, course_id: str | None = None) -> KnowledgeExportBatch:
        params: dict[str, str] = {}
        if cursor:
            params["cursor"] = cursor
        if course_id:
            params["course_id"] = course_id
        return await self._fetch_batch("/internal/knowledge-export/changes", params=params)

    async def fetch_document(self, kind: str, numeric_id: str) -> KnowledgeExportItem:
        headers = self._headers()
        async with httpx.AsyncClient(timeout=60.0, trust_env=False) as client:
            resp = await client.get(
                f"{self.base_url}/internal/knowledge-export/document/{kind}/{numeric_id}",
                headers=headers,
            )
            resp.raise_for_status()
        payload = resp.json()
        return KnowledgeExportItem.model_validate(payload.get("data") or payload)

    async def _fetch_batch(
        self,
        path: str,
        *,
        course_id: str | None = None,
        params: dict[str, str] | None = None,
    ) -> KnowledgeExportBatch:
        query = dict(params or {})
        if course_id:
            query["course_id"] = course_id
        headers = self._headers()
        async with httpx.AsyncClient(timeout=90.0, trust_env=False) as client:
            resp = await client.get(f"{self.base_url}{path}", params=query, headers=headers)
            resp.raise_for_status()
        payload = resp.json()
        return KnowledgeExportBatch.model_validate(payload.get("data") or payload)

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.shared_token:
            headers["X-AI-Gateway-Token"] = self.shared_token
        return headers


class KnowledgeGraphMapper:
    """Map backend export items into graph nodes and relationships."""

    def __init__(self, embedding: EmbeddingProvider) -> None:
        self.embedding = embedding

    async def map_item(self, item: KnowledgeExportItem) -> MappedKnowledgeDocument:
        source_doc_id = item.id
        visibility = item.visibility or "student_public"
        source_label = infer_source_label(item.kind, item.title, item.content, item.metadata)
        source_text = "\n\n".join(filter(None, [item.title.strip(), item.content.strip()])).strip()

        nodes: list[GraphNodePayload] = []
        relationships: list[GraphRelationshipPayload] = []

        course_id = item.course_id or "global"
        course_node_id = f"course:{course_id}"
        nodes.append(
            GraphNodePayload(
                node_id=course_node_id,
                label="Course",
                properties={
                    "id": course_node_id,
                    "title": f"Course {course_id}",
                    "course_id": course_id,
                    "visibility": "student_public",
                    "source_type": "course",
                    "source_id": course_id,
                },
            )
        )

        source_props: dict[str, Any] = {
            "id": source_doc_id,
            "title": item.title,
            "text": item.content,
            "course_id": course_id,
            "visibility": visibility,
            "source_type": item.kind,
            "source_id": item.source_id or item.id,
            "source_doc_id": source_doc_id,
            "updated_at": str(item.updated_at),
        }
        if source_label in {"Problem", "WorkedExample"} and source_text:
            source_props["embedding"] = await self.embedding.embed_query(source_text)
        nodes.append(GraphNodePayload(node_id=source_doc_id, label=source_label, properties=source_props))
        relationships.append(GraphRelationshipPayload(source=course_node_id, target=source_doc_id, relation="CONTAINS"))

        chunks = split_text_chunks(source_text)
        if chunks:
            chunk_embeddings = await self.embedding.embed_texts(chunks)
            for idx, chunk_text in enumerate(chunks):
                chunk_id = f"{source_doc_id}:chunk:{idx}"
                nodes.append(
                    GraphNodePayload(
                        node_id=chunk_id,
                        label="TextChunk",
                        properties={
                            "id": chunk_id,
                            "title": f"{item.title} 片段 {idx + 1}",
                            "text": chunk_text,
                            "course_id": course_id,
                            "visibility": visibility,
                            "source_type": item.kind,
                            "source_id": item.source_id or item.id,
                            "source_doc_id": source_doc_id,
                            "embedding": chunk_embeddings[idx],
                        },
                    )
                )
                relationships.append(GraphRelationshipPayload(source=source_doc_id, target=chunk_id, relation="CONTAINS"))

        for concept_node in build_source_specific_concepts(source_doc_id, item.title, item.metadata, course_id, visibility):
            nodes.append(concept_node)
            relationships.append(
                GraphRelationshipPayload(source=source_doc_id, target=concept_node.node_id, relation="COVERS")
            )

        for formula in extract_formula_snippets(item.content):
            formula_id = f"{source_doc_id}:formula:{len([node for node in nodes if node.label == 'Formula'])}"
            nodes.append(
                GraphNodePayload(
                    node_id=formula_id,
                    label="Formula",
                    properties={
                        "id": formula_id,
                        "title": formula[:48],
                        "text": formula,
                        "latex": formula,
                        "keywords": formula,
                        "course_id": course_id,
                        "visibility": visibility,
                        "source_type": item.kind,
                        "source_id": item.source_id or item.id,
                        "source_doc_id": source_doc_id,
                        "embedding": await self.embedding.embed_query(formula),
                    },
                )
            )
            relationships.append(GraphRelationshipPayload(source=source_doc_id, target=formula_id, relation="USES"))

        catalog_ids = match_catalog_nodes(source_text)
        chunk_ids = [node.node_id for node in nodes if node.label == "TextChunk"]
        for catalog_id in catalog_ids:
            label = self._infer_catalog_label(catalog_id)
            relationships.append(
                GraphRelationshipPayload(
                    source=source_doc_id,
                    target=catalog_id,
                    relation=node_relation_for_label(label),
                )
            )
            if label in {"Concept", "Law"}:
                relationships.append(
                    GraphRelationshipPayload(
                        source=source_doc_id,
                        target=catalog_id,
                        relation="EXPLAINS",
                    )
                )
            for chunk_id in chunk_ids[:3]:
                relationships.append(
                    GraphRelationshipPayload(
                        source=catalog_id,
                        target=chunk_id,
                        relation="SUPPORTED_BY",
                    )
                )

        return MappedKnowledgeDocument(source_doc_id=source_doc_id, nodes=nodes, relationships=relationships)

    def _infer_catalog_label(self, node_id: str) -> str:
        if node_id.startswith("law:"):
            return "Law"
        if node_id.startswith("formula:"):
            return "Formula"
        if node_id.startswith("condition:"):
            return "Condition"
        if node_id.startswith("boundary:"):
            return "BoundaryCondition"
        if node_id.startswith("symmetry:"):
            return "Symmetry"
        return "Concept"


class KnowledgeSyncService:
    """Pull backend knowledge exports and sync them into Neo4j."""

    def __init__(
        self,
        *,
        backend_client: BackendKnowledgeExportClient,
        graph_client: Neo4jGraphRAGClient,
        embedding: EmbeddingProvider,
        cursor_path: str | None = None,
    ) -> None:
        self.backend_client = backend_client
        self.graph_client = graph_client
        self.embedding = embedding
        self.mapper = KnowledgeGraphMapper(embedding)
        self.cursor_path = Path(
            (cursor_path or os.getenv("GRAPH_RAG_NEO4J_CURSOR_PATH", "")).strip()
            or "app/data/graphrag_neo4j_cursor.json"
        )

    async def bootstrap(self, course_id: str | None = None) -> SyncResult:
        batch = await self.backend_client.fetch_bootstrap(course_id=course_id)
        return await self._sync_batch(batch, persist_cursor=True)

    async def pull(self, course_id: str | None = None) -> SyncResult:
        batch = await self.backend_client.fetch_changes(cursor=self._read_cursor(), course_id=course_id)
        return await self._sync_batch(batch, persist_cursor=True)

    async def rebuild_document(self, kind: str, numeric_id: str) -> SyncResult:
        item = await self.backend_client.fetch_document(kind, numeric_id)
        await self.graph_client.ensure_schema(self.embedding.dimension)
        await self.graph_client.seed_domain_catalog()
        if item.deleted:
            await self.graph_client.delete_source_document(item.id)
            return SyncResult(status="ok", fetched=1, upserted=0, deleted=1, details=[item.id])
        mapped = await self.mapper.map_item(item)
        await self.graph_client.upsert_source_document(mapped)
        return SyncResult(status="ok", fetched=1, upserted=1, deleted=0, details=[item.id])

    async def _sync_batch(self, batch: KnowledgeExportBatch, *, persist_cursor: bool) -> SyncResult:
        await self.graph_client.ensure_schema(self.embedding.dimension)
        await self.graph_client.seed_domain_catalog()

        upserted = 0
        deleted = 0
        details: list[str] = []
        for item in batch.items:
            if item.deleted:
                await self.graph_client.delete_source_document(item.id)
                deleted += 1
                details.append(f"deleted:{item.id}")
                continue
            mapped = await self.mapper.map_item(item)
            await self.graph_client.upsert_source_document(mapped)
            upserted += 1
            details.append(f"upserted:{item.id}")

        if persist_cursor and batch.cursor:
            self._write_cursor(batch.cursor)

        return SyncResult(
            status="ok",
            cursor=batch.cursor,
            fetched=len(batch.items),
            upserted=upserted,
            deleted=deleted,
            details=details,
        )

    def _read_cursor(self) -> str:
        if not self.cursor_path.exists():
            return ""
        try:
            payload = json.loads(self.cursor_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return ""
        return str(payload.get("cursor", "")).strip()

    def _write_cursor(self, cursor: str) -> None:
        self.cursor_path.parent.mkdir(parents=True, exist_ok=True)
        self.cursor_path.write_text(json.dumps({"cursor": cursor}, ensure_ascii=False, indent=2), encoding="utf-8")
