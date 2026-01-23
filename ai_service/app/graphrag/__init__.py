"""
Lightweight GraphRAG utilities (offline index + online retrieval).

Extended with:
- Embedding support (API and local models)
- Vector store (FAISS with metadata filtering)
- Hybrid retrieval (keyword + semantic with RRF)
- Online index updates
"""

from .index import GraphRAGIndex, Chunk, Node, Edge
from .retrieve import (
    build_rag_context,
    build_rag_context_hybrid,
    RetrievalContext,
    RetrievedChunk,
)
from .embedding import get_embedding_provider, EmbeddingProvider, APIEmbedding, LocalEmbedding
from .vector_store import get_vector_store, VectorStore, FAISSStore, SearchResult
from .updater import IndexUpdater, Document

__all__ = [
    # Index
    "GraphRAGIndex",
    "Chunk",
    "Node",
    "Edge",
    # Retrieval
    "build_rag_context",
    "build_rag_context_hybrid",
    "RetrievalContext",
    "RetrievedChunk",
    # Embedding
    "get_embedding_provider",
    "EmbeddingProvider",
    "APIEmbedding",
    "LocalEmbedding",
    # Vector Store
    "get_vector_store",
    "VectorStore",
    "FAISSStore",
    "SearchResult",
    # Updater
    "IndexUpdater",
    "Document",
]
