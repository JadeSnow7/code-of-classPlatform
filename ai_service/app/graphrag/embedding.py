"""
Embedding providers for GraphRAG.

Supports both API-based and local embeddings with async execution.
"""
from __future__ import annotations

import asyncio
import hashlib
import os
from abc import ABC, abstractmethod
from concurrent.futures import ThreadPoolExecutor
from typing import TYPE_CHECKING

import httpx

if TYPE_CHECKING:
    pass

_executor = ThreadPoolExecutor(max_workers=max(4, int(os.getenv("GRAPH_RAG_EXECUTOR_WORKERS", "8"))))


class EmbeddingProvider(ABC):
    """Abstract base class for embedding providers."""

    @abstractmethod
    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """Embed a list of texts into vectors."""
        ...

    @abstractmethod
    async def embed_query(self, query: str) -> list[float]:
        """Embed a single query text."""
        ...

    @property
    @abstractmethod
    def dimension(self) -> int:
        """Return the embedding dimension."""
        ...


class APIEmbedding(EmbeddingProvider):
    """
    Embedding provider using OpenAI-compatible API.
    
    Reuses the existing LLM API configuration.
    """

    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        model: str | None = None,
    ):
        """Initialize the API embedding provider."""
        self.base_url = (base_url or os.getenv("LLM_BASE_URL", "")).rstrip("/")
        self.api_key = api_key or os.getenv("LLM_API_KEY", "")
        self.model = model or os.getenv("EMBEDDING_MODEL", "text-embedding-v3")
        self._dimension: int | None = None

    @property
    def dimension(self) -> int:
        """Return the embedding dimension.

        Cached after the first call.
        """
        if self._dimension is None:
            # Default dimensions for common models
            model_dims = {
                "text-embedding-v3": 1024,
                "text-embedding-3-small": 1536,
                "text-embedding-3-large": 3072,
                "text-embedding-ada-002": 1536,
            }
            self._dimension = model_dims.get(self.model, 1024)
        return self._dimension

    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """Embed multiple texts via API."""
        if not texts:
            return []

        # Run in executor to avoid blocking event loop
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(_executor, self._sync_embed, texts)

    async def embed_query(self, query: str) -> list[float]:
        """Embed a single query."""
        results = await self.embed_texts([query])
        return results[0] if results else []

    def _sync_embed(self, texts: list[str]) -> list[list[float]]:
        """Synchronize the embedding call."""
        url = f"{self.base_url}/v1/embeddings"
        headers = {"Authorization": f"Bearer {self.api_key}"}
        payload = {"model": self.model, "input": texts}

        try:
            with httpx.Client(timeout=60.0) as client:
                resp = client.post(url, json=payload, headers=headers)
                resp.raise_for_status()
                data = resp.json()
                
                # Sort by index to ensure order matches input
                embeddings = sorted(data.get("data", []), key=lambda x: x.get("index", 0))
                result = [e.get("embedding", []) for e in embeddings]
                
                # Cache dimension from first result
                if result and self._dimension is None:
                    self._dimension = len(result[0])
                
                return result
        except httpx.HTTPError as e:
            raise RuntimeError(f"Embedding API error: {e}") from e


class LocalEmbedding(EmbeddingProvider):
    """
    Local embedding using sentence-transformers.
    
    Requires: pip install sentence-transformers
    """

    def __init__(self, model_name: str = "shibing624/text2vec-base-chinese"):
        """Initialize the local embedding provider."""
        self.model_name = model_name
        self._model = None
        self._dimension: int | None = None

    def _load_model(self):
        """Lazy load model."""
        if self._model is None:
            try:
                from sentence_transformers import SentenceTransformer
                self._model = SentenceTransformer(self.model_name)
                self._dimension = self._model.get_sentence_embedding_dimension()
            except ImportError as e:
                raise RuntimeError(
                    "sentence-transformers not installed. "
                    "Run: pip install sentence-transformers"
                ) from e
        return self._model

    @property
    def dimension(self) -> int:
        """Return embedding dimension."""
        if self._dimension is None:
            self._load_model()
        return self._dimension or 768

    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """Embed multiple texts using local model."""
        if not texts:
            return []
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(_executor, self._sync_embed, texts)

    async def embed_query(self, query: str) -> list[float]:
        """Embed a single query."""
        results = await self.embed_texts([query])
        return results[0] if results else []

    def _sync_embed(self, texts: list[str]) -> list[list[float]]:
        """Synchronize local embeddings."""
        model = self._load_model()
        embeddings = model.encode(texts, convert_to_numpy=True)
        return embeddings.tolist()


class HashEmbedding(EmbeddingProvider):
    """
    Deterministic local embeddings (no external model/API).

    Uses hashed character bigrams into a fixed-size vector, then L2-normalizes.
    Useful for smoke tests when no embedding API is available.
    """

    def __init__(self, dimension: int = 512):
        self._dimension = max(8, int(dimension))

    @property
    def dimension(self) -> int:
        return self._dimension

    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        return [self._embed_one(t) for t in texts]

    async def embed_query(self, query: str) -> list[float]:
        return self._embed_one(query)

    def _embed_one(self, text: str) -> list[float]:
        s = "".join((text or "").split()).lower()
        vec = [0.0] * self._dimension
        if len(s) < 2:
            return vec
        for i in range(len(s) - 1):
            bg = s[i : i + 2].encode("utf-8", errors="ignore")
            digest = hashlib.blake2b(bg, digest_size=8).digest()
            idx = int.from_bytes(digest, "big") % self._dimension
            vec[idx] += 1.0
        # Normalize
        norm = sum(v * v for v in vec) ** 0.5
        if norm > 0:
            vec = [v / norm for v in vec]
        return vec


def _route_upstream_value(name: str, route: str) -> str:
    route = route.lower()
    if route == "cloud":
        return os.getenv(f"{name}_CLOUD", "")
    return os.getenv(f"{name}_LOCAL", "") or os.getenv(name, "")


def get_embedding_provider(route: str = "local") -> EmbeddingProvider:
    """
    Return the configured embedding provider.

    Reads EMBEDDING_PROVIDER env var: 'api' (default) | 'local' | 'hash'.
    """
    route = route.lower()
    provider = (os.getenv(f"EMBEDDING_PROVIDER_{route.upper()}") or os.getenv("EMBEDDING_PROVIDER", "api")).lower()
    
    if provider == "local":
        model = os.getenv("EMBEDDING_MODEL", "shibing624/text2vec-base-chinese")
        return LocalEmbedding(model_name=model)
    if provider == "hash":
        dim_raw = os.getenv("EMBEDDING_HASH_DIM", "512").strip()
        try:
            dim = int(dim_raw)
        except ValueError:
            dim = 512
        return HashEmbedding(dimension=dim)

    base_url = _route_upstream_value("LLM_BASE_URL", route)
    api_key = _route_upstream_value("LLM_API_KEY", route)
    model = (
        os.getenv(f"EMBEDDING_MODEL_{route.upper()}")
        or os.getenv("EMBEDDING_MODEL")
        or "text-embedding-v3"
    )
    return APIEmbedding(base_url=base_url, api_key=api_key, model=model)
