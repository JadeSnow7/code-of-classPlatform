#!/usr/bin/env bash
set -euo pipefail

# ms-swift OpenAI-compatible deploy entry for edge assistant.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"

CKPT_DIR="${CKPT_DIR:-/Volumes/Data/models/learning-assistant-training/swift_ckpt/edge_qwen3_0p6b_v1}"
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-18080}"
API_KEY="${API_KEY:-edge-local-key}"
SERVED_MODEL_NAME="${SERVED_MODEL_NAME:-qwen3-0.6b-edge-v1}"
INFER_BACKEND="${INFER_BACKEND:-pt}"
REPORT_DIR="$ROOT_DIR/outputs/edge_poc/reports"
DATE_TAG="$(date +%Y%m%d)"
LOG_FILE="$REPORT_DIR/swift_deploy_edge_v1_${DATE_TAG}.log"

mkdir -p "$REPORT_DIR"

if [ ! -d "$CKPT_DIR" ]; then
  echo "[ERROR] Missing ckpt dir: $CKPT_DIR" >&2
  exit 1
fi

resolve_ckpt_dir() {
  local dir="$1"
  if [ -f "$dir/adapter_config.json" ] && [ -f "$dir/adapter_model.safetensors" ]; then
    echo "$dir"
    return 0
  fi

  local latest_run
  latest_run="$(find "$dir" -maxdepth 1 -type d -name 'v*-*' | sort | tail -n 1 || true)"
  if [ -z "$latest_run" ]; then
    return 1
  fi

  local latest_ckpt
  latest_ckpt="$(find "$latest_run" -maxdepth 1 -type d -name 'checkpoint-*' | sort -V | tail -n 1 || true)"
  if [ -z "$latest_ckpt" ]; then
    return 1
  fi

  if [ -f "$latest_ckpt/adapter_config.json" ] && [ -f "$latest_ckpt/adapter_model.safetensors" ]; then
    echo "$latest_ckpt"
    return 0
  fi
  return 1
}

if RESOLVED_CKPT_DIR="$(resolve_ckpt_dir "$CKPT_DIR")"; then
  :
else
  echo "[ERROR] No deployable checkpoint found under: $CKPT_DIR" >&2
  exit 1
fi

CMD=(
  python3 -m swift.cli.deploy
  --ckpt_dir "$RESOLVED_CKPT_DIR"
  --infer_backend "$INFER_BACKEND"
  --host "$HOST"
  --port "$PORT"
  --api_key "$API_KEY"
  --served_model_name "$SERVED_MODEL_NAME"
)

echo "[INFO] Starting swift deploy for edge model"
echo "[INFO] CKPT_DIR=$CKPT_DIR"
echo "[INFO] RESOLVED_CKPT_DIR=$RESOLVED_CKPT_DIR"
echo "[INFO] HOST=$HOST"
echo "[INFO] PORT=$PORT"
echo "[INFO] SERVED_MODEL_NAME=$SERVED_MODEL_NAME"
echo "[INFO] INFER_BACKEND=$INFER_BACKEND"
echo "[INFO] LOG_FILE=$LOG_FILE"
echo "[INFO] Command: ${CMD[*]}"

if [ "${DEPLOY_DRY_RUN:-0}" = "1" ]; then
  echo "[INFO] DEPLOY_DRY_RUN=1, skip actual execution."
  exit 0
fi

"${CMD[@]}" 2>&1 | tee "$LOG_FILE"
