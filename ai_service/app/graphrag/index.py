from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


@dataclass(frozen=True)
class Chunk:
    id: str
    text: str
    source: str | None = None
    section: str | None = None
    metadata: dict[str, Any] | None = None  # For ACL: course_id, user_id, doc_type


@dataclass(frozen=True)
class Node:
    id: str
    title: str
    chunk_ids: tuple[str, ...] = ()


@dataclass(frozen=True)
class Edge:
    source: str
    target: str
    relation: str = "related"


@dataclass
class GraphRAGIndex:
    nodes: dict[str, Node]
    chunks: dict[str, Chunk]
    edges: tuple[Edge, ...]

    # Derived maps for retrieval
    node_neighbors: dict[str, tuple[str, ...]]
    chunk_to_nodes: dict[str, tuple[str, ...]]

    @staticmethod
    def from_dict(data: dict[str, Any]) -> "GraphRAGIndex":
        nodes_list = data.get("nodes", [])
        chunks_list = data.get("chunks", [])
        edges_list = data.get("edges", [])

        nodes: dict[str, Node] = {}
        for n in nodes_list:
            if not isinstance(n, dict):
                continue
            node_id = str(n.get("id", "")).strip()
            title = str(n.get("title", "")).strip()
            if not node_id or not title:
                continue
            chunk_ids_raw = n.get("chunk_ids", [])
            chunk_ids: list[str] = []
            if isinstance(chunk_ids_raw, list):
                for cid in chunk_ids_raw:
                    cid = str(cid).strip()
                    if cid:
                        chunk_ids.append(cid)
            nodes[node_id] = Node(id=node_id, title=title, chunk_ids=tuple(chunk_ids))

        chunks: dict[str, Chunk] = {}
        for ch in chunks_list:
            if not isinstance(ch, dict):
                continue
            chunk_id = str(ch.get("id", "")).strip()
            text = str(ch.get("text", "")).strip()
            if not chunk_id or not text:
                continue
            source = ch.get("source")
            section = ch.get("section")
            # Extract metadata for ACL filtering
            metadata = ch.get("metadata")
            if metadata is not None and not isinstance(metadata, dict):
                metadata = None
            chunks[chunk_id] = Chunk(
                id=chunk_id,
                text=text,
                source=str(source).strip() if source else None,
                section=str(section).strip() if section else None,
                metadata=metadata,
            )

        edges: list[Edge] = []
        for e in edges_list:
            if not isinstance(e, dict):
                continue
            src = str(e.get("source", "")).strip()
            tgt = str(e.get("target", "")).strip()
            if not src or not tgt:
                continue
            relation = str(e.get("relation", "related")).strip() or "related"
            edges.append(Edge(source=src, target=tgt, relation=relation))

        node_neighbors: dict[str, set[str]] = {nid: set() for nid in nodes}
        for e in edges:
            if e.source in node_neighbors:
                node_neighbors[e.source].add(e.target)
            if e.target in node_neighbors:
                node_neighbors[e.target].add(e.source)

        chunk_to_nodes: dict[str, list[str]] = {}
        for node in nodes.values():
            for cid in node.chunk_ids:
                chunk_to_nodes.setdefault(cid, []).append(node.id)

        return GraphRAGIndex(
            nodes=nodes,
            chunks=chunks,
            edges=tuple(edges),
            node_neighbors={k: tuple(sorted(v)) for k, v in node_neighbors.items()},
            chunk_to_nodes={k: tuple(v) for k, v in chunk_to_nodes.items()},
        )

    @staticmethod
    def load(path: str | Path) -> "GraphRAGIndex":
        p = Path(path)
        data = json.loads(p.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            raise ValueError("index json must be an object")
        return GraphRAGIndex.from_dict(data)

    def iter_chunks(self, chunk_ids: Iterable[str]) -> Iterable[Chunk]:
        for cid in chunk_ids:
            ch = self.chunks.get(cid)
            if ch:
                yield ch

