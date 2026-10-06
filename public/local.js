'use strict';
// 唐五本地版控制器：驱动引擎 + 渲染 + 人机/AI观战调度（复用 ui.js / style.css）
const $ = (s) => document.querySelector(s);
const TW = window.__TW_engine;
const SK = window.__TW_skills;
const AI = window.__TWAI;
const Rank = window.__TWRank;
const RANK_KEY='tangwu_ai_rank_v1';
const isHumanAI=()=>cfg.mode==='pve' || cfg.mode==='ranked';
let localRankResult=null;
function readRank() {
  try {
    const p=JSON.parse(localStorage.getItem(RANK_KEY));
    if(p && ['rating','games','wins','losses','draws','best'].every(k=>Number.isFinite(p[k]) && p[k]>=0) && Array.isArray(p.history)) return p;
  } catch(_) {}
  return Rank.profile();
}
function refreshLocalRank() {
  const p=readRank(),opponent=Rank.opponent(p);
  $('#local-rank').innerHTML=TW_RankUI.summary(p,'本机 · 人机排位')+`<p class="rank-policy">本局对手：${opponent.name} · ${opponent.rating} 分<br>按积分匹配难度，普通对局不计分。返回菜单可续局；开始新局会将未完成排位记负。人机积分只保存在本机。</p>`+TW_RankUI.history(p);
}
function settleLocal(score,reason='对局结束') {
  if(cfg.mode!=='ranked' || !cfg.rankMatch) return null;
  const p=readRank();const result=Rank.settle(p,cfg.rankMatch.id,cfg.rankMatch.opponent,score,reason);
  try {localStorage.setItem(RANK_KEY,JSON.stringify(p));}
  catch(_) {toast('积分无法保存，请检查浏览器存储');}
  return result;
}
function syncLocalMode() {
  $('#diff-row').style.display=(cfg.mode==='pvp' || cfg.mode==='ranked')?'none':'flex';
  $('#local-rank').classList.toggle('hidden',cfg.mode!=='ranked');
  $('#btn-start').textContent=cfg.mode==='ranked'?'开始排位 →':'开始对局 →';
  refreshLocalRank();
}

let cfg = { mode: 'pve', diff: 'normal' };
let G = null;
let trainingReplay=null;
const trainingSent=new Set();
let aiTimer = null;
let toastTimer = null;
let spectatorPaused = false, spectatorSpeed = 1;
const SAVE_KEY = 'tangwu_match_v1';

// 线上联机地址（改成你的在线版网址；留空则隐藏"线上联机"按钮）
const ONLINE_URL = /^https?:$/.test(location.protocol) && document.querySelector('script[src="../engine.js"]')?new URL('./',location.href).href:'https://tang5.vercel.app/';

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
}

// ---------- 菜单 ----------
function setOn(sel, btn) { $(sel).querySelectorAll('button').forEach((b) => { b.classList.toggle('on', b === btn); b.setAttribute('aria-pressed', String(b === btn)); }); }
$('#mode-seg').querySelectorAll('button').forEach((b) => { b.onclick = () => { setOn('#mode-seg', b); cfg.mode = b.dataset.mode; syncLocalMode(); }; });
$('#diff-seg').querySelectorAll('button').forEach((b) => { b.onclick = () => { setOn('#diff-seg', b); cfg.diff = b.dataset.diff; $('#difficulty-note').textContent = { easy: '以基础决策为主，适合第一次熟悉技能。', normal: '会权衡攻守并预判后续行动，适合熟悉规则后挑战。', hard: '推演完整连招与对手反制，搜索更深入。', expert:window.__TWModel?.approved?'通过对照测试的学习型宗师，推演完整回合的策略、反制与连招。':'更大思考预算，优先寻找强制斩杀，再推演完整回合的攻守。', learned:`第 ${window.__TWModel?.generation ?? '?'} 代训练模型 · ${window.__TWModel?.training?.games ?? 0} 局训练${window.__TWModel?.approved?' · 已通过对照测试':' · 候选模型，强度仍在验证'}。` }[cfg.diff]; }; });
$('#btn-start').onclick = startGameLocal;
$('#btn-back').onclick = backToMenu;
$('#btn-menu').onclick = () => { $('#result-modal').classList.add('hidden'); backToMenu(); };
$('#btn-again').onclick = () => { $('#result-modal').classList.add('hidden'); startGameLocal(); };

// 线上联机：Electron 主进程用 setWindowOpenHandler 把 window.open 转到系统浏览器；网页版直接开新窗口
if (ONLINE_URL) {
  $('#btn-online').onclick = () => window.open(ONLINE_URL, '_blank');
} else {
  $('#btn-online').classList.add('hidden');
}

function backToMenu() {
  TW_FX.reset();
  cancelAI();
  G = null;
  trainingReplay=null;window.TWTraining?.active(null);
  $('#game').classList.add('hidden');
  $('#ban').classList.add('hidden');
  $('#btn-back').classList.add('hidden');
  $('#menu').classList.remove('hidden');
  refreshResume();
  refreshLocalRank();
}

function names() {
  if (isHumanAI()) return ['你', cfg.mode==='ranked'?cfg.rankMatch.opponent.name:'AI'];
  if (cfg.mode === 'pvp') return ['玩家1', '玩家2'];
  return ['AI·红', 'AI·蓝'];
}
function actorOf(g) { return g.controller >= 0 ? g.controller : g.turn; }

function startGameLocal() {
  // Only replacing an already-started ranked game is a forfeit; menu/refresh resumes it.
  const previous=readSave();
  if(previous?.cfg.mode==='ranked') {
    const selected=cfg;cfg=previous.cfg;settleLocal(0,'放弃未完成对局');cfg=selected;
    try {localStorage.removeItem(SAVE_KEY);} catch(_) {}
  }
  localRankResult=null;
  if(cfg.mode==='ranked') {
    const opponent=Rank.opponent(readRank());cfg.diff=opponent.difficulty;
    cfg.rankMatch={id:crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`,opponent};
  } else delete cfg.rankMatch;
  TW_FX.reset();
  cancelAI();
  spectatorPaused = false;
  _lastLogLen = 0;
  localBanQuery = ''; localBanCost = -1;
  $('#ban-tools').innerHTML = '';
  $('#menu').classList.add('hidden');
  $('#btn-back').classList.remove('hidden');
  G = TW.createGame(names());
  trainingReplay=null;
  G.phase = 'banning';
  _prevHp[0] = _prevHp[1] = -1;
  $('#game').classList.add('hidden');
  $('#ban').classList.remove('hidden');
  renderBan();
}

// 盲ban 界面
function renderBan() {
  setupLocalBanTools();
  const grid = $('#ban-grid');
  const sub = $('#ban-sub');
  const skillList = () => Object.keys(SK.SKILLS).flatMap((d) => SK.SKILLS[d].map((s) => ({ ...s, digit: d })));

  if (cfg.mode === 'ai') {
    // AI 观战：双方 AI 自动禁用
    sub.textContent = '🤖 AI 观战：双方 AI 自动禁用…';
    grid.innerHTML = '';
    TW.submitBan(G, 0, AI.chooseBan(G, 0, 'hard'));
    TW.submitBan(G, 1, AI.chooseBan(G, 1, 'hard'));
    afterBan();
    return;
  }
  if (isHumanAI()) {
    if (G.banPicks[0]) {
      sub.textContent = '✅ 你已选择禁用，AI 正在禁用…';
      grid.innerHTML = '';
      if (G.phase === 'banning') TW.submitBan(G, 1, AI.chooseBan(G, 1, cfg.diff));
      afterBan();
      return;
    }
    sub.textContent = '🔒 盲ban：从全部技能里选 1 个禁用（AI 也同时选，选完公示）。';
  } else {
    // pvp 双人热座：先玩家1，后玩家2（盲ban：选完前不展示对方的选择）
    const picker = G.banPicks[0] ? 1 : 0;
    if (G.banPicks[0] && G.banPicks[1]) { afterBan(); return; }
    sub.textContent = `🔒 盲ban：玩家${picker + 1} 从全部技能里选 1 个禁用（选完才公示）。`;
    const list = filterLocalBans(skillList());
    grid.innerHTML = list.map((s) => `<button class="ban-skill theme-${(SKILL_ART[s.id] || SKILL_ART._def).theme}" data-ban="${s.id}" title="${esc(s.desc)}"><span class="ban-cost">${s.digit}$</span><div class="ban-art">${(SKILL_ART[s.id] || SKILL_ART._def).svg}</div><span class="ban-name">${esc(s.name)}</span><span class="ban-desc">${esc(s.desc)}</span></button>`).join('');
    grid.querySelectorAll('[data-ban]').forEach((b) => { b.onclick = () => { TW.submitBan(G, picker, b.dataset.ban); renderBan(); }; });
    return;
  }
  const list = filterLocalBans(skillList());
  grid.innerHTML = list.map((s) => `<button class="ban-skill theme-${(SKILL_ART[s.id] || SKILL_ART._def).theme}" data-ban="${s.id}" title="${esc(s.desc)}"><span class="ban-cost">${s.digit}$</span><div class="ban-art">${(SKILL_ART[s.id] || SKILL_ART._def).svg}</div><span class="ban-name">${esc(s.name)}</span><span class="ban-desc">${esc(s.desc)}</span></button>`).join('');
  grid.querySelectorAll('[data-ban]').forEach((b) => { b.onclick = () => { TW.submitBan(G, 0, b.dataset.ban); renderBan(); }; });
}

function afterBan() {
  if (G.phase !== 'playing') return;
  if(isHumanAI() && window.TWTraining?.enabled()) trainingReplay=window.__TWReplay.create(G,cfg.diff);
  $('#ban').classList.add('hidden');
  $('#game').classList.remove('hidden');
  render();
  scheduleAI();
}

// ---------- 渲染 ----------
function buffChips(p) {
  const chips = [];
  const push = (key, name, detail) => chips.push(`<span class="buff" data-key="${key}" title="${esc(detail)}">${esc(name)}${detail ? '·' + esc(detail) : ''}</span>`);
  if (p.jingji) push('jingji', '荆棘', '反弹一次伤害');
  if (p.wudi) push('wudi', '无敌', '抵挡一次攻击+2血');
  if (p.yingneng.active) push('yingneng', '盈能', `充能${p.yingneng.charge ?? p.yingneng.idle ?? 0}/6 · 下次攻击增伤`);
  if (p.shuangbei > 0) push('shuangbei', '双倍圣水', `每回合+${p.shuangbei}$`);
  if (p.huxi > 0) push('huxi', '呼吸回血', `每回合+${p.huxi * (p.qianghua ? 2 : 1)}血${p.qianghua ? '（强化）' : ''}`);
  if (p.qianghua) push('qianghua', '强化', '其他★技能+2；呼吸每层额外+1');
  if (p.bishi) push('bishi', '鄙视', '被动偷费用');
  if (p.tanghua) push('tanghua', '假人唐化', '假人可无限召唤');
  if (p.cuidu) push('cuidu', '淬毒', '攻击附带1毒伤');
  if (p.dummy.alive) push('dummy', '假人', `${1 + (p.dummy.reserve || []).length}个 · 队首${p.dummy.hp}血`);
  if (p.inDummyCombat) push('dummyC', '假人作战', '灵魂在假人中');
  if (p.qibu.stage === 1) push('qibu', '七步', '每回合结束-3');
  if (p.qibu.stage === 2) push('qibu', '七步', '每回合结束-2');
  if (p.duming.active) push('duming', '赌命', `剩${p.duming.turnsLeft}回合`);
  if (p.freeze > 0) push('freeze', '冰封', `${p.freeze}回合`);
  if (p.chaofeng.pending) push('chaofeng', '嘲讽', '待触发');
  if (p.huanwuSkip) push('huanwu', '幻雾', '下回合跳过相加');
  if (p.delayed.length) push('delayed', '延迟伤害', `自己回合结束-${p.delayed.reduce((sum,d) => sum+d.dmg,0)}血 · ${p.delayed.map((d) => d.desc).join('+')}`);
  return chips.join('');
}

// 血量飘字 + 受伤闪光（跨渲染跟踪上一帧血量）
const _prevHp = [-1, -1];
function renderCard(el, p, idx) {
  const active = !G.over && G.turn === idx;
  el.classList.toggle('active', active);
  const hpDiff = (_prevHp[idx] < 0) ? 0 : (p.hp - _prevHp[idx]);
  _prevHp[idx] = p.hp;
  if (hpDiff < 0) {
    el.classList.add('hurt');
    setTimeout(() => el.classList.remove('hurt'), 600);
    if (window.TW_SFX) TW_SFX.hurt();
  } else if (hpDiff > 0 && window.TW_SFX) {
    TW_SFX.heal();
  }
  const dmgNum = hpDiff !== 0 ? `<span class="dmg-num${hpDiff > 0 ? ' heal' : ''}">${hpDiff > 0 ? '+' : ''}${hpDiff}</span>` : '';
  const hpPct = Math.max(0, Math.min(100, (p.hp / Math.max(21, p.hp)) * 100));
  const hpCls = p.hp > 15 ? 'good' : (p.hp > 7 ? 'mid' : 'low');
  const ctrlMark = G.controller === idx ? ' 🧠' : '';
  el.innerHTML = `
    <div class="p-head"><span class="p-name">${esc(p.name)}${ctrlMark}</span><span class="energy-badge" title="实际费用">费用 ${p.energy}$</span></div>
    <div class="hp-row"><div class="hp-bar"><div class="hp-fill ${hpCls}" style="width:${hpPct}%"></div></div><span class="hp-num">${p.hp}</span>${dmgNum}</div>
    <div class="hands">
      <div class="hand-box energy" title="费用手">${handSVG(p.energy)}<div class="hand-digit energy">${p.energy}</div></div>
      <div class="hand-box skill" title="技能手">${handSVG(p.skill)}<div class="hand-digit skill">${p.skill}</div></div>
    </div>
    <div class="buffs">${buffChips(p)}</div>`;
}

// 只在"有变化"的那次渲染触发动画（避免每次轮询都闪）
let _lastLogLen = 0;
function render() {
  const changed = _lastLogLen !== G.log.length;
  _lastLogLen = G.log.length;
  const gameEl = $('#game');
  if (changed) {
    gameEl.classList.add('anim');
    clearTimeout(gameEl._animT);
    gameEl._animT = setTimeout(() => gameEl.classList.remove('anim'), 520);
    if (window.TW_SFX) TW_SFX.whoosh();
  }
  renderBanSummary($('#ban-summary'), G.banned, SK.SKILLS);
  renderCard($('#p0-card'), G.players[0], 0);
  renderCard($('#p1-card'), G.players[1], 1);
  let b;
  if (G.over) {
    b = G.result === 'draw' ? '🤝 平局' : `🏆 ${G.players[G.winner].name} 获胜！`;
  } else if (G.controller >= 0) {
    b = `🧠 ${G.players[G.controller].name} 控制 ${G.players[G.turn].name} 的回合`;
  } else {
    b = `🎯 ${G.players[G.turn].name} 的回合`;
  }
  $('#turn-banner').textContent = b;
  $('#turn-banner').classList.toggle('myturn', !G.over);
  renderLog();
  renderControls();
  renderResult();
  TW_FX.sync(G, [$('#p0-card'), $('#p1-card')], SK.SKILLS);
  updateMatchTools();
  saveMatch();
}

// AI 思考提示（先画出来，再让出事件循环给浏览器渲染，最后才开始计算）
function showThinking() { const el = $('#ai-thinking'); if (el) el.classList.remove('hidden'); }
function hideThinking() { const el = $('#ai-thinking'); if (el) el.classList.add('hidden'); }

function renderLog() {
  const el = $('#log');
  const stick = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  const items = G.log.slice(-80); // 只显示最近 80 条
  const cnt = document.querySelector('#log-count');
  if (cnt) cnt.textContent = items.length + ' 条';
  el.innerHTML = items.map((t, i) => {
    let cls = '';
    if (/伤害|秒杀|击败|败北|清零|倒下/.test(t)) cls = 'dmg';
    else if (/回复|加血|\+\d+血|治疗/.test(t)) cls = 'heal';
    else if (/费用/.test(t)) cls = 'nrg';
    else if (/生效|就绪|召唤|控制|冰封|剧毒|中毒|强化|互换/.test(t)) cls = 'sys';
    if (i === items.length - 1) cls += ' latest'; // 最新一条高亮
    return `<div class="log-line ${cls}">${esc(t)}</div>`;
  }).join('');
  if (stick) el.scrollTop = el.scrollHeight;
  else $('#log-jump').classList.remove('hidden');
}

function renderControls() {
  const el = $('#controls');
  if (G.over) { el.innerHTML = ''; return; }
  const turnP = G.players[G.turn];
  const oppP = G.players[1 - G.turn];
  const humanDecides = (cfg.mode === 'pvp') || (isHumanAI() && actorOf(G) === 0); // 人机：你是0号，AI是1号
  if (!humanDecides) {
    let msg = (cfg.mode === 'ai') ? (spectatorPaused ? '观战已暂停，可调整速度后继续。' : '🤖 AI 对战中…') : '🤖 AI 思考中…';
    if (isHumanAI() && G.turn === 0 && G.controller >= 0) msg = '你的回合被 AI 控制中…';
    el.innerHTML = `<div class="wait-msg">${msg}</div>`;
    return;
  }
  const ctrlNote = (isHumanAI() && G.controller === 0) ? `🧠 你在控制 ${turnP.name} 的回合：` : '';
  if (G.step === 'awaitAdd') {
    el.innerHTML = `<div class="prompt">${ctrlNote}选择相加的手，预览下一步可用技能。</div>` + addChoicesHTML(turnP, oppP, SK.SKILLS, G.banned);
    el.querySelectorAll('[data-add]').forEach((b) => { b.onclick = () => doAction({ type: 'add', choice: Number(b.dataset.add) }); });
    return;
  }
  const digit = turnP.skill;
  const locked = (turnP.streak || 0) >= 24;
  const afford = turnP.energy >= digit && !locked;
  const skills = SK.SKILLS[digit] || [];
  let html = `<div class="prompt">${ctrlNote}技能手 = <b>${digit}</b>，费用 <b>${digit}$</b>（当前 ${turnP.energy}$）${locked ? ' <b style="color:#ff5d73">⚠ 连续出技能已达24次，只能空过</b>' : ''}${G.chainCount >= 3 ? `，数字连携 <b>${G.chainCount}</b> 次！` : ''}</div>`;
  html += '<div class="skill-grid">';
  let visibleSkill = 0;
  skills.forEach((sk, i) => {
    if (G.banned && G.banned.indexOf(sk.id) >= 0) return; // 被禁技能不显示
    html += skillCardHTML(sk, digit, afford && !(sk.id === 'duming' && (turnP.dumingUsed || turnP.duming.active)), `data-skill="${i}"`, ++visibleSkill, skillUnavailableReason(sk, turnP, digit));
  });
  html += '</div><button id="btn-pass" class="pass-btn">空过（结束回合）</button>';
  el.innerHTML = html;
  el.querySelectorAll('[data-skill]').forEach((b) => { b.onclick = () => clickSkill(Number(b.dataset.skill)); });
  $('#btn-pass').onclick = () => doAction({ type: 'pass' });
}

function clickSkill(skillIdx) {
  const digit = G.players[G.turn].skill;
  const sk = (SK.SKILLS[digit] || [])[skillIdx];
  if (!sk) return;
  if (sk.id === 'gongping') {
    const oppP = G.players[1 - G.turn];
    const list = SK.positiveBuffs(oppP);
    if (!list.length) { doAction({ type: 'act', skillIdx }); return; }
    const overlay = document.createElement('div');
    overlay.className = 'modal';
    overlay.innerHTML = `
      <div class="modal-box">
        <h2>优先去除对方哪个正面buff？（按本回合效果去除1–2层）</h2>
        <form id="buffform">
          ${list.map((b, i) => `<label class="buff-choice"><input type="radio" name="buffpick" value="${i}" ${i === 0 ? 'checked' : ''}> ${esc(b.name)}</label>`).join('')}
          <div class="btn-row"><button type="submit" class="primary">确认</button><button type="button" id="buffcancel">取消</button></div>
        </form>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#buffform').onsubmit = (e) => {
      e.preventDefault();
      const v = Number(overlay.querySelector('input[name="buffpick"]:checked').value);
      overlay.remove();
      doAction({ type: 'act', skillIdx, buffIdx: v });
    };
    overlay.querySelector('#buffcancel').onclick = () => overlay.remove();
    return;
  }
  doAction({ type: 'act', skillIdx });
}

function doAction(a) {
  if (!G || G.over) return;
  if (window.TW_SFX) TW_SFX.click();
  if(!window.TWTraining?.enabled()) trainingReplay=null;
  const r=window.__TWReplay.perform(G,a,trainingReplay);
  if (r && r.err) { toast(r.err); return; }
  render();
  scheduleAI();
}

const workerURL = new URL('ai-worker.js', document.currentScript.src);
let aiWorker = null, aiGeneration = 0;
function cancelAI(terminate=true) {
  aiGeneration++;
  clearTimeout(aiTimer);
  if (terminate && aiWorker) { aiWorker.terminate(); aiWorker = null; }
  hideThinking();
}
function scheduleAI() {
  cancelAI(false);
  if (!G || G.over || (cfg.mode === 'ai' && spectatorPaused)) return;
  const needAI = cfg.mode === 'ai' || (isHumanAI() && actorOf(G) === 1);
  if (!needAI) return;
  const generation = aiGeneration, game = G;
  showThinking();
  aiTimer = setTimeout(() => {
    if (generation !== aiGeneration || G !== game || G.over) return;
    const finish = (action) => {
      if (generation !== aiGeneration || G !== game || G.over) return;
      hideThinking();
      if (action) doAction(action); else render();
    };
    const fallback = () => {
      if (generation !== aiGeneration || G !== game || G.over) return;
      if (aiWorker) { aiWorker.terminate(); aiWorker = null; }
      // file:// 环境可能禁用 Worker；小预算兜底，仍可离线双击运行。
      finish(AI.chooseAction(G, actorOf(G), cfg.diff, 60));
    };
    try {
      aiWorker = aiWorker || new Worker(workerURL);
      aiWorker.onmessage = ({ data }) => {
        if (generation !== aiGeneration || data.id!==generation) return;
        if (data.error) fallback(); else finish(data.action);
      };
      aiWorker.onerror = (event) => { event.preventDefault(); fallback(); };
      aiWorker.postMessage({ id:generation,game: TW.serializeGame(G), actor: actorOf(G), difficulty: cfg.diff, budget: ['expert','learned'].includes(cfg.diff)?1600:cfg.diff === 'hard' ? 700 : 100 });
    } catch (e) { fallback(); }
  }, 320 / (cfg.mode === 'ai' ? spectatorSpeed : 1));
}

function renderResult() {
  window.TWTraining?.active(trainingReplay,G.over);
  const modal = $('#result-modal');
  modal.classList.toggle('hidden', !G.over);
  if (!G.over) return;
  if(trainingReplay && !trainingSent.has(trainingReplay.id)) {
    trainingSent.add(trainingReplay.id);
    try {const record=window.__TWReplay.clean(window.__TWReplay.finish(trainingReplay,G));window.TWTraining?.submit(record);}
    catch(_) {trainingReplay=null;window.TWTraining?.active(null);}
  }
  $('#result-title').textContent = G.result === 'draw' ? '🤝 平局！' : `🎉 ${G.players[G.winner].name} 获胜！`;
  $('#result-sub').textContent = G.result === 'draw' ? '本局平局' : '';
  if(cfg.mode==='ranked') {
    localRankResult=localRankResult || settleLocal(G.result==='draw'?.5:G.winner===0?1:0);
    if(localRankResult) $('#result-sub').textContent=`人机排位 ${localRankResult.delta>0?'+':''}${localRankResult.delta} 分 · ${localRankResult.after} 分 · ${Rank.progress(readRank()).name}`;
  }
}

let localBanQuery = '', localBanCost = -1;
function filterLocalBans(list) {
  const filtered = list.filter((s) => (localBanCost < 0 || Number(s.digit) === localBanCost) && (s.name + s.desc).includes(localBanQuery));
  // 无结果提示在下一帧补充，保留筛选框焦点。
  if (!filtered.length) queueMicrotask(() => { if (!$('#ban-grid').children.length) $('#ban-grid').innerHTML = '<p class="empty-state">没有匹配技能，请更换关键词或费用。</p>'; });
  return filtered;
}
function setupLocalBanTools() {
  const tools = $('#ban-tools');
  if (tools.children.length || cfg.mode === 'ai') return;
  tools.innerHTML = `<div class="ban-tools"><input id="ban-search" aria-label="搜索禁用技能" placeholder="搜索技能或效果"><div class="ban-chips"><button class="chip on" data-cost="-1">全部</button>${Array.from({ length: 10 }, (_, i) => `<button class="chip" data-cost="${i}">${i}$</button>`).join('')}</div></div>`;
  $('#ban-search').oninput = (e) => { localBanQuery = e.target.value.trim(); renderBan(); };
  tools.querySelectorAll('[data-cost]').forEach((button) => {
    button.onclick = () => { localBanCost = Number(button.dataset.cost); tools.querySelectorAll('[data-cost]').forEach((b) => b.classList.toggle('on', b === button)); renderBan(); };
  });
}
$('#btn-rules').onclick = () => $('#rules-modal').classList.remove('hidden');
$('#btn-rules-close').onclick = () => $('#rules-modal').classList.add('hidden');
$('#rules-modal').onclick = (e) => { if (e.target === $('#rules-modal')) $('#rules-modal').classList.add('hidden'); };
$('#log-jump').onclick = () => { $('#log').scrollTop = $('#log').scrollHeight; $('#log-jump').classList.add('hidden'); };
$('#log').addEventListener('scroll', () => { const el = $('#log'); if (el.scrollHeight - el.scrollTop - el.clientHeight < 60) $('#log-jump').classList.add('hidden'); }, { passive: true });
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.altKey || e.metaKey || e.repeat || !G || G.over) return;
  if (document.querySelector('.modal:not(.hidden)') || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
  if (cfg.mode === 'ai' || (isHumanAI() && actorOf(G) !== 0)) return;
  let button;
  if (G.step === 'awaitAdd' && /^[12]$/.test(e.key)) button = $('#controls').querySelectorAll('[data-add]')[Number(e.key) - 1];
  else if (G.step === 'awaitAction' && /^[1-9]$/.test(e.key)) button = $('#controls').querySelectorAll('[data-skill]')[Number(e.key) - 1];
  else if (G.step === 'awaitAction' && e.key.toLowerCase() === 'p') button = $('#btn-pass');
  if (button && !button.disabled) { e.preventDefault(); button.click(); }
});


// 本地对局：每次结算后存档，继续时重新建立演出与 AI 调度基线。
const resumeButton = document.createElement('button');
resumeButton.id = 'btn-resume'; resumeButton.className = 'resume-action hidden';
resumeButton.textContent = '继续上次对局';
$('#btn-start').insertAdjacentElement('afterend', resumeButton);
const matchTools = document.createElement('div');
matchTools.className = 'match-tools';
matchTools.innerHTML = '<button id="btn-spectate-pause" class="ghost" aria-pressed="false">暂停观战</button><label id="spectate-speed-label">观战速度<select id="spectate-speed" aria-label="观战速度"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="4">4×</option></select></label><button id="btn-export-log" class="ghost">导出战报</button><span class="save-status" aria-live="polite"></span>';
$('#controls').insertAdjacentElement('beforebegin', matchTools);
function readSave() {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (saved?.version !== 1 || !['pve','pvp','ai','ranked'].includes(saved.cfg?.mode) || !['easy','normal','hard','expert','learned'].includes(saved.cfg?.diff)) return null;
    if(saved.cfg.mode==='ranked' && (!saved.cfg.rankMatch?.id || !Number.isFinite(saved.cfg.rankMatch.opponent?.rating))) return null;
    const game = TW.deserializeGame(saved.game);
    if (game.phase !== 'playing' || game.over || game.players?.length !== 2 || ![0,1].includes(game.turn) || !Array.isArray(game.log) || !Array.isArray(game.banned)) return null;
    return { ...saved, game };
  } catch (_) { return null; }
}
function refreshResume() { resumeButton.classList.toggle('hidden', !readSave()); }
function saveMatch() {
  const status = matchTools.querySelector('.save-status');
  try {
    if (G.over) { localStorage.removeItem(SAVE_KEY); status.textContent = '对局结束'; return; }
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version:1, cfg, game:TW.serializeGame(G),trainingReplay }));
    status.textContent = '进度已保存';
  } catch (_) { status.textContent = '无法保存：浏览器存储不可用'; }
}
function updateMatchTools() {
  const ranked=cfg.mode==='ranked';
  $('#local-rank-match').classList.toggle('hidden',!ranked);
  if(ranked) {
    $('#local-rank-match').innerHTML=`<span>人机排位 · ${Rank.progress(readRank()).name} · 对手 ${cfg.rankMatch.opponent.rating} 分</span><button id="btn-local-resign" class="ghost" ${G.over?'disabled':''}>认输并结算</button>`;
    $('#btn-local-resign').onclick=()=>{cancelAI();trainingReplay=null;G.over=true;G.phase='over';G.step='over';G.winner=1;G.result='win';G.log.push('你主动认输');render();};
  }
  const watching = cfg.mode === 'ai' && !G.over;
  $('#btn-spectate-pause').classList.toggle('hidden', !watching);
  $('#spectate-speed-label').classList.toggle('hidden', !watching);
  $('#btn-spectate-pause').textContent = spectatorPaused ? '继续观战' : '暂停观战';
  $('#btn-spectate-pause').setAttribute('aria-pressed', String(spectatorPaused));
}
resumeButton.onclick = () => {
  const saved = readSave();
  if (!saved) { refreshResume(); toast('存档不可用，请开始新对局'); return; }
  cancelAI(); TW_FX.reset(); cfg = saved.cfg; G = saved.game;
  trainingReplay=window.TWTraining?.enabled()?saved.trainingReplay || null:null;
  localRankResult=null;
  spectatorPaused = cfg.mode === 'ai'; _prevHp[0] = _prevHp[1] = -1; _lastLogLen = 0;
  setOn('#mode-seg', document.querySelector(`[data-mode="${cfg.mode}"]`));
  document.querySelector(`[data-diff="${cfg.diff}"]`).click();
  syncLocalMode();
  $('#menu').classList.add('hidden'); $('#ban').classList.add('hidden');
  $('#btn-back').classList.remove('hidden'); $('#game').classList.remove('hidden');
  render(); scheduleAI(); toast('已继续上次对局');
};
$('#btn-spectate-pause').onclick = () => {
  spectatorPaused = !spectatorPaused; cancelAI(); updateMatchTools(); renderControls();
  if (!spectatorPaused) scheduleAI();
};
$('#spectate-speed').onchange = (event) => {
  spectatorSpeed = Number(event.target.value); scheduleAI();
};
$('#btn-export-log').onclick = () => {
  if (!G) return;
  const content = '唐五 · 对局战报\n' + G.players.map(p => p.name).join(' vs ') + '\n\n' + G.log.join('\n');
  const url = URL.createObjectURL(new Blob([content], { type:'text/plain;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = '唐五-战报.txt';
  document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
refreshResume();
refreshLocalRank();
const requestedMode=new URLSearchParams(location.search).get('mode');
if(['pve','pvp','ai','ranked'].includes(requestedMode)) document.querySelector(`[data-mode="${requestedMode}"]`).click();
