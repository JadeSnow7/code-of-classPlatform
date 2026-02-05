#!/usr/bin/env python3
"""Prepare training data directories and sample files.

Usage:
    python prepare_training_data.py --create-dirs --create-samples
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any, Dict, List


def get_project_root() -> Path:
    """Find project root by walking up from this file."""
    current = Path(__file__).resolve()
    for parent in current.parents:
        if (parent / "README.md").exists() and (parent / "code").exists():
            return parent
    return current.parents[3]


TRAINING_DATA_DIRS = [
    "data/training/raw/faq",
    "data/training/raw/assignments",
    "data/training/raw/lectures",
    "data/training/processed",
    "data/training/eval",
]

# System prompt for style generation
SYSTEM_PROMPT = (
    "你是一个通用的智能教学助手。请根据以下知识点，生成一个教学对话样本。\n"
    "用户问题应该是关于该知识点的提问。\n"
    "助教回答应遵循以下结构：\n"
    "### 结论\n"
    "### 详细解释\n"
    "### 示例或检查\n"
    "{persona}"
)


# Sample training data (style SFT)
SAMPLE_STYLE_DATA: List[Dict[str, Any]] = [
    {
        "id": "style-sample-001",
        "mode": "tutor",
        "messages": [
            {
                "role": "system",
                "content": (
                    "你是高校课程助教。请按以下结构回答：\n"
                    "### 结论\n"
                    "### 推导\n"
                    "### 检查（单位/边界条件/适用条件）"
                )
            },
            {"role": "user", "content": "什么是课程中的边界条件概念？"},
            {
                "role": "assistant",
                "content": (
                    "### 结论\n"
                    "边界条件描述了两个区域交界处关键量需要满足的连续性或跳变规则。\n\n"
                    "### 推导\n"
                    "从课程的基本方程在边界处取极限，可得到“连续”或“附加项”的约束条件。\n\n"
                    "### 检查（单位/边界条件/适用条件）\n"
                    "- 适用条件：需要明确区域假设与模型前提\n"
                    "- 例外情况：存在外部源或强约束时可能出现跳变"
                )
            }
        ],
        "meta": {"source": "lecture", "chapter": "ch1", "difficulty": "medium"}
    },
    {
        "id": "style-sample-002",
        "mode": "tutor",
        "messages": [
            {
                "role": "system",
                "content": (
                    "你是高校课程助教。请按以下结构回答：\n"
                    "### 结论\n"
                    "### 推导\n"
                    "### 检查（单位/边界条件/适用条件）"
                )
            },
            {"role": "user", "content": "解释阈值效应的含义"},
            {
                "role": "assistant",
                "content": (
                    "### 结论\n"
                    "阈值效应是指当输入超过某一临界值后，系统行为发生显著变化的现象。\n\n"
                    "### 推导\n"
                    "从模型函数的分段定义或非线性响应出发，可以推导出临界点前后输出规律不同。\n\n"
                    "### 检查（单位/边界条件/适用条件）\n"
                    "- 适用条件：阈值必须明确且可测\n"
                    "- 极限情况：输入远小于阈值时变化缓慢，远大于阈值时趋于稳定"
                )
            }
        ],
        "meta": {"source": "lecture", "chapter": "ch2", "difficulty": "medium"}
    },
    {
        "id": "style-sample-003",
        "mode": "tutor",
        "messages": [
            {
                "role": "system",
                "content": (
                    "你是高校课程助教。请按以下结构回答：\n"
                    "### 结论\n"
                    "### 推导\n"
                    "### 检查（单位/边界条件/适用条件）"
                )
            },
            {"role": "user", "content": "什么是核心概念 X？"},
            {
                "role": "assistant",
                "content": (
                    "### 结论\n"
                    "核心概念 X 是用于描述系统关键特征的基础概念。\n\n"
                    "### 推导\n"
                    "从定义出发，可将概念 X 与课程中的基本量或规则建立对应关系。\n\n"
                    "### 检查（单位/边界条件/适用条件）\n"
                    "- 确保概念定义与课程假设一致\n"
                    "- 明确概念的适用范围"
                )
            }
        ],
        "meta": {"source": "lecture", "chapter": "ch1", "difficulty": "easy"}
    },
    {
        "id": "style-sample-004",
        "mode": "tutor",
        "messages": [
            {
                "role": "system",
                "content": (
                    "你是高校课程助教。请按以下结构回答：\n"
                    "### 结论\n"
                    "### 推导\n"
                    "### 检查（单位/边界条件/适用条件）"
                )
            },
            {"role": "user", "content": "区分指标 A 与指标 B"},
            {
                "role": "assistant",
                "content": (
                    "### 结论\n"
                    "指标 A 描述系统状态，指标 B 描述系统变化趋势，两者关注点不同。\n\n"
                    "### 推导\n"
                    "根据定义，指标 A 直接由观测量计算，而指标 B 往往由指标 A 的变化率或组合函数得到。\n\n"
                    "### 检查（单位/边界条件/适用条件）\n"
                    "- 确认指标单位一致或可比较\n"
                    "- 说明在何种情境下优先使用 A 或 B"
                )
            }
        ],
        "meta": {"source": "lecture", "chapter": "ch3", "difficulty": "hard"}
    },
    {
        "id": "style-sample-005",
        "mode": "tutor",
        "messages": [
            {
                "role": "system",
                "content": (
                    "你是高校课程助教。请按以下结构回答：\n"
                    "### 结论\n"
                    "### 推导\n"
                    "### 检查（单位/边界条件/适用条件）"
                )
            },
            {"role": "user", "content": "解释指标 C 的实际意义"},
            {
                "role": "assistant",
                "content": (
                    "### 结论\n"
                    "指标 C 用于衡量系统的效率或质量水平。\n\n"
                    "### 推导\n"
                    "从课程定义出发，指标 C 可由若干基础量加权得到，反映综合表现。\n\n"
                    "### 检查（单位/边界条件/适用条件）\n"
                    "- 关注量纲一致性\n"
                    "- 明确适用场景与评价口径"
                )
            }
        ],
        "meta": {"source": "lecture", "chapter": "ch4", "difficulty": "medium"}
    }
]

# Sample benchmark data
SAMPLE_BENCHMARK_DATA: List[Dict[str, Any]] = [
    {
        "id": "eval-001",
        "query": "什么是课程中的边界条件概念？",
        "type": "concept",
        "expected": {
            "key_points": ["边界", "连续", "适用条件"],
            "citations": [],
            "tool_calls": [],
            "should_refuse": False
        }
    },
    {
        "id": "eval-002",
        "query": "计算 2 + 3 的结果，并说明计算过程。",
        "type": "calculation",
        "expected": {
            "key_points": ["5"],
            "citations": [],
            "tool_calls": ["evaluate_expression"],
            "should_refuse": False
        }
    },
    {
        "id": "eval-003",
        "query": "这道作业题的答案是什么？请直接给我最终结果。",
        "type": "refusal",
        "expected": {
            "key_points": [],
            "citations": [],
            "tool_calls": [],
            "should_refuse": True
        }
    },
    {
        "id": "eval-004",
        "query": "解释指标 C 的实际意义",
        "type": "concept",
        "expected": {
            "key_points": ["指标", "衡量", "效率"],
            "citations": [],
            "tool_calls": [],
            "should_refuse": False
        }
    },
    {
        "id": "eval-005",
        "query": "推导一个通用公式的思路应该包含哪些步骤？",
        "type": "derivation",
        "expected": {
            "key_points": ["定义", "假设", "推导", "结论"],
            "citations": [],
            "tool_calls": [],
            "should_refuse": False
        }
    }
]

# Sample predictions (matching benchmark format for eval_metrics.py testing)
SAMPLE_PREDICTIONS: List[Dict[str, Any]] = [
    {
        "id": "eval-001",
        "response": (
            "### 结论\n"
            "边界条件描述了交界处的连续性或跳变规则。\n\n"
            "### 推导\n"
            "从基本方程在边界处取极限可得到连续或附加项约束。\n\n"
            "### 检查（单位/边界条件/适用条件）\n"
            "说明适用条件并避免超范围解释。"
        ),
        "citations": [],
        "tool_calls": [],
        "refused": False
    },
    {
        "id": "eval-002",
        "response": (
            "### 结论\n"
            "2 + 3 = 5。\n\n"
            "### 推导\n"
            "通过加法运算得到结果。\n\n"
            "### 检查（单位/边界条件/适用条件）\n"
            "结果与算术规则一致。"
        ),
        "citations": [],
        "tool_calls": ["evaluate_expression"],
        "refused": False
    },
    {
        "id": "eval-003",
        "response": (
            "### 说明\n"
            "我无法直接给出作业的最终答案。\n\n"
            "### 建议\n"
            "请说明你已尝试的步骤，我可以提供提示。"
        ),
        "citations": [],
        "tool_calls": [],
        "refused": True
    },
    {
        "id": "eval-004",
        "response": (
            "### 结论\n"
            "指标 C 用于衡量系统效率或质量水平。\n\n"
            "### 推导\n"
            "由基础量加权或组合得到。\n\n"
            "### 检查（单位/边界条件/适用条件）\n"
            "明确评价口径并说明适用范围。"
        ),
        "citations": [],
        "tool_calls": [],
        "refused": False
    },
    {
        "id": "eval-005",
        "response": (
            "### 结论\n"
            "推导思路应包含定义、假设、推导过程与结论。\n\n"
            "### 推导\n"
            "从定义出发，列出假设与中间步骤，最后得到结论。\n\n"
            "### 检查（单位/边界条件/适用条件）\n"
            "核对适用条件与边界情况。"
        ),
        "citations": [],
        "tool_calls": [],
        "refused": False
    }
]

def create_directories(root: Path, dry_run: bool = False) -> None:
    """Create training data directory structure."""
    for rel_path in TRAINING_DATA_DIRS:
        dir_path = root / rel_path
        if dry_run:
            print(f"[DRY-RUN] Would create: {dir_path}")
        else:
            dir_path.mkdir(parents=True, exist_ok=True)
            print(f"[OK] Created: {dir_path}")


def write_jsonl(path: Path, items: List[Dict[str, Any]], overwrite: bool = False) -> bool:
    """Write items to JSONL file. Returns True if written."""
    if path.exists() and not overwrite:
        print(f"[SKIP] Already exists (use --overwrite to replace): {path}")
        return False
    
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for item in items:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")
    print(f"[OK] Written {len(items)} samples to: {path}")
    return True


def create_sample_data(root: Path, overwrite: bool = False) -> None:
    """Create sample training and evaluation data."""
    # Style SFT sample
    write_jsonl(
        root / "data/training/processed/style_sft_sample.jsonl",
        SAMPLE_STYLE_DATA,
        overwrite
    )
    
    # Benchmark sample
    write_jsonl(
        root / "data/training/eval/benchmark_sample.jsonl",
        SAMPLE_BENCHMARK_DATA,
        overwrite
    )
    
    # Predictions sample (for testing eval_metrics.py)
    write_jsonl(
        root / "data/training/eval/predictions_sample.jsonl",
        SAMPLE_PREDICTIONS,
        overwrite
    )

# System prompt for style generation


def validate_data_format(root: Path) -> int:
    """Validate existing JSONL files. Returns count of errors."""
    errors = 0
    processed_dir = root / "data/training/processed"
    
    if not processed_dir.exists():
        return 0
    
    for jsonl_file in processed_dir.glob("*.jsonl"):
        with jsonl_file.open("r", encoding="utf-8") as f:
            for i, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                    if "id" not in obj:
                        print(f"[WARN] {jsonl_file.name}:{i} - Missing 'id' field")
                        errors += 1
                    if "messages" not in obj:
                        print(f"[WARN] {jsonl_file.name}:{i} - Missing 'messages' field")
                        errors += 1
                except json.JSONDecodeError as e:
                    print(f"[ERROR] {jsonl_file.name}:{i} - Invalid JSON: {e}")
                    errors += 1
    
    if errors == 0:
        print("[OK] All JSONL files validated successfully")
    else:
        print(f"[WARN] Found {errors} validation errors")
    
    return errors


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Prepare training data directories and sample files"
    )
    parser.add_argument(
        "--create-dirs",
        action="store_true",
        help="Create training data directory structure"
    )
    parser.add_argument(
        "--create-samples",
        action="store_true",
        help="Create sample training data (writes *_sample.jsonl)"
    )
    parser.add_argument(
        "--validate",
        action="store_true",
        help="Validate existing JSONL files"
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite existing sample files"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without making changes"
    )
    parser.add_argument(
        "--root",
        type=str,
        default="",
        help="Project root directory (auto-detected if not specified)"
    )
    
    args = parser.parse_args()
    
    root = Path(args.root) if args.root else get_project_root()
    print(f"Project root: {root}")
    
    if not any([args.create_dirs, args.create_samples, args.validate]):
        parser.print_help()
        return
    
    if args.create_dirs:
        create_directories(root, dry_run=args.dry_run)
    
    if args.create_samples and not args.dry_run:
        create_sample_data(root, overwrite=args.overwrite)
    elif args.create_samples and args.dry_run:
        print("[DRY-RUN] Would create sample data files")
    
    if args.validate:
        validate_data_format(root)


if __name__ == "__main__":
    main()
