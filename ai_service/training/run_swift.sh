#!/bin/bash
# 示例：使用 ms-swift CLI 进行训练
# 相比编写 Python 脚本，CLI 方式更简单直观，且功能完全一致

# 1. 确保安装了 ms-swift
# pip install ms-swift[llm] -U

# 2. 设置环境变量（如果需要）
export CUDA_VISIBLE_DEVICES=0

# 3. 运行训练
# --model_type: 模型名称，swift 支持 qwen, yi, deepseek 等几乎所有主流模型
# --dataset: 数据集路径，支持本地 jsonl
# --output_dir:这也是 adapter 保存的位置
# --sft_type: lora / full
# --lora_target_modules: ALL (自动识别线性层)

swift sft \
    --model_type qwen2-7b-instruct \
    --dataset ../../data/training/processed/all_sft.jsonl \
    --sft_type lora \
    --output_dir output/swift_lora \
    --num_train_epochs 2 \
    --max_length 2048 \
    --check_dataset_strategy warning \
    --lora_rank 16 \
    --lora_alpha 32 \
    --lora_dropout 0.05 \
    --lora_target_modules ALL \
    --gradient_accumulation_steps 8 \
    --eval_steps 100 \
    --save_steps 100 \
    --logging_steps 10 \
    --save_only_model true
