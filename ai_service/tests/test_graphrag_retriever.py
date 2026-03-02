from __future__ import annotations

import pytest

from app.graphrag.index import GraphRAGIndex
from app.graphrag.vector_store import SearchResult
from app.services.graphrag.retriever import GraphRAGRetriever


class FakeEmbedding:
    dimension = 2

    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        return [await self.embed_query(text) for text in texts]

    async def embed_query(self, query: str) -> list[float]:
        if "量子" in query:
            return [0.0, 1.0]
        if "麦克斯韦" in query or "散度" in query:
            return [1.0, 0.0]
        return [0.0, 0.0]


class FakeVectorStore:
    def __init__(self, metadata_by_chunk: dict[str, dict]) -> None:
        self.metadata_by_chunk = metadata_by_chunk

    async def add(self, ids, vectors, metadata) -> None:
        return None

    async def delete(self, ids) -> int:
        return 0

    async def save(self, path: str) -> None:
        return None

    async def load(self, path: str) -> None:
        return None

    async def search(self, query_vector, top_k=10, filters=None):
        if query_vector == [1.0, 0.0]:
            ranked = [("c3", 0.99), ("c1", 0.92), ("c2", 0.9), ("c4", 0.05)]
        elif query_vector == [0.0, 1.0]:
            ranked = [("c4", 0.98), ("c1", 0.05)]
        else:
            ranked = []

        results: list[SearchResult] = []
        for chunk_id, score in ranked:
            metadata = self.metadata_by_chunk.get(chunk_id, {})
            if filters and any(metadata.get(key) != value for key, value in filters.items()):
                continue
            results.append(SearchResult(chunk_id=chunk_id, score=score, metadata=metadata))
            if len(results) >= top_k:
                break
        return results


@pytest.fixture
def sample_index() -> GraphRAGIndex:
    return GraphRAGIndex.from_dict(
        {
            "nodes": [
                {"id": "doc:em", "title": "电磁场课件", "chunk_ids": []},
                {"id": "entity:maxwell", "title": "麦克斯韦方程组", "chunk_ids": ["c1", "c3"]},
                {"id": "entity:divergence", "title": "散度定理", "chunk_ids": ["c2", "c3"]},
                {"id": "entity:bridge", "title": "高斯定律联系", "chunk_ids": ["c3"]},
                {"id": "doc:qm", "title": "量子力学课件", "chunk_ids": []},
                {"id": "entity:quantum", "title": "量子态演化", "chunk_ids": ["c4"]},
            ],
            "chunks": [
                {
                    "id": "c1",
                    "text": "麦克斯韦方程组描述电场与磁场的基本关系。",
                    "source": "em_ch1.md",
                    "section": "麦克斯韦方程组",
                    "metadata": {"course_id": "em", "user_id": "student-1"},
                },
                {
                    "id": "c2",
                    "text": "散度定理把体积分与曲面积分联系起来。",
                    "source": "em_ch2.md",
                    "section": "散度定理",
                    "metadata": {"course_id": "em", "user_id": "student-1"},
                },
                {
                    "id": "c3",
                    "text": "利用散度定理可以把高斯定律从积分形式转为微分形式，从而连接到麦克斯韦方程组。",
                    "source": "em_ch3.md",
                    "section": "高斯定律与散度",
                    "metadata": {"course_id": "em", "user_id": "student-1"},
                },
                {
                    "id": "c4",
                    "text": "量子态演化由薛定谔方程支配。",
                    "source": "qm_ch1.md",
                    "section": "量子态演化",
                    "metadata": {"course_id": "qm", "user_id": "student-2"},
                },
            ],
            "edges": [
                {"source": "doc:em", "target": "entity:maxwell", "relation": "contains"},
                {"source": "doc:em", "target": "entity:divergence", "relation": "contains"},
                {"source": "entity:maxwell", "target": "entity:bridge", "relation": "connects"},
                {"source": "entity:divergence", "target": "entity:bridge", "relation": "supports"},
                {"source": "doc:qm", "target": "entity:quantum", "relation": "contains"},
            ],
        }
    )


@pytest.fixture
def retriever() -> GraphRAGRetriever:
    return GraphRAGRetriever()


@pytest.fixture
def fake_embedding() -> FakeEmbedding:
    return FakeEmbedding()


@pytest.fixture
def fake_vector_store(sample_index: GraphRAGIndex) -> FakeVectorStore:
    return FakeVectorStore({chunk_id: dict(chunk.metadata or {}) for chunk_id, chunk in sample_index.chunks.items()})


@pytest.mark.asyncio
async def test_retrieve_returns_ranked_sources_and_subgraph(
    retriever: GraphRAGRetriever,
    sample_index: GraphRAGIndex,
    fake_vector_store: FakeVectorStore,
    fake_embedding: FakeEmbedding,
) -> None:
    bundle = await retriever.retrieve(
        index=sample_index,
        vector_store=fake_vector_store,
        embedding=fake_embedding,
        query="散度定理和麦克斯韦方程组有什么联系？",
        course_id="em",
        user_id="student-1",
        user_role="student",
        final_top_k=3,
    )

    assert bundle.sources
    assert bundle.sources[0].chunk_id == "c3"
    assert bundle.subgraph.nodes
    assert bundle.subgraph.edges
    assert "## Retrieved Text Evidence" in bundle.assembled_context
    assert "## Knowledge Graph Community" in bundle.assembled_context
    assert "### Nodes" in bundle.graph_context_markdown


@pytest.mark.asyncio
async def test_course_filter_is_applied(
    retriever: GraphRAGRetriever,
    sample_index: GraphRAGIndex,
    fake_vector_store: FakeVectorStore,
    fake_embedding: FakeEmbedding,
) -> None:
    bundle = await retriever.retrieve(
        index=sample_index,
        vector_store=fake_vector_store,
        embedding=fake_embedding,
        query="量子态演化",
        course_id="qm",
    )

    assert [source.chunk_id for source in bundle.sources] == ["c4"]


@pytest.mark.asyncio
async def test_student_user_filter_is_applied(
    retriever: GraphRAGRetriever,
    sample_index: GraphRAGIndex,
    fake_vector_store: FakeVectorStore,
    fake_embedding: FakeEmbedding,
) -> None:
    denied = await retriever.retrieve(
        index=sample_index,
        vector_store=fake_vector_store,
        embedding=fake_embedding,
        query="量子态演化",
        course_id="qm",
        user_id="student-1",
        user_role="student",
    )
    allowed = await retriever.retrieve(
        index=sample_index,
        vector_store=fake_vector_store,
        embedding=fake_embedding,
        query="量子态演化",
        course_id="qm",
        user_id="student-2",
        user_role="student",
    )

    assert denied.sources == []
    assert denied.assembled_context == ""
    assert [source.chunk_id for source in allowed.sources] == ["c4"]


@pytest.mark.asyncio
async def test_seed_chunks_map_to_non_empty_community_subgraph(
    retriever: GraphRAGRetriever,
    sample_index: GraphRAGIndex,
    fake_vector_store: FakeVectorStore,
    fake_embedding: FakeEmbedding,
) -> None:
    bundle = await retriever.retrieve(
        index=sample_index,
        vector_store=fake_vector_store,
        embedding=fake_embedding,
        query="散度定理和麦克斯韦方程组的联系",
        course_id="em",
    )

    node_ids = {node.node_id for node in bundle.subgraph.nodes}
    assert "entity:bridge" in node_ids
    assert bundle.subgraph.community_ids


@pytest.mark.asyncio
async def test_subgraph_trimming_keeps_seed_nodes(
    retriever: GraphRAGRetriever,
    sample_index: GraphRAGIndex,
    fake_vector_store: FakeVectorStore,
    fake_embedding: FakeEmbedding,
) -> None:
    bundle = await retriever.retrieve(
        index=sample_index,
        vector_store=fake_vector_store,
        embedding=fake_embedding,
        query="量子态演化",
        course_id="qm",
        user_id="student-2",
        user_role="student",
        seed_top_k=1,
        final_top_k=1,
        community_top_k=1,
        subgraph_node_limit=1,
    )

    assert [node.node_id for node in bundle.subgraph.nodes] == ["entity:quantum"]


@pytest.mark.asyncio
async def test_empty_query_and_no_match_return_empty_bundle(
    retriever: GraphRAGRetriever,
    sample_index: GraphRAGIndex,
    fake_vector_store: FakeVectorStore,
    fake_embedding: FakeEmbedding,
) -> None:
    empty_query = await retriever.retrieve(
        index=sample_index,
        vector_store=fake_vector_store,
        embedding=fake_embedding,
        query="",
    )
    no_match = await retriever.retrieve(
        index=sample_index,
        vector_store=fake_vector_store,
        embedding=fake_embedding,
        query="完全不相关的问题",
    )

    assert empty_query.sources == []
    assert empty_query.assembled_context == ""
    assert no_match.sources == []
    assert no_match.assembled_context == ""
