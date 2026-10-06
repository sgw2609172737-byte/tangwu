'use strict';
(()=>{
  const KEY='tangwu_training_identity_v1',PREF='tangwu_training_enabled_v1',PENDING='tangwu_training_pending_v1';
  const online=/^https?:$/.test(location.protocol);
  let enabled=false,identity='',last=Promise.resolve(),count=0;
  try {enabled=localStorage.getItem(PREF)==='1';identity=localStorage.getItem(KEY)||'';}catch(_){}
  const panel=document.createElement('details');panel.className='training-panel';
  panel.innerHTML='<summary>与 AI 一起进步</summary><label class="training-choice"><input id="training-enabled" type="checkbox">让我的人机对局参与训练</label><p class="training-help">记录完整的游戏行动与胜负，不记录昵称。训练按批次进行，新模型通过验证后才会上线；认输和中断不计入样本。</p><p id="training-status" role="status"></p><div class="training-actions"><button id="training-export" class="ghost">导出对局</button><button id="training-connect" class="ghost">连接本机训练</button><button id="training-copy" class="ghost">复制连接</button></div><p class="training-help">云端保留最近 50 局；训练身份保存在当前浏览器。关闭开关会停止接收新记录。</p>';
  const anchor=document.querySelector('#panel-ai')||document.querySelector('#btn-start')?.parentElement;
  if(!anchor)return;anchor.append(panel);
  const checkbox=panel.querySelector('#training-enabled'),status=panel.querySelector('#training-status');checkbox.checked=enabled;
  const live=document.createElement('p');live.id='training-live';live.className='training-live hidden';live.setAttribute('role','status');document.querySelector('#turn-banner')?.insertAdjacentElement('afterend',live);
  function stored(){try{return JSON.parse(localStorage.getItem(PENDING)||'[]');}catch(_){return [];}}
  function savePending(records){localStorage.setItem(PENDING,JSON.stringify(records.slice(-5)));}
  function show(message){status.textContent=message||(!enabled?'未开启，本局不会用于训练。':online?`已开启 · 云端已收录 ${count} 局，等待批次训练。`:`离线记录保存在本机 · ${stored().length} 局，可导出用于训练。`);}
  async function call(op,extra={}) {
    const response=await fetch('/api/training',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op,identity,...extra}),signal:AbortSignal.timeout(10000)});
    const data=await response.json();if(!response.ok||!data.ok)throw Object.assign(Error(data.err||'训练记录连接失败'),{code:response.status});
    if(data.identity){identity=data.identity;localStorage.setItem(KEY,identity);}if(Number.isFinite(data.count))count=data.count;return data;
  }
  async function configure(){
    if(!online){if(enabled&&!identity){identity=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');localStorage.setItem(KEY,identity);}show();return;}
    if(!identity&&!enabled){show();return;}
    await call('profile',{enabled});show();if(enabled)await retry();
  }
  function startConfigure(){last=last.catch(()=>{}).then(configure).catch(e=>show(e.message));return last;}
  checkbox.onchange=()=>{enabled=checkbox.checked;try{localStorage.setItem(PREF,enabled?'1':'0');}catch(_){}startConfigure();};
  function download(data,name){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function retry(){
    if(!online||!enabled||!identity)return;
    for(const record of stored()){
      try {const result=await call('record',{record});if(result.accepted)savePending(stored().filter(r=>r.id!==record.id));}
      catch(e){if(e.code===400)savePending(stored().filter(r=>r.id!==record.id));else throw e;}
    }show();
  }
  async function submit(record){
    if(!record||!enabled)return;
    try {if(!stored().some(r=>r.id===record.id))savePending([...stored(),record]);
      if(online){await last;await retry();live.textContent=stored().some(r=>r.id===record.id)?'记录待上传，请确认参与开关已开启。':'本局已收录，等待批次训练。';}
      else{show();live.textContent='本局已保存在本机，可导出参与训练。';}}
    catch(e){show('记录已暂存在本机，稍后重试上传。');live.textContent='本局记录待上传。';}
  }
  panel.querySelector('#training-export').onclick=async()=>{
    try {await last;let cloud=[];if(online&&identity){try{cloud=(await call('export')).records;}catch(e){if(!stored().length)throw e;}}
      const records=[...new Map([...stored(),...cloud].map(r=>[r.id,r])).values()];
      download({version:1,records},'tangwu-human-games.json');show(`已导出 ${records.length} 局。`);}
    catch(e){show(e.message);}
  };
  panel.querySelector('#training-connect').onclick=async()=>{
    await last;if(!online||!enabled||!identity){show('请先在网页版开启参与训练。');return;}
    download({version:1,site:location.origin,identity},'tangwu-training-link.json');show('正在下载连接文件；若未保存，可用“复制连接”。连接只用于本机训练。');
  };
  panel.querySelector('#training-copy').onclick=async()=>{
    await last;if(!online||!enabled||!identity){show('请先在网页版开启参与训练。');return;}
    try{await navigator.clipboard.writeText(JSON.stringify({version:1,site:location.origin,identity}));show('连接已复制，可保存为本机训练连接文件。请勿公开分享。');}
    catch(_){show('浏览器未允许复制，请使用连接文件下载。');}
  };
  async function participant(){if(!enabled)return null;await last;return identity||null;}
  function active(record,over=false){live.classList.toggle('hidden',!record);if(record&&!over)live.textContent='本局参与训练 · 完整结束后保存为样本。';}
  const roomSeen=new Set();
  function room(state){live.classList.toggle('hidden',!state?.ai||!state.training?.enabled);if(!state?.ai||!state.training?.enabled)return;
    live.textContent={collected:'本局已收录，等待批次训练。',pending:'记录已暂存，下一局会继续尝试保存。',disabled:'参与训练已关闭。',skipped:'本局记录不完整，未加入训练。','next-game':'将从下一局开始记录。',recording:'本局参与训练 · 完整结束后保存为样本。'}[state.training.status]||'';
    if(state.over&&state.training.status==='collected'&&!roomSeen.has(state.roomCode)){roomSeen.add(state.roomCode);call('profile').then(()=>show()).catch(()=>{});}}
  window.TWTraining={participant,enabled:()=>enabled,submit,active,room,ready:()=>last};
  show();if(enabled)startConfigure();
})();
