'use strict';
(function(){
  const browser=typeof window!=='undefined';
  const E=browser?window.__TW_engine:require('../engine');
  const R=browser?window.__TWReplay:require('../replay');
  const S=browser?window.__TW_skills:require('../skills');
  const KEY='tangwu_study_v1',LIMIT=60;
  const actor=g=>g.controller>=0?g.controller:g.turn;
  const clone=g=>E.deserializeGame(E.serializeGame(g));
  function append(record,a,who){
    if(!record)return;
    if(record.actions.length>=R.MAX_STEPS){record.truncated=true;return;}
    record.actions.push(a.type==='add'?[who,0,a.choice]:a.type==='act'?[who,1,a.skillIdx,a.buffIdx??null]:[who,2]);
  }
  function initial(record){
    const g=E.createGame(['你','对手']);g.rulesVersion=record.rulesVersion||1;g.turn=record.turn;
    g.players[g.turn].hp=20;g.players[1-g.turn].hp=21;g.phase='banning';
    record.bans.forEach((id,i)=>{if(E.submitBan(g,i,id)?.err)throw Error('禁用记录无效');});
    return g;
  }
  const decode=row=>row[1]===0?{type:'add',choice:row[2]}:row[1]===1?{type:'act',skillIdx:row[2],...(row[3]==null?{}:{buffIdx:row[3]})}:{type:'pass'};
  function actionName(g,a){
    if(a.type==='pass')return '结束回合';
    if(a.type==='add')return `技能手相加：${g.players[g.turn].skill} + ${a.choice?g.players[1-g.turn].skill:g.players[1-g.turn].energy%10}`;
    const sk=S.SKILLS[g.players[g.turn].skill]?.[a.skillIdx];
    const buff=a.buffIdx==null?'':S.positiveBuffs(g.players[1-g.turn])[a.buffIdx]?.name;
    return (sk?.name||'技能')+(buff?' · 去除'+buff:'');
  }
  function frames(record){
    const clean=R.clean(record),g=initial(clean),result=[];
    function store(label,who,logs){result.push({game:E.serializeGame(g),label,actor:who,logs});}
    store('开局 · 禁用已公示',g.turn,[...g.log]);
    for(const row of clean.actions){
      const a=decode(row),label=actionName(g,a);g.log=[];g.visualEvents=[];
      if(R.perform(g,a,null)?.err)throw Error('棋谱无法回放');
      store(label,row[0],[...g.log]);
    }
    return result;
  }
  function read(storage){
    try{const data=JSON.parse(storage.getItem(KEY));return data?.version===1&&Array.isArray(data.entries)?data.entries.filter(e=>e?.record?.version===1&&typeof e.record.id==='string'&&Array.isArray(e.record.actions)&&Number.isFinite(e.finishedAt)).slice(-LIMIT):[];}catch(_){return [];}
  }
  function importRecords(payload,storage){
    const records=Array.isArray(payload?.records)?payload.records:[payload];
    if(records.length>500)throw Error('一次最多导入 500 局');
    const cleaned=records.map(record=>({record:R.clean(record),finishedAt:Number.isFinite(record.collectedAt)?record.collectedAt:Date.now()}));
    const previous=read(storage),map=new Map(previous.map(entry=>[entry.record.id,entry]));let added=0;
    for(const entry of cleaned)if(!map.has(entry.record.id)){map.set(entry.record.id,entry);added++;}
    storage.setItem(KEY,JSON.stringify({version:1,entries:[...map.values()].slice(-LIMIT)}));return added;
  }
  function archive(record,g,storage){const final=R.finish(record,g);if(!final)return null;importRecords({...final,collectedAt:Date.now()},storage);return final.id;}
  function resume(record,g){
    if(!record||record.truncated||!Array.isArray(record.actions)||record.actions.length>R.MAX_STEPS)return null;
    try{
      if(record.version!==1||![0,1].includes(record.turn)||![1,2,3].includes(record.rulesVersion)||!Array.isArray(record.bans)||record.bans.length!==2||typeof record.id!=='string'||!/^[a-zA-Z0-9-]{8,64}$/.test(record.id))return null;
      const copy=clone(g), rebuilt=initial(record);rebuilt.searchOnly=true;
      for(const row of record.actions){if(!Array.isArray(row)||row[0]!==actor(rebuilt)||rebuilt.over) return null;
        if(!((row[1]===0&&row.length===3&&[0,1].includes(row[2]))||(row[1]===1&&row.length===4&&Number.isInteger(row[2])&&row[2]>=0&&row[2]<8&&(row[3]===null||Number.isInteger(row[3])&&row[3]>=0&&row[3]<8))||(row[1]===2&&row.length===2)))return null;
        if(R.perform(rebuilt,decode(row),null)?.err)return null;
      }
      const strip=x=>{x.searchOnly=true;x.log=[];x.visualSeq=0;x.visualEvents=[];x.players.forEach(p=>p.name='');return E.serializeGame(x);};
      return strip(copy)===strip(rebuilt)?JSON.parse(JSON.stringify(record)):null;
    }catch(_){return null;}
  }
  const puzzles=[
    {id:'shield',name:'无敌挡灼烧',tag:'生存',desc:'只剩 1 血，小烈焰的 2 点灼烧即将结算。用这一手活下来。',hint:'无敌挡下一段伤害，触发后回复 2 血。',setup(g){g.players[0].skill=5;g.players[0].hp=1;g.players[0].delayed=[{owner:1,dmg:2,desc:'小烈焰',noBonus:true}];},goal:g=>!g.over&&g.players[0].hp===3&&!g.players[0].wudi&&g.players[0].delayed.length===0},
    {id:'cleanse',name:'净化的两步',tag:'毒伤',desc:'灼烧、淬毒与七步同时存在。先清除延迟伤害，让七步降为第二阶段。',hint:'净化清空延迟伤害；七步需要两次净化才能解除。',setup(g){g.players[0].skill=0;g.players[0].hp=10;g.players[0].qibu={stage:1,owner:1};g.players[0].delayed=[{owner:1,dmg:2,desc:'小烈焰',noBonus:true},{owner:1,dmg:1,desc:'淬毒',noBonus:true}];},goal:g=>!g.over&&g.players[0].qibu.stage===2&&!g.players[0].delayed.length},
    {id:'chain',name:'连携到七',tag:'数字连携',desc:'对手有 3 层双倍圣水。从「一」开始连携到 7，一次去除 2 层。',hint:'先释放数字技能「一」，再加对手的 6，最后使用公平正义。',setup(g){g.players[0].skill=1;g.players[1].skill=6;g.players[1].shuangbei=3;},goal:g=>g.players[1].shuangbei===1},
    {id:'ordinary',name:'相加的边界',tag:'规则辨析',desc:'普通相加也能到 7，但没有数字连携。用公平正义去除对手 1 层圣水。',hint:'普通 1 + 6 不会触发去除 2 层；必须先使用数字技能。',setup(g){g.step='awaitAdd';g.players[0].skill=1;g.players[1].skill=6;g.players[1].shuangbei=3;},goal:g=>g.players[1].shuangbei===2},
    {id:'reflect',name:'反弹后的生机',tag:'结算顺序',desc:'你只剩 4 血，对手有荆棘。使用元毒九泉，检验反弹与回血的完整结算。',hint:'元毒九泉的伤害、回血和费用属于同一次技能结算。',setup(g){g.players[0].skill=9;g.players[0].hp=4;g.players[1].hp=30;g.players[1].jingji=true;},goal:g=>!g.over&&g.players[0].hp===2&&g.players[1].hp===20},
    {id:'dummy',name:'识破备用假人',tag:'假人',desc:'对手储备了多具假人。清空这些备用假人，保留对手本体以观察效果。',hint:'识破可以清空备用假人；若对手有无敌，清除和伤害都会被挡。',setup(g){g.players[0].skill=9;g.players[1].dummy={alive:true,hp:10,castBefore:true,reserve:[10,10]};},goal:g=>!g.over&&!g.players[1].dummy.alive&&!g.players[1].dummy.reserve.length}
  ];
  function puzzleGame(id){const puzzle=puzzles.find(p=>p.id===id);if(!puzzle)throw Error('练习不存在');const g=E.createGame(['你','练习对手']);g.turn=0;g.players[0].hp=20;g.players[1].hp=21;g.phase='banning';E.submitBan(g,0,'jiubaK');E.submitBan(g,1,'jiubaK');g.step='awaitAction';g.players[0].energy=11;puzzle.setup(g);g.log=['机制练习 · '+puzzle.name];g.visualEvents=[];return g;}
  const api={KEY,LIMIT,actor,clone,append,frames,read,importRecords,archive,resume,actionName,puzzles,puzzleGame};
  if(browser)window.__TWStudy=api;else module.exports=api;
})();
