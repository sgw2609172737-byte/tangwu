'use strict';
// 唐五本地版控制器：驱动引擎 + 渲染 + 人机/AI观战调度（复用 ui.js / style.css）
const $ = (s) => document.querySelector(s);
const TW = window.__TW_engine;
const SK = window.__TW_skills;
const AI = window.__TWAI;

let cfg = { mode: 'pve', diff: 'normal' };
let G = null;
let aiTimer = null;
let toastTimer = null;

// 线上联机地址（改成你的在线版网址；留空则隐藏"线上联机"按钮）
const ONLINE_URL = 'https://tang5.vercel.app/';

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
}

// ---------- 菜单 ----------
function setOn(sel, btn) { $(sel).querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === btn)); }
$('#mode-seg').querySelectorAll('button').forEach((b) => { b.onclick = () => { setOn('#mode-seg', b); cfg.mode = b.dataset.mode; $('#diff-row').style.display = (cfg.mode === 'pve' ? 'flex' : 'none'); }; });
$('#diff-seg').querySelectorAll('button').forEach((b) => { b.onclick = () => { setOn('#diff-seg', b); cfg.diff = b.dataset.diff; }; });
$('#btn-start').onclick = startGameLocal;
$('#btn-back').onclick = backToMenu;
$('#btn-menu').onclick = () => { $('#result-modal').classList.add('hidden'); backToMenu(); };
$('#btn-again').onclick = () => { $('#result-modal').classList.add('hidden'); startGameLocal(); };

// 线上联机：应用版用系统浏览器打开（Electron 经 preload 暴露 openExternal），网页版直接新窗口
if (ONLINE_URL) {
  $('#btn-online').onclick = () => {
    if (window.openExternal) window.openExternal(ONLINE_URL);
    else window.open(ONLINE_URL, '_blank');
  };
} else {
  $('#btn-online').classList.add('hidden');
}

function backToMenu() {
  clearTimeout(aiTimer);
  G = null;
  $('#game').classList.add('hidden');
  $('#btn-back').classList.add('hidden');
  $('#menu').classList.remove('hidden');
}

function names() {
  if (cfg.mode === 'pve') return ['你', 'AI'];
  if (cfg.mode === 'pvp') return ['玩家1', '玩家2'];
  return ['AI·红', 'AI·蓝'];
}
function actorOf(g) { return g.controller >= 0 ? g.controller : g.turn; }

function startGameLocal() {
  $('#menu').classList.add('hidden');
  $('#btn-back').classList.remove('hidden');
  $('#game').classList.remove('hidden');
  G = TW.createGame(names());
  TW.startGame(G);
  render();
  scheduleAI();
}

// ---------- 渲染 ----------
function buffChips(p) {
  const chips = [];
  const push = (key, name, detail) => chips.push(`<span class="buff" data-key="${key}" title="${esc(detail)}">${esc(name)}${detail ? '·' + esc(detail) : ''}</span>`);
  if (p.jingji) push('jingji', '荆棘', '反弹一次伤害');
  if (p.wudi) push('wudi', '无敌', '抵挡一次攻击+2血');
  if (p.yingneng.active) push('yingneng', '盈能', `闲置${p.yingneng.idle}回合`);
  if (p.shuangbei > 0) push('shuangbei', '双倍圣水', `每回合+${p.shuangbei}$`);
  if (p.huxi > 0) push('huxi', '呼吸回血', `每回合+${p.huxi}血`);
  if (p.qianghua) push('qianghua', '强化', '★技能加血+2');
  if (p.bishi) push('bishi', '鄙视', '被动偷费用');
  if (p.tanghua) push('tanghua', '假人唐化', '假人可无限召唤');
  if (p.cuidu) push('cuidu', '淬毒', '攻击附带1毒伤');
  if (p.dummy.alive) push('dummy', '假人', `${p.dummy.hp}血`);
  if (p.inDummyCombat) push('dummyC', '假人作战', '灵魂在假人中');
  if (p.qibu.stage === 1) push('qibu', '七步', '每回合结束-4');
  if (p.qibu.stage === 2) push('qibu', '七步', '每回合结束-3');
  if (p.duming.active) push('duming', '赌命', `剩${p.duming.turnsLeft}回合`);
  if (p.freeze > 0) push('freeze', '冰封', `${p.freeze}回合`);
  if (p.chaofeng.pending) push('chaofeng', '嘲讽', '待触发');
  if (p.huanwuSkip) push('huanwu', '幻雾', '下回合跳过相加');
  if (p.delayed.length) push('delayed', '延迟伤害', p.delayed.map((d) => d.desc).join('+'));
  return chips.join('');
}

function renderCard(el, p, idx) {
  const active = !G.over && actorOf(G) === idx;
  el.classList.toggle('active', active);
  const hpPct = Math.max(0, Math.min(100, (p.hp / 30) * 100));
  const hpCls = p.hp > 15 ? 'good' : (p.hp > 7 ? 'mid' : 'low');
  const ctrlMark = G.controller === idx ? ' 🧠' : '';
  el.innerHTML = `
    <div class="p-head"><span class="p-name">${esc(p.name)}${ctrlMark}</span><span class="energy-badge" title="实际费用">费用 ${p.energy}$</span></div>
    <div class="hp-row"><div class="hp-bar"><div class="hp-fill ${hpCls}" style="width:${hpPct}%"></div></div><span class="hp-num">${p.hp}</span></div>
    <div class="hands">
      <div class="hand-box energy" title="费用手">${handSVG(p.energy % 10)}<div class="hand-digit energy">${p.energy % 10}</div></div>
      <div class="hand-box skill" title="技能手">${handSVG(p.skill)}<div class="hand-digit skill">${p.skill}</div></div>
    </div>
    <div class="buffs">${buffChips(p)}</div>`;
}

function render() {
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
}

function renderLog() {
  const el = $('#log');
  const items = G.log.slice(-150);
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

function renderControls() {
  const el = $('#controls');
  if (G.over) { el.innerHTML = ''; return; }
  const turnP = G.players[G.turn];
  const oppP = G.players[1 - G.turn];
  const humanDecides = (cfg.mode === 'pvp') || actorOf(G) === 0; // 人机：你是0号，AI是1号
  if (!humanDecides) {
    let msg = (cfg.mode === 'ai') ? '🤖 AI 对战中…' : '🤖 AI 思考中…';
    if (cfg.mode === 'pve' && G.turn === 0 && G.controller >= 0) msg = '你的回合被 AI 控制中…';
    el.innerHTML = `<div class="wait-msg">${msg}</div>`;
    return;
  }
  const ctrlNote = (cfg.mode === 'pve' && G.controller === 0) ? `🧠 你在控制 ${turnP.name} 的回合：` : '';
  if (G.step === 'awaitAdd') {
    el.innerHTML = `
      <div class="prompt">${ctrlNote}👉 技能手与对方一只手相加（取个位），选一个数字：</div>
      <div class="add-btns">
        <button class="add-num" data-add="0">${oppP.energy % 10}</button>
        <button class="add-num" data-add="1">${oppP.skill}</button>
      </div>`;
    el.querySelectorAll('[data-add]').forEach((b) => { b.onclick = () => doAction({ type: 'add', choice: Number(b.dataset.add) }); });
    return;
  }
  const digit = turnP.skill;
  const afford = turnP.energy >= digit;
  const skills = SK.SKILLS[digit] || [];
  let html = `<div class="prompt">${ctrlNote}技能手 = <b>${digit}</b>，费用 <b>${digit}$</b>（当前 ${turnP.energy}$）${G.chainCount >= 3 ? `，数字连携 <b>${G.chainCount}</b> 次！` : ''}</div>`;
  html += '<div class="skill-grid">';
  skills.forEach((sk, i) => { html += skillCardHTML(sk, digit, afford, `data-skill="${i}"`); });
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
      doAction({ type: 'act', skillIdx, buffIdx: v });
    };
    overlay.querySelector('#buffcancel').onclick = () => overlay.remove();
    return;
  }
  doAction({ type: 'act', skillIdx });
}

function doAction(a) {
  if (G.over) return;
  let r;
  if (a.type === 'add') r = TW.addHand(G, a.choice);
  else if (a.type === 'act') r = TW.actSkill(G, a.skillIdx, { buffIdx: a.buffIdx });
  else r = TW.passTurn(G);
  if (r && r.err) { toast(r.err); return; }
  render();
  scheduleAI();
}

function scheduleAI() {
  clearTimeout(aiTimer);
  if (G.over) return;
  const needAI = (cfg.mode === 'ai') || (cfg.mode === 'pve' && actorOf(G) === 1);
  if (!needAI) return;
  aiTimer = setTimeout(() => {
    if (G.over) return;
    const a = AI.chooseAction(G, actorOf(G), cfg.diff);
    if (a) doAction(a); else render();
  }, 650);
}

function renderResult() {
  const modal = $('#result-modal');
  modal.classList.toggle('hidden', !G.over);
  if (!G.over) return;
  $('#result-title').textContent = G.result === 'draw' ? '🤝 平局！' : `🎉 ${G.players[G.winner].name} 获胜！`;
  $('#result-sub').textContent = G.result === 'draw' ? '双方同时倒下' : '';
}
