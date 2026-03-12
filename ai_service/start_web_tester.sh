#!/usr/bin/env bash
set -euo pipefail

if [[ -f /root/.llm_storage_env ]]; then
  source /root/.llm_storage_env
fi

PYTHON_BIN="${PYTHON_BIN:-/root/miniconda3/bin/python}"
APP_DIR="${APP_DIR:-/root/graduationDesign/code/ai_service}"
LOG_FILE="${LOG_FILE:-$APP_DIR/web_tester.log}"

export VLLM_BASE_URL="${VLLM_BASE_URL:-http://127.0.0.1:8000/v1}"
export VLLM_API_KEY="${VLLM_API_KEY:-token-local}"
export VLLM_MODEL="${VLLM_MODEL:-qwen3.5-9b}"
export WEB_TESTER_HOST="${WEB_TESTER_HOST:-0.0.0.0}"
export WEB_TESTER_PORT="${WEB_TESTER_PORT:-7860}"

cd "$APP_DIR"
nohup "$PYTHON_BIN" web_tester.py > "$LOG_FILE" 2>&1 &

echo "Web tester started in background. log=$LOG_FILE"
