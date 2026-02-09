#!/usr/bin/env python3
"""
MS-Swift training script wrapper.
This script demonstrates how to replace the complex train_lora.py with ms-swift.

Usage:
    python train_swift.py \
        --model_type qwen2-7b-instruct \
        --dataset data/training/processed/all_sft.jsonl \
        --output_dir outputs/swift_lora \
        --lora_target_modules ALL
"""

import os
import sys
from dataclasses import dataclass, field
from typing import Optional, List

from swift.llm import SftArguments, sft_main, InferArguments, merge_lora
from swift.utils import get_logger

logger = get_logger()

def train(
    model_id_or_path: str,
    dataset_path: str,
    output_dir: str = "outputs/swift_output",
    lora_rank: int = 16,
    lora_alpha: int = 32,
    lora_dropout: float = 0.05,
    num_train_epochs: int = 2,
    learning_rate: float = 1e-4,
    batch_size: int = 1,
    gradient_accumulation_steps: int = 8,
    max_length: int = 2048,
    system_prompt: str = None,
):
    """
    Run SFT using ms-swift.
    """
    
    # Configure SFT arguments
    # ms-swift handles almost everything:
    # - Chat template application (template_type='auto' by default)
    # - Tokenization
    # - Model loading (QLoRA/LoRA)
    # - Training loop
    # - Logging (TensorBoard support built-in)
    
    sft_args = SftArguments(
        model_type=model_id_or_path,
        model_id_or_path=model_id_or_path,
        dataset=[dataset_path],  # MS-Swift accepts list of paths or dataset names
        output_dir=output_dir,
        
        # Training mechanics
        num_train_epochs=num_train_epochs,
        per_device_train_batch_size=batch_size,
        gradient_accumulation_steps=gradient_accumulation_steps,
        learning_rate=learning_rate,
        max_length=max_length,
        warmup_ratio=0.03,
        save_steps=100,
        eval_steps=100,
        logging_steps=10,
        save_total_limit=2,  # Keep only last 2 checkpoints
        
        # LoRA configuration
        sft_type='lora',
        lora_rank=lora_rank,
        lora_alpha=lora_alpha,
        lora_dropout=lora_dropout,
        lora_target_modules='ALL', # Automatically targets all linear layers
        
        # System prompt handling
        system=system_prompt if system_prompt else "You are a helpful assistant.",
        
        # Advanced optimizations (optional but recommended)
        # neftune_noise_alpha=5, # Can help with generalization
        # flash_attn=True,       # Enable if GPU supports it
    )

    # Start training
    result = sft_main(sft_args)
    return result

if __name__ == "__main__":
    # Example hardcoded usage or simple argparse
    # For a real CLI, ms-swift provides `swift sft` command which is robust.
    # This python script is mainly for programmatic integration.
    
    import argparse
    parser = argparse.ArgumentParser(description="Train with ms-swift")
    parser.add_argument("--model", type=str, required=True, help="Model type or path (e.g. qwen2-7b-instruct)")
    parser.add_argument("--data", type=str, required=True, help="Path to .jsonl dataset")
    parser.add_argument("--output", type=str, default="outputs/swift_lora", help="Output directory")
    parser.add_argument("--epochs", type=int, default=2)
    
    args = parser.parse_args()
    
    train(
        model_id_or_path=args.model,
        dataset_path=args.data,
        output_dir=args.output,
        num_train_epochs=args.epochs
    )
