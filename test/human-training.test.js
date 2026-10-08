'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const E=require('../engine'),R=require('../replay'),T=require('../lib/training-service');
function fixture(turn=0){const g=E.createGame(['私密昵称','AI']);g.turn=turn;g.players[turn].hp=20;g.players[1-turn].hp=21;g.phase='banning';E.submitBan(g,0,'youli');E.submitBan(g,1,'jiubaK');const replay=R.create(g,'learned');
  while(!g.over){const a=g.step==='awaitAdd'?{type:'add',choice:0}:{type:'pass'};assert.ok(!R.perform(g,a,replay)?.err);}return R.finish(replay,g);}
const seed=id=>1000000000+parseInt(crypto.createHash('sha256').update(id).digest('hex').slice(0,8),16)%1000000000;
function fixtureId(validation){for(let n=0;;n++){const id='human-fixture-'+n.toString().padStart(8,'0');if((seed(id)%10===0)===validation)return id;}}
(async()=>{
  const game=fixture();assert.equal(R.reconstruct(game).winner,game.winner);
  const original=JSON.stringify(game);R.clean(game);assert.equal(JSON.stringify(game),original);
  for(const change of [r=>r.winner=1-r.winner,r=>r.actions.pop(),r=>r.actions[0][0]=1-r.actions[0][0],r=>r.actions[0][2]=99,r=>r.actions.push([0,2]),r=>r.truncated=true]){
    const bad=structuredClone(game);change(bad);assert.throws(()=>R.clean(bad));
  }
  console.log('  ✓ 引擎完整重放，拒绝伪造胜者、截断、错误操作者、非法动作和终局后的行动');
  const service=T.createService(T.memoryStore()),p=await service.request({op:'profile'}),identity=p.identity;
  assert.equal((await service.request({op:'record',identity,record:game})).accepted,false);
  await service.request({op:'profile',identity,enabled:true});
  const first=await service.request({op:'record',identity,record:{...game,name:'秘密',token:'不能导出',hp:999}});
  assert.equal(first.count,1);assert.equal((await service.request({op:'record',identity,record:game})).count,1);
  const other=await service.request({op:'profile'});assert.equal((await service.request({op:'export',identity:other.identity})).records.length,0);
  const exported=await service.request({op:'export',identity});assert.ok(!JSON.stringify(exported.records).includes('不能导出'));assert.ok(!JSON.stringify(exported.records).includes('秘密'));
  await assert.rejects(service.request({op:'export',identity:'bad'}));
  for(let n=1;n<=51;n++)await service.request({op:'record',identity,record:{...game,id:'bounded-replay-'+n}});
  const bounded=await service.request({op:'export',identity});assert.equal(bounded.count,50);assert.equal(bounded.total,52);
  await service.request({op:'profile',identity,enabled:false});assert.equal((await service.request({op:'record',identity,record:{...game,id:'disabled-replay'}})).accepted,false);
  console.log('  ✓ 明确选择参与、私有身份隔离、重复提交幂等、去除昵称和令牌、关闭停止接收及50局上限');
  const redis=new Map();async function command(a){if(a[0]==='GET')return redis.get(a[1])||null;if(a[0]==='EVAL'){if((redis.get(a[3])||'')!==a[4])return 0;redis.set(a[3],a[5]);return 1;}throw Error('Unexpected Redis command');}
  const cloud=T.createService(T.redisStore(command)),cp=await cloud.request({op:'profile',enabled:true});
  await Promise.all([cloud.request({op:'record',identity:cp.identity,record:game}),cloud.request({op:'record',identity:cp.identity,record:game})]);assert.equal((await cloud.request({op:'export',identity:cp.identity})).count,1);
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'tw-human-')),file=path.join(temp,'records.json'),disk=T.createService(T.diskStore(file));
  const dp=await disk.request({op:'profile',enabled:true});await disk.request({op:'record',identity:dp.identity,record:game});assert.equal((await T.createService(T.diskStore(file)).request({op:'export',identity:dp.identity})).count,1);
  console.log('  ✓ Redis并发提交和磁盘重启保留训练记录');
  const backing=T.memoryStore();let unavailable=false;
  const retry=T.createService({transaction(id,fn){if(unavailable)throw Error('temporary network failure');return backing.transaction(id,fn);}});
  const rp=await retry.request({op:'profile',enabled:true});const room={game:R.reconstruct(game),trainingOwner:T.owner(rp.identity),trainingReplay:game};
  unavailable=true;await retry.flush(room);assert.equal(room.trainingStatus,'pending');assert.equal(room.trainingOutbox.length,1);
  room.game=E.createGame(['你','AI']);room.trainingReplay=null;unavailable=false;await retry.flush(room);
  assert.equal(room.trainingOutbox.length,0);assert.equal((await retry.request({op:'export',identity:rp.identity})).count,1);
  console.log('  ✓ 已结束记录在保存失败时保留，并在再来一局后重试收录');
  const out=path.resolve(__dirname,'../output/qa/human-fixture');fs.mkdirSync(out,{recursive:true});
  const held={...game,id:fixtureId(true)},training={...fixture(1),id:fixtureId(false)},bad={...game,winner:1-game.winner};
  const input=path.join(out,'export.json');fs.writeFileSync(input,JSON.stringify({version:1,records:[held,training,bad]}));
  execFileSync(process.execPath,[path.join(__dirname,'../scripts/import-human.js'),'--input',input,'--out',out,'--simulations','4'],{stdio:'pipe'});
  const summary=JSON.parse(fs.readFileSync(path.join(out,'summary.json')));assert.equal(summary.games,2);assert.equal(summary.rejected,1);
  const games=fs.readFileSync(path.join(out,'games-human.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
  for(const g of games)for(const s of g.samples){assert.equal(s.z,g.winner<0?0:g.winner===s.actor?1:-1);assert.equal(s.x.length,232);assert.equal(s.valueWeight,1);assert.ok(Math.abs(s.pi.reduce((a,b)=>a+b,0)-1)<1e-5);s.pi.forEach((v,i)=>assert.ok(v===0||s.mask.includes(i)));}
  console.log('  ✓ 人类对局复盘为真实胜负、合法MCTS策略目标和整局验证种子，可供PyTorch直接读取');
})().catch(e=>{console.error(e);process.exitCode=1;});
