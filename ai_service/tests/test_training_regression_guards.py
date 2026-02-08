from __future__ import annotations

import importlib.util
from pathlib import Path


TRAINING_DIR = Path(__file__).resolve().parents[1] / "training"


def _load_training_module(module_name: str):
    module_path = TRAINING_DIR / f"{module_name}.py"
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


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


def test_extract_tool_calls_supports_structured_and_plain_text_patterns():
    response = (
        '<tool_calls>[{"function":{"name":"search_docs","arguments":{"q":"x"}}}]</tool_calls>\n'
        "调用工具: calc_v1"
    )
    assert generate_predictions.extract_tool_calls(response) == ["search_docs", "calc_v1"]


def test_eval_metrics_extract_tool_calls_falls_back_to_response_parsing():
    prediction = {"id": "eval-001", "response": "调用函数: search_docs"}
    assert eval_metrics.extract_tool_calls(prediction) == ["search_docs"]
