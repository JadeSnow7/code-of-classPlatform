"""RRF helpers for multi-source GraphRAG anchor fusion."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

from app.graphrag_neo4j.types import AnchorHit

if hasattr(dataclass, "__call__"):
    try:
        _rrf_dataclass = dataclass(slots=True)
    except TypeError:  # pragma: no cover - Python < 3.10
        _rrf_dataclass = dataclass
else:  # pragma: no cover
    _rrf_dataclass = dataclass


@_rrf_dataclass
class RankedSource:
    name: str
    hits: Sequence[AnchorHit]
    weight: float = 1.0


@_rrf_dataclass
class RRFConfig:
    k: int = 50
    top_k: int = 8
    dense_weight: float = 1.0
    graph_weight: float = 1.15

    def normalized(self) -> "RRFConfig":
        self.k = max(1, int(self.k))
        self.top_k = max(1, int(self.top_k))
        self.dense_weight = max(0.0, float(self.dense_weight))
        self.graph_weight = max(0.0, float(self.graph_weight))
        return self


def _flatten_sources(sources: Sequence[RankedSource], *, k: int) -> list[AnchorHit]:
    merged: dict[str, dict[str, object]] = {}
    for source in sources:
        if not source.hits:
            continue
        source_weight = max(0.0, float(source.weight))
        for rank, hit in enumerate(source.hits, start=1):
            if not hit.node_id:
                continue
            row = merged.setdefault(
                hit.node_id,
                {
                    "best_hit": hit.model_copy(deep=True),
                    "score": 0.0,
                    "best_rank": rank,
                    "match_count": 0,
                },
            )
            row["score"] = float(row["score"]) + (source_weight / (k + rank))
            row["best_rank"] = min(int(row["best_rank"]), rank)
            row["match_count"] = int(row["match_count"]) + 1
            best_hit = row["best_hit"]
            if isinstance(best_hit, AnchorHit) and hit.score > best_hit.score:
                row["best_hit"] = hit.model_copy(deep=True)

    ranked_rows = sorted(
        merged.values(),
        key=lambda item: (
            -float(item["score"]),
            -int(item["match_count"]),
            int(item["best_rank"]),
            item["best_hit"].node_id if isinstance(item["best_hit"], AnchorHit) else "",
        ),
    )
    return [
        item["best_hit"].model_copy(update={"score": round(float(item["score"]), 8)})
        for item in ranked_rows
        if isinstance(item["best_hit"], AnchorHit)
    ]


def fuse_dense_graph_rrf(
    *,
    dense_sources: Sequence[RankedSource],
    graph_sources: Sequence[RankedSource],
    config: RRFConfig | None = None,
) -> list[AnchorHit]:
    cfg = (config or RRFConfig()).normalized()
    dense_ranked = _flatten_sources(dense_sources, k=cfg.k)
    graph_ranked = _flatten_sources(graph_sources, k=cfg.k)

    if not dense_ranked and not graph_ranked:
        return []
    if not dense_ranked:
        return graph_ranked[: cfg.top_k]
    if not graph_ranked:
        return dense_ranked[: cfg.top_k]

    merged: dict[str, dict[str, object]] = {}

    def add_channel(hits: Sequence[AnchorHit], *, channel_weight: float) -> None:
        for rank, hit in enumerate(hits, start=1):
            row = merged.setdefault(
                hit.node_id,
                {
                    "best_hit": hit.model_copy(deep=True),
                    "score": 0.0,
                    "best_rank": rank,
                    "channels": 0,
                },
            )
            row["score"] = float(row["score"]) + (channel_weight / (cfg.k + rank))
            row["best_rank"] = min(int(row["best_rank"]), rank)
            row["channels"] = int(row["channels"]) + 1
            best_hit = row["best_hit"]
            if isinstance(best_hit, AnchorHit) and hit.score > best_hit.score:
                row["best_hit"] = hit.model_copy(deep=True)

    add_channel(dense_ranked, channel_weight=cfg.dense_weight)
    add_channel(graph_ranked, channel_weight=cfg.graph_weight)

    ranked_rows = sorted(
        merged.values(),
        key=lambda item: (
            -float(item["score"]),
            -int(item["channels"]),
            int(item["best_rank"]),
            item["best_hit"].node_id if isinstance(item["best_hit"], AnchorHit) else "",
        ),
    )
    return [
        item["best_hit"].model_copy(update={"score": round(float(item["score"]), 8)})
        for item in ranked_rows[: cfg.top_k]
        if isinstance(item["best_hit"], AnchorHit)
    ]
