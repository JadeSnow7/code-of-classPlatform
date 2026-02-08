#!/usr/bin/env python3
"""Run one formal experiment stage and append run_manifest_v1."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


PROFILE_ENV: dict[str, dict[str, str]] = {
    "A": {
        "NUM_TRAIN_EPOCHS": "2",
        "LEARNING_RATE": "1e-4",
        "MAX_LENGTH": "2048",
        "GRADIENT_ACCUMULATION_STEPS": "8",
    },
    "B": {
        "NUM_TRAIN_EPOCHS": "3",
        "LEARNING_RATE": "8e-5",
        "MAX_LENGTH": "3072",
        "GRADIENT_ACCUMULATION_STEPS": "8",
    },
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run a formal training stage and record manifest.")
    parser.add_argument("--batch", type=str, required=True)
    parser.add_argument("--stage", choices=["style", "writing", "all", "tool", "rag", "sample"], required=True)
    parser.add_argument("--benchmark-file", type=str, required=True)
    parser.add_argument("--preset", type=str, default="A", choices=["A", "B"])
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--model-name-or-path", type=str, default="Qwen/Qwen3-8B-Instruct")
    parser.add_argument("--remote-root", type=str, default="")
    parser.add_argument("--skip-dep-check", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def project_root() -> Path:
    current = Path(__file__).resolve()
    for parent in current.parents:
        if (parent / "README.md").exists() and (parent / "code").exists():
            return parent
    return current.parents[3]


def stage_adapter_dir(stage: str) -> str:
    return {
        "style": "adapter_style",
        "writing": "adapter_writing",
        "all": "adapter_multitask",
        "tool": "adapter_tool",
        "rag": "adapter_rag",
        "sample": "adapter_sample",
    }[stage]


def stage_train_files(data_base: str, stage: str) -> str:
    if stage == "style":
        return f"{data_base}/style_sft.jsonl"
    if stage == "writing":
        return f"{data_base}/writing_sft.jsonl"
    if stage == "all":
        return f"{data_base}/style_sft.jsonl,{data_base}/writing_sft.jsonl"
    if stage == "tool":
        return f"{data_base}/tool_sft.jsonl"
    if stage == "rag":
        return f"{data_base}/rag_sft.jsonl"
    return f"{data_base}/style_sft_sample.jsonl"


def run_and_log(cmd: list[str], cwd: Path, log_path: Path, env: dict[str, str]) -> int:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("w", encoding="utf-8") as log_file:
        log_file.write(f"$ {' '.join(cmd)}\n\n")
        log_file.flush()
        proc = subprocess.run(cmd, cwd=cwd, env=env, stdout=log_file, stderr=subprocess.STDOUT)
    return proc.returncode


def read_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def append_manifest(manifest_path: Path, batch: str, remote_root: str, entry: dict[str, Any]) -> None:
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    if manifest_path.exists():
        data = read_json(manifest_path)
    else:
        data = {"version": "run_manifest_v1", "batch": batch, "remote_root": remote_root, "runs": []}

    if "runs" not in data or not isinstance(data["runs"], list):
        data["runs"] = []
    data["version"] = "run_manifest_v1"
    data["batch"] = batch
    if remote_root:
        data["remote_root"] = remote_root
    data["runs"].append(entry)

    with manifest_path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def main() -> None:
    args = parse_args()
    root = project_root()
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_id = f"{args.stage}_{args.preset}_s{args.seed}_{timestamp}"
    started_at = datetime.now(timezone.utc).isoformat()

    batch_dir = root / "outputs/training_sync" / args.batch
    run_dir = batch_dir / "runs" / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    adapter_base = root / "outputs/adapter/formal" / args.batch / run_id
    adapter_path = adapter_base / stage_adapter_dir(args.stage)
    pred_path = run_dir / f"predictions_{args.stage}.jsonl"
    eval_report_json = run_dir / f"eval_report_{args.stage}.json"
    eval_report_md = run_dir / f"eval_report_{args.stage}.md"

    env = os.environ.copy()
    env.update(PROFILE_ENV[args.preset])
    env["MODEL_NAME_OR_PATH"] = args.model_name_or_path
    env["OUT_BASE"] = str(adapter_base)
    env["EVAL_FILE_OVERRIDE"] = str(Path(args.benchmark_file))
    env["SEED"] = str(args.seed)
    if args.skip_dep_check:
        env["SKIP_DEP_CHECK"] = "1"
    if args.dry_run:
        env["TRAIN_DRY_RUN"] = "1"

    run_train_cmd = ["bash", str(root / "code/ai_service/training/run_train.sh"), args.stage]
    train_log = run_dir / "train.log"
    train_exit = run_and_log(run_train_cmd, root, train_log, env)

    status = "FAILED"
    metrics: dict[str, float] = {}

    if train_exit == 0 and not args.dry_run:
        pred_cmd = [
            sys.executable,
            str(root / "code/ai_service/training/generate_predictions.py"),
            "--model_name_or_path",
            args.model_name_or_path,
            "--adapter_path",
            str(adapter_path),
            "--eval_file",
            str(Path(args.benchmark_file)),
            "--output",
            str(pred_path),
        ]
        pred_log = run_dir / "predict.log"
        pred_exit = run_and_log(pred_cmd, root, pred_log, env)
        if pred_exit == 0:
            eval_cmd = [
                sys.executable,
                str(root / "code/ai_service/training/eval_metrics.py"),
                "--eval_file",
                str(Path(args.benchmark_file)),
                "--pred_file",
                str(pred_path),
                "--output",
                str(eval_report_json),
                "--format",
                "markdown",
                "--group_by_type",
            ]
            eval_log = run_dir / "evaluate.log"
            eval_exit = run_and_log(eval_cmd, root, eval_log, env)
            if eval_exit == 0 and eval_report_json.exists():
                report = read_json(eval_report_json)
                raw_summary = report.get("summary") or {}
                metrics = {k: float(raw_summary[k]) for k in raw_summary if isinstance(raw_summary[k], (int, float))}
                status = "SUCCESS"
                if eval_report_md.exists():
                    pass
            else:
                status = "FAILED"
        else:
            status = "FAILED"
    elif train_exit == 0 and args.dry_run:
        status = "DRY_RUN"

    ended_at = datetime.now(timezone.utc).isoformat()

    entry = {
        "run_id": run_id,
        "seed": args.seed,
        "stage": args.stage,
        "train_files": stage_train_files("data/training/processed", args.stage),
        "benchmark_file": str(Path(args.benchmark_file)),
        "adapter_path": str(adapter_path),
        "pred_file": str(pred_path),
        "eval_report_json": str(eval_report_json),
        "metrics": metrics,
        "status": status,
        "started_at": started_at,
        "ended_at": ended_at,
        "preset": args.preset,
        "logs": {
            "train": str(train_log),
            "predict": str(run_dir / "predict.log"),
            "evaluate": str(run_dir / "evaluate.log"),
        },
    }
    append_manifest(batch_dir / "run_manifest.json", args.batch, args.remote_root, entry)

    print(json.dumps(entry, ensure_ascii=False, indent=2))
    if status not in {"SUCCESS", "DRY_RUN"}:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
