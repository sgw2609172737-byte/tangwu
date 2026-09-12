'use strict';
// 首页卡组与入口交互。离开首页或减少动画时停止效果，不使用常驻帧循环。
(() => {
  const init = () => {
    const home = document.querySelector('.home-layout');
    if (!home) return;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const showcase = home.querySelector('[data-showcase]');
    const labels = { attack:'攻击', heal:'治疗', energy:'蓄势', control:'控制', defense:'防御', summon:'召唤', digit:'连携', special:'特殊' };
    const deck = Object.entries(window.__TW_skills.SKILLS).flatMap(([cost, list]) => list.map((skill) => ({ ...skill, cost, label: labels[SKILL_ART[skill.id].theme] })));
    const scene=home.querySelector('.home-showcase');
    const controls=document.createElement('div');controls.className='deck-controls';
    controls.innerHTML='<button type="button" data-deck-prev aria-label="上一张技能">←</button><span class="deck-position"></span><button type="button" data-deck-next aria-label="下一张技能">→</button><button type="button" data-deck-pause aria-pressed="false">暂停轮播</button>';
    scene.insertAdjacentElement('afterend',controls);
    // 四十张卡固定在同一圆周上；只旋转整个轮盘，不移除或重新插入卡片。
    const CARD_TIME=4500, TURN_TIME=CARD_TIME*deck.length;
    let current=-1, counterTimer=null, paused=false;
    const ring=document.createElement('div');ring.className='skill-wheel';
    ring.innerHTML=deck.map((skill,index)=>`<div class="wheel-spoke" data-wheel-index="${index}" style="--card-angle:${index*360/deck.length}deg"><div class="showcase-card" data-home-skill="${skill.id}"><div class="showcase-float"><div class="showcase-top"><span>${skill.label}</span><b>${skill.cost}</b></div><div class="showcase-art">${SKILL_ART[skill.id].svg}</div><div class="showcase-bottom"><strong>${esc(skill.name)}</strong><span>TANGWU</span></div></div></div></div>`).join('');
    showcase.replaceChildren(ring);showcase.dataset.deckSize=deck.length;
    scene.classList.add('wheel-scene');
    const depth=document.createElement('div');depth.className='wheel-depth';scene.appendChild(depth);
    const rotation=ring.animate([{transform:'rotate(0deg)'},{transform:'rotate(-360deg)'}],{duration:TURN_TIME,iterations:Infinity,easing:'linear'});
    rotation.pause();rotation.currentTime=0;
    function updateCounter() {
      const next=Math.round(Number(rotation.currentTime||0)/CARD_TIME)%deck.length;
      if(next===current)return;
      current=next;showcase.dataset.currentId=deck[current].id;
      controls.querySelector('.deck-position').textContent=`${deck[current].name} · ${String(current+1).padStart(2,'0')} / ${deck.length}`;
      ring.querySelectorAll('.wheel-spoke').forEach((el,index)=>el.toggleAttribute('data-current',index===current));
    }
    function stopCycle() {
      rotation.pause();clearInterval(counterTimer);counterTimer=null;updateCounter();
    }
    function canRotate() { return !paused && document.body.classList.contains('home-motion'); }
    function schedule() {
      if(!canRotate())return;
      rotation.play();
      // 低频更新文字，轮盘由浏览器以恒定角速度逐帧合成，不靠计时器换卡。
      if(counterTimer===null)counterTimer=setInterval(updateCounter,180);
    }
    controls.querySelector('[data-deck-pause]').onclick=()=>{
      paused=!paused;controls.querySelector('[data-deck-pause]').textContent=paused?'继续轮播':'暂停轮播';controls.querySelector('[data-deck-pause]').setAttribute('aria-pressed',String(paused));
      if(paused)stopCycle();else schedule();
    };
    for(const [selector,direction] of [['[data-deck-prev]',-1],['[data-deck-next]',1]])controls.querySelector(selector).onclick=()=>{
      stopCycle();rotation.currentTime=((current+direction+deck.length)%deck.length)*CARD_TIME;updateCounter();schedule();
    };
    updateCounter();
    let frame = 0;
    function syncMotion() {
      const visible = !home.classList.contains('hidden');
      document.body.classList.toggle('home-visible', visible);
      document.body.classList.toggle('home-motion', visible && !document.hidden && !media.matches && document.documentElement.dataset.motion !== 'reduced');
      if (!document.body.classList.contains('home-motion')) { resetTilt();stopCycle(); } else schedule();
      controls.querySelector('[data-deck-pause]').disabled=document.documentElement.dataset.motion==='reduced'||media.matches;
    }
    function resetTilt() { cancelAnimationFrame(frame); frame=0; showcase.style.removeProperty('--pitch');showcase.style.removeProperty('--yaw'); }
    scene.addEventListener('pointermove',(event)=>{
      if (event.pointerType==='touch' || !document.body.classList.contains('home-motion')) return;
      const bounds=scene.getBoundingClientRect();
      const x=Math.max(-1,Math.min(1,(event.clientX-bounds.left)/bounds.width*2-1));
      const y=Math.max(-1,Math.min(1,(event.clientY-bounds.top)/bounds.height*2-1));
      cancelAnimationFrame(frame);
      frame=requestAnimationFrame(()=>{showcase.style.setProperty('--yaw',`${x*5}deg`);showcase.style.setProperty('--pitch',`${-y*3}deg`);frame=0;});
    });
    scene.addEventListener('pointerleave',resetTilt);
    new MutationObserver(syncMotion).observe(home,{attributes:true,attributeFilter:['class']});
    new MutationObserver(syncMotion).observe(document.documentElement,{attributes:true,attributeFilter:['data-motion']});
    media.addEventListener('change',syncMotion);document.addEventListener('visibilitychange',syncMotion);
    window.addEventListener('pagehide',()=>{resetTilt();stopCycle();});
    window.addEventListener('pageshow',syncMotion);
    const tabs=[...home.querySelectorAll('[data-entry]')];
    function selectTab(tab,focus=false) {
      tabs.forEach((button)=>{const selected=button===tab;button.classList.toggle('on',selected);button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;document.getElementById(button.getAttribute('aria-controls')).classList.toggle('hidden',!selected);});
      const error=home.querySelector('#lobby-err');if(error)error.textContent='';
      if(focus)tab.focus();
    }
    tabs.forEach((tab,index)=>{
      tab.addEventListener('click',()=>selectTab(tab));
      tab.addEventListener('keydown',(e)=>{
        let next;if(e.key==='ArrowRight')next=(index+1)%tabs.length;else if(e.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=tabs.length-1;
        if(next!==undefined){e.preventDefault();selectTab(tabs[next],true);}
      });
    });
    if(tabs.length && new URLSearchParams(location.search).has('room'))selectTab(tabs.find(t=>t.dataset.entry==='join'));
    syncMotion();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
