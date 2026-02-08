"""
Offline ingestion CLI for GraphRAG.

Builds:
- Graph index JSON (GraphRAGIndex.load compatible)
- Optional FAISS vector store directory

Supports inputs:
- Markdown (.md/.markdown) via heading-based sections
- PDF (.pdf) via page text extraction
- Plain text (.txt) as a single section
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

from .embedding import (
    APIEmbedding,
    EmbeddingProvider,
    HashEmbedding,
    LocalEmbedding,
    get_embedding_provider,
)
from .vector_store import VectorStore, get_vector_store


_HEADING_RE = re.compile(r"^(#{1,6})\s+(.*)$")


@dataclass(frozen=True)
class _Section:
    level: int
    title: str
    text: str


def _load_env_file(path: Path) -> int:
    """
    Minimal .env loader.

    - Ignores blank lines and comments
    - Supports KEY=VALUE with optional single/double quotes
    - Does not override existing environment variables
    """
    if not path.exists():
        return 0

    loaded = 0
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if not key:
            continue
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        if key not in os.environ:
            os.environ[key] = value
            loaded += 1
    return loaded


def _auto_load_env() -> Path | None:
    candidates = [
        Path.cwd() / ".env",
        Path.cwd().parent / ".env",
    ]
    for p in candidates:
        if p.exists():
            _load_env_file(p)
            return p
    return None


def _rel_source(path: Path, root: Path | None) -> str:
    if root is not None:
        try:
            return str(path.resolve().relative_to(root.resolve())).replace("\\", "/")
        except ValueError:
            pass
    return path.name


def _parse_markdown_sections(md: str) -> list[_Section]:
    lines = md.splitlines()
    sections: list[_Section] = []
    current_level = 1
    current_title = "Document"
    buf: list[str] = []

    def flush() -> None:
        nonlocal buf
        text = "\n".join(buf).strip()
        if text:
            sections.append(_Section(level=current_level, title=current_title, text=text))
        buf = []

    for line in lines:
        m = _HEADING_RE.match(line.strip())
        if m:
            flush()
            current_level = len(m.group(1))
            current_title = m.group(2).strip() or "Untitled"
            continue
        buf.append(line)

    flush()
    return sections


def _split_text(text: str, *, max_chars: int) -> list[str]:
    if max_chars <= 0:
        return [text.strip()] if text.strip() else []

    normalized = text.replace("\r\n", "\n").replace("\r", "\n").strip()
    if not normalized:
        return []

    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", normalized) if p.strip()]
    if not paragraphs:
        return []

    chunks: list[str] = []
    buf: list[str] = []
    buf_len = 0

    def flush() -> None:
        nonlocal buf, buf_len
        if buf:
            chunks.append("\n\n".join(buf).strip())
            buf = []
            buf_len = 0

    for para in paragraphs:
        if not buf:
            if len(para) <= max_chars:
                buf = [para]
                buf_len = len(para)
                continue
            # Oversized paragraph: hard-split
            start = 0
            while start < len(para):
                piece = para[start : start + max_chars].strip()
                if piece:
                    chunks.append(piece)
                start += max_chars
            continue

        if buf_len + 2 + len(para) <= max_chars:
            buf.append(para)
            buf_len += 2 + len(para)
            continue

        flush()
        if len(para) <= max_chars:
            buf = [para]
            buf_len = len(para)
        else:
            start = 0
            while start < len(para):
                piece = para[start : start + max_chars].strip()
                if piece:
                    chunks.append(piece)
                start += max_chars

    flush()
    return [c for c in chunks if c.strip()]


def _extract_pdf_pages(path: Path) -> list[str]:
    try:
        from pypdf import PdfReader
    except ImportError as e:
        raise RuntimeError(
            "Missing dependency for PDF ingestion: pypdf. "
            "Install it with: pip install pypdf"
        ) from e

    reader = PdfReader(str(path))
    pages: list[str] = []
    for page in reader.pages:
        try:
            text = page.extract_text() or ""
        except Exception:
            text = ""
        pages.append(text)
    return pages


def _sections_for_file(path: Path) -> list[_Section]:
    suffix = path.suffix.lower()
    if suffix in {".md", ".markdown"}:
        return _parse_markdown_sections(path.read_text(encoding="utf-8"))
    if suffix == ".pdf":
        pages = _extract_pdf_pages(path)
        sections: list[_Section] = []
        for i, text in enumerate(pages, start=1):
            t = (text or "").strip()
            if not t:
                continue
            sections.append(_Section(level=1, title=f"Page {i}", text=t))
        return sections
    if suffix == ".txt":
        t = path.read_text(encoding="utf-8").strip()
        return [_Section(level=1, title="Document", text=t)] if t else []

    # Fallback: attempt to read as text
    try:
        t = path.read_text(encoding="utf-8").strip()
    except Exception:
        t = ""
    return [_Section(level=1, title="Document", text=t)] if t else []


def _collect_input_files(inputs: list[Path]) -> list[Path]:
    supported_ext = {".md", ".markdown", ".pdf", ".txt"}
    files: list[Path] = []
    for p in inputs:
        if p.is_file():
            files.append(p)
            continue
        if p.is_dir():
            for fp in p.rglob("*"):
                if fp.is_file() and fp.suffix.lower() in supported_ext:
                    files.append(fp)
    return sorted({f.resolve() for f in files}, key=lambda x: str(x))


def _get_embedding_provider(mode: str, *, hash_dim: int) -> EmbeddingProvider | None:
    mode = (mode or "env").strip().lower()
    if mode == "none":
        return None
    if mode == "hash":
        return HashEmbedding(dimension=hash_dim)
    if mode == "api":
        return APIEmbedding()
    if mode == "local":
        model = os.getenv("EMBEDDING_MODEL", "shibing624/text2vec-base-chinese")
        return LocalEmbedding(model_name=model)
    return get_embedding_provider()


def build_index_from_files(
    files: list[Path],
    *,
    root: Path | None,
    chunk_chars: int,
    course_id: str | None,
    user_id: str | None,
) -> tuple[dict[str, Any], list[str], list[str], list[dict[str, Any]]]:
    nodes: list[dict[str, Any]] = []
    chunks: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []

    embed_ids: list[str] = []
    embed_texts: list[str] = []
    embed_meta: list[dict[str, Any]] = []

    for file_path in files:
        source = _rel_source(file_path, root)
        file_node_id = f"file:{source}"
        nodes.append({"id": file_node_id, "title": source, "chunk_ids": []})

        sections = _sections_for_file(file_path)
        if not sections:
            continue

        for sec_idx, sec in enumerate(sections):
            sec_node_id = f"sec:{source}:{sec_idx}"
            sec_chunk_ids: list[str] = []

            sub_chunks = _split_text(sec.text, max_chars=chunk_chars)
            if not sub_chunks:
                continue

            for ch_idx, ch_text in enumerate(sub_chunks):
                chunk_id = f"chunk:{source}:{sec_idx}:{ch_idx}"

                metadata = {
                    "source": source,
                    "section": sec.title,
                    "doc_id": file_node_id,
                    "course_id": course_id or "",
                    "user_id": user_id or "",
                }

                chunks.append(
                    {
                        "id": chunk_id,
                        "text": ch_text,
                        "source": source,
                        "section": sec.title,
                        "metadata": metadata,
                    }
                )
                sec_chunk_ids.append(chunk_id)

                embed_ids.append(chunk_id)
                embed_texts.append(ch_text)
                embed_meta.append(metadata)

            nodes.append({"id": sec_node_id, "title": sec.title, "chunk_ids": sec_chunk_ids})
            edges.append({"source": file_node_id, "target": sec_node_id, "relation": "contains"})
            if sec_idx > 0:
                prev_sec_id = f"sec:{source}:{sec_idx - 1}"
                edges.append({"source": prev_sec_id, "target": sec_node_id, "relation": "next"})

    index = {"version": 1, "nodes": nodes, "chunks": chunks, "edges": edges}
    return index, embed_ids, embed_texts, embed_meta


def _batch_iter(items: list[Any], batch_size: int) -> Iterable[list[Any]]:
    if batch_size <= 0:
        yield items
        return
    for i in range(0, len(items), batch_size):
        yield items[i : i + batch_size]


async def _embed_all(
    embedding: EmbeddingProvider,
    *,
    texts: list[str],
    batch_size: int,
) -> list[list[float]]:
    vectors: list[list[float]] = []
    total = len(texts)

    done = 0
    for batch in _batch_iter(texts, batch_size):
        vecs = await embedding.embed_texts(batch)
        if len(vecs) != len(batch):
            raise RuntimeError("Embedding count mismatch")
        vectors.extend(vecs)
        done += len(batch)
        print(f"[graphrag] embedded {done}/{total}")

    return vectors


async def main_async(args: argparse.Namespace) -> int:
    env_path = None
    if args.env_file:
        env_path = Path(args.env_file).expanduser().resolve()
        _load_env_file(env_path)
    else:
        env_path = _auto_load_env()

    input_paths = [Path(p).expanduser() for p in args.inputs]
    files = _collect_input_files(input_paths)
    if not files:
        raise SystemExit("No input files found (supported: .md/.markdown/.pdf/.txt)")

    root = Path(args.root).expanduser().resolve() if args.root else None
    output_index = Path(args.output_index).expanduser().resolve()
    output_vector = Path(args.output_vector).expanduser().resolve()

    index, ids, texts, meta = build_index_from_files(
        files,
        root=root,
        chunk_chars=args.chunk_chars,
        course_id=args.course_id,
        user_id=args.user_id,
    )

    output_index.parent.mkdir(parents=True, exist_ok=True)
    output_index.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"[graphrag] index saved: {output_index}")
    print(f"[graphrag] files={len(files)} chunks={len(ids)} nodes={len(index.get('nodes', []))} edges={len(index.get('edges', []))}")

    embedding = _get_embedding_provider(args.embeddings, hash_dim=args.hash_dim)
    if embedding is None:
        print("[graphrag] vectors skipped (--embeddings=none)")
        return 0

    vectors = await _embed_all(embedding, texts=texts, batch_size=args.batch_size)
    dim = len(vectors[0]) if vectors else embedding.dimension

    vector_store = get_vector_store(dimension=dim)
    await vector_store.add(ids, vectors, meta)

    await vector_store.save(str(output_vector))
    print(f"[graphrag] vector store saved: {output_vector} (count={getattr(vector_store, 'count', lambda: '?')()})")
    if env_path:
        print(f"[graphrag] env loaded: {env_path}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Build GraphRAG index + (optional) vector store from files.")
    ap.add_argument("--inputs", nargs="+", required=True, help="Input file(s) or directory(ies).")
    ap.add_argument("--root", default=None, help="Root directory for source path rendering (optional).")
    ap.add_argument("--output-index", default="app/data/graphrag_index.json", help="Output index JSON path.")
    ap.add_argument("--output-vector", default="app/data/vector_index", help="Output vector store directory path.")
    ap.add_argument("--chunk-chars", type=int, default=1200, help="Max chars per chunk (default: 1200).")
    ap.add_argument("--batch-size", type=int, default=32, help="Embedding batch size (default: 32).")
    ap.add_argument("--course-id", default=None, help="Optional course_id stored in metadata.")
    ap.add_argument("--user-id", default=None, help="Optional user_id stored in metadata.")
    ap.add_argument(
        "--embeddings",
        default="env",
        choices=["env", "api", "local", "hash", "none"],
        help="Embedding mode: env|api|local|hash|none (default: env).",
    )
    ap.add_argument("--hash-dim", type=int, default=512, help="Hash embedding dimension (default: 512).")
    ap.add_argument("--env-file", default=None, help="Optional env file path (default: auto-detect).")
    args = ap.parse_args()
    return asyncio.run(main_async(args))


if __name__ == "__main__":
    raise SystemExit(main())
