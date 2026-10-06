'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{Worker,isMainThread,workerData,parentPort}=require('node:worker_threads');
const L=require('../learning'),A=require('../ai');
function parse(){const o={};for(let i=2;i<process.argv.length;i+=2)o[process.argv[i].slice(2)]=process.argv[i+1];return o;}
const fixtures=[[],['jiubaK','youli'],['duming','jijiu'],['shuangbei','huxi'],['yuandu','bing'],['jiubaK','duming']];
function choose(g,model,budget,blend) {
  const started=Date.now(),line=A.findForcedWin(g,L.actor(g),Math.min(250,budget*.2));
  if(line?.length) return line[0];
  return L.mcts(g,model,{budgetMs:Math.max(0,budget-(Date.now()-started)),simulations:10000,heuristicBlend:blend}).action;
}
function play(pair,seat,options,model) {
  const seed=Number(options.seed || 800000)+pair;
  const bans=pair<fixtures.length?fixtures[pair]:undefined,g=L.opening(seed,bans);
  const budget=Number(options.budget || 40),opponent=options.opponent || 'expert',cap=Number(options.steps || 800);
  let steps=0;const started=Date.now();
  while(!g.over && steps++<cap) {
    const actor=L.actor(g);
    const action=actor===seat?choose(g,model,budget,Number(options.blend || 0)):opponent==='expert'?A.analyze(g,actor,'expert',budget).action:A.chooseAction(g,actor,opponent,budget);
    if(!action) throw new Error('No action in active match');L.apply(g,action);
  }
  return {pair,seed,seat,first:L.opening(seed,bans).turn,banned:g.banned,opponent,budgetMs:budget,steps,
    outcome:!g.over?'unfinished':g.result==='draw'?'draw':g.winner===seat?'win':'loss',elapsedMs:Date.now()-started};
}
if(!isMainThread) {
  const {jobs,options}=workerData,model=L.prepareModel(JSON.parse(fs.readFileSync(options.model,'utf8')));
  for(const pair of jobs) for(const seat of [0,1]) parentPort.postMessage(play(pair,seat,options,model));
} else {
  const options=parse();if(!options.model || !options.out) throw new Error('--model and --out are required');
  const pairs=Number(options.pairs || 8),workers=Math.max(1,Math.min(Number(options.workers || 2),pairs));
  const report={model:options.model,modelSha256:crypto.createHash('sha256').update(fs.readFileSync(options.model)).digest('hex'),
    baseline:'search-expert',seed:Number(options.seed || 800000),budgetMs:Number(options.budget || 40),opponent:options.opponent || 'expert',blend:Number(options.blend || 0),pairs,wins:0,losses:0,draws:0,unfinished:0,games:[]};
  const write=()=>fs.writeFileSync(options.out,JSON.stringify(report,null,2));fs.mkdirSync(path.dirname(options.out),{recursive:true});write();
  Promise.all(Array.from({length:workers},(_,i)=>new Promise((resolve,reject)=>{
    const worker=new Worker(__filename,{workerData:{jobs:Array.from({length:pairs},(_,n)=>n).filter(n=>n%workers===i),options}});
    worker.on('message',game=>{report.games.push(game);report[{win:'wins',loss:'losses',draw:'draws',unfinished:'unfinished'}[game.outcome]]++;write();console.log(JSON.stringify(game));});
    worker.on('error',reject);worker.on('exit',code=>code?reject(new Error('Evaluation exit '+code)):resolve());
  }))).then(()=>{report.score=(report.wins+report.draws*.5)/(2*pairs);write();console.log(JSON.stringify({phase:'evaluated',...report,games:report.games.length}));})
    .catch(e=>{console.error(e);process.exitCode=1;});
}
module.exports={choose};
