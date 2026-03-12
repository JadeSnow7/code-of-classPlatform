"""Runtime monkeypatches for this deployment environment.

放在 `code/ai_service/` 下的原因是：
1. `python xxx.py` 和 `python -m module` 默认都会把当前工作目录加入 `sys.path`
2. Python 启动时会自动尝试导入 `sitecustomize`
3. 这样可以把补丁传播到 vLLM 启动出来的 registry 子进程
"""

from __future__ import annotations

import torch


def _compile_noop(*args, **kwargs):
    if args and callable(args[0]) and len(args) == 1 and not kwargs:
        return args[0]

    def _decorator(fn):
        return fn

    return _decorator


torch.compile = _compile_noop  # type: ignore[assignment]
