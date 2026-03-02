"""Neo4j-based anchor retrieval and subgraph expansion."""

from __future__ import annotations

from collections import defaultdict

from app.graphrag.embedding import EmbeddingProvider
from app.graphrag_neo4j.client import Neo4jGraphRAGClient
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

        hits: dict[str, AnchorHit] = {}
        weights = {
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
            self._merge_hits(hits, results, weights[index_name])

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
            self._merge_hits(hits, results, weights[index_name])

        for node_id in match_catalog_nodes(f"{query} {problem_frame.target_quantity}"):
            if node_id not in hits:
                hits[node_id] = AnchorHit(node_id=node_id, label="Catalog", score=0.66, title=node_id, text="")

        ranked = sorted(hits.values(), key=lambda item: (-item.score, item.node_id))[:6]
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
            result.score *= weight
            if result.node_id in accumulator:
                accumulator[result.node_id].score += result.score
                continue
            accumulator[result.node_id] = result

    def _build_fulltext_query(self, query: str, problem_frame: ProblemFrame) -> str:
        terms = [query.strip(), problem_frame.target_quantity.strip()]
        terms.extend(problem_frame.symmetry_hints)
        terms.extend(problem_frame.boundary_conditions)
        return " ".join([term for term in terms if term]).strip()
