#!/usr/bin/env bash
set -euo pipefail

if [[ -f /root/.llm_storage_env ]]; then
  # 统一把缓存与模型下载写到独立数据盘。
  source /root/.llm_storage_env
fi

PYTHON_BIN="${PYTHON_BIN:-/root/miniconda3/bin/python}"
PATCHED_VLLM_CLI="${PATCHED_VLLM_CLI:-/root/graduationDesign/code/ai_service/patched_vllm_cli.py}"
PATCHED_PYTHONPATH="${PATCHED_PYTHONPATH:-/root/graduationDesign/code/ai_service}"
MODEL_DIR="${MODEL_DIR:-${LLM_STORAGE_ROOT:-/root/autodl-tmp/graduationDesign_runtime}/models/Qwen3.5-9B}"
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8000}"
API_KEY="${VLLM_API_KEY:-token-local}"
LOG_FILE="${LOG_FILE:-/root/graduationDesign/code/ai_service/vllm_qwen35_9b.log}"
GPU_MEMORY_UTILIZATION="${GPU_MEMORY_UTILIZATION:-0.90}"
MAX_NUM_SEQS="${MAX_NUM_SEQS:-32}"
export PYTHONPATH="${PATCHED_PYTHONPATH}${PYTHONPATH:+:$PYTHONPATH}"
export VLLM_USE_AOT_COMPILE="${VLLM_USE_AOT_COMPILE:-0}"
export VLLM_USE_STANDALONE_COMPILE="${VLLM_USE_STANDALONE_COMPILE:-0}"

nohup "$PYTHON_BIN" "$PATCHED_VLLM_CLI" serve "$MODEL_DIR" \
  --host "$HOST" \
  --port "$PORT" \
  --api-key "$API_KEY" \
  --served-model-name qwen3.5-9b \
  --gpu-memory-utilization "$GPU_MEMORY_UTILIZATION" \
  --max-model-len 8192 \
  --max-num-seqs "$MAX_NUM_SEQS" \
  --max-num-batched-tokens 12288 \
  --enable-prefix-caching \
  --trust-remote-code \
  --language-model-only \
  --dtype auto \
  --compilation-config '{"mode": 0, "backend": "eager", "cudagraph_mode": "NONE"}' \
  > "$LOG_FILE" 2>&1 &

echo "vLLM started in background. log=$LOG_FILE"
