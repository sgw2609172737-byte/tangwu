'use strict';
const assert=require('node:assert/strict'),C=require('../public/study-core'),E=require('../engine'),R=require('../replay'),S=require('../skills');
const storage={data:{},getItem(k){return this.data[k]||null;},setItem(k,v){this.data[k]=v;}};
function act(g,id,opts={}){const i=S.SKILLS[g.players[g.turn].skill].findIndex(sk=>sk.id===id);assert.ok(i>=0,id+' is available');assert.ok(!E.actSkill(g,i,opts)?.err);}
for(const [id,skill] of [['shield','wudi'],['cleanse','jinghua'],['reflect','yuandu'],['dummy','shipo']]){const g=C.puzzleGame(id);act(g,skill);assert.equal(C.puzzles.find(p=>p.id===id).goal(g),true,id);}
{const g=C.puzzleGame('chain');act(g,'yi');assert.ok(!E.addHand(g,1)?.err);act(g,'gongping',{buffIdx:0});assert.equal(g.players[1].shuangbei,1);assert.equal(C.puzzles.find(p=>p.id==='chain').goal(g),true);}
{const g=C.puzzleGame('ordinary');assert.ok(!E.addHand(g,1)?.err);act(g,'gongping',{buffIdx:0});assert.equal(g.players[1].shuangbei,2);assert.equal(C.puzzles.find(p=>p.id==='ordinary').goal(g),true);}
const g=E.createGame(['A','B']);g.turn=0;g.players[0].hp=20;g.players[1].hp=21;g.phase='banning';E.submitBan(g,0,'jiubaK');E.submitBan(g,1,'qibu');
const draft=R.create(g,'normal');for(let n=0;n<3;n++){const a={type:'add',choice:1},who=C.actor(g);assert.ok(!R.perform(g,a,null)?.err);C.append(draft,a,who);if(g.step==='awaitAction'){const action={type:'pass'},actor=C.actor(g);assert.ok(!R.perform(g,action,null)?.err);C.append(draft,action,actor);}}
assert.ok(C.resume(draft,g));assert.equal(C.resume({...draft,id:'invalid!'},g),null);assert.equal(C.resume({...draft,actions:[[1,1,100,null]]},g),null);
while(!g.over){const a=g.step==='awaitAdd'?{type:'add',choice:1}:{type:'pass'};const who=C.actor(g);assert.ok(!R.perform(g,a,null)?.err);C.append(draft,a,who);}
const record=R.clean(R.finish(draft,g)),frames=C.frames(record);assert.equal(frames.length,record.actions.length+1);const end=E.deserializeGame(frames.at(-1).game);assert.equal(end.winner,g.winner);assert.equal(end.players[0].hp,g.players[0].hp);assert.ok(frames.at(-1).logs.length);
assert.equal(C.importRecords({records:[record]},storage),1);assert.equal(C.importRecords({records:[record]},storage),0);assert.equal(C.read(storage).length,1);
const previous=storage.getItem(C.KEY);assert.throws(()=>C.importRecords({records:[record,{...record,winner:0}]},storage));assert.equal(storage.getItem(C.KEY),previous,'invalid import is atomic');
assert.equal(C.archive(null,g,storage),null);assert.equal(C.archive(draft,g,storage),record.id);const copy=C.clone(end);copy.players[0].hp=999;assert.notEqual(E.deserializeGame(frames.at(-1).game).players[0].hp,999,'branches do not change a replay');
for(const key of ['tangwu_ai_rank_v1','tangwu_match_v1','tangwu_training_enabled_v1'])assert.equal(storage.getItem(key),null);
console.log('Study core: six real-engine challenges, draft validation, complete replay, atomic import, branch isolation and private state boundaries passed.');
