#!/usr/bin/env python3
"""Benchmark wave_1d kernel performance for Python vs Rust (PyO3)."""

from __future__ import annotations

import argparse
import importlib
import json
import platform
import statistics
import subprocess
import sys
import tempfile
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

import numpy as np

PROFILES: dict[str, dict[str, Any]] = {
    "A": {
        "length": 1.0,
        "nx": 200,
        "c": 3e8,
        "total_time": 10e-9,
        "source_type": "gaussian",
        "source_position": 0.2,
        "source_frequency": 1e9,
        "boundary_condition": "absorbing",
        "save_every": 10,
    },
    "B": {
        "length": 1.0,
        "nx": 400,
        "c": 3e8,
        "total_time": 20e-9,
        "source_type": "sinusoidal",
        "source_position": 0.2,
        "source_frequency": 1e9,
        "boundary_condition": "absorbing",
        "save_every": 10,
    },
}


@dataclass
class StatResult:
    mean_ms: float
    p50_ms: float
    p95_ms: float
    std_ms: float
    samples: int


@dataclass
class CorrectnessResult:
    max_abs_diff: float
    l2_rel_error: float
    dx_diff: float
    dt_diff: float
    pass_threshold: bool


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Benchmark wave_1d kernel (Python vs Rust)")
    parser.add_argument("--warmup", type=int, default=10)
    parser.add_argument("--measure", type=int, default=50)
    parser.add_argument("--max-abs-threshold", type=float, default=1e-4)
    parser.add_argument("--output", type=Path, default=None)
    parser.add_argument("--auto-build-rust", action="store_true", default=True)
    parser.add_argument("--no-auto-build-rust", dest="auto_build_rust", action="store_false")
    return parser.parse_args()


def _compute_stats(samples: list[float]) -> StatResult:
    arr = np.asarray(samples, dtype=np.float64)
    return StatResult(
        mean_ms=float(arr.mean()),
        p50_ms=float(np.percentile(arr, 50)),
        p95_ms=float(np.percentile(arr, 95)),
        std_ms=float(arr.std()),
        samples=len(samples),
    )


def _time_callable(fn: Callable[[], Any], warmup: int, measure: int) -> list[float]:
    for _ in range(warmup):
        fn()

    samples: list[float] = []
    for _ in range(measure):
        start = time.perf_counter()
        fn()
        samples.append((time.perf_counter() - start) * 1000.0)
    return samples


def _prepare_paths() -> tuple[Path, Path]:
    code_root = Path(__file__).resolve().parents[2]
    sim_root = code_root / "simulation"
    if str(sim_root) not in sys.path:
        sys.path.insert(0, str(sim_root))
    return code_root, sim_root


def _ensure_rust_module(code_root: Path, auto_build: bool) -> Any:
    try:
        return importlib.import_module("simulation_rs")
    except ModuleNotFoundError as exc:
        if not auto_build:
            raise RuntimeError("simulation_rs module not found; build it first") from exc

        sim_rs_root = code_root / "simulation-rs"
        subprocess.run([sys.executable, "-m", "pip", "install", "maturin"], check=True)
        with tempfile.TemporaryDirectory() as wheel_dir:
            subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "maturin",
                    "build",
                    "--release",
                    "--manifest-path",
                    str(sim_rs_root / "Cargo.toml"),
                    "--out",
                    wheel_dir,
                ],
                check=True,
                cwd=sim_rs_root,
            )
            wheels = sorted(Path(wheel_dir).glob("simulation_rs-*.whl"))
            if not wheels:
                raise RuntimeError("maturin build finished but no wheel produced")
            subprocess.run(
                [sys.executable, "-m", "pip", "install", "--force-reinstall", str(wheels[-1])],
                check=True,
            )
        importlib.invalidate_caches()
        return importlib.import_module("simulation_rs")


def _run_correctness(
    py_solver: Callable[..., Any],
    rust_solver: Callable[..., Any],
    params: dict[str, Any],
    threshold: float,
) -> CorrectnessResult:
    py_out = py_solver(**params)
    rust_out = rust_solver(**params)

    py_field = np.asarray(py_out.field_history, dtype=np.float64)
    rust_field = np.asarray(rust_out.field_history, dtype=np.float64)

    if py_field.shape != rust_field.shape:
        raise RuntimeError(f"field shape mismatch: python={py_field.shape}, rust={rust_field.shape}")

    diff = py_field - rust_field
    max_abs_diff = float(np.max(np.abs(diff)))
    l2_rel_error = float(np.linalg.norm(diff) / (np.linalg.norm(py_field) + 1e-12))

    return CorrectnessResult(
        max_abs_diff=max_abs_diff,
        l2_rel_error=l2_rel_error,
        dx_diff=abs(float(py_out.dx) - float(rust_out.dx)),
        dt_diff=abs(float(py_out.dt) - float(rust_out.dt)),
        pass_threshold=max_abs_diff <= threshold,
    )


def main() -> int:
    args = _parse_args()
    code_root, _ = _prepare_paths()

    from app.solvers.wave import simulate_wave_1d as simulate_wave_1d_python

    simulation_rs = _ensure_rust_module(code_root, args.auto_build_rust)
    simulate_wave_1d_rust = simulation_rs.simulate_wave_1d

    report: dict[str, Any] = {
        "scope": "kernel",
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "machine": {
            "platform": platform.platform(),
            "python": platform.python_version(),
            "processor": platform.processor(),
        },
        "config": {
            "warmup": args.warmup,
            "measure": args.measure,
            "max_abs_threshold": args.max_abs_threshold,
        },
        "profiles": {},
    }

    any_speedup_ge_30 = False
    correctness_all_pass = True

    for profile_name, params in PROFILES.items():
        py_samples = _time_callable(lambda: simulate_wave_1d_python(**params), args.warmup, args.measure)
        rust_samples = _time_callable(lambda: simulate_wave_1d_rust(**params), args.warmup, args.measure)

        py_stats = _compute_stats(py_samples)
        rust_stats = _compute_stats(rust_samples)
        correctness = _run_correctness(
            simulate_wave_1d_python,
            simulate_wave_1d_rust,
            params,
            args.max_abs_threshold,
        )

        p95_reduction_pct = (py_stats.p95_ms - rust_stats.p95_ms) / py_stats.p95_ms * 100.0
        mean_reduction_pct = (py_stats.mean_ms - rust_stats.mean_ms) / py_stats.mean_ms * 100.0
        any_speedup_ge_30 = any_speedup_ge_30 or (p95_reduction_pct >= 30.0)
        correctness_all_pass = correctness_all_pass and correctness.pass_threshold

        report["profiles"][profile_name] = {
            "params": params,
            "engines": {
                "python": asdict(py_stats),
                "rust": asdict(rust_stats),
            },
            "speedup": {
                "p95_reduction_pct": p95_reduction_pct,
                "mean_reduction_pct": mean_reduction_pct,
                "p95_speedup_x": py_stats.p95_ms / rust_stats.p95_ms,
                "mean_speedup_x": py_stats.mean_ms / rust_stats.mean_ms,
            },
            "correctness": asdict(correctness),
        }

    report["acceptance"] = {
        "correctness_all_pass": correctness_all_pass,
        "any_profile_p95_reduction_ge_30": any_speedup_ge_30,
    }

    payload = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload + "\n", encoding="utf-8")
    else:
        print(payload)

    if not correctness_all_pass:
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
