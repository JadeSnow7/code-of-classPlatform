#!/bin/bash
# run_custom_lora.sh
# Baseline training script using existing train_lora.py
# Ensures strict parameter alignment with swift run.

# Ensure we run from the script's directory
cd "$(dirname "$0")"

# 1. Configuration
MODEL_NAME="Qwen/Qwen2.5-7B-Instruct"  # Adjust if using local path or different model
DATA_PATH="../../../data/training/processed/all_sft.jsonl"
OUTPUT_DIR="outputs/benchmark_custom"

# 2. Hyperparameters (Aligned with Swift)
SEQ_LEN=2048
LR=1e-4
BATCH_SIZE=1
GRAD_ACCUM=8
LORA_R=16
LORA_ALPHA=32
LORA_DROPOUT=0.05
TARGET_MODULES="q_proj,k_proj,v_proj,o_proj,gate_proj,up_proj,down_proj"

# 3. Execution limits for benchmarking
# Thesis Target: 200 steps
NUM_EPOCHS=2 
MAX_STEPS=200

echo "Starting Custom Baseline Training..."
echo "Model: $MODEL_NAME"
echo "Output: $OUTPUT_DIR"
echo "Data: $DATA_PATH"

# Ensure output dir exists
mkdir -p $OUTPUT_DIR

# Run
python3 train_lora.py \
    --model_name_or_path "$MODEL_NAME" \
    --train_files "$DATA_PATH" \
    --output_dir "$OUTPUT_DIR" \
    --max_length $SEQ_LEN \
    --per_device_train_batch_size $BATCH_SIZE \
    --gradient_accumulation_steps $GRAD_ACCUM \
    --learning_rate $LR \
    --num_train_epochs $NUM_EPOCHS \
    --max_steps $MAX_STEPS \
    --lora_r $LORA_R \
    --lora_alpha $LORA_ALPHA \
    --lora_dropout $LORA_DROPOUT \
    --target_modules "$TARGET_MODULES" \
    --logging_steps 10 \
    --save_steps 50 \
    --seed 42 \
    --bf16 \
    --save_training_config \
    --report_to tensorboard \
    --logging_dir "$OUTPUT_DIR/runs"

echo "Custom Training Finished."
