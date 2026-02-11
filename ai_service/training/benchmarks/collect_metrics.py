#!/usr/bin/env python3
"""Aggregate training_compare metrics.json files and emit comparison summary."""

from __future__ import annotations

import argparse
import json
import math
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Any


GATE_METRICS = ("key_point_coverage", "refusal_accuracy", "tool_call_accuracy")
QUALITY_METRICS = (
    "key_point_coverage",
    "refusal_accuracy",
    "response_format",
    "tool_call_accuracy",
    "citation_accuracy",
)


@dataclass
class DecisionConfig:
    min_success_runs: int
    gate_delta: float
    stability_margin: float
    efficiency_rel: float
    efficiency_abs_sec: float
    bootstrap_samples: int
    bootstrap_seed: int


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Aggregate training_compare run metrics.")
    parser.add_argument("--batch", type=str, required=True)
    parser.add_argument("--base-root", type=str, default="outputs/training_compare")
    parser.add_argument("--output-json", type=str, default="")
    parser.add_argument("--output-md", type=str, default="")
    parser.add_argument("--min-success-runs", type=int, default=2)
    parser.add_argument("--gate-delta", type=float, default=-0.02)
    parser.add_argument("--stability-margin", type=float, default=0.01)
    parser.add_argument("--efficiency-rel", type=float, default=0.10)
    parser.add_argument("--efficiency-abs-sec", type=float, default=300.0)
    parser.add_argument("--bootstrap-samples", type=int, default=1000)
    parser.add_argument("--bootstrap-seed", type=int, default=42)
    return parser.parse_args()


def mean(values: list[float]) -> float:
    if not values:
        return 0.0
    return sum(values) / len(values)


def std(values: list[float]) -> float:
    if len(values) <= 1:
        return 0.0
    m = mean(values)
    return math.sqrt(sum((v - m) ** 2 for v in values) / len(values))


def bootstrap_ci(values: list[float], n_samples: int, seed: int) -> tuple[float, float]:
    if not values:
        return (0.0, 0.0)
    if len(values) == 1:
        return (values[0], values[0])
    rng = random.Random(seed)
    estimates = []
    for _ in range(max(10, n_samples)):
        sample = [values[rng.randrange(len(values))] for _ in range(len(values))]
        estimates.append(mean(sample))
    estimates.sort()
    lower = estimates[int(0.025 * (len(estimates) - 1))]
    upper = estimates[int(0.975 * (len(estimates) - 1))]
    return (lower, upper)


def load_metrics(batch_dir: Path) -> list[dict[str, Any]]:
    metrics_files = sorted(batch_dir.glob("runs/*/metrics.json"))
    runs: list[dict[str, Any]] = []
    for path in metrics_files:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        data["_metrics_path"] = str(path)
        runs.append(data)
    return runs


def get_quality_value(run: dict[str, Any], metric: str) -> float | None:
    summary = run.get("quality_summary")
    if not isinstance(summary, dict):
        return None
    value = summary.get(metric)
    if isinstance(value, (int, float)):
        return float(value)
    return None


def eval_stage(stage_runs: list[dict[str, Any]], cfg: DecisionConfig) -> dict[str, Any]:
    runs_by_fw = {
        "custom": [r for r in stage_runs if r.get("framework") == "custom"],
        "swift": [r for r in stage_runs if r.get("framework") == "swift"],
    }
    success_by_fw = {
        fw: [r for r in runs if r.get("status") == "SUCCESS"]
        for fw, runs in runs_by_fw.items()
    }
    result: dict[str, Any] = {
        "run_count": len(stage_runs),
        "status_counts": {},
        "framework_run_counts": {fw: len(runs) for fw, runs in runs_by_fw.items()},
        "framework_success_counts": {fw: len(runs) for fw, runs in success_by_fw.items()},
        "comparable": True,
        "inconclusive_reasons": [],
        "gate_metrics": {},
        "quality_metrics": {},
        "efficiency": {},
        "stability_risk": False,
        "decision": "INCONCLUSIVE",
    }

    status_counts: dict[str, int] = {}
    for run in stage_runs:
        status = str(run.get("status", "UNKNOWN"))
        status_counts[status] = status_counts.get(status, 0) + 1
    result["status_counts"] = status_counts

    for fw in ("custom", "swift"):
        if len(success_by_fw[fw]) < cfg.min_success_runs:
            result["comparable"] = False
            result["inconclusive_reasons"].append(
                f"{fw.upper()}_SUCCESS_LT_{cfg.min_success_runs}"
            )

    for metric in QUALITY_METRICS:
        custom_values = [
            v for v in (get_quality_value(r, metric) for r in success_by_fw["custom"]) if v is not None
        ]
        swift_values = [
            v for v in (get_quality_value(r, metric) for r in success_by_fw["swift"]) if v is not None
        ]
        custom_mean = mean(custom_values)
        swift_mean = mean(swift_values)
        custom_std = std(custom_values)
        swift_std = std(swift_values)
        ci_custom = bootstrap_ci(custom_values, cfg.bootstrap_samples, cfg.bootstrap_seed)
        ci_swift = bootstrap_ci(swift_values, cfg.bootstrap_samples, cfg.bootstrap_seed)
        delta = swift_mean - custom_mean
        row = {
            "custom_values": custom_values,
            "swift_values": swift_values,
            "custom_mean": custom_mean,
            "swift_mean": swift_mean,
            "custom_std": custom_std,
            "swift_std": swift_std,
            "custom_ci95": [ci_custom[0], ci_custom[1]],
            "swift_ci95": [ci_swift[0], ci_swift[1]],
            "delta": delta,
            "ci_overlap": not (ci_custom[1] < ci_swift[0] or ci_swift[1] < ci_custom[0]),
        }
        result["quality_metrics"][metric] = row

    gate_pass = True
    for metric in GATE_METRICS:
        row = result["quality_metrics"][metric]
        pass_delta = row["delta"] >= cfg.gate_delta
        row["pass"] = pass_delta
        result["gate_metrics"][metric] = row
        gate_pass = gate_pass and pass_delta
        if row["swift_std"] > row["custom_std"] + cfg.stability_margin:
            result["stability_risk"] = True

    # Efficiency: lower is better for wall time and peak memory.
    custom_time = [
        float(r.get("train_wall_time_sec"))
        for r in success_by_fw["custom"]
        if isinstance(r.get("train_wall_time_sec"), (int, float))
    ]
    swift_time = [
        float(r.get("train_wall_time_sec"))
        for r in success_by_fw["swift"]
        if isinstance(r.get("train_wall_time_sec"), (int, float))
    ]
    custom_mem = [
        float(r.get("peak_memory_gb"))
        for r in success_by_fw["custom"]
        if isinstance(r.get("peak_memory_gb"), (int, float))
    ]
    swift_mem = [
        float(r.get("peak_memory_gb"))
        for r in success_by_fw["swift"]
        if isinstance(r.get("peak_memory_gb"), (int, float))
    ]
    c_time_mean = mean(custom_time)
    s_time_mean = mean(swift_time)
    c_mem_mean = mean(custom_mem)
    s_mem_mean = mean(swift_mem)
    rel_time_gain = ((c_time_mean - s_time_mean) / c_time_mean) if c_time_mean > 0 else 0.0
    abs_time_gain = c_time_mean - s_time_mean
    rel_mem_gain = ((c_mem_mean - s_mem_mean) / c_mem_mean) if c_mem_mean > 0 else 0.0
    efficiency_pass = (
        rel_time_gain >= cfg.efficiency_rel
        or abs_time_gain >= cfg.efficiency_abs_sec
        or rel_mem_gain >= cfg.efficiency_rel
    )
    result["efficiency"] = {
        "custom_time_mean_sec": c_time_mean,
        "swift_time_mean_sec": s_time_mean,
        "relative_time_gain": rel_time_gain,
        "absolute_time_gain_sec": abs_time_gain,
        "custom_peak_memory_mean_gb": c_mem_mean,
        "swift_peak_memory_mean_gb": s_mem_mean,
        "relative_memory_gain": rel_mem_gain,
        "pass": efficiency_pass,
    }

    if not result["comparable"]:
        result["decision"] = "INCONCLUSIVE"
    elif gate_pass and (not result["stability_risk"]) and efficiency_pass:
        result["decision"] = "RECOMMEND_SWITCH"
    elif gate_pass and (not result["stability_risk"]) and (not efficiency_pass):
        result["decision"] = "PILOT_SWITCH"
    else:
        result["decision"] = "KEEP_CUSTOM"

    return result


def to_markdown(summary: dict[str, Any]) -> str:
    lines = [
        "# Training Compare Summary",
        "",
        f"- Batch: `{summary['batch']}`",
        f"- Total Runs: `{summary['total_runs']}`",
        f"- Timestamp: `{summary['generated_at']}`",
        "",
    ]
    for stage, stage_summary in summary["stages"].items():
        lines.extend(
            [
                f"## Stage: {stage}",
                "",
                f"- Decision: `{stage_summary['decision']}`",
                f"- Comparable: `{stage_summary['comparable']}`",
                f"- Stability Risk: `{stage_summary['stability_risk']}`",
                f"- Inconclusive Reasons: `{', '.join(stage_summary['inconclusive_reasons']) if stage_summary['inconclusive_reasons'] else 'N/A'}`",
                "",
                "| Metric | Custom Mean | Swift Mean | Delta | Custom Std | Swift Std | Pass |",
                "|---|---:|---:|---:|---:|---:|---|",
            ]
        )
        for metric in GATE_METRICS:
            row = stage_summary["gate_metrics"].get(metric, {})
            lines.append(
                "| {m} | {cm:.4f} | {sm:.4f} | {d:.4f} | {cs:.4f} | {ss:.4f} | {p} |".format(
                    m=metric,
                    cm=float(row.get("custom_mean", 0.0)),
                    sm=float(row.get("swift_mean", 0.0)),
                    d=float(row.get("delta", 0.0)),
                    cs=float(row.get("custom_std", 0.0)),
                    ss=float(row.get("swift_std", 0.0)),
                    p="PASS" if row.get("pass") else "FAIL",
                )
            )
        eff = stage_summary.get("efficiency", {})
        lines.extend(
            [
                "",
                "| Efficiency | Value |",
                "|---|---:|",
                f"| relative_time_gain | {float(eff.get('relative_time_gain', 0.0)):.4f} |",
                f"| absolute_time_gain_sec | {float(eff.get('absolute_time_gain_sec', 0.0)):.2f} |",
                f"| relative_memory_gain | {float(eff.get('relative_memory_gain', 0.0)):.4f} |",
                f"| efficiency_pass | {'PASS' if eff.get('pass') else 'FAIL'} |",
                "",
            ]
        )
    return "\n".join(lines) + "\n"


def main() -> None:
    from datetime import datetime, timezone

    args = parse_args()
    cfg = DecisionConfig(
        min_success_runs=max(1, args.min_success_runs),
        gate_delta=float(args.gate_delta),
        stability_margin=float(args.stability_margin),
        efficiency_rel=float(args.efficiency_rel),
        efficiency_abs_sec=float(args.efficiency_abs_sec),
        bootstrap_samples=max(100, args.bootstrap_samples),
        bootstrap_seed=int(args.bootstrap_seed),
    )

    batch_dir = Path(args.base_root) / args.batch
    runs = load_metrics(batch_dir)
    if not runs:
        print("NO_RUNS_FOUND")
        return

    stages = {}
    for stage in ("style", "writing", "all"):
        stage_runs = [r for r in runs if r.get("stage") == stage]
        stages[stage] = eval_stage(stage_runs, cfg)

    summary = {
        "batch": args.batch,
        "base_root": str(Path(args.base_root)),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_runs": len(runs),
        "stages": stages,
    }

    output_json = Path(args.output_json) if args.output_json else batch_dir / "comparison_summary.json"
    output_md = Path(args.output_md) if args.output_md else batch_dir / "comparison_summary.md"
    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_md.parent.mkdir(parents=True, exist_ok=True)
    output_json.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    output_md.write_text(to_markdown(summary), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
