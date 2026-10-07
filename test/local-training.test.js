'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const E=require('../engine'),Replay=require('../replay'),{createStore}=require('../lib/local-training');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'tw-desktop-training-')),file=path.join(temp,'human-records.json');
function fixture(){const g=E.createGame(['私密名字','AI']);g.turn=0;g.players[0].hp=20;g.players[1].hp=21;g.phase='banning';E.submitBan(g,0,'youli');E.submitBan(g,1,'jiubaK');
  const replay=Replay.create(g);while(!g.over)Replay.perform(g,g.step==='awaitAdd'?{type:'add',choice:0}:{type:'pass'},replay);return Replay.finish(replay,g);}
(async()=>{
  const store=createStore(file),record=fixture();assert.equal((await store.request({op:'profile'})).enabled,false);
  assert.equal((await store.request({op:'record',record})).accepted,false);
  await store.request({op:'profile',enabled:true});
  await Promise.all([store.request({op:'record',record}),store.request({op:'record',record:{...record,name:'私密名字',token:'secret'}})]);
  const exported=await createStore(file).request({op:'export'});assert.equal(exported.count,1);assert.equal(exported.total,1);assert.equal(exported.enabled,true);
  assert.equal(exported.records[0].source,'desktop');assert.ok(!JSON.stringify(exported).includes('secret'));assert.ok(!JSON.stringify(exported).includes('私密名字'));
  await assert.rejects(store.request({op:'record',record:{...record,winner:1-record.winner}}));
  await assert.rejects(store.request({op:'delete',path:'arbitrary'}));
  const out=path.join(temp,'imported');execFileSync(process.execPath,[path.resolve(__dirname,'../scripts/sync-human.js'),'--local',file,'--local-only','true','--out',out,'--simulations','4'],{stdio:'pipe'});
  assert.equal(JSON.parse(fs.readFileSync(path.join(out,'summary.json'))).games,1);
  await store.request({op:'profile',enabled:false});assert.equal((await store.request({op:'record',record:{...record,id:'off-record-00001'}})).accepted,false);
  assert.equal((await store.request({op:'export'})).count,1);
  await store.request({op:'profile',enabled:true});
  for(let i=0;i<501;i++)await store.request({op:'record',record:{...record,id:'local-bounded-'+i}});
  const bounded=await store.request({op:'export'});assert.equal(bounded.count,500);assert.equal(bounded.total,502);
  console.log('PASS: desktop opt-in, concurrent dedup, restart persistence, privacy, forged winner rejection, offline trainer import, disable and 500-game retention');
})().catch(e=>{console.error(e);process.exitCode=1;});
