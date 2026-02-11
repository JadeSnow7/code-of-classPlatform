#!/usr/bin/env python3
"""Build merged benchmark artifacts for wave_1d dual-scope results."""

from __future__ import annotations

import argparse
import csv
import json
from datetime import datetime
from pathlib import Path
from typing import Any

import matplotlib.pyplot as plt


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate benchmark artifacts for wave_1d")
    parser.add_argument("--endpoint-json", type=Path, required=True)
    parser.add_argument("--kernel-json", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, default=None)
    return parser.parse_args()


def _load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _default_out_dir(script_path: Path) -> Path:
    workspace_root = script_path.resolve().parents[3]
    date_part = datetime.now().strftime("%Y-%m-%d")
    return workspace_root / "outputs" / "benchmarks" / "wave_1d" / date_part


def _render_latency_chart(combined: dict[str, Any], figure_path: Path) -> None:
    fig, axes = plt.subplots(1, 2, figsize=(12, 5), dpi=160)

    scopes = ["endpoint", "kernel"]
    for idx, scope in enumerate(scopes):
        ax = axes[idx]
        profile_names = list(combined[scope]["profiles"].keys())
        x = range(len(profile_names))
        py_vals = [combined[scope]["profiles"][name]["engines"]["python"]["p95_ms"] for name in profile_names]
        rs_vals = [combined[scope]["profiles"][name]["engines"]["rust"]["p95_ms"] for name in profile_names]

        width = 0.35
        ax.bar([i - width / 2 for i in x], py_vals, width=width, label="Python")
        ax.bar([i + width / 2 for i in x], rs_vals, width=width, label="Rust(PyO3)")

        ax.set_title(f"{scope} p95 latency")
        ax.set_xticks(list(x))
        ax.set_xticklabels(profile_names)
        ax.set_ylabel("ms")
        ax.grid(axis="y", alpha=0.3)
        ax.legend()

    fig.tight_layout()
    figure_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(figure_path, format="png")
    plt.close(fig)


def _write_csv(combined: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "scope",
                "profile",
                "engine",
                "mean_ms",
                "p50_ms",
                "p95_ms",
                "std_ms",
                "samples",
                "p95_reduction_pct_vs_python",
                "p95_speedup_x_vs_python",
            ],
        )
        writer.writeheader()

        for scope in ("endpoint", "kernel"):
            for profile_name, profile in combined[scope]["profiles"].items():
                speedup = profile.get("speedup", {})
                for engine in ("python", "rust"):
                    stats = profile["engines"][engine]
                    writer.writerow(
                        {
                            "scope": scope,
                            "profile": profile_name,
                            "engine": engine,
                            "mean_ms": f"{stats['mean_ms']:.6f}",
                            "p50_ms": f"{stats['p50_ms']:.6f}",
                            "p95_ms": f"{stats['p95_ms']:.6f}",
                            "std_ms": f"{stats['std_ms']:.6f}",
                            "samples": stats["samples"],
                            "p95_reduction_pct_vs_python": f"{speedup.get('p95_reduction_pct', 0.0):.6f}",
                            "p95_speedup_x_vs_python": f"{speedup.get('p95_speedup_x', 0.0):.6f}",
                        }
                    )


def _build_markdown_report(combined: dict[str, Any], out_path: Path) -> None:
    lines: list[str] = []
    lines.append("# wave_1d Benchmark Report")
    lines.append("")
    lines.append(f"- Generated: {datetime.now().isoformat(timespec='seconds')}")
    lines.append(f"- Endpoint source: `{combined['endpoint']['source_file']}`")
    lines.append(f"- Kernel source: `{combined['kernel']['source_file']}`")
    lines.append("")

    for scope in ("endpoint", "kernel"):
        lines.append(f"## {scope.title()} Scope")
        lines.append("")
        lines.append("| Profile | Python p95 (ms) | Rust p95 (ms) | p95 reduction | p95 speedup |")
        lines.append("|---|---:|---:|---:|---:|")
        for profile_name, profile in combined[scope]["profiles"].items():
            py_p95 = profile["engines"]["python"]["p95_ms"]
            rs_p95 = profile["engines"]["rust"]["p95_ms"]
            speed = profile["speedup"]
            lines.append(
                f"| {profile_name} | {py_p95:.3f} | {rs_p95:.3f} | {speed['p95_reduction_pct']:.2f}% | {speed['p95_speedup_x']:.2f}x |"
            )
        lines.append("")

    lines.append("## Correctness")
    lines.append("")
    lines.append("| Profile | max_abs_diff | l2_rel_error | pass |")
    lines.append("|---|---:|---:|---:|")
    for profile_name, profile in combined["kernel"]["profiles"].items():
        corr = profile["correctness"]
        lines.append(
            f"| {profile_name} | {corr['max_abs_diff']:.8f} | {corr['l2_rel_error']:.8f} | {'yes' if corr['pass_threshold'] else 'no'} |"
        )
    lines.append("")

    lines.append("## Acceptance")
    lines.append("")
    lines.append(f"- Correctness threshold pass: `{combined['acceptance']['correctness_all_pass']}`")
    lines.append(f"- Any profile p95 reduction >= 30%: `{combined['acceptance']['any_profile_p95_reduction_ge_30']}`")

    out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _build_slide_snippet(combined: dict[str, Any], out_path: Path) -> None:
    lines: list[str] = []
    lines.append("# Slide 13 数据片段（wave_1d Rust POC）")
    lines.append("")

    for scope in ("endpoint", "kernel"):
        lines.append(f"## {scope} 口径")
        for profile_name, profile in combined[scope]["profiles"].items():
            speed = profile["speedup"]
            lines.append(
                f"- Profile {profile_name}: p95 降低 {speed['p95_reduction_pct']:.2f}%，加速 {speed['p95_speedup_x']:.2f}x"
            )
        lines.append("")

    lines.append("## 正确性")
    for profile_name, profile in combined["kernel"]["profiles"].items():
        corr = profile["correctness"]
        lines.append(
            f"- Profile {profile_name}: max_abs_diff={corr['max_abs_diff']:.8f}, l2_rel_error={corr['l2_rel_error']:.8f}"
        )

    lines.append("")
    lines.append("## 结论")
    lines.append(
        f"- 满足误差阈值: {combined['acceptance']['correctness_all_pass']}；至少一个 profile 达到 p95 >=30% 降幅: {combined['acceptance']['any_profile_p95_reduction_ge_30']}"
    )

    out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    args = _parse_args()
    endpoint = _load_json(args.endpoint_json)
    kernel = _load_json(args.kernel_json)

    out_dir = args.out_dir or _default_out_dir(Path(__file__))
    out_dir.mkdir(parents=True, exist_ok=True)

    combined: dict[str, Any] = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "endpoint": {
            "source_file": str(args.endpoint_json),
            "profiles": endpoint.get("profiles", {}),
        },
        "kernel": {
            "source_file": str(args.kernel_json),
            "profiles": kernel.get("profiles", {}),
        },
    }

    correctness_pass = all(
        profile.get("correctness", {}).get("pass_threshold", False)
        for profile in combined["kernel"]["profiles"].values()
    )

    any_p95_reduction_ge_30 = False
    for scope in ("endpoint", "kernel"):
        for profile in combined[scope]["profiles"].values():
            any_p95_reduction_ge_30 = any_p95_reduction_ge_30 or (
                profile.get("speedup", {}).get("p95_reduction_pct", 0.0) >= 30.0
            )

    combined["acceptance"] = {
        "correctness_all_pass": correctness_pass,
        "any_profile_p95_reduction_ge_30": any_p95_reduction_ge_30,
    }

    json_path = out_dir / "wave_benchmark.json"
    csv_path = out_dir / "wave_benchmark.csv"
    report_path = out_dir / "REPORT.md"
    fig_path = out_dir / "fig_latency.png"
    slide_path = out_dir / "SLIDE13_SNIPPET.md"

    json_path.write_text(json.dumps(combined, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    _write_csv(combined, csv_path)
    _build_markdown_report(combined, report_path)
    _render_latency_chart(combined, fig_path)
    _build_slide_snippet(combined, slide_path)

    print(f"[OK] wrote: {json_path}")
    print(f"[OK] wrote: {csv_path}")
    print(f"[OK] wrote: {report_path}")
    print(f"[OK] wrote: {fig_path}")
    print(f"[OK] wrote: {slide_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
