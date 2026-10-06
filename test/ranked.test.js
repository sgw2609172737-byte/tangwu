'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const R=require('../ranked'),E=require('../engine'),{createService,diskStore,redisStore}=require('../lib/ranked-service');
async function main() {
  const p=R.profile(),r=R.settle(p,'one',{name:'AI',rating:1000},1);
  assert.equal(r.delta,32);R.settle(p,'one',{name:'AI',rating:1000},0);assert.equal(p.games,1);
  assert.equal(R.progress(p).name,'定级赛 1/5');assert.equal(R.tier(1450).name,'铂金');
  console.log('  ✓ 定级、Elo、段位与幂等结算');
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tangwu-ranked-')),file=path.join(dir,'rank.json');
  let now=1000000;const service=createService(diskStore(file),()=>now);
  const [a,b,c]=await Promise.all(['A','B','C'].map(name=>service.request({op:'profile',name})));
  const req=(p,op,extra={})=>service.request({op,identity:p.identity,...extra});
  assert.equal((await req(a,'queue')).queued,true);assert.equal((await req(a,'queue')).queued,true);
  assert.equal((await req(a,'status')).session,null);
  const joined=await req(b,'queue'),sa=(await req(a,'status')).session,sb=joined.session;
  assert.ok(sa && sb);assert.equal(sa.roomCode,sb.roomCode);assert.notEqual(sa.token,sb.token);
  assert.equal((await req(c,'queue')).queued,true);assert.equal((await req(c,'cancel')).queued,false);
  console.log('  ✓ 真人匹配、不自匹配、重复入队与取消');
  const action=(s,type,extra={})=>service.request({op:'action',room:s.roomCode,token:s.token,type,...extra});
  const state=s=>service.request({op:'state',room:s.roomCode,token:s.token});
  await assert.rejects(()=>state({...sa,token:'forged'}),/令牌/);
  await assert.rejects(()=>state({...sa,roomCode:'__proto__'}),/不存在/);
  assert.deepEqual((await state(sa)).banPicks,[false,false]);
  await action(sa,'ban',{skillId:'youli'});const hidden=await state(sb);assert.deepEqual(hidden.banPicks,[true,false]);assert.deepEqual(hidden.banned,[]);
  await action(sb,'ban',{skillId:'jiubaK'});const playing=await state(sa);
  const wrong=playing.turn===sa.playerIdx?sb:sa;await assert.rejects(()=>action(wrong,'add',{choice:0}),/不是你的/);
  console.log('  ✓ 令牌、盲禁用与行动归属校验');
  await action(sa,'resign');const ended=await state(sa);assert.ok(ended.over);assert.equal(ended.ratingResult[sa.playerIdx].delta,-32);
  await assert.rejects(()=>action(sa,'resign'),/已结算/);assert.equal((await req(a,'profile')).profile.games,1);
  const restarted=createService(diskStore(file),()=>now);assert.equal((await restarted.request({op:'profile',identity:a.identity})).profile.losses,1);
  console.log('  ✓ 认输结算仅一次，服务器重启后保留积分');
  await req(a,'queue');const sb2=(await req(b,'queue')).session,sa2=(await req(a,'status')).session;
  await action(sa2,'ban',{skillId:'youli'});now+=120001;const timeout=await state(sb2);
  assert.ok(timeout.over);assert.equal(timeout.winner,sa2.playerIdx);assert.equal(timeout.ratingResult[sb2.playerIdx].reason,'禁用超时');
  console.log('  ✓ 禁用超时判负');
  await req(a,'queue');const sb3=(await req(b,'queue')).session,sa3=(await req(a,'status')).session;
  await action(sa3,'ban',{skillId:'youli'});await action(sb3,'ban',{skillId:'jiubaK'});
  const turn=(await state(sa3)).turn;now+=90001;
  await assert.rejects(()=>action(sa3,'add',{choice:0}),/已结算/);
  assert.equal((await state(sa3)).winner,1-turn);
  const afterTimeout=createService(diskStore(file),()=>now);
  assert.equal((await afterTimeout.request({op:'profile',identity:a.identity})).profile.games,3);
  await req(c,'queue');now+=26000;assert.equal((await req(c,'status')).queued,false);
  console.log('  ✓ 行动超时与失联队列清理');
  // Run the same transaction path against a Redis command mock, including owned-lock commit/release.
  const values=new Map();
  const command=async cmd=>{
    const [op,key,...args]=cmd;
    if(op==='GET') return values.get(key)||null;
    if(op==='SET') {if(args.includes('NX') && values.has(key)) return null;values.set(key,args[0]);return 'OK';}
    if(op==='EVAL') {
      const count=Number(args[0]),keys=args.slice(1,1+count),argv=args.slice(1+count);
      if(values.get(keys[0])!==argv[0]) return 0;
      if(count===2) values.set(keys[1],argv[1]);else values.delete(keys[0]);return 1;
    }
    throw new Error('Unexpected Redis command');
  };
  const redis=createService(redisStore(command),()=>now);const rp=await redis.request({op:'profile',name:'Redis'});
  assert.equal((await redis.request({op:'queue',identity:rp.identity})).queued,true);
  assert.equal(values.has('tangwu:rank:lock'),false);console.log('  ✓ Redis 原子提交与锁归属释放');
  // No client-provided rating/winner is trusted.
  const unchanged=await req(c,'profile',{rating:9999,winner:0});assert.equal(unchanged.profile.rating,1000);
  assert.equal(JSON.stringify(unchanged.leaderboard).includes(a.identity),false);
  console.log('  ✓ 客户端不能提交积分或胜者，公开数据不包含身份密钥');
  console.log('排位测试通过');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
