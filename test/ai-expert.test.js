'use strict';
const assert=require('node:assert/strict'),E=require('../engine'),A=require('../ai');
function combo() {
  const g=E.createGame(['A','B']);Object.assign(g,{turn:0,phase:'playing',step:'awaitAction'});
  Object.assign(g.players[0],{skill:1,energy:11,hp:20});Object.assign(g.players[1],{skill:2,energy:1,hp:80,wudi:true,jingji:true});
  g.players[1].dummy={alive:true,hp:100,castBefore:true,reserve:[100]};return g;
}
const apply=(g,a)=>a.type==='add'?E.addHand(g,a.choice):a.type==='act'?E.actSkill(g,a.skillIdx,{buffIdx:a.buffIdx}):E.passTurn(g);
let g=combo(),before=E.serializeGame(g),result=A.analyze(g,0,'expert',250);
assert.equal(E.serializeGame(g),before);assert.equal(result.provenWin,true);assert.ok(result.line.length>=7);
for(const a of result.line) assert.equal(apply(g,a).err,undefined);
assert.equal(g.winner,0);console.log('  ✓ 发现并验证七步操作的 98K 强制斩杀，穿透护盾、反弹和两只假人');
g=combo();g.banned=['jiubaK'];result=A.analyze(g,0,'expert',80);assert.equal(result.provenWin,false);
assert.ok(A.legalActions(g).some(a=>JSON.stringify(a)===JSON.stringify(result.action)));console.log('  ✓ 禁用 98K 后不伪报必胜');
g=combo();g.controller=1;result=A.analyze(g,1,'expert',60);apply(g,result.action);
assert.ok(!g.over || g.winner===1);console.log('  ✓ 控制回合按实际决策者优化');
g=combo();const start=Date.now();result=A.analyze(g,0,'expert',0);assert.ok(Date.now()-start<100);
assert.ok(result.action);assert.equal(result.provenWin,false);console.log('  ✓ 零预算保留合法动作且不启动无预算搜索');
g=combo();g.players[0].hp=1e8;assert.ok(A.evalGame(g,0)<100000);console.log('  ✓ 启发式分数不会冒充终局证明');
