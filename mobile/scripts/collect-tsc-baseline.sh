#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT_DIR/reports"
DATE_TAG="$(date +%Y-%m-%d)"
OUT_FILE="$OUT_DIR/tsc-baseline-${DATE_TAG}.txt"
SUMMARY_FILE="$OUT_DIR/tsc-baseline-${DATE_TAG}.summary.md"

mkdir -p "$OUT_DIR"

set +e
npx tsc --noEmit > "$OUT_FILE" 2>&1
TSC_EXIT=$?
set -e

python3 - "$OUT_FILE" "$SUMMARY_FILE" <<'PY'
from __future__ import annotations
import collections
import re
import sys
from pathlib import Path

report_path = Path(sys.argv[1])
summary_path = Path(sys.argv[2])
pat = re.compile(r'^(.*?\.(?:ts|tsx))\((\d+),(\d+)\): error (TS\d+):')
files = collections.Counter()
codes = collections.Counter()
error_count = 0
line_count = 0
for line in report_path.read_text(encoding='utf-8', errors='ignore').splitlines():
    line_count += 1
    m = pat.match(line)
    if not m:
        continue
    error_count += 1
    files[m.group(1)] += 1
    codes[m.group(4)] += 1

lines = [
    '# TypeScript Baseline',
    '',
    f'- report: `{report_path}`',
    f'- lines: {line_count}',
    f'- errors: {error_count}',
    '',
    '## Top Files',
    '',
    '| file | errors |',
    '|---|---:|',
]
for path, count in files.most_common(12):
    lines.append(f'| `{path}` | {count} |')

lines.extend([
    '',
    '## Top Error Codes',
    '',
    '| code | count |',
    '|---|---:|',
])
for code, count in codes.most_common(8):
    lines.append(f'| `{code}` | {count} |')

summary_path.write_text('\n'.join(lines) + '\n', encoding='utf-8')
PY

echo "[INFO] tsc exit code: $TSC_EXIT"
echo "[OK] baseline: $OUT_FILE"
echo "[OK] summary: $SUMMARY_FILE"

exit "$TSC_EXIT"
