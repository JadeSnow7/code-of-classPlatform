#!/usr/bin/env python3
"""Patched vLLM CLI entrypoint for Ada GPUs on this server.

当前服务器上的 PyTorch / vLLM 组合在导入阶段会因为若干 `@torch.compile`
装饰器触发 torch inductor 兼容问题。对 RTX 4090 而言，这些路径并非本次文本
推理所必需，因此这里在导入 vLLM 之前把 `torch.compile` 临时替换成 no-op，
仅用于拉起 OpenAI-compatible API Server。
"""

from __future__ import annotations

import sys

import torch


def _compile_noop(*args, **kwargs):
    """把 torch.compile 退化为“直接返回原函数”的装饰器。"""
    if args and callable(args[0]) and len(args) == 1 and not kwargs:
        return args[0]

    def _decorator(fn):
        return fn

    return _decorator


torch.compile = _compile_noop  # type: ignore[assignment]

from vllm.entrypoints.cli.main import main  # noqa: E402


if __name__ == "__main__":
    sys.exit(main())
