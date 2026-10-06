'use strict';
const crypto=require('node:crypto');
const fs=require('node:fs/promises');
const path=require('node:path');
const E=require('../engine');
const R=require('../ranked');
const QUEUE_TTL=25000,MOVE_MS=90000,BAN_MS=120000;
const fail=(message,code=400)=>Object.assign(new Error(message),{code});
const secret=()=>crypto.randomBytes(24).toString('hex');
const keyOf=key=>crypto.createHash('sha256').update(key).digest('hex');
const fresh=()=>({version:1,profiles:{},queue:[],matches:{}});
const actor=g=>g.controller>=0?g.controller:g.turn;

// Profiles, queue, game and rating settlement are committed together.
function diskStore(file=process.env.TANGWU_RANK_FILE || path.join(__dirname,'../data/ranked.json')) {
  let tail=Promise.resolve();
  return {transact(fn) {
    const job=tail.then(async()=>{
      let db; try {db=JSON.parse(await fs.readFile(file,'utf8'));}
      catch(e) {if(e.code!=='ENOENT') throw e; db=fresh();}
      const result=await fn(db); await fs.mkdir(path.dirname(file),{recursive:true});
      await fs.writeFile(file+'.tmp',JSON.stringify(db),'utf8'); await fs.rename(file+'.tmp',file); return result;
    });
    tail=job.catch(()=>{}); return job;
  }};
}
function redisStore(command) {
  return {async transact(fn) {
    const lock='tangwu:rank:lock',token=secret(); let acquired=false;
    for(let n=0;n<20;n++) {
      if(await command(['SET',lock,token,'NX','PX',15000])==='OK') {acquired=true;break;}
      await new Promise(r=>setTimeout(r,40));
    }
    if(!acquired) throw fail('排位服务器忙，请重试',503);
    try {
      const raw=await command(['GET','tangwu:rank:v1']);
      const db=raw?JSON.parse(raw):fresh(),result=await fn(db);
      const saved=await command(['EVAL',"if redis.call('GET',KEYS[1]) == ARGV[1] then redis.call('SET',KEYS[2],ARGV[2]); return 1 else return 0 end",2,lock,'tangwu:rank:v1',token,JSON.stringify(db)]);
      if(!saved) throw fail('排位事务超时，请重试',503); return result;
    } finally {
      await command(['EVAL',"if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",1,lock,token]);
    }
  }};
}
function createService(store,clock=()=>Date.now()) {
  const publicProfile=p=>({name:p.name,rating:p.rating,games:p.games,wins:p.wins,losses:p.losses,draws:p.draws,best:p.best,history:p.history,rank:R.progress(p)});
  const publicScore=p=>{const {history,...score}=publicProfile(p);return score;};
  function settle(db,m,g,reason,now) {
    if(m.settled || !g.over) return;
    const players=m.ids.map(id=>db.profiles[id]),opponents=players.map(p=>({name:p.name,rating:p.rating}));
    m.ratingResult=players.map((p,i)=>R.settle(p,m.code,opponents[1-i],g.result==='draw'?.5:g.winner===i?1:0,reason,now));
    m.settled=true; players.forEach(p=>{if(p.active===m.code) p.active=null;});
  }
  function finish(db,m,g,loser,reason,now) {
    g.over=true;g.phase='over';g.step='over';g.winner=1-loser;g.result='win';
    g.log.push(`${reason}：${g.players[loser].name} 判负`); m.game=E.serializeGame(g);settle(db,m,g,reason,now);
  }
  function expire(db,now) {
    db.queue=db.queue.filter(q=>now-q.seen<QUEUE_TTL && !db.profiles[q.id]?.active);
    for(const m of Object.values(db.matches)) {
      if(m.settled) continue; const g=E.deserializeGame(m.game);
      if(g.over) {settle(db,m,g,'对局结束',now);continue;}
      if(g.phase==='banning') {
        const missing=[0,1].filter(i=>!g.banPicks[i] && now>=m.banDeadlines[i]);
        if(missing.length===2) {
          g.over=true;g.phase='over';g.step='over';g.winner=-1;g.result='draw';g.log.push('双方未完成禁用，平局结算');
          m.game=E.serializeGame(g);settle(db,m,g,'禁用超时',now);
        } else if(missing.length) finish(db,m,g,missing[0],'禁用超时',now);
      } else if(now>=m.deadline) finish(db,m,g,actor(g),'行动超时',now);
    }
    for(const [code,m] of Object.entries(db.matches)) if(m.settled && now-m.updated>7*86400000) delete db.matches[code];
  }
  function match(db,now) {
    for(let i=0;i<db.queue.length;i++) {
      const a=db.queue[i];
      for(let j=i+1;j<db.queue.length;j++) {
        const b=db.queue[j],pa=db.profiles[a.id],pb=db.profiles[b.id];
        const range=150+Math.floor(Math.max(now-a.joined,now-b.joined)/1000)*12;
        if(a.id===b.id || Math.abs(pa.rating-pb.rating)>range) continue;
        let code;do {code='R'+crypto.randomBytes(4).toString('hex').toUpperCase();} while(db.matches[code]);
        const g=E.createGame([pa.name,pb.name]);g.phase='banning';
        db.matches[code]={code,ids:[a.id,b.id],tokens:[secret(),secret()],game:E.serializeGame(g),banDeadlines:[now+BAN_MS,now+BAN_MS],deadline:now+MOVE_MS,updated:now,seen:[now,now],settled:false};
        pa.active=pb.active=code;db.queue.splice(j,1);db.queue.splice(i,1);i--;break;
      }
    }
  }
  function session(db,p,id) {
    const m=p.active?db.matches[p.active]:null;if(!m || m.settled) return null;
    const idx=m.ids.indexOf(id);return {roomCode:m.code,token:m.tokens[idx],playerIdx:idx,name:p.name,ranked:true};
  }
  return {request(body={}) {return store.transact(db=>{
    const now=clock();expire(db,now);
    try {
    const op=body.op || 'profile';
    let identity=String(body.identity || ''),id=identity?keyOf(identity):null,p=id?db.profiles[id]:null;
    if(!p && op==='profile' && !identity) {
      identity=secret();id=keyOf(identity);p=db.profiles[id]={...R.profile('玩家'),active:null};
    }
    if(op==='state' || op==='action') {
      const code=String(body.room || '');
      const m=Object.hasOwn(db.matches,code)?db.matches[code]:null;if(!m) throw fail('排位对局不存在',404);
      const idx=m.tokens.indexOf(String(body.token || ''));if(idx<0) throw fail('无效排位令牌',403);
      m.seen[idx]=now;const g=E.deserializeGame(m.game);
      if(op==='action') {
        if(g.over) throw fail('本局已结算，请重新匹配');let result;
        if(body.type==='resign') finish(db,m,g,idx,'主动认输',now);
        else if(body.type==='ban') result=E.submitBan(g,idx,String(body.skillId || ''));
        else {
          if(idx!==actor(g)) throw fail('不是你的操作回合',403);
          if(body.type==='add') result=E.addHand(g,Number(body.choice));
          else if(body.type==='act') result=E.actSkill(g,Number(body.skillIdx),{buffIdx:body.buffIdx==null?null:Number(body.buffIdx)});
          else if(body.type==='pass') result=E.passTurn(g);else throw fail('排位操作无效');
        }
        if(result?.err) throw fail(result.err);
        m.updated=now;m.game=E.serializeGame(g);if(g.phase==='playing') m.deadline=now+MOVE_MS;
        settle(db,m,g,'对局结束',now);return {ok:true};
      }
      return {ok:true,roomCode:m.code,ranked:true,ai:false,connected:m.seen.map(t=>now-t<15000),rematch:[false,false],...E.publicState(g,idx),
        deadline:g.phase==='banning'?m.banDeadlines[idx]:m.deadline,ratingResult:m.ratingResult || null,rankProfiles:m.ids.map(id=>publicScore(db.profiles[id]))};
    }
    if(!p) throw fail('排位身份已失效，请重新创建本机身份',403);
    if(op==='profile' && body.name) p.name=String(body.name).trim().slice(0,12) || p.name;
    if(op==='cancel') db.queue=db.queue.filter(q=>q.id!==id);
    if(op==='queue') {
      if(body.name) p.name=String(body.name).trim().slice(0,12) || p.name;
      if(!p.active && !db.queue.some(q=>q.id===id)) db.queue.push({id,joined:now,seen:now});
    }
    const ticket=db.queue.find(q=>q.id===id);if(ticket && ['status','queue'].includes(op)) ticket.seen=now;
    if(!['profile','queue','cancel','status'].includes(op)) throw fail('排位请求无效');match(db,now);
    const waiting=db.queue.find(q=>q.id===id);
    return {ok:true,identity,profile:publicProfile(p),session:session(db,p,id),queued:!!waiting,waitedMs:waiting?now-waiting.joined:0,
      leaderboard:Object.values(db.profiles).filter(p=>p.games>0).sort((a,b)=>b.rating-a.rating || b.wins-a.wins).slice(0,20).map(publicScore)};
    } catch(e) { return {transactionError:{message:e.message,code:e.code || 400}}; }
  }).then(result=>{if(result.transactionError) throw fail(result.transactionError.message,result.transactionError.code);return result;});}};
}
module.exports={createService,diskStore,redisStore};
