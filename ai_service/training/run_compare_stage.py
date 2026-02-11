#!/usr/bin/env python3
"""Run one custom/swift compare stage and emit metrics.json + run_manifest_v2."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import torch


TARGET_MODULES_DEFAULT = "q_proj,k_proj,v_proj,o_proj,gate_proj,up_proj,down_proj"
DECODE_PARAMS_EXPECTED = {"temperature": 0.0, "top_p": 1.0, "max_new_tokens": 1024}
DEFAULT_MODEL_REF = "/root/autodl-tmp/graduationDesign_runtime/models/JunHowie/Qwen3-8B-Instruct"
QUANTIZATION_MODE_QLORA = "qlora_4bit_nf4"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run one compare-stage training/eval run.")
    parser.add_argument("--batch", type=str, required=True)
    parser.add_argument("--framework", choices=["custom", "swift"], required=True)
    parser.add_argument("--stage", choices=["style", "writing", "all"], required=True)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--python-bin", type=str, default="python3")
    parser.add_argument("--model-ref", type=str, default=DEFAULT_MODEL_REF)
    parser.add_argument("--swift-model-type", type=str, default="qwen3_nothinking")
    parser.add_argument("--swift-template-id", type=str, default="qwen")
    parser.add_argument("--out-root", type=str, default="outputs/training_compare")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--resume-from", type=str, default="")
    parser.add_argument("--max-steps", type=int, default=200)
    parser.add_argument("--max-length", type=int, default=2048)
    parser.add_argument("--learning-rate", type=float, default=1e-4)
    parser.add_argument("--per-device-train-batch-size", type=int, default=1)
    parser.add_argument("--gradient-accumulation-steps", type=int, default=8)
    parser.add_argument("--lora-r", type=int, default=16)
    parser.add_argument("--lora-alpha", type=int, default=32)
    parser.add_argument("--lora-dropout", type=float, default=0.05)
    parser.add_argument("--target-modules", type=str, default=TARGET_MODULES_DEFAULT)
    parser.add_argument("--skip-preflight", action="store_true")
    parser.add_argument("--sample-size", type=int, default=20)
    parser.add_argument(
        "--use-qlora",
        dest="use_qlora",
        action="store_true",
        default=True,
        help="Enable 4-bit QLoRA path (default: enabled).",
    )
    parser.add_argument(
        "--no-use-qlora",
        dest="use_qlora",
        action="store_false",
        help="Disable QLoRA and run LoRA baseline.",
    )
    parser.add_argument(
        "--custom-template-backend",
        choices=["auto", "hf", "swift"],
        default="swift",
        help="Template backend used by custom training path for data->tokenize->labels alignment.",
    )
    return parser.parse_args()


def project_root() -> Path:
    current = Path(__file__).resolve()
    for parent in current.parents:
        if (parent / "README.md").exists() and (parent / "code").exists():
            return parent
    return current.parents[3]


def stage_train_files(root: Path, stage: str) -> list[Path]:
    base = root / "data/training/processed"
    if stage == "style":
        return [base / "style_sft.jsonl"]
    if stage == "writing":
        return [base / "writing_sft.jsonl"]
    return [base / "style_sft.jsonl", base / "writing_sft.jsonl"]


def stage_eval_file(root: Path, stage: str) -> Path:
    base = root / "data/training/eval"
    if stage == "style":
        return base / "style_benchmark.jsonl"
    if stage == "writing":
        return base / "writing_benchmark.jsonl"
    return base / "benchmark_formal_v1.jsonl"


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def run_logged(cmd: list[str], cwd: Path, log_path: Path) -> int:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("w", encoding="utf-8") as f:
        f.write(f"$ {' '.join(cmd)}\n\n")
        f.flush()
        proc = subprocess.run(cmd, cwd=cwd, stdout=f, stderr=subprocess.STDOUT)
    return proc.returncode


def run_capture(cmd: list[str], cwd: Path) -> tuple[int, str, str]:
    proc = subprocess.run(cmd, cwd=cwd, text=True, capture_output=True)
    return proc.returncode, proc.stdout, proc.stderr


def parse_json_from_mixed_output(text: str) -> dict[str, Any]:
    decoder = json.JSONDecoder()
    for i, ch in enumerate(text):
        if ch != "{":
            continue
        try:
            payload, _ = decoder.raw_decode(text[i:])
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict):
            return payload
    raise json.JSONDecodeError("No JSON object found in output", text, 0)


def sha_hash(obj: Any) -> str:
    import hashlib

    text = json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def git_info(root: Path) -> tuple[str, bool]:
    code, out, _ = run_capture(["git", "rev-parse", "HEAD"], root)
    commit = out.strip() if code == 0 else "UNKNOWN"
    code, out, _ = run_capture(["git", "status", "--porcelain"], root)
    dirty = bool(out.strip()) if code == 0 else True
    return commit, dirty


def parse_quality_summary(eval_report_json: Path) -> dict[str, float]:
    if not eval_report_json.exists():
        return {
            "key_point_coverage": 0.0,
            "refusal_accuracy": 0.0,
            "response_format": 0.0,
            "tool_call_accuracy": 0.0,
            "citation_accuracy": 0.0,
        }
    data = read_json(eval_report_json)
    summary = data.get("summary") if isinstance(data, dict) else {}
    result = {
        "key_point_coverage": 0.0,
        "refusal_accuracy": 0.0,
        "response_format": 0.0,
        "tool_call_accuracy": 0.0,
        "citation_accuracy": 0.0,
    }
    if isinstance(summary, dict):
        for k in result:
            if isinstance(summary.get(k), (int, float)):
                result[k] = float(summary[k])
    return result


def parse_steps_per_sec(log_path: Path) -> float | None:
    if not log_path.exists():
        return None
    text = log_path.read_text(encoding="utf-8", errors="ignore")
    patterns = [
        r"train_steps_per_second['\"]?\s*[:=]\s*['\"]?([0-9]+(?:\.[0-9]+)?)",
        r"steps/s[:=]\s*([0-9]+(?:\.[0-9]+)?)",
    ]
    for p in patterns:
        m = re.search(p, text)
        if m:
            try:
                return float(m.group(1))
            except ValueError:
                continue
    return None


def parse_peak_memory_gb(framework: str, run_dir: Path, train_log: Path) -> float | None:
    # Primary: torch peak in current process (if training ran in this process this is meaningful).
    peak = None
    if torch.cuda.is_available():
        try:
            peak = float(torch.cuda.max_memory_allocated() / 1e9)
        except Exception:
            peak = None

    # Secondary: parse logs.
    log_text = train_log.read_text(encoding="utf-8", errors="ignore") if train_log.exists() else ""
    if framework == "custom":
        m = re.findall(r"peak_memory_gb['\"]?\s*[:=]\s*['\"]?([0-9]+(?:\.[0-9]+)?)", log_text)
        if m:
            try:
                parsed = max(float(x) for x in m)
                peak = max(peak or 0.0, parsed)
            except ValueError:
                pass
    else:
        for path in sorted(run_dir.glob("**/logging.jsonl")):
            try:
                with path.open("r", encoding="utf-8") as f:
                    for line in f:
                        row = json.loads(line)
                        mem = row.get("memory")
                        if isinstance(mem, (int, float)):
                            gb = float(mem) / (1024 ** 3)
                            peak = max(peak or 0.0, gb)
                        elif isinstance(mem, str):
                            mm = re.search(r"([0-9]+(?:\.[0-9]+)?)", mem)
                            if mm:
                                gb = float(mm.group(1))
                                peak = max(peak or 0.0, gb)
            except Exception:
                continue
    return peak


def find_adapter_path(framework: str, adapter_dir: Path) -> Path:
    if framework == "custom":
        return adapter_dir
    if (adapter_dir / "adapter_model.safetensors").exists():
        return adapter_dir
    candidates = sorted(
        {p.parent for p in adapter_dir.glob("**/adapter_model.safetensors")},
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    if candidates:
        return candidates[0]
    return adapter_dir


def preflight_report(
    root: Path,
    python_bin: str,
    model_ref: str,
    swift_model_type: str,
    swift_template_id: str,
    stage: str,
    seed: int,
    sample_size: int,
    train_files: list[Path],
    eval_file: Path,
    max_length: int,
    run_dir: Path,
    custom_template_backend: str,
) -> tuple[dict[str, Any], list[str]]:
    report_path = run_dir / "preflight_report.json"
    cmd = [
        python_bin,
        str(root / "code/ai_service/training/benchmarks/preflight_alignment.py"),
        "--model-ref",
        model_ref,
        "--swift-model-type",
        swift_model_type,
        "--swift-template-id",
        swift_template_id,
        "--stage",
        stage,
        "--seed",
        str(seed),
        "--sample-size",
        str(sample_size),
        "--max-length",
        str(max_length),
        "--max-new-tokens",
        str(DECODE_PARAMS_EXPECTED["max_new_tokens"]),
        "--temperature",
        str(DECODE_PARAMS_EXPECTED["temperature"]),
        "--top-p",
        str(DECODE_PARAMS_EXPECTED["top_p"]),
        "--custom-template-backend",
        custom_template_backend,
        "--train-files",
        ",".join(str(p) for p in train_files),
        "--eval-file",
        str(eval_file),
        "--output",
        str(report_path),
    ]
    code, out, err = run_capture(cmd, root)
    if not report_path.exists():
        payload = {
            "preflight_status": "FAIL",
            "blocking_failures": [f"preflight_process_failed:{code}"],
            "stdout": out,
            "stderr": err,
        }
    else:
        payload = read_json(report_path)
        if code != 0 and payload.get("preflight_status") != "FAIL":
            payload["preflight_status"] = "FAIL"
            payload.setdefault("blocking_failures", []).append(f"preflight_process_failed:{code}")
    failures = payload.get("blocking_failures") if isinstance(payload, dict) else []
    if not isinstance(failures, list):
        failures = ["preflight_blocking_failures_invalid_type"]
    return payload, [str(x) for x in failures]


def full_hash_payload(
    root: Path,
    python_bin: str,
    model_ref: str,
    swift_model_type: str,
    swift_template_id: str,
    stage: str,
    train_files: list[Path],
    eval_file: Path,
    max_length: int,
    framework: str,
    custom_template_backend: str,
) -> dict[str, Any]:
    cmd = [
        python_bin,
        str(root / "code/ai_service/training/benchmarks/preflight_alignment.py"),
        "--mode",
        "full-hash",
        "--framework",
        framework,
        "--model-ref",
        model_ref,
        "--swift-model-type",
        swift_model_type,
        "--swift-template-id",
        swift_template_id,
        "--stage",
        stage,
        "--max-length",
        str(max_length),
        "--custom-template-backend",
        custom_template_backend,
        "--train-files",
        ",".join(str(p) for p in train_files),
        "--eval-file",
        str(eval_file),
    ]
    code, out, err = run_capture(cmd, root)
    if code != 0:
        raise RuntimeError(f"full-hash failed for {framework}: {err or out}")
    return parse_json_from_mixed_output(out)


def _check_type(value: Any, expected: Any) -> bool:
    if isinstance(expected, list):
        return any(_check_type(value, e) for e in expected)
    if expected == "string":
        return isinstance(value, str)
    if expected == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if expected == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if expected == "boolean":
        return isinstance(value, bool)
    if expected == "object":
        return isinstance(value, dict)
    if expected == "array":
        return isinstance(value, list)
    if expected == "null":
        return value is None
    return True


def validate_metrics(payload: dict[str, Any], schema_path: Path) -> list[str]:
    schema = read_json(schema_path)
    errors: list[str] = []

    def walk(value: Any, spec: dict[str, Any], path: str) -> None:
        expected_type = spec.get("type")
        if expected_type is not None and not _check_type(value, expected_type):
            errors.append(f"{path}: type mismatch expected={expected_type} got={type(value).__name__}")
            return
        enum_values = spec.get("enum")
        if isinstance(enum_values, list) and value not in enum_values:
            errors.append(f"{path}: value {value!r} not in enum {enum_values!r}")
            return

        if isinstance(value, str):
            min_len = spec.get("minLength")
            if isinstance(min_len, int) and len(value) < min_len:
                errors.append(f"{path}: string length {len(value)} < minLength {min_len}")
            max_len = spec.get("maxLength")
            if isinstance(max_len, int) and len(value) > max_len:
                errors.append(f"{path}: string length {len(value)} > maxLength {max_len}")

        if isinstance(value, (int, float)) and not isinstance(value, bool):
            minimum = spec.get("minimum")
            if isinstance(minimum, (int, float)) and value < minimum:
                errors.append(f"{path}: value {value} < minimum {minimum}")
            maximum = spec.get("maximum")
            if isinstance(maximum, (int, float)) and value > maximum:
                errors.append(f"{path}: value {value} > maximum {maximum}")

        if isinstance(value, dict):
            for key in spec.get("required", []):
                if key not in value:
                    errors.append(f"{path}.{key}: required field missing")
            properties = spec.get("properties", {})
            additional = spec.get("additionalProperties", True)
            if additional is False:
                for key in value:
                    if key not in properties:
                        errors.append(f"{path}.{key}: additional property is not allowed")
            for key, child_spec in properties.items():
                if key in value and isinstance(child_spec, dict):
                    walk(value[key], child_spec, f"{path}.{key}")
        if isinstance(value, list):
            min_items = spec.get("minItems")
            if isinstance(min_items, int) and len(value) < min_items:
                errors.append(f"{path}: item count {len(value)} < minItems {min_items}")
            max_items = spec.get("maxItems")
            if isinstance(max_items, int) and len(value) > max_items:
                errors.append(f"{path}: item count {len(value)} > maxItems {max_items}")
            if isinstance(spec.get("items"), dict):
                for i, item in enumerate(value):
                    walk(item, spec["items"], f"{path}[{i}]")

    walk(payload, schema, "$")
    return errors


def append_manifest(manifest_path: Path, entry: dict[str, Any]) -> None:
    if manifest_path.exists():
        data = read_json(manifest_path)
    else:
        data = {"version": "run_manifest_v2", "runs": []}
    if not isinstance(data.get("runs"), list):
        data["runs"] = []
    data["version"] = "run_manifest_v2"
    data["runs"].append(entry)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def detect_swift_version(python_bin: str, cwd: Path) -> str:
    code, out, _ = run_capture(
        [
            python_bin,
            "-c",
            "import swift; print(getattr(swift, '__version__', 'unknown'))",
        ],
        cwd,
    )
    if code != 0:
        return "NOT_INSTALLED"
    return out.strip() or "unknown"


def swift_model_type(python_bin: str, cwd: Path, model_ref: str, override: str = "") -> str:
    if override:
        return override
    code, out, err = run_capture(
        [
            python_bin,
            "-c",
            (
                "from swift import llm; "
                "meta=llm.get_matched_model_meta(%r); "
                "print(meta.model_type if meta is not None else '')"
            )
            % model_ref,
        ],
        cwd,
    )
    model_type = out.strip()
    if code != 0 or not model_type:
        raise RuntimeError(f"swift cannot resolve model_type for model_ref={model_ref}: {err or out}")
    return model_type


def swift_help_text(python_bin: str, cwd: Path) -> str:
    code, out, err = run_capture([python_bin, "-m", "swift.cli.sft", "--help"], cwd)
    if code != 0:
        raise RuntimeError(f"swift.cli.sft --help failed: {err or out}")
    return out + "\n" + err


def build_swift_qlora_args(help_text: str) -> tuple[list[str], list[str]]:
    args: list[str] = []
    flags: list[str] = []

    def add_arg(flag: str, value: str) -> None:
        if flag in help_text:
            args.extend([flag, value])
            flags.append(flag)

    # Cross-version compatibility mapping.
    add_arg("--quantization_bit", "4")
    add_arg("--quant_bits", "4")
    add_arg("--load_in_4bit", "true")
    add_arg("--quant_method", "bnb")
    add_arg("--bnb_4bit_quant_type", "nf4")
    add_arg("--bnb_4bit_use_double_quant", "true")
    add_arg("--bnb_4bit_compute_dtype", "bfloat16")
    return args, flags


def read_custom_training_config(adapter_dir: Path) -> dict[str, Any]:
    config_path = adapter_dir / "training_config.json"
    if not config_path.exists():
        return {}
    try:
        payload = read_json(config_path)
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def build_base_metrics(
    args: argparse.Namespace,
    run_id: str,
    git_commit: str,
    dirty_flag: bool,
    swift_version: str,
    dataset_hash: str,
    evalset_hash: str,
    template_hash: str,
    prompt_hash: str,
    full_hash: str,
    train_log: Path,
    predict_log: Path,
    evaluate_log: Path,
    eval_report_json: Path,
) -> dict[str, Any]:
    hyperparam_payload = {
        "max_steps": args.max_steps,
        "max_length": args.max_length,
        "learning_rate": args.learning_rate,
        "per_device_train_batch_size": args.per_device_train_batch_size,
        "gradient_accumulation_steps": args.gradient_accumulation_steps,
        "lora_r": args.lora_r,
        "lora_alpha": args.lora_alpha,
        "lora_dropout": args.lora_dropout,
        "target_modules": args.target_modules,
        "custom_template_backend": args.custom_template_backend if args.framework == "custom" else "n/a",
        "use_qlora": bool(args.use_qlora),
    }
    return {
        "run_id": run_id,
        "batch": args.batch,
        "framework": args.framework,
        "trainer": f"{args.python_bin} -m swift.cli.sft" if args.framework == "swift" else "train_lora.py",
        "stage": args.stage,
        "seed": args.seed,
        "status": "FAILED",
        "model_ref": args.model_ref,
        "git_commit": git_commit,
        "dirty_flag": dirty_flag,
        "python_bin": args.python_bin,
        "swift_version": swift_version,
        "quantization_mode": QUANTIZATION_MODE_QLORA if args.use_qlora else "none",
        "qlora_requested": bool(args.use_qlora),
        "qlora_effective": False,
        "template_hash": template_hash,
        "prompt_hash": prompt_hash,
        "hyperparam_hash": sha_hash(hyperparam_payload),
        "decode_hash": sha_hash(DECODE_PARAMS_EXPECTED),
        "dataset_hash": dataset_hash,
        "evalset_hash": evalset_hash,
        "full_dataset_alignment_hash": full_hash,
        "quality_summary": {
            "key_point_coverage": 0.0,
            "refusal_accuracy": 0.0,
            "response_format": 0.0,
            "tool_call_accuracy": 0.0,
            "citation_accuracy": 0.0,
        },
        "train_wall_time_sec": 0.0,
        "steps_per_sec": None,
        "peak_memory_gb": None,
        "total_examples_consumed": 0,
        "effective_tokens_nonpad": 0,
        "decode_params_expected": dict(DECODE_PARAMS_EXPECTED),
        "decode_params_actual": dict(DECODE_PARAMS_EXPECTED),
        "randomness_probe_hash": "preflight_skipped",
        "warnings": [],
        "blocking_failures": [],
        "artifacts": {
            "train_log": str(train_log),
            "predict_log": str(predict_log),
            "evaluate_log": str(evaluate_log),
            "eval_report_json": str(eval_report_json),
        },
    }


def main() -> None:
    args = parse_args()
    root = project_root()
    if "swift-vs-custom" not in args.batch:
        raise SystemExit("[ERROR] batch must contain 'swift-vs-custom' to avoid mixing with formal runs.")

    train_files = stage_train_files(root, args.stage)
    eval_file = stage_eval_file(root, args.stage)
    for path in [*train_files, eval_file]:
        if not path.exists():
            raise SystemExit(f"[ERROR] Missing data file: {path}")

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_id = args.resume_from.strip() or f"{args.stage}_{args.framework}_s{args.seed}_{timestamp}"
    batch_dir = root / args.out_root / args.batch
    run_dir = batch_dir / "runs" / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    adapter_dir = run_dir / "adapter"
    pred_path = run_dir / "predictions.jsonl"
    eval_report_json = run_dir / "eval_report.json"
    train_log = run_dir / "train.log"
    predict_log = run_dir / "predict.log"
    evaluate_log = run_dir / "evaluate.log"
    metrics_path = run_dir / "metrics.json"
    preflight_path = run_dir / "preflight_report.json"
    schema_path = root / "code/ai_service/training/benchmarks/metrics_schema.json"

    if args.resume_from and metrics_path.exists():
        existing = read_json(metrics_path)
        if existing.get("status") == "SUCCESS":
            print(json.dumps({"run_id": run_id, "status": "SKIPPED_ALREADY_SUCCESS"}, ensure_ascii=False))
            return

    git_commit, dirty_flag = git_info(root)
    swift_version = detect_swift_version(args.python_bin, root)
    if swift_version == "NOT_INSTALLED":
        print("[WARN] swift package is not installed in python-bin runtime.")
    if dirty_flag:
        print("[WARN] Working tree is dirty; this is recorded in metrics.json but not blocking.")

    preflight_failures: list[str] = []
    preflight_payload: dict[str, Any] = {}
    if not args.skip_preflight:
        preflight_payload, preflight_failures = preflight_report(
            root=root,
            python_bin=args.python_bin,
            model_ref=args.model_ref,
            swift_model_type=args.swift_model_type,
            swift_template_id=args.swift_template_id,
            stage=args.stage,
            seed=args.seed,
            sample_size=args.sample_size,
            train_files=train_files,
            eval_file=eval_file,
            max_length=args.max_length,
            run_dir=run_dir,
            custom_template_backend=args.custom_template_backend,
        )
        preflight_path.write_text(
            json.dumps(preflight_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )

    # Hash payload before run for schema fields.
    hash_payload = full_hash_payload(
        root=root,
        python_bin=args.python_bin,
        model_ref=args.model_ref,
        swift_model_type=args.swift_model_type,
        swift_template_id=args.swift_template_id,
        stage=args.stage,
        train_files=train_files,
        eval_file=eval_file,
        max_length=args.max_length,
        framework=args.framework,
        custom_template_backend=args.custom_template_backend,
    )
    preflight_reference_full_hash = str(hash_payload.get("full_dataset_alignment_hash", ""))
    if preflight_payload:
        preflight_hashes = preflight_payload.get("hashes", {})
        if isinstance(preflight_hashes, dict):
            key = f"full_dataset_alignment_hash_{args.framework}"
            ref = preflight_hashes.get(key)
            if isinstance(ref, str) and ref:
                preflight_reference_full_hash = ref

    metrics = build_base_metrics(
        args=args,
        run_id=run_id,
        git_commit=git_commit,
        dirty_flag=dirty_flag,
        swift_version=swift_version,
        dataset_hash=str(hash_payload.get("dataset_hash", "")),
        evalset_hash=str(hash_payload.get("evalset_hash", "")),
        template_hash=str(hash_payload.get("template_hash", "")),
        prompt_hash=str(hash_payload.get("prompt_hash", "")),
        full_hash=preflight_reference_full_hash,
        train_log=train_log,
        predict_log=predict_log,
        evaluate_log=evaluate_log,
        eval_report_json=eval_report_json,
    )
    randomness_probe_hash = (
        preflight_payload.get("checks", {})
        .get("randomness_alignment", {})
        .get(f"{args.framework}_probe_hash", "")
        if preflight_payload
        else ""
    )
    if isinstance(randomness_probe_hash, str) and randomness_probe_hash:
        metrics["randomness_probe_hash"] = randomness_probe_hash
    elif preflight_payload:
        metrics["warnings"].append("missing_randomness_probe_hash_in_preflight")

    if preflight_failures:
        metrics["status"] = "INVALID"
        metrics["blocking_failures"].extend(preflight_failures)
        metrics["warnings"].append("preflight_status=FAIL")

    train_started = time.perf_counter()
    train_rc = 0
    pred_rc = 1
    eval_rc = 1
    swift_quant_flags: list[str] = []

    if torch.cuda.is_available():
        try:
            torch.cuda.reset_peak_memory_stats()
        except Exception:
            metrics["warnings"].append("cuda_reset_peak_memory_stats_failed")

    if args.dry_run:
        metrics["status"] = "DRY_RUN" if not preflight_failures else "INVALID"
    elif metrics["status"] != "INVALID":
        if args.framework == "custom":
            train_cmd = [
                args.python_bin,
                str(root / "code/ai_service/training/train_lora.py"),
                "--model_name_or_path",
                args.model_ref,
                "--train_files",
                ",".join(str(p) for p in train_files),
                "--output_dir",
                str(adapter_dir),
                "--max_length",
                str(args.max_length),
                "--template_backend",
                args.custom_template_backend,
                "--swift_model_type",
                args.swift_model_type,
                "--swift_template_id",
                args.swift_template_id,
                "--per_device_train_batch_size",
                str(args.per_device_train_batch_size),
                "--gradient_accumulation_steps",
                str(args.gradient_accumulation_steps),
                "--learning_rate",
                str(args.learning_rate),
                "--max_steps",
                str(args.max_steps),
                "--lora_r",
                str(args.lora_r),
                "--lora_alpha",
                str(args.lora_alpha),
                "--lora_dropout",
                str(args.lora_dropout),
                "--target_modules",
                args.target_modules,
                "--logging_steps",
                "10",
                "--save_steps",
                str(args.max_steps),
                "--eval_steps",
                str(args.max_steps),
                "--seed",
                str(args.seed),
                "--report_to",
                "none",
            ]
            if args.use_qlora:
                train_cmd.append("--use_qlora")
            if torch.cuda.is_available():
                train_cmd.append("--bf16")
        else:
            mt = swift_model_type(args.python_bin, root, args.model_ref, args.swift_model_type)
            train_cmd = [
                args.python_bin,
                "-m",
                "swift.cli.sft",
                "--model",
                args.model_ref,
                "--model_type",
                mt,
                "--dataset",
                *[str(p) for p in train_files],
                "--output_dir",
                str(adapter_dir),
                "--train_type",
                "lora",
                "--max_steps",
                str(args.max_steps),
                "--max_length",
                str(args.max_length),
                "--learning_rate",
                str(args.learning_rate),
                "--per_device_train_batch_size",
                str(args.per_device_train_batch_size),
                "--gradient_accumulation_steps",
                str(args.gradient_accumulation_steps),
                "--lora_rank",
                str(args.lora_r),
                "--lora_alpha",
                str(args.lora_alpha),
                "--lora_dropout",
                str(args.lora_dropout),
                "--target_modules",
                *args.target_modules.split(","),
                "--seed",
                str(args.seed),
                "--save_steps",
                str(args.max_steps),
                "--eval_steps",
                str(args.max_steps),
                "--logging_steps",
                "10",
                "--weight_decay",
                "0.0",
                "--warmup_ratio",
                "0.03",
                "--check_dataset_strategy",
                "warning",
                "--save_only_model",
                "true",
            ]
            if args.use_qlora:
                swift_help = swift_help_text(args.python_bin, root)
                swift_quant_args, swift_quant_flags = build_swift_qlora_args(swift_help)
                if not swift_quant_args:
                    metrics["status"] = "INVALID"
                    metrics["blocking_failures"].append("swift_cli_no_supported_qlora_flag")
                    metrics["warnings"].append("swift_help_missing_4bit_args")
                else:
                    train_cmd.extend(swift_quant_args)
            if torch.cuda.is_available():
                train_cmd.append("--bf16")

        if metrics["status"] != "INVALID":
            train_rc = run_logged(train_cmd, root, train_log)
        if train_rc == 0:
            if args.framework == "custom":
                training_config = read_custom_training_config(adapter_dir)
                effective = training_config.get("use_qlora_effective")
                if isinstance(effective, bool):
                    metrics["qlora_effective"] = effective
                elif args.use_qlora:
                    metrics["warnings"].append("custom_training_config_missing_use_qlora_effective")
                    metrics["qlora_effective"] = False
                else:
                    metrics["qlora_effective"] = False
            else:
                metrics["qlora_effective"] = bool(args.use_qlora and swift_quant_flags)

            resolved_adapter = find_adapter_path(args.framework, adapter_dir)
            pred_cmd = [
                args.python_bin,
                str(root / "code/ai_service/training/generate_predictions.py"),
                "--model_name_or_path",
                args.model_ref,
                "--adapter_path",
                str(resolved_adapter),
                "--eval_file",
                str(eval_file),
                "--output",
                str(pred_path),
                "--temperature",
                str(DECODE_PARAMS_EXPECTED["temperature"]),
                "--top_p",
                str(DECODE_PARAMS_EXPECTED["top_p"]),
                "--max_new_tokens",
                str(DECODE_PARAMS_EXPECTED["max_new_tokens"]),
            ]
            if torch.cuda.is_available():
                pred_cmd.append("--bf16")
            pred_rc = run_logged(pred_cmd, root, predict_log)
            if pred_rc == 0:
                eval_cmd = [
                    args.python_bin,
                    str(root / "code/ai_service/training/eval_metrics.py"),
                    "--eval_file",
                    str(eval_file),
                    "--pred_file",
                    str(pred_path),
                    "--output",
                    str(eval_report_json),
                    "--group_by_type",
                ]
                eval_rc = run_logged(eval_cmd, root, evaluate_log)

    if metrics["status"] not in {"INVALID", "DRY_RUN"} and args.use_qlora and train_rc == 0:
        if not metrics["qlora_effective"]:
            metrics["status"] = "INVALID"
            metrics["blocking_failures"].append("qlora_requested_but_not_effective")

    metrics["train_wall_time_sec"] = float(time.perf_counter() - train_started)
    metrics["steps_per_sec"] = parse_steps_per_sec(train_log)
    metrics["peak_memory_gb"] = parse_peak_memory_gb(args.framework, run_dir, train_log)

    # Compute sample/token counters using planned steps and observed preflight mask ratio.
    ratio_field = (
        preflight_payload.get("checks", {})
        .get("training_alignment", {})
        .get("labels_-100_ratio", {})
        if preflight_payload
        else {}
    )
    mask_ratio = ratio_field.get(args.framework)
    if not isinstance(mask_ratio, (int, float)):
        mask_ratio = 0.0
    total_examples_consumed = (
        int(args.max_steps) * int(args.per_device_train_batch_size) * int(args.gradient_accumulation_steps)
    )
    metrics["total_examples_consumed"] = max(0, total_examples_consumed)
    metrics["effective_tokens_nonpad"] = int(
        metrics["total_examples_consumed"] * int(args.max_length) * max(0.0, 1.0 - float(mask_ratio))
    )

    if metrics["status"] not in {"INVALID", "DRY_RUN"}:
        if train_rc != 0:
            metrics["status"] = "FAILED"
            metrics["blocking_failures"].append(f"train_failed_rc_{train_rc}")
        elif pred_rc != 0:
            metrics["status"] = "FAILED"
            metrics["blocking_failures"].append(f"predict_failed_rc_{pred_rc}")
        elif eval_rc != 0:
            metrics["status"] = "FAILED"
            metrics["blocking_failures"].append(f"evaluate_failed_rc_{eval_rc}")
        else:
            metrics["status"] = "SUCCESS"
            metrics["quality_summary"] = parse_quality_summary(eval_report_json)

    # Post-run full-hash validation (retroactive INVALID on mismatch).
    try:
        post_hash = full_hash_payload(
            root=root,
            python_bin=args.python_bin,
            model_ref=args.model_ref,
            swift_model_type=args.swift_model_type,
            swift_template_id=args.swift_template_id,
            stage=args.stage,
            train_files=train_files,
            eval_file=eval_file,
            max_length=args.max_length,
            framework=args.framework,
            custom_template_backend=args.custom_template_backend,
        )
        post_full_hash = str(post_hash.get("full_dataset_alignment_hash", ""))
        pre_full_hash = str(metrics.get("full_dataset_alignment_hash", ""))
        metrics["full_dataset_alignment_hash"] = post_full_hash
        if post_full_hash != pre_full_hash:
            metrics["status"] = "INVALID"
            metrics["blocking_failures"].append(
                "post_run_full_dataset_alignment_hash_mismatch_vs_preflight_reference"
            )
    except Exception as exc:
        metrics["status"] = "INVALID"
        metrics["blocking_failures"].append(f"post_run_full_hash_failed:{type(exc).__name__}")

    validation_errors = validate_metrics(metrics, schema_path)
    if validation_errors:
        metrics["status"] = "FAILED"
        metrics["blocking_failures"].extend(validation_errors)

    metrics_path.write_text(json.dumps(metrics, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    entry = {
        "version": "run_manifest_v2_entry",
        "run_id": run_id,
        "batch": args.batch,
        "framework": args.framework,
        "stage": args.stage,
        "seed": args.seed,
        "model_ref": args.model_ref,
        "status": metrics["status"],
        "template_hash": metrics["template_hash"],
        "prompt_hash": metrics["prompt_hash"],
        "hyperparam_hash": metrics["hyperparam_hash"],
        "decode_hash": metrics["decode_hash"],
        "dataset_hash": metrics["dataset_hash"],
        "evalset_hash": metrics["evalset_hash"],
        "full_dataset_alignment_hash": metrics["full_dataset_alignment_hash"],
        "preflight_report": str(preflight_path),
        "metrics_path": str(metrics_path),
        "run_dir": str(run_dir),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    append_manifest(batch_dir / "run_manifest_v2.json", entry)

    print(json.dumps(metrics, ensure_ascii=False, indent=2))
    if metrics["status"] in {"FAILED", "INVALID"}:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
