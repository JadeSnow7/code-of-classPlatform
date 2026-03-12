"""Neo4j-based anchor retrieval and subgraph expansion."""

from __future__ import annotations

from collections import defaultdict
import os

from app.graphrag.embedding import EmbeddingProvider
from app.graphrag_neo4j.client import Neo4jGraphRAGClient
from app.graphrag_neo4j.rrf import RRFConfig, RankedSource, fuse_dense_graph_rrf
from app.graphrag_neo4j.schema import FULLTEXT_INDEXES, VECTOR_INDEXES, match_catalog_nodes
from app.graphrag_neo4j.types import AnchorHit, ProblemFrame, ReasoningSubgraph, RetrievalDebug


class Neo4jDerivationRetriever:
    """Retrieve anchors and reasoning subgraphs for derivation requests."""

    def __init__(self, *, client: Neo4jGraphRAGClient, embedding: EmbeddingProvider) -> None:
        self.client = client
        self.embedding = embedding

    async def retrieve(
        self,
        *,
        query: str,
        problem_frame: ProblemFrame,
        user_role: str | None,
    ) -> tuple[list[AnchorHit], ReasoningSubgraph, RetrievalDebug]:
        allowed_visibilities = ["student_public"] if (user_role or "").lower() == "student" else ["student_public", "teacher_private"]
        query_embedding = await self.embedding.embed_query(query)
        weights = self._channel_weights()
        dense_sources: list[RankedSource] = []
        graph_sources: list[RankedSource] = []

        for index_name in VECTOR_INDEXES:
            try:
                results = await self.client.vector_search(
                    index_name=index_name,
                    embedding=query_embedding,
                    top_k=5,
                    course_id=problem_frame.course_id,
                    allowed_visibilities=allowed_visibilities,
                )
            except Exception:
                results = []
            dense_sources.append(RankedSource(name=index_name, hits=results, weight=weights[index_name]))

        fulltext_query = self._build_fulltext_query(query, problem_frame)
        for index_name in FULLTEXT_INDEXES:
            try:
                results = await self.client.fulltext_search(
                    index_name=index_name,
                    query=fulltext_query,
                    top_k=5,
                    course_id=problem_frame.course_id,
                    allowed_visibilities=allowed_visibilities,
                )
            except Exception:
                results = []
            graph_sources.append(RankedSource(name=index_name, hits=results, weight=weights[index_name]))

        catalog_hits: list[AnchorHit] = []
        for node_id in match_catalog_nodes(f"{query} {problem_frame.target_quantity}"):
            catalog_hits.append(AnchorHit(node_id=node_id, label="Catalog", score=0.66, title=node_id, text=""))
        if catalog_hits:
            graph_sources.append(
                RankedSource(
                    name="catalog_nodes",
                    hits=catalog_hits,
                    weight=float(os.getenv("GRAPH_RAG_RRF_CATALOG_WEIGHT", "0.7")),
                )
            )

        if self._rrf_enabled():
            ranked = fuse_dense_graph_rrf(
                dense_sources=dense_sources,
                graph_sources=graph_sources,
                config=RRFConfig(
                    k=int(os.getenv("GRAPH_RAG_RRF_K", "50")),
                    top_k=int(os.getenv("GRAPH_RAG_FINAL_TOP_K", "8")),
                    dense_weight=float(os.getenv("GRAPH_RAG_RRF_DENSE_WEIGHT", "1.0")),
                    graph_weight=float(os.getenv("GRAPH_RAG_RRF_GRAPH_WEIGHT", "1.15")),
                ),
            )
        else:
            hits: dict[str, AnchorHit] = {}
            for source in dense_sources + graph_sources:
                self._merge_hits(hits, source.hits, source.weight)
            ranked = sorted(hits.values(), key=lambda item: (-item.score, item.node_id))[: int(os.getenv("GRAPH_RAG_FINAL_TOP_K", "8"))]
        anchor_ids = [item.node_id for item in ranked]
        subgraph = await self.client.expand_subgraph(
            anchor_ids=anchor_ids,
            max_hops=3,
            course_id=problem_frame.course_id,
            allowed_visibilities=allowed_visibilities,
            node_limit=42,
        )
        score_map = {hit.node_id: hit.score for hit in ranked}
        for node in subgraph.nodes:
            if node.node_id in score_map:
                node.score = score_map[node.node_id]

        debug = RetrievalDebug(anchor_ids=anchor_ids, subgraph_node_count=len(subgraph.nodes))
        return ranked, subgraph, debug

    def _merge_hits(self, accumulator: dict[str, AnchorHit], results: list[AnchorHit], weight: float) -> None:
        for result in results:
            weighted_score = result.score * weight
            if result.node_id in accumulator:
                accumulator[result.node_id].score += weighted_score
                continue
            accumulator[result.node_id] = result.model_copy(update={"score": weighted_score})

    def _build_fulltext_query(self, query: str, problem_frame: ProblemFrame) -> str:
        terms = [query.strip(), problem_frame.target_quantity.strip()]
        terms.extend(problem_frame.symmetry_hints)
        terms.extend(problem_frame.boundary_conditions)
        return " ".join([term for term in terms if term]).strip()

    def _rrf_enabled(self) -> bool:
        return os.getenv("GRAPH_RAG_RRF_ENABLED", "").strip().lower() in {"1", "true", "yes", "on"}

    def _channel_weights(self) -> dict[str, float]:
        return {
            "problem_embedding_idx": 1.0,
            "workedexample_embedding_idx": 0.95,
            "formula_embedding_idx": 1.15,
            "textchunk_embedding_idx": 0.8,
            "law_fulltext_idx": 1.2,
            "formula_fulltext_idx": 1.15,
            "concept_fulltext_idx": 0.75,
            "condition_fulltext_idx": 0.9,
            "boundary_condition_fulltext_idx": 0.95,
        }
