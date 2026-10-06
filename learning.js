'use strict';
// Shared training environment, CPU inference and actor-aware PUCT. Uses the real game engine.
(function () {
  const browser=typeof window!=='undefined';
  const E=browser?window.__TW_engine:require('./engine');
  const A=browser?window.__TWAI:require('./ai');
  const S=browser?window.__TW_skills:require('./skills');
  const SKILL_IDS=Object.values(S.SKILLS).flat().map(s=>s.id);
  const BUFF_KEYS=['jingji','wudi','yingneng','shuangbei','huxi','qianghua','bishi','cuidu'];
  const ACTION_NAMES=['add-energy','add-skill','pass',...SKILL_IDS,...BUFF_KEYS.map(k=>'gongping:'+k)];
  const FEATURE_VERSION=1;
  const actor=g=>g.controller>=0?g.controller:g.turn;
  function clone(g) {
    return {...g,searchOnly:true,log:[],visualEvents:[],chainDigits:new Set(g.chainDigits),banned:[...g.banned],banPicks:[...g.banPicks],
      players:g.players.map(p=>({...p,dummy:{...p.dummy,reserve:[...(p.dummy.reserve || [])]},yingneng:{...p.yingneng},
        qibu:{...p.qibu},duming:{...p.duming},chaofeng:{...p.chaofeng},delayed:p.delayed.map(d=>({...d}))}))};
  }
  function apply(g,a) {
    const r=a.type==='add'?E.addHand(g,a.choice):a.type==='act'?E.actSkill(g,a.skillIdx,{buffIdx:a.buffIdx}):E.passTurn(g);
    if(r?.err) throw new Error(r.err);return g;
  }
  function actionId(g,a) {
    if(a.type==='add') return a.choice;
    if(a.type==='pass') return 2;
    const sk=S.SKILLS[g.players[g.turn].skill][a.skillIdx];
    if(sk.id==='gongping' && a.buffIdx!=null) {
      const key=S.positiveBuffs(g.players[1-g.turn])[a.buffIdx]?.key;
      if(key) return 3+SKILL_IDS.length+BUFF_KEYS.indexOf(key);
    }
    return 3+SKILL_IDS.indexOf(sk.id);
  }
  function legal(g) {return A.legalActions(g).map(a=>({a,id:actionId(g,a)}));}
  function rng(seed) {
    let state=seed>>>0;
    return ()=>{state+=0x6D2B79F5;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
  }
  function opening(seed,bans) {
    const random=rng(seed),g=E.createGame(['A','B']);g.searchOnly=true;g.turn=random()<.5?0:1;
    g.players[g.turn].hp=20;g.players[1-g.turn].hp=21;g.phase='banning';
    const picks=bans || [SKILL_IDS[Math.floor(random()*SKILL_IDS.length)],SKILL_IDS[Math.floor(random()*SKILL_IDS.length)]];
    if(picks.length===0) E.startGame(g);
    else {E.submitBan(g,0,picks[0]);E.submitBan(g,1,picks[1]);}return g;
  }
  const signedLog=(n,scale=20)=>Math.sign(n)*Math.log1p(Math.abs(n))/Math.log1p(scale);
  function observation(g,perspective=actor(g)) {
    const f=[],relative=i=>i<0?0:i===perspective?1:-1;
    for(const index of [perspective,1-perspective]) {
      const p=g.players[index],o=g.players[1-index];
      f.push(signedLog(p.hp),Math.max(-1,Math.min(3,p.hp/40)),Number(p.hp<=3),Number(p.hp<=9));
      for(let n=0;n<12;n++) f.push(Number(p.energy===n));
      for(let n=0;n<10;n++) f.push(Number(p.skill===n));
      f.push(p.energy/11);
      for(const k of ['jingji','wudi','qianghua','bishi','tanghua','cuidu','inDummyCombat','huanwuSkip']) f.push(Number(!!p[k]));
      f.push(Number(p.yingneng.active),(p.yingneng.charge || 0)/6,signedLog(p.shuangbei,4),signedLog(p.huxi,4),signedLog(p.huxi*(p.qianghua?2:1),4));
      const reserves=p.dummy.reserve || [];
      f.push(Number(p.dummy.alive),signedLog(p.dummy.hp,10),Number(p.dummy.castBefore),signedLog(reserves.length,4),signedLog(reserves.reduce((s,v)=>s+v,0),10));
      for(let n=0;n<4;n++) f.push(signedLog(reserves[n] || 0,10));
      f.push(p.qibu.stage/2,relative(p.qibu.owner),Number(p.duming.active),p.duming.turnsLeft/6,
        Number(p.dumingUsed),Number(p.dumingExtraUsed),p.freeze/2,Number(p.chaofeng.pending),signedLog(p.chaofeng.dmg,10));
      f.push(signedLog(p.delayed.length,4),signedLog(p.delayed.reduce((s,d)=>s+d.dmg,0),10));
      for(let n=0;n<4;n++) {const d=p.delayed[n];f.push(d?signedLog(d.dmg,10):0,d?relative(d.owner):0,d?Number(!!d.noBonus):0);}
      f.push(Math.min(3,Math.floor(p.cumulativeDmg/5))/3,signedLog(p.cumulativeDmg,40),signedLog(p.turnDmg,10),Number(p.dealtThisTurn),relative(p.controlledBy),p.streak/24,Number(p.jumped7));
      // Reachable digits preserve hand arithmetic even when energy is capped at eleven.
      for(let n=0;n<10;n++) f.push(Number(n===(p.skill+o.energy%10)%10 || n===(p.skill+o.skill)%10));
    }
    f.push(Number(g.turn===perspective),Number(g.controller>=0),Number(g.step==='awaitAdd'),Number(g.step==='awaitAction'),
      Math.min(4,g.chainCount)/4,g.chainDigits.size/4,g.actionsUsed/50,Number(g.pendingDumingAgain),g.noDamageTurns/24,Number(g.damagedThisTurn));
    for(const id of ['yi','san','si','ba']) f.push(Number(g.chainDigits.has(id)));
    for(const id of SKILL_IDS) f.push(Number(g.banned.includes(id)));
    return Float32Array.from(f,v=>Math.max(-8,Math.min(8,Number.isFinite(v)?v:0)));
  }
  const FEATURES=observation(opening(1)).length;
  function prepareModel(data) {
    if(data.featureVersion!==FEATURE_VERSION || data.inputSize!==FEATURES || data.actionNames.join('|')!==ACTION_NAMES.join('|')) throw new Error('Training model schema mismatch');
    const layers=data.layers.map(l=>({...l,weight:Float32Array.from(l.weight),bias:Float32Array.from(l.bias)}));
    for(const l of layers) if(!Number.isInteger(l.input) || !Number.isInteger(l.output) || l.weight.length!==l.input*l.output || l.bias.length!==l.output || !l.weight.every(Number.isFinite) || !l.bias.every(Number.isFinite)) throw new Error('Invalid model weights');
    if(layers.length!==4 || layers[0].input!==FEATURES || layers[1].input!==layers[0].output || layers[2].input!==layers[1].output || layers[3].input!==layers[1].output || layers[2].output!==ACTION_NAMES.length || layers[3].output!==1) throw new Error('Invalid model architecture');
    return {...data,layers};
  }
  function dense(x,l,relu) {
    const y=new Float32Array(l.output);
    for(let row=0;row<l.output;row++) {let v=l.bias[row],offset=row*l.input;for(let col=0;col<l.input;col++) v+=l.weight[offset+col]*x[col];y[row]=relu?Math.max(0,v):v;}
    return y;
  }
  function predict(model,x) {
    const h=dense(dense(x,model.layers[0],true),model.layers[1],true);
    return {logits:dense(h,model.layers[2],false),value:Math.tanh(dense(h,model.layers[3],false)[0])};
  }
  function softmax(logits,list) {
    const max=Math.max(...list.map(e=>logits[e.id]));const weights=list.map(e=>Math.exp(logits[e.id]-max));const total=weights.reduce((s,v)=>s+v,0);
    return weights.map(w=>w/total);
  }
  function sample(weights,random) {
    let r=random()*weights.reduce((s,w)=>s+w,0);for(let i=0;i<weights.length;i++) {r-=weights[i];if(r<=0) return i;}return weights.length-1;
  }
  function mcts(game,model,options={}) {
    if(game.over || game.phase!=='playing') return {action:null,policy:new Array(ACTION_NAMES.length).fill(0),simulations:0};
    const started=Date.now(),random=options.random || rng(options.seed || 1),budget=options.budgetMs ?? Infinity;
    const root={g:clone(game),actor:actor(game),visits:0,sum:0,edges:null};
    const simulations=options.simulations ?? 96,c=options.cpuct ?? 1.5;
    if(options.proofNodes) {
      const line=A.findForcedWin(game,actor(game),{maxNodes:options.proofNodes});
      if(line?.length) {const policy=new Array(ACTION_NAMES.length).fill(0);policy[actionId(game,line[0])]=1;return {action:line[0],policy,provenWin:true,simulations:0,evaluations:0,elapsedMs:Date.now()-started};}
    }
    let evaluations=0,completed=0;
    const expand=node=>{
      if(node.g.over) return node.g.result==='draw'?0:node.g.winner===node.actor?1:-1;
      const list=legal(node.g),prediction=model?predict(model,observation(node.g)):null;
      const priors=prediction?softmax(prediction.logits,list):list.map(()=>1/list.length);
      node.edges=list.map((entry,i)=>({...entry,prior:priors[i],child:null}));evaluations++;
      const heuristic=Math.tanh(A.evalGame(node.g,node.actor)/180);
      const blend=options.heuristicBlend ?? 0;
      return prediction?prediction.value*(1-blend)+heuristic*blend:heuristic;
    };
    expand(root);
    if(!root.edges.length) return {action:null,policy:new Array(ACTION_NAMES.length).fill(0),simulations:0};
    // Exact one-step wins always outrank network estimates.
    for(const edge of root.edges) {
      const next=apply(clone(game),edge.a);
      if(next.over && next.winner===root.actor) {const policy=new Array(ACTION_NAMES.length).fill(0);policy[edge.id]=1;return {action:edge.a,policy,provenWin:true,simulations:0,evaluations,elapsedMs:Date.now()-started};}
    }
    if(options.explore) {
      const noise=root.edges.map(()=>-Math.log(Math.max(1e-9,random()))),sum=noise.reduce((s,v)=>s+v,0);
      root.edges.forEach((e,i)=>{e.prior=.85*e.prior+.15*noise[i]/sum;});
    }
    for(let sim=0;sim<simulations && Date.now()-started<budget;sim++) {
      let node=root;const path=[node];
      while(node.edges && !node.g.over && path.length<96) {
        let edge=node.edges[0],best=-Infinity;
        for(const e of node.edges) {
          const child=e.child,n=child?.visits || 0;
          const q=n?child.sum/n*(child.actor===node.actor?1:-1):0;
          const score=q+c*e.prior*Math.sqrt(node.visits+1)/(1+n);
          if(score>best) {best=score;edge=e;}
        }
        if(!edge.child) {const g=apply(clone(node.g),edge.a);edge.child={g,actor:actor(g),visits:0,sum:0,edges:null};}
        node=edge.child;path.push(node);
      }
      const value=node.g.over?(node.g.result==='draw'?0:node.g.winner===node.actor?1:-1):expand(node);
      // Extra actions keep the sign; Yuri switches it only when the actual actor changes.
      for(const visited of path) {visited.visits++;visited.sum+=value*(visited.actor===node.actor?1:-1);}
      completed++;
    }
    const policy=new Array(ACTION_NAMES.length).fill(0);
    const counts=root.edges.map(e=>e.child?.visits || 0),total=counts.reduce((s,v)=>s+v,0);
    root.edges.forEach((e,i)=>{policy[e.id]=total?counts[i]/total:e.prior;});
    let index;
    if(options.temperature>0) index=sample(root.edges.map(e=>Math.pow(Math.max(1e-8,policy[e.id]),1/options.temperature)),random);
    else {index=0;for(let i=1;i<root.edges.length;i++) if(counts[i]>counts[index] || counts[i]===counts[index] && root.edges[i].prior>root.edges[index].prior) index=i;}
    return {action:root.edges[index].a,policy,simulations:completed,evaluations,elapsedMs:Date.now()-started,provenWin:false};
  }
  const api={FEATURE_VERSION,FEATURES,ACTION_NAMES,SKILL_IDS,BUFF_KEYS,actor,clone,apply,legal,actionId,rng,opening,observation,prepareModel,predict,mcts};
  if(typeof module!=='undefined' && module.exports) module.exports=api;
  if(browser) window.__TWLearning=api;
})();
