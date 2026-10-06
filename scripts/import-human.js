'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),L=require('../learning'),Replay=require('../replay');
const args={};for(let i=2;i<process.argv.length;i+=2)args[process.argv[i].slice(2)]=process.argv[i+1];
if(!args.input||!args.out)throw Error('--input and --out are required');
const records=JSON.parse(fs.readFileSync(args.input,'utf8')).records;if(!Array.isArray(records))throw Error('Missing records');
const model=L.prepareModel(JSON.parse(fs.readFileSync(args.model || path.join(__dirname,'../models/tangwu-pv.json'),'utf8')));
fs.mkdirSync(args.out,{recursive:true});const file=path.join(args.out,'games-human.jsonl');fs.writeFileSync(file,'');
let games=0,samplesCount=0,rejected=0;const seen=new Set();
for(const record of records.slice(-500)) {
  if(seen.has(record.id))continue;seen.add(record.id);
  try {
    const samples=[];let steps=0;
    const final=Replay.reconstruct(record,(g,a,actor)=>{
      const legal=L.legal(g);if(legal.length>1 || steps%4===0){
        const result=L.mcts(g,model,{simulations:Number(args.simulations || 64),proofNodes:200});
        samples.push({x:Array.from(L.observation(g,actor)),pi:result.policy,mask:legal.map(e=>e.id),actor});
      }steps++;
    });
    for(const sample of samples){sample.z=final.winner<0?0:final.winner===sample.actor?1:-1;sample.valueWeight=1;}
    const seed=1000000000+parseInt(crypto.createHash('sha256').update(record.id).digest('hex').slice(0,8),16)%1000000000;
    fs.appendFileSync(file,JSON.stringify({seed,kind:'human-reanalysis',humanId:record.id,completed:true,winner:final.winner,steps,samples})+'\n');
    games++;samplesCount+=samples.length;
  }catch(_){rejected++;}
}
if(!games)throw Error('No complete, valid human games to import');
const summary={mode:'human-reanalysis',games,completed:games,finished:games,samples:samplesCount,rejected,seed:1000000000,seedRanges:[[1000000000,1999999999]],features:L.FEATURES,actions:L.ACTION_NAMES};
fs.writeFileSync(path.join(args.out,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
