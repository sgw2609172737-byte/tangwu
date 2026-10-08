/* Command interaction adapted from Lattice src/dom/command.js, MIT (c) 2026
   DayDreamInAReverie. Source: ruiqichenbiec/design-systems @ 7a424c9.
   License: licenses/design-systems.txt. No particle renderer is included. */
(()=>{
  const items=[
    {name:'战术工坊 · 棋谱复盘',detail:'逐步回放，查看结算与日志',url:'studio.html'},
    {name:'机制挑战 · 战术练习',detail:'无敌、毒伤、数字连携与假人',url:'studio.html?tab=practice'},
    {name:'进入本地对战',detail:'人机、双人、排位与 AI 观战',url:'local.html'},
    {name:'技能图鉴',detail:'浏览全部 40 种技能',url:'artbook.html'},
    {name:'规则手册',detail:'费用、伤害、胜负与技能机制',url:'rules.html'},
    ...Object.values(window.__TW_skills?.SKILLS||{}).flat().map(sk=>({name:sk.name,detail:sk.desc,keywords:({xiaolieyan:'灼烧 火焰',qibu:'七步蛇 毒伤',cuidu:'毒伤',wudi:'免疫 护盾'})[sk.id]||'',url:'artbook.html?q='+encodeURIComponent(sk.name)}))
  ];
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dialog=document.createElement('dialog');dialog.className='command-dialog';dialog.setAttribute('aria-label','快速查找');
  dialog.innerHTML='<div class="command-panel"><div class="command-top"><span>快速查找</span><button class="ghost" data-close aria-label="关闭快速查找">关闭</button></div><input id="tw-command-input" role="combobox" aria-label="搜索功能或技能" aria-autocomplete="list" aria-expanded="true" aria-controls="tw-command-results" placeholder="搜索技能、效果或功能…" autocomplete="off"><ul id="tw-command-results" role="listbox" aria-label="搜索结果"></ul><p class="command-help">↑ ↓ 选择　Enter 打开　Esc 关闭</p></div>';
  document.body.append(dialog);const input=dialog.querySelector('input'),list=dialog.querySelector('ul');let active=0,results=[],previous;
  function score(text,query){text=text.toLowerCase();query=query.toLowerCase();if(!query)return 1;const exact=text.indexOf(query);if(exact>=0)return 100-exact;let pos=-1,total=0;for(const c of query){const next=text.indexOf(c,pos+1);if(next<0)return -1;total+=next-pos;pos=next;}return 20-total;}
  function select(index){active=index;list.querySelectorAll('[role=option]').forEach((el,i)=>el.setAttribute('aria-selected',String(i===active)));const el=list.children[active];if(el){input.setAttribute('aria-activedescendant',el.id);el.scrollIntoView({block:'nearest'});}else input.removeAttribute('aria-activedescendant');}
  function render(){results=items.map(item=>({...item,score:Math.max(score(item.name,input.value.trim()),score(item.detail+' '+(item.keywords||''),input.value.trim())-10)})).filter(item=>item.score>=0).sort((a,b)=>b.score-a.score).slice(0,12);list.innerHTML=results.map((item,i)=>`<li id="tw-command-${i}" role="option" data-index="${i}" aria-selected="false"><span>${escape(item.name)}</span><small>${escape(item.detail)}</small><b aria-hidden="true">↗</b></li>`).join('')||'<li class="command-empty">没有匹配项，试试技能名或效果。</li>';select(0);}
  function open(){if(dialog.open)return;previous=document.activeElement;dialog.showModal();input.value='';render();input.focus();window.TWMotion?.iris(dialog.querySelector('.command-panel'),{duration:240});}
  function run(){const item=results[active];if(!item)return;dialog.close();if(item.url.startsWith('rules')&&document.querySelector('#btn-rules'))document.querySelector('#btn-rules').click();else if((/(?:local|index)\.html$/.test(location.pathname)||location.pathname==='/')&&window.TWDesktopTraining?.platform!=='android')window.open(item.url,'_blank');else location.href=item.url;}
  input.oninput=render;input.onkeydown=e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(results.length)select((active+(e.key==='ArrowDown'?1:-1)+results.length)%results.length);}else if(e.key==='Enter'){e.preventDefault();run();}};
  list.onclick=e=>{const el=e.target.closest('[data-index]');if(el){select(Number(el.dataset.index));run();}};
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});dialog.addEventListener('close',()=>previous?.focus());
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();dialog.open?dialog.close():open();}});
  const button=document.createElement('button');button.className='ghost quick-find';button.textContent='查找';button.title='搜索功能或技能 · Ctrl / ⌘ K';button.onclick=open;document.querySelector('.header-btns')?.prepend(button);
})();
