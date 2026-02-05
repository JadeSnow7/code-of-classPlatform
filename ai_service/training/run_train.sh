#!/usr/bin/env bash
set -euo pipefail

# LoRA/QLoRA training runner with pre-flight checks and logging.
# Usage:
#   bash code/ai_service/training/run_train.sh style
#   bash code/ai_service/training/run_train.sh tool
#   bash code/ai_service/training/run_train.sh rag
#   bash code/ai_service/training/run_train.sh all
#
# Environment variables:
#   MODEL_NAME_OR_PATH  - Base model (default: Qwen/Qwen3-8B-Instruct)
#   OUT_BASE            - Output base directory (default: outputs/adapter)
#   DATA_BASE           - Training data directory (default: data/training/processed)
#   EVAL_FILE           - Evaluation JSONL (default: data/training/eval/benchmark.jsonl)
#   TRAIN_NOTIFY        - Set to 1 to enable completion notification
#   TRAIN_NOTIFY_URL    - Webhook URL for notification

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$ROOT_DIR"

# ========================================
# Configuration
# ========================================
STAGE=${1:-style}
MODEL=${MODEL_NAME_OR_PATH:-Qwen/Qwen3-8B-Instruct}
OUT_BASE=${OUT_BASE:-outputs/adapter}
DATA_BASE=${DATA_BASE:-data/training/processed}
EVAL_FILE=${EVAL_FILE:-data/training/eval/benchmark.jsonl}
LOG_DIR=${LOG_DIR:-outputs/logs}
USE_QLORA=${USE_QLORA:-1}
TARGET_MODULES=${TARGET_MODULES:-}
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# ========================================
# Pre-flight checks
# ========================================
echo "[CHECK] Running pre-flight checks..."

# Check Python dependencies
check_dependency() {
    python3 -c "import $1" 2>/dev/null || {
        echo "[ERROR] Missing Python dependency: $1"
        echo "Install with: pip install $1"
        exit 1
    }
}

check_dependency torch
check_dependency transformers
check_dependency datasets
check_dependency peft

# Check for bitsandbytes (optional but recommended for QLoRA)
python3 -c "import bitsandbytes" 2>/dev/null || {
    echo "[WARN] bitsandbytes not found. QLoRA may not work properly."
}

echo "[CHECK] Python dependencies OK"

# ========================================
# Stage configuration
# ========================================
case "$STAGE" in
  style)
    TRAIN_FILES="$DATA_BASE/style_sft.jsonl"
    OUT_DIR="$OUT_BASE/adapter_style"
    ;;
  tool)
    TRAIN_FILES="$DATA_BASE/tool_sft.jsonl"
    OUT_DIR="$OUT_BASE/adapter_tool"
    ;;
  rag)
    TRAIN_FILES="$DATA_BASE/rag_sft.jsonl"
    OUT_DIR="$OUT_BASE/adapter_rag"
    ;;
  all)
    TRAIN_FILES="$DATA_BASE/style_sft.jsonl,$DATA_BASE/tool_sft.jsonl,$DATA_BASE/rag_sft.jsonl"
    OUT_DIR="$OUT_BASE/adapter_multitask"
    ;;
  sample)
    # Use sample data for testing the pipeline
    TRAIN_FILES="$DATA_BASE/style_sft_sample.jsonl"
    EVAL_FILE="$DATA_BASE/style_sft_sample.jsonl"
    OUT_DIR="$OUT_BASE/adapter_sample"
    USE_QLORA=0
    TARGET_MODULES="c_attn,c_proj"
    ;;
  *)
    echo "Unknown stage: $STAGE"
    echo "Usage: $0 {style|tool|rag|all|sample}"
    exit 1
    ;;
esac

# Check training files exist
for FILE in $(echo "$TRAIN_FILES" | tr ',' ' '); do
    if [ ! -f "$FILE" ]; then
        echo "[ERROR] Training file not found: $FILE"
        echo "Run: python3 code/ai_service/training/prepare_training_data.py --create-dirs --create-samples"
        exit 1
    fi
done

# Check eval file (if specified and not empty)
if [ -n "$EVAL_FILE" ] && [ ! -f "$EVAL_FILE" ]; then
    echo "[WARN] Eval file not found: $EVAL_FILE"
    echo "Training will proceed without evaluation."
    EVAL_FILE=""
fi

echo "[CHECK] Data files OK"

# ========================================
# Create directories
# ========================================
mkdir -p "$OUT_DIR"
mkdir -p "$LOG_DIR"

LOG_FILE="$LOG_DIR/train_${STAGE}_${TIMESTAMP}.log"

echo "[INFO] Stage: $STAGE"
echo "[INFO] Model: $MODEL"
echo "[INFO] Train files: $TRAIN_FILES"
echo "[INFO] Output dir: $OUT_DIR"
echo "[INFO] Log file: $LOG_FILE"

# ========================================
# Build training command
# ========================================
TRAIN_CMD=(
    python3 "$SCRIPT_DIR/train_lora.py"
    --model_name_or_path "$MODEL"
    --train_files "$TRAIN_FILES"
    --output_dir "$OUT_DIR"
    --max_length 2048
    --per_device_train_batch_size 1
    --gradient_accumulation_steps 8
    --num_train_epochs 2
    --learning_rate 1e-4
    --logging_steps 10
    --save_steps 200
    --eval_steps 200
    --report_to tensorboard
    --logging_dir "$LOG_DIR"
)

if [ "$USE_QLORA" = "1" ]; then
    TRAIN_CMD+=(--use_qlora --bf16)
fi

if [ -n "$TARGET_MODULES" ]; then
    TRAIN_CMD+=(--target_modules "$TARGET_MODULES")
fi

# Add eval file if available
if [ -n "$EVAL_FILE" ]; then
    TRAIN_CMD+=(--eval_file "$EVAL_FILE")
fi

# ========================================
# Run training
# ========================================
echo "[INFO] Starting training at $(date)"
echo "[INFO] Command: ${TRAIN_CMD[*]}"

# Run with tee for logging
if "${TRAIN_CMD[@]}" 2>&1 | tee "$LOG_FILE"; then
    TRAIN_STATUS="SUCCESS"
    echo "[INFO] Training completed successfully at $(date)"
else
    TRAIN_STATUS="FAILED"
    echo "[ERROR] Training failed at $(date)"
fi

# ========================================
# Notification (optional)
# ========================================
if [ "${TRAIN_NOTIFY:-0}" = "1" ]; then
    NOTIFY_MSG="Training $STAGE $TRAIN_STATUS at $(date)"
    
    if [ -n "${TRAIN_NOTIFY_URL:-}" ]; then
        curl -s -X POST "$TRAIN_NOTIFY_URL" \
            -H "Content-Type: application/json" \
            -d "{\"text\": \"$NOTIFY_MSG\"}" || true
    else
        echo "[NOTIFY] $NOTIFY_MSG"
    fi
fi

# Exit with appropriate code
if [ "$TRAIN_STATUS" = "SUCCESS" ]; then
    exit 0
else
    exit 1
fi
