"""GraphRAG runtime/cache helpers used by modular services."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from app.core.routing import RouteLevel, _get_env
from app.graphrag.embedding import EmbeddingProvider, get_embedding_provider
from app.graphrag.index import GraphRAGIndex
from app.graphrag.updater import IndexUpdater
from app.graphrag.vector_store import VectorStore, get_vector_store

_embedding_providers: dict[str, EmbeddingProvider] = {}
_vector_stores: dict[str, VectorStore] = {}
_index_updater: IndexUpdater | None = None


@lru_cache(maxsize=4)
def _load_graphrag_index(path: str) -> GraphRAGIndex | None:
    try:
        if not path:
            return None
        return GraphRAGIndex.load(path)
    except Exception:
        return None


def _embedding_route(route: RouteLevel | Literal["local", "cloud"]) -> Literal["local", "cloud"]:
    return "cloud" if route == "cloud" else "local"


def _vector_store_path(upstream: Literal["local", "cloud"]) -> str:
    if upstream == "cloud":
        return _get_env("VECTOR_STORE_PATH_CLOUD") or _get_env("VECTOR_STORE_PATH") or "app/data/vector_index"
    return _get_env("VECTOR_STORE_PATH_LOCAL") or _get_env("VECTOR_STORE_PATH") or "app/data/vector_index"


def _get_embedding(route: RouteLevel | Literal["local", "cloud"] = "local") -> EmbeddingProvider:
    upstream = _embedding_route(route)
    provider = _embedding_providers.get(upstream)
    if provider is None:
        provider = get_embedding_provider(route=upstream)
        _embedding_providers[upstream] = provider
    return provider


def _get_vector_store(route: RouteLevel | Literal["local", "cloud"] = "local") -> VectorStore:
    upstream = _embedding_route(route)
    store = _vector_stores.get(upstream)
    if store is None:
        embedding = _get_embedding(upstream)
        store = get_vector_store(dimension=embedding.dimension)
        vector_path = _vector_store_path(upstream)
        import asyncio

        try:
            asyncio.get_event_loop().run_until_complete(store.load(vector_path))
        except Exception:
            pass
        _vector_stores[upstream] = store
    return store


def _get_index_updater(index: GraphRAGIndex) -> IndexUpdater:
    global _index_updater
    if _index_updater is None:
        _index_updater = IndexUpdater(
            index=index,
            vector_store=_get_vector_store("local"),
            embedding=_get_embedding("local"),
            index_path=_get_env("GRAPH_RAG_INDEX_PATH") or "app/data/graphrag_index.json",
            vector_path=_get_env("VECTOR_STORE_PATH") or "app/data/vector_index",
        )
    return _index_updater


def invalidate_graphrag_cache() -> None:
    global _index_updater
    _load_graphrag_index.cache_clear()
    _index_updater = None
    _embedding_providers.clear()
    _vector_stores.clear()


def _build_graphrag_system_message(context: str) -> str:
    return (
        "以下是从课程知识库检索到的片段（带编号与来源）。\n"
        "回答要求：\n"
        "1) 优先基于片段作答；如果片段不足以支撑结论，请明确说明“不足以从知识库确定”，并给出需要补充的信息。\n"
        "2) 用 [编号] 标注你依据的片段，例如 [1][3]。\n"
        "3) 不要编造不存在的引用。\n\n"
        "{0}".format(context)
    ).strip()


__all__ = [
    "_load_graphrag_index",
    "_embedding_route",
    "_vector_store_path",
    "_get_embedding",
    "_get_vector_store",
    "_get_index_updater",
    "invalidate_graphrag_cache",
    "_build_graphrag_system_message",
]
