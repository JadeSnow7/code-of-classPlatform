"""Neo4j client wrapper for the derivation GraphRAG pipeline."""

from __future__ import annotations

import asyncio
import os
from typing import Any

try:
    from neo4j import GraphDatabase
except ImportError:  # pragma: no cover - handled at runtime
    GraphDatabase = None  # type: ignore[assignment]

from app.graphrag_neo4j.schema import (
    ALLOWED_RELATIONSHIPS,
    DOMAIN_NODES,
    DOMAIN_RELATIONSHIPS,
    FULLTEXT_INDEXES,
    VECTOR_INDEXES,
    safe_identifier,
)
from app.graphrag_neo4j.types import (
    AnchorHit,
    MappedKnowledgeDocument,
    ReasoningEdge,
    ReasoningNode,
    ReasoningSubgraph,
)


class Neo4jGraphRAGClient:
    """Thin async wrapper over the Neo4j driver."""

    def __init__(
        self,
        uri: str | None = None,
        user: str | None = None,
        password: str | None = None,
        database: str | None = None,
    ) -> None:
        self.uri = (uri or os.getenv("NEO4J_URI", "")).strip()
        self.user = (user or os.getenv("NEO4J_USER", "")).strip()
        self.password = (password or os.getenv("NEO4J_PASSWORD", "")).strip()
        self.database = (database or os.getenv("NEO4J_DATABASE", "neo4j")).strip()
        self._driver = None

    @property
    def configured(self) -> bool:
        return bool(GraphDatabase and self.uri and self.user and self.password)

    def _get_driver(self):
        if not self.configured:
            raise RuntimeError("Neo4j is not configured")
        if self._driver is None:
            self._driver = GraphDatabase.driver(self.uri, auth=(self.user, self.password))
        return self._driver

    async def ensure_schema(self, embedding_dimensions: int) -> None:
        await asyncio.to_thread(self._ensure_schema_sync, embedding_dimensions)

    async def seed_domain_catalog(self) -> None:
        await asyncio.to_thread(self._seed_domain_catalog_sync)

    async def delete_source_document(self, source_doc_id: str) -> None:
        await asyncio.to_thread(self._delete_source_document_sync, source_doc_id)

    async def upsert_source_document(self, document: MappedKnowledgeDocument) -> None:
        await asyncio.to_thread(self._upsert_source_document_sync, document)

    async def vector_search(
        self,
        *,
        index_name: str,
        embedding: list[float],
        top_k: int,
        course_id: str | None,
        allowed_visibilities: list[str],
    ) -> list[AnchorHit]:
        return await asyncio.to_thread(
            self._vector_search_sync,
            index_name,
            embedding,
            top_k,
            course_id,
            allowed_visibilities,
        )

    async def fulltext_search(
        self,
        *,
        index_name: str,
        query: str,
        top_k: int,
        course_id: str | None,
        allowed_visibilities: list[str],
    ) -> list[AnchorHit]:
        return await asyncio.to_thread(
            self._fulltext_search_sync,
            index_name,
            query,
            top_k,
            course_id,
            allowed_visibilities,
        )

    async def expand_subgraph(
        self,
        *,
        anchor_ids: list[str],
        max_hops: int,
        course_id: str | None,
        allowed_visibilities: list[str],
        node_limit: int = 36,
    ) -> ReasoningSubgraph:
        return await asyncio.to_thread(
            self._expand_subgraph_sync,
            anchor_ids,
            max_hops,
            course_id,
            allowed_visibilities,
            node_limit,
        )

    def _ensure_schema_sync(self, embedding_dimensions: int) -> None:
        driver = self._get_driver()
        queries = [
            "CREATE CONSTRAINT knowledge_node_id IF NOT EXISTS FOR (n:KnowledgeNode) REQUIRE n.id IS UNIQUE",
        ]
        for index_name, (label, prop) in VECTOR_INDEXES.items():
            safe_identifier(index_name)
            safe_identifier(label)
            queries.append(
                f"CREATE VECTOR INDEX {index_name} IF NOT EXISTS "
                f"FOR (n:{label}) ON (n.{prop}) "
                f"OPTIONS {{indexConfig: {{`vector.dimensions`: {int(embedding_dimensions)}, `vector.similarity_function`: 'cosine'}}}}"
            )
        for index_name, (label, props) in FULLTEXT_INDEXES.items():
            safe_identifier(index_name)
            safe_identifier(label)
            props_expr = ", ".join([f"n.{prop}" for prop in props])
            queries.append(
                f"CREATE FULLTEXT INDEX {index_name} IF NOT EXISTS FOR (n:{label}) ON EACH [{props_expr}]"
            )

        with driver.session(database=self.database) as session:
            for query in queries:
                session.run(query).consume()

    def _seed_domain_catalog_sync(self) -> None:
        driver = self._get_driver()
        with driver.session(database=self.database) as session:
            for node in DOMAIN_NODES:
                label = safe_identifier(node.label)
                session.run(
                    f"MERGE (n:KnowledgeNode:{label} {{id: $id}}) SET n += $props",
                    id=node.node_id,
                    props=node.properties,
                ).consume()
            for rel in DOMAIN_RELATIONSHIPS:
                relation = safe_identifier(rel.relation)
                session.run(
                    f"""
                    MATCH (a:KnowledgeNode {{id: $source}})
                    MATCH (b:KnowledgeNode {{id: $target}})
                    MERGE (a)-[r:{relation}]->(b)
                    SET r += $props
                    """,
                    source=rel.source,
                    target=rel.target,
                    props=rel.properties,
                ).consume()

    def _delete_source_document_sync(self, source_doc_id: str) -> None:
        driver = self._get_driver()
        with driver.session(database=self.database) as session:
            session.run(
                "MATCH (n:KnowledgeNode) WHERE n.source_doc_id = $source_doc_id DETACH DELETE n",
                source_doc_id=source_doc_id,
            ).consume()

    def _upsert_source_document_sync(self, document: MappedKnowledgeDocument) -> None:
        driver = self._get_driver()
        with driver.session(database=self.database) as session:
            session.run(
                "MATCH (n:KnowledgeNode) WHERE n.source_doc_id = $source_doc_id DETACH DELETE n",
                source_doc_id=document.source_doc_id,
            ).consume()
            for node in document.nodes:
                label = safe_identifier(node.label)
                session.run(
                    f"MERGE (n:KnowledgeNode:{label} {{id: $id}}) SET n += $props",
                    id=node.node_id,
                    props=node.properties,
                ).consume()
            for rel in document.relationships:
                relation = safe_identifier(rel.relation)
                session.run(
                    f"""
                    MATCH (a:KnowledgeNode {{id: $source}})
                    MATCH (b:KnowledgeNode {{id: $target}})
                    MERGE (a)-[r:{relation}]->(b)
                    SET r += $props
                    """,
                    source=rel.source,
                    target=rel.target,
                    props=rel.properties,
                ).consume()

    def _vector_search_sync(
        self,
        index_name: str,
        embedding: list[float],
        top_k: int,
        course_id: str | None,
        allowed_visibilities: list[str],
    ) -> list[AnchorHit]:
        driver = self._get_driver()
        query = """
        CALL db.index.vector.queryNodes($index_name, $top_k, $embedding)
        YIELD node, score
        WHERE (coalesce(node.visibility, 'student_public') IN $allowed_visibilities)
          AND ($course_id IS NULL OR coalesce(node.course_id, 'global') IN [$course_id, 'global'])
        RETURN node, score
        ORDER BY score DESC
        LIMIT $top_k
        """
        with driver.session(database=self.database) as session:
            records = session.run(
                query,
                index_name=index_name,
                top_k=top_k,
                embedding=embedding,
                course_id=course_id,
                allowed_visibilities=allowed_visibilities,
            )
            return [self._record_to_anchor(record, float(record["score"])) for record in records]

    def _fulltext_search_sync(
        self,
        index_name: str,
        query: str,
        top_k: int,
        course_id: str | None,
        allowed_visibilities: list[str],
    ) -> list[AnchorHit]:
        driver = self._get_driver()
        cypher = """
        CALL db.index.fulltext.queryNodes($index_name, $query)
        YIELD node, score
        WHERE (coalesce(node.visibility, 'student_public') IN $allowed_visibilities)
          AND ($course_id IS NULL OR coalesce(node.course_id, 'global') IN [$course_id, 'global'])
        RETURN node, score
        ORDER BY score DESC
        LIMIT $top_k
        """
        with driver.session(database=self.database) as session:
            records = session.run(
                cypher,
                index_name=index_name,
                query=query,
                top_k=top_k,
                course_id=course_id,
                allowed_visibilities=allowed_visibilities,
            )
            return [self._record_to_anchor(record, float(record["score"])) for record in records]

    def _expand_subgraph_sync(
        self,
        anchor_ids: list[str],
        max_hops: int,
        course_id: str | None,
        allowed_visibilities: list[str],
        node_limit: int,
    ) -> ReasoningSubgraph:
        if not anchor_ids:
            return ReasoningSubgraph(anchor_ids=[], nodes=[], edges=[])

        driver = self._get_driver()
        rel_filter = "|".join(ALLOWED_RELATIONSHIPS)
        node_query = f"""
        MATCH (anchor:KnowledgeNode)
        WHERE anchor.id IN $anchor_ids
        OPTIONAL MATCH path=(anchor)-[rels:{rel_filter}*1..{max_hops}]-(nbr:KnowledgeNode)
        WHERE (coalesce(nbr.visibility, 'student_public') IN $allowed_visibilities)
          AND ($course_id IS NULL OR coalesce(nbr.course_id, 'global') IN [$course_id, 'global'])
        WITH collect(DISTINCT anchor) + collect(DISTINCT nbr) AS raw_nodes
        UNWIND raw_nodes AS node
        WITH collect(DISTINCT node)[0..$node_limit] AS nodes
        RETURN nodes
        """
        edge_query = """
        MATCH (a:KnowledgeNode)-[r]->(b:KnowledgeNode)
        WHERE a.id IN $node_ids
          AND b.id IN $node_ids
          AND type(r) IN $allowed_relations
        RETURN DISTINCT a.id AS source, b.id AS target, type(r) AS relation
        """
        with driver.session(database=self.database) as session:
            record = session.run(
                node_query,
                anchor_ids=anchor_ids,
                allowed_visibilities=allowed_visibilities,
                course_id=course_id,
                node_limit=node_limit,
            ).single()
            if not record:
                return ReasoningSubgraph(anchor_ids=anchor_ids, nodes=[], edges=[])

            nodes = [self._node_to_reasoning(node) for node in record["nodes"] or []]
            node_ids = {node.node_id for node in nodes}
            if not node_ids:
                return ReasoningSubgraph(anchor_ids=anchor_ids, nodes=[], edges=[])

            edges: list[ReasoningEdge] = []
            for rel in session.run(
                edge_query,
                node_ids=list(node_ids),
                allowed_relations=ALLOWED_RELATIONSHIPS,
            ):
                edges.append(
                    ReasoningEdge(
                        source=str(rel["source"]),
                        target=str(rel["target"]),
                        relation=str(rel["relation"]),
                    )
                )
            return ReasoningSubgraph(anchor_ids=anchor_ids, nodes=nodes, edges=edges)

    def _record_to_anchor(self, record: Any, score: float) -> AnchorHit:
        node = record["node"]
        labels = list(node.labels)
        label = next((item for item in labels if item != "KnowledgeNode"), labels[0] if labels else "KnowledgeNode")
        return AnchorHit(
            node_id=str(node.get("id", "")),
            label=label,
            score=score,
            title=str(node.get("title", "")),
            text=str(node.get("text", "")),
            latex=node.get("latex"),
            source_type=node.get("source_type"),
            source_id=node.get("source_id"),
            course_id=node.get("course_id"),
            visibility=node.get("visibility"),
        )

    def _node_to_reasoning(self, node: Any) -> ReasoningNode:
        labels = [label for label in list(node.labels) if label != "KnowledgeNode"]
        return ReasoningNode(
            node_id=str(node.get("id", "")),
            labels=labels,
            title=str(node.get("title", "")),
            text=str(node.get("text", "")),
            latex=node.get("latex"),
            score=float(node.get("score", 0.0) or 0.0),
            source_type=node.get("source_type"),
            source_id=node.get("source_id"),
            course_id=node.get("course_id"),
            visibility=node.get("visibility"),
        )
