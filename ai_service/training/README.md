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

# 3. Run a stage (style/writing/tool/rag/all/sample)
bash code/ai_service/training/run_train.sh sample   # Quick test (3 samples)
bash code/ai_service/training/run_train.sh style    # Electromagnetic course (28 samples)
bash code/ai_service/training/run_train.sh writing  # Academic writing (12 samples)
bash code/ai_service/training/run_train.sh all      # Multitask (40 samples)
```

## Formal Sprint Assets (2026-02-15)

```bash
# Generate formal benchmark/tool-rag datasets and golden cases
bash scripts/ai/prepare_formal_assets.sh

# Validate formal benchmark contract directly
python3 code/ai_service/training/validate_benchmark.py \
  --input data/training/eval/benchmark_formal_v1.jsonl \
  --min-count 60 \
  --strict-meta
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
| `validate_benchmark.py` | Validate benchmark JSONL schema (formal contract checks) |
| `run_formal_stage.py` | Run one stage (train + predict + eval) and append run manifest |
| `summarize_formal_batch.py` | Compute mean/std gates and docs-sync decision from run manifest |
| `build_formal_assets.py` | Build formal benchmark/tool-rag datasets and golden cases |

## Training Stages

### Style Training (Electromagnetic Course)
Trains the model to act as an electromagnetic course teaching assistant.

- **Data**: 28 training samples + 11 evaluation samples
- **Topics**: Maxwell equations, electromagnetic waves, boundary conditions, energy/momentum
- **Output**: `outputs/adapter/adapter_style/`
- **Command**: `bash code/ai_service/training/run_train.sh style`

### Writing Training (Academic Writing Guidance)
Trains the model to provide academic writing guidance and feedback.

- **Data**: 12 training samples + 6 evaluation samples
- **Topics**: Paper structure, formatting standards, language expression, academic integrity
- **Output**: `outputs/adapter/adapter_writing/`
- **Command**: `bash code/ai_service/training/run_train.sh writing`

### Multitask Training (All)
Trains the model on both electromagnetic course and academic writing tasks.

- **Data**: 40 training samples (28 style + 12 writing) + 11 evaluation samples
- **Output**: `outputs/adapter/adapter_multitask/`
- **Command**: `bash code/ai_service/training/run_train.sh all`

### Sample Training (Quick Test)
Quick smoke test with minimal data to validate the training pipeline.

- **Data**: 3 training samples
- **Output**: `outputs/adapter/adapter_sample/`
- **Command**: `bash code/ai_service/training/run_train.sh sample`

## Inputs
- Training JSONL: `data/training/processed/*.jsonl`
- Eval JSONL: `data/training/eval/benchmark.jsonl`
- Formal benchmark: `data/training/eval/benchmark_formal_v1.jsonl`
- Pilot benchmarks: `data/training/eval/tool_benchmark_pilot_v1.jsonl`, `data/training/eval/rag_benchmark_pilot_v1.jsonl`

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
- `EVAL_FILE_OVERRIDE` - Force benchmark file and bypass stage default eval file
- `SEED` - Random seed passed into training
- `TRAIN_DRY_RUN=1` - Print resolved command only (no training execution)
- `SKIP_DEP_CHECK=1` - Skip python dependency checks (for CI/testing only)
- `TRAIN_NOTIFY=1` - Enable completion notification
- `TRAIN_NOTIFY_URL` - Webhook URL for notification

## Formal Stage Runner

```bash
# Example: style stage, profile A, seed 42
bash scripts/ai/run_formal_stage.sh \
  --batch 2026-02-15-formal-exp \
  --stage style \
  --benchmark-file data/training/eval/benchmark_formal_v1.jsonl \
  --preset A \
  --seed 42

# Summarize batch and evaluate acceptance gate
python3 code/ai_service/training/summarize_formal_batch.py \
  --batch 2026-02-15-formal-exp \
  --stage all
```

## Notes
- For QLoRA, ensure `bitsandbytes` and CUDA are correctly installed.
- Run `prepare_training_data.py --validate` to check data format before training.
