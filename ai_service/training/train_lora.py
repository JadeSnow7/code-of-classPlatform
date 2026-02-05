#!/usr/bin/env python3
"""LoRA/QLoRA finetuning script for chat-style JSONL datasets.

Follows the format in docs/ai/training-data-spec.md.

Enhancements:
- TensorBoard logging (--logging_dir, --report_to tensorboard)
- Early stopping (--early_stopping_patience, --load_best_model_at_end)
- Auto evaluation after training (--auto_eval)
- Training config export (--save_training_config)
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import torch
from datasets import Dataset
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    EarlyStoppingCallback,
    Trainer,
    TrainingArguments,
)

try:
    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
except ImportError as exc:  # pragma: no cover
    raise SystemExit("Missing dependency: peft. Install with: pip install peft") from exc


ALLOWED_ROLES = {"system", "user", "assistant"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="LoRA/QLoRA finetuning for chat models")
    parser.add_argument("--model_name_or_path", type=str, required=True)
    parser.add_argument("--train_files", type=str, required=True,
                        help="Comma-separated JSONL files or directories")
    parser.add_argument("--eval_file", type=str, default="")
    parser.add_argument("--output_dir", type=str, default="outputs/adapter")

    parser.add_argument("--max_length", type=int, default=2048)
    parser.add_argument("--truncate_from", type=str, choices=["left", "right"], default="right")

    parser.add_argument("--per_device_train_batch_size", type=int, default=1)
    parser.add_argument("--per_device_eval_batch_size", type=int, default=1)
    parser.add_argument("--gradient_accumulation_steps", type=int, default=8)
    parser.add_argument("--num_train_epochs", type=float, default=2.0)
    parser.add_argument("--learning_rate", type=float, default=1e-4)
    parser.add_argument("--weight_decay", type=float, default=0.0)
    parser.add_argument("--warmup_ratio", type=float, default=0.03)

    parser.add_argument("--logging_steps", type=int, default=10)
    parser.add_argument("--save_steps", type=int, default=200)
    parser.add_argument("--eval_steps", type=int, default=200)
    parser.add_argument("--seed", type=int, default=42)

    parser.add_argument("--use_qlora", action="store_true")
    parser.add_argument("--bf16", action="store_true")
    parser.add_argument("--fp16", action="store_true")

    parser.add_argument("--lora_r", type=int, default=16)
    parser.add_argument("--lora_alpha", type=int, default=32)
    parser.add_argument("--lora_dropout", type=float, default=0.05)
    parser.add_argument(
        "--target_modules",
        type=str,
        default="q_proj,k_proj,v_proj,o_proj,gate_proj,up_proj,down_proj",
        help="Comma-separated module names for LoRA",
    )

    parser.add_argument("--num_proc", type=int, default=1)
    parser.add_argument("--resume_from_checkpoint", type=str, default="")
    parser.add_argument("--report_to", type=str, default="none",
                        help="Reporting backend: none, tensorboard, wandb")

    # New: Logging and monitoring
    parser.add_argument("--logging_dir", type=str, default="outputs/logs",
                        help="TensorBoard logging directory (default: outputs/logs)")

    # New: Early stopping
    parser.add_argument("--early_stopping_patience", type=int, default=0,
                        help="Early stopping patience (0 = disabled)")
    parser.add_argument("--load_best_model_at_end", action="store_true",
                        help="Load best model at end of training (requires eval_file)")
    parser.add_argument("--metric_for_best_model", type=str, default="eval_loss",
                        help="Metric for best model selection")
    parser.add_argument("--greater_is_better", action="store_true",
                        help="Whether higher metric is better")

    # New: Auto evaluation
    parser.add_argument("--auto_eval", action="store_true",
                        help="Run generate_predictions + eval_metrics after training")
    parser.add_argument("--benchmark_file", type=str, default="",
                        help="Benchmark file for auto_eval (defaults to eval_file)")

    # New: Config export
    parser.add_argument("--save_training_config", action="store_true", default=True,
                        help="Save training config to output_dir/training_config.json")
    parser.add_argument("--no_save_training_config", action="store_false",
                        dest="save_training_config")

    return parser.parse_args()


def expand_paths(paths: str) -> List[Path]:
    results: List[Path] = []
    for raw in paths.split(","):
        path = Path(raw.strip())
        if not path.exists():
            raise FileNotFoundError(f"Path not found: {path}")
        if path.is_dir():
            results.extend(sorted(path.glob("*.jsonl")))
        else:
            results.append(path)
    if not results:
        raise FileNotFoundError("No JSONL files found in train_files")
    return results


def load_jsonl(paths: List[Path]) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    for path in paths:
        with path.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if "messages" not in obj:
                    continue
                items.append(obj)
    if not items:
        raise ValueError("No valid samples loaded from JSONL files")
    return items


def normalize_messages(messages: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    normalized: List[Dict[str, str]] = []
    for msg in messages:
        role = (msg.get("role") or "user").strip().lower()
        content = msg.get("content")
        content = "" if content is None else str(content)

        tool_calls = msg.get("tool_calls")
        if tool_calls:
            content += "\n\n<tool_calls>" + json.dumps(tool_calls, ensure_ascii=False) + "</tool_calls>"

        if role not in ALLOWED_ROLES:
            if role == "tool":
                content = "[tool]\n" + content
            else:
                content = f"[{role}]\n" + content
            role = "assistant"

        normalized.append({"role": role, "content": content})
    return normalized


def build_input_and_labels(tokenizer, messages: List[Dict[str, str]], max_length: int, truncate_from: str):
    use_chat_template = hasattr(tokenizer, "apply_chat_template") and getattr(tokenizer, "chat_template", None)
    if use_chat_template:
        input_ids = tokenizer.apply_chat_template(
            messages,
            tokenize=True,
            add_generation_prompt=False,
        )
        labels = [-100] * len(input_ids)

        for idx, msg in enumerate(messages):
            if msg["role"] != "assistant":
                continue
            prefix_ids = tokenizer.apply_chat_template(
                messages[:idx],
                tokenize=True,
                add_generation_prompt=False,
            )
            full_ids = tokenizer.apply_chat_template(
                messages[: idx + 1],
                tokenize=True,
                add_generation_prompt=False,
            )
            start = len(prefix_ids)
            end = len(full_ids)
            labels[start:end] = full_ids[start:end]
    else:
        text = "\n".join([f"<{m['role']}>\n{m['content']}" for m in messages])
        input_ids = tokenizer(text, add_special_tokens=True)["input_ids"]
        labels = input_ids.copy()

    if max_length and len(input_ids) > max_length:
        if truncate_from == "left":
            input_ids = input_ids[-max_length:]
            labels = labels[-max_length:]
        else:
            input_ids = input_ids[:max_length]
            labels = labels[:max_length]

    attention_mask = [1] * len(input_ids)
    return {
        "input_ids": input_ids,
        "attention_mask": attention_mask,
        "labels": labels,
    }


def collate_batch(features: List[Dict[str, Any]], pad_token_id: int):
    max_len = max(len(x["input_ids"]) for x in features)
    batch = {"input_ids": [], "attention_mask": [], "labels": []}
    for item in features:
        pad_len = max_len - len(item["input_ids"])
        batch["input_ids"].append(item["input_ids"] + [pad_token_id] * pad_len)
        batch["attention_mask"].append(item["attention_mask"] + [0] * pad_len)
        batch["labels"].append(item["labels"] + [-100] * pad_len)
    return {k: torch.tensor(v) for k, v in batch.items()}


def main() -> None:
    args = parse_args()

    train_paths = expand_paths(args.train_files)
    train_items = load_jsonl(train_paths)

    eval_items = []
    if args.eval_file:
        eval_items = load_jsonl([Path(args.eval_file)])

    if args.early_stopping_patience > 0:
        if not args.eval_file:
            raise ValueError("--early_stopping_patience > 0 requires --eval_file to be set")
        if not args.load_best_model_at_end:
            raise ValueError("--early_stopping_patience > 0 requires --load_best_model_at_end=True")
        if not eval_items:
            raise ValueError("--early_stopping_patience > 0 requires eval_file with valid samples")

    tokenizer = AutoTokenizer.from_pretrained(args.model_name_or_path, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    model_kwargs: Dict[str, Any] = {"trust_remote_code": True}
    if args.use_qlora:
        try:
            import bitsandbytes as _  # noqa: F401
        except ImportError as exc:  # pragma: no cover
            raise SystemExit(
                "Missing dependency: bitsandbytes. Install with: pip install bitsandbytes"
            ) from exc

        compute_dtype = torch.bfloat16 if args.bf16 else torch.float16
        model_kwargs.update({
            "load_in_4bit": True,
            "bnb_4bit_quant_type": "nf4",
            "bnb_4bit_use_double_quant": True,
            "bnb_4bit_compute_dtype": compute_dtype,
            "torch_dtype": compute_dtype,
        })

    model = AutoModelForCausalLM.from_pretrained(args.model_name_or_path, **model_kwargs)

    if args.use_qlora:
        model = prepare_model_for_kbit_training(model)

    lora_config = LoraConfig(
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        lora_dropout=args.lora_dropout,
        target_modules=[m.strip() for m in args.target_modules.split(",") if m.strip()],
        bias="none",
        task_type="CAUSAL_LM",
    )

    model = get_peft_model(model, lora_config)
    if hasattr(model, "enable_input_require_grads"):
        model.enable_input_require_grads()

    def tokenize_sample(sample: Dict[str, Any]):
        messages = normalize_messages(sample["messages"])
        return build_input_and_labels(
            tokenizer,
            messages,
            max_length=args.max_length,
            truncate_from=args.truncate_from,
        )

    train_dataset = Dataset.from_list(train_items).map(
        tokenize_sample,
        remove_columns=Dataset.from_list(train_items).column_names,
        num_proc=args.num_proc,
    )

    eval_dataset = None
    if eval_items:
        eval_dataset = Dataset.from_list(eval_items).map(
            tokenize_sample,
            remove_columns=Dataset.from_list(eval_items).column_names,
            num_proc=args.num_proc,
        )

    training_args = TrainingArguments(
        output_dir=args.output_dir,
        per_device_train_batch_size=args.per_device_train_batch_size,
        per_device_eval_batch_size=args.per_device_eval_batch_size,
        gradient_accumulation_steps=args.gradient_accumulation_steps,
        num_train_epochs=args.num_train_epochs,
        learning_rate=args.learning_rate,
        weight_decay=args.weight_decay,
        warmup_ratio=args.warmup_ratio,
        logging_steps=args.logging_steps,
        save_steps=args.save_steps,
        eval_steps=args.eval_steps,
        eval_strategy="steps" if eval_dataset is not None else "no",
        save_strategy="steps",
        report_to=args.report_to,
        seed=args.seed,
        bf16=args.bf16,
        fp16=args.fp16,
        gradient_checkpointing=True,
        # New: Logging directory
        logging_dir=args.logging_dir,
        # New: Best model loading for early stopping
        load_best_model_at_end=args.load_best_model_at_end,
        metric_for_best_model=args.metric_for_best_model if args.load_best_model_at_end else None,
        greater_is_better=args.greater_is_better if args.load_best_model_at_end else None,
    )

    # Build callbacks
    callbacks = []
    if args.early_stopping_patience > 0 and eval_dataset is not None:
        print(f"[INFO] Early stopping enabled with patience={args.early_stopping_patience}")
        callbacks.append(EarlyStoppingCallback(early_stopping_patience=args.early_stopping_patience))

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=eval_dataset,
        data_collator=lambda items: collate_batch(items, tokenizer.pad_token_id),
        callbacks=callbacks if callbacks else None,
    )

    resume_from = args.resume_from_checkpoint or None
    trainer.train(resume_from_checkpoint=resume_from)

    os.makedirs(args.output_dir, exist_ok=True)
    trainer.save_model(args.output_dir)
    tokenizer.save_pretrained(args.output_dir)

    # Save training config
    if args.save_training_config:
        config_path = os.path.join(args.output_dir, "training_config.json")
        training_config = {
            "timestamp": datetime.now().isoformat(),
            "model_name_or_path": args.model_name_or_path,
            "train_files": args.train_files,
            "eval_file": args.eval_file,
            "max_length": args.max_length,
            "lora_r": args.lora_r,
            "lora_alpha": args.lora_alpha,
            "lora_dropout": args.lora_dropout,
            "target_modules": args.target_modules,
            "use_qlora": args.use_qlora,
            "bf16": args.bf16,
            "fp16": args.fp16,
            "per_device_train_batch_size": args.per_device_train_batch_size,
            "gradient_accumulation_steps": args.gradient_accumulation_steps,
            "num_train_epochs": args.num_train_epochs,
            "learning_rate": args.learning_rate,
            "warmup_ratio": args.warmup_ratio,
            "early_stopping_patience": args.early_stopping_patience,
            "load_best_model_at_end": args.load_best_model_at_end,
        }
        with open(config_path, "w", encoding="utf-8") as f:
            json.dump(training_config, f, ensure_ascii=False, indent=2)
        print(f"[INFO] Training config saved to: {config_path}")

    print(f"[INFO] Training complete. Adapter saved to: {args.output_dir}")

    # Auto evaluation
    if args.auto_eval:
        benchmark_file = args.benchmark_file or args.eval_file
        if not benchmark_file:
            print("[WARN] --auto_eval requires --benchmark_file or --eval_file")
        else:
            run_auto_eval(args.model_name_or_path, args.output_dir, benchmark_file)


def run_auto_eval(model_name: str, adapter_path: str, benchmark_file: str) -> None:
    """Run generate_predictions.py and eval_metrics.py for auto evaluation."""
    script_dir = Path(__file__).resolve().parent
    predictions_file = os.path.join(adapter_path, "predictions.jsonl")
    eval_report = os.path.join(adapter_path, "eval_report.json")

    print("\n[AUTO-EVAL] Step 1: Generating predictions...")
    gen_script = script_dir / "generate_predictions.py"
    if not gen_script.exists():
        print(f"[WARN] generate_predictions.py not found at {gen_script}")
        return

    gen_cmd = [
        sys.executable, str(gen_script),
        "--model_name_or_path", model_name,
        "--adapter_path", adapter_path,
        "--eval_file", benchmark_file,
        "--output", predictions_file,
    ]
    result = subprocess.run(gen_cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"[ERROR] generate_predictions.py failed:\n{result.stderr}")
        return
    print(result.stdout)

    print("[AUTO-EVAL] Step 2: Running evaluation...")
    eval_script = script_dir / "eval_metrics.py"
    if not eval_script.exists():
        print(f"[WARN] eval_metrics.py not found at {eval_script}")
        return

    eval_cmd = [
        sys.executable, str(eval_script),
        "--eval_file", benchmark_file,
        "--pred_file", predictions_file,
        "--output", eval_report,
        "--dump_details",
    ]
    result = subprocess.run(eval_cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"[ERROR] eval_metrics.py failed:\n{result.stderr}")
        return
    print(result.stdout)
    print(f"[AUTO-EVAL] Complete. Report saved to: {eval_report}")


if __name__ == "__main__":
    main()
