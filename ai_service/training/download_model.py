#!/usr/bin/env python3
"""
Download model from ModelScope and return the local path.
Usage: python download_model.py <model_id> [--cache_dir <dir>]
"""
import argparse
import os
import sys

def main():
    parser = argparse.ArgumentParser(description="Download model from ModelScope")
    parser.add_argument("model_id", type=str, help="ModelScope model ID (e.g., qwen/Qwen2.5-7B-Instruct)")
    parser.add_argument("--cache_dir", type=str, default=None, help="Cache directory")
    args = parser.parse_args()

    try:
        from modelscope import snapshot_download
    except ImportError:
        print("Error: modelscope not installed. Please install it with `pip install modelscope`", file=sys.stderr)
        sys.exit(1)

    print(f"Downloading {args.model_id} from ModelScope...", file=sys.stderr)
    try:
        model_dir = snapshot_download(args.model_id, cache_dir=args.cache_dir)
        # Print only the path to stdout so it can be captured by shell script
        print(model_dir)
    except Exception as e:
        # Retry with lowercase org if it starts with Qwen/
        if args.model_id.startswith("Qwen/"):
            new_id = "qwen/" + args.model_id[5:]
            print(f"Retrying with {new_id}...", file=sys.stderr)
            try:
                model_dir = snapshot_download(new_id, cache_dir=args.cache_dir)
                print(model_dir)
                sys.exit(0)
            except Exception:
                pass
        
        print(f"Error downloading model: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
