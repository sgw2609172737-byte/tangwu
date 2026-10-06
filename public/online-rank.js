'use strict';
(() => {
  const ID_KEY='tangwu_online_rank_identity_v1';
  let identity='';try {identity=localStorage.getItem(ID_KEY) || '';} catch(_) {}
  let timer=null,busy=false,queued=false;
  async function call(op) {
    const d=await api('/api/ranked',{op,identity,name:$('#name-input').value.trim() || me.name || '玩家'});
    identity=d.identity;localStorage.setItem(ID_KEY,identity);return d;
  }
  function show(d) {
    const p=d.profile;
    $('#online-rank-profile').innerHTML=TW_RankUI.summary(p,'服务器 · 真人排位')+TW_RankUI.history(p);
    $('#rank-leaderboard').innerHTML=d.leaderboard.length?'<ol>'+d.leaderboard.map(p=>`<li>${esc(p.name)} · ${esc(p.rank.name)}<strong>${p.rating}</strong></li>`).join('')+'</ol>':'<p>还没有完成的真人排位。</p>';
    queued=d.queued;
    $('#btn-rank-queue').disabled=queued;$('#btn-rank-cancel').classList.toggle('hidden',!queued);
    $('#rank-queue-status').textContent=queued?`正在寻找积分相近的对手 · 已等待 ${Math.floor(d.waitedMs/1000)} 秒`:'准备好后开始匹配。';
    if(d.session) {clearTimeout(timer);timer=null;queued=false;setMe(d.session);return;}
    clearTimeout(timer);if(queued) timer=setTimeout(()=>refresh('status'),1800);
  }
  async function refresh(op='profile') {
    if(busy) return;busy=true;
    try {show(await call(op));}
    catch(e) {
      $('#rank-queue-status').textContent=e.message;
      if(queued) timer=setTimeout(()=>refresh('status'),2500);
    } finally {busy=false;}
  }
  function requeue() {
    clearSession();refresh('queue');$('#entry-rank').click();
  }
  $('#entry-rank').addEventListener('click',()=>{if(!queued) refresh();});
  $('#btn-rank-queue').onclick=()=>{if(!$('#name-input').value.trim()) {$('#rank-queue-status').textContent='请先填写昵称';return;} refresh('queue');};
  $('#btn-rank-cancel').onclick=()=>refresh('cancel');
  // Cancel queued matching before another game; a just-matched ticket opens its actual match.
  for(const id of ['btn-create','btn-create-ai','btn-join']) {
    $('#'+id).addEventListener('click',async event=>{
      if(!queued) return;event.stopImmediatePropagation();
      const button=event.currentTarget;clearTimeout(timer);await refresh('cancel');
      if(!me.ranked && !queued) button.click();
    },true);
  }
  window.addEventListener('pagehide',()=>clearTimeout(timer));
  window.TW_OnlineRank={refresh,requeue};
})();
