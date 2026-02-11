#!/usr/bin/env python3
"""Benchmark wave_1d endpoint end-to-end performance for Python vs Rust engine."""

from __future__ import annotations

import argparse
import importlib
import json
import os
import platform
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
        "output_type": "snapshot",
        "snapshot_index": -1,
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
        "output_type": "snapshot",
        "snapshot_index": -1,
    },
}


@dataclass
class StatResult:
    mean_ms: float
    p50_ms: float
    p95_ms: float
    std_ms: float
    samples: int


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Benchmark wave_1d endpoint")
    parser.add_argument("--warmup", type=int, default=10)
    parser.add_argument("--measure", type=int, default=50)
    parser.add_argument("--output", type=Path, default=None)
    parser.add_argument("--auto-build-rust", action="store_true", default=True)
    parser.add_argument("--no-auto-build-rust", dest="auto_build_rust", action="store_false")
    return parser.parse_args()


def _prepare_paths() -> tuple[Path, Path]:
    code_root = Path(__file__).resolve().parents[2]
    sim_root = code_root / "simulation"
    if str(sim_root) not in sys.path:
        sys.path.insert(0, str(sim_root))
    return code_root, sim_root


def _ensure_rust_module(code_root: Path, auto_build: bool) -> None:
    try:
        importlib.import_module("simulation_rs")
        return
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
    importlib.import_module("simulation_rs")


def _compute_stats(samples: list[float]) -> StatResult:
    arr = np.asarray(samples, dtype=np.float64)
    return StatResult(
        mean_ms=float(arr.mean()),
        p50_ms=float(np.percentile(arr, 50)),
        p95_ms=float(np.percentile(arr, 95)),
        std_ms=float(arr.std()),
        samples=len(samples),
    )


def _time_callable(fn: Callable[[], None], warmup: int, measure: int) -> list[float]:
    for _ in range(warmup):
        fn()

    samples: list[float] = []
    for _ in range(measure):
        start = time.perf_counter()
        fn()
        samples.append((time.perf_counter() - start) * 1000.0)
    return samples


def main() -> int:
    args = _parse_args()
    code_root, _ = _prepare_paths()
    _ensure_rust_module(code_root, args.auto_build_rust)

    from fastapi.testclient import TestClient

    from app.main import app
    import app.routes.wave as wave_routes

    client = TestClient(app)

    report: dict[str, Any] = {
        "scope": "endpoint",
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "machine": {
            "platform": platform.platform(),
            "python": platform.python_version(),
            "processor": platform.processor(),
        },
        "config": {
            "warmup": args.warmup,
            "measure": args.measure,
            "path": "/v1/sim/wave_1d",
        },
        "profiles": {},
    }

    for profile_name, payload in PROFILES.items():
        report["profiles"][profile_name] = {
            "params": payload,
            "engines": {},
            "speedup": {},
        }

        for engine in ("python", "rust"):
            os.environ["SIM_ENGINE"] = engine
            wave_routes._RUST_IMPORT_ERROR = None
            wave_routes._RUST_SIMULATE_WAVE = None

            def invoke() -> None:
                response = client.post("/v1/sim/wave_1d", json=payload)
                if response.status_code != 200:
                    raise RuntimeError(f"{engine} endpoint failed: {response.status_code} {response.text}")
                body = response.json()
                required = {"png_base64", "n_time_steps", "dx", "dt"}
                if not required.issubset(body.keys()):
                    raise RuntimeError(f"{engine} response missing keys: {required - set(body.keys())}")

            samples = _time_callable(invoke, args.warmup, args.measure)
            report["profiles"][profile_name]["engines"][engine] = asdict(_compute_stats(samples))

        py_p95 = report["profiles"][profile_name]["engines"]["python"]["p95_ms"]
        rs_p95 = report["profiles"][profile_name]["engines"]["rust"]["p95_ms"]
        py_mean = report["profiles"][profile_name]["engines"]["python"]["mean_ms"]
        rs_mean = report["profiles"][profile_name]["engines"]["rust"]["mean_ms"]

        report["profiles"][profile_name]["speedup"] = {
            "p95_reduction_pct": (py_p95 - rs_p95) / py_p95 * 100.0,
            "mean_reduction_pct": (py_mean - rs_mean) / py_mean * 100.0,
            "p95_speedup_x": py_p95 / rs_p95,
            "mean_speedup_x": py_mean / rs_mean,
        }

    payload = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload + "\n", encoding="utf-8")
    else:
        print(payload)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
