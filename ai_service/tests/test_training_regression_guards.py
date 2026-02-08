from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile


TRAINING_DIR = Path(__file__).resolve().parents[1] / "training"
PROJECT_ROOT = Path(__file__).resolve().parents[3]
GOLDEN_CASES_PATH = PROJECT_ROOT / "tests/ai/eval_golden_cases.jsonl"


def _load_training_module(module_name: str):
    module_path = TRAINING_DIR / f"{module_name}.py"
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _load_jsonl(path: Path):
    rows = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            text = line.strip()
            if text:
                rows.append(json.loads(text))
    return rows


generate_predictions = _load_training_module("generate_predictions")
eval_metrics = _load_training_module("eval_metrics")


def test_detect_refusal_ignores_non_refusal_context():
    response = (
        "### 结论\n边界条件用于限定解域。\n"
        "### 推导\n在示例中，问题可能有无穷多解或无法求解，但这里已经给出完整解法。\n"
        "### 检查\n范围 x ∈ [0, L]。"
    )
    assert generate_predictions.detect_refusal(response) is False
    assert eval_metrics.detect_refusal(response) is False


def test_detect_refusal_matches_explicit_refusal():
    response = (
        "### 结论\n无法提供作业题的答案。\n"
        "### 推导\n请先补充完整题目后我再解答。"
    )
    assert generate_predictions.detect_refusal(response) is True
    assert eval_metrics.detect_refusal(response) is True


def test_extract_citations_skips_math_interval_tokens():
    response = "边界条件 x ∈ [0, L]，可参考 [1] 与 [doc_2]。"
    assert generate_predictions.extract_citations(response) == ["1", "doc_2"]
    assert eval_metrics.extract_citations({}, response) == ["1", "doc_2"]


def test_extract_citations_skips_variable_and_numeric_ranges():
    response = "变量范围 [x, y] 与 [0, 1] 仅用于区间说明，引用见 [eq:boundary]。"
    assert generate_predictions.extract_citations(response) == ["eq:boundary"]
    assert eval_metrics.extract_citations({}, response) == ["eq:boundary"]


def test_extract_tool_calls_supports_structured_and_plain_text_patterns():
    response = (
        '<tool_calls>[{"function":{"name":"search_docs","arguments":{"q":"x"}}}]</tool_calls>\n'
        "调用工具: calc_v1"
    )
    assert generate_predictions.extract_tool_calls(response) == ["search_docs", "calc_v1"]


def test_eval_metrics_extract_tool_calls_falls_back_to_response_parsing():
    prediction = {"id": "eval-001", "response": "调用函数: search_docs"}
    assert eval_metrics.extract_tool_calls(prediction) == ["search_docs"]


def test_eval_summary_always_contains_required_metrics():
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp = Path(tmp_dir)
        eval_file = tmp / "eval.jsonl"
        pred_file = tmp / "pred.jsonl"
        out_file = tmp / "report.json"

        eval_rows = [
            {
                "id": "eval-001",
                "query": "解释边界条件",
                "type": "concept",
                "expected": {
                    "key_points": ["结论"],
                    "citations": [],
                    "tool_calls": [],
                    "should_refuse": False,
                },
                "meta": {"lane": "style", "difficulty": "easy"},
            }
        ]
        pred_rows = [
            {
                "id": "eval-001",
                "response": "### 结论\n这是结论。\n### 推导\n这是推导。\n### 检查\n这是检查。",
                "refused": False,
            }
        ]
        eval_file.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in eval_rows) + "\n", encoding="utf-8")
        pred_file.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in pred_rows) + "\n", encoding="utf-8")

        cmd = [
            sys.executable,
            str(TRAINING_DIR / "eval_metrics.py"),
            "--eval_file",
            str(eval_file),
            "--pred_file",
            str(pred_file),
            "--output",
            str(out_file),
        ]
        proc = subprocess.run(cmd, cwd=PROJECT_ROOT, check=False, capture_output=True, text=True)
        assert proc.returncode == 0, proc.stdout + proc.stderr

        report = json.loads(out_file.read_text(encoding="utf-8"))
        summary = report.get("summary", {})
        assert set(summary.keys()) >= {
            "key_point_coverage",
            "refusal_accuracy",
            "response_format",
            "tool_call_accuracy",
            "citation_accuracy",
        }
        assert summary["tool_call_accuracy"] == 0.0
        assert summary["citation_accuracy"] == 0.0


def test_run_train_eval_override_has_priority_over_stage_default():
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp = Path(tmp_dir)
        override_eval = tmp / "override.jsonl"
        override_eval.write_text(
            json.dumps(
                {
                    "id": "override-001",
                    "query": "测试",
                    "type": "concept",
                    "expected": {
                        "key_points": ["结论"],
                        "citations": [],
                        "tool_calls": [],
                        "should_refuse": False,
                    },
                    "meta": {"lane": "style", "difficulty": "easy"},
                },
                ensure_ascii=False,
            )
            + "\n",
            encoding="utf-8",
        )

        env = dict(**os.environ)
        env.update(
            {
                "SKIP_DEP_CHECK": "1",
                "TRAIN_DRY_RUN": "1",
                "EVAL_FILE_OVERRIDE": str(override_eval),
            }
        )
        cmd = ["bash", str(TRAINING_DIR / "run_train.sh"), "style"]
        proc = subprocess.run(cmd, cwd=PROJECT_ROOT, env=env, check=False, capture_output=True, text=True)
        assert proc.returncode == 0, proc.stdout + proc.stderr
        assert f"--eval_file {override_eval}" in proc.stdout
        assert "data/training/eval/style_benchmark.jsonl" not in proc.stdout


def test_golden_cases_are_consistent_between_prediction_and_eval_extractors():
    assert GOLDEN_CASES_PATH.exists(), f"missing golden cases: {GOLDEN_CASES_PATH}"
    rows = _load_jsonl(GOLDEN_CASES_PATH)
    assert rows, "golden cases should not be empty"

    for row in rows:
        response = row["response"]
        expected_refused = bool(row["expected_refused"])
        expected_citations = row.get("expected_citations", [])
        expected_tools = row.get("expected_tool_calls", [])

        assert generate_predictions.detect_refusal(response) is expected_refused
        assert eval_metrics.detect_refusal(response) is expected_refused

        assert set(generate_predictions.extract_citations(response)) == set(expected_citations)
        assert set(eval_metrics.extract_citations({}, response)) == set(expected_citations)

        assert set(generate_predictions.extract_tool_calls(response)) == set(expected_tools)
        assert set(eval_metrics._parse_tool_calls_from_text(response)) == set(expected_tools)
