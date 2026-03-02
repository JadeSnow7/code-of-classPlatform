"""Structured GraphRAG retrieval with community subgraph extraction."""

from __future__ import annotations

import sys
from dataclasses import dataclass
from typing import Any, Iterable

import networkx as nx

from app.graphrag.embedding import EmbeddingProvider
from app.graphrag.index import Chunk, GraphRAGIndex
from app.graphrag.vector_store import VectorStore

if sys.version_info >= (3, 10):
    _retriever_dataclass = dataclass(slots=True)
else:
    _retriever_dataclass = dataclass

_MAX_SOURCE_TEXT_CHARS = 400


def _bigrams(text: str) -> set[str]:
    """Generate lowercase character bigrams."""
    normalized = "".join((text or "").split()).lower()
    if len(normalized) < 2:
        return {normalized} if normalized else set()
    return {normalized[i : i + 2] for i in range(len(normalized) - 1)}


def _score(query_bigrams: set[str], chunk_text: str) -> float:
    """Compute keyword overlap score in [0, 1]."""
    if not query_bigrams:
        return 0.0
    chunk_bigrams = _bigrams(chunk_text)
    if not chunk_bigrams:
        return 0.0
    overlap = len(query_bigrams & chunk_bigrams)
    return overlap / max(1, len(query_bigrams))


@_retriever_dataclass
class _RetrievedChunk:
    """Internal chunk ranking item."""

    chunk: Chunk
    score: float


@_retriever_dataclass
class RetrievedSource:
    """Returned textual citation source."""

    citation_id: int
    chunk_id: str
    source: str
    section: str | None
    score: float
    text: str
    metadata: dict[str, Any]


@_retriever_dataclass
class SubgraphNode:
    """Node included in the returned community subgraph."""

    node_id: str
    title: str
    node_type: str
    community_id: str
    linked_chunk_ids: list[str]


@_retriever_dataclass
class SubgraphEdge:
    """Edge included in the returned community subgraph."""

    source: str
    target: str
    relation: str


@_retriever_dataclass
class CommunitySubgraph:
    """Community subgraph extracted for reasoning."""

    community_ids: list[str]
    nodes: list[SubgraphNode]
    edges: list[SubgraphEdge]


@_retriever_dataclass
class RetrievalBundle:
    """Structured retrieval output for downstream prompt assembly."""

    query: str
    sources: list[RetrievedSource]
    subgraph: CommunitySubgraph
    text_context_markdown: str
    graph_context_markdown: str
    assembled_context: str


class GraphRAGRetriever:
    """Hybrid GraphRAG retriever that returns structured reasoning context."""

    async def retrieve(
        self,
        *,
        index: GraphRAGIndex,
        vector_store: VectorStore,
        embedding: EmbeddingProvider,
        query: str,
        course_id: str | None = None,
        user_id: str | None = None,
        user_role: str | None = None,
        seed_top_k: int = 4,
        final_top_k: int = 6,
        expand_hops: int = 1,
        community_top_k: int = 2,
        subgraph_node_limit: int = 12,
        max_chars: int = 4000,
    ) -> RetrievalBundle:
        """Retrieve textual evidence and a supporting community subgraph."""
        normalized_query = query.strip()
        if not normalized_query:
            return self._empty_bundle(normalized_query)

        filters = self._build_filters(course_id=course_id, user_id=user_id, user_role=user_role)
        allowed_chunk_ids = self._filter_chunks_by_acl(index, filters)
        if not allowed_chunk_ids:
            return self._empty_bundle(normalized_query)

        keyword_results = self._rank_chunks_keyword(
            index,
            normalized_query,
            allowed_chunk_ids,
            top_k=max(1, seed_top_k * 2),
        )

        query_vector = await embedding.embed_query(normalized_query)
        semantic_results_raw = await vector_store.search(
            query_vector,
            top_k=max(1, seed_top_k * 2),
            filters=filters,
        )
        semantic_results = [(item.chunk_id, item.score) for item in semantic_results_raw]

        merged = self._rrf_merge(keyword_results, semantic_results, index)
        if not merged:
            return self._empty_bundle(normalized_query)

        seed_chunk_ids = {item.chunk.id for item in merged[: max(1, seed_top_k)]}
        seed_node_ids = self._seed_node_ids(index, seed_chunk_ids)

        expanded_chunk_ids = set(seed_chunk_ids)
        for node_id in self._expand_node_ids(index, seed_node_ids, hops=expand_hops):
            node = index.nodes.get(node_id)
            if node:
                expanded_chunk_ids.update(node.chunk_ids)

        expanded_keyword = self._rank_chunks_keyword(
            index,
            normalized_query,
            expanded_chunk_ids or allowed_chunk_ids,
            top_k=max(1, final_top_k * 2),
        )
        expanded_semantic = [
            (item.chunk_id, item.score)
            for item in semantic_results_raw
            if item.chunk_id in expanded_chunk_ids
        ]
        final_ranked = self._rrf_merge(expanded_keyword, expanded_semantic, index)[: max(1, final_top_k)]
        if not final_ranked:
            return self._empty_bundle(normalized_query)

        sources, text_context_markdown = self._build_text_sources(final_ranked, max_chars=max_chars)
        final_chunk_ids = {source.chunk_id for source in sources}
        linked_node_ids = self._seed_node_ids(index, final_chunk_ids)
        subgraph = self._build_community_subgraph(
            index,
            seed_node_ids=seed_node_ids,
            linked_node_ids=linked_node_ids,
            community_top_k=community_top_k,
            subgraph_node_limit=subgraph_node_limit,
            expand_hops=expand_hops,
        )
        graph_context_markdown = self._build_graph_context_markdown(subgraph)
        assembled_context = self._assemble_context(
            text_context_markdown=text_context_markdown,
            graph_context_markdown=graph_context_markdown,
        )

        return RetrievalBundle(
            query=normalized_query,
            sources=sources,
            subgraph=subgraph,
            text_context_markdown=text_context_markdown,
            graph_context_markdown=graph_context_markdown,
            assembled_context=assembled_context,
        )

    def _build_filters(
        self,
        *,
        course_id: str | None,
        user_id: str | None,
        user_role: str | None,
    ) -> dict[str, str]:
        filters: dict[str, str] = {}
        if course_id:
            filters["course_id"] = course_id
        if user_role == "student" and user_id:
            filters["user_id"] = user_id
        return filters

    def _filter_chunks_by_acl(self, index: GraphRAGIndex, filters: dict[str, str]) -> set[str]:
        if not filters:
            return set(index.chunks.keys())
        allowed: set[str] = set()
        for chunk_id, chunk in index.chunks.items():
            metadata = chunk.metadata or {}
            if any(metadata.get(key) != value for key, value in filters.items()):
                continue
            allowed.add(chunk_id)
        return allowed

    def _rank_chunks_keyword(
        self,
        index: GraphRAGIndex,
        query: str,
        chunk_ids: Iterable[str],
        *,
        top_k: int,
    ) -> list[_RetrievedChunk]:
        q = query.strip()
        if not q:
            return []
        q_bigrams = _bigrams(q)
        ranked: list[_RetrievedChunk] = []
        for chunk_id in chunk_ids:
            chunk = index.chunks.get(chunk_id)
            if not chunk:
                continue
            score = _score(q_bigrams, chunk.text)
            if score <= 0:
                continue
            ranked.append(_RetrievedChunk(chunk=chunk, score=score))
        ranked.sort(key=lambda item: (item.score, -len(item.chunk.text)), reverse=True)
        return ranked[: max(1, top_k)]

    def _rrf_merge(
        self,
        keyword_results: list[_RetrievedChunk],
        semantic_results: list[tuple[str, float]],
        index: GraphRAGIndex,
        *,
        k: int = 60,
    ) -> list[_RetrievedChunk]:
        scores: dict[str, float] = {}
        chunks: dict[str, Chunk] = {}

        for rank, item in enumerate(keyword_results):
            scores[item.chunk.id] = scores.get(item.chunk.id, 0.0) + 1.0 / (k + rank + 1)
            chunks[item.chunk.id] = item.chunk

        for rank, (chunk_id, _) in enumerate(semantic_results):
            scores[chunk_id] = scores.get(chunk_id, 0.0) + 1.0 / (k + rank + 1)
            if chunk_id not in chunks:
                chunk = index.chunks.get(chunk_id)
                if chunk:
                    chunks[chunk_id] = chunk

        merged = [
            _RetrievedChunk(chunk=chunks[chunk_id], score=score)
            for chunk_id, score in sorted(scores.items(), key=lambda item: -item[1])
            if chunk_id in chunks
        ]
        return merged

    def _seed_node_ids(self, index: GraphRAGIndex, chunk_ids: Iterable[str]) -> set[str]:
        seed_nodes: set[str] = set()
        for chunk_id in chunk_ids:
            seed_nodes.update(index.chunk_to_nodes.get(chunk_id, ()))
        return seed_nodes

    def _expand_node_ids(self, index: GraphRAGIndex, seed_node_ids: set[str], *, hops: int) -> set[str]:
        if hops <= 0:
            return set(seed_node_ids)
        visited = set(seed_node_ids)
        frontier = set(seed_node_ids)
        for _ in range(hops):
            if not frontier:
                break
            next_frontier: set[str] = set()
            for node_id in frontier:
                for neighbor in index.node_neighbors.get(node_id, ()):
                    if neighbor in visited:
                        continue
                    visited.add(neighbor)
                    next_frontier.add(neighbor)
            frontier = next_frontier
        return visited

    def _build_text_sources(
        self,
        ranked_chunks: list[_RetrievedChunk],
        *,
        max_chars: int,
    ) -> tuple[list[RetrievedSource], str]:
        sources: list[RetrievedSource] = []
        blocks: list[str] = []
        used_chars = 0

        for chunk_rank, item in enumerate(ranked_chunks, start=1):
            chunk = item.chunk
            header = f"[{chunk_rank}] {chunk.source or 'unknown'}"
            if chunk.section:
                header += f"#{chunk.section}"
            block = header + "\n" + chunk.text.strip()
            if used_chars + len(block) + 2 > max_chars:
                break
            used_chars += len(block) + 2
            blocks.append(block)
            sources.append(
                RetrievedSource(
                    citation_id=chunk_rank,
                    chunk_id=chunk.id,
                    source=chunk.source or "unknown",
                    section=chunk.section,
                    score=item.score,
                    text=self._truncate_text(chunk.text.strip(), _MAX_SOURCE_TEXT_CHARS),
                    metadata=dict(chunk.metadata or {}),
                )
            )

        return sources, "\n\n".join(blocks).strip()

    def _build_community_subgraph(
        self,
        index: GraphRAGIndex,
        *,
        seed_node_ids: set[str],
        linked_node_ids: set[str],
        community_top_k: int,
        subgraph_node_limit: int,
        expand_hops: int,
    ) -> CommunitySubgraph:
        graph = self._to_networkx_graph(index)
        if graph.number_of_nodes() == 0:
            return CommunitySubgraph(community_ids=[], nodes=[], edges=[])

        communities = self._detect_communities(graph)
        if not communities:
            return CommunitySubgraph(community_ids=[], nodes=[], edges=[])

        community_lookup = self._community_lookup(communities)
        selected_community_ids = self._select_community_ids(
            communities=communities,
            community_lookup=community_lookup,
            seed_node_ids=seed_node_ids,
            linked_node_ids=linked_node_ids,
            community_top_k=community_top_k,
        )
        if not selected_community_ids:
            return CommunitySubgraph(community_ids=[], nodes=[], edges=[])

        community_nodes = {
            node_id
            for node_id, community_id in community_lookup.items()
            if community_id in selected_community_ids
        }
        kept_nodes = set(seed_node_ids) & community_nodes
        kept_nodes.update(set(linked_node_ids) & community_nodes)
        kept_nodes.update(self._neighbor_nodes(graph, seed_node_ids & community_nodes, max_hops=expand_hops) & community_nodes)

        if not kept_nodes and community_nodes:
            kept_nodes.update(community_nodes)

        if len(kept_nodes) > subgraph_node_limit:
            kept_nodes = self._trim_nodes(
                graph,
                candidate_nodes=community_nodes,
                kept_nodes=kept_nodes,
                seed_node_ids=seed_node_ids,
                linked_node_ids=linked_node_ids,
                subgraph_node_limit=subgraph_node_limit,
            )

        induced = graph.subgraph(sorted(kept_nodes)).copy()
        nodes = [
            SubgraphNode(
                node_id=node_id,
                title=str(induced.nodes[node_id].get("title", "")).strip(),
                node_type=str(induced.nodes[node_id].get("node_type", "concept")).strip() or "concept",
                community_id=str(community_lookup.get(node_id, "")),
                linked_chunk_ids=list(induced.nodes[node_id].get("chunk_ids", [])),
            )
            for node_id in sorted(
                induced.nodes,
                key=lambda item: (
                    str(community_lookup.get(item, "")),
                    str(induced.nodes[item].get("title", "")),
                    item,
                ),
            )
        ]

        edges: list[SubgraphEdge] = []
        for source, target, data in induced.edges(data=True):
            left, right = sorted((source, target))
            edges.append(
                SubgraphEdge(
                    source=left,
                    target=right,
                    relation=str(data.get("relation", "related")).strip() or "related",
                )
            )
        edges.sort(key=lambda edge: (edge.source, edge.relation, edge.target))

        present_communities = []
        for community_id in selected_community_ids:
            if any(node.community_id == community_id for node in nodes):
                present_communities.append(community_id)

        return CommunitySubgraph(
            community_ids=present_communities,
            nodes=nodes,
            edges=edges,
        )

    def _to_networkx_graph(self, index: GraphRAGIndex) -> nx.Graph:
        graph = nx.Graph()
        for node in index.nodes.values():
            graph.add_node(
                node.id,
                title=node.title,
                chunk_ids=list(node.chunk_ids),
                node_type=self._node_type(node.id),
            )
        for edge in index.edges:
            if edge.source not in graph or edge.target not in graph:
                continue
            graph.add_edge(edge.source, edge.target, relation=edge.relation)
        return graph

    def _detect_communities(self, graph: nx.Graph) -> list[set[str]]:
        if graph.number_of_nodes() == 0:
            return []
        if graph.number_of_edges() == 0:
            return [{node_id} for node_id in graph.nodes]
        return [set(group) for group in nx.algorithms.community.greedy_modularity_communities(graph)]

    def _community_lookup(self, communities: list[set[str]]) -> dict[str, str]:
        lookup: dict[str, str] = {}
        for index, nodes in enumerate(communities, start=1):
            community_id = f"community-{index}"
            for node_id in nodes:
                lookup[node_id] = community_id
        return lookup

    def _select_community_ids(
        self,
        *,
        communities: list[set[str]],
        community_lookup: dict[str, str],
        seed_node_ids: set[str],
        linked_node_ids: set[str],
        community_top_k: int,
    ) -> list[str]:
        selected_from_seed = self._rank_communities(communities, community_lookup, seed_node_ids, community_top_k)
        if selected_from_seed:
            return selected_from_seed
        return self._rank_communities(communities, community_lookup, linked_node_ids, community_top_k)

    def _rank_communities(
        self,
        communities: list[set[str]],
        community_lookup: dict[str, str],
        target_nodes: set[str],
        community_top_k: int,
    ) -> list[str]:
        if not target_nodes:
            return []
        scores: list[tuple[int, int, str]] = []
        for index, community_nodes in enumerate(communities, start=1):
            overlap = len(target_nodes & community_nodes)
            if overlap <= 0:
                continue
            scores.append((overlap, len(community_nodes), f"community-{index}"))
        scores.sort(key=lambda item: (-item[0], item[1], item[2]))
        return [community_id for _, _, community_id in scores[: max(1, community_top_k)]]

    def _neighbor_nodes(self, graph: nx.Graph, start_nodes: set[str], *, max_hops: int) -> set[str]:
        if max_hops <= 0:
            return set(start_nodes)
        visited = set(start_nodes)
        for node_id in start_nodes:
            lengths = nx.single_source_shortest_path_length(graph, node_id, cutoff=max_hops)
            visited.update(lengths.keys())
        return visited

    def _trim_nodes(
        self,
        graph: nx.Graph,
        *,
        candidate_nodes: set[str],
        kept_nodes: set[str],
        seed_node_ids: set[str],
        linked_node_ids: set[str],
        subgraph_node_limit: int,
    ) -> set[str]:
        subgraph = graph.subgraph(candidate_nodes)
        centrality = nx.degree_centrality(subgraph) if subgraph.number_of_nodes() > 1 else {node_id: 0.0 for node_id in candidate_nodes}

        ranked_nodes = sorted(
            kept_nodes,
            key=lambda node_id: (
                node_id in seed_node_ids,
                node_id in linked_node_ids,
                centrality.get(node_id, 0.0),
                bool(str(graph.nodes[node_id].get("title", "")).strip()),
                str(graph.nodes[node_id].get("title", "")),
                node_id,
            ),
            reverse=True,
        )
        return set(ranked_nodes[: max(1, subgraph_node_limit)])

    def _build_graph_context_markdown(self, subgraph: CommunitySubgraph) -> str:
        lines = [
            "## Community Subgraph",
            "### Nodes",
            "| Node ID | Title | Type | Community |",
            "| --- | --- | --- | --- |",
        ]
        if subgraph.nodes:
            for node in subgraph.nodes:
                lines.append(
                    f"| {node.node_id} | {self._escape_table_cell(node.title)} | {node.node_type} | {node.community_id} |"
                )
        else:
            lines.append("| - | - | - | - |")

        lines.extend(
            [
                "",
                "### Edges",
                "| Source | Relation | Target |",
                "| --- | --- | --- |",
            ]
        )
        if subgraph.edges:
            for edge in subgraph.edges:
                lines.append(
                    f"| {edge.source} | {self._escape_table_cell(edge.relation)} | {edge.target} |"
                )
        else:
            lines.append("| - | - | - |")

        return "\n".join(lines).strip()

    def _assemble_context(self, *, text_context_markdown: str, graph_context_markdown: str) -> str:
        sections = ["## Retrieved Text Evidence"]
        if text_context_markdown:
            sections.append(text_context_markdown)
        sections.append("## Knowledge Graph Community")
        sections.append(graph_context_markdown)
        return "\n\n".join(section.strip() for section in sections if section.strip()).strip()

    def _empty_bundle(self, query: str) -> RetrievalBundle:
        return RetrievalBundle(
            query=query,
            sources=[],
            subgraph=CommunitySubgraph(community_ids=[], nodes=[], edges=[]),
            text_context_markdown="",
            graph_context_markdown="",
            assembled_context="",
        )

    def _truncate_text(self, text: str, limit: int) -> str:
        cleaned = text.strip()
        if len(cleaned) <= limit:
            return cleaned
        return cleaned[: max(1, limit - 3)].rstrip() + "..."

    def _node_type(self, node_id: str) -> str:
        if node_id.startswith("doc:"):
            return "document"
        if node_id.startswith("sec:"):
            return "section"
        if node_id.startswith("entity:"):
            return "entity"
        return "concept"

    def _escape_table_cell(self, value: str) -> str:
        return value.replace("|", "\\|").replace("\n", " ").strip() or "-"
