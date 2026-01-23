"""
Retrieval module for GraphRAG with semantic search and ACL filtering.

Supports hybrid retrieval (keyword + semantic) with RRF fusion.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Iterable

from .index import Chunk, GraphRAGIndex

if TYPE_CHECKING:
    from .embedding import EmbeddingProvider
    from .vector_store import VectorStore


def _bigrams(text: str) -> set[str]:
    s = "".join(text.split()).lower()
    if len(s) < 2:
        return {s} if s else set()
    return {s[i : i + 2] for i in range(len(s) - 1)}


@dataclass(frozen=True)
class RetrievedChunk:
    chunk: Chunk
    score: float


@dataclass
class Citation:
    """Structured citation for retrieved chunks."""
    index: int  # Reference number [1], [2], ...
    source: str  # File source
    section: str | None  # Section/chapter
    chunk_id: str  # For traceability
    text: str  # Citation text (truncated)
    score: float  # Relevance score


@dataclass
class RetrievalContext:
    """Context for retrieval with ACL information."""
    query: str
    course_id: str | None = None
    user_id: str | None = None
    user_role: str | None = None  # teacher | student | admin

    def get_filters(self) -> dict:
        """Build ACL filters based on user role."""
        filters = {}
        if self.course_id:
            filters["course_id"] = self.course_id
        # Students can only see their own submissions
        if self.user_role == "student" and self.user_id:
            filters["user_id"] = self.user_id
        return filters


def _score(query_bigrams: set[str], chunk_text: str) -> float:
    if not query_bigrams:
        return 0.0
    chunk_bigrams = _bigrams(chunk_text)
    if not chunk_bigrams:
        return 0.0
    overlap = len(query_bigrams & chunk_bigrams)
    return overlap / max(1, len(query_bigrams))


def _expand_nodes(index: GraphRAGIndex, seed_node_ids: set[str], hops: int) -> set[str]:
    if hops <= 0:
        return set(seed_node_ids)
    visited = set(seed_node_ids)
    frontier = set(seed_node_ids)
    for _ in range(hops):
        if not frontier:
            break
        nxt: set[str] = set()
        for nid in frontier:
            for nb in index.node_neighbors.get(nid, ()):
                if nb not in visited:
                    visited.add(nb)
                    nxt.add(nb)
        frontier = nxt
    return visited


def _filter_chunks_by_acl(index: GraphRAGIndex, filters: dict) -> set[str]:
    """
    Filter chunks by ACL rules.
    
    Args:
        index: GraphRAG index
        filters: ACL filters (course_id, user_id)
        
    Returns:
        Set of allowed chunk IDs
    """
    if not filters:
        return set(index.chunks.keys())
    
    allowed = set()
    for chunk_id, chunk in index.chunks.items():
        metadata = chunk.metadata or {}
        
        # Check course_id filter
        if "course_id" in filters:
            if metadata.get("course_id") != filters["course_id"]:
                continue
        
        # Check user_id filter (for student submissions)
        if "user_id" in filters:
            if metadata.get("user_id") != filters["user_id"]:
                continue
        
        allowed.add(chunk_id)
    return allowed


def _rank_chunks_keyword(
    index: GraphRAGIndex,
    query: str,
    chunk_ids: Iterable[str],
    top_k: int,
) -> list[RetrievedChunk]:
    """Keyword-based ranking using bigram overlap."""
    q = query.strip()
    if not q:
        return []
    q_bigrams = _bigrams(q)
    scored: list[RetrievedChunk] = []
    for cid in chunk_ids:
        ch = index.chunks.get(cid)
        if not ch:
            continue
        s = _score(q_bigrams, ch.text)
        if s <= 0:
            continue
        scored.append(RetrievedChunk(chunk=ch, score=s))
    scored.sort(key=lambda x: (x.score, -len(x.chunk.text)), reverse=True)
    return scored[: max(1, top_k)]


def rrf_merge(
    keyword_results: list[RetrievedChunk],
    semantic_results: list[tuple[str, float]],
    index: GraphRAGIndex,
    k: int = 60,
) -> list[RetrievedChunk]:
    """
    Reciprocal Rank Fusion to merge keyword and semantic results.
    
    RRF score = 1/(k + rank_keyword) + 1/(k + rank_semantic)
    k=60 is the recommended value from the original paper.
    """
    scores: dict[str, float] = {}
    chunk_map: dict[str, Chunk] = {}

    # Keyword results
    for rank, r in enumerate(keyword_results):
        scores[r.chunk.id] = scores.get(r.chunk.id, 0) + 1 / (k + rank + 1)
        chunk_map[r.chunk.id] = r.chunk

    # Semantic results
    for rank, (chunk_id, _) in enumerate(semantic_results):
        scores[chunk_id] = scores.get(chunk_id, 0) + 1 / (k + rank + 1)
        if chunk_id not in chunk_map:
            chunk = index.chunks.get(chunk_id)
            if chunk:
                chunk_map[chunk_id] = chunk

    # Sort by RRF score
    sorted_ids = sorted(scores.items(), key=lambda x: -x[1])
    return [
        RetrievedChunk(chunk=chunk_map[cid], score=score)
        for cid, score in sorted_ids
        if cid in chunk_map
    ]


async def build_rag_context_hybrid(
    index: GraphRAGIndex,
    ctx: RetrievalContext,
    vector_store: "VectorStore",
    embedding: "EmbeddingProvider",
    *,
    seed_top_k: int = 4,
    expand_hops: int = 1,
    final_top_k: int = 8,
    max_chars: int = 4000,
    rrf_k: int = 60,
) -> str:
    """
    Build RAG context using hybrid retrieval (keyword + semantic).
    
    Args:
        index: GraphRAG index for keyword search and graph expansion
        ctx: Retrieval context with query and ACL info
        vector_store: Vector store for semantic search
        embedding: Embedding provider
        seed_top_k: Number of seed chunks for keyword search
        expand_hops: Graph expansion hops
        final_top_k: Final number of chunks to return
        max_chars: Maximum context length
        rrf_k: RRF parameter (default 60)
    """
    query = ctx.query.strip()
    if not query:
        return ""

    # Get ACL filters
    filters = ctx.get_filters()

    # Keyword search with ACL filtering (fix: was searching all chunks)
    allowed_chunk_ids = _filter_chunks_by_acl(index, filters)
    keyword_results = _rank_chunks_keyword(index, query, allowed_chunk_ids, top_k=seed_top_k * 2)

    # Semantic search
    query_vector = await embedding.embed_query(query)
    search_results = await vector_store.search(query_vector, top_k=seed_top_k * 2, filters=filters)
    semantic_results = [(r.chunk_id, r.score) for r in search_results]

    # RRF fusion
    merged = rrf_merge(keyword_results, semantic_results, index, k=rrf_k)

    if not merged:
        return ""

    # Graph expansion
    seed_chunk_ids = {r.chunk.id for r in merged[:seed_top_k]}
    seed_node_ids: set[str] = set()
    for cid in seed_chunk_ids:
        seed_node_ids.update(index.chunk_to_nodes.get(cid, ()))

    all_node_ids = _expand_nodes(index, seed_node_ids, hops=expand_hops)
    expanded_chunk_ids: set[str] = set(seed_chunk_ids)
    for nid in all_node_ids:
        node = index.nodes.get(nid)
        if not node:
            continue
        expanded_chunk_ids.update(node.chunk_ids)

    # Re-rank expanded chunks
    expanded_keyword = _rank_chunks_keyword(index, query, expanded_chunk_ids, top_k=final_top_k * 2)
    
    # Get semantic scores for expanded chunks
    expanded_semantic = [
        (r.chunk_id, r.score) for r in search_results
        if r.chunk_id in expanded_chunk_ids
    ]
    
    final_ranked = rrf_merge(expanded_keyword, expanded_semantic, index, k=rrf_k)[:final_top_k]

    # Build context string
    parts: list[str] = []
    used = 0
    for i, r in enumerate(final_ranked, start=1):
        ch = r.chunk
        header = f"[{i}] {ch.source or 'unknown'}"
        if ch.section:
            header += f"#{ch.section}"
        text = ch.text.strip()
        block = header + "\n" + text
        if used + len(block) + 2 > max_chars:
            break
        parts.append(block)
        used += len(block) + 2

    return "\n\n".join(parts).strip()


async def build_rag_context_with_citations(
    index: GraphRAGIndex,
    ctx: RetrievalContext,
    vector_store: "VectorStore",
    embedding: "EmbeddingProvider",
    *,
    seed_top_k: int = 4,
    expand_hops: int = 1,
    final_top_k: int = 8,
    max_chars: int = 4000,
    max_citation_text: int = 200,
    rrf_k: int = 60,
) -> tuple[str, list[Citation]]:
    """
    Build RAG context with structured citations.
    
    Returns:
        Tuple of (context_string, list of Citation objects)
    """
    query = ctx.query.strip()
    if not query:
        return "", []

    # Get ACL filters
    filters = ctx.get_filters()

    # Keyword search with ACL filtering
    allowed_chunk_ids = _filter_chunks_by_acl(index, filters)
    keyword_results = _rank_chunks_keyword(index, query, allowed_chunk_ids, top_k=seed_top_k * 2)

    # Semantic search
    query_vector = await embedding.embed_query(query)
    search_results = await vector_store.search(query_vector, top_k=seed_top_k * 2, filters=filters)
    semantic_results = [(r.chunk_id, r.score) for r in search_results]

    # RRF fusion
    merged = rrf_merge(keyword_results, semantic_results, index, k=rrf_k)

    if not merged:
        return "", []

    # Graph expansion
    seed_chunk_ids = {r.chunk.id for r in merged[:seed_top_k]}
    seed_node_ids: set[str] = set()
    for cid in seed_chunk_ids:
        seed_node_ids.update(index.chunk_to_nodes.get(cid, ()))

    all_node_ids = _expand_nodes(index, seed_node_ids, hops=expand_hops)
    expanded_chunk_ids: set[str] = set(seed_chunk_ids)
    for nid in all_node_ids:
        node = index.nodes.get(nid)
        if not node:
            continue
        expanded_chunk_ids.update(node.chunk_ids)

    # Re-rank expanded chunks
    expanded_keyword = _rank_chunks_keyword(index, query, expanded_chunk_ids, top_k=final_top_k * 2)
    
    # Get semantic scores for expanded chunks
    expanded_semantic = [
        (r.chunk_id, r.score) for r in search_results
        if r.chunk_id in expanded_chunk_ids
    ]
    
    final_ranked = rrf_merge(expanded_keyword, expanded_semantic, index, k=rrf_k)[:final_top_k]

    # Build context string and citations
    parts: list[str] = []
    citations: list[Citation] = []
    used = 0
    
    for i, r in enumerate(final_ranked, start=1):
        ch = r.chunk
        header = f"[{i}] {ch.source or 'unknown'}"
        if ch.section:
            header += f"#{ch.section}"
        text = ch.text.strip()
        block = header + "\n" + text
        
        if used + len(block) + 2 > max_chars:
            break
        
        parts.append(block)
        used += len(block) + 2
        
        # Build structured citation
        citation_text = text[:max_citation_text]
        if len(text) > max_citation_text:
            citation_text += "..."
        
        citations.append(Citation(
            index=i,
            source=ch.source or "unknown",
            section=ch.section,
            chunk_id=ch.id,
            text=citation_text,
            score=r.score,
        ))

    return "\n\n".join(parts).strip(), citations


# Backward compatible function (uses keyword-only search)
def build_rag_context(
    index: GraphRAGIndex,
    query: str,
    *,
    seed_top_k: int = 4,
    expand_hops: int = 1,
    final_top_k: int = 8,
    max_chars: int = 4000,
) -> str:
    """
    Legacy keyword-only RAG context builder.
    
    Kept for backward compatibility. Use build_rag_context_hybrid for new code.
    """
    seed = _rank_chunks_keyword(index, query, index.chunks.keys(), top_k=seed_top_k)
    if not seed:
        return ""

    seed_chunk_ids = {r.chunk.id for r in seed}
    seed_node_ids: set[str] = set()
    for cid in seed_chunk_ids:
        seed_node_ids.update(index.chunk_to_nodes.get(cid, ()))

    all_node_ids = _expand_nodes(index, seed_node_ids, hops=expand_hops)
    expanded_chunk_ids: set[str] = set(seed_chunk_ids)
    for nid in all_node_ids:
        node = index.nodes.get(nid)
        if not node:
            continue
        expanded_chunk_ids.update(node.chunk_ids)

    ranked = _rank_chunks_keyword(index, query, expanded_chunk_ids, top_k=final_top_k)
    if not ranked:
        return ""

    parts: list[str] = []
    used = 0
    for i, r in enumerate(ranked, start=1):
        ch = r.chunk
        header = f"[{i}] {ch.source or 'unknown'}"
        if ch.section:
            header += f"#{ch.section}"
        text = ch.text.strip()
        block = header + "\n" + text
        if used + len(block) + 2 > max_chars:
            break
        parts.append(block)
        used += len(block) + 2

    return "\n\n".join(parts).strip()
