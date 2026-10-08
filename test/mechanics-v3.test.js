'use strict';
const assert=require('node:assert/strict');
const E=require('../engine'),S=require('../skills'),AI=require('../ai'),R=require('../replay');
let passed=0;
function test(name,fn){fn();passed++;console.log('  ✓ '+name);}
function game(version=3){const g=E.createGame(['A','B']);g.rulesVersion=version;g.phase='playing';g.turn=0;g.step='awaitAction';g.players.forEach(p=>{p.hp=30;p.energy=11;});return g;}
function prepare(g,who,digit){g.turn=who;g.controller=-1;g.step='awaitAction';g.players[who].skill=digit;g.players[who].energy=11;}
function cast(g,who,digit,id){prepare(g,who,digit);const r=E.actSkill(g,S.SKILLS[digit].findIndex(s=>s.id===id));assert.equal(r.ok,true,r.err);}
function currentCast(g,id){const r=E.actSkill(g,S.SKILLS[g.players[g.turn].skill].findIndex(s=>s.id===id));assert.equal(r.ok,true,r.err);}

for(const [digit,list] of Object.entries(S.SKILLS))for(const sk of list.filter(s=>s.isAttack)){
 test(`${sk.name}被无敌抵挡：无伤害统计、无附毒/灼烧/扣费/清除假人`,()=>{
  const g=game(),p=g.players[0],o=g.players[1];p.cuidu=true;p.yingneng={active:true,charge:3};
  o.energy=6;o.wudi=true;o.jingji=true;o.dummy={alive:true,hp:2,castBefore:true,reserve:[3,4]};
  cast(g,0,Number(digit),sk.id);
  assert.equal(o.hp,32);assert.equal(o.wudi,false);assert.equal(o.jingji,true);
  assert.equal(o.energy,7);assert.equal(o.dummy.alive,true);assert.deepEqual(o.dummy.reserve,[3,4]);assert.equal(o.dummy.hp,2);
  assert.deepEqual(o.delayed,[]);assert.equal(p.cumulativeDmg,0);assert.equal(p.turnDmg,0);assert.equal(p.yingneng.charge,0);assert.equal(g.over,false);
 });
}
for(const [name,setup] of [
 ['灼烧',p=>p.delayed=[{owner:1,dmg:2,desc:'小烈焰'}]],
 ['淬毒',p=>p.delayed=[{owner:1,dmg:1,desc:'淬毒'}]],
 ['七步3伤',p=>p.qibu={stage:1,owner:1}],
 ['七步2伤',p=>p.qibu={stage:2,owner:1}]
])test(`${name}正常触发无敌，既不触发荆棘也不耗假人`,()=>{
 const g=game(),p=g.players[0];p.hp=1;p.wudi=true;p.jingji=true;p.dummy={alive:true,hp:2,castBefore:true,reserve:[3]};setup(p);
 E.passTurn(g);assert.equal(p.hp,3);assert.equal(p.wudi,false);assert.equal(p.jingji,true);assert.equal(p.dummy.alive,true);assert.deepEqual(p.dummy.reserve,[3]);assert.equal(g.players[1].cumulativeDmg,0);assert.ok(!g.over);
 assert.ok(g.log.some(s=>s.includes('无敌抵挡了')));
});
test('先挂小烈焰与淬毒，再开无敌：只挡灼烧，后续毒伤照常',()=>{
 const g=game();g.players[0].cuidu=true;cast(g,0,3,'xiaolieyan');const p=g.players[1];p.jingji=true;
 assert.deepEqual(p.delayed.map(d=>d.desc),['小烈焰','淬毒']);cast(g,1,5,'wudi');
 assert.equal(p.hp,28);assert.equal(p.wudi,false);assert.equal(p.delayed.length,0);assert.equal(p.jingji,false);assert.equal(g.players[0].hp,29);assert.equal(g.players[0].cumulativeDmg,4);
});
test('挡住七步不会解除它，下一个自身回合仍受到毒伤',()=>{
 const g=game(),p=g.players[0];p.qibu={stage:1,owner:1};cast(g,0,5,'wudi');assert.equal(p.hp,32);assert.equal(p.qibu.stage,1);
 prepare(g,0,1);E.passTurn(g);assert.equal(p.hp,29);assert.equal(p.qibu.stage,1);
});
test('净化清除全部灼烧/淬毒，七步两次解除，并保留未触发无敌',()=>{
 const g=game(),p=g.players[0];p.wudi=true;p.qibu={stage:1,owner:1};p.delayed=[{owner:1,dmg:2,desc:'小烈焰'},{owner:1,dmg:1,desc:'淬毒'}];
 cast(g,0,0,'jinghua');assert.equal(p.hp,33);assert.equal(p.qibu.stage,2);assert.deepEqual(p.delayed,[]);assert.equal(p.wudi,false);
 cast(g,0,5,'wudi');cast(g,0,0,'jinghua');assert.equal(p.qibu.stage,0);assert.equal(p.hp,36);assert.equal(p.wudi,false);
 p.qibu.stage=0;cast(g,0,5,'wudi');assert.equal(p.wudi,true);cast(g,0,0,'jinghua');assert.equal(p.wudi,true);
});
test('冰封自动结束的回合也正常触发无敌挡毒',()=>{
 const g=game(),p=g.players[1];p.freeze=2;p.wudi=true;p.qibu={stage:1,owner:0};p.delayed=[{owner:0,dmg:2,desc:'小烈焰'}];
 E.passTurn(g);assert.equal(p.hp,29);assert.equal(p.wudi,false);assert.equal(p.freeze,1);assert.equal(g.turn,0);
});
test('持续伤害与反弹不吃赌命/盈能加成',()=>{
 const g=game(),p=g.players[0],o=g.players[1];o.duming={active:true,turnsLeft:9};o.yingneng={active:true,charge:6};p.jingji=true;p.delayed=[{owner:1,dmg:2,desc:'小烈焰'}];
 E.passTurn(g);assert.equal(p.hp,28);assert.equal(o.hp,29);assert.equal(o.yingneng.charge,6);
});
test('元毒九泉完成回血后再判胜负，反弹未致最终死亡时继续',()=>{
 const g=game(),p=g.players[0],o=g.players[1];p.hp=4;o.jingji=true;cast(g,0,9,'yuandu');assert.equal(p.hp,2);assert.equal(o.hp,20);assert.equal(g.over,false);assert.equal(g.resolvingSkill,undefined);assert.equal(g.resolvingDamage,undefined);
});
test('元毒反弹后回血仍不足，按最终双方血量判负/平局',()=>{
 for(const hp of [30,1]){const g=game();g.players[0].hp=1;g.players[1].hp=hp;g.players[1].jingji=true;cast(g,0,9,'yuandu');assert.equal(g.over,true);assert.equal(g.players[0].hp,-1);assert.equal(g.winner,hp===1?-1:1);}
});
test('识破清除假人在伤害前，护盾能抵挡整个清除效果',()=>{
 const g=game(),o=g.players[1];o.hp=1;o.dummy={alive:true,hp:8,castBefore:true,reserve:[8]};cast(g,0,9,'shipo');assert.equal(g.winner,0);assert.equal(o.dummy.alive,false);
});
for(const [id,digit,other] of [['yi',1,6],['san',3,4],['si',4,3],['ba',8,9]])test(`${id}数字连携到7才触发两层公平正义`,()=>{
 const g=game(),o=g.players[1];o.huxi=3;o.skill=other;cast(g,0,digit,id);assert.equal(g.chainCount,1);assert.equal(g.step,'awaitAdd');assert.equal(E.addHand(g,1).ok,true);assert.equal(g.players[0].skill,7);assert.equal(g.players[0].jumped7,true);currentCast(g,'gongping');assert.equal(o.huxi,1);
});
test('普通首次相加到7只去一层',()=>{
 const g=game(),o=g.players[1];o.huxi=3;o.skill=6;g.players[0].skill=1;g.step='awaitAdd';E.addHand(g,1);assert.equal(g.players[0].skill,7);assert.equal(g.players[0].jumped7,false);currentCast(g,'gongping');assert.equal(o.huxi,2);
});
test('赌命再次行动到7不等于数字连携，只去一层',()=>{
 const g=game(),o=g.players[1];o.huxi=3;o.skill=9;cast(g,0,8,'duming');E.addHand(g,1);assert.equal(g.players[0].skill,7);currentCast(g,'gongping');assert.equal(o.huxi,2);
});
test('幻雾跳过相加不能沿用上回合数字连携加成',()=>{
 const g=game(),p=g.players[0],o=g.players[1];p.skill=7;p.jumped7=true;p.huanwuSkip=true;o.huxi=3;prepare(g,1,1);E.passTurn(g);assert.equal(p.jumped7,false);assert.equal(g.step,'awaitAction');currentCast(g,'gongping');assert.equal(o.huxi,2);
});
test('98K连携保持无视无敌、荆棘与整队假人',()=>{
 const g=game(),o=g.players[1];o.wudi=true;o.jingji=true;o.dummy={alive:true,hp:8,castBefore:true,reserve:[8]};g.chainCount=3;g.chainDigits=new Set(['san','ba']);cast(g,0,6,'jiubaK');assert.equal(g.winner,0);assert.equal(o.wudi,true);assert.equal(o.jingji,true);assert.equal(o.dummy.alive,true);
});
test('赌命到期直接败北，无敌与假人不能抵挡',()=>{
 const g=game(),p=g.players[0];p.duming={active:true,turnsLeft:1};p.wudi=true;p.dummy={alive:true,hp:8,castBefore:true,reserve:[8]};E.passTurn(g);assert.equal(g.winner,1);assert.equal(p.hp,0);assert.equal(p.wudi,true);assert.equal(p.dummy.alive,true);
});
test('非法相加、技能索引和禁用席位均不改变局面',()=>{
 const g=game();g.step='awaitAdd';for(const v of [-1,2,NaN,'0']){const before=E.serializeGame(g);assert.ok(E.addHand(g,v).err);assert.equal(E.serializeGame(g),before);}
 g.step='awaitAction';for(const v of [-1,99,NaN,'0']){const before=E.serializeGame(g);assert.ok(E.actSkill(g,v).err);assert.equal(E.serializeGame(g),before);}
 g.phase='banning';const before=E.serializeGame(g);assert.ok(E.submitBan(g,2,'quan').err);assert.equal(E.serializeGame(g),before);
});
test('AI与引擎共用禁用、次数和费用判定，搜索不会修改真实局面',()=>{
 const g=game();g.players[0].skill=8;g.players[0].dumingUsed=true;g.banned=['ba'];assert.ok(!AI.legalActions(g).some(a=>a.type==='act'&&[0,3].includes(a.skillIdx)));const before=E.serializeGame(g);AI.chooseAction(g,0,'hard',40);assert.equal(E.serializeGame(g),before);
});
test('v1/v2 历史规则原样保留，无敌不挡毒、被挡攻击仍挂灼烧和淬毒',()=>{
 for(const version of [1,2]){const g=game(version),p=g.players[0],o=g.players[1];p.wudi=true;p.delayed=[{owner:1,dmg:2,desc:'小烈焰'}];E.passTurn(g);assert.equal(p.hp,28);assert.equal(p.wudi,true);p.cuidu=true;o.wudi=true;cast(g,0,3,'xiaolieyan');assert.deepEqual(o.delayed.map(d=>d.desc),['小烈焰','淬毒']);}
});
test('v1/v2 旧公平正义与胜负时序不因重构改变',()=>{
 for(const version of [1,2]){const g=game(version);g.players[1].huxi=3;g.players[1].skill=6;g.players[0].skill=1;g.step='awaitAdd';E.addHand(g,1);currentCast(g,'gongping');assert.equal(g.players[1].huxi,1);const x=game(version);x.players[0].hp=4;x.players[1].jingji=true;cast(x,0,9,'yuandu');assert.equal(x.winner,1);assert.equal(x.players[0].hp,2);}
});
test('三个规则版本均可生成、验证完整训练棋谱，未知版本被拒绝',()=>{
 for(const version of [1,2,3]){const g=E.createGame(['A','B']);g.rulesVersion=version;g.phase='banning';E.submitBan(g,0,'jiubaK');E.submitBan(g,1,'youli');const record=R.create(g);while(!g.over)R.perform(g,g.step==='awaitAdd'?{type:'add',choice:0}:{type:'pass'},record);const finished=R.finish(record,g);assert.equal(finished.rulesVersion,version);assert.equal(R.reconstruct(finished).winner,g.winner);assert.throws(()=>R.reconstruct({...finished,rulesVersion:4}));}
});
console.log(`通过 ${passed} 项 v3 机制与兼容测试`);
