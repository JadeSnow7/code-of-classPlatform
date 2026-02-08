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

REFUSAL_SENTENCE_PATTERNS = [
    re.compile(r"^(?:抱歉|对不起)?[,，]?(?:我)?(?:现在)?(?:无法|不能|不便|没法|不能够).{0,24}(?:回答|提供|协助|完成|执行|给出|处理)"),
    re.compile(r"^(?:无法|不能|不便|没法).{0,24}(?:作业|该题|题目|请求|问题).{0,16}(?:答案|内容|帮助)"),
    re.compile(r"^(?:我)?(?:无法|不能|不便|没法)(?:确定|判断).{0,16}(?:答案|结果|结论)"),
    re.compile(r"^(?:请|请先)(?:补充|提供).{0,20}(?:题目|上下文|信息|条件)"),
    re.compile(r"(?:信息|资料|上下文).{0,10}(?:不足|缺失|不完整).{0,10}(?:无法|不能)"),
]
SHORT_REFUSAL_PHRASES = (
    "无法回答",
    "不能回答",
    "无法提供",
    "不能提供",
    "无法确定",
    "无法执行",
    "拒绝回答",
)
TOOL_NAME_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_.-]{0,127}$")


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


def _looks_like_math_interval(content: str) -> bool:
    compact = content.strip()
    if any(op in compact for op in ("∈", "≤", "≥", "<=", ">=")):
        return True
    if re.fullmatch(r"-?\d+(?:\.\d+)?\s*,\s*[A-Za-z]", compact):
        return True
    if re.fullmatch(r"[A-Za-z]\s*,\s*[A-Za-z]", compact):
        return True
    return False


def _normalize_citation_token(token: str) -> str:
    return token.strip().strip("[](){}<>.,;:!?\"'")


def _is_valid_citation_token(token: str) -> bool:
    if not token or token.startswith("#"):
        return False
    if re.fullmatch(r"\d{1,4}", token):
        return True
    if re.fullmatch(r"[A-Za-z]", token):
        return False
    return bool(re.fullmatch(r"[A-Za-z][A-Za-z0-9_.-]{1,63}", token))


def _parse_citations_from_text(response: str) -> List[str]:
    results: List[str] = []
    for match in re.findall(r"\[([^\]]+)\]", response):
        if _looks_like_math_interval(match):
            continue
        for token in re.split(r"[,\s]+", match):
            normalized = _normalize_citation_token(token)
            if _is_valid_citation_token(normalized) and normalized not in results:
                results.append(normalized)
    return results


def extract_citations(sample: Dict[str, Any], response: str) -> List[str]:
    citations = sample.get("citations") or sample.get("references")
    if isinstance(citations, list):
        normalized = []
        for item in citations:
            token = _normalize_citation_token(str(item))
            if _is_valid_citation_token(token) and token not in normalized:
                normalized.append(token)
        return normalized
    return _parse_citations_from_text(response)


def _append_unique(values: List[str], candidate: str) -> None:
    name = candidate.strip().strip("`\"'")
    if not name or not TOOL_NAME_RE.fullmatch(name):
        return
    if name not in values:
        values.append(name)


def _collect_tool_names_from_obj(obj: Any, names: List[str]) -> None:
    if isinstance(obj, dict):
        fn = obj.get("function")
        if isinstance(fn, dict):
            fn_name = fn.get("name")
            if isinstance(fn_name, str):
                _append_unique(names, fn_name)
        name = obj.get("name")
        if isinstance(name, str) and (
            "arguments" in obj or "function" in obj or obj.get("type") in {"function", "tool"}
        ):
            _append_unique(names, name)
        for value in obj.values():
            _collect_tool_names_from_obj(value, names)
    elif isinstance(obj, list):
        for item in obj:
            _collect_tool_names_from_obj(item, names)


def _parse_tool_calls_from_text(response: str) -> List[str]:
    tools: List[str] = []

    for block in re.findall(r"<tool_calls>(.*?)</tool_calls>", response, re.DOTALL):
        payload = block.strip()
        if not payload:
            continue
        try:
            parsed = json.loads(payload)
        except json.JSONDecodeError:
            for name in re.findall(r'"name"\s*:\s*"([^"]+)"', payload):
                _append_unique(tools, name)
        else:
            _collect_tool_names_from_obj(parsed, tools)

    for block in re.findall(r"```(?:json)?\s*([\[{].*?[\]}])\s*```", response, re.DOTALL):
        try:
            parsed = json.loads(block)
        except json.JSONDecodeError:
            continue
        _collect_tool_names_from_obj(parsed, tools)

    for pattern in (
        r'"function"\s*:\s*\{\s*"name"\s*:\s*"([^"]+)"',
        r'"tool_name"\s*:\s*"([^"]+)"',
        r'(?:调用(?:工具|函数)|工具(?:调用)?|函数(?:调用)?)\s*[:：]\s*([A-Za-z_][A-Za-z0-9_.-]*)',
    ):
        for name in re.findall(pattern, response):
            _append_unique(tools, name)

    return tools


def extract_tool_calls(sample: Dict[str, Any]) -> List[str]:
    tool_calls = sample.get("tool_calls") or sample.get("tools")
    if isinstance(tool_calls, list):
        names: List[str] = []
        for call in tool_calls:
            if isinstance(call, str):
                _append_unique(names, call)
            elif isinstance(call, dict):
                fn = call.get("name") or call.get("function", {}).get("name")
                if fn:
                    _append_unique(names, str(fn))
        return names
    if isinstance(tool_calls, str):
        return _parse_tool_calls_from_text(tool_calls)
    response = extract_response(sample)
    if response:
        return _parse_tool_calls_from_text(response)
    return []


def detect_refusal(response: str) -> bool:
    text = response.strip()
    if not text:
        return False
    compact = re.sub(r"\s+", " ", text)
    sentences = [s.strip() for s in re.split(r"[。！？\n]+", compact) if s.strip()]
    for sentence in sentences:
        for pattern in REFUSAL_SENTENCE_PATTERNS:
            if pattern.search(sentence):
                return True
    return len(compact) <= 120 and any(phrase in compact for phrase in SHORT_REFUSAL_PHRASES)


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
