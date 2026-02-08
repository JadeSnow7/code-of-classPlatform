#!/usr/bin/env python3
"""Summarize formal batch runs and evaluate acceptance gates."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Summarize formal run manifest.")
    parser.add_argument("--batch", type=str, required=True)
    parser.add_argument(
        "--policy",
        type=str,
        default="config/training/acceptance_policy_formal_v1.json",
    )
    parser.add_argument("--stage", type=str, default="all")
    return parser.parse_args()


def project_root() -> Path:
    current = Path(__file__).resolve()
    for parent in current.parents:
        if (parent / "README.md").exists() and (parent / "code").exists():
            return parent
    return current.parents[3]


def mean(values: list[float]) -> float:
    if not values:
        return 0.0
    return sum(values) / len(values)


def std(values: list[float]) -> float:
    if len(values) <= 1:
        return 0.0
    m = mean(values)
    return math.sqrt(sum((v - m) ** 2 for v in values) / len(values))


def to_markdown(summary: dict[str, Any]) -> str:
    lines = [
        "# Formal Batch Summary",
        "",
        f"- Batch: `{summary['batch']}`",
        f"- Stage: `{summary['stage']}`",
        f"- Successful Runs: `{summary['successful_run_count']}`",
        f"- Meets Stage Gate: `{summary['phase_gate']['pass']}`",
        f"- Can Sync Docs: `{summary['can_sync_docs']}`",
        "",
        "## Metrics",
        "",
        "| Metric | Mean | Std | Threshold | Pass |",
        "|---|---:|---:|---:|---|",
    ]
    for metric in summary["phase_gate"]["metrics"]:
        lines.append(
            "| {name} | {mean:.4f} | {std:.4f} | {thr:.4f} | {ok} |".format(
                name=metric["name"],
                mean=metric["mean"],
                std=metric["std"],
                thr=metric["threshold"],
                ok="PASS" if metric["pass"] else "FAIL",
            )
        )

    lines.extend(
        [
            "",
            "## Tracking Metrics",
            "",
            "| Metric | Mean | Threshold | Pass |",
            "|---|---:|---:|---|",
        ]
    )
    for metric in summary["tracking_gate"]["metrics"]:
        lines.append(
            "| {name} | {mean:.4f} | {thr:.4f} | {ok} |".format(
                name=metric["name"],
                mean=metric["mean"],
                thr=metric["threshold"],
                ok="PASS" if metric["pass"] else "FAIL",
            )
        )

    return "\n".join(lines) + "\n"


def main() -> None:
    args = parse_args()
    root = project_root()
    batch_dir = root / "outputs/training_sync" / args.batch
    manifest_path = batch_dir / "run_manifest.json"
    policy_path = root / args.policy

    if not manifest_path.exists():
        raise SystemExit(f"[ERROR] run manifest not found: {manifest_path}")
    if not policy_path.exists():
        raise SystemExit(f"[ERROR] policy not found: {policy_path}")

    with manifest_path.open("r", encoding="utf-8") as f:
        manifest = json.load(f)
    with policy_path.open("r", encoding="utf-8") as f:
        policy = json.load(f)

    runs = manifest.get("runs") or []
    successful = [
        r
        for r in runs
        if r.get("status") == "SUCCESS" and r.get("stage") == args.stage and isinstance(r.get("metrics"), dict)
    ]

    phase_cfg = policy.get("phase_thresholds") or {}
    tracking_cfg = policy.get("tracking_thresholds") or {}
    required_metrics = phase_cfg.get("required_metrics") or {}
    required_seed_count = int(phase_cfg.get("required_seed_count", 3))
    std_max = float(phase_cfg.get("stability_std_max", 0.05))

    phase_metric_rows: list[dict[str, Any]] = []
    phase_pass = len(successful) >= required_seed_count
    for metric_name, threshold_value in required_metrics.items():
        values = []
        for run in successful:
            value = run.get("metrics", {}).get(metric_name)
            if isinstance(value, (int, float)):
                values.append(float(value))
        metric_mean = mean(values)
        metric_std = std(values)
        metric_pass = metric_mean >= float(threshold_value) and metric_std <= std_max
        phase_pass = phase_pass and metric_pass
        phase_metric_rows.append(
            {
                "name": metric_name,
                "values": values,
                "mean": metric_mean,
                "std": metric_std,
                "threshold": float(threshold_value),
                "pass": metric_pass,
            }
        )

    tracking_metric_rows: list[dict[str, Any]] = []
    tracking_pass = True
    for metric_name, threshold_value in tracking_cfg.items():
        values = []
        for run in successful:
            value = run.get("metrics", {}).get(metric_name)
            if isinstance(value, (int, float)):
                values.append(float(value))
        metric_mean = mean(values)
        metric_pass = metric_mean >= float(threshold_value)
        tracking_pass = tracking_pass and metric_pass
        tracking_metric_rows.append(
            {
                "name": metric_name,
                "values": values,
                "mean": metric_mean,
                "threshold": float(threshold_value),
                "pass": metric_pass,
            }
        )

    summary = {
        "batch": args.batch,
        "stage": args.stage,
        "successful_run_count": len(successful),
        "considered_run_ids": [r.get("run_id") for r in successful],
        "phase_gate": {
            "required_seed_count": required_seed_count,
            "stability_std_max": std_max,
            "metrics": phase_metric_rows,
            "pass": phase_pass,
        },
        "tracking_gate": {
            "metrics": tracking_metric_rows,
            "pass": tracking_pass,
        },
        "can_sync_docs": bool(phase_pass and policy.get("doc_sync_requires_phase_thresholds", True)),
    }

    batch_dir.mkdir(parents=True, exist_ok=True)
    summary_json_path = batch_dir / "acceptance_summary.json"
    summary_md_path = batch_dir / "acceptance_summary.md"
    with summary_json_path.open("w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    summary_md_path.write_text(to_markdown(summary), encoding="utf-8")

    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
