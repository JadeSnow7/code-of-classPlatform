#!/usr/bin/env python3
"""Generate predictions from a trained LoRA adapter for evaluation.

Usage:
    python generate_predictions.py \
        --model_name_or_path Qwen/Qwen3-8B-Instruct \
        --adapter_path outputs/adapter/adapter_style \
        --eval_file data/training/eval/benchmark.jsonl \
        --output outputs/predictions.jsonl
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any, Dict, List

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

try:
    from peft import PeftModel
except ImportError as exc:
    raise SystemExit("Missing dependency: peft. Install with: pip install peft") from exc


DEFAULT_SYSTEM_PROMPT = (
    "你是通用教学平台的 AI 助教。请按以下结构回答：\n"
    "### 结论\n"
    "### 推导\n"
    "### 检查（单位/边界条件/适用条件）"
)

REFUSAL_SENTENCE_PATTERNS = [
    re.compile(r"^(?:抱歉|对不起)?[,，]?(?:我)?(?:现在)?(?:无法|不能|不便|没法|不能够).{0,24}(?:回答|提供|协助|完成|执行|给出|处理)"),
    re.compile(r"^(?:无法|不能|不便|没法).{0,24}(?:作业|该题|题目|请求|问题).{0,16}(?:答案|内容|帮助)"),
    re.compile(r"^(?:我)?(?:无法|不能|不便|没法)(?:确定|判断).{0,16}(?:答案|结果|结论)"),
    re.compile(r"^(?:请|请先)(?:补充|提供).{0,20}(?:题目|上下文|信息|条件)"),
    re.compile(r"(?:信息|资料|上下文).{0,10}(?:不足|缺失|不完整).{0,10}(?:无法|不能)"),
]
SHORT_REFUSAL_PHRASES = (
    "无法回答",
    "不能回答",
    "无法提供",
    "不能提供",
    "无法确定",
    "无法执行",
    "拒绝回答",
)
TOOL_NAME_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_.-]{0,127}$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate predictions using LoRA adapter")
    parser.add_argument("--model_name_or_path", type=str, required=True,
                        help="Base model name or path")
    parser.add_argument("--adapter_path", type=str, required=True,
                        help="Path to LoRA adapter")
    parser.add_argument("--eval_file", type=str, required=True,
                        help="Benchmark JSONL file")
    parser.add_argument("--output", type=str, default="outputs/predictions.jsonl",
                        help="Output predictions JSONL")
    parser.add_argument("--max_new_tokens", type=int, default=1024,
                        help="Maximum tokens to generate")
    parser.add_argument("--batch_size", type=int, default=1,
                        help="Batch size for generation")
    parser.add_argument("--temperature", type=float, default=0.7,
                        help="Sampling temperature")
    parser.add_argument("--top_p", type=float, default=0.9,
                        help="Top-p sampling parameter")
    parser.add_argument("--use_4bit", action="store_true",
                        help="Load base model in 4-bit quantization")
    parser.add_argument("--bf16", action="store_true",
                        help="Use bfloat16 precision")
    parser.add_argument("--system_prompt", type=str, default="",
                        help="Override system prompt (optional)")
    parser.add_argument("--limit", type=int, default=0,
                        help="Limit number of eval samples (0 = no limit)")
    return parser.parse_args()


def load_eval_file(path: Path) -> List[Dict[str, Any]]:
    """Load evaluation benchmark JSONL."""
    items: List[Dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                items.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return items


def extract_query(item: Dict[str, Any]) -> str:
    """Extract query from benchmark item."""
    for key in ("query", "prompt", "question", "input"):
        if key in item:
            return str(item[key])
    if "messages" in item:
        for msg in item["messages"]:
            if msg.get("role") == "user":
                return str(msg.get("content", ""))
    return ""


def build_messages(item: Dict[str, Any], system_prompt: str) -> List[Dict[str, str]]:
    """Build chat messages for generation."""
    system = system_prompt or DEFAULT_SYSTEM_PROMPT
    raw_messages = item.get("messages")

    if isinstance(raw_messages, list) and raw_messages:
        messages: List[Dict[str, str]] = []
        for msg in raw_messages:
            if not isinstance(msg, dict):
                continue
            role = msg.get("role") or "user"
            content = "" if msg.get("content") is None else str(msg.get("content"))
            if role == "system" and system_prompt:
                # Override system prompt when provided
                continue
            messages.append({"role": role, "content": content})

        if system_prompt:
            messages = [{"role": "system", "content": system_prompt}] + [
                m for m in messages if m.get("role") != "system"
            ]
        elif not any(m.get("role") == "system" for m in messages):
            messages = [{"role": "system", "content": system}] + messages

        last_user_idx = None
        for idx, msg in enumerate(messages):
            if msg.get("role") == "user":
                last_user_idx = idx
        if last_user_idx is not None:
            return messages[: last_user_idx + 1]

    query = extract_query(item)
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": query},
    ]


def format_prompt(tokenizer, messages: List[Dict[str, str]]) -> str:
    """Convert messages to model prompt string."""
    if hasattr(tokenizer, "apply_chat_template") and getattr(tokenizer, "chat_template", None):
        return tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True,
        )
    return "\n".join([f"<{m['role']}>\n{m['content']}" for m in messages])


def detect_refusal(response: str) -> bool:
    """Detect if response is a refusal."""
    text = re.sub(r"\s+", " ", response or "").strip()
    if not text:
        return False
    sentences = [s.strip() for s in re.split(r"[。！？\n]+", text) if s.strip()]
    for sentence in sentences:
        for pattern in REFUSAL_SENTENCE_PATTERNS:
            if pattern.search(sentence):
                return True
    return len(text) <= 120 and any(phrase in text for phrase in SHORT_REFUSAL_PHRASES)


def _append_unique(values: List[str], candidate: str) -> None:
    name = candidate.strip().strip("`\"'")
    if not name or not TOOL_NAME_RE.fullmatch(name):
        return
    if name not in values:
        values.append(name)


def _collect_tool_names_from_obj(obj: Any, names: List[str]) -> None:
    if isinstance(obj, dict):
        fn = obj.get("function")
        if isinstance(fn, dict):
            fn_name = fn.get("name")
            if isinstance(fn_name, str):
                _append_unique(names, fn_name)
        name = obj.get("name")
        if isinstance(name, str) and (
            "arguments" in obj or "function" in obj or obj.get("type") in {"function", "tool"}
        ):
            _append_unique(names, name)
        for value in obj.values():
            _collect_tool_names_from_obj(value, names)
    elif isinstance(obj, list):
        for item in obj:
            _collect_tool_names_from_obj(item, names)


def extract_tool_calls(response: str) -> List[str]:
    """Extract tool call names from response."""
    tools: List[str] = []

    for block in re.findall(r"<tool_calls>(.*?)</tool_calls>", response, re.DOTALL):
        payload = block.strip()
        if not payload:
            continue
        try:
            parsed = json.loads(payload)
        except json.JSONDecodeError:
            for name in re.findall(r'"name"\s*:\s*"([^"]+)"', payload):
                _append_unique(tools, name)
        else:
            _collect_tool_names_from_obj(parsed, tools)

    for block in re.findall(r"```(?:json)?\s*([\[{].*?[\]}])\s*```", response, re.DOTALL):
        try:
            parsed = json.loads(block)
        except json.JSONDecodeError:
            continue
        _collect_tool_names_from_obj(parsed, tools)

    for pattern in (
        r'"function"\s*:\s*\{\s*"name"\s*:\s*"([^"]+)"',
        r'"tool_name"\s*:\s*"([^"]+)"',
        r'(?:调用(?:工具|函数)|工具(?:调用)?|函数(?:调用)?)\s*[:：]\s*([A-Za-z_][A-Za-z0-9_.-]*)',
    ):
        for name in re.findall(pattern, response):
            _append_unique(tools, name)

    return tools


def _looks_like_math_interval(content: str) -> bool:
    compact = content.strip()
    if any(op in compact for op in ("∈", "≤", "≥", "<=", ">=")):
        return True
    if re.fullmatch(r"-?\d+(?:\.\d+)?\s*,\s*[A-Za-z]", compact):
        return True
    if re.fullmatch(r"[A-Za-z]\s*,\s*[A-Za-z]", compact):
        return True
    return False


def _normalize_citation_token(token: str) -> str:
    return token.strip().strip("[](){}<>.,;:!?\"'")


def _is_valid_citation_token(token: str) -> bool:
    if not token or token.startswith("#"):
        return False
    if re.fullmatch(r"\d{1,4}", token):
        return True
    if re.fullmatch(r"[A-Za-z]", token):
        return False
    return bool(re.fullmatch(r"[A-Za-z][A-Za-z0-9_.-]{1,63}", token))


def extract_citations(response: str) -> List[str]:
    """Extract citation markers from response."""
    matches = re.findall(r"\[([^\]]+)\]", response)
    results: List[str] = []
    for m in matches:
        if _looks_like_math_interval(m):
            continue
        for token in re.split(r"[,\s]+", m):
            normalized = _normalize_citation_token(token)
            if _is_valid_citation_token(normalized) and normalized not in results:
                results.append(normalized)
    return results


def generate_batch(
    model,
    tokenizer,
    prompts: List[str],
    max_new_tokens: int,
    temperature: float,
    top_p: float,
) -> List[str]:
    """Generate responses for a batch of prompts."""
    encoded = tokenizer(
        prompts,
        return_tensors="pt",
        padding=True,
        truncation=True,
    )
    encoded = {k: v.to(model.device) for k, v in encoded.items()}
    input_lengths = encoded["attention_mask"].sum(dim=1)

    with torch.no_grad():
        outputs = model.generate(
            **encoded,
            max_new_tokens=max_new_tokens,
            temperature=temperature,
            top_p=top_p,
            do_sample=temperature > 0,
            pad_token_id=tokenizer.pad_token_id or tokenizer.eos_token_id,
        )

    responses: List[str] = []
    for i, output in enumerate(outputs):
        start = int(input_lengths[i].item())
        generated_ids = output[start:]
        response = tokenizer.decode(generated_ids, skip_special_tokens=True)
        responses.append(response.strip())
    return responses


def main() -> None:
    args = parse_args()

    eval_path = Path(args.eval_file)
    if not eval_path.exists():
        raise FileNotFoundError(f"Eval file not found: {eval_path}")

    adapter_path = Path(args.adapter_path)
    if not adapter_path.exists():
        raise FileNotFoundError(f"Adapter path not found: {adapter_path}")

    eval_data = load_eval_file(eval_path)
    if args.limit > 0:
        eval_data = eval_data[: args.limit]

    if not eval_data:
        raise ValueError("No valid eval samples found in eval_file")

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

    print(f"Loading model from {args.model_name_or_path}...")
    tokenizer = AutoTokenizer.from_pretrained(args.model_name_or_path, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    model = AutoModelForCausalLM.from_pretrained(args.model_name_or_path, **model_kwargs)

    print(f"Loading adapter from {args.adapter_path}...")
    model = PeftModel.from_pretrained(model, args.adapter_path)
    model.eval()

    predictions: List[Dict[str, Any]] = []
    total = len(eval_data)
    print(f"Generating predictions for {total} samples with batch size {args.batch_size}...")

    for start_idx in range(0, total, args.batch_size):
        batch_items = eval_data[start_idx: start_idx + args.batch_size]
        batch_messages = [build_messages(item, args.system_prompt) for item in batch_items]
        batch_prompts = [format_prompt(tokenizer, msgs) for msgs in batch_messages]
        batch_responses = generate_batch(
            model,
            tokenizer,
            batch_prompts,
            args.max_new_tokens,
            args.temperature,
            args.top_p,
        )

        for idx, (item, response) in enumerate(zip(batch_items, batch_responses)):
            item_id = item.get("id") or f"sample-{start_idx + idx}"
            predictions.append({
                "id": item_id,
                "response": response,
                "citations": extract_citations(response),
                "tool_calls": extract_tool_calls(response),
                "refused": detect_refusal(response),
            })

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as f:
        for pred in predictions:
            f.write(json.dumps(pred, ensure_ascii=False) + "\n")

    print(f"Written {len(predictions)} predictions to: {output_path}")


if __name__ == "__main__":
    main()
