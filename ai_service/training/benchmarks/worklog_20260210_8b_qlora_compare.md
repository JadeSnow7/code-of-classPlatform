# 8B QLoRA Compare Worklog (2026-02-10 UTC)

## Scope
- Goal: implement and execute `ms-swift` vs `custom` real training compare for 8B + QLoRA.
- Batch: `swift-vs-custom-8b-qlora-20260210T0715Z`
- Server: `root@connect.cqa1.seetacloud.com:43821`

## Implemented code changes (local)
- `code/ai_service/training/run_compare_stage.py`
  - Added `--python-bin`, `--use-qlora/--no-use-qlora`, 8B local default model path.
  - Added explicit `--swift-model-type` and `--swift-template-id` for local path mode.
  - Added QLoRA metadata fields in metrics: `quantization_mode`, `qlora_requested`, `qlora_effective`, `python_bin`, `swift_version`.
  - Added QLoRA enforcement: requested but ineffective => `INVALID`.
  - Set save/eval step policy to `max_steps` for storage control.
- `code/ai_service/training/run_compare_batch.py`
  - Added `--python-bin`, `--use-qlora/--no-use-qlora`, `--swift-model-type`, `--swift-template-id`.
  - Propagated all above to stage runner.
- `code/ai_service/training/benchmarks/verify_phase0.sh`
  - Added injectable envs: `PYTHON_BIN`, `MODEL_REF`, `BATCH_NAME`, `COMPARE_ROOT`.
  - Default model path switched to 8B local path.
- `code/ai_service/training/benchmarks/preflight_alignment.py`
  - Added fallback args for local-path swift runtime: `--swift-model-type`, `--swift-template-id`.
- `code/ai_service/training/benchmarks/metrics_schema.json`
  - Added required fields: `quantization_mode`, `qlora_requested`, `qlora_effective`, `python_bin`, `swift_version`.
- `code/ai_service/training/train_lora.py`
  - Added args: `--swift_model_type`, `--swift_template_id`.
  - Added local-path fallback for swift template runtime when model meta auto-match fails.
- `code/ai_service/tests/test_training_compare_pipeline.py`
  - Updated fixture to satisfy new required schema fields.

## Local validation
- `python3 -m py_compile` passed for updated scripts.
- `python3 -m pytest -q code/ai_service/tests/test_training_compare_pipeline.py` passed (5/5).

## Remote execution performed
- Synced compare scripts and benchmark file to server.
- Installed `ms-swift` (`3.12.4`) via `/root/miniconda3/bin/python -m pip install -U ms-swift`.
- Phase0 verification passed:
  - `swift.cli.sft --help` OK
  - tokenizer load for 8B local path OK
  - batch naming check OK
  - collect metrics empty batch check OK (`NO_RUNS_FOUND`)
- Archived prior QLoRA feasibility evidence into batch audit dir (2 historical `bnb_quant_result.json`).
- Cleanup performed with auditable artifacts:
  - checkpoint cleanup: ~7.0 GB deleted.
  - extra expired artifacts cleanup (quantization/training snapshots + duplicate caches): ~86.0 GB deleted.
  - `/root/autodl-tmp` free space increased to ~102 GB.

## Remote blocking encountered
- After starting smoke execution, SSH connectivity became unstable then fully unavailable.
- Current error: `kex_exchange_identification: Connection closed by remote host` before auth.
- Multiple reconnect attempts failed (18 retries in loop).
- Because of this, smoke run completion status cannot currently be retrieved/finalized.

## Resume commands (run after SSH recovery)

```bash
# 1) Check connectivity
ssh -p 43821 root@connect.cqa1.seetacloud.com 'hostname && date -u +%Y-%m-%dT%H:%M:%SZ'

# 2) Ensure latest scripts are in place (if needed, re-scp)
scp -P 43821 code/ai_service/training/run_compare_stage.py code/ai_service/training/run_compare_batch.py code/ai_service/training/train_lora.py root@connect.cqa1.seetacloud.com:/root/graduationDesign/code/ai_service/training/
scp -P 43821 code/ai_service/training/benchmarks/preflight_alignment.py root@connect.cqa1.seetacloud.com:/root/graduationDesign/code/ai_service/training/benchmarks/

# 3) Resume custom smoke
ssh -p 43821 root@connect.cqa1.seetacloud.com 'cd /root/graduationDesign && /root/miniconda3/bin/python code/ai_service/training/run_compare_stage.py --python-bin /root/miniconda3/bin/python --batch swift-vs-custom-8b-qlora-20260210T0715Z --framework custom --stage all --seed 42 --model-ref /root/autodl-tmp/graduationDesign_runtime/models/JunHowie/Qwen3-8B-Instruct --swift-model-type qwen3_nothinking --swift-template-id qwen --out-root outputs/training_compare --max-steps 10 --sample-size 20 --custom-template-backend swift --use-qlora --resume-from all_custom_s42_ms10_smoke'

# 4) Run swift smoke
ssh -p 43821 root@connect.cqa1.seetacloud.com 'cd /root/graduationDesign && /root/miniconda3/bin/python code/ai_service/training/run_compare_stage.py --python-bin /root/miniconda3/bin/python --batch swift-vs-custom-8b-qlora-20260210T0715Z --framework swift --stage all --seed 42 --model-ref /root/autodl-tmp/graduationDesign_runtime/models/JunHowie/Qwen3-8B-Instruct --swift-model-type qwen3_nothinking --swift-template-id qwen --out-root outputs/training_compare --max-steps 10 --sample-size 20 --custom-template-backend swift --use-qlora --resume-from all_swift_s42_ms10_smoke'

# 5) If smoke passes, execute full matrix
ssh -p 43821 root@connect.cqa1.seetacloud.com 'cd /root/graduationDesign && /root/miniconda3/bin/python code/ai_service/training/run_compare_batch.py --python-bin /root/miniconda3/bin/python --batch swift-vs-custom-8b-qlora-20260210T0715Z --model-ref /root/autodl-tmp/graduationDesign_runtime/models/JunHowie/Qwen3-8B-Instruct --swift-model-type qwen3_nothinking --swift-template-id qwen --out-root outputs/training_compare --smoke-steps 10 --full-steps 200 --all-seeds 42,43,44 --style-seeds 45 --writing-seeds 46 --sample-size 20 --custom-template-backend swift --use-qlora'

# 6) Aggregate
ssh -p 43821 root@connect.cqa1.seetacloud.com 'cd /root/graduationDesign && /root/miniconda3/bin/python code/ai_service/training/benchmarks/collect_metrics.py --base-root outputs/training_compare --batch swift-vs-custom-8b-qlora-20260210T0715Z'
```

