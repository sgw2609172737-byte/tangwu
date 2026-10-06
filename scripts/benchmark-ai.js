'use strict';
// Paired openings, both seats, equal per-action time, old version from Git.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),Module=require('node:module');
const E=require('../engine'),AI=require('../ai');
const root=path.resolve(__dirname,'..');
const ref=process.env.AI_BASELINE || '8974dd9';
const source=execFileSync('git',['show',`${ref}:ai.js`],{cwd:root,encoding:'utf8'});
const old=new Module(path.join(root,'baseline-ai.js'));old.filename=path.join(root,'baseline-ai.js');old.paths=module.paths;old._compile(source,old.filename);
const baseline=old.exports;
const pairs=Number(process.env.AI_PAIRS || 6),budget=Number(process.env.AI_BUDGET || 80),maxSteps=800;
const bans=[[],['jiubaK','youli'],['duming','jijiu'],['shuangbei','huxi'],['yuandu','bing'],['jiubaK','duming']];
const report={baseline:ref,budgetMs:budget,pairs,wins:0,losses:0,draws:0,unfinished:0,games:[]};
for(let pair=0;pair<pairs;pair++) {
  const opening=E.createGame(['A','B']);opening.turn=pair%2;opening.players[opening.turn].hp=20;opening.players[1-opening.turn].hp=21;
  opening.banned=bans[pair%bans.length];E.startGame(opening);
  for(const seat of [0,1]) {
    const g=E.deserializeGame(E.serializeGame(opening));let steps=0,elapsed=0;
    while(!g.over && steps++<maxSteps) {
      const actor=g.controller>=0?g.controller:g.turn,t=Date.now();
      const a=actor===seat?AI.chooseAction(g,actor,'expert',budget):baseline.chooseAction(g,actor,'hard',budget);
      elapsed+=Date.now()-t;if(!a) throw new Error('No legal move');
      const r=a.type==='add'?E.addHand(g,a.choice):a.type==='act'?E.actSkill(g,a.skillIdx,{buffIdx:a.buffIdx}):E.passTurn(g);
      if(r?.err) throw new Error(r.err);
    }
    const outcome=!g.over?'unfinished':g.result==='draw'?'draws':g.winner===seat?'wins':'losses';report[outcome]++;
    const game={pair,seat,first:opening.turn,banned:opening.banned,outcome,steps,elapsedMs:elapsed};report.games.push(game);
    console.log(JSON.stringify(game));
  }
}
const out=path.join(root,'output','qa');fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,`ai-benchmark-${budget}ms.json`),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
