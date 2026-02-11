import sys
import os
import json
import torch
import random
from transformers import AutoTokenizer

# Need to import swift to get template
from swift.llm import get_model_tokenizer, get_template, TemplateType
from swift.utils import get_logger

# Import custom normalization from train_lora.py (assuming it's in parent dir)
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from train_lora import normalize_messages

def inspect_data(data_path, model_path_or_name, sample_size=50):
    print(f"Inspecting dataset: {data_path}")
    print(f"Model: {model_path_or_name}")
    
    # 1. Load Data
    with open(data_path, 'r') as f:
        all_lines = [json.loads(line) for line in f if line.strip()]
    
    random.seed(42)
    samples = random.sample(all_lines, min(sample_size, len(all_lines)))
    
    # 2. Setup Custom (train_lora.py logic)
    tokenizer = AutoTokenizer.from_pretrained(model_path_or_name, trust_remote_code=True)
    
    # 3. Setup Swift
    # Swift's get_model_tokenizer might load the model which is slow.
    # We just need the tokenizer and template.
    # Check if we can get just tokenizer.
    _, swift_tokenizer = get_model_tokenizer(model_path_or_name, load_model=False)
    # Get standard template for Qwen2.5
    # Warning: model_type string might differ from path. 
    # For now assuming 'qwen2.5-7b-instruct' map via swift.
    # If model_path_or_name is a path, swift might auto-detect.
    template = get_template(TemplateType.qwen2_5, swift_tokenizer)
    # CRITICAL: Set mode to 'train' to generate labels and full sequence
    template.mode = 'train'
    
    results = []
    
    for i, sample in enumerate(samples):
        # --- Custom Path ---
        norm_msgs = normalize_messages(sample['messages'])
        # train_lora uses tokenizer.apply_chat_template
        custom_input_ids = tokenizer.apply_chat_template(
            norm_msgs, 
            tokenize=True, 
            add_generation_prompt=False
        )
        
        # --- Swift Path ---
        # Swift template.encode accepts a sample dict with 'messages' or 'conversation'
        # It returns (input_ids, labels) tuple usually.
        # We need to adapt the sample to what template.encode expects.
        # Swift expects {'query': ..., 'response': ...} or 'messages' depending on dataset type.
        # But 'template.encode' is lower level.
        # Let's try to simulate what swift sft does. 
        # Swift 2.x template.encode signature: (example, **kwargs)
        # It's complex to replicate exactly without using Swift's dataset piepline.
        # Simplified check: Just check the template output for the same messages.
        
        # Swift's template.encode modifies the example in-place or returns result
        # We will use the `template.encode(sample)` if possible.
        # Actually swift templates work on a specific row format. 
        # Let's construct a standard messages list and see how swift formats it.
        
        # In newer swift, `template.encode` takes `example` dict.
        # It likely returns just the result dict or a wrapper.
        # Use normalized messages to ensure roles are 'user'/'assistant'
        swift_res_raw = template.encode({'messages': norm_msgs})
        
        # Check type
        if isinstance(swift_res_raw, tuple):
             swift_res = swift_res_raw[0]
        else:
             swift_res = swift_res_raw
             
        # swift_res should be a dict with input_ids, labels, etc.
        swift_input_ids = swift_res['input_ids']
        
        # --- Comparison ---
        # 1. Length
        len_custom = len(custom_input_ids)
        len_swift = len(swift_input_ids)
        
        # 2. Content equality
        ids_match = (custom_input_ids == swift_input_ids)
        
        res_row = {
            "id": i,
            "len_custom": len_custom,
            "len_swift": len_swift,
            "match": ids_match,
            # Decode for visual check (first 100 chars)
            "txt_custom": tokenizer.decode(custom_input_ids)[:100].replace('\n', '\\n'),
            "txt_swift": swift_tokenizer.decode(swift_input_ids)[:100].replace('\n', '\\n')
        }
        results.append(res_row)

    # Print Report
    print(f"\n{'ID':<5} {'CustomLen':<10} {'SwiftLen':<10} {'Match':<8} {'ContentHead'}")
    print("-" * 60)
    mismatch_count = 0
    for r in results:
        print(f"{r['id']:<5} {r['len_custom']:<10} {r['len_swift']:<10} {str(r['match']):<8} {r['txt_custom']}")
        if not r['match']:
            mismatch_count += 1
            if mismatch_count == 1:
                print(f"   [INPUT MSGS]: {json.dumps(norm_msgs, ensure_ascii=False)}")
            print(f"   [SWIFT TEXT]: {r['txt_swift']}")
            print("-" * 30)
            
    print("-" * 60)
    if mismatch_count == 0:
        print("SUCCESS: All sampled data processed identically.")
    else:
        print(f"WARNING: {mismatch_count}/{len(samples)} samples differed in tokenization.")
        print("This may be due to different system prompt injection or special token handling.")

if __name__ == "__main__":
    # Ensure paths are relative to this script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(script_dir)))) # code/ai_service/training/benchmarks -> code/ai_service/training -> code/ai_service -> code -> root
    
    # Actually just go up 3 levels from benchmarks:
    # benchmarks -> training -> ai_service -> code -> graduationDesign (root)
    # Wait, code/ai_service/training/benchmarks is 4 levels deep from code?
    # code/ai_service/training/benchmarks
    # ../../../.. is code? No.
    # root/code/ai_service/training/benchmarks
    # root/data/training/processed/all_sft.jsonl
    
    # Better: use relative path from script
    # ../../../../../data ? No.
    # script: code/ai_service/training/benchmarks
    # data: data/training/processed
    # relative: ../../../../data/training/processed/all_sft.jsonl
    
    data_rel = "../../../../data/training/processed/all_sft.jsonl"
    data_abs = os.path.abspath(os.path.join(script_dir, data_rel))
    
    MODEL = "Qwen/Qwen2.5-7B-Instruct" 
    inspect_data(data_abs, MODEL)
