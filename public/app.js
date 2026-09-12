'use strict';
// 《唐五》客户端：状态渲染 + 操作提交（服务器权威结算）
const $ = (s) => document.querySelector(s);

let state = null;
let me = (() => { try { return JSON.parse(localStorage.getItem('tangwu_v1') || 'null'); } catch (e) { return null; } })()
  || { name: '', roomCode: '', token: '', idx: -1 };
let pollTimer = null;
let toastTimer = null;

function save() { localStorage.setItem('tangwu_v1', JSON.stringify(me)); }

async function api(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let data = {};
  try { data = await res.json(); } catch (e) { /* ignore */ }
  if (!data.ok) throw new Error(data.err || '请求失败');
  return data;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 3000);
}

let sending = false; // 防抖：上一次请求未返回前忽略重复点击
async function send(body) {
  if (sending) return;
  sending = true;
  const ctl = $('#controls');
  ctl.classList.add('sending');
  if (window.TW_SFX) TW_SFX.click();
  try {
    await api('/api/action', { ...body, room: me.roomCode, token: me.token });
    // 人机对战：服务端正在结算 AI 回合，先乐观显示"思考中"
    if (state && state.ai && !state.over) {
      $('#turn-banner').textContent = '🤖 AI 思考中…';
      $('#turn-banner').classList.add('aiwait');
      const actor = state.controller >= 0 ? state.controller : state.turn;
      if (actor === me.idx) { $('#controls').innerHTML = '<div class="wait-msg">🤖 AI 思考中…</div>'; }
    }
    poll();
  } catch (e) { toast(e.message); }
  finally { sending = false; ctl.classList.remove('sending'); }
}

function setMe(d) {
  me = { name: d.name, roomCode: d.roomCode, token: d.token, idx: d.playerIdx };
  save();
  connectStream();
}

// 状态同步：优先 SSE 实时推送（自建服务器），断开自动回退轮询（兼容 Vercel）
// 轮询自适应节奏：轮到自己决策时慢速轮询（省流量/Redis 额度），等待对方时快速轮询（响应快）
let sse = null, sseBroken = false;
function connectStream() {
  stopPoll();
  sseBroken = false;
  openSSE();
  poll();
  schedulePoll();
}
function openSSE() {
  if (sseBroken || sse || typeof EventSource === 'undefined' || !me.token) return;
  try {
    sse = new EventSource(`/api/stream?room=${encodeURIComponent(me.roomCode)}&token=${encodeURIComponent(me.token)}`);
  } catch (e) { sseBroken = true; return; }
  sse.onmessage = (ev) => {
    try { state = JSON.parse(ev.data); render(); } catch (e) { /* 忽略坏帧 */ }
  };
  sse.onerror = () => { closeSSE(); sseBroken = true; schedulePoll(); }; // 推流断开 → 回退轮询
}
function closeSSE() { if (sse) { try { sse.close(); } catch (e) {} sse = null; } }
function stopPoll() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } closeSSE(); }
function schedulePoll() {
  if (pollTimer) clearInterval(pollTimer);
  if (sse) { pollTimer = setInterval(poll, 8000); return; } // SSE 在线：慢速兜底轮询
  const myTurn = state && (state.controller >= 0 ? state.controller : state.turn) === me.idx;
  const isDeciding = myTurn && state.step === 'awaitAction';
  pollTimer = setInterval(poll, isDeciding ? 2500 : 1100);
}
async function poll() {
  if (!me.token) return;
  try {
    const res = await fetch(`/api/state?room=${encodeURIComponent(me.roomCode)}&token=${encodeURIComponent(me.token)}`);
    if (!res.ok) return;
    state = await res.json();
    render();
    schedulePoll();
  } catch (e) { /* 瞬时网络错误，下一轮自动重试 */ }
}

// ---------- 大厅 ----------
async function doCreate() {
  const name = $('#name-input').value.trim();
  if (!name) { $('#lobby-err').textContent = '请输入昵称'; return; }
  try { setMe(await api('/api/hello', { name, roomCode: null })); }
  catch (e) { $('#lobby-err').textContent = e.message; }
}
async function doCreateAI() {
  const name = $('#name-input').value.trim();
  if (!name) { $('#lobby-err').textContent = '请输入昵称'; return; }
  try { setMe(await api('/api/hello', { name, ai: true, difficulty: $('#ai-diff').value })); }
  catch (e) { $('#lobby-err').textContent = e.message; }
}
async function doJoin() {
  const name = $('#name-input').value.trim();
  const code = $('#code-input').value.trim().toUpperCase();
  if (!name) { $('#lobby-err').textContent = '请输入昵称'; return; }
  if (code.length !== 4) { $('#lobby-err').textContent = '请输入4位房间码'; return; }
  try { setMe(await api('/api/hello', { name, roomCode: code })); }
  catch (e) { $('#lobby-err').textContent = e.message; }
}
function doLeave() {
  stopPoll();
  me = { name: '', roomCode: '', token: '', idx: -1 };
  save();
  state = null;
  render();
}

// ---------- 渲染 ----------
function render() {
  $('#btn-leave').classList.toggle('hidden', !me.token);
  $('#roominfo').textContent = me.token && state ? `房间 ${state.roomCode}` : '';

  if (!me.token) {
    TW_FX.reset();
    $('#lobby').classList.remove('hidden');
    $('#waiting').classList.add('hidden');
    $('#game').classList.add('hidden');
    $('#ban').classList.add('hidden');
    $('#result-modal').classList.add('hidden');
    return;
  }
  if (!state) return;
  const inWaiting = state.phase === 'waiting';
  const inBan = state.phase === 'banning';
  $('#lobby').classList.add('hidden');
  $('#waiting').classList.toggle('hidden', !inWaiting);
  $('#ban').classList.toggle('hidden', !inBan);
  $('#game').classList.toggle('hidden', inWaiting || inBan);

  if (inWaiting || inBan) TW_FX.reset();
  if (inWaiting) {
    $('#bigcode').textContent = state.roomCode;
    const link = `${location.origin}${location.pathname}?room=${state.roomCode}`;
    $('#invite-link').href = link;
    $('#invite-link').textContent = link;
    return;
  }
  if (inBan) { renderBan(); return; }
  renderGame();
}

// 盲ban 界面：从全部技能里挑一个禁用（支持费用筛选 + 名称搜索）
let banCost = -1, banQuery = '', banToolsBuilt = false;
function renderBan() {
  const myIdx = me.idx;
  const picked = state.banPicks && state.banPicks[myIdx];
  const sub = $('#ban-sub');
  const grid = $('#ban-grid');
  const tools = $('#ban-tools');
  if (picked) {
    sub.textContent = '✅ 你已选择禁用，等待对方…（都选完后公示）';
    tools.innerHTML = '';
    banToolsBuilt = false;
    grid.innerHTML = '<div class="wait-msg">⏳ 等待对方禁用…</div>';
    return;
  }
  sub.textContent = '🔒 盲ban：从全部技能里选 1 个禁用（双方同时选、可重复，都选完公示）。';
  // 工具栏只建一次，避免输入时焦点被打断
  if (!banToolsBuilt) {
    banCost = -1; banQuery = '';
    const costs = Object.keys(state.catalog).map(Number).sort((a, b) => a - b);
    tools.innerHTML = `
      <div class="ban-tools">
        <input id="ban-search" placeholder="搜索技能名…" maxlength="12">
        <div class="ban-chips">
          <button class="chip on" data-cost="-1">全部</button>
          ${costs.map((c) => `<button class="chip" data-cost="${c}">${c}$</button>`).join('')}
        </div>
      </div>`;
    $('#ban-search').addEventListener('input', (e) => { banQuery = e.target.value.trim(); renderBanGrid(); });
    tools.querySelectorAll('[data-cost]').forEach((c) => {
      c.onclick = () => {
        banCost = Number(c.dataset.cost);
        tools.querySelectorAll('[data-cost]').forEach((x) => x.classList.toggle('on', x === c));
        renderBanGrid();
      };
    });
    banToolsBuilt = true;
  }
  renderBanGrid();
}
function renderBanGrid() {
  const grid = $('#ban-grid');
  const skills = [];
  for (const d of Object.keys(state.catalog)) {
    for (const s of state.catalog[d]) skills.push({ ...s, digit: d });
  }
  const shown = skills.filter((s) =>
    (banCost < 0 || Number(s.digit) === banCost) && (!banQuery || s.name.includes(banQuery)));
  grid.innerHTML = shown.map((s) => `
    <button class="ban-skill theme-${(SKILL_ART[s.id] || SKILL_ART._def).theme}" data-ban="${s.id}" title="${esc(s.desc)}">
      <span class="ban-cost">${s.digit}$</span>
      <span class="ban-name">${esc(s.name)}</span>
      <span class="ban-desc">${esc(s.desc)}</span>
    </button>`).join('') || '<div class="wait-msg">没有匹配的技能</div>';
  grid.querySelectorAll('[data-ban]').forEach((b) => {
    b.onclick = () => send({ type: 'ban', skillId: b.dataset.ban });
  });
}

function hpWidth(hp) { return Math.max(0, Math.min(100, (hp / Math.max(21, hp)) * 100)); }

// 血量飘字 + 受伤闪光（跨渲染跟踪上一帧血量）
const _prevHp = [-1, -1];
function renderPlayerCard(el, p, label, active) {
  el.classList.toggle('active', active);
  const idx = state.players.indexOf(p);
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
  const isCtrl = state.controller >= 0 && state.players.indexOf(p) === state.controller;
  const hpPct = hpWidth(p.hp);
  const hpClass = p.hp > 15 ? 'good' : (p.hp > 7 ? 'mid' : 'low');
  el.innerHTML = `
    <div class="p-head">
      <span class="p-name">${esc(label)} · ${esc(p.name)}${isCtrl ? ' 🧠' : ''}</span>
      <span class="energy-badge" title="实际费用">费用 ${p.energy}$</span>
    </div>
    <div class="hp-row">
      <div class="hp-bar"><div class="hp-fill ${hpClass}" style="width:${hpPct}%"></div></div>
      <span class="hp-num">${p.hp}</span>${dmgNum}
    </div>
    <div class="hands">
      <div class="hand-box energy" title="费用手">
        ${handSVG(p.energy)}
        <div class="hand-digit energy">${p.energy}</div>
      </div>
      <div class="hand-box skill" title="技能手">
        ${handSVG(p.skill)}
        <div class="hand-digit skill">${p.skill}</div>
      </div>
    </div>
    <div class="buffs">${p.buffs.map((b) => `<span class="buff" data-key="${b.key}" title="${esc(b.detail)}">${esc(b.name)}${b.detail ? '·' + esc(b.detail) : ''}</span>`).join('')}</div>
  `;
}

// 只在"有变化"的那次渲染触发动画（避免每次轮询都闪）
let _lastLogLen = 0;
function renderGame() {
  const changed = _lastLogLen !== state.log.length;
  _lastLogLen = state.log.length;
  const gameEl = $('#game');
  if (changed) {
    gameEl.classList.add('anim');
    clearTimeout(gameEl._animT);
    gameEl._animT = setTimeout(() => gameEl.classList.remove('anim'), 520);
    if (window.TW_SFX) TW_SFX.whoosh();
  }
  const myIdx = me.idx;
  const oppIdx = 1 - myIdx;
  const meP = state.players[myIdx];
  const oppP = state.players[oppIdx];
  renderBanSummary($('#ban-summary'), state.banned, state.catalog);
  renderPlayerCard($('#me-card'), meP, '我', state.turn === myIdx);
  renderPlayerCard($('#opp-card'), oppP, '对手', state.turn === oppIdx);

  const actor = state.controller >= 0 ? state.controller : state.turn;
  let b;
  if (state.over) {
    b = state.result === 'draw' ? '🤝 平局' : `🏆 ${state.players[state.winner].name} 获胜！`;
  } else if (state.ai && actor !== myIdx) {
    b = '🤖 AI 思考中…'; // 人机对战，轮到 AI（服务端结算）
  } else if (state.controller === myIdx) {
    b = `🧠 你在控制 ${oppP.name} 的回合`;
  } else if (state.turn === myIdx && state.controller >= 0) {
    b = `🧠 你的回合被 ${state.players[state.controller].name} 控制`;
  } else if (state.turn === myIdx) {
    b = '🎯 你的回合';
  } else {
    b = '⏳ 等待对方操作…';
  }
  $('#turn-banner').textContent = b;
  $('#turn-banner').classList.toggle('myturn', !state.over && actor === myIdx);
  $('#turn-banner').classList.toggle('aiwait', !!state.ai && actor !== myIdx && !state.over);
  renderControls(actor);
  renderLog();
  renderResult();
  const cards = []; cards[me.idx] = $('#me-card'); cards[1 - me.idx] = $('#opp-card');
  TW_FX.sync(state, cards, state.catalog);
}

function renderControls(actor) {
  const el = $('#controls');
  if (state.over) { el.innerHTML = ''; return; }
  const myIdx = me.idx;
  const turnP = state.players[state.turn];       // 本回合出招者（被尤里控制时是被控制者）
  const oppP = state.players[1 - state.turn];    // 对方（相加/公平正义的目标）
  const canAdd = actor === myIdx && state.step === 'awaitAdd';
  const canAct = actor === myIdx && state.step === 'awaitAction';

  if (!canAdd && !canAct) {
    let msg = '等待对方操作…';
    if (state.turn === myIdx && state.controller >= 0) msg = '你的回合被对方控制中…';
    else if (state.controller === myIdx) msg = `你在控制 ${turnP.name} 的回合…`;
    else if (actor === myIdx) msg = '本回合由系统自动进行…';
    el.innerHTML = `<div class="wait-msg">${msg}</div>`;
    return;
  }
  const ctrlNote = state.controller === myIdx ? `🧠 正在控制 ${turnP.name} 的回合：` : '';
  if (canAdd) {
    el.innerHTML = `<div class="prompt">${ctrlNote}选择相加的手，预览下一步可用技能。</div>` + addChoicesHTML(turnP, oppP, state.catalog, state.banned);
    el.querySelectorAll('[data-add]').forEach((btn) => { btn.onclick = () => send({ type: 'add', choice: Number(btn.dataset.add) }); });
    return;
  }
  // awaitAction（注意：动作用的是出招者 turnP 的技能手/费用，不是控制者的）
  const digit = turnP.skill;
  const locked = (turnP.streak || 0) >= 24; // 连出技能上限
  const afford = turnP.energy >= digit && !locked;
  const skills = state.catalog[digit] || [];
  let html = `<div class="prompt">${ctrlNote}技能手 = <b>${digit}</b>，费用 <b>${digit}$</b>（当前 ${turnP.energy}$）${locked ? ' <b style="color:#ff5d73">⚠ 连续出技能已达24次，只能空过</b>' : ''}${state.chainCount >= 3 ? `，数字连携 <b>${state.chainCount}</b> 次！` : ''}</div>`;
  html += '<div class="skill-grid">';
  let vis = 0;
  skills.forEach((sk, i) => {
    if (state.banned && state.banned.indexOf(sk.id) >= 0) return; // 被禁技能不显示
    vis++;
    html += skillCardHTML(sk, digit, afford && !(sk.id === 'duming' && turnP.dumingUsed), `data-skill="${i}"`, vis);
  });
  html += `</div><button id="btn-pass" class="pass-btn">空过（结束回合）</button><div class="kbd-hint">提示：数字键选技能 · P 键空过</div>`;
  el.innerHTML = html;
  el.querySelectorAll('[data-skill]').forEach((btn) => { btn.onclick = () => chooseSkill(Number(btn.dataset.skill), actor); });
  $('#btn-pass').onclick = () => send({ type: 'pass' });
}

function chooseSkill(skillIdx, actor) {
  const turnP = state.players[state.turn];
  const digit = turnP.skill;
  const sk = (state.catalog[digit] || [])[skillIdx];
  if (!sk) return;
  if (sk.id === 'gongping') {
    const oppP = state.players[1 - state.turn];
    const list = oppP.positiveBuffs || [];
    if (!list.length) { send({ type: 'act', skillIdx }); return; }
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
      send({ type: 'act', skillIdx, buffIdx: v });
    };
    overlay.querySelector('#buffcancel').onclick = () => overlay.remove();
    return;
  }
  send({ type: 'act', skillIdx });
}

let _lastLogKey = '';
function renderLog() {
  const el = $('#log');
  const items = state.log.slice(-80); // 只显示最近 80 条，更早的自动裁掉
  const key = items.length + '|' + (items[items.length - 1] || '');
  if (key === _lastLogKey) return; // 日志无变化，跳过重建
  const stick = el.scrollHeight - el.scrollTop - el.clientHeight < 60; // 本在底部→跟随最新
  _lastLogKey = key;
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
  else { const j = $('#log-jump'); if (j) j.classList.remove('hidden'); }
}

function renderResult() {
  const modal = $('#result-modal');
  modal.classList.toggle('hidden', !state.over);
  if (!state.over) return;
  const myIdx = me.idx;
  $('#result-title').textContent = state.result === 'draw' ? '🤝 平局！' : (state.winner === myIdx ? '🎉 你赢了！' : '💀 你输了');
  $('#result-sub').textContent = state.result === 'draw' ? '本局平局' : `胜者：${state.players[state.winner].name}`;
  const want = state.rematch[myIdx];
  $('#btn-rematch').disabled = want;
  $('#rematch-hint').textContent = want ? '等待对方确认再来一局…' : (state.rematch[1 - myIdx] ? '对方想再来一局' : '');
}

// ---------- 初始化 ----------
$('#btn-create').onclick = doCreate;
$('#btn-create-ai').onclick = doCreateAI;
$('#btn-join').onclick = doJoin;
$('#btn-leave').onclick = doLeave;
$('#btn-rules').onclick = () => $('#rules-modal').classList.remove('hidden');
$('#btn-rules-close').onclick = () => $('#rules-modal').classList.add('hidden');
$('#rules-modal').onclick = (e) => { if (e.target === $('#rules-modal')) $('#rules-modal').classList.add('hidden'); };
$('#result-modal').onclick = (e) => { if (e.target === $('#result-modal')) $('#result-modal').classList.add('hidden'); };
$('#btn-copy').onclick = () => {
  const link = $('#invite-link').textContent;
  navigator.clipboard.writeText(link).then(() => toast('已复制邀请链接'), () => toast('复制失败，请手动复制'));
};
$('#btn-rematch').onclick = () => send({ type: 'rematch' });
$('#name-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') document.querySelector('.home-entry-panel:not(.hidden) .primary')?.click(); });
$('#code-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });

// ---------- 日志滚动：上翻阅读不被拉回，点「最新」回底部 ----------
{
  const log = document.querySelector('#log');
  const jump = document.querySelector('#log-jump');
  if (log && jump) {
    log.addEventListener('scroll', () => {
      if (log.scrollHeight - log.scrollTop - log.clientHeight < 60) jump.classList.add('hidden');
    }, { passive: true });
    jump.onclick = () => { log.scrollTop = log.scrollHeight; jump.classList.add('hidden'); };
  }
}

// ---------- 键盘操作：数字键选相加/技能，P 空过，Esc 关弹窗 ----------
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { $('#rules-modal').classList.add('hidden'); return; }
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  const ael = document.activeElement;
  if (ael && (ael.tagName === 'INPUT' || ael.tagName === 'TEXTAREA' || ael.tagName === 'SELECT')) return;
  if (document.querySelector('.modal:not(.hidden)')) return;
  if (!me.token || !state || state.over) return;
  const actor = state.controller >= 0 ? state.controller : state.turn;
  if (actor !== me.idx) return;
  if (state.step === 'awaitAdd') {
    if (e.key === '1') { const b = document.querySelector('#controls [data-add="0"]'); if (b) b.click(); }
    else if (e.key === '2') { const b = document.querySelector('#controls [data-add="1"]'); if (b) b.click(); }
  } else if (state.step === 'awaitAction') {
    if (/^[1-9]$/.test(e.key)) {
      const btns = document.querySelectorAll('#controls [data-skill]');
      const b = btns[Number(e.key) - 1];
      if (b && !b.disabled) b.click();
    } else if (e.key === 'p' || e.key === 'P') {
      const b = document.querySelector('#btn-pass');
      if (b) b.click();
    }
  }
});

// 自动重连 / 一键加入 / 从邀请链接进入
(async () => {
  const params = new URLSearchParams(location.search);
  const roomFromUrl = (params.get('room') || '').trim().toUpperCase();
  const nameFromUrl = (params.get('name') || '').trim().slice(0, 12);
  if (me.token && me.roomCode) {
    if (!roomFromUrl || me.roomCode === roomFromUrl) {
      try {
        const d = await api('/api/hello', { name: me.name, roomCode: me.roomCode, token: me.token });
        setMe(d);
        return;
      } catch (e) { /* 会话失效，走下面的流程 */ }
    }
    me = { name: me.name, roomCode: '', token: '', idx: -1 };
    save();
  }
  if (roomFromUrl) {
    const name = nameFromUrl || me.name || ('玩家' + Math.random().toString(36).slice(2, 6).toUpperCase());
    try {
      const d = await api('/api/hello', { name, roomCode: roomFromUrl });
      setMe(d);
      return;
    } catch (e) {
      $('#lobby-err').textContent = `${e.message}。可让房主重新开房发新链接，或在下方自己创建房间。`;
    }
    $('#code-input').value = roomFromUrl;
    $('#name-input').value = name;
  }
  render();
})();
