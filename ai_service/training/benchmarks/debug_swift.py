from swift.llm import get_model_tokenizer, get_template, TemplateType
import torch

model_path = "Qwen/Qwen2.5-7B-Instruct"
_, tokenizer = get_model_tokenizer(model_path, load_model=False)
template = get_template(TemplateType.qwen2_5, tokenizer)

# Enable training mode
# In Swift, template.mode controls this. 
# It seems 'train' is the keyword. Or maybe just setting loss_scale.
# Let's inspect available attributes if possible, or just try setting them.
try:
    template.mode = 'train'
except:
    pass
    
# Swift templates use `loss_scale` method. Do not overwrite it.
# Just setting mode='train' should be enough.


print(f"Template mode: {template.mode if hasattr(template, 'mode') else 'unknown'}")

print("\n--- Test 1: Messages with Train Mode ---")
messages = [
    {'role': 'system', 'content': 'System'},
    {'role': 'user', 'content': 'User'},
    {'role': 'assistant', 'content': 'Assistant'}
]
res = template.encode({'messages': messages})
if isinstance(res, tuple): res = res[0]

input_ids = res['input_ids']
labels = res.get('labels')

print(f"Decoded Input: {tokenizer.decode(input_ids)}")
if labels:
    # Decode labels where not -100
    valid_labels = [l if l != -100 else tokenizer.pad_token_id for l in labels]
    print(f"Decoded Labels: {tokenizer.decode(valid_labels)}")
else:
    print("Labels: None")
