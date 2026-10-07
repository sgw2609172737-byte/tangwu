"""Train a small policy/value net using the authoritative JS engine, then run fresh paired games."""
import argparse, hashlib, json, pathlib, shutil, subprocess, sys, time
import numpy as np
import torch
from torch import nn

ROOT=pathlib.Path(__file__).resolve().parents[1]

def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))

def write_json(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    temporary=path.with_suffix(path.suffix+'.tmp')
    temporary.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    temporary.replace(path)

def run_node(script,*arguments):
    subprocess.run(['node',str(ROOT/'scripts'/script),*[str(a) for a in arguments]],cwd=ROOT,check=True)

class PolicyValue(nn.Module):
    def __init__(self,inputs,actions,width=128):
        super().__init__()
        self.fc1=nn.Linear(inputs,width);self.fc2=nn.Linear(width,width)
        self.policy=nn.Linear(width,actions);self.value=nn.Linear(width,1)

    def forward(self,x):
        h=torch.relu(self.fc2(torch.relu(self.fc1(x))))
        return self.policy(h),torch.tanh(self.value(h)).squeeze(-1)

def load_data(directories,limit=60000):
    summaries=[read_json(d/'summary.json') for d in directories]
    is_human=[s.get('mode')=='human-reanalysis' for s in summaries]
    human_total=sum(s['samples'] for s,h in zip(summaries,is_human) if h)
    generated_total=sum(s['samples'] for s,h in zip(summaries,is_human) if not h)
    human_keep=min(human_total,limit//5);generated_keep=min(generated_total,limit-human_keep)
    count=human_keep+generated_keep
    schema=read_json(directories[0]/'summary.json');inputs=schema['features'];actions=len(schema['actions'])
    x=np.empty((count,inputs),dtype=np.float32);pi=np.empty((count,actions),dtype=np.float32)
    mask=np.zeros((count,actions),dtype=np.bool_);z=np.empty(count,dtype=np.float32);weight=np.empty(count,dtype=np.float32)
    validation=np.empty(count,dtype=np.bool_);index=0;skip={True:human_total-human_keep,False:generated_total-generated_keep}
    for directory,human in zip(directories,is_human):
        for file in sorted(directory.glob('games-*.jsonl')):
            with file.open(encoding='utf-8') as stream:
                for line in stream:
                    game=json.loads(line)
                    for sample in game['samples']:
                        if skip[human]:skip[human]-=1;continue
                        x[index]=sample['x'];pi[index]=sample['pi'];mask[index,sample['mask']]=True
                        z[index]=sample['z'];weight[index]=sample['valueWeight'];validation[index]=game['seed']%10==0
                        index+=1
    if index!=count:raise RuntimeError('Dataset count mismatch')
    if not np.isfinite(x).all() or not np.isfinite(pi).all():raise RuntimeError('Nonfinite training data')
    if np.any((pi>0)&~mask) or not np.allclose(pi.sum(axis=1),1,atol=1e-5):raise RuntimeError('Invalid policy target/mask')
    tensors=[torch.from_numpy(a) for a in [x,pi,mask,z,weight]]
    return tensors,np.flatnonzero(~validation),np.flatnonzero(validation),{**schema,'humanSamplesKept':human_keep}

def metrics(model,data,indices,device):
    policy_loss=value_loss=correct=value_count=count=0
    model.eval()
    with torch.no_grad():
        for start in range(0,len(indices),1024):
            ids=indices[start:start+1024];x,pi,mask,z,weight=[a[ids].to(device) for a in data]
            logits,value=model(x);logits=logits.masked_fill(~mask,-1e9)
            policy_loss+=float(-(pi*torch.log_softmax(logits,dim=-1)).sum())
            value_loss+=float(((value-z).square()*weight).sum());value_count+=float(weight.sum())
            correct+=int((logits.argmax(dim=-1)==pi.argmax(dim=-1)).sum());count+=len(ids)
    return {'samples':count,'policyLoss':policy_loss/max(1,count),'policyAgreement':correct/max(1,count),'valueMSE':value_loss/max(1,value_count),'valueSamples':int(value_count)}

def train(model,optimizer,data,train_ids,valid_ids,device,epochs,batch,seed,log):
    random=np.random.default_rng(seed);history=[];best=float('inf');best_state=None;best_optimizer=None
    for epoch in range(epochs):
        model.train();order=random.permutation(train_ids);total=0
        for start in range(0,len(order),batch):
            ids=order[start:start+batch];x,pi,mask,z,weight=[a[ids].to(device) for a in data]
            logits,value=model(x);logits=logits.masked_fill(~mask,-1e9)
            policy=-(pi*torch.log_softmax(logits,dim=-1)).sum(dim=-1).mean()
            value_loss=((value-z).square()*weight).sum()/weight.sum().clamp_min(1)
            loss=policy+value_loss;optimizer.zero_grad(set_to_none=True);loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(),5);optimizer.step();total+=float(loss.detach())*len(ids)
        measured=metrics(model,data,valid_ids,device)
        row={'epoch':epoch+1,'trainingLoss':total/max(1,len(train_ids)),**measured};history.append(row)
        with log.open('a',encoding='utf-8') as f:f.write(json.dumps(row)+'\n')
        print(json.dumps({'phase':'train',**row}),flush=True)
        score=measured['policyLoss']+measured['valueMSE']
        if score<best:
            best=score;best_state={k:v.detach().cpu().clone() for k,v in model.state_dict().items()}
            import copy
            best_optimizer=copy.deepcopy(optimizer.state_dict())
    if best_state:
        model.load_state_dict(best_state);optimizer.load_state_dict(best_optimizer)
    return history

def export_model(model,schema,path,generation,training,seed):
    layers=[]
    for layer in [model.fc1,model.fc2,model.policy,model.value]:
        layers.append({'input':layer.in_features,'output':layer.out_features,'weight':layer.weight.detach().cpu().flatten().tolist(),'bias':layer.bias.detach().cpu().tolist()})
    rules_hash=hashlib.sha256((ROOT/'engine.js').read_bytes()+(ROOT/'skills.js').read_bytes()).hexdigest()
    payload={'format':'tangwu-policy-value-v1','featureVersion':1,'inputSize':schema['features'],'actionNames':schema['actions'],
             'generation':generation,'approved':False,'rulesSha256':rules_hash,'seed':seed,'training':training,'layers':layers}
    write_json(path,payload)
    # Cross-runtime parity: output must survive CPU PyTorch -> JSON -> zero-dependency JS inference.
    random=np.random.default_rng(seed);inputs=torch.from_numpy(random.uniform(-1,1,(8,schema['features'])).astype(np.float32))
    original_device=next(model.parameters()).device;model.cpu();model.eval()
    with torch.no_grad():logits,value=model(inputs)
    write_json(path.with_suffix('.parity.json'),{'x':inputs.tolist(),'logits':logits.tolist(),'value':value.tolist()})
    model.to(original_device)
    subprocess.run(['node',str(ROOT/'test'/'model-parity.cjs'),str(path)],cwd=ROOT,check=True)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--out',default='output/training/2026-10-06/run1');parser.add_argument('--warm-games',type=int,default=192)
    parser.add_argument('--rounds',type=int,default=3);parser.add_argument('--selfplay-games',type=int,default=128)
    parser.add_argument('--workers',type=int,default=2);parser.add_argument('--teacher-nodes',type=int,default=1200)
    parser.add_argument('--simulations',type=int,default=64);parser.add_argument('--epochs',type=int,default=18)
    parser.add_argument('--batch',type=int,default=512);parser.add_argument('--width',type=int,default=128)
    parser.add_argument('--eval-pairs',type=int,default=8);parser.add_argument('--eval-budget',type=int,default=50)
    parser.add_argument('--seed',type=int,default=12000);parser.add_argument('--resume',action='store_true')
    parser.add_argument('--human-link',default='data/training-link.json');parser.add_argument('--human-data',default='data/human-training');parser.add_argument('--human-local',default='')
    args=parser.parse_args();out=(ROOT/args.out).resolve();out.mkdir(parents=True,exist_ok=True)
    if (out/'report.json').exists() and not args.resume:raise RuntimeError('Run exists; choose a new --out or --resume')
    if not torch.cuda.is_available():raise RuntimeError('CUDA GPU is required for this run; no silent CPU fallback')
    link=(ROOT/args.human_link).resolve()
    sync_args=['--out',(ROOT/args.human_data).resolve()]
    if link.exists():sync_args+=['--link',link]
    if args.human_local:sync_args+=['--local',(ROOT/args.human_local).resolve()]
    run_node('sync-human.js',*sync_args)
    human=(ROOT/args.human_data).resolve();human_snapshot=None
    if (human/'summary.json').exists() and read_json(human/'summary.json')['games']>0:
        digest=hashlib.sha256((human/'games-human.jsonl').read_bytes()).hexdigest()[:16]
        human_snapshot=out/('human-'+digest);human_snapshot.mkdir(exist_ok=True)
        for name in ['summary.json','games-human.jsonl']:shutil.copy2(human/name,human_snapshot/name)
    torch.manual_seed(args.seed);torch.set_num_threads(2);device=torch.device('cuda')
    report=read_json(out/'report.json') if args.resume and (out/'report.json').exists() else {'phase':'starting','iterations':[], 'config':vars(args),'device':torch.cuda.get_device_name(0),'torch':torch.__version__,'cuda':torch.version.cuda,'startedUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}
    if args.resume:
        report.setdefault('resumes',[]).append({'config':vars(args),'atUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())})
    def status(phase):report['phase']=phase;write_json(out/'report.json',report)
    status('warm collection')
    warm=out/'warm'
    if not (warm/'summary.json').exists() or read_json(warm/'summary.json')['finished']!=args.warm_games:
        run_node('collect-ai.js','--games',args.warm_games,'--nodes',args.teacher_nodes,'--workers',args.workers,'--out',warm,'--seed',args.seed)
    schema=read_json(warm/'summary.json');model=PolicyValue(schema['features'],len(schema['actions']),args.width).to(device)
    optimizer=torch.optim.AdamW(model.parameters(),lr=8e-4,weight_decay=1e-4)
    start=0
    if args.resume and report['iterations']:
        last=report['iterations'][-1]['generation'];checkpoint=torch.load(out/f'generation-{last}.pt',map_location=device,weights_only=True)
        model.load_state_dict(checkpoint['model']);optimizer.load_state_dict(checkpoint['optimizer']);start=last+1
    for generation in range(start,args.rounds+1):
        if generation>0:
            status(f'selfplay generation {generation}');directory=out/f'selfplay-{generation}'
            if not (directory/'summary.json').exists() or read_json(directory/'summary.json')['finished']!=args.selfplay_games:
                run_node('collect-ai.js','--mode','selfplay','--model',out/f'generation-{generation-1}.json','--games',args.selfplay_games,'--workers',args.workers,'--simulations',args.simulations,'--nodes',args.teacher_nodes,'--out',directory,'--seed',args.seed+generation*10000)
        directories=[warm]+[out/f'selfplay-{n}' for n in range(1,generation+1)]
        if human_snapshot:directories.append(human_snapshot)
        data,train_ids,valid_ids,schema=load_data(directories)
        status(f'train generation {generation}');torch.cuda.reset_peak_memory_stats()
        history=train(model,optimizer,data,train_ids,valid_ids,device,args.epochs,args.batch,args.seed+generation,out/f'learner-{generation}.jsonl')
        training={'games':sum(read_json(d/'summary.json')['games'] for d in directories),'completedGames':sum(read_json(d/'summary.json')['completed'] for d in directories),
                  'seedRanges':[r for d in directories for r in read_json(d/'summary.json').get('seedRanges',[[read_json(d/'summary.json')['seed'],read_json(d/'summary.json')['seed']+read_json(d/'summary.json')['games']-1]])],
                  'humanGames':read_json(human_snapshot/'summary.json')['games'] if human_snapshot else 0,'humanSamples':schema['humanSamplesKept'],
                  'samples':len(train_ids)+len(valid_ids),'trainSamples':len(train_ids),'validationSamples':len(valid_ids),'bestValidation':min(history,key=lambda h:h['policyLoss']+h['valueMSE']),
                  'cudaPeakAllocatedMB':torch.cuda.max_memory_allocated()/1048576}
        artifact=out/f'generation-{generation}.json';export_model(model,schema,artifact,generation,training,args.seed)
        torch.save({'model':model.state_dict(),'optimizer':optimizer.state_dict(),'generation':generation},out/f'generation-{generation}.pt')
        del data
        status(f'evaluate generation {generation}')
        eval_file=out/f'evaluation-{generation}.json'
        run_node('evaluate-model.js','--model',artifact,'--out',eval_file,'--pairs',args.eval_pairs,'--budget',args.eval_budget,'--workers',args.workers,'--seed',800000+generation*1000)
        evaluation=read_json(eval_file)
        report['iterations'].append({'generation':generation,'model':str(artifact),'training':training,'evaluation':{k:v for k,v in evaluation.items() if k!='games'}})
        write_json(out/'report.json',report)
    best=max(report['iterations'],key=lambda r:r['evaluation']['score'])
    best_model=read_json(pathlib.Path(best['model']));best_model['selectionEvaluation']=best['evaluation'];write_json(out/'candidate.json',best_model)
    report['candidate']=str(out/'candidate.json');report['bestGeneration']=best['generation'];report['finishedUTC']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime());status('trained; candidate requires independent promotion evaluation')
    print(json.dumps({'phase':'trained','candidate':report['candidate'],'bestGeneration':best['generation']}),flush=True)

if __name__=='__main__':
    try:main()
    except Exception as error:print('TRAINING FAILED: '+str(error),file=sys.stderr,flush=True);raise
