#!/bin/bash
# run_swift_sft.sh
# MS-Swift training script aligned with custom baseline.

# Ensure we run from the script's directory
cd "$(dirname "$0")"

# 1. Configuration
MODEL_TYPE="qwen2.5-7b-instruct"
DATA_PATH="../../../data/training/processed/all_sft.jsonl"
OUTPUT_DIR="outputs/benchmark_swift"

# 2. Hyperparameters
MAX_LENGTH=2048
LR=1e-4
BATCH_SIZE=1
GRAD_ACCUM=8
LORA_R=16
LORA_ALPHA=32
LORA_DROPOUT=0.05
# Swift 'ALL' is equivalent to specific target modules generally
LORA_TARGET_MODULES="ALL"

# 3. Execution
# Thesis Target: 200 steps
MAX_STEPS=200

echo "Starting Swift Training..."
echo "Model: $MODEL_TYPE"
echo "Output: $OUTPUT_DIR"
echo "Data: $DATA_PATH"

python3 -m swift.cli.sft \
    --model_type "$MODEL_TYPE" \
    --dataset "$DATA_PATH" \
    --output_dir "$OUTPUT_DIR" \
    --max_length $MAX_LENGTH \
    --learning_rate $LR \
    --per_device_train_batch_size $BATCH_SIZE \
    --gradient_accumulation_steps $GRAD_ACCUM \
    --lora_rank $LORA_R \
    --lora_alpha $LORA_ALPHA \
    --lora_dropout $LORA_DROPOUT \
    --lora_target_modules $LORA_TARGET_MODULES \
    --sft_type lora \
    --seed 42 \
    --max_steps $MAX_STEPS \
    --save_steps 50 \
    --eval_steps 50 \
    --logging_steps 10 \
    --check_dataset_strategy warning \
    --batch_size $BATCH_SIZE \
    --weight_decay 0.0 \
    --warmup_ratio 0.03 \
    --gradient_checkpointing true \
    --bf16 true

echo "Swift Training Finished."
