#!/usr/bin/env python3
"""Generate synthetic training data using an LLM.

Usage:
    python generate_synthetic_data.py \
        --model_name_or_path Qwen/Qwen3-8B-Instruct \
        --input_file topics.txt \
        --output_file data/training/processed/synthetic.jsonl \
        --num_samples 10 \
        --mode tutor

Input file format (topics.txt):
    Each line is a topic or concept to generate data for.
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer


DEFAULT_SYSTEM_PROMPT = "你是一个通用的智能教学助手。"
TOOL_SYSTEM_PROMPT = "你是通用教学平台的 AI 助教，擅长使用工具。"

PROMPT_TEMPLATES = {
    "tutor": (
        "请根据以下知识点生成一个教学对话样本。\n"
        "要求：给出一个学生提问和一个助教回答。\n"
        "回答需包含结构化小标题，例如：### 结论 / ### 推导 / ### 检查。\n"
        "知识点：{topic}\n\n"
        "仅输出 JSON，包含字段：user, assistant。"
    ),
    "rag": (
        "请生成一个包含参考片段（带 [1], [2] 编号）的教学对话样本。\n"
        "回答必须引用这些片段。\n"
        "知识点：{topic}\n\n"
        "仅输出 JSON，包含字段：context, user, assistant。"
    ),
    "tool": (
        "请生成一个需要调用工具的教学对话样本。\n"
        "知识点：{topic}\n\n"
        "仅输出 JSON，包含字段：user, assistant, tool_calls。\n"
        "tool_calls 示例：[{\"name\": \"evaluate_expression\", \"arguments\": {\"expression\": \"2+3\"}}]"
    ),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate synthetic training data")
    parser.add_argument("--model_name_or_path", type=str, required=True,
                        help="Model to use for generation")
    parser.add_argument("--input_file", type=str, required=True,
                        help="Input file containing topics (one per line)")
    parser.add_argument("--output_file", type=str, required=True,
                        help="Output JSONL file")
    parser.add_argument("--num_samples", type=int, default=5,
                        help="Number of samples to generate per topic")
    parser.add_argument("--mode", type=str, choices=["tutor", "rag", "tool"], default="tutor",
                        help="Generation mode")
    parser.add_argument("--batch_size", type=int, default=1,
                        help="Batch size for generation")
    parser.add_argument("--max_new_tokens", type=int, default=768,
                        help="Maximum tokens to generate")
    parser.add_argument("--temperature", type=float, default=0.8,
                        help="Sampling temperature")
    parser.add_argument("--top_p", type=float, default=0.9,
                        help="Top-p sampling parameter")
    parser.add_argument("--use_4bit", action="store_true", help="Use 4-bit quantization")
    parser.add_argument("--bf16", action="store_true", help="Use bfloat16")
    parser.add_argument("--system_prompt", type=str, default="",
                        help="Override system prompt (optional)")
    parser.add_argument("--seed", type=int, default=0,
                        help="Random seed (0 = no seed)")
    return parser.parse_args()


def load_model(args):
    model_kwargs: Dict[str, Any] = {
        "device_map": "auto",
        "trust_remote_code": True,
    }
    if args.use_4bit:
        try:
            import bitsandbytes as _  # noqa: F401
        except ImportError as exc:
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
    elif args.bf16:
        model_kwargs["torch_dtype"] = torch.bfloat16

    tokenizer = AutoTokenizer.from_pretrained(args.model_name_or_path, trust_remote_code=True)
    model = AutoModelForCausalLM.from_pretrained(args.model_name_or_path, **model_kwargs)
    return model, tokenizer


def build_prompt(tokenizer, system_prompt: str, topic: str, mode: str) -> str:
    user_prompt = PROMPT_TEMPLATES[mode].format(topic=topic)
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]
    if hasattr(tokenizer, "apply_chat_template"):
        return tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True,
        )
    return "\n".join([f"<{m['role']}>\n{m['content']}" for m in messages])


def generate_batch(
    model,
    tokenizer,
    prompts: List[str],
    max_new_tokens: int,
    temperature: float,
    top_p: float,
) -> List[str]:
    inputs = tokenizer(prompts, return_tensors="pt", padding=True, truncation=True)
    inputs = {k: v.to(model.device) for k, v in inputs.items()}
    input_lengths = inputs["attention_mask"].sum(dim=1)

    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            temperature=temperature,
            top_p=top_p,
            do_sample=temperature > 0,
            pad_token_id=tokenizer.pad_token_id or tokenizer.eos_token_id,
        )

    results: List[str] = []
    for i, output in enumerate(outputs):
        start = int(input_lengths[i].item())
        generated = tokenizer.decode(output[start:], skip_special_tokens=True)
        results.append(generated.strip())
    return results


def extract_json_block(text: str) -> Optional[str]:
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    return text[start:end + 1]


def parse_output(
    output: str,
    mode: str,
    topic: str,
    index: int,
    base_system: str,
) -> Optional[Dict[str, Any]]:
    """Parse LLM output into training data format."""
    json_str = extract_json_block(output)
    if not json_str:
        return None

    try:
        data = json.loads(json_str)
    except json.JSONDecodeError:
        return None

    user = str(data.get("user", "")).strip()
    assistant = str(data.get("assistant", "")).strip()
    if not user or not assistant:
        return None

    sample: Dict[str, Any] = {
        "id": f"synthetic-{mode}-{int(time.time())}-{index}",
        "mode": mode,
        "messages": [],
        "meta": {"source": "synthetic", "topic": topic},
    }

    if mode == "tutor":
        sample["messages"] = [
            {"role": "system", "content": base_system},
            {"role": "user", "content": user},
            {"role": "assistant", "content": assistant},
        ]
        return sample

    if mode == "rag":
        context = str(data.get("context", "")).strip()
        system = base_system
        if context:
            system = f"{base_system}\n\n请根据以下参考片段回答问题：\n{context}"
        sample["messages"] = [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
            {"role": "assistant", "content": assistant},
        ]
        return sample

    if mode == "tool":
        tool_calls = data.get("tool_calls") or data.get("tools") or []
        if not isinstance(tool_calls, list):
            tool_calls = [tool_calls]
        sample["messages"] = [
            {"role": "system", "content": base_system},
            {"role": "user", "content": user},
            {"role": "assistant", "content": assistant, "tool_calls": tool_calls},
        ]
        return sample

    return None


def main() -> None:
    args = parse_args()

    if args.seed > 0:
        torch.manual_seed(args.seed)

    topics_path = Path(args.input_file)
    if not topics_path.exists():
        raise FileNotFoundError(f"Input file not found: {topics_path}")

    topics = [line.strip() for line in topics_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    if not topics:
        raise ValueError("No topics found in input file")

    base_system = args.system_prompt or (
        TOOL_SYSTEM_PROMPT if args.mode == "tool" else DEFAULT_SYSTEM_PROMPT
    )

    print(f"[INFO] Loaded {len(topics)} topics")
    model, tokenizer = load_model(args)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    tasks: List[Dict[str, Any]] = []
    for topic in topics:
        for _ in range(args.num_samples):
            prompt = build_prompt(tokenizer, base_system, topic, args.mode)
            tasks.append({"topic": topic, "prompt": prompt})

    results: List[Dict[str, Any]] = []
    total = len(tasks)
    print(f"[INFO] Generating {total} samples (batch_size={args.batch_size})")

    sample_index = 0
    for start_idx in range(0, total, args.batch_size):
        batch = tasks[start_idx: start_idx + args.batch_size]
        prompts = [item["prompt"] for item in batch]
        outputs = generate_batch(
            model,
            tokenizer,
            prompts,
            args.max_new_tokens,
            args.temperature,
            args.top_p,
        )
        for item, output in zip(batch, outputs):
            sample = parse_output(output, args.mode, item["topic"], sample_index, base_system)
            sample_index += 1
            if sample:
                results.append(sample)

    output_path = Path(args.output_file)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as f:
        for item in results:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")

    print(f"[INFO] Generated {len(results)} samples saved to {args.output_file}")


if __name__ == "__main__":
    main()
