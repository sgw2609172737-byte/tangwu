/* Shared appearance and accessible top-layer select controls. No game state. */
(() => {
  'use strict';
  const themeKey='tangwu_theme';
  const storedTheme=()=>{try{return localStorage.getItem(themeKey)==='light'?'light':'dark';}catch{return 'dark';}};
  function applyTheme(theme){document.documentElement.dataset.theme=theme;const button=document.getElementById('btn-theme');if(button){button.textContent=theme==='light'?'外观：昼':'外观：夜';button.setAttribute('aria-label',theme==='light'?'切换为深色外观':'切换为浅色外观');}}
  applyTheme(storedTheme());window.addEventListener('storage',e=>{if(e.key===themeKey)applyTheme(storedTheme());});
  function init() {
    const header=document.querySelector('.header-btns');
    if(header&&!document.getElementById('btn-theme')){const button=document.createElement('button');button.id='btn-theme';button.type='button';button.addEventListener('click',()=>{const next=document.documentElement.dataset.theme==='light'?'dark':'light';try{localStorage.setItem(themeKey,next);}catch{}applyTheme(next);document.querySelectorAll('iframe').forEach(frame=>{try{frame.contentDocument.documentElement.dataset.theme=next;}catch{}});});header.prepend(button);applyTheme(storedTheme());}
    let serial=0,current=null,typeBuffer='',typeTimer;
    const entries=new Map(),nativePopover='showPopover' in HTMLElement.prototype;
    function close(restore=true) {
      if(!current)return;const entry=current;current=null;entry.button.setAttribute('aria-expanded','false');
      if(nativePopover&&entry.menu.matches(':popover-open'))entry.menu.hidePopover();else entry.menu.hidden=true;
      if(restore&&entry.button.isConnected)entry.button.focus();
    }
    function position(entry) {
      if(!entry.button.isConnected||!entry.button.offsetWidth){close(false);return;}
      const r=entry.button.getBoundingClientRect(),menu=entry.menu;
      const width=Math.min(Math.max(r.width,180),innerWidth-24);menu.style.width=width+'px';
      const below=innerHeight-r.bottom-18,above=r.top-18;
      menu.style.maxHeight=Math.max(70,Math.min(300,Math.max(below,above)))+'px';
      const height=menu.getBoundingClientRect().height;
      menu.style.left=Math.max(12,Math.min(r.left,innerWidth-width-12))+'px';
      menu.style.top=(below>=height||below>=above?r.bottom+8:Math.max(12,r.top-height-8))+'px';
    }
    function sync(entry) {
      entry.button.querySelector('span').textContent=entry.select.selectedOptions[0]?.textContent||'请选择';entry.button.disabled=entry.select.disabled;
      entry.menu.replaceChildren();
      for(const option of entry.select.options){const row=document.createElement('div');row.className='glass-select-option';row.setAttribute('role','option');row.tabIndex=-1;row.dataset.value=option.value;row.textContent=option.textContent;row.setAttribute('aria-selected',String(option.selected));row.setAttribute('aria-disabled',String(option.disabled));row.addEventListener('click',()=>choose(entry,row));entry.menu.append(row);}
    }
    function choose(entry,row){if(row.getAttribute('aria-disabled')==='true')return;entry.select.value=row.dataset.value;entry.select.dispatchEvent(new Event('change',{bubbles:true}));sync(entry);close();}
    function open(entry) {
      if(entry.select.disabled)return;if(current===entry){close();return;}close(false);sync(entry);current=entry;entry.button.setAttribute('aria-expanded','true');
      if(nativePopover)entry.menu.showPopover();else entry.menu.hidden=false;position(entry);
      (entry.menu.querySelector('[aria-selected=true]')||entry.menu.firstElementChild)?.focus({preventScroll:true});
    }
    function enhance(select) {
      if(entries.has(select))return;
      const wrapper=document.createElement('span');wrapper.className='glass-select';select.before(wrapper);wrapper.append(select);select.classList.add('glass-native-select');select.tabIndex=-1;select.setAttribute('aria-hidden','true');
      const button=document.createElement('button');button.type='button';button.className='glass-select-trigger';button.innerHTML='<span></span>';button.id=select.id+'-glass';button.setAttribute('aria-haspopup','listbox');button.setAttribute('aria-expanded','false');
      const label=select.getAttribute('aria-label')||select.labels?.[0]?.textContent.trim()||'选择 AI 难度';button.setAttribute('aria-label',label);
      const menu=document.createElement('div');menu.className='glass-select-menu';menu.id=`glass-options-${serial++}`;menu.setAttribute('role','listbox');menu.setAttribute('aria-label',label);button.setAttribute('aria-controls',menu.id);
      if(nativePopover)menu.setAttribute('popover','manual');else menu.hidden=true;
      wrapper.append(button);document.body.append(menu);const entry={select,button,menu};entries.set(select,entry);sync(entry);
      button.addEventListener('click',()=>open(entry));button.addEventListener('keydown',e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();open(entry);}});
      select.addEventListener('change',()=>sync(entry));
      menu.addEventListener('keydown',e=>{
        const rows=[...menu.children].filter(row=>row.getAttribute('aria-disabled')!=='true');let index=rows.indexOf(document.activeElement);
        if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();index=e.key==='Home'?0:e.key==='End'?rows.length-1:(index+(e.key==='ArrowDown'?1:-1)+rows.length)%rows.length;rows[index]?.focus();}
        else if(e.key==='Enter'||e.key===' '){e.preventDefault();if(rows.includes(document.activeElement))choose(entry,document.activeElement);}
        else if(e.key.length===1&&!e.ctrlKey&&!e.altKey&&!e.metaKey){typeBuffer+=e.key.toLocaleLowerCase();clearTimeout(typeTimer);typeTimer=setTimeout(()=>typeBuffer='',700);rows.find(row=>row.textContent.toLocaleLowerCase().startsWith(typeBuffer))?.focus();}
      });
    }
    function scan(){for(const [select,entry] of entries)if(!select.isConnected){if(current===entry)close(false);entry.menu.remove();entries.delete(select);}document.querySelectorAll('select').forEach(enhance);}
    const observer=new MutationObserver(records=>{if(records.some(r=>r.type==='childList'))scan();for(const r of records){const select=r.target.closest?.('select');if(select&&entries.has(select))sync(entries.get(select));}});
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','selected']});scan();
    document.addEventListener('keydown',e=>{if(current&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();}else if(current&&e.key==='Tab')close();},true);
    document.addEventListener('pointerdown',e=>{if(current&&!current.menu.contains(e.target)&&!current.button.contains(e.target))close(false);},true);
    window.addEventListener('resize',()=>{if(current)position(current);});document.addEventListener('scroll',()=>{if(current)position(current);},true);
    window.addEventListener('pagehide',()=>{observer.disconnect();clearTimeout(typeTimer);},{once:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
