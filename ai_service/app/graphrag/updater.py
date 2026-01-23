"""
Online index updater for GraphRAG.

Supports hot updates without service restart.
"""
from __future__ import annotations

import asyncio
import hashlib
import re
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

from .index import Chunk, GraphRAGIndex, Node, Edge

if TYPE_CHECKING:
    from .embedding import EmbeddingProvider
    from .vector_store import VectorStore


@dataclass
class Document:
    """Document to be indexed."""
    id: str
    content: str
    source: str  # e.g., "assignment:12345" or "docs/chapter1.md"
    course_id: str | None = None
    user_id: str | None = None
    doc_type: str = "markdown"  # markdown | assignment | faq


_HEADING_RE = re.compile(r"^(#{1,6})\s+(.*)$")


class IndexUpdater:
    """
    Online index updater for GraphRAG.
    
    Handles hot updates of both the graph index and vector store.
    """

    def __init__(
        self,
        index: GraphRAGIndex,
        vector_store: "VectorStore",
        embedding: "EmbeddingProvider",
        index_path: str | None = None,
        vector_path: str | None = None,
    ):
        self.index = index
        self.vector_store = vector_store
        self.embedding = embedding
        self.index_path = index_path
        self.vector_path = vector_path
        self._lock = asyncio.Lock()

    async def add_document(self, doc: Document) -> int:
        """
        Add a document to the index.
        
        Returns the number of chunks added.
        """
        async with self._lock:
            chunks = self._chunk_document(doc)
            if not chunks:
                return 0

            # Generate embeddings
            texts = [c.text for c in chunks]
            vectors = await self.embedding.embed_texts(texts)

            # Prepare metadata for vector store
            metadata = [
                {
                    "source": c.source,
                    "section": c.section,
                    "course_id": doc.course_id or "",
                    "user_id": doc.user_id or "",
                    "doc_id": doc.id,
                }
                for c in chunks
            ]

            # Add to vector store
            chunk_ids = [c.id for c in chunks]
            await self.vector_store.add(chunk_ids, vectors, metadata)

            # Update graph index
            self._update_graph(doc, chunks)

            # Persist if paths are set
            await self._persist()

            return len(chunks)

    async def remove_document(self, doc_id: str) -> int:
        """
        Remove a document from the index.
        
        Returns the number of chunks removed.
        """
        async with self._lock:
            # Find all chunks belonging to this document
            chunk_ids = [
                cid for cid, chunk in self.index.chunks.items()
                if chunk.source and chunk.source.startswith(f"doc:{doc_id}")
            ]

            if not chunk_ids:
                return 0

            # Remove from vector store
            await self.vector_store.delete(chunk_ids)

            # Remove from graph index
            self._prune_graph(doc_id, chunk_ids)

            # Persist if paths are set
            await self._persist()

            return len(chunk_ids)

    async def update_document(self, doc: Document) -> int:
        """
        Update a document in the index.
        
        Removes old chunks and adds new ones.
        """
        await self.remove_document(doc.id)
        return await self.add_document(doc)

    def _chunk_document(self, doc: Document) -> list[Chunk]:
        """Split document into chunks."""
        if doc.doc_type == "markdown":
            return self._chunk_markdown(doc)
        elif doc.doc_type == "assignment":
            return self._chunk_assignment(doc)
        elif doc.doc_type == "faq":
            return self._chunk_faq(doc)
        else:
            # Default: single chunk
            chunk_id = f"chunk:doc:{doc.id}:0"
            return [Chunk(
                id=chunk_id,
                text=doc.content,
                source=f"doc:{doc.id}",
                section=None,
            )]

    def _chunk_markdown(self, doc: Document) -> list[Chunk]:
        """Chunk markdown by headings."""
        lines = doc.content.splitlines()
        chunks: list[Chunk] = []
        current_title = "Document"
        buf: list[str] = []

        def flush(idx: int):
            nonlocal buf
            text = "\n".join(buf).strip()
            if text:
                chunk_id = f"chunk:doc:{doc.id}:{idx}"
                chunks.append(Chunk(
                    id=chunk_id,
                    text=text,
                    source=f"doc:{doc.id}",
                    section=current_title,
                ))
            buf = []

        chunk_idx = 0
        for line in lines:
            m = _HEADING_RE.match(line.strip())
            if m:
                flush(chunk_idx)
                chunk_idx += 1
                current_title = m.group(2).strip() or "Untitled"
                continue
            buf.append(line)

        flush(chunk_idx)
        return chunks

    def _chunk_assignment(self, doc: Document) -> list[Chunk]:
        """Chunk assignment content (single chunk with metadata)."""
        chunk_id = f"chunk:doc:{doc.id}:0"
        return [Chunk(
            id=chunk_id,
            text=doc.content,
            source=f"doc:{doc.id}",
            section="作业提交",
        )]

    def _chunk_faq(self, doc: Document) -> list[Chunk]:
        """Chunk FAQ (Q&A pairs)."""
        # Expect format: Q: ...\nA: ...
        chunks: list[Chunk] = []
        parts = re.split(r'\n(?=Q:)', doc.content)
        for i, part in enumerate(parts):
            if part.strip():
                chunk_id = f"chunk:doc:{doc.id}:{i}"
                chunks.append(Chunk(
                    id=chunk_id,
                    text=part.strip(),
                    source=f"doc:{doc.id}",
                    section="FAQ",
                ))
        return chunks

    def _update_graph(self, doc: Document, chunks: list[Chunk]):
        """Update graph index with new chunks."""
        # Create document node
        doc_node_id = f"doc:{doc.id}"
        doc_node = Node(
            id=doc_node_id,
            title=doc.source,
            chunk_ids=tuple(c.id for c in chunks),
        )

        # Update index (mutable copy needed)
        new_nodes = dict(self.index.nodes)
        new_chunks = dict(self.index.chunks)
        new_edges = list(self.index.edges)
        new_chunk_to_nodes = dict(self.index.chunk_to_nodes)
        new_node_neighbors = dict(self.index.node_neighbors)

        new_nodes[doc_node_id] = doc_node
        new_node_neighbors[doc_node_id] = ()

        for i, chunk in enumerate(chunks):
            new_chunks[chunk.id] = chunk
            new_chunk_to_nodes[chunk.id] = (doc_node_id,)

            # Create section nodes
            if chunk.section:
                sec_node_id = f"sec:{doc.id}:{i}"
                sec_node = Node(id=sec_node_id, title=chunk.section, chunk_ids=(chunk.id,))
                new_nodes[sec_node_id] = sec_node
                new_edges.append(Edge(source=doc_node_id, target=sec_node_id, relation="contains"))

                # Link adjacent sections
                if i > 0:
                    prev_sec_id = f"sec:{doc.id}:{i-1}"
                    new_edges.append(Edge(source=prev_sec_id, target=sec_node_id, relation="next"))

        # Rebuild index
        self.index = GraphRAGIndex(
            nodes=new_nodes,
            chunks=new_chunks,
            edges=tuple(new_edges),
            node_neighbors=self._rebuild_neighbors(new_nodes, new_edges),
            chunk_to_nodes=new_chunk_to_nodes,
        )

    def _prune_graph(self, doc_id: str, chunk_ids: list[str]):
        """Remove document and its chunks from graph."""
        doc_node_id = f"doc:{doc_id}"

        new_nodes = {k: v for k, v in self.index.nodes.items() if not k.startswith(f"doc:{doc_id}") and not k.startswith(f"sec:{doc_id}")}
        new_chunks = {k: v for k, v in self.index.chunks.items() if k not in chunk_ids}
        new_edges = [e for e in self.index.edges if not e.source.startswith(f"doc:{doc_id}") and not e.target.startswith(f"doc:{doc_id}")]
        new_chunk_to_nodes = {k: v for k, v in self.index.chunk_to_nodes.items() if k not in chunk_ids}

        self.index = GraphRAGIndex(
            nodes=new_nodes,
            chunks=new_chunks,
            edges=tuple(new_edges),
            node_neighbors=self._rebuild_neighbors(new_nodes, new_edges),
            chunk_to_nodes=new_chunk_to_nodes,
        )

    def _rebuild_neighbors(self, nodes: dict, edges: list) -> dict[str, tuple[str, ...]]:
        """Rebuild node neighbors map."""
        neighbors: dict[str, set[str]] = {nid: set() for nid in nodes}
        for e in edges:
            if e.source in neighbors:
                neighbors[e.source].add(e.target)
            if e.target in neighbors:
                neighbors[e.target].add(e.source)
        return {k: tuple(sorted(v)) for k, v in neighbors.items()}

    async def _persist(self):
        """Persist index and vector store to disk."""
        if self.vector_path:
            await self.vector_store.save(self.vector_path)

        if self.index_path:
            # Save graph index
            import json
            data = {
                "version": 2,
                "nodes": [
                    {"id": n.id, "title": n.title, "chunk_ids": list(n.chunk_ids)}
                    for n in self.index.nodes.values()
                ],
                "chunks": [
                    {"id": c.id, "text": c.text, "source": c.source, "section": c.section}
                    for c in self.index.chunks.values()
                ],
                "edges": [
                    {"source": e.source, "target": e.target, "relation": e.relation}
                    for e in self.index.edges
                ],
            }
            Path(self.index_path).write_text(
                json.dumps(data, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
