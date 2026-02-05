# AI Training (LoRA/QLoRA)

This folder provides training utilities that follow the project plans and data spec:
- `docs/ai/post-training-finetuning-plan.md`
- `docs/ai/training-data-spec.md`

## Quick Start

```bash
# 1. Install training deps (separate from runtime deps)
pip install -r code/ai_service/training/requirements.txt

# 2. Create data directories and sample data
python3 code/ai_service/training/prepare_training_data.py --create-dirs --create-samples

# 3. Run a stage (style/tool/rag/all/sample)
bash code/ai_service/training/run_train.sh sample  # Use sample data for testing
bash code/ai_service/training/run_train.sh style   # Full training
```

## Scripts

| Script | Description |
|--------|-------------|
| `prepare_training_data.py` | Create data directories, generate sample data, validate JSONL |
| `train_lora.py` | LoRA/QLoRA training with TensorBoard, early stopping, auto-eval |
| `generate_predictions.py` | Generate predictions using trained adapter |
| `generate_synthetic_data.py` | Generate synthetic JSONL data (tutor/rag/tool) |
| `eval_metrics.py` | Evaluate predictions against benchmark |
| `run_train.sh` | Convenient training runner with pre-flight checks |

## Inputs
- Training JSONL: `data/training/processed/*.jsonl`
- Eval JSONL: `data/training/eval/benchmark.jsonl`

## Outputs
- LoRA adapters: `outputs/adapter/*`
- Training logs: `outputs/logs/`
- Eval reports: `outputs/eval_report.json`, `outputs/eval_report.md`

## Distillation + Smoke (Optional)

For fast pipeline validation (data sanity + metrics output), you can distill chat-style JSONL into prompt/response and run a lightweight smoke evaluation:

```bash
python3 scripts/ai/distill_data.py \
  --input assets/training_samples/processed/style_sft_sample.jsonl \
  --output outputs/distilled/style_sft_distilled.jsonl \
  --report outputs/distillation_report.json

python3 scripts/ai/train_smoke.py \
  --train outputs/distilled/style_sft_distilled.jsonl \
  --eval outputs/distilled/benchmark_distilled.jsonl \
  --metrics outputs/smoke_train_metrics.json
```

## Evaluate

```bash
# Generate predictions from trained adapter
python3 code/ai_service/training/generate_predictions.py \
  --model_name_or_path Qwen/Qwen3-8B-Instruct \
  --adapter_path outputs/adapter/adapter_style \
  --eval_file data/training/eval/benchmark.jsonl \
  --output outputs/predictions.jsonl

# Run evaluation
python3 code/ai_service/training/eval_metrics.py \
  --eval_file data/training/eval/benchmark.jsonl \
  --pred_file outputs/predictions.jsonl \
  --output outputs/eval_report.json \
  --format markdown \
  --group_by_type
```

## Synthetic Data

```bash
python3 code/ai_service/training/generate_synthetic_data.py \
  --model_name_or_path Qwen/Qwen3-8B-Instruct \
  --input_file topics.txt \
  --output_file data/training/processed/synthetic.jsonl \
  --mode tutor \
  --num_samples 5
```

## Key Parameters

### train_lora.py
- `--use_qlora` / `--bf16` - Enable 4-bit quantization
- `--early_stopping_patience N` - Stop if no improvement for N evals
- `--load_best_model_at_end` - Load best checkpoint at end
- `--auto_eval` - Auto-run prediction + evaluation after training
- `--report_to tensorboard` - Enable TensorBoard logging

### run_train.sh Environment Variables
- `MODEL_NAME_OR_PATH` - Base model (default: Qwen/Qwen3-8B-Instruct)
- `TRAIN_NOTIFY=1` - Enable completion notification
- `TRAIN_NOTIFY_URL` - Webhook URL for notification

## Notes
- For QLoRA, ensure `bitsandbytes` and CUDA are correctly installed.
- Run `prepare_training_data.py --validate` to check data format before training.
