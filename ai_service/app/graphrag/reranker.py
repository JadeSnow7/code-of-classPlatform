"""
Reranker abstraction for GraphRAG.

This phase only introduces extension points. Default behavior is unchanged.
"""
from __future__ import annotations

import os
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Sequence


@dataclass(frozen=True)
class RerankItem:
    """Candidate item for reranking."""

    chunk_id: str
    score: float
    metadata: dict[str, Any] = field(default_factory=dict)


class Reranker(ABC):
    """Abstract reranker interface."""

    @abstractmethod
    async def rerank(
        self,
        query: str,
        items: Sequence[RerankItem],
        *,
        top_k: int,
    ) -> list[RerankItem]:
        """Return reranked items."""
        ...


class NoopReranker(Reranker):
    """No-op reranker used for safe bootstrap."""

    async def rerank(
        self,
        query: str,
        items: Sequence[RerankItem],
        *,
        top_k: int,
    ) -> list[RerankItem]:
        del query
        return list(items[: max(0, top_k)])


def get_reranker() -> Reranker | None:
    """
    Return configured reranker instance.

    Controlled by:
    - RERANKER_ENABLED (default: false)
    - RERANKER_PROVIDER (default: noop)
    """
    enabled_raw = os.getenv("RERANKER_ENABLED", "false").strip().lower()
    if enabled_raw not in {"1", "true", "yes", "y", "on"}:
        return None

    provider = os.getenv("RERANKER_PROVIDER", "noop").strip().lower()
    if provider == "noop":
        return NoopReranker()
    raise ValueError(f"Unknown reranker provider: {provider}")

