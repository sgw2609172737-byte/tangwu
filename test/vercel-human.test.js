'use strict';
const assert=require('node:assert/strict');
process.env.UPSTASH_REDIS_REST_URL='https://redis.invalid';process.env.UPSTASH_REDIS_REST_TOKEN='test-only';
const db=new Map();global.fetch=async(url,{body})=>{const a=JSON.parse(body);let result;
  if(a[0]==='GET')result=db.get(a[1])||null;
  else if(a[0]==='SET'){if(a.includes('NX')&&db.has(a[1]))result=null;else{db.set(a[1],a[2]);result='OK';}}
  else if(a[0]==='DEL')result=Number(db.delete(a[1]));
  else if(a[0]==='EVAL'){if((db.get(a[3])||'')!==a[4])result=0;else{db.set(a[3],a[5]);result=1;}}
  else throw Error('Unexpected command '+a[0]);return {json:async()=>({result})};
};
const handlers={training:require('../api/training'),hello:require('../api/hello'),action:require('../api/action'),state:require('../api/state')};
async function call(name,body={},method='POST'){let result,code=200;const headers={};const res={setHeader(k,v){headers[k]=v;},status(c){code=c;return this;},json(d){result=d;return this;}};
  await handlers[name]({method,body,query:body},res);return {code,headers,data:result};}
(async()=>{
  assert.equal((await call('training',{},'GET')).code,405);
  const p=(await call('training',{op:'profile',enabled:true})).data;
  const hello=(await call('hello',{ai:true,name:'不应导出的昵称',difficulty:'easy',trainingIdentity:p.identity})).data;
  const b={room:hello.roomCode,token:hello.token};assert.ok((await call('action',{...b,type:'ban',skillId:'youli'})).data.ok);
  let s=(await call('state',b,'GET')).data;
  for(let n=0;n<180&&!s.over;n++){assert.ok((await call('action',{...b,...(s.step==='awaitAdd'?{type:'add',choice:0}:{type:'pass'})})).data.ok);s=(await call('state',b,'GET')).data;}
  assert.ok(s.over);assert.equal(s.training.status,'collected');assert.ok(!JSON.stringify(s).includes(p.identity));
  const exp=(await call('training',{op:'export',identity:p.identity})).data;assert.equal(exp.count,1);assert.equal(exp.records[0].source,'server');assert.ok(!JSON.stringify(exp.records).includes('不应导出'));
  for(let n=0;n<3;n++)await call('state',b,'GET');assert.equal((await call('training',{op:'export',identity:p.identity})).data.count,1);
  await call('action',{...b,type:'rematch'});const room=JSON.parse(db.get('tangwu:room:'+hello.roomCode));assert.equal(room.trainingReplay,null);assert.equal(room.trainingSubmitted,false);
  console.log('  ✓ Vercel真实路由、Redis跨请求保存完整AI棋谱、终局自动收录、幂等和再来一局重置；公开状态不泄露训练身份');
})().catch(e=>{console.error(e);process.exitCode=1;});
