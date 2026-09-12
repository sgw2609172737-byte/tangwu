'use strict';
const assert = require('node:assert/strict');
const E = require('../engine');
const AI = require('../ai');
function game(digit=1) {
  const g=E.createGame(['同名','同名']);g.phase='playing';g.turn=0;g.step='awaitAction';
  g.players[0].skill=digit;g.players[0].energy=11;g.players[0].hp=30;g.players[1].hp=30;
  return g;
}
const tests={
  '非法动作不产生施放事件'() { const g=game();g.banned=['quan'];assert.ok(E.actSkill(g,1).err);assert.equal(g.visualSeq,0); },
  '施放事件使用技能ID和玩家序号，不受同名影响'() { const g=game();E.actSkill(g,1);assert.deepEqual(g.visualEvents[0],{kind:'cast',source:0,skillId:'quan',combo:false,seq:1}); },
  '控制回合的来源是实际出招身体'() { const g=game();g.controller=1;E.actSkill(g,1);assert.equal(g.visualEvents[0].source,0); },
  '护盾被击破的事件紧跟施放事件'() { const g=game();g.players[1].wudi=true;E.actSkill(g,1);assert.equal(g.visualSeq,2);assert.deepEqual(g.visualEvents[1],{kind:'shield-break',source:1,skillId:'wudi',seq:2});assert.equal(g.players[1].hp,32); },
  '事件队列有界且不受400条日志截断影响'() { const g=game();g.log=Array(400).fill('old');for(let i=0;i<35;i++){g.turn=0;g.step='awaitAction';g.players[0].streak=0;g.noDamageTurns=0;E.actSkill(g,0);}assert.equal(g.visualSeq,35);assert.equal(g.visualEvents.length,24);assert.equal(g.visualEvents[0].seq,12); },
  '序列化与公共状态保留事件且不会共享可变数组'() { const g=game();E.actSkill(g,1);const c=E.deserializeGame(E.serializeGame(g));assert.deepEqual(c.visualEvents,g.visualEvents);const pub=E.publicState(g,0);pub.visualEvents[0].source=1;assert.equal(g.visualEvents[0].source,0); },
  'AI搜索不会把模拟事件写入真实对局'() { const g=game(4);const before=E.serializeGame(g);AI.chooseAction(g,0,'hard',50);assert.equal(E.serializeGame(g),before); },
  '98K斩杀事件在对局结束时仍带连携标志'() { const g=game(6);g.chainCount=3;g.chainDigits=new Set(['yi','san']);E.actSkill(g,1);assert.ok(g.over);assert.equal(g.visualEvents[0].combo,true);assert.equal(E.publicState(g,0).visualEvents[0].skillId,'jiubaK'); }
};
for(const [name,test] of Object.entries(tests)){test();console.log('  ✓ '+name);}
console.log(`通过 ${Object.keys(tests).length} 项视觉事件测试`);
