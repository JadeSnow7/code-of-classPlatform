#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$ROOT_DIR"

PYTHON_BIN="${PYTHON_BIN:-python3}"
MODEL_REF="${MODEL_REF:-/root/autodl-tmp/graduationDesign_runtime/models/JunHowie/Qwen3-8B-Instruct}"
BATCH_NAME="${BATCH_NAME:-swift-vs-custom-phase0-check}"
COMPARE_ROOT="${COMPARE_ROOT:-outputs/training_compare}"

echo "[PHASE0] A) Checking ms-swift CLI entrypoint..."
"$PYTHON_BIN" -m swift.cli.sft --help >/dev/null

echo "[PHASE0] B) Checking model/tokenizer access for: $MODEL_REF"
"$PYTHON_BIN" - "$MODEL_REF" <<'PY'
import sys
from transformers import AutoTokenizer

model_ref = sys.argv[1]
AutoTokenizer.from_pretrained(model_ref, trust_remote_code=True)
print("tokenizer_ok")
PY

echo "[PHASE0] C) Checking compare directory and batch naming..."
if [[ "$BATCH_NAME" != *"swift-vs-custom"* ]]; then
  echo "[ERROR] BATCH_NAME must contain 'swift-vs-custom': $BATCH_NAME"
  exit 1
fi
mkdir -p "$COMPARE_ROOT/$BATCH_NAME"
test -d "$COMPARE_ROOT/$BATCH_NAME"

echo "[PHASE0] D) Checking collect_metrics NO_RUNS_FOUND behavior..."
TMP_LOG="$(mktemp)"
"$PYTHON_BIN" code/ai_service/training/benchmarks/collect_metrics.py \
  --base-root "$COMPARE_ROOT" \
  --batch "__nonexistent_batch__" \
  >"$TMP_LOG" 2>&1 || true
if ! grep -q "NO_RUNS_FOUND" "$TMP_LOG"; then
  echo "[ERROR] collect_metrics.py did not emit NO_RUNS_FOUND"
  cat "$TMP_LOG"
  rm -f "$TMP_LOG"
  exit 1
fi
rm -f "$TMP_LOG"

echo "[PHASE0] PASS"
