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

async function send(body) {
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
        ${handSVG(p.shownE)}
        <div class="hand-digit energy">${p.shownE}</div>
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
    gameEl._animT = setTimeout(() => gameEl.classList.remove('anim'), 420);
    if (window.TW_SFX) TW_SFX.whoosh();
  }
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
  $('#turn-banner').classList.toggle('myturn', !state.over && (state.turn === myIdx || state.controller === myIdx));
  $('#turn-banner').classList.toggle('aiwait', !!state.ai && actor !== myIdx && !state.over);
  renderControls(actor);
  renderLog();
  renderResult();
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
    el.innerHTML = `
      <div class="prompt">${ctrlNote}👉 技能手与对方一只手相加（取个位），选一个数字：</div>
      <div class="add-btns">
        <button class="add-num" data-add="0">${oppP.shownE}</button>
        <button class="add-num" data-add="1">${oppP.skill}</button>
      </div>`;
    el.querySelectorAll('[data-add]').forEach((btn) => { btn.onclick = () => send({ type: 'add', choice: Number(btn.dataset.add) }); });
    return;
  }
  // awaitAction（注意：动作用的是出招者 turnP 的技能手/费用，不是控制者的）
  const digit = turnP.skill;
  const afford = turnP.energy >= digit;
  const skills = state.catalog[digit] || [];
  let html = `<div class="prompt">${ctrlNote}技能手 = <b>${digit}</b>，费用 <b>${digit}$</b>（当前 ${turnP.energy}$）${state.chainCount >= 3 ? `，数字连携 <b>${state.chainCount}</b> 次！` : ''}</div>`;
  html += '<div class="skill-grid">';
  skills.forEach((sk, i) => {
    html += skillCardHTML(sk, digit, afford, `data-skill="${i}"`);
  });
  html += `</div><button id="btn-pass" class="pass-btn">空过（结束回合）</button>`;
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
        <h2>优先去除对方哪个正面buff？（共去除2层）</h2>
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
  el.innerHTML = items.map((t) => {
    let cls = '';
    if (/伤害|秒杀|击败|败北|清零|倒下/.test(t)) cls = 'dmg';
    else if (/回复|加血|\+\d+血|治疗/.test(t)) cls = 'heal';
    else if (/费用/.test(t)) cls = 'nrg';
    else if (/生效|就绪|召唤|控制|冰封|剧毒|中毒|强化|互换/.test(t)) cls = 'sys';
    return `<div class="log-line ${cls}">${esc(t)}</div>`;
  }).join('');
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
$('#name-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') doCreate(); });
$('#code-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });

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
