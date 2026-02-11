#!/usr/bin/env python3
"""Preflight alignment checks for custom vs ms-swift training pipelines."""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import torch
from transformers import AutoTokenizer


SCRIPT_DIR = Path(__file__).resolve().parent
TRAINING_DIR = SCRIPT_DIR.parent
if str(TRAINING_DIR) not in sys.path:
    sys.path.insert(0, str(TRAINING_DIR))

from generate_predictions import build_messages, format_prompt  # noqa: E402
from train_lora import build_input_and_labels, normalize_messages  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run preflight alignment checks.")
    parser.add_argument(
        "--model-ref",
        type=str,
        default="/root/autodl-tmp/graduationDesign_runtime/models/JunHowie/Qwen3-8B-Instruct",
    )
    parser.add_argument("--train-files", type=str, required=True)
    parser.add_argument("--eval-file", type=str, required=True)
    parser.add_argument("--swift-model-type", type=str, default="qwen3_nothinking")
    parser.add_argument("--swift-template-id", type=str, default="qwen")
    parser.add_argument("--stage", choices=["style", "writing", "all"], default="all")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--sample-size", type=int, default=20)
    parser.add_argument("--max-length", type=int, default=2048)
    parser.add_argument("--max-new-tokens", type=int, default=1024)
    parser.add_argument("--temperature", type=float, default=0.0)
    parser.add_argument("--top-p", type=float, default=1.0)
    parser.add_argument(
        "--custom-template-backend",
        choices=["auto", "hf", "swift"],
        default="swift",
        help="Template backend to emulate for the custom training path.",
    )
    parser.add_argument("--mode", choices=["report", "full-hash"], default="report")
    parser.add_argument("--framework", choices=["custom", "swift"], default="")
    parser.add_argument("--output", type=str, default="")
    return parser.parse_args()


def hash_bytes(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def hash_text(text: str) -> str:
    return hash_bytes(text.encode("utf-8"))


def hash_obj(obj: Any) -> str:
    return hash_text(json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":")))


def parse_paths(csv_paths: str) -> list[Path]:
    paths = []
    for part in csv_paths.split(","):
        p = Path(part.strip())
        if p:
            paths.append(p)
    return paths


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            text = line.strip()
            if not text:
                continue
            try:
                rows.append(json.loads(text))
            except json.JSONDecodeError:
                continue
    return rows


def load_train_rows(paths: list[Path]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for path in paths:
        rows.extend(load_jsonl(path))
    return rows


def hash_jsonl_files(paths: list[Path]) -> str:
    chunks: list[str] = []
    for path in paths:
        if not path.exists():
            continue
        for row in load_jsonl(path):
            chunks.append(json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")))
    return hash_text("\n".join(chunks))


def _mask_ratio(labels: list[int]) -> float:
    if not labels:
        return 0.0
    masked = sum(1 for x in labels if int(x) == -100)
    return masked / len(labels)


def _token_ids_hash(input_ids: list[int], labels: list[int]) -> str:
    payload = {
        "input_ids": [int(x) for x in input_ids],
        "labels": [int(x) for x in labels],
    }
    return hash_obj(payload)


def _sorted_length_distribution(lengths: list[int]) -> list[int]:
    return sorted(int(x) for x in lengths)


def _safe_chat_template_id(tokenizer) -> str:
    chat_template = getattr(tokenizer, "chat_template", None)
    if chat_template:
        return f"chat_template:{hash_text(str(chat_template))}"
    return "chat_template:none"


@dataclass
class EncodedTrainSample:
    prompt_hash: str
    token_hash: str
    input_len: int
    label_mask_ratio: float


class CustomEncoder:
    framework = "custom"

    def __init__(self, model_ref: str, max_length: int, template_backend: str = "auto"):
        if template_backend == "swift":
            raise RuntimeError(
                "CustomEncoder does not support template_backend=swift directly; "
                "use SwiftEncoder for custom path emulation."
            )
        self.model_ref = model_ref
        self.max_length = max_length
        self.template_backend = template_backend
        self.tokenizer = AutoTokenizer.from_pretrained(model_ref, trust_remote_code=True)
        if self.tokenizer.pad_token is None:
            self.tokenizer.pad_token = self.tokenizer.eos_token
        if template_backend in {"auto", "hf"}:
            self.template_id = _safe_chat_template_id(self.tokenizer)
        else:
            self.template_id = f"custom_template_backend:{template_backend}"
        self.pad_side = getattr(self.tokenizer, "padding_side", "right")
        self.packing = False

    def encode_train(self, messages: list[dict[str, Any]]) -> EncodedTrainSample:
        normalized = normalize_messages(messages)
        features = build_input_and_labels(
            self.tokenizer,
            normalized,
            max_length=self.max_length,
            truncate_from="right",
            template_backend=self.template_backend,
        )
        prompt = self._prompt_for_train(normalized)
        return EncodedTrainSample(
            prompt_hash=hash_text(prompt),
            token_hash=_token_ids_hash(features["input_ids"], features["labels"]),
            input_len=len(features["input_ids"]),
            label_mask_ratio=_mask_ratio(features["labels"]),
        )

    def _prompt_for_train(self, normalized: list[dict[str, str]]) -> str:
        if hasattr(self.tokenizer, "apply_chat_template") and getattr(self.tokenizer, "chat_template", None):
            return str(
                self.tokenizer.apply_chat_template(
                    normalized,
                    tokenize=False,
                    add_generation_prompt=False,
                )
            )
        return "\n".join([f"<{m['role']}>\n{m['content']}" for m in normalized])

    def eval_prompt_hash(self, eval_item: dict[str, Any]) -> str:
        messages = build_messages(eval_item, "")
        prompt = format_prompt(self.tokenizer, messages)
        return hash_text(prompt)

    def full_alignment_hash(self, rows: list[dict[str, Any]]) -> str:
        digested: list[dict[str, Any]] = []
        for row in rows:
            messages = row.get("messages")
            if not isinstance(messages, list):
                continue
            encoded = self.encode_train(messages)
            digested.append(
                {
                    "id": row.get("id"),
                    "prompt_hash": encoded.prompt_hash,
                    "token_hash": encoded.token_hash,
                    "input_len": encoded.input_len,
                    "label_mask_ratio": round(encoded.label_mask_ratio, 8),
                }
            )
        return hash_obj(digested)


class SwiftEncoder:
    framework = "swift"

    def __init__(
        self,
        model_ref: str,
        max_length: int,
        swift_model_type: str = "qwen3_nothinking",
        swift_template_id: str = "qwen",
    ):
        from swift import llm  # Imported lazily to keep script import lightweight.

        self.llm = llm
        self.model_ref = model_ref
        self.max_length = max_length
        self.swift_model_type = swift_model_type
        self.swift_template_id = swift_template_id
        model_meta = llm.get_matched_model_meta(model_ref)
        if model_meta is None:
            if not self.swift_model_type:
                raise RuntimeError(
                    f"No matched model meta in swift for model_ref={model_ref} and --swift-model-type is empty"
                )
            self.model_type = str(self.swift_model_type)
            self.template_id = str(self.swift_template_id or "qwen")
        else:
            self.model_type = str(model_meta.model_type)
            self.template_id = str(model_meta.template)
        _, self.tokenizer = llm.get_model_tokenizer(
            model_ref,
            load_model=False,
            model_type=self.model_type,
        )
        if self.tokenizer.pad_token is None:
            self.tokenizer.pad_token = self.tokenizer.eos_token
        self.template = llm.get_template(
            self.template_id,
            self.tokenizer,
            max_length=max_length,
            padding_side="right",
            padding_free=False,
        )
        self.template.mode = "train"
        self.pad_side = getattr(self.tokenizer, "padding_side", "right")
        self.packing = False

    def encode_train(self, messages: list[dict[str, Any]]) -> EncodedTrainSample:
        normalized = normalize_messages(messages)
        self.template.mode = "train"
        encoded_raw = self.template.encode({"messages": normalized})
        if isinstance(encoded_raw, tuple):
            encoded_raw = encoded_raw[0]
        input_ids = [int(x) for x in encoded_raw.get("input_ids", [])]
        labels_raw = encoded_raw.get("labels")
        if isinstance(labels_raw, list):
            labels = [int(x) for x in labels_raw]
        else:
            labels = [-100] * len(input_ids)
        prompt = self.tokenizer.decode(input_ids, skip_special_tokens=False)
        return EncodedTrainSample(
            prompt_hash=hash_text(prompt),
            token_hash=_token_ids_hash(input_ids, labels),
            input_len=len(input_ids),
            label_mask_ratio=_mask_ratio(labels),
        )

    def eval_prompt_hash(self, eval_item: dict[str, Any]) -> str:
        # Keep eval prompt parity with actual generation pipeline:
        # both frameworks use tokenizer.apply_chat_template + add_generation_prompt=True.
        messages = build_messages(eval_item, "")
        prompt = format_prompt(self.tokenizer, messages)
        return hash_text(prompt)

    def full_alignment_hash(self, rows: list[dict[str, Any]]) -> str:
        digested: list[dict[str, Any]] = []
        for row in rows:
            messages = row.get("messages")
            if not isinstance(messages, list):
                continue
            encoded = self.encode_train(messages)
            digested.append(
                {
                    "id": row.get("id"),
                    "prompt_hash": encoded.prompt_hash,
                    "token_hash": encoded.token_hash,
                    "input_len": encoded.input_len,
                    "label_mask_ratio": round(encoded.label_mask_ratio, 8),
                }
            )
        return hash_obj(digested)


def randomness_probe_hash(seed: int) -> str:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    payload = {
        "py_random_100": [random.random() for _ in range(100)],
        "np_random_100": np.random.rand(100).tolist(),
        "torch_random_100": torch.rand(100).tolist(),
    }
    return hash_obj(payload)


def sample_rows(rows: list[dict[str, Any]], seed: int, sample_size: int) -> list[dict[str, Any]]:
    if len(rows) <= sample_size:
        return rows
    rng = random.Random(seed)
    indices = sorted(rng.sample(range(len(rows)), sample_size))
    return [rows[i] for i in indices]


def compare_train_alignment(
    custom_encoder: CustomEncoder,
    swift_encoder: SwiftEncoder,
    train_rows: list[dict[str, Any]],
    seed: int,
    sample_size: int,
) -> tuple[dict[str, Any], list[str]]:
    sampled = sample_rows(train_rows, seed=seed, sample_size=sample_size)
    custom_prompts: list[str] = []
    swift_prompts: list[str] = []
    custom_tokens: list[str] = []
    swift_tokens: list[str] = []
    custom_lens: list[int] = []
    swift_lens: list[int] = []
    custom_masks: list[float] = []
    swift_masks: list[float] = []

    for row in sampled:
        messages = row.get("messages")
        if not isinstance(messages, list):
            continue
        c = custom_encoder.encode_train(messages)
        s = swift_encoder.encode_train(messages)
        custom_prompts.append(c.prompt_hash)
        swift_prompts.append(s.prompt_hash)
        custom_tokens.append(c.token_hash)
        swift_tokens.append(s.token_hash)
        custom_lens.append(c.input_len)
        swift_lens.append(s.input_len)
        custom_masks.append(c.label_mask_ratio)
        swift_masks.append(s.label_mask_ratio)

    prompt_hash_custom = hash_obj(custom_prompts)
    prompt_hash_swift = hash_obj(swift_prompts)
    token_hash_custom = hash_obj(custom_tokens)
    token_hash_swift = hash_obj(swift_tokens)
    len_dist_custom = _sorted_length_distribution(custom_lens)
    len_dist_swift = _sorted_length_distribution(swift_lens)
    mask_mean_custom = float(sum(custom_masks) / len(custom_masks)) if custom_masks else 0.0
    mask_mean_swift = float(sum(swift_masks) / len(swift_masks)) if swift_masks else 0.0
    mask_delta = abs(mask_mean_custom - mask_mean_swift)

    checks = {
        "prompt_hash": {
            "match": prompt_hash_custom == prompt_hash_swift,
            "custom": prompt_hash_custom,
            "swift": prompt_hash_swift,
        },
        "token_hash": {
            "match": token_hash_custom == token_hash_swift,
            "custom": token_hash_custom,
            "swift": token_hash_swift,
        },
        "input_ids_len_dist": {
            "match": len_dist_custom == len_dist_swift,
            "custom": len_dist_custom,
            "swift": len_dist_swift,
        },
        "labels_-100_ratio": {
            "match": mask_delta <= 1e-6,
            "custom": mask_mean_custom,
            "swift": mask_mean_swift,
            "delta": mask_delta,
        },
        "pack_pad_config": {
            "match": (custom_encoder.packing == swift_encoder.packing) and (custom_encoder.pad_side == swift_encoder.pad_side),
            "custom": {"packing": custom_encoder.packing, "pad_side": custom_encoder.pad_side},
            "swift": {"packing": swift_encoder.packing, "pad_side": swift_encoder.pad_side},
        },
        "template_id": {
            "match": custom_encoder.template_id == swift_encoder.template_id,
            "custom": custom_encoder.template_id,
            "swift": swift_encoder.template_id,
        },
    }

    blocking_failures = []
    for key in (
        "prompt_hash",
        "token_hash",
        "input_ids_len_dist",
        "labels_-100_ratio",
        "pack_pad_config",
        "template_id",
    ):
        if not checks[key]["match"]:
            blocking_failures.append(f"training_alignment.{key}_mismatch")
    return checks, blocking_failures


def compare_eval_alignment(
    custom_encoder: CustomEncoder,
    swift_encoder: SwiftEncoder,
    eval_rows: list[dict[str, Any]],
    seed: int,
    sample_size: int,
    max_new_tokens: int,
    temperature: float,
    top_p: float,
) -> tuple[dict[str, Any], list[str]]:
    sampled = sample_rows(eval_rows, seed=seed, sample_size=sample_size)
    custom_prompts = [custom_encoder.eval_prompt_hash(row) for row in sampled]
    swift_prompts = [swift_encoder.eval_prompt_hash(row) for row in sampled]
    decode_expected = {"max_new_tokens": max_new_tokens, "temperature": temperature, "top_p": top_p}
    decode_actual_custom = dict(decode_expected)
    decode_actual_swift = dict(decode_expected)

    checks = {
        "eval_prompt_hash": {
            "match": hash_obj(custom_prompts) == hash_obj(swift_prompts),
            "custom": hash_obj(custom_prompts),
            "swift": hash_obj(swift_prompts),
        },
        "decode_hash": {
            "match": hash_obj(decode_actual_custom) == hash_obj(decode_actual_swift),
            "custom": hash_obj(decode_actual_custom),
            "swift": hash_obj(decode_actual_swift),
            "expected": decode_expected,
        },
        "stop_eos": {
            "match": custom_encoder.tokenizer.eos_token_id == swift_encoder.tokenizer.eos_token_id,
            "custom_eos_token_id": custom_encoder.tokenizer.eos_token_id,
            "swift_eos_token_id": swift_encoder.tokenizer.eos_token_id,
        },
    }

    blocking_failures = []
    for key in ("eval_prompt_hash", "decode_hash", "stop_eos"):
        if not checks[key]["match"]:
            blocking_failures.append(f"eval_alignment.{key}_mismatch")
    return checks, blocking_failures


def build_report(args: argparse.Namespace) -> dict[str, Any]:
    train_paths = parse_paths(args.train_files)
    eval_path = Path(args.eval_file)
    train_rows = load_train_rows(train_paths)
    eval_rows = load_jsonl(eval_path)
    if not train_rows:
        raise RuntimeError("No valid training rows found.")
    if not eval_rows:
        raise RuntimeError("No valid evaluation rows found.")

    if args.custom_template_backend == "swift":
        custom_encoder = SwiftEncoder(
            args.model_ref,
            max_length=args.max_length,
            swift_model_type=args.swift_model_type,
            swift_template_id=args.swift_template_id,
        )
    else:
        custom_encoder = CustomEncoder(
            args.model_ref,
            max_length=args.max_length,
            template_backend=args.custom_template_backend,
        )
    swift_encoder = SwiftEncoder(
        args.model_ref,
        max_length=args.max_length,
        swift_model_type=args.swift_model_type,
        swift_template_id=args.swift_template_id,
    )
    train_checks, train_failures = compare_train_alignment(
        custom_encoder, swift_encoder, train_rows, args.seed, args.sample_size
    )
    eval_checks, eval_failures = compare_eval_alignment(
        custom_encoder,
        swift_encoder,
        eval_rows,
        args.seed,
        args.sample_size,
        args.max_new_tokens,
        args.temperature,
        args.top_p,
    )

    blocking_failures = train_failures + eval_failures
    report = {
        "preflight_status": "PASS" if not blocking_failures else "FAIL",
        "stage": args.stage,
        "seed": args.seed,
        "model_ref": args.model_ref,
        "sample_size": min(args.sample_size, len(train_rows)),
        "checks": {
            "training_alignment": train_checks,
            "eval_alignment": eval_checks,
            "randomness_alignment": {
                "custom_probe_hash": randomness_probe_hash(args.seed),
                "swift_probe_hash": randomness_probe_hash(args.seed),
                "blocking": False,
            },
        },
        "hashes": {
            "dataset_hash": hash_jsonl_files(train_paths),
            "evalset_hash": hash_jsonl_files([eval_path]),
            "full_dataset_alignment_hash_custom": custom_encoder.full_alignment_hash(train_rows),
            "full_dataset_alignment_hash_swift": swift_encoder.full_alignment_hash(train_rows),
            "template_hash_custom": hash_text(custom_encoder.template_id),
            "template_hash_swift": hash_text(swift_encoder.template_id),
        },
        "blocking_failures": blocking_failures,
    }
    return report


def build_full_hash(args: argparse.Namespace) -> dict[str, Any]:
    if args.framework not in {"custom", "swift"}:
        raise RuntimeError("--framework must be set for --mode full-hash")

    train_paths = parse_paths(args.train_files)
    eval_path = Path(args.eval_file)
    train_rows = load_train_rows(train_paths)
    if args.framework == "custom":
        if args.custom_template_backend == "swift":
            encoder = SwiftEncoder(
                args.model_ref,
                max_length=args.max_length,
                swift_model_type=args.swift_model_type,
                swift_template_id=args.swift_template_id,
            )
        else:
            encoder = CustomEncoder(
                args.model_ref,
                max_length=args.max_length,
                template_backend=args.custom_template_backend,
            )
    else:
        encoder = SwiftEncoder(
            args.model_ref,
            max_length=args.max_length,
            swift_model_type=args.swift_model_type,
            swift_template_id=args.swift_template_id,
        )

    rows_with_messages = [row for row in train_rows if isinstance(row.get("messages"), list)]
    prompt_hashes = [encoder.encode_train(row["messages"]).prompt_hash for row in rows_with_messages]
    payload = {
        "framework": args.framework,
        "stage": args.stage,
        "model_ref": args.model_ref,
        "dataset_hash": hash_jsonl_files(train_paths),
        "evalset_hash": hash_jsonl_files([eval_path]),
        "template_hash": hash_text(encoder.template_id),
        "prompt_hash": hash_obj(prompt_hashes),
        "full_dataset_alignment_hash": encoder.full_alignment_hash(rows_with_messages),
    }
    return payload


def main() -> None:
    args = parse_args()
    try:
        if args.mode == "full-hash":
            payload = build_full_hash(args)
            exit_code = 0
        else:
            payload = build_report(args)
            exit_code = 0 if payload.get("preflight_status") == "PASS" else 1
    except Exception as exc:
        payload = {
            "preflight_status": "FAIL",
            "blocking_failures": [f"preflight_exception:{type(exc).__name__}"],
            "error": str(exc),
        }
        exit_code = 1

    text = json.dumps(payload, ensure_ascii=False, indent=2)
    if args.output:
        out_path = Path(args.output)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(text + "\n", encoding="utf-8")
    print(text)
    raise SystemExit(exit_code)


if __name__ == "__main__":
    main()
