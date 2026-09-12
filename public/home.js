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
    let current=0, cycleTimer=null, paused=false, turning=false;
    const animations=new Set();
    const at=(n)=>deck[(n+deck.length)%deck.length];
    function card(skill,side) {
      const el=document.createElement('div');el.className=`showcase-card showcase-card--${side}`;el.dataset.homeSkill=skill.id;
      el.innerHTML=`<div class="showcase-float"><div class="showcase-top"><span>${skill.label}</span><b>${skill.cost}</b></div><div class="showcase-art">${SKILL_ART[skill.id].svg}</div><div class="showcase-bottom"><strong>${esc(skill.name)}</strong><span>TANGWU</span></div></div>`;
      return el;
    }
    function renderDeck() {
      showcase.replaceChildren(card(at(current-1),'left'),card(at(current),'center'),card(at(current+1),'right'));
      showcase.dataset.deckSize=deck.length;showcase.dataset.currentId=at(current).id;
      controls.querySelector('.deck-position').textContent=`${String(current+1).padStart(2,'0')} / ${deck.length}`;
    }
    function stopCycle() {
      clearTimeout(cycleTimer);cycleTimer=null;
      animations.forEach((a)=>a.cancel());animations.clear();
      if(turning){turning=false;renderDeck();}
    }
    function canRotate() { return !paused && document.body.classList.contains('home-motion'); }
    function schedule() { if(canRotate() && !cycleTimer && !turning)cycleTimer=setTimeout(()=>{cycleTimer=null;advance();},2600); }
    function move(el,side) {
      const old={left:el.offsetLeft,top:el.offsetTop,transform:getComputedStyle(el).transform};
      el.className=`showcase-card showcase-card--${side}`;
      return el.animate([{transform:`translate(${old.left-el.offsetLeft}px,${old.top-el.offsetTop}px) ${old.transform==='none'?'':old.transform}`},{transform:getComputedStyle(el).transform}],{duration:700,easing:'cubic-bezier(.22,.7,.22,1)'});
    }
    function advance() {
      if(!canRotate() || turning)return;
      turning=true;
      const left=showcase.querySelector('.showcase-card--left'),center=showcase.querySelector('.showcase-card--center'),right=showcase.querySelector('.showcase-card--right');
      current=(current+1)%deck.length;
      const incoming=card(at(current+1),'right');showcase.appendChild(incoming);
      const exit=left.animate([{opacity:1,transform:getComputedStyle(left).transform},{opacity:0,transform:'translate(-45px,45px) rotate(-38deg) scale(.7)'}],{duration:650,fill:'forwards',easing:'ease-in'});
      const a=move(center,'left'),b=move(right,'center');
      const enter=incoming.animate([{opacity:0,transform:'translate(25px,65px) rotateY(-55deg) rotate(30deg) scale(.78)'},{opacity:1,transform:getComputedStyle(incoming).transform}],{duration:700,easing:'cubic-bezier(.22,.7,.22,1)'});
      [exit,a,b,enter].forEach((animation)=>animations.add(animation));
      Promise.all([exit.finished,a.finished,b.finished,enter.finished]).then(()=>{
        if(!turning)return;
        animations.clear();turning=false;renderDeck();schedule();
      }).catch(()=>{});
    }
    controls.querySelector('[data-deck-pause]').onclick=()=>{
      paused=!paused;controls.querySelector('[data-deck-pause]').textContent=paused?'继续轮播':'暂停轮播';controls.querySelector('[data-deck-pause]').setAttribute('aria-pressed',String(paused));
      if(paused)stopCycle();else schedule();
    };
    for(const [selector,direction] of [['[data-deck-prev]',-1],['[data-deck-next]',1]])controls.querySelector(selector).onclick=()=>{stopCycle();current=(current+direction+deck.length)%deck.length;renderDeck();schedule();};
    renderDeck();
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
