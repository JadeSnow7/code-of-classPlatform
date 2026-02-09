# MS-Swift Training Guide

This directory contains scripts for finetuning LLMs using [ModelScope Swift](https://github.com/modelscope/ms-swift).

## Why MS-Swift?

- **Zero Boilerplate**: Replaces 500+ lines of custom training code with a simple CLI or Python interface.
- **State-of-the-Art**: Supports QLoRA, NEFTune, Flash Attention 2, and DPO out-of-the-box.
- **Easy Deployment**: One-click export to vLLM or Ollama compatible formats.
- **Web UI**: Includes a web interface for training and inference monitoring.

## Installation

```bash
pip install ms-swift[llm] -U
```

## Quick Start (CLI)

Use `run_swift.sh` for a standardized training run:

```bash
bash run_swift.sh
```

Or run directly:

```bash
swift sft --model_type qwen2-7b-instruct --dataset ../../data/training/processed/all_sft.jsonl --output_dir output
```

## Advanced Usage (Python)

If you need programmatic control (e.g. custom data loading logic), use `train_swift.py`:

```bash
python train_swift.py --model qwen2-7b-instruct --data ../../data/training/processed/all_sft.jsonl
```

## Web UI

For an interactive training experience:

```bash
swift web-ui
```
