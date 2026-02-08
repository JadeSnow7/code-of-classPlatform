#!/usr/bin/env python3
"""Validate benchmark JSONL contract used by formal experiments."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


DEFAULT_ALLOWED_TYPES = ("concept", "derivation", "calculation", "refusal", "writing", "tool", "rag")
DEFAULT_ALLOWED_LANES = ("style", "writing", "tool", "rag")
DEFAULT_ALLOWED_DIFFICULTY = ("easy", "medium", "hard")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate benchmark JSONL contract.")
    parser.add_argument("--input", type=str, required=True, help="Path to benchmark JSONL file")
    parser.add_argument("--min-count", type=int, default=1, help="Minimum required sample count")
    parser.add_argument(
        "--allowed-types",
        type=str,
        default=",".join(DEFAULT_ALLOWED_TYPES),
        help="Comma-separated allowed `type` values",
    )
    parser.add_argument(
        "--strict-meta",
        action="store_true",
        help="Require meta.lane/meta.difficulty and validate their values",
    )
    return parser.parse_args()


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as f:
        for lineno, line in enumerate(f, start=1):
            text = line.strip()
            if not text:
                continue
            try:
                obj = json.loads(text)
            except json.JSONDecodeError as exc:
                raise ValueError(f"{path}:{lineno} invalid JSON: {exc}") from exc
            if not isinstance(obj, dict):
                raise ValueError(f"{path}:{lineno} row must be an object")
            rows.append(obj)
    return rows


def validate_row(
    row: dict[str, Any],
    idx: int,
    allowed_types: set[str],
    strict_meta: bool,
) -> list[str]:
    errors: list[str] = []
    row_id = row.get("id")
    if not isinstance(row_id, str) or not row_id.strip():
        errors.append(f"row {idx}: invalid `id`")

    query = row.get("query")
    if not isinstance(query, str) or not query.strip():
        errors.append(f"row {idx}: invalid `query`")

    row_type = row.get("type")
    if row_type not in allowed_types:
        errors.append(f"row {idx}: invalid `type`={row_type!r}")

    expected = row.get("expected")
    if not isinstance(expected, dict):
        errors.append(f"row {idx}: missing object `expected`")
        return errors

    for key in ("key_points", "citations", "tool_calls"):
        value = expected.get(key)
        if not isinstance(value, list):
            errors.append(f"row {idx}: expected.{key} must be list")
        elif not all(isinstance(v, str) for v in value):
            errors.append(f"row {idx}: expected.{key} must contain only strings")

    should_refuse = expected.get("should_refuse")
    if not isinstance(should_refuse, bool):
        errors.append(f"row {idx}: expected.should_refuse must be bool")

    meta = row.get("meta")
    if strict_meta:
        if not isinstance(meta, dict):
            errors.append(f"row {idx}: missing object `meta`")
        else:
            lane = meta.get("lane")
            diff = meta.get("difficulty")
            if lane not in DEFAULT_ALLOWED_LANES:
                errors.append(f"row {idx}: invalid meta.lane={lane!r}")
            if diff not in DEFAULT_ALLOWED_DIFFICULTY:
                errors.append(f"row {idx}: invalid meta.difficulty={diff!r}")

    return errors


def main() -> None:
    args = parse_args()
    path = Path(args.input)
    if not path.exists():
        raise SystemExit(f"[ERROR] File not found: {path}")

    allowed_types = {t.strip() for t in args.allowed_types.split(",") if t.strip()}
    rows = load_jsonl(path)
    if len(rows) < args.min_count:
        raise SystemExit(f"[ERROR] sample count {len(rows)} < min-count {args.min_count}")

    errors: list[str] = []
    seen_ids: set[str] = set()
    for idx, row in enumerate(rows, start=1):
        errors.extend(validate_row(row, idx, allowed_types, args.strict_meta))
        row_id = row.get("id")
        if isinstance(row_id, str) and row_id:
            if row_id in seen_ids:
                errors.append(f"row {idx}: duplicate id {row_id}")
            else:
                seen_ids.add(row_id)

    if errors:
        print("[ERROR] benchmark validation failed")
        for e in errors:
            print(f"- {e}")
        raise SystemExit(1)

    print(f"[OK] benchmark validation passed: {path} (rows={len(rows)})")


if __name__ == "__main__":
    main()
