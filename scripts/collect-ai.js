'use strict';
const fs=require('node:fs'),path=require('node:path'),{Worker,isMainThread,workerData,parentPort}=require('node:worker_threads');
const L=require('../learning'),A=require('../ai');
function parse() {const o={};for(let i=2;i<process.argv.length;i+=2)o[process.argv[i].slice(2)]=process.argv[i+1];return o;}
function one(job,options,model) {
  const seed=Number(options.seed || 1000)+job,random=L.rng(seed^0xBADC0FFE),g=L.opening(seed),samples=[];
  const kind=options.mode || 'teacher',teacherNodes=Number(options.nodes || 1000),sims=Number(options.simulations || 64),cap=Number(options.steps || 600);
  const league=job%5===0 && kind==='selfplay';let steps=0;
  while(!g.over && steps++<cap) {
    const actor=L.actor(g),legal=L.legal(g);let action,policy=new Array(L.ACTION_NAMES.length).fill(0);
    if(kind==='teacher' || league && actor===job%2) {
      const difficulty=job%4===0 && actor===job%2?'hard':'expert';
      action=A.analyze(g,actor,difficulty,{maxNodes:teacherNodes}).action;
      // Small exploration creates recovery positions rather than only one scripted opening.
      if(random()<.04) action=legal[Math.floor(random()*legal.length)].a;
      policy[L.actionId(g,action)]=1;
    } else {
      const result=L.mcts(g,model,{simulations:sims,proofNodes:300,random,explore:true,temperature:steps<35?.8:.25});action=result.action;policy=result.policy;
    }
    if(legal.length>1 || steps%4===0) samples.push({x:Array.from(L.observation(g,actor)),pi:policy,mask:legal.map(e=>e.id),actor});
    L.apply(g,action);
  }
  for(const sample of samples) {sample.z=g.over?(g.result==='draw'?0:g.winner===sample.actor?1:-1):0;sample.valueWeight=Number(g.over);}
  return {seed,kind,completed:g.over,winner:g.over?g.winner:null,steps,samples};
}
if(!isMainThread) {
  const {jobs,options}=workerData,model=options.model?L.prepareModel(JSON.parse(fs.readFileSync(options.model,'utf8'))):null;
  const file=path.join(options.out,`games-${workerData.index}.jsonl`);fs.writeFileSync(file,'');
  for(const job of jobs) {const game=one(job,options,model);fs.appendFileSync(file,JSON.stringify(game)+'\n');parentPort.postMessage({game:job,samples:game.samples.length,completed:game.completed,steps:game.steps});}
} else {
  const options=parse();if(!options.out) throw new Error('--out is required');fs.mkdirSync(options.out,{recursive:true});
  const games=Number(options.games || 192),workers=Math.max(1,Math.min(Number(options.workers || 2),games));
  const summary={mode:options.mode || 'teacher',games,workers,samples:0,completed:0,finished:0,started:new Date().toISOString(),seed:Number(options.seed || 1000),features:L.FEATURES,actions:L.ACTION_NAMES};
  const write=()=>fs.writeFileSync(path.join(options.out,'summary.json'),JSON.stringify(summary,null,2));write();
  Promise.all(Array.from({length:workers},(_,index)=>new Promise((resolve,reject)=>{
    const jobs=Array.from({length:games},(_,i)=>i).filter(i=>i%workers===index);
    const worker=new Worker(__filename,{workerData:{index,jobs,options}});
    worker.on('message',m=>{summary.finished++;summary.samples+=m.samples;summary.completed+=Number(m.completed);write();
      if(summary.finished%8===0 || summary.finished===games) console.log(JSON.stringify({phase:'collect',finished:summary.finished,games,samples:summary.samples,completed:summary.completed}));});
    worker.on('error',reject);worker.on('exit',code=>code?reject(new Error('Collector exit '+code)):resolve());
  }))).then(()=>{summary.ended=new Date().toISOString();write();console.log(JSON.stringify({phase:'collected',finished:summary.finished,games,samples:summary.samples,completed:summary.completed}));})
    .catch(e=>{console.error(e);process.exitCode=1;});
}
