'use strict';
// 战斗演出只消费引擎事件，不延迟操作、不参与结算、不解析玩家昵称或日志文字。
window.TW_FX = (() => {
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let userReduced = false;
  try { userReduced = localStorage.getItem('tangwu_motion') === 'reduced'; } catch (e) {}
  let ready = false, lastSeq = 0, timer = null, queue = [], layer, button, chosen = null;
  let cards = [], catalog = {}, previousPlayers = null, previousChain = 0;
  const colors = { impact: '#efae84', fire: '#ffac60', frost: '#a3e1f4', heal: '#89e4b4', shield: '#98cfff',
    poison: '#b4dd80', energy: '#edc58a', control: '#c5a7f2', summon: '#9fe4d6', digit: '#a3bcff', sniper: '#ffd997' };
  const special = { quan:'impact', xiaolieyan:'fire', hanfeng:'frost', bing:'frost', jiubaK:'sniper',
    cuidu:'poison', qibu:'poison', yuandu:'poison', jingji:'shield', wudi:'shield' };
  const typeFor = (id) => special[id] || ({ attack:'impact', heal:'heal', defense:'shield', energy:'energy', control:'control',
    summon:'summon', digit:'digit', special:'control' }[(SKILL_ART[id] || SKILL_ART._def).theme]);
  const reduced = () => userReduced || media.matches;
  function ensureLayer() {
    if (!layer) { layer = document.createElement('div'); layer.id = 'battle-fx'; layer.setAttribute('aria-hidden','true'); document.body.appendChild(layer); }
    return layer;
  }
  function clear() {
    clearTimeout(timer); timer = null; queue = [];
    if (layer) { layer.getAnimations({ subtree: true }).forEach((a) => a.cancel()); layer.replaceChildren(); }
  }
  function refresh() {
    document.documentElement.dataset.motion = reduced() ? 'reduced' : 'full';
    if (button) {
      button.textContent = reduced() ? '动画：少' : '动画：全';
      button.setAttribute('aria-pressed', String(reduced()));
      button.title = media.matches ? '系统已启用减少动画' : '切换完整 / 减少动画';
      button.disabled = media.matches;
    }
    if (reduced()) clear();
  }
  const point = (el) => { const r = el.getBoundingClientRect(); return { x:r.left+r.width/2, y:r.top+r.height/2, width:r.width }; };
  function element(className, x, y, content = '') {
    const el = document.createElement('div'); el.className = className;
    el.style.left = x + 'px'; el.style.top = y + 'px'; el.innerHTML = content;
    ensureLayer().appendChild(el); return el;
  }
  function animate(el, frames, options) {
    el.animate(frames, { fill:'forwards', easing:'cubic-bezier(.2,.7,.3,1)', ...options }).finished.then(() => el.remove(), () => el.remove());
  }
  function burst(type, at, duration) {
    const size = Math.min(180, at.width * .8);
    const core = element(`effect-burst effect-${type}`, at.x, at.y,
      '<div class="effect-ring"></div><div class="effect-core"></div>' + Array.from({length:12},(_,i)=>`<i class="effect-particle" style="--angle:${i*30}deg;--travel:${size*.43}px;--delay:${i%3*25}ms"></i>`).join(''));
    core.style.setProperty('--fx-color',colors[type]); core.style.setProperty('--fx-duration',duration+'ms');
    core.style.width = core.style.height = size+'px';
    animate(core,[{opacity:0,transform:'translate(-50%,-50%) scale(.65)'},{opacity:1,offset:.18,transform:'translate(-50%,-50%) scale(1)'},{opacity:0,transform:'translate(-50%,-50%) scale(1.2)'}],{duration});
  }
  function play(event) {
    if (reduced() || document.hidden || !cards[event.source]?.isConnected || document.querySelector('.modal:not(.hidden):not(#result-modal)')) return;
    const source = point(cards[event.source]);
    if (source.y < -100 || source.y > innerHeight + 100) return;
    const type = typeFor(event.skillId);
    const target = point(cards[1-event.source]);
    const defensive = ['heal','energy','shield','summon','digit'].includes(type);
    const at = event.kind === 'shield-break' || defensive ? source : target;
    if (event.kind === 'shield-break') { burst('shield', at, 440); const node=layer.lastElementChild; node.classList.add('effect-shatter'); return; }
    const duration = event.combo ? 950 : 480;
    const info = Object.values(catalog).flat().find((s)=>s.id===event.skillId);
    const name = info?.name || event.skillId;
    const origin = chosen && chosen.id === event.skillId && Date.now()-chosen.time < 1800 ? chosen : source;
    chosen = null;
    const ghost = element('cast-ghost',origin.x,origin.y,(SKILL_ART[event.skillId]||SKILL_ART._def).svg);
    ghost.style.setProperty('--fx-color',colors[type]);
    animate(ghost,[{opacity:0,transform:'translate(-50%,-50%) scale(.8)'},{opacity:1,offset:.2,transform:'translate(-50%,-50%) scale(1)'},
      {opacity:0,transform:`translate(calc(-50% + ${at.x-origin.x}px),calc(-50% + ${at.y-origin.y}px)) scale(.35)`}],{duration:360});
    burst(type,at,duration);
    const label = element('cast-label',at.x,Math.max(100,at.y-66),esc(event.combo ? '98K · 连携命中' : name));
    label.style.setProperty('--fx-color',colors[type]);
    animate(label,[{opacity:0,transform:'translate(-50%,8px)'},{opacity:1,offset:.18,transform:'translate(-50%,0)'},{opacity:1,offset:.65},{opacity:0,transform:'translate(-50%,-15px)'}],{duration});
    if (type === 'sniper') {
      const sight = element('sniper-sight',at.x,at.y,'<i></i><b></b>');
      animate(sight,[{opacity:0,transform:'translate(-50%,-50%) scale(1.8) rotate(-25deg)'},{opacity:1,offset:.35,transform:'translate(-50%,-50%) scale(1) rotate(0)'},{opacity:0,transform:'translate(-50%,-50%) scale(.95)'}],{duration});
      const trail = element('shot-trail',source.x,source.y);
      const dx=at.x-source.x,dy=at.y-source.y;
      trail.style.width = Math.hypot(dx,dy)+'px'; trail.style.transform = `rotate(${Math.atan2(dy,dx)}rad)`;
      animate(trail,[{opacity:0},{opacity:1,offset:.35},{opacity:0}],{duration:380});
      if (event.combo) {
        const banner = element('ultimate-banner',innerWidth/2,Math.min(innerHeight*.27,260),'<small>数字连携</small><strong>98K</strong><span>连携命中</span>');
        animate(banner,[{opacity:0,transform:'translate(-50%,-50%) scale(.88)'},{opacity:1,offset:.16,transform:'translate(-50%,-50%) scale(1)'},{opacity:1,offset:.7},{opacity:0,transform:'translate(-50%,-55%) scale(1.04)'}],{duration:950});
      }
    }
  }
  function drain() {
    timer = null;
    const event=queue.shift(); if (event) play(event);
    if (queue.length) timer=setTimeout(drain,140);
  }
  function sync(state, playerCards, skillCatalog) {
    cards=playerCards; catalog=skillCatalog;
    if (state.players) {
      state.players.forEach((p,i)=>{
        if (!reduced() && previousPlayers && cards[i]) {
          const old=previousPlayers[i];
          const fill=cards[i].querySelector('.hp-fill');
          if (fill && old.hp !== p.hp) {
            const width=(hp)=>Math.max(0,Math.min(100,hp/Math.max(21,hp)*100))+'%';
            fill.animate([{width:width(old.hp)},{width:width(p.hp)}],{duration:360,easing:'ease-out'});
          }
          if (old.energy !== p.energy) cards[i].querySelector('.energy-badge')?.animate([{transform:'scale(1)'},{transform:'scale(1.08)'},{transform:'scale(1)'}],{duration:280});
        }
      });
      previousPlayers=state.players.map((p)=>({hp:p.hp,energy:p.energy}));
    }
    const banner=document.querySelector('#turn-banner');
    if (banner) {
      banner.querySelector('.chain-indicator')?.remove();
      if (state.chainCount > 0 && !state.over) {
        const count=state.chainDigits?.size ?? state.chainDigits?.length ?? 0;
        const badge=document.createElement('span'); badge.className='chain-indicator';
        badge.textContent=`连携 ${state.chainCount} · ${count} 种`; banner.appendChild(badge);
        if (!reduced() && state.chainCount > previousChain) badge.animate([{transform:'scale(.85)',opacity:.5},{transform:'scale(1)',opacity:1}],{duration:260});
      }
    }
    previousChain=state.chainCount||0;
    const seq=state.visualSeq||0;
    // 首次加载/重连只建立基线；同一服务器状态无论轮询几次都不会重播。
    if (!ready || seq < lastSeq) { ready=true; lastSeq=seq; clear(); return; }
    const events=(state.visualEvents||[]).filter((event)=>event.seq>lastSeq);
    lastSeq=seq;
    if (reduced() || document.hidden) { clear(); return; }
    queue.push(...events); queue=queue.slice(-12);
    if (queue.length && !timer) drain();
  }
  function reset() { clear(); ready=false; lastSeq=0; chosen=null; previousPlayers=null; previousChain=0; }
  function init() {
    button=document.createElement('button'); button.className='ghost'; button.id='btn-motion';
    button.onclick=()=>{ userReduced=!userReduced; try { localStorage.setItem('tangwu_motion',userReduced?'reduced':'full'); } catch(e) {} refresh(); };
    document.querySelector('.header-btns')?.appendChild(button); refresh();
    document.addEventListener('click',(e)=>{
      const card=e.target.closest('[data-skill-id]:not(:disabled)');
      if (card && !reduced()) { chosen={...point(card),id:card.dataset.skillId,time:Date.now()}; }
    },true);
    document.addEventListener('visibilitychange',()=>{ if(document.hidden) clear(); });
    window.addEventListener('resize',clear); window.addEventListener('pagehide',reset);
    media.addEventListener('change',refresh);
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
  return { sync, reset };
})();
