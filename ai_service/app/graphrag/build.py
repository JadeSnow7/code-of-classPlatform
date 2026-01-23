from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path


_HEADING_RE = re.compile(r"^(#{1,6})\\s+(.*)$")


@dataclass(frozen=True)
class _Section:
    level: int
    title: str
    text: str


def _rel_source(path: Path, root: Path) -> str:
    try:
        return str(path.relative_to(root)).replace("\\", "/")
    except ValueError:
        return str(path).replace("\\", "/")


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


def build_index_from_markdown(paths: list[Path], *, root: Path) -> dict:
    nodes: list[dict] = []
    chunks: list[dict] = []
    edges: list[dict] = []

    for p in paths:
        raw = p.read_text(encoding="utf-8")
        source = _rel_source(p, root)
        sections = _parse_markdown_sections(raw)
        if not sections:
            continue

        file_node_id = f"file:{source}"
        nodes.append({"id": file_node_id, "title": source, "chunk_ids": []})

        stack: list[tuple[int, str]] = [(0, file_node_id)]  # (level, node_id)
        for idx, sec in enumerate(sections):
            node_id = f"sec:{source}:{idx}"
            chunk_id = f"chunk:{source}:{idx}"

            nodes.append({"id": node_id, "title": sec.title, "chunk_ids": [chunk_id]})
            chunks.append({"id": chunk_id, "text": sec.text, "source": source, "section": sec.title})

            while stack and stack[-1][0] >= sec.level:
                stack.pop()
            parent_id = stack[-1][1] if stack else file_node_id
            edges.append({"source": parent_id, "target": node_id, "relation": "contains"})

            # Lightly connect adjacent sections for "local expansion"
            if idx > 0:
                prev_node_id = f"sec:{source}:{idx-1}"
                edges.append({"source": prev_node_id, "target": node_id, "relation": "next"})

            stack.append((sec.level, node_id))

    return {"version": 1, "nodes": nodes, "chunks": chunks, "edges": edges}


def _collect_markdown_files(input_path: Path) -> list[Path]:
    if input_path.is_file():
        return [input_path]
    return sorted([p for p in input_path.rglob("*.md") if p.is_file()])


def main() -> int:
    ap = argparse.ArgumentParser(description="Build a lightweight GraphRAG index from Markdown files.")
    ap.add_argument("--input", required=True, help="Markdown file or directory (recursive).")
    ap.add_argument("--output", required=True, help="Output index JSON path.")
    ap.add_argument("--root", default=".", help="Root directory for source path rendering.")
    args = ap.parse_args()

    root = Path(args.root).resolve()
    input_path = Path(args.input).resolve()
    output_path = Path(args.output).resolve()

    paths = _collect_markdown_files(input_path)
    index = build_index_from_markdown(paths, root=root)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

