'use strict';
(()=>{
  const $=s=>document.querySelector(s),C=window.__TWStudy,E=window.__TW_engine,R=window.__TWReplay,S=window.__TW_skills,A=window.__TWAI;
  let tab='replay',entries=[],selected=null,frames=[],index=0,game=null,puzzle=null,base=null,branch=false,history=[],advice=null,worker=null,generation=0,playTimer=null,toastTimer=null;
  const progressKey='tangwu_practice_v1';let progress={};try{const saved=JSON.parse(localStorage.getItem(progressKey));if(saved&&typeof saved==='object'&&!Array.isArray(saved))progress=saved;}catch(_){}
  const workerURL=new URL('study-worker.js',document.currentScript.src);
  function toast(message){$('#studio-toast').textContent=message;$('#studio-toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#studio-toast').classList.add('hidden'),3200);}
  function stopPlay(){clearTimeout(playTimer);playTimer=null;$('#replay-play').textContent='播放';$('#replay-play').setAttribute('aria-pressed','false');}
  function cancelSearch(){generation++;worker?.terminate();worker=null;advice=null;$('#analysis-result').textContent='';$('#search-status').textContent='待分析';$('#apply-advice').hidden=true;$('#analyze-position').disabled=!game||game.over;}
  function loadLibrary(){entries=C.read(localStorage);$('#saved-count').textContent=entries.length;$('#practice-count').textContent=`${C.puzzles.filter(p=>progress[p.id]).length} / ${C.puzzles.length}`;}
  function renderList(){
    $('#library-title').textContent=tab==='replay'?'我的棋谱':'机制挑战';$('#library-count').textContent=tab==='replay'?`${entries.length} 局`:`${C.puzzles.length} 题`;$('#import-tools').hidden=tab!=='replay';
    const items=tab==='replay'?[...entries].reverse():C.puzzles;
    $('#studio-list').innerHTML=items.map((entry,i)=>{
      const id=tab==='replay'?entry.record.id:entry.id,on=tab==='replay'?selected?.record.id===id:puzzle?.id===id;
      const title=tab==='replay'?`${entry.record.winner===-1?'平局':entry.record.winner===0?'你获胜':'对手获胜'} · ${entry.record.actions.length} 步`:entry.name;
      const detail=tab==='replay'?`${new Date(entry.finishedAt).toLocaleDateString('zh-CN')} · 规则 v${entry.record.rulesVersion||1}`:entry.tag;
      return `<button class="study-item" data-item="${esc(id)}" aria-pressed="${on}"><strong>${esc(title)}${tab==='practice'&&progress[id]?'<span class="done">✓</span>':''}</strong><small>${esc(detail)}</small></button>`;
    }).join('')||'<p class="library-empty">还没有完整棋谱。完成一局对战，或导入 JSON；已有训练对局可直接读取。</p>';
  }
  function mode(next){stopPlay();cancelSearch();TW_FX.reset();tab=next;branch=false;history=[];puzzle=null;game=null;base=null;selected=null;frames=[];index=0;$('#auto-opponent').checked=false;
    $('#tab-replay').setAttribute('aria-selected',String(tab==='replay'));$('#tab-practice').setAttribute('aria-selected',String(tab==='practice'));$('#studio-workspace').setAttribute('aria-labelledby','tab-'+tab);renderList();
    if(tab==='practice')choosePuzzle(C.puzzles[0].id);else if(entries.length)chooseRecord(entries.at(-1).record.id);else render();
  }
  function chooseRecord(id){stopPlay();cancelSearch();TW_FX.reset();const entry=entries.find(e=>e.record.id===id);if(!entry)return;try{frames=C.frames(entry.record);selected=entry;puzzle=null;branch=false;seek(0);renderList();}catch(error){toast('棋谱无法验证：'+error.message);}}
  function choosePuzzle(id){stopPlay();cancelSearch();TW_FX.reset();puzzle=C.puzzles.find(p=>p.id===id);game=C.puzzleGame(id);base=E.serializeGame(game);history=[];branch=false;selected=null;$('#auto-opponent').checked=false;render();renderList();TW_FX.sync(game,[$('#study-p0'),$('#study-p1')],S.SKILLS);window.TWMotion?.develop($('#study-players'),{duration:280});}
  function seek(next){if(!frames.length)return;stopPlay();cancelSearch();TW_FX.reset();index=Math.max(0,Math.min(frames.length-1,next));game=E.deserializeGame(frames[index].game);branch=false;history=[];render();}
  function drawPlayers(){
    if(!game){$('#study-players').innerHTML='';return;}
    const state=E.publicState(game,0),who=C.actor(game);
    $('#study-players').innerHTML=state.players.map((p,i)=>`<article id="study-p${i}" class="study-player${!game.over&&i===game.turn?' current':''}" aria-label="${esc(p.name)}状态"><div class="player-top"><b>${esc(p.name)}</b><span>${game.over?'对局结束':i===who?'当前行动':''}</span></div><div class="study-hand">${handSVG(p.skill)}<div class="study-meters"><div><b>${p.hp}</b><small>生命</small></div><div><b>${p.energy}</b><small>费用</small></div></div></div><div class="study-buffs">${p.buffs.map(buff=>`<span title="${esc(buff.detail)}">${esc(buff.name)}${buff.detail?' · '+esc(buff.detail):''}</span>`).join('')||'<span>无持续状态</span>'}</div></article>`).join('');
    const danger=[];game.players.forEach(p=>{const parts=p.delayed.map(d=>`${d.desc} ${d.dmg} 伤`);if(p.qibu.stage)parts.push(`七步 ${p.qibu.stage===1?3:2} 伤`);if(parts.length)danger.push(`${p.name}的回合结束待结算：${parts.join('、')}${p.wudi?'；无敌仅抵挡下一段伤害':''}`);if(p.duming.active)danger.push(`${p.name}的赌命剩余 ${p.duming.turnsLeft} 个自身回合`);});$('#study-danger').hidden=!danger.length;$('#study-danger').textContent=danger.join('。');
  }
  function drawControls(){
    const el=$('#practice-controls');el.innerHTML='';$('#practice-outcome').textContent='';if(!game||!base)return;
    if(game.over){$('#practice-outcome').textContent=game.endReason?.text||'对局结束';return;}
    const legal=A.legalActions(game),p=game.players[game.turn],o=game.players[1-game.turn];
    if(game.step==='awaitAdd')el.innerHTML=addChoicesHTML(p,o,S.SKILLS,game.banned);
    else el.innerHTML='<div class="skills-grid">'+S.SKILLS[p.skill].map((sk,i)=>skillCardHTML(sk,p.skill,legal.some(a=>a.type==='act'&&a.skillIdx===i),`data-act="${i}"`)).join('')+'</div><button class="ghost" data-pass="true">结束回合</button>';
    if(TW_FX.busy()||worker&&$('#auto-opponent').checked&&C.actor(game)===1)el.querySelectorAll('button').forEach(button=>button.disabled=true);
    if(puzzle&&puzzle.goal(game)){
      $('#practice-outcome').textContent='挑战完成 · '+puzzle.hint;
      if(!progress[puzzle.id]){progress[puzzle.id]=Date.now();try{localStorage.setItem(progressKey,JSON.stringify(progress));}catch(_){toast('挑战完成，但本机存储不可用');}loadLibrary();renderList();}
    }
  }
  function render(){
    const practicing=!!base&&(tab==='practice'||branch),has=!!game;
    $('#study-empty').hidden=has;$('#replay-tools').hidden=!has||practicing;$('#practice-tools').hidden=!practicing;$('#branch-return').hidden=!branch;
    $('#board-kicker').textContent=puzzle?'机制挑战':branch?'分支演练 · 原棋谱保留':has?`棋谱复盘 · 规则 v${game.rulesVersion}`:'等待选择';
    $('#board-title').textContent=puzzle?puzzle.name:has?(branch?`从第 ${index} 步重新开始`:frames[index]?.label||'棋谱复盘'):'选择一份棋谱';
    $('#board-description').textContent=puzzle?puzzle.desc:branch?'尝试其他合法行动，观察完整结算。撤回与重置只改变当前演练。':has?`双方禁用：${game.banned.map(id=>Object.values(S.SKILLS).flat().find(sk=>sk.id===id)?.name||id).join(' / ')}。${game.rulesVersion<3?'这份棋谱按当时的旧规则回放。':''}`:'完成一局本地对战后，棋谱会自动出现在这里。也可以导入已有对局，或先尝试机制挑战。';
    $('#board-status').textContent=practicing?'演练':has&&game.over?'结局':'复盘';drawPlayers();
    $('#analyze-position').disabled=!has||game.over||!!worker;$('#export-record').disabled=!selected;$('#practice-undo').disabled=!history.length;
    $('#branch-start').disabled=!has||game.over;$('#practice-hint').textContent=puzzle?puzzle.hint:'← → 逐步切换，Home / End 跳到开局与结局。Ctrl / ⌘ K 搜索技能与功能。';
    if(has&&!practicing){
      $('#step-label').textContent=frames[index].label;$('#step-position').textContent=`${index} / ${frames.length-1}`;$('#replay-seek').max=frames.length-1;$('#replay-seek').value=index;
      $('#step-prev').disabled=index===0;$('#step-next').disabled=index===frames.length-1;
      $('#tactical-track').innerHTML=frames.map((f,i)=>`<button class="track-dot" data-step="${i}" data-actor="${f.actor}" aria-label="第 ${i} 步：${esc(f.label)}" ${i===index?'aria-current="step"':''} title="${i} · ${esc(f.label)}"></button>`).join('');
      const current=$('#tactical-track [aria-current]');if(current){const track=$('#tactical-track');if(current.offsetLeft<track.scrollLeft||current.offsetLeft>track.scrollLeft+track.clientWidth-28)track.scrollLeft=current.offsetLeft-track.clientWidth/2;}
    }
    const logs=!has?[]:practicing?game.log:frames[index].logs;
    $('#step-logs').innerHTML=logs.map(log=>`<p>${esc(log)}</p>`).join('')||'<p>当前还没有新的结算日志。</p>';
    $('#step-actor').textContent=has?(practicing?game.players[C.actor(game)].name:game.players[frames[index].actor].name):'';
    $('#step-deltas').innerHTML='';if(has&&!practicing&&index>0){const previous=E.deserializeGame(frames[index-1].game);$('#step-deltas').innerHTML=game.players.map((p,i)=>{const hp=p.hp-previous.players[i].hp,en=p.energy-previous.players[i].energy;return `<p class="step-delta">${esc(p.name)}<b>生命 ${hp>=0?'+':''}${hp} · 费用 ${en>=0?'+':''}${en}</b></p>`;}).join('');}
    drawControls();
    const marker=$('#tactical-track [aria-current]');if(marker&&window.TWMotion){const motion=TWMotion.spring({value:.65,preset:'snap',onUpdate:value=>{if(marker.isConnected)marker.style.opacity=value;}});motion.to(1);}
  }
  function branchStart(){if(!game||game.over)return;stopPlay();cancelSearch();TW_FX.reset();branch=true;puzzle=null;base=E.serializeGame(game);history=[];$('#auto-opponent').checked=false;game.log=['从棋谱第 '+index+' 步开始演练'];render();TW_FX.sync(game,[$('#study-p0'),$('#study-p1')],S.SKILLS);window.TWMotion?.develop($('#study-players'),{duration:280});}
  function act(a){
    if(!game||!base||game.over||TW_FX.busy())return;
    cancelSearch();const before=E.serializeGame(game),label=C.actionName(game,a);const result=R.perform(game,a,null);if(result?.err){toast(result.err);return;}
    history.push(before);render();$('#board-title').textContent=label;TW_FX.sync(game,[$('#study-p0'),$('#study-p1')],S.SKILLS);
    const expected=game,revision=generation;TW_FX.whenIdle().then(()=>{if(game!==expected||revision!==generation)return;drawControls();autoReply();});
  }
  function analyze(automatic=false){
    if(!game||game.over)return;cancelSearch();const id=generation,expected=game,snapshot=E.serializeGame(game);$('#search-status').textContent='推演中…';$('#analyze-position').disabled=true;
    try{worker=new Worker(workerURL);worker.onmessage=({data})=>{
      if(id!==generation||game!==expected||data.id!==id)return;worker.terminate();worker=null;
      if(data.error){$('#search-status').textContent='分析失败';toast(data.error);render();return;}
      advice=data.analysis?.action||null;$('#search-status').textContent='分析完成';$('#analyze-position').disabled=game.over;
      $('#analysis-result').innerHTML=advice?`<strong>${esc(C.actionName(game,advice))}</strong><span>${data.analysis.provenWin?'搜索找到可验证的获胜路线。':'限时搜索建议，可在演练中检验。'}<br>深度 ${data.analysis.depth||0} · ${data.analysis.nodes||0} 个节点 · ${data.analysis.elapsedMs||0} ms</span>`:'当前没有可分析的行动。';
      $('#apply-advice').hidden=!advice||!base;
      if(automatic&&advice&&$('#auto-opponent').checked&&C.actor(game)===1)act(advice);else drawControls();
    };worker.onerror=event=>{event.preventDefault();if(id!==generation)return;worker?.terminate();worker=null;$('#search-status').textContent='分析不可用';$('#analyze-position').disabled=false;toast('当前环境无法启动搜索，请手动演练或使用安装版。');drawControls();};worker.postMessage({id,game:snapshot,actor:C.actor(game),budget:800});drawControls();}
    catch(_){worker=null;$('#search-status').textContent='分析不可用';$('#analyze-position').disabled=false;toast('无法启动搜索，请手动演练。');}
  }
  function autoReply(){if(base&&!game.over&&$('#auto-opponent').checked&&C.actor(game)===1&&!TW_FX.busy())analyze(true);}
  function importPayload(payload){const count=C.importRecords(payload,localStorage);loadLibrary();mode('replay');toast(`已导入 ${count} 局棋谱${count===0?'，重复棋谱已跳过':''}`);}
  $('#tab-replay').onclick=()=>mode('replay');$('#tab-practice').onclick=()=>mode('practice');$('#empty-practice').onclick=()=>mode('practice');
  [$('#tab-replay'),$('#tab-practice')].forEach(button=>button.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const other=button.id==='tab-replay'?$('#tab-practice'):$('#tab-replay');other.click();other.focus();}}));
  $('#studio-list').onclick=e=>{const item=e.target.closest('[data-item]');if(item)tab==='practice'?choosePuzzle(item.dataset.item):chooseRecord(item.dataset.item);};
  $('#replay-seek').oninput=e=>seek(Number(e.target.value));$('#step-prev').onclick=()=>seek(index-1);$('#step-next').onclick=()=>seek(index+1);$('#tactical-track').onclick=e=>{const dot=e.target.closest('[data-step]');if(dot)seek(Number(dot.dataset.step));};
  function playNext(){if(index>=frames.length-1){stopPlay();return;}const next=index+1;seek(next);$('#replay-play').textContent='暂停';$('#replay-play').setAttribute('aria-pressed','true');playTimer=setTimeout(playNext,900/Number($('#replay-speed').value));}
  $('#replay-play').onclick=()=>{if(playTimer){stopPlay();return;}if(index===frames.length-1)seek(0);$('#replay-play').textContent='暂停';$('#replay-play').setAttribute('aria-pressed','true');playTimer=setTimeout(playNext,900/Number($('#replay-speed').value));};
  $('#branch-start').onclick=branchStart;$('#branch-return').onclick=()=>{base=null;seek(index);};
  $('#practice-reset').onclick=()=>{cancelSearch();TW_FX.reset();game=E.deserializeGame(base);history=[];render();TW_FX.sync(game,[$('#study-p0'),$('#study-p1')],S.SKILLS);};
  $('#practice-undo').onclick=()=>{if(!history.length)return;cancelSearch();TW_FX.reset();game=E.deserializeGame(history.pop());render();TW_FX.sync(game,[$('#study-p0'),$('#study-p1')],S.SKILLS);};
  $('#auto-opponent').onchange=()=>{cancelSearch();autoReply();};
  $('#practice-controls').onclick=e=>{const button=e.target.closest('button');if(!button||button.disabled)return;if(button.dataset.add!==undefined)act({type:'add',choice:Number(button.dataset.add)});else if(button.dataset.pass)act({type:'pass'});else if(button.dataset.act!==undefined){const skillIdx=Number(button.dataset.act),sk=S.SKILLS[game.players[game.turn].skill][skillIdx];if(sk.id==='gongping'){const choices=A.legalActions(game).filter(a=>a.type==='act'&&a.skillIdx===skillIdx);if(choices.length>1){$('#practice-controls').innerHTML='<p>选择去除的正面状态</p><div class="buff-options">'+choices.map(a=>`<button class="ghost" data-buff="${a.buffIdx}" data-skill-index="${skillIdx}">${esc(S.positiveBuffs(game.players[1-game.turn])[a.buffIdx]?.name||'状态')}</button>`).join('')+'</div><button class="ghost" data-cancel="true">返回技能</button>';return;}act(choices[0]||{type:'act',skillIdx});}else act({type:'act',skillIdx});}else if(button.dataset.buff!==undefined)act({type:'act',skillIdx:Number(button.dataset.skillIndex),buffIdx:Number(button.dataset.buff)});else if(button.dataset.cancel)drawControls();};
  $('#analyze-position').onclick=()=>analyze();$('#apply-advice').onclick=()=>{if(advice)act(advice);};
  $('#import-file').onclick=()=>$('#record-file').click();$('#record-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>6*1024*1024)throw Error('文件超过 6 MB');importPayload(JSON.parse(await file.text()));}catch(error){toast('导入失败：'+error.message);}e.target.value='';};
  $('#import-records').onclick=async()=>{const button=$('#import-records');button.disabled=true;try{
    let payload;if(window.TWStudioImport)payload=await TWStudioImport.readRecords();else if(window.TWDesktopTraining)payload=await TWDesktopTraining.request({op:'export'});else{const identity=localStorage.getItem('tangwu_training_identity_v1');if(!identity)throw Error('当前浏览器没有收录记录，请导入棋谱 JSON');const response=await fetch('/api/training',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op:'export',identity})});if(!response.ok)throw Error('读取失败，请稍后重试');payload=await response.json();}
    if(!payload?.ok)throw Error(payload?.err||'读取失败');if(!payload.records?.length)throw Error('还没有已收录的完整对局');importPayload(payload);
  }catch(error){toast(error.message);}finally{button.disabled=false;}};
  $('#export-record').onclick=()=>{if(!selected)return;const content=JSON.stringify({version:1,records:[R.clean(selected.record)]},null,2);if(window.TWDesktopTraining?.export){TWDesktopTraining.export(content,'tangwu-replay.json');return;}const url=URL.createObjectURL(new Blob([content],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='tangwu-replay.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  document.addEventListener('keydown',e=>{if(tab!=='replay'||branch||!frames.length||e.ctrlKey||e.metaKey||e.altKey||/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)||document.querySelector('dialog[open]'))return;const next={ArrowLeft:index-1,ArrowRight:index+1,Home:0,End:frames.length-1}[e.key];if(next!==undefined){e.preventDefault();seek(next);}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){stopPlay();cancelSearch();}});window.addEventListener('pagehide',()=>{stopPlay();cancelSearch();});window.addEventListener('tw:fx-busy',()=>{if(base)drawControls();});
  loadLibrary();const params=new URLSearchParams(location.search);mode(params.get('tab')==='practice'?'practice':'replay');if(params.get('record'))chooseRecord(params.get('record'));
})();
