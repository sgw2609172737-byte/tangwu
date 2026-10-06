'use strict';
(function(){
  const E=typeof window!=='undefined'?window.__TW_engine:require('./engine');
  const S=typeof window!=='undefined'?window.__TW_skills:require('./skills');
  const skillIds=new Set(Object.values(S.SKILLS).flat().map(s=>s.id));
  const MAX_STEPS=1200;
  function create(g,difficulty='normal') {
    if(g.phase!=='playing' || g.over || g.actionsUsed!==0 || g.step!=='awaitAdd') return null;
    const id=typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():require('node:crypto').randomUUID();
    return {version:1,id,turn:g.turn,bans:[...g.banPicks],difficulty,actions:[],truncated:false};
  }
  function perform(g,a,replay) {
    const actor=g.controller>=0?g.controller:g.turn;
    const r=a.type==='add'?E.addHand(g,a.choice):a.type==='act'?E.actSkill(g,a.skillIdx,{buffIdx:a.buffIdx}):E.passTurn(g);
    if(!r?.err && replay) {
      if(replay.actions.length>=MAX_STEPS) replay.truncated=true;
      else replay.actions.push(a.type==='add'?[actor,0,a.choice]:a.type==='act'?[actor,1,a.skillIdx,a.buffIdx??null]:[actor,2]);
    }
    return r;
  }
  function finish(replay,g) {
    return replay && !replay.truncated && g.over?{...replay,winner:g.winner}:null;
  }
  function reconstruct(record,onStep) {
    if(record?.version!==1 || typeof record.id!=='string' || !/^[a-zA-Z0-9-]{8,64}$/.test(record.id) || ![0,1].includes(record.turn) || !Array.isArray(record.bans) || record.bans.length!==2 || !record.bans.every(id=>typeof id==='string'&&skillIds.has(id)) || !Array.isArray(record.actions) || record.actions.length>MAX_STEPS || record.truncated || ![-1,0,1].includes(record.winner)) throw Error('对局记录不完整');
    const g=E.createGame(['人类','AI']);g.searchOnly=true;g.turn=record.turn;g.players[g.turn].hp=20;g.players[1-g.turn].hp=21;g.phase='banning';
    for(let i=0;i<2;i++) {const r=E.submitBan(g,i,record.bans[i]);if(r?.err) throw Error('禁用记录无效');}
    for(const row of record.actions) {
      if(!Array.isArray(row) || g.over || row[0]!== (g.controller>=0?g.controller:g.turn)) throw Error('行动顺序无效');
      const a=row[1]===0&&row.length===3&&[0,1].includes(row[2])?{type:'add',choice:row[2]}:
        row[1]===1&&row.length===4&&Number.isInteger(row[2])&&row[2]>=0&&row[2]<8&&(row[3]===null||Number.isInteger(row[3])&&row[3]>=0&&row[3]<8)?{type:'act',skillIdx:row[2],...(row[3]===null?{}:{buffIdx:row[3]})}:
        row[1]===2&&row.length===2?{type:'pass'}:null;
      if(!a) throw Error('行动记录无效');
      onStep?.(g,a,row[0]);const r=perform(g,a,null);if(r?.err) throw Error('对局包含非法行动');
    }
    if(!g.over || g.winner!==record.winner) throw Error('胜负记录无法验证');
    return g;
  }
  function clean(record) {
    reconstruct(record);
    return {version:1,id:record.id,turn:record.turn,bans:[...record.bans],difficulty:['easy','normal','hard','expert','learned'].includes(record.difficulty)?record.difficulty:'normal',actions:record.actions.map(a=>[...a]),winner:record.winner};
  }
  const api={MAX_STEPS,create,perform,finish,reconstruct,clean};
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  if(typeof window!=='undefined') window.__TWReplay=api;
})();
