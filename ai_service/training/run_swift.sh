#!/bin/bash
set -euo pipefail

# ms-swift CLI training entrypoint.
# IMPORTANT:
# - Always use `python3 -m swift.cli.sft` to avoid collision with Apple Swift (`/usr/bin/swift`).
# - This script is a simple manual runner. The compare pipeline uses run_compare_stage.py.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

python3 -m swift.cli.sft \
    --model Qwen/Qwen3-4B-Instruct-2507-FP8 \
    --model_type qwen3_nothinking \
    --dataset ../../../data/training/processed/all_sft.jsonl \
    --train_type lora \
    --output_dir ../../../outputs/training_compare/manual-swift-lora \
    --num_train_epochs 2 \
    --max_length 2048 \
    --check_dataset_strategy warning \
    --lora_rank 16 \
    --lora_alpha 32 \
    --lora_dropout 0.05 \
    --target_modules q_proj k_proj v_proj o_proj gate_proj up_proj down_proj \
    --gradient_accumulation_steps 8 \
    --eval_steps 100 \
    --save_steps 100 \
    --logging_steps 10 \
    --save_only_model true
