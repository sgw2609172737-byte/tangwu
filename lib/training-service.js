'use strict';
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path'),Replay=require('../replay');
const MAX_RECORDS=50,TTL=90*86400;
const owner=identity=>/^[a-f0-9]{64}$/.test(identity || '')?crypto.createHash('sha256').update(identity).digest('hex'):null;
const fresh=()=>({enabled:false,records:[],seen:[],total:0});
function memoryStore() {
  const records=new Map();return {async transaction(id,fn){const db=records.get(id)||fresh();const result=fn(db);records.set(id,db);return result;}};
}
function diskStore(file=process.env.TANGWU_TRAINING_FILE || path.join(__dirname,'../data/human-records.json')) {
  let tail=Promise.resolve();return {transaction(id,fn){const work=tail.then(()=>{let db={};try {db=JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){if(e.code!=='ENOENT') throw e;}
    const profile=db[id]||fresh(),result=fn(profile);db[id]=profile;fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(db));fs.renameSync(file+'.tmp',file);return result;});tail=work.catch(()=>{});return work;}};
}
function redisStore(command) {
  const script="local v=redis.call('GET',KEYS[1]);if (v or '')~=ARGV[1] then return 0 end;redis.call('SET',KEYS[1],ARGV[2],'EX',ARGV[3]);return 1";
  return {async transaction(id,fn){const key='tangwu:training:'+id;
    for(let n=0;n<6;n++){const raw=await command(['GET',key]),db=raw?JSON.parse(raw):fresh(),result=fn(db);
      if(await command(['EVAL',script,1,key,raw||'',JSON.stringify(db),String(TTL)])) return result;}
    throw Error('训练记录正在更新，请重试');}};
}
function createService(store) {
  const status=p=>({enabled:p.enabled,count:p.records.length,total:p.total,limit:MAX_RECORDS});
  async function accept(id,record,source) {
    if(!id) return {accepted:false};
    const clean=Replay.clean(record);
    return store.transaction(id,p=>{
      if(!p.enabled) return {...status(p),accepted:false};
      if(p.seen.includes(clean.id)) return {...status(p),accepted:true,duplicate:true};
      p.records.push({...clean,source,collectedAt:Date.now()});p.records=p.records.slice(-MAX_RECORDS);
      p.seen=[...p.seen,clean.id].slice(-1000);p.total++;
      return {...status(p),accepted:true};
    });
  }
  async function request(body={}) {
    const op=body.op || 'profile';let identity=String(body.identity || '');
    if(!identity && op==='profile') identity=crypto.randomBytes(32).toString('hex');
    const id=owner(identity);if(!id) throw Object.assign(Error('训练身份无效'),{code:403});
    if(op==='record') return {ok:true,...await accept(id,body.record,'browser')};
    return store.transaction(id,p=>{
      if(op==='profile' && typeof body.enabled==='boolean') p.enabled=body.enabled;
      if(!['profile','export'].includes(op)) throw Object.assign(Error('训练请求无效'),{code:400});
      return {ok:true,identity,...status(p),...(op==='export'?{version:1,records:p.records}: {})};
    });
  }
  async function flush(room) {
    room.trainingOutbox=room.trainingOutbox || [];
    if(room.trainingReplay && !room.trainingSubmitted && room.game.over && room.trainingOwner) {
      try {const record=Replay.finish(room.trainingReplay,room.game);if(!record){room.trainingStatus='skipped';return;}
        Replay.clean(record);
        if(!room.trainingOutbox.some(item=>item.record.id===record.id))room.trainingOutbox.push({owner:room.trainingOwner,record});
        room.trainingOutbox=room.trainingOutbox.slice(-5);
      }catch(_){room.trainingStatus='skipped';return;}
    }
    const pending=[];
    for(const item of room.trainingOutbox) {
      try {const result=await accept(item.owner,item.record,'server');
        if(room.trainingReplay?.id===item.record.id){room.trainingSubmitted=result.accepted;room.trainingStatus=result.accepted?'collected':'disabled';}}
      catch(_){pending.push(item);if(room.trainingReplay?.id===item.record.id)room.trainingStatus='pending';}
    }room.trainingOutbox=pending;
  }
  return {request,accept,flush};
}
module.exports={owner,createService,memoryStore,diskStore,redisStore,MAX_RECORDS};
