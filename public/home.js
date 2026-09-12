'use strict';
// 首页卡组与入口交互。离开首页或减少动画时停止效果，不使用常驻帧循环。
(() => {
  const init = () => {
    const home = document.querySelector('.home-layout');
    if (!home) return;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const showcase = home.querySelector('[data-showcase]');
    const choices = [['youli','尤里','控制',9,'left'],['yingneng','盈能','蓄势',6,'center'],['bing','冰','反制',6,'right']];
    showcase.innerHTML = choices.map(([id,name,label,cost,side]) => `<div class="showcase-card showcase-card--${side}"><div class="showcase-float"><div class="showcase-top"><span>${label}</span><b>${cost}</b></div><div class="showcase-art">${SKILL_ART[id].svg}</div><div class="showcase-bottom"><strong>${name}</strong><span>TANGWU</span></div></div></div>`).join('');
    let frame = 0;
    function syncMotion() {
      const visible = !home.classList.contains('hidden');
      document.body.classList.toggle('home-visible', visible);
      document.body.classList.toggle('home-motion', visible && !document.hidden && !media.matches && document.documentElement.dataset.motion !== 'reduced');
      if (!document.body.classList.contains('home-motion')) resetTilt();
    }
    function resetTilt() { cancelAnimationFrame(frame); frame=0; showcase.style.removeProperty('--pitch');showcase.style.removeProperty('--yaw'); }
    const scene=home.querySelector('.home-showcase');
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
    window.addEventListener('pagehide',resetTilt);
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
