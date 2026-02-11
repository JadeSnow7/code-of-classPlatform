#!/usr/bin/env bash
set -euo pipefail

# ms-swift local LoRA training entry for edge assistant (Apple MPS).
#
# Defaults are fixed to the agreed plan, but can be overridden with env vars:
#   MODEL_PATH, DATASET_PATH, VAL_DATASET_PATH, OUTPUT_DIR
#   TRAIN_DRY_RUN=1

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"

MODEL_PATH="${MODEL_PATH:-/Volumes/Data/models/qwen3-0.6b-instruct-hf}"
DATASET_PATH="${DATASET_PATH:-$ROOT_DIR/data/training/processed/edge_swift_v1/train.jsonl}"
VAL_DATASET_PATH="${VAL_DATASET_PATH:-$ROOT_DIR/data/training/processed/edge_swift_v1/valid.jsonl}"
OUTPUT_DIR="${OUTPUT_DIR:-/Volumes/Data/models/learning-assistant-training/swift_ckpt/edge_qwen3_0p6b_v1}"
REPORT_DIR="$ROOT_DIR/outputs/edge_poc/reports"
DATE_TAG="$(date +%Y%m%d)"
LOG_FILE="$REPORT_DIR/swift_train_edge_v1_${DATE_TAG}.log"

mkdir -p "$REPORT_DIR"
mkdir -p "$OUTPUT_DIR"

if [ ! -f "$DATASET_PATH" ]; then
  echo "[ERROR] Missing dataset file: $DATASET_PATH" >&2
  exit 1
fi

if [ ! -f "$VAL_DATASET_PATH" ]; then
  echo "[ERROR] Missing validation file: $VAL_DATASET_PATH" >&2
  exit 1
fi

if [ ! -d "$MODEL_PATH" ]; then
  echo "[ERROR] Missing model directory: $MODEL_PATH" >&2
  exit 1
fi

export PYTORCH_ENABLE_MPS_FALLBACK="${PYTORCH_ENABLE_MPS_FALLBACK:-1}"

CMD=(
  python3 -m swift.cli.sft
  --model "$MODEL_PATH"
  --model_type qwen3_nothinking
  --dataset "$DATASET_PATH"
  --val_dataset "$VAL_DATASET_PATH"
  --train_type lora
  --output_dir "$OUTPUT_DIR"
  --learning_rate 2e-4
  --num_train_epochs 3
  --per_device_train_batch_size 1
  --gradient_accumulation_steps 8
  --max_length 512
  --lora_rank 8
  --lora_alpha 16
  --lora_dropout 0.05
  --target_modules q_proj v_proj
  --logging_steps 10
  --save_steps 50
  --eval_steps 50
  --save_only_model true
)

echo "[INFO] Starting edge local swift training"
echo "[INFO] MODEL_PATH=$MODEL_PATH"
echo "[INFO] DATASET_PATH=$DATASET_PATH"
echo "[INFO] VAL_DATASET_PATH=$VAL_DATASET_PATH"
echo "[INFO] OUTPUT_DIR=$OUTPUT_DIR"
echo "[INFO] LOG_FILE=$LOG_FILE"
echo "[INFO] PYTORCH_ENABLE_MPS_FALLBACK=$PYTORCH_ENABLE_MPS_FALLBACK"
echo "[INFO] Command: ${CMD[*]}"

if [ "${TRAIN_DRY_RUN:-0}" = "1" ]; then
  echo "[INFO] TRAIN_DRY_RUN=1, skip actual execution."
  exit 0
fi

"${CMD[@]}" 2>&1 | tee "$LOG_FILE"

echo "[INFO] Training finished."
echo "[INFO] Artifacts: $OUTPUT_DIR"
echo "[INFO] Log: $LOG_FILE"
