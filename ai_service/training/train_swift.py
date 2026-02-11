#!/usr/bin/env python3
"""Deprecated entrypoint for ms-swift training.

This file intentionally no longer provides programmatic training integration.
Use CLI-only invocation to avoid API drift:

    python3 -m swift.cli.sft ...
"""

from __future__ import annotations

import argparse
import subprocess
import sys


DEPRECATION_MESSAGE = (
    "[DEPRECATED] train_swift.py is no longer used as an executable training path.\n"
    "Use CLI-only ms-swift entrypoint instead:\n"
    "  python3 -m swift.cli.sft --model ... --dataset ...\n"
    "For reproducible framework comparison, use:\n"
    "  python3 code/ai_service/training/run_compare_stage.py ..."
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Deprecated: forward to python3 -m swift.cli.sft if --forward-cli is set."
    )
    parser.add_argument(
        "--forward-cli",
        action="store_true",
        help="Forward remaining args to `python3 -m swift.cli.sft` (compatibility only).",
    )
    parser.add_argument(
        "swift_args",
        nargs=argparse.REMAINDER,
        help="Arguments passed to swift CLI when --forward-cli is enabled.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if not args.forward_cli:
        print(DEPRECATION_MESSAGE)
        raise SystemExit(1)

    forwarded = list(args.swift_args)
    if forwarded and forwarded[0] == "--":
        forwarded = forwarded[1:]

    cmd = [sys.executable, "-m", "swift.cli.sft", *forwarded]
    print(DEPRECATION_MESSAGE)
    print("[INFO] Forwarding command:", " ".join(cmd))
    raise SystemExit(subprocess.call(cmd))


if __name__ == "__main__":
    main()
