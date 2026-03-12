from __future__ import annotations

from app.graphrag_neo4j.rrf import RRFConfig, RankedSource, fuse_dense_graph_rrf
from app.graphrag_neo4j.types import AnchorHit


def _hit(node_id: str, score: float) -> AnchorHit:
    return AnchorHit(node_id=node_id, label="Formula", score=score, title=node_id, text="")


def test_rrf_fuses_dense_and_graph_stably() -> None:
    ranked = fuse_dense_graph_rrf(
        dense_sources=[RankedSource(name="dense", hits=[_hit("a", 0.9), _hit("b", 0.8)])],
        graph_sources=[RankedSource(name="graph", hits=[_hit("a", 0.7), _hit("b", 0.6)])],
        config=RRFConfig(k=50, top_k=2),
    )
    assert [item.node_id for item in ranked] == ["a", "b"]


def test_rrf_degrades_to_single_channel_when_graph_empty() -> None:
    ranked = fuse_dense_graph_rrf(
        dense_sources=[RankedSource(name="dense", hits=[_hit("a", 0.9), _hit("b", 0.8)])],
        graph_sources=[],
        config=RRFConfig(k=50, top_k=2),
    )
    assert [item.node_id for item in ranked] == ["a", "b"]
