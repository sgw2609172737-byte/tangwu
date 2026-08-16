'use strict';
// 《唐五》客户端：状态渲染 + 操作提交（服务器权威结算）
const $ = (s) => document.querySelector(s);

let state = null;
let me = (() => { try { return JSON.parse(localStorage.getItem('tangwu_v1') || 'null'); } catch (e) { return null; } })()
  || { name: '', roomCode: '', token: '', idx: -1 };
let pollTimer = null;
let toastTimer = null;

function save() { localStorage.setItem('tangwu_v1', JSON.stringify(me)); }
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

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

async function send(body) {
  try { await api('/api/action', { ...body, room: me.roomCode, token: me.token }); poll(); }
  catch (e) { toast(e.message); }
}

function setMe(d) {
  me = { name: d.name, roomCode: d.roomCode, token: d.token, idx: d.playerIdx };
  save();
  connectStream();
}

// 短轮询同步（兼容自建服务器与 Vercel：统一走 GET /api/state）
// 自适应节奏：轮到自己决策时慢速轮询（省 Redis 额度），等待对方时快速轮询（响应快）
function connectStream() {
  stopPoll();
  poll();
  schedulePoll();
}
function stopPoll() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }
function schedulePoll() {
  stopPoll();
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

// ---------- 手势 SVG ----------
function handSVG(d) {
  const G = { 1: ['i'], 2: ['i', 'm'], 3: ['i', 'm', 'r'], 4: ['i', 'm', 'r', 'p'], 5: ['i', 'm', 'r', 'p', 't'], 6: ['t', 'p'], 7: ['i', 'm', 'r'], 8: ['t', 'i'], 9: ['i'], 10: [], 11: ['i', 'p'] }[d] || [];
  const solid = d === 10;
  const fingers = [
    { id: 't', x: 26, ang: -26 },
    { id: 'i', x: 39, ang: 0 },
    { id: 'm', x: 50, ang: 0 },
    { id: 'r', x: 61, ang: 0 },
    { id: 'p', x: 72, ang: 0 },
  ];
  let parts = '';
  for (const f of fingers) {
    const up = G.includes(f.id);
    const y = up ? 14 : 46, h = up ? 40 : 12;
    parts += `<rect x="${f.x - 5}" y="${y}" width="10" height="${h}" rx="5" fill="${up ? '#ffd9a8' : '#d8a26e'}" stroke="#8a5a2b" stroke-width="1.5" transform="rotate(${f.ang} ${f.x} ${y + 6})"/>`;
  }
  const label = { 0: '0·空心拳', 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6·电话', 7: '7·捏合', 8: '8·直角', 9: '9·钩', 10: '10·实心拳', 11: '11·食小指' }[d] || d;
  return `<svg class="hand" viewBox="0 0 100 92" role="img" aria-label="${label}">
    ${parts}
    <ellipse cx="50" cy="78" rx="34" ry="16" fill="${solid ? '#e8a060' : '#ffd9a8'}" stroke="#8a5a2b" stroke-width="1.5"/>
    <text x="50" y="91" text-anchor="middle" class="hand-txt">${label}</text>
  </svg>`;
}

// ---------- 渲染 ----------
function render() {
  $('#btn-leave').classList.toggle('hidden', !me.token);
  $('#roominfo').textContent = me.token && state ? `房间 ${state.roomCode}` : '';

  if (!me.token) {
    $('#lobby').classList.remove('hidden');
    $('#waiting').classList.add('hidden');
    $('#game').classList.add('hidden');
    return;
  }
  if (!state) return;
  const inWaiting = state.phase === 'waiting';
  $('#lobby').classList.add('hidden');
  $('#waiting').classList.toggle('hidden', !inWaiting);
  $('#game').classList.toggle('hidden', inWaiting);

  if (inWaiting) {
    $('#bigcode').textContent = state.roomCode;
    const link = `${location.origin}${location.pathname}?room=${state.roomCode}`;
    $('#invite-link').href = link;
    $('#invite-link').textContent = link;
    return;
  }
  renderGame();
}

function hpWidth(hp) { return Math.max(0, Math.min(100, (hp / 30) * 100)); }

function renderPlayerCard(el, p, label, active) {
  el.classList.toggle('active', active);
  const isCtrl = state.controller >= 0 && state.players.indexOf(p) === state.controller;
  el.innerHTML = `
    <div class="p-head">
      <span class="p-name">${esc(label)} · ${esc(p.name)}${isCtrl ? ' 🧠' : ''}</span>
    </div>
    <div class="hp-row">
      <span class="hp-label">HP</span>
      <div class="hp-bar"><div class="hp-fill" style="width:${hpWidth(p.hp)}%"></div></div>
      <span class="hp-num">${p.hp}</span>
    </div>
    <div class="hands">
      <div class="hand-box"><div class="hand-label">能量手</div>${handSVG(p.shownE)}<div class="hand-sub">实际能量 <b>${p.energy}</b></div></div>
      <div class="hand-box"><div class="hand-label">技能手</div>${handSVG(p.skill)}<div class="hand-sub">数字 <b>${p.skill}</b></div></div>
    </div>
    <div class="buffs">${p.buffs.map((b) => `<span class="buff" data-key="${b.key}" title="${esc(b.detail)}">${esc(b.name)}${b.detail ? '·' + esc(b.detail) : ''}</span>`).join('')}</div>
  `;
}

function renderGame() {
  const myIdx = me.idx;
  const oppIdx = 1 - myIdx;
  const meP = state.players[myIdx];
  const oppP = state.players[oppIdx];
  renderPlayerCard($('#me-card'), meP, '我', state.turn === myIdx);
  renderPlayerCard($('#opp-card'), oppP, '对手', state.turn === oppIdx);

  const actor = state.controller >= 0 ? state.controller : state.turn;
  let b;
  if (state.over) {
    b = state.result === 'draw' ? '🤝 平局' : `🏆 ${state.players[state.winner].name} 获胜！`;
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
  renderControls(actor);
  renderLog();
  renderResult();
}

function renderControls(actor) {
  const el = $('#controls');
  if (state.over) { el.innerHTML = ''; return; }
  const myIdx = me.idx;
  const actorP = state.players[actor];
  const oppOfActor = state.players[1 - actor];
  const canAdd = actor === myIdx && state.step === 'awaitAdd';
  const canAct = actor === myIdx && state.step === 'awaitAction';

  if (!canAdd && !canAct) {
    let msg = '等待对方操作…';
    if (state.turn === myIdx && state.controller >= 0) msg = '你的回合被对方控制中…';
    else if (state.controller === myIdx) msg = `你在控制 ${oppOfActor.name} 的回合…`;
    else if (actor === myIdx) msg = '本回合由系统自动进行…';
    el.innerHTML = `<div class="wait-msg">${msg}</div>`;
    return;
  }
  if (canAdd) {
    el.innerHTML = `
      <div class="prompt">👉 技能手必须与对方一只手相加（取和的个位）。选择：</div>
      <div class="add-btns">
        <button class="big-btn" data-add="0">➕ 加对方能量手 <b>${oppOfActor.shownE}</b></button>
        <button class="big-btn" data-add="1">➕ 加对方技能手 <b>${oppOfActor.skill}</b></button>
      </div>`;
    el.querySelectorAll('[data-add]').forEach((btn) => { btn.onclick = () => send({ type: 'add', choice: Number(btn.dataset.add) }); });
    return;
  }
  // awaitAction
  const digit = actorP.skill;
  const afford = actorP.energy >= digit;
  const skills = state.catalog[digit] || [];
  let html = `<div class="prompt">技能手 = <b>${digit}</b>，消耗 <b>${digit}</b> 能量（当前能量 ${actorP.energy}）${state.chainCount >= 3 ? `，数字连携 <b>${state.chainCount}</b> 次！` : ''}</div>`;
  html += '<div class="skill-grid">';
  skills.forEach((sk, i) => {
    html += `<button class="skill-card ${afford ? '' : 'disabled'}" data-skill="${i}" ${afford ? '' : 'disabled'}>
      <div class="sk-name">${sk.star ? '★' : ''}${esc(sk.name)}</div>
      <div class="sk-desc">${esc(sk.desc)}</div>
      <div class="sk-cost">费用 ${digit}</div>
      ${sk.isDigit ? '<div class="sk-tag">数字</div>' : ''}
    </button>`;
  });
  html += `</div><button id="btn-pass" class="pass-btn">空过（结束回合）</button>`;
  el.innerHTML = html;
  el.querySelectorAll('[data-skill]').forEach((btn) => { btn.onclick = () => chooseSkill(Number(btn.dataset.skill), actor); });
  $('#btn-pass').onclick = () => send({ type: 'pass' });
}

function chooseSkill(skillIdx, actor) {
  const digit = state.players[actor].skill;
  const sk = (state.catalog[digit] || [])[skillIdx];
  if (!sk) return;
  if (sk.id === 'gongping') {
    const oppP = state.players[1 - actor];
    const list = oppP.positiveBuffs || [];
    if (!list.length) { send({ type: 'act', skillIdx }); return; }
    const overlay = document.createElement('div');
    overlay.className = 'modal';
    overlay.innerHTML = `
      <div class="modal-box">
        <h2>去除对方哪个正面buff？</h2>
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

function renderLog() {
  const el = $('#log');
  const items = state.log.slice(-150);
  el.innerHTML = items.map((t) => `<div class="log-line">${esc(t)}</div>`).join('');
  el.scrollTop = el.scrollHeight;
}

function renderResult() {
  const modal = $('#result-modal');
  modal.classList.toggle('hidden', !state.over);
  if (!state.over) return;
  const myIdx = me.idx;
  $('#result-title').textContent = state.result === 'draw' ? '🤝 平局！' : (state.winner === myIdx ? '🎉 你赢了！' : '💀 你输了');
  $('#result-sub').textContent = state.result === 'draw' ? '双方同时倒下' : `胜者：${state.players[state.winner].name}`;
  const want = state.rematch[myIdx];
  $('#btn-rematch').disabled = want;
  $('#rematch-hint').textContent = want ? '等待对方确认再来一局…' : (state.rematch[1 - myIdx] ? '对方想再来一局' : '');
}

// ---------- 初始化 ----------
$('#btn-create').onclick = doCreate;
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
$('#name-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') doCreate(); });
$('#code-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });

// 自动重连 / 一键加入 / 从邀请链接进入
(async () => {
  const params = new URLSearchParams(location.search);
  const roomFromUrl = (params.get('room') || '').trim().toUpperCase();
  const nameFromUrl = (params.get('name') || '').trim().slice(0, 12);
  // 已有会话：目标房间一致（或无目标）→ 重连恢复；否则清空会话
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
    // 一键加入：无需输入昵称、无需点击任何按钮
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
