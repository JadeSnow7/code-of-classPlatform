#!/usr/bin/env bash
set -euo pipefail

# LoRA/QLoRA training runner with pre-flight checks and logging.
# Usage:
#   bash code/ai_service/training/run_train.sh style    # Electromagnetic course (28 samples)
#   bash code/ai_service/training/run_train.sh writing  # Academic writing (12 samples)
#   bash code/ai_service/training/run_train.sh tool     # Tool calling
#   bash code/ai_service/training/run_train.sh rag      # RAG
#   bash code/ai_service/training/run_train.sh all      # Multitask (40 samples)
#   bash code/ai_service/training/run_train.sh sample   # Quick test (3 samples)
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
USE_MODELSCOPE=${USE_MODELSCOPE:-0}
MAX_LENGTH=${MAX_LENGTH:-2048}
PER_DEVICE_TRAIN_BATCH_SIZE=${PER_DEVICE_TRAIN_BATCH_SIZE:-1}
GRADIENT_ACCUMULATION_STEPS=${GRADIENT_ACCUMULATION_STEPS:-8}
NUM_TRAIN_EPOCHS=${NUM_TRAIN_EPOCHS:-2}
LEARNING_RATE=${LEARNING_RATE:-1e-4}
LOGGING_STEPS=${LOGGING_STEPS:-10}
SAVE_STEPS=${SAVE_STEPS:-200}
EVAL_STEPS=${EVAL_STEPS:-200}
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# ========================================
# Model Preparation (ModelScope support)
# ========================================
if [ "$USE_MODELSCOPE" = "1" ]; then
    echo "[INFO] Using ModelScope to download model..."
    
    # Check if download_model.py exists
    DOWNLOAD_SCRIPT="$SCRIPT_DIR/download_model.py"
    if [ ! -f "$DOWNLOAD_SCRIPT" ]; then
        echo "[ERROR] download_model.py not found at $DOWNLOAD_SCRIPT"
        exit 1
    fi

    # Install modelscope if needed
    python3 -c "import modelscope" 2>/dev/null || {
        echo "[INFO] Installing modelscope..."
        pip install modelscope
    }

    # Download model and get local path
    echo "[INFO] Downloading $MODEL from ModelScope..."
    MODEL_PATH=$(python3 "$DOWNLOAD_SCRIPT" "$MODEL" --cache_dir "$ROOT_DIR/models" | tail -n 1)
    
    if [ -d "$MODEL_PATH" ]; then
        echo "[INFO] Model downloaded successfully to: $MODEL_PATH"
        MODEL="$MODEL_PATH"
    else
        echo "[ERROR] Failed to download model from ModelScope. Output: $MODEL_PATH"
        exit 1
    fi
fi

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
    EVAL_FILE="data/training/eval/style_benchmark.jsonl"
    OUT_DIR="$OUT_BASE/adapter_style"
    echo "Training electromagnetic course teaching model..."
    ;;
  writing)
    TRAIN_FILES="$DATA_BASE/writing_sft.jsonl"
    EVAL_FILE="data/training/eval/writing_benchmark.jsonl"
    OUT_DIR="$OUT_BASE/adapter_writing"
    echo "Training academic writing guidance model..."
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
    TRAIN_FILES="$DATA_BASE/style_sft.jsonl,$DATA_BASE/writing_sft.jsonl"
    EVAL_FILE="data/training/eval/style_benchmark.jsonl"
    OUT_DIR="$OUT_BASE/adapter_multitask"
    echo "Training multitask model (style + writing)..."
    ;;
  sample)
    # Use sample data for testing the pipeline
    TRAIN_FILES="$DATA_BASE/style_sft_sample.jsonl"
    EVAL_FILE="$DATA_BASE/style_sft_sample.jsonl"
    OUT_DIR="$OUT_BASE/adapter_sample"
    USE_QLORA=0
    if [ -z "$TARGET_MODULES" ]; then
        TARGET_MODULES="q_proj,k_proj,v_proj,o_proj"
    fi
    ;;
  *)
    echo "Unknown stage: $STAGE"
    echo "Usage: $0 {style|writing|tool|rag|all|sample}"
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

count_train_samples() {
    local total=0
    local file
    for file in $(echo "$TRAIN_FILES" | tr ',' ' '); do
        if [ -f "$file" ]; then
            local lines
            lines=$(wc -l < "$file")
            lines=$(echo "$lines" | tr -d '[:space:]')
            if [ -n "$lines" ]; then
                total=$((total + lines))
            fi
        fi
    done
    echo "$total"
}

estimate_total_steps() {
    python3 - "$1" "$2" "$3" "$4" <<'PY'
import math
import sys

samples = int(float(sys.argv[1]))
batch = max(1, int(float(sys.argv[2])))
grad = max(1, int(float(sys.argv[3])))
epochs = max(0.0, float(sys.argv[4]))

if samples <= 0 or epochs <= 0:
    print(0)
else:
    updates_per_epoch = math.ceil(samples / (batch * grad))
    print(max(1, math.ceil(updates_per_epoch * epochs)))
PY
}

auto_tune_interval() {
    local raw_value="$1"
    local estimated_steps="$2"
    local label="$3"
    local value="${raw_value:-1}"
    local tuned

    if ! [[ "$value" =~ ^[0-9]+$ ]]; then
        value=1
    fi
    tuned="$value"

    if [ "$estimated_steps" -gt 0 ] && [ "$tuned" -gt "$estimated_steps" ]; then
        tuned="$estimated_steps"
    fi
    if [ "$tuned" -lt 1 ]; then
        tuned=1
    fi
    if [ "$tuned" -ne "$value" ]; then
        echo "[INFO] Adjusting ${label}: ${value} -> ${tuned} (estimated total steps: ${estimated_steps})" >&2
    fi
    echo "$tuned"
}

TRAIN_SAMPLE_COUNT=$(count_train_samples)
EST_TOTAL_STEPS=$(estimate_total_steps \
    "$TRAIN_SAMPLE_COUNT" \
    "$PER_DEVICE_TRAIN_BATCH_SIZE" \
    "$GRADIENT_ACCUMULATION_STEPS" \
    "$NUM_TRAIN_EPOCHS")

LOGGING_STEPS=$(auto_tune_interval "$LOGGING_STEPS" "$EST_TOTAL_STEPS" "logging_steps")
SAVE_STEPS=$(auto_tune_interval "$SAVE_STEPS" "$EST_TOTAL_STEPS" "save_steps")
if [ -n "$EVAL_FILE" ]; then
    EVAL_STEPS=$(auto_tune_interval "$EVAL_STEPS" "$EST_TOTAL_STEPS" "eval_steps")
fi

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
echo "[INFO] Train samples: $TRAIN_SAMPLE_COUNT"
echo "[INFO] Estimated total steps: $EST_TOTAL_STEPS"
echo "[INFO] logging_steps/save_steps/eval_steps: $LOGGING_STEPS/$SAVE_STEPS/$EVAL_STEPS"

# ========================================
# Build training command
# ========================================
TRAIN_CMD=(
    python3 "$SCRIPT_DIR/train_lora.py"
    --model_name_or_path "$MODEL"
    --train_files "$TRAIN_FILES"
    --output_dir "$OUT_DIR"
    --max_length "$MAX_LENGTH"
    --per_device_train_batch_size "$PER_DEVICE_TRAIN_BATCH_SIZE"
    --gradient_accumulation_steps "$GRADIENT_ACCUMULATION_STEPS"
    --num_train_epochs "$NUM_TRAIN_EPOCHS"
    --learning_rate "$LEARNING_RATE"
    --logging_steps "$LOGGING_STEPS"
    --save_steps "$SAVE_STEPS"
    --eval_steps "$EVAL_STEPS"
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
