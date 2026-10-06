'use strict';
const assert=require('node:assert/strict');
const mem=new Map();
process.env.UPSTASH_REDIS_REST_URL='https://fake.upstash.io';process.env.UPSTASH_REDIS_REST_TOKEN='fake-token';
global.fetch=async(url,options)=>{
  const [op,...args]=JSON.parse(options.body);let result=null;
  if(op==='GET') result=mem.get(args[0]) || null;
  else if(op==='SET') {if(!args.includes('NX') || !mem.has(args[0])) {mem.set(args[0],args[1]);result='OK';}}
  else if(op==='EVAL') {
    const [,n,...rest]=args,keys=rest.slice(0,Number(n)),argv=rest.slice(Number(n));result=0;
    if(mem.get(keys[0])===argv[0]) {if(Number(n)===2) mem.set(keys[1],argv[1]);else mem.delete(keys[0]);result=1;}
  }
  return {json:async()=>({result})};
};
const handler=require('../api/ranked');
async function call(body,method='POST') {
  const r={code:200,headers:{}};
  const res={setHeader(k,v){r.headers[k]=v;},status(code){r.code=code;return this;},json(data){r.body=data;return this;}};
  await handler({method,body},res);return r;
}
(async()=>{
  assert.equal((await call({},'GET')).code,405);
  const profiles=await Promise.all(['甲','乙'].map(name=>call({op:'profile',name})));
  profiles.forEach(r=>{assert.equal(r.body.ok,true);assert.equal(r.headers['Cache-Control'],'no-store');});
  const [a,b]=profiles.map(r=>r.body);
  await call({op:'queue',identity:a.identity});const sb=(await call({op:'queue',identity:b.identity})).body.session;
  const sa=(await call({op:'status',identity:a.identity})).body.session;assert.equal(sa.roomCode,sb.roomCode);
  const act=(s,type,extra={})=>call({op:'action',room:s.roomCode,token:s.token,type,...extra});
  assert.equal((await call({op:'state',room:sa.roomCode,token:'bad'})).code,403);
  await act(sa,'ban',{skillId:'youli'});await act(sb,'ban',{skillId:'jiubaK'});await act(sa,'resign');
  const ended=(await call({op:'state',room:sb.roomCode,token:sb.token})).body;
  assert.equal(ended.over,true);assert.equal(ended.ratingResult[sb.playerIdx].delta,32);
  assert.equal((await act(sa,'resign')).code,400);assert.equal((await call({op:'profile',identity:a.identity})).body.profile.games,1);
  assert.equal(mem.has('tangwu:rank:lock'),false);
  console.log('  ✓ Vercel 排位 HTTP 方法、无缓存、并发身份、匹配、授权与幂等 Elo 结算');
})().catch(e=>{console.error(e);process.exitCode=1;});
