from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
COLLECT_SCRIPT = ROOT / "code/ai_service/training/benchmarks/collect_metrics.py"
RUN_COMPARE_SCRIPT = ROOT / "code/ai_service/training/run_compare_stage.py"
SCHEMA_PATH = ROOT / "code/ai_service/training/benchmarks/metrics_schema.json"


def _load_module(module_path: Path, module_name: str):
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _make_metrics(
    *,
    run_id: str,
    batch: str,
    framework: str,
    stage: str,
    status: str,
    key_point_coverage: float,
    refusal_accuracy: float,
    tool_call_accuracy: float,
    response_format: float = 0.9,
    citation_accuracy: float = 0.7,
    train_wall_time_sec: float = 1000.0,
    peak_memory_gb: float = 10.0,
) -> dict:
    return {
        "run_id": run_id,
        "batch": batch,
        "framework": framework,
        "trainer": "test",
        "stage": stage,
        "seed": 42,
        "status": status,
        "model_ref": "/root/autodl-tmp/graduationDesign_runtime/models/JunHowie/Qwen3-8B-Instruct",
        "git_commit": "deadbeef",
        "dirty_flag": False,
        "python_bin": "/root/miniconda3/bin/python",
        "swift_version": "3.12.4",
        "quantization_mode": "qlora_4bit_nf4",
        "qlora_requested": True,
        "qlora_effective": True,
        "template_hash": "a",
        "prompt_hash": "b",
        "hyperparam_hash": "c",
        "decode_hash": "d",
        "dataset_hash": "e",
        "evalset_hash": "f",
        "full_dataset_alignment_hash": "g",
        "quality_summary": {
            "key_point_coverage": key_point_coverage,
            "refusal_accuracy": refusal_accuracy,
            "response_format": response_format,
            "tool_call_accuracy": tool_call_accuracy,
            "citation_accuracy": citation_accuracy,
        },
        "train_wall_time_sec": train_wall_time_sec,
        "steps_per_sec": 1.0,
        "peak_memory_gb": peak_memory_gb,
        "total_examples_consumed": 100,
        "effective_tokens_nonpad": 1000,
        "decode_params_expected": {"temperature": 0, "top_p": 1, "max_new_tokens": 1024},
        "decode_params_actual": {"temperature": 0, "top_p": 1, "max_new_tokens": 1024},
        "randomness_probe_hash": "h",
        "warnings": [],
        "blocking_failures": [],
        "artifacts": {
            "train_log": "train.log",
            "predict_log": "predict.log",
            "evaluate_log": "evaluate.log",
            "eval_report_json": "eval_report.json",
        },
    }


def test_collect_metrics_no_runs_found(tmp_path: Path):
    proc = subprocess.run(
        [
            sys.executable,
            str(COLLECT_SCRIPT),
            "--base-root",
            str(tmp_path),
            "--batch",
            "swift-vs-custom-empty",
        ],
        text=True,
        capture_output=True,
        check=False,
    )
    assert proc.returncode == 0
    assert "NO_RUNS_FOUND" in proc.stdout


def test_collect_metrics_generates_summary(tmp_path: Path):
    batch = "swift-vs-custom-batch"
    batch_dir = tmp_path / batch / "runs"
    batch_dir.mkdir(parents=True, exist_ok=True)

    runs = [
        _make_metrics(
            run_id="all_custom_1",
            batch=batch,
            framework="custom",
            stage="all",
            status="SUCCESS",
            key_point_coverage=0.90,
            refusal_accuracy=0.91,
            tool_call_accuracy=0.55,
            train_wall_time_sec=1200,
            peak_memory_gb=12.0,
        ),
        _make_metrics(
            run_id="all_custom_2",
            batch=batch,
            framework="custom",
            stage="all",
            status="SUCCESS",
            key_point_coverage=0.89,
            refusal_accuracy=0.90,
            tool_call_accuracy=0.54,
            train_wall_time_sec=1180,
            peak_memory_gb=11.8,
        ),
        _make_metrics(
            run_id="all_swift_1",
            batch=batch,
            framework="swift",
            stage="all",
            status="SUCCESS",
            key_point_coverage=0.89,
            refusal_accuracy=0.90,
            tool_call_accuracy=0.54,
            train_wall_time_sec=900,
            peak_memory_gb=9.0,
        ),
        _make_metrics(
            run_id="all_swift_2",
            batch=batch,
            framework="swift",
            stage="all",
            status="SUCCESS",
            key_point_coverage=0.88,
            refusal_accuracy=0.89,
            tool_call_accuracy=0.53,
            train_wall_time_sec=880,
            peak_memory_gb=8.8,
        ),
    ]
    for run in runs:
        run_dir = batch_dir / run["run_id"]
        run_dir.mkdir(parents=True, exist_ok=True)
        (run_dir / "metrics.json").write_text(
            json.dumps(run, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )

    proc = subprocess.run(
        [
            sys.executable,
            str(COLLECT_SCRIPT),
            "--base-root",
            str(tmp_path),
            "--batch",
            batch,
        ],
        text=True,
        capture_output=True,
        check=False,
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr

    summary_path = tmp_path / batch / "comparison_summary.json"
    assert summary_path.exists()
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    assert summary["stages"]["all"]["decision"] == "RECOMMEND_SWITCH"
    assert summary["stages"]["style"]["decision"] == "INCONCLUSIVE"
    assert summary["stages"]["writing"]["decision"] == "INCONCLUSIVE"


def test_validate_metrics_detects_missing_required_fields():
    module = _load_module(RUN_COMPARE_SCRIPT, "run_compare_stage")
    errors = module.validate_metrics({}, SCHEMA_PATH)
    assert errors
    assert any("run_id" in err for err in errors)


def test_validate_metrics_enforces_enum_and_min_length():
    module = _load_module(RUN_COMPARE_SCRIPT, "run_compare_stage")
    payload = _make_metrics(
        run_id="r1",
        batch="swift-vs-custom-batch",
        framework="custom",
        stage="all",
        status="SUCCESS",
        key_point_coverage=0.8,
        refusal_accuracy=0.8,
        tool_call_accuracy=0.8,
    )
    payload["status"] = "UNKNOWN"
    payload["randomness_probe_hash"] = ""
    errors = module.validate_metrics(payload, SCHEMA_PATH)
    assert any("status" in err and "enum" in err for err in errors)
    assert any("randomness_probe_hash" in err and "minLength" in err for err in errors)


def test_parse_json_from_mixed_output():
    module = _load_module(RUN_COMPARE_SCRIPT, "run_compare_stage")
    raw = "[INFO] warmup\n{\"a\": 1, \"b\": 2}\n"
    parsed = module.parse_json_from_mixed_output(raw)
    assert parsed == {"a": 1, "b": 2}
