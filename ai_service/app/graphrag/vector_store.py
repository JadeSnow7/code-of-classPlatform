"""
Vector store implementations for GraphRAG.

Supports FAISS with metadata filtering for ACL.
"""
from __future__ import annotations

import asyncio
import json
import os
from abc import ABC, abstractmethod
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

_executor = ThreadPoolExecutor(max_workers=2)


@dataclass
class SearchResult:
    """Result from vector search."""
    chunk_id: str
    score: float
    metadata: dict = field(default_factory=dict)


class VectorStore(ABC):
    """Abstract base class for vector stores."""

    @abstractmethod
    async def add(
        self,
        ids: list[str],
        vectors: list[list[float]],
        metadata: list[dict],
    ) -> None:
        """Add vectors with metadata."""
        ...

    @abstractmethod
    async def search(
        self,
        query_vector: list[float],
        top_k: int = 10,
        filters: dict | None = None,
    ) -> list[SearchResult]:
        """Search for similar vectors with optional filters."""
        ...

    @abstractmethod
    async def delete(self, ids: list[str]) -> int:
        """Delete vectors by ID. Returns count of deleted."""
        ...

    @abstractmethod
    async def save(self, path: str) -> None:
        """Persist the store to disk."""
        ...

    @abstractmethod
    async def load(self, path: str) -> None:
        """Load the store from disk."""
        ...


class FAISSStore(VectorStore):
    """
    FAISS-based vector store with metadata filtering.
    
    Metadata is stored separately and used for ACL filtering.
    """

    def __init__(self, dimension: int = 1024):
        self.dimension = dimension
        self._index = None
        self._id_to_idx: dict[str, int] = {}  # chunk_id -> faiss index
        self._idx_to_id: dict[int, str] = {}  # faiss index -> chunk_id
        self._metadata: dict[str, dict] = {}  # chunk_id -> metadata
        self._vectors: list[list[float]] = []  # stored for rebuilding
        self._next_idx = 0

    def _ensure_index(self):
        """Lazy initialize FAISS index."""
        if self._index is None:
            try:
                import faiss
                self._index = faiss.IndexFlatIP(self.dimension)  # Inner product
            except ImportError as e:
                raise RuntimeError(
                    "faiss-cpu not installed. Run: pip install faiss-cpu"
                ) from e
        return self._index

    async def add(
        self,
        ids: list[str],
        vectors: list[list[float]],
        metadata: list[dict],
    ) -> None:
        """Add vectors with metadata."""
        if not ids:
            return
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            _executor, self._sync_add, ids, vectors, metadata
        )

    def _sync_add(
        self,
        ids: list[str],
        vectors: list[list[float]],
        metadata: list[dict],
    ) -> None:
        """Synchronous add."""
        import numpy as np

        index = self._ensure_index()
        
        # Normalize vectors for cosine similarity
        vecs = np.array(vectors, dtype=np.float32)
        norms = np.linalg.norm(vecs, axis=1, keepdims=True)
        norms = np.where(norms == 0, 1, norms)
        vecs = vecs / norms

        for i, (chunk_id, vec, meta) in enumerate(zip(ids, vecs, metadata)):
            if chunk_id in self._id_to_idx:
                # Update existing
                old_idx = self._id_to_idx[chunk_id]
                self._vectors[old_idx] = vec.tolist()
                self._metadata[chunk_id] = meta
            else:
                # Add new
                idx = self._next_idx
                self._id_to_idx[chunk_id] = idx
                self._idx_to_id[idx] = chunk_id
                self._metadata[chunk_id] = meta
                self._vectors.append(vec.tolist())
                self._next_idx += 1

        # Rebuild index (FAISS doesn't support update in place for FlatIP)
        self._rebuild_index()

    def _rebuild_index(self):
        """Rebuild FAISS index from stored vectors."""
        import numpy as np

        if not self._vectors:
            return

        index = self._ensure_index()
        index.reset()
        vecs = np.array(self._vectors, dtype=np.float32)
        index.add(vecs)

    async def search(
        self,
        query_vector: list[float],
        top_k: int = 10,
        filters: dict | None = None,
    ) -> list[SearchResult]:
        """Search with optional ACL filters."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            _executor, self._sync_search, query_vector, top_k, filters
        )

    def _sync_search(
        self,
        query_vector: list[float],
        top_k: int,
        filters: dict | None,
    ) -> list[SearchResult]:
        """Synchronous search with filtering."""
        import numpy as np

        if self._index is None or self._index.ntotal == 0:
            return []

        # Normalize query
        query = np.array([query_vector], dtype=np.float32)
        norm = np.linalg.norm(query)
        if norm > 0:
            query = query / norm

        # Search more than needed to allow for filtering
        search_k = min(top_k * 10, self._index.ntotal)
        scores, indices = self._index.search(query, search_k)

        results: list[SearchResult] = []
        for score, idx in zip(scores[0], indices[0]):
            if idx < 0:
                continue
            chunk_id = self._idx_to_id.get(idx)
            if not chunk_id:
                continue

            meta = self._metadata.get(chunk_id, {})

            # Apply ACL filters
            if filters:
                match = True
                for key, value in filters.items():
                    if meta.get(key) != value:
                        match = False
                        break
                if not match:
                    continue

            results.append(SearchResult(
                chunk_id=chunk_id,
                score=float(score),
                metadata=meta,
            ))

            if len(results) >= top_k:
                break

        return results

    async def delete(self, ids: list[str]) -> int:
        """Delete vectors by ID."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(_executor, self._sync_delete, ids)

    def _sync_delete(self, ids: list[str]) -> int:
        """Synchronous delete."""
        deleted = 0
        for chunk_id in ids:
            if chunk_id in self._id_to_idx:
                idx = self._id_to_idx[chunk_id]
                del self._id_to_idx[chunk_id]
                del self._idx_to_id[idx]
                del self._metadata[chunk_id]
                # Mark vector as deleted (will be cleaned on rebuild)
                if idx < len(self._vectors):
                    self._vectors[idx] = [0.0] * self.dimension
                deleted += 1

        if deleted > 0:
            # Compact and rebuild
            self._compact()

        return deleted

    def _compact(self):
        """Remove deleted entries and rebuild index."""
        new_vectors = []
        new_id_to_idx = {}
        new_idx_to_id = {}

        for chunk_id in self._id_to_idx:
            old_idx = self._id_to_idx[chunk_id]
            new_idx = len(new_vectors)
            new_vectors.append(self._vectors[old_idx])
            new_id_to_idx[chunk_id] = new_idx
            new_idx_to_id[new_idx] = chunk_id

        self._vectors = new_vectors
        self._id_to_idx = new_id_to_idx
        self._idx_to_id = new_idx_to_id
        self._next_idx = len(new_vectors)
        self._rebuild_index()

    async def save(self, path: str) -> None:
        """Save index and metadata to disk."""
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(_executor, self._sync_save, path)

    def _sync_save(self, path: str) -> None:
        """Synchronous save."""
        import faiss

        p = Path(path)
        p.mkdir(parents=True, exist_ok=True)

        # Save FAISS index
        if self._index is not None:
            faiss.write_index(self._index, str(p / "index.faiss"))

        # Save metadata
        meta = {
            "dimension": self.dimension,
            "id_to_idx": self._id_to_idx,
            "idx_to_id": {str(k): v for k, v in self._idx_to_id.items()},
            "metadata": self._metadata,
            "vectors": self._vectors,
            "next_idx": self._next_idx,
        }
        (p / "meta.json").write_text(
            json.dumps(meta, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    async def load(self, path: str) -> None:
        """Load index and metadata from disk."""
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(_executor, self._sync_load, path)

    def _sync_load(self, path: str) -> None:
        """Synchronous load."""
        import faiss

        p = Path(path)
        if not p.exists():
            return

        # Load FAISS index
        index_path = p / "index.faiss"
        if index_path.exists():
            self._index = faiss.read_index(str(index_path))

        # Load metadata
        meta_path = p / "meta.json"
        if meta_path.exists():
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            self.dimension = meta.get("dimension", 1024)
            self._id_to_idx = meta.get("id_to_idx", {})
            self._idx_to_id = {int(k): v for k, v in meta.get("idx_to_id", {}).items()}
            self._metadata = meta.get("metadata", {})
            self._vectors = meta.get("vectors", [])
            self._next_idx = meta.get("next_idx", 0)

    def count(self) -> int:
        """Return number of vectors in store."""
        return len(self._id_to_idx)


def get_vector_store(dimension: int = 1024) -> VectorStore:
    """Factory function to get vector store."""
    store_type = os.getenv("VECTOR_STORE_TYPE", "faiss").lower()
    
    if store_type == "faiss":
        return FAISSStore(dimension=dimension)
    else:
        raise ValueError(f"Unknown vector store type: {store_type}")
