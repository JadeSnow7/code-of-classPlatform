#!/usr/bin/env python3
"""Lightweight evaluation script for training regressions.

Inputs:
- benchmark JSONL (data/training/eval/benchmark.jsonl)
- predictions JSONL (model outputs)
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any, Dict, List, Tuple


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate model outputs against benchmark.")
    parser.add_argument("--eval_file", type=str, required=True)
    parser.add_argument("--pred_file", type=str, required=True)
    parser.add_argument("--output", type=str, default="outputs/eval_report.json")
    parser.add_argument("--dump_details", action="store_true")
    parser.add_argument("--format", type=str, choices=["json", "markdown"], default="json",
                        help="Output format: json or markdown")
    parser.add_argument("--group_by_type", action="store_true",
                        help="Group statistics by query type")
    return parser.parse_args()


def load_jsonl(path: Path) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                items.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return items


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().lower()


def extract_response(sample: Dict[str, Any]) -> str:
    for key in ("response", "output", "text", "assistant"):
        if key in sample:
            return str(sample.get(key) or "")
    messages = sample.get("messages")
    if isinstance(messages, list):
        for msg in reversed(messages):
            if isinstance(msg, dict) and msg.get("role") == "assistant":
                return str(msg.get("content") or "")
    return ""


def extract_citations(sample: Dict[str, Any], response: str) -> List[str]:
    citations = sample.get("citations") or sample.get("references")
    if isinstance(citations, list):
        return [str(x) for x in citations if x]
    matches = re.findall(r"\[([^\]]+)\]", response)
    results: List[str] = []
    for m in matches:
        for token in re.split(r"[,\s]+", m):
            token = token.strip()
            if token:
                results.append(token)
    return results


def extract_tool_calls(sample: Dict[str, Any]) -> List[str]:
    tool_calls = sample.get("tool_calls") or sample.get("tools")
    if isinstance(tool_calls, list):
        names: List[str] = []
        for call in tool_calls:
            if isinstance(call, str):
                names.append(call)
            elif isinstance(call, dict):
                fn = call.get("name") or call.get("function", {}).get("name")
                if fn:
                    names.append(str(fn))
        return names
    return []


def detect_refusal(response: str) -> bool:
    text = response.strip()
    if not text:
        return False
    keywords = [
        "无法", "不能", "不足", "缺少", "需要更多", "超出", "不确定", "资料不足", "无法确定"
    ]
    return any(k in text for k in keywords)


def check_format(response: str) -> bool:
    required = ["### 结论", "### 推导", "### 检查"]
    return all(r in response for r in required)


def ratio(numerator: int, denominator: int) -> float:
    if denominator <= 0:
        return 0.0
    return numerator / denominator


def score_sample(
    expected: Dict[str, Any],
    prediction: Dict[str, Any] | None,
) -> Tuple[Dict[str, Any], Dict[str, float]]:
    result: Dict[str, Any] = {}
    metrics: Dict[str, float] = {}

    if prediction is None:
        result["missing_prediction"] = True
        return result, metrics

    response = extract_response(prediction)
    expected_points = expected.get("key_points") or []
    expected_citations = expected.get("citations") or []
    expected_tools = expected.get("tool_calls") or []
    should_refuse = expected.get("should_refuse")

    response_norm = normalize_text(response)

    if expected_points:
        covered = 0
        for point in expected_points:
            point_norm = normalize_text(str(point))
            if point_norm and point_norm in response_norm:
                covered += 1
        metrics["key_point_coverage"] = ratio(covered, len(expected_points))
        result["key_points_hit"] = covered
        result["key_points_total"] = len(expected_points)

    if expected_citations:
        pred_citations = extract_citations(prediction, response)
        expected_set = set(str(x) for x in expected_citations)
        pred_set = set(str(x) for x in pred_citations)
        hit = len(expected_set & pred_set)
        metrics["citation_accuracy"] = ratio(hit, len(expected_set))
        result["citations_hit"] = hit
        result["citations_total"] = len(expected_set)

    if expected_tools:
        pred_tools = extract_tool_calls(prediction)
        expected_set = set(str(x) for x in expected_tools)
        pred_set = set(str(x) for x in pred_tools)
        hit = len(expected_set & pred_set)
        metrics["tool_call_accuracy"] = ratio(hit, len(expected_set))
        result["tool_calls_hit"] = hit
        result["tool_calls_total"] = len(expected_set)

    if should_refuse is not None:
        predicted_refused = prediction.get("refused")
        if predicted_refused is None:
            predicted_refused = detect_refusal(response)
        metrics["refusal_accuracy"] = 1.0 if bool(predicted_refused) == bool(should_refuse) else 0.0
        result["refused_pred"] = bool(predicted_refused)
        result["refused_expected"] = bool(should_refuse)

    metrics["response_format"] = 1.0 if check_format(response) else 0.0
    result["response_format"] = bool(metrics["response_format"])

    return result, metrics


def average_metric(values: List[float]) -> float:
    if not values:
        return 0.0
    return sum(values) / len(values)


def main() -> None:
    args = parse_args()
    eval_items = load_jsonl(Path(args.eval_file))
    pred_items = load_jsonl(Path(args.pred_file))

    pred_map = {item.get("id"): item for item in pred_items if item.get("id")}

    summary_values: Dict[str, List[float]] = {}
    type_values: Dict[str, Dict[str, List[float]]] = {}
    details: List[Dict[str, Any]] = []

    for sample in eval_items:
        sample_id = sample.get("id")
        expected = sample.get("expected", {})
        sample_type = sample.get("type", "unknown")
        pred = pred_map.get(sample_id)
        result, metrics = score_sample(expected, pred)

        for key, value in metrics.items():
            summary_values.setdefault(key, []).append(value)
            # Group by type
            if args.group_by_type:
                type_values.setdefault(sample_type, {}).setdefault(key, []).append(value)

        if args.dump_details:
            details.append({
                "id": sample_id,
                "type": sample_type,
                "metrics": metrics,
                "result": result,
            })

    summary = {key: average_metric(values) for key, values in summary_values.items()}
    report: Dict[str, Any] = {
        "summary": summary,
        "count": len(eval_items),
    }

    if args.group_by_type:
        type_summary = {}
        for t, metrics_dict in type_values.items():
            type_summary[t] = {
                "count": len(next(iter(metrics_dict.values()), [])),
                "metrics": {k: average_metric(v) for k, v in metrics_dict.items()}
            }
        report["by_type"] = type_summary

    if args.dump_details:
        report["details"] = details

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if args.format == "markdown":
        md_content = generate_markdown_report(report, args.eval_file, args.pred_file)
        md_path = output_path.with_suffix(".md")
        md_path.write_text(md_content, encoding="utf-8")
        print(f"Markdown report saved to: {md_path}")
    
    # Always save JSON as well
    output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report["summary"], ensure_ascii=False, indent=2))


def generate_markdown_report(
    report: Dict[str, Any],
    eval_file: str,
    pred_file: str,
) -> str:
    """Generate a markdown format evaluation report."""
    lines = [
        "# 评估报告",
        "",
        f"- **评估集**: `{eval_file}`",
        f"- **预测文件**: `{pred_file}`",
        f"- **样本数**: {report.get('count', 0)}",
        "",
        "## 总体指标",
        "",
        "| 指标 | 得分 |",
        "|------|------|",
    ]

    summary = report.get("summary", {})
    metric_names = {
        "key_point_coverage": "关键点覆盖率",
        "citation_accuracy": "引用正确率",
        "tool_call_accuracy": "工具调用准确率",
        "refusal_accuracy": "拒答准确率",
        "response_format": "格式合规率",
    }
    for key, value in summary.items():
        display_name = metric_names.get(key, key)
        lines.append(f"| {display_name} | {value:.2%} |")

    # By type section
    by_type = report.get("by_type")
    if by_type:
        lines.extend(["", "## 按类型统计", ""])
        for t, data in by_type.items():
            lines.append(f"### {t} (n={data.get('count', 0)})")
            lines.append("")
            metrics = data.get("metrics", {})
            for key, value in metrics.items():
                display_name = metric_names.get(key, key)
                lines.append(f"- {display_name}: {value:.2%}")
            lines.append("")

    return "\n".join(lines)


if __name__ == "__main__":
    main()

