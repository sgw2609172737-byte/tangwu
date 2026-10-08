'use strict';
// 演出只消费引擎事件，不参与结算。出牌演出独立开关，每张卡2秒。
window.TW_FX = (() => {
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let userReduced = false;
  try { userReduced = localStorage.getItem('tangwu_motion') === 'reduced'; } catch (e) {}
  let ready = false, lastSeq = 0, timer = null, queue = [], layer, button, chosen = null;
  let cinematic = true, castButton, active = false, idleWaiters = [];
  try { cinematic = localStorage.getItem('tangwu_card_fx') !== 'off'; } catch (_) {}
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
    setBusy(false);
  }
  function setBusy(value) {
    if (active !== value) { active=value; window.dispatchEvent(new CustomEvent('tw:fx-busy',{detail:value})); }
    if (!value) { const waiting=idleWaiters.splice(0); waiting.forEach(resolve=>resolve()); }
  }
  const whenIdle = () => active ? new Promise(resolve=>idleWaiters.push(resolve)) : Promise.resolve();
  function refresh() {
    document.documentElement.dataset.motion = reduced() ? 'reduced' : 'full';
    if (button) {
      button.textContent = reduced() ? '动画：少' : '动画：全';
      button.setAttribute('aria-pressed', String(reduced()));
      button.title = media.matches ? '系统已启用减少动画' : '切换完整 / 减少动画';
      button.disabled = media.matches;
    }
    if (reduced()) clear();
    if (castButton) {
      castButton.textContent='出牌：'+(cinematic&&!reduced()?'开':'关');
      castButton.setAttribute('aria-pressed',String(cinematic&&!reduced()));
      castButton.disabled=reduced();
      castButton.title=reduced()?'减少动画时不播放出牌演出':'切换两秒出牌演出';
    }
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
    if (reduced() || !cinematic || document.hidden || !cards[event.source]?.isConnected || document.querySelector('.modal:not(.hidden):not(#result-modal)')) return 0;
    const visiblePoint=el=>{const p=point(el);return {...p,x:Math.max(36,Math.min(innerWidth-36,p.x)),y:Math.max(100,Math.min(innerHeight-80,p.y))};};
    const source = visiblePoint(cards[event.source]);
    const type = typeFor(event.skillId);
    const target = visiblePoint(cards[1-event.source]);
    const defensive = ['heal','energy','shield','summon','digit'].includes(type);
    const at = event.kind === 'shield-break' || defensive ? source : target;
    if (event.kind === 'shield-break') { burst('shield', at, 440); layer.lastElementChild.classList.add('effect-shatter'); return 440; }
    const duration = 2000;
    const entry=Object.entries(catalog).flatMap(([digit,list])=>list.map(skill=>({...skill,digit}))).find(s=>s.id===event.skillId);
    const info = entry;
    const name = info?.name || event.skillId;
    const origin = chosen && chosen.id === event.skillId && Date.now()-chosen.time < 1800 ? chosen : source;
    chosen = null;
    const art=(SKILL_ART[event.skillId]||SKILL_ART._def).svg;
    const themes={impact:'破势',fire:'烈焰',frost:'霜封',heal:'回生',shield:'护持',poison:'毒印',energy:'蓄势',control:'控场',summon:'造物',digit:'连携',sniper:'狙击'};
    const scene=element(`cast-scene cast-kind-${type}${event.combo?' cast-ultimate':''}`,0,0,
      '<div class="cast-vignette"></div><div class="cast-orbit"><svg viewBox="0 0 400 400"><circle cx="200" cy="200" r="176"/><circle cx="200" cy="200" r="160"/><path d="M200 8V35M200 365V392M8 200H35M365 200H392"/></svg></div>'+
      `<div class="cast-face"><div class="cast-face-art">${art}</div><i class="cast-foil"></i><span class="cast-cost">${esc(String(entry?.digit??''))}<small>费用</small></span><div class="cast-face-title"><small>${esc(themes[type])}</small><strong>${esc(name)}</strong></div></div>`+
      `<div class="cast-caption"><span>${event.source===0?'红方':'蓝方'}出牌</span><strong>${esc(event.combo?'98K · 终式':name)}</strong><small>${esc(event.combo?'数字连携 · 无视防护':info?.desc||'')}</small></div>`+
      '<div class="cast-slash"></div><div class="cast-impact"><i></i><b></b></div><div class="cast-motes">'+Array.from({length:16},(_,i)=>`<i style="--angle:${i*22.5}deg;--reach:${72+(i%4)*19}px;--size:${2+(i%3)*2}px"></i>`).join('')+'</div>');
    scene.dataset.skillId=event.skillId;
    scene.style.setProperty('--fx-color',colors[type]);
    const cx=innerWidth/2,cy=Math.max(190,Math.min(innerHeight*.43,innerHeight-210));
    scene.style.setProperty('--cast-x',cx+'px');scene.style.setProperty('--cast-y',cy+'px');
    scene.style.setProperty('--hit-x',at.x+'px');scene.style.setProperty('--hit-y',at.y+'px');
    const face=scene.querySelector('.cast-face');
    const pose=(x,y,scale,rotate,tilt=0)=>`translate(-50%,-50%) translate(${x}px,${y}px) scale(${scale}) rotate(${rotate}deg) rotateY(${tilt}deg)`;
    face.animate([
      {opacity:0,transform:pose(origin.x-cx,origin.y-cy,.25,-18,-40),easing:'cubic-bezier(.15,.8,.2,1)'},
      {opacity:1,transform:pose(-8,-14,1.02,-5,-20),offset:.20},
      {opacity:1,transform:pose(0,-22,1,0,0),offset:.38},
      {opacity:1,transform:pose(0,-24,1.04,2,8),offset:.53,easing:'cubic-bezier(.5,0,.8,.3)'},
      {opacity:.92,transform:pose(at.x-cx,at.y-cy,.32,defensive?-12:22,-35),offset:.66},
      {opacity:0,transform:pose(at.x-cx,at.y-cy,.10,40,-55),offset:.75},
      {opacity:0,transform:pose(at.x-cx,at.y-cy,.10,40,-55)}
    ],{duration,fill:'forwards',easing:'linear'});
    scene.querySelector('.cast-foil').animate([{transform:'translateX(-150%) skewX(-24deg)',opacity:0},{opacity:.7,offset:.25},{opacity:.8,offset:.42},{transform:'translateX(150%) skewX(-24deg)',opacity:0,offset:.60},{opacity:0}],{duration,fill:'forwards'});
    scene.querySelector('.cast-orbit').animate([{opacity:0,transform:'translate(-50%,-50%) scale(.60) rotate(-35deg)'},{opacity:.7,transform:'translate(-50%,-50%) scale(1) rotate(0deg)',offset:.22},{opacity:.45,offset:.52},{opacity:0,transform:'translate(-50%,-50%) scale(1.3) rotate(40deg)',offset:.70},{opacity:0}],{duration,fill:'forwards'});
    scene.querySelector('.cast-caption').animate([{opacity:0,transform:'translate(-50%,18px)'},{opacity:1,transform:'translate(-50%,0)',offset:.26},{opacity:1,offset:.55},{opacity:0,transform:'translate(-50%,-8px)',offset:.74},{opacity:0}],{duration,fill:'forwards'});
    const slash=scene.querySelector('.cast-slash');
    slash.style.width=Math.max(120,Math.hypot(at.x-cx,at.y-cy))+'px';
    slash.style.rotate=Math.atan2(at.y-cy,at.x-cx)+'rad';
    slash.animate([{opacity:0,scale:'0 1'},{opacity:0,offset:.53},{opacity:.95,scale:'1 1',offset:.64},{opacity:0,scale:'1 0',offset:.75},{opacity:0}],{duration,fill:'forwards'});
    scene.querySelector('.cast-impact').animate([{opacity:0,transform:'translate(-50%,-50%) scale(.15)'},{opacity:0,offset:.62},{opacity:1,transform:'translate(-50%,-50%) scale(.40)',offset:.66},{opacity:.65,transform:'translate(-50%,-50%) scale(1.05)',offset:.78},{opacity:0,transform:'translate(-50%,-50%) scale(1.55)'}],{duration,fill:'forwards'});
    scene.querySelectorAll('.cast-motes i').forEach((mote,i)=>mote.animate([{opacity:0,transform:`rotate(${i*22.5}deg) translateX(0)`},{opacity:0,transform:`rotate(${i*22.5}deg) translateX(0)`,offset:.63},{opacity:.9,transform:`rotate(${i*22.5}deg) translateX(24px)`,offset:.69,easing:'cubic-bezier(.12,.7,.2,1)'},{opacity:0,transform:`rotate(${i*22.5}deg) translateX(${72+(i%4)*19}px)`}],{duration,fill:'forwards',easing:'linear'}));
    animate(scene,[{opacity:0},{opacity:1,offset:.08},{opacity:1,offset:.86},{opacity:0}],{duration,easing:'linear'});
    return duration;
  }
  function drain() {
    timer = null;
    const event=queue.shift();
    if (!event) { setBusy(false); return; }
    setBusy(true);
    const duration=play(event);
    if (duration) timer=setTimeout(()=>{
      // End on the same 2s clock as input pacing, rather than a later compositor frame.
      if(layer){layer.getAnimations({subtree:true}).forEach(animation=>animation.cancel());layer.replaceChildren();}
      drain();
    },duration); else drain();
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
          if (old.skill !== p.skill) cards[i].querySelector('.hand-box.skill')?.animate([
            {backgroundColor:'#e3c18d33',transform:'translateY(-3px)'},
            {backgroundColor:'#e3c18d00',transform:'translateY(0)'}
          ],{duration:380});
        }
      });
      previousPlayers=state.players.map((p)=>({hp:p.hp,energy:p.energy,skill:p.skill}));
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
    if (queue.length && !active) drain();
  }
  function reset() { clear(); ready=false; lastSeq=0; chosen=null; previousPlayers=null; previousChain=0; }
  function init() {
    button=document.createElement('button'); button.className='ghost'; button.id='btn-motion';
    button.onclick=()=>{ userReduced=!userReduced; try { localStorage.setItem('tangwu_motion',userReduced?'reduced':'full'); } catch(e) {} refresh(); };
    document.querySelector('.header-btns')?.appendChild(button); refresh();
    castButton=document.createElement('button');castButton.className='ghost';castButton.id='btn-card-fx';
    castButton.onclick=()=>{cinematic=!cinematic;try{localStorage.setItem('tangwu_card_fx',cinematic?'on':'off');}catch(_){}if(!cinematic)clear();refresh();};
    document.querySelector('.header-btns')?.appendChild(castButton);refresh();
    document.addEventListener('click',(e)=>{
      const card=e.target.closest('[data-skill-id]:not(:disabled)');
      if (card && !reduced()) { chosen={...point(card),id:card.dataset.skillId,time:Date.now()}; }
    },true);
    document.addEventListener('visibilitychange',()=>{ if(document.hidden) clear(); });
    window.addEventListener('resize',clear); window.addEventListener('pagehide',reset);
    media.addEventListener('change',refresh);
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
  return { sync, reset, busy:()=>active, whenIdle };
})();
