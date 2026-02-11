#!/usr/bin/env python3
"""Serially execute smoke + full matrix for ms-swift vs custom comparison."""

from __future__ import annotations

import argparse
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


FRAMEWORKS = ("custom", "swift")
DEFAULT_MODEL_REF = "/root/autodl-tmp/graduationDesign_runtime/models/JunHowie/Qwen3-8B-Instruct"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run compare matrix serially (smoke then full).")
    parser.add_argument("--batch", type=str, required=True)
    parser.add_argument("--python-bin", type=str, default="python3")
    parser.add_argument("--model-ref", type=str, default=DEFAULT_MODEL_REF)
    parser.add_argument("--swift-model-type", type=str, default="qwen3_nothinking")
    parser.add_argument("--swift-template-id", type=str, default="qwen")
    parser.add_argument("--out-root", type=str, default="outputs/training_compare")
    parser.add_argument("--smoke-steps", type=int, default=10)
    parser.add_argument("--full-steps", type=int, default=200)
    parser.add_argument("--all-seeds", type=str, default="42,43,44")
    parser.add_argument("--style-seeds", type=str, default="45")
    parser.add_argument("--writing-seeds", type=str, default="46")
    parser.add_argument("--sample-size", type=int, default=20)
    parser.add_argument(
        "--custom-template-backend",
        choices=["auto", "hf", "swift"],
        default="swift",
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--skip-preflight", action="store_true")
    parser.add_argument("--skip-smoke", action="store_true")
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
    parser.add_argument("--max-failed-streak", type=int, default=2)
    return parser.parse_args()


def project_root() -> Path:
    current = Path(__file__).resolve()
    for parent in current.parents:
        if (parent / "README.md").exists() and (parent / "code").exists():
            return parent
    return current.parents[3]


def parse_seed_csv(value: str) -> list[int]:
    seeds: list[int] = []
    for part in value.split(","):
        text = part.strip()
        if not text:
            continue
        seeds.append(int(text))
    if not seeds:
        raise ValueError("Seed list cannot be empty.")
    return seeds


def run_once(
    *,
    root: Path,
    python_bin: str,
    batch: str,
    model_ref: str,
    swift_model_type: str,
    swift_template_id: str,
    out_root: str,
    framework: str,
    stage: str,
    seed: int,
    max_steps: int,
    sample_size: int,
    dry_run: bool,
    skip_preflight: bool,
    use_qlora: bool,
    run_label: str,
    custom_template_backend: str,
) -> tuple[int, dict[str, Any]]:
    run_id = f"{stage}_{framework}_s{seed}_ms{max_steps}_{run_label}"
    script = root / "code/ai_service/training/run_compare_stage.py"
    cmd = [
        python_bin,
        str(script),
        "--batch",
        batch,
        "--framework",
        framework,
        "--stage",
        stage,
        "--seed",
        str(seed),
        "--model-ref",
        model_ref,
        "--swift-model-type",
        swift_model_type,
        "--swift-template-id",
        swift_template_id,
        "--out-root",
        out_root,
        "--max-steps",
        str(max_steps),
        "--sample-size",
        str(sample_size),
        "--custom-template-backend",
        custom_template_backend,
        "--resume-from",
        run_id,
        "--python-bin",
        python_bin,
    ]
    if use_qlora:
        cmd.append("--use-qlora")
    else:
        cmd.append("--no-use-qlora")
    if dry_run:
        cmd.append("--dry-run")
    if skip_preflight:
        cmd.append("--skip-preflight")

    proc = subprocess.run(cmd, cwd=root, text=True, capture_output=True)
    payload: dict[str, Any]
    try:
        payload = json.loads(proc.stdout.strip().splitlines()[-1]) if proc.stdout.strip() else {}
    except json.JSONDecodeError:
        payload = {}

    # Fallback: load metrics from run directory if stdout parsing failed.
    if not isinstance(payload, dict) or "status" not in payload:
        metrics_path = (
            root
            / out_root
            / batch
            / "runs"
            / run_id
            / "metrics.json"
        )
        if metrics_path.exists():
            payload = json.loads(metrics_path.read_text(encoding="utf-8"))
        else:
            payload = {
                "run_id": run_id,
                "framework": framework,
                "stage": stage,
                "seed": seed,
                "status": "FAILED",
                "blocking_failures": [f"run_compare_stage_exit_{proc.returncode}"],
                "stdout_tail": proc.stdout[-1000:],
                "stderr_tail": proc.stderr[-1000:],
            }

    return proc.returncode, payload


def build_full_matrix(args: argparse.Namespace) -> list[dict[str, Any]]:
    all_seeds = parse_seed_csv(args.all_seeds)
    style_seeds = parse_seed_csv(args.style_seeds)
    writing_seeds = parse_seed_csv(args.writing_seeds)

    matrix: list[dict[str, Any]] = []
    for seed in all_seeds:
        for fw in FRAMEWORKS:
            matrix.append({"stage": "all", "framework": fw, "seed": seed, "max_steps": args.full_steps})
    for seed in style_seeds:
        for fw in FRAMEWORKS:
            matrix.append({"stage": "style", "framework": fw, "seed": seed, "max_steps": args.full_steps})
    for seed in writing_seeds:
        for fw in FRAMEWORKS:
            matrix.append({"stage": "writing", "framework": fw, "seed": seed, "max_steps": args.full_steps})
    return matrix


def main() -> None:
    args = parse_args()
    if "swift-vs-custom" not in args.batch:
        raise SystemExit("[ERROR] --batch must contain 'swift-vs-custom'.")
    root = project_root()
    batch_dir = root / args.out_root / args.batch
    batch_dir.mkdir(parents=True, exist_ok=True)

    smoke_seed = parse_seed_csv(args.all_seeds)[0]
    smoke_matrix = [
        {"stage": "all", "framework": "custom", "seed": smoke_seed, "max_steps": args.smoke_steps},
        {"stage": "all", "framework": "swift", "seed": smoke_seed, "max_steps": args.smoke_steps},
    ]
    full_matrix = build_full_matrix(args)

    runs: list[dict[str, Any]] = []
    failed_streak = 0

    if not args.skip_smoke:
        for item in smoke_matrix:
            rc, payload = run_once(
                root=root,
                python_bin=args.python_bin,
                batch=args.batch,
                model_ref=args.model_ref,
                swift_model_type=args.swift_model_type,
                swift_template_id=args.swift_template_id,
                out_root=args.out_root,
                framework=item["framework"],
                stage=item["stage"],
                seed=item["seed"],
                max_steps=item["max_steps"],
                sample_size=args.sample_size,
                dry_run=args.dry_run,
                skip_preflight=args.skip_preflight,
                use_qlora=args.use_qlora,
                run_label="smoke",
                custom_template_backend=args.custom_template_backend,
            )
            status = str(payload.get("status", "FAILED"))
            runs.append({"phase": "smoke", "return_code": rc, **payload})
            if status == "FAILED":
                failed_streak += 1
            else:
                failed_streak = 0
            if failed_streak >= args.max_failed_streak:
                raise SystemExit(
                    f"[ERROR] Consecutive FAILED runs reached {args.max_failed_streak} during smoke."
                )
        smoke_ok_status = {"SUCCESS", "DRY_RUN"} if args.dry_run else {"SUCCESS"}
        smoke_ok = all(str(r.get("status")) in smoke_ok_status for r in runs if r.get("phase") == "smoke")
        if not smoke_ok:
            summary = {
                "batch": args.batch,
                "started_at": datetime.now(timezone.utc).isoformat(),
                "smoke_passed": False,
                "full_started": False,
                "runs": runs,
            }
            (batch_dir / "batch_execution_summary.json").write_text(
                json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )
            print(json.dumps(summary, ensure_ascii=False, indent=2))
            raise SystemExit(1)

    for item in full_matrix:
        rc, payload = run_once(
            root=root,
            python_bin=args.python_bin,
            batch=args.batch,
            model_ref=args.model_ref,
            swift_model_type=args.swift_model_type,
            swift_template_id=args.swift_template_id,
            out_root=args.out_root,
            framework=item["framework"],
            stage=item["stage"],
            seed=item["seed"],
            max_steps=item["max_steps"],
            sample_size=args.sample_size,
            dry_run=args.dry_run,
            skip_preflight=args.skip_preflight,
            use_qlora=args.use_qlora,
            run_label="full",
            custom_template_backend=args.custom_template_backend,
        )
        status = str(payload.get("status", "FAILED"))
        runs.append({"phase": "full", "return_code": rc, **payload})
        if status == "FAILED":
            failed_streak += 1
        else:
            failed_streak = 0
        if failed_streak >= args.max_failed_streak:
            break

    summary = {
        "batch": args.batch,
        "python_bin": args.python_bin,
        "model_ref": args.model_ref,
        "swift_model_type": args.swift_model_type,
        "swift_template_id": args.swift_template_id,
        "use_qlora": bool(args.use_qlora),
        "smoke_passed": args.skip_smoke or all(
            str(r.get("status")) in ({"SUCCESS", "DRY_RUN"} if args.dry_run else {"SUCCESS"})
            for r in runs
            if r.get("phase") == "smoke"
        ),
        "full_started": True,
        "total_runs": len(runs),
        "failed_streak_limit": args.max_failed_streak,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "runs": runs,
    }
    (batch_dir / "batch_execution_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))

    if failed_streak >= args.max_failed_streak:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
