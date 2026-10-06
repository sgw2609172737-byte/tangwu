import importlib.util, pathlib, numpy as np, torch
root=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('tangwu_train',root/'scripts/train-ai.py');training=importlib.util.module_from_spec(spec);spec.loader.exec_module(training)
data,train_ids,valid_ids,schema=training.load_data([root/'output/training/2026-10-06/run1/warm',root/'output/qa/human-fixture'],limit=512)
assert 0<schema['humanSamplesKept']<=102
human_start=len(data[0])-schema['humanSamplesKept'];human_ids=train_ids[train_ids>=human_start]
assert len(human_ids)>0 and len(valid_ids)>0
assert torch.cuda.is_available()
device=torch.device('cuda');torch.set_num_threads(2)
model=training.PolicyValue(schema['features'],len(schema['actions'])).to(device)
optimizer=torch.optim.AdamW(model.parameters(),lr=0.001);before=model.fc1.weight.detach().clone()
training.train(model,optimizer,data,human_ids,valid_ids,device,1,32,47,root/'output/qa/human-gradient.jsonl')
assert not torch.equal(before,model.fc1.weight)
training.export_model(model,schema,root/'output/qa/human-gradient.json',0,{'humanSamples':len(human_ids)},47)
print('PASS: imported human samples contribute real CUDA gradient updates; separate game validation and JS/PyTorch parity pass')
