'use strict';
// 唐五共享 UI：真人比例手势图集与技能卡牌。
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// 图集按 4 列 × 3 行排列：0–11。SVG 保留原有尺寸及卡牌内嵌接口。
var handSVG = (() => {
  let serial = 0;
  const atlas = new URL('assets/hands/gestures-realistic.png', document.currentScript.src).href;
  const labels = ['握拳', '食指伸出', '食指中指呈V形', '食指中指无名指伸出',
    '四指伸出', '五指张开', '拇指小指伸出', '三指捏合', '食指拇指呈L形',
    '食指弯钩', '双手食指交叉', '食指小指伸出'];
  const cell = 362;
  return function handSVG(n) {
    n = Number(n);
    if (!Number.isInteger(n) || n < 0 || n > 11) n = 0;
    const x = n % 4 * cell, y = Math.floor(n / 4) * cell;
    const key = `hand-matte-${++serial}`;
    // 源图的中性灰底用色差蒙版在渲染时剔除；肤色与细节保留原图。
    // 限定滤镜区域到当前单元，避免每只手处理整张图集。
    return `<svg class="hand" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${n}：${labels[n]}">
      <defs><filter id="${key}" x="${x}" y="${y}" width="${cell}" height="${cell}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
        <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  6 0 -6 0 -0.12" result="skin-mask"/>
        <feComposite in="SourceGraphic" in2="skin-mask" operator="in"/>
      </filter></defs>
      <svg x="4" y="3" width="92" height="94" viewBox="${x} ${y} ${cell} ${cell}" overflow="hidden" preserveAspectRatio="xMidYMax meet">
        <image href="${esc(atlas)}" width="1448" height="1086" filter="url(#${key})"/>
      </svg>
    </svg>`;
  };
})();

// 40 张独立构图的游戏插画，按技能表顺序映射到 8×5 图集。
const SKILL_ART = (() => {
  const atlas = new URL('assets/skills/skill-atlas.png', document.currentScript.src).href;
  const entries = [
    ['danxiao','energy'], ['jinghua','heal'], ['jiaren','summon'], ['jiarenqh','summon'],
    ['xiao','energy'], ['quan','attack'], ['yi','digit'], ['tao','heal'],
    ['huanwu','control'], ['huifu','heal'], ['jingji','defense'], ['chaofeng','control'],
    ['xiaolieyan','attack'], ['san','digit'], ['hanfeng','attack'], ['tanghua','summon'],
    ['xiaoxiaotou','attack'], ['dian24','heal'], ['yizhanyangzhan','energy'], ['si','digit'],
    ['cuidu','attack'], ['shangjin','attack'], ['touzi','energy'], ['wudi','defense'],
    ['yingneng','energy'], ['jiubaK','special'], ['qianghua','energy'], ['bing','control'],
    ['qibu','attack'], ['shuangbei','energy'], ['gongping','control'], ['ba','digit'],
    ['huxi','heal'], ['jijiu','heal'], ['duming','special'], ['youli','control'],
    ['yuandu','attack'], ['jidao','attack'], ['bishi','control'], ['shipo','control']
  ];
  const out = {};
  entries.forEach(([id, theme], i) => {
    // 实际生成图的行间距为 192px，末尾留有额外背景；每格内缩避免邻格漏边。
    const x = (i % 8) * (1586 / 8) + 3, y = Math.floor(i / 8) * 192 + 3;
    out[id] = { theme, svg: `<svg class="card-svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><svg width="100" height="100" viewBox="${x} ${y} 192.25 186" overflow="hidden" preserveAspectRatio="none"><image href="${esc(atlas)}" width="1586" height="992"/></svg></svg>` };
  });
  out._def = out.qianghua;
  return out;
})();

function skillCardHTML(sk, digit, afford, attrs = '', keyHint = 0) {
  const art = SKILL_ART[sk.id] || SKILL_ART._def;
  return `<button data-skill-id="${esc(sk.id)}" class="skill-card theme-${art.theme}${afford ? '' : ' disabled'}" ${afford ? '' : 'disabled'} ${attrs} title="${esc(sk.desc)}">
    <div class="card-art">${art.svg}</div>
    <div class="card-name">${esc(sk.name)}</div>
    <div class="card-desc">${esc(sk.desc)}</div>
    <div class="card-cost">${digit}$</div>
    ${keyHint > 0 && afford ? `<div class="card-key">${keyHint}</div>` : ''}
    ${sk.star ? '<div class="card-star">★</div>' : ''}
    ${sk.isDigit ? '<div class="card-tag">数字</div>' : ''}
  </button>`;
}

// ---------- 极简音效（WebAudio 合成，无音频文件） ----------
window.TW_SFX = (() => {
  let ctx = null;
  let enabled = true;
  try { enabled = localStorage.getItem('tangwu_sound') !== 'off'; } catch (e) {}
  function ac() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  function tone(freq, dur, type, vol, slideTo) {
    if (!enabled) return;
    const c = ac(); if (!c) return;
    try {
      const o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, c.currentTime);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + dur);
      g.gain.setValueAtTime(vol || 0.04, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      o.connect(g); g.connect(c.destination);
      o.start(); o.stop(c.currentTime + dur + 0.02);
    } catch (e) { /* 忽略音频错误 */ }
  }
  return {
    get enabled() { return enabled; },
    setEnabled(value) { enabled = !!value; try { localStorage.setItem('tangwu_sound', enabled ? 'on' : 'off'); } catch (e) {} },
    click() { tone(560, 0.06, 'square', 0.03); },
    whoosh() { tone(200, 0.2, 'sine', 0.045, 700); },
    hurt() { tone(150, 0.18, 'sawtooth', 0.05, 85); },
    heal() { tone(430, 0.13, 'sine', 0.04, 680); },
  };
})();

// 两端共用相加预览：费用不足/全部禁用会自动结束回合，提前明确告知。
function addChoicesHTML(p, o, catalog, banned = []) {
  return '<div class="add-btns">' + [o.energy % 10, o.skill].map((value, i) => {
    const next = (p.skill + value) % 10;
    const skills = (catalog[next] || []).filter((sk) => !banned.includes(sk.id));
    const unavailable = p.streak >= 24 ? '连出达到上限，将自动空过' : p.energy < next ? `需要 ${next}$，费用不足将自动空过` : !skills.length ? '技能均被禁用，将自动空过' : '';
    return `<button class="add-choice" data-add="${i}" aria-label="与对方${i ? '技能手' : '费用手'}相加，变为${next}">
      <span class="add-label">对方${i ? '技能手' : '费用手'} · 选择 ${i + 1}</span>
      <span class="add-equation">${p.skill} + ${value} → <b>${next}</b></span>
      <span class="add-preview${unavailable ? ' unavailable' : ''}">${esc(unavailable || skills.map((sk) => sk.name).join(' / '))}</span></button>`;
  }).join('') + '</div><div class="kbd-hint">按 1 / 2 选择 · 相加结果取个位</div>';
}

// 通用界面设置：音效可关闭，规则与结果弹窗可键盘访问。
(() => {
  const init = () => {
    document.querySelectorAll('[data-hero-hands]').forEach((el) => { el.innerHTML = handSVG(2) + '<span class="versus">vs.</span>' + handSVG(8); });
    const bar = document.querySelector('.header-btns');
    if (bar) {
      const button = document.createElement('button');
      button.id = 'btn-sound'; button.className = 'ghost';
      const refresh = () => { button.textContent = TW_SFX.enabled ? '音效：开' : '音效：关'; button.setAttribute('aria-pressed', String(TW_SFX.enabled)); };
      button.onclick = () => { TW_SFX.setEnabled(!TW_SFX.enabled); refresh(); };
      refresh(); bar.appendChild(button);
    }
    const toast = document.querySelector('#toast'); if (toast) toast.setAttribute('role', 'status');
    const previousFocus = new WeakMap();
    const syncDialog = (modal) => {
      if (!modal.matches('.modal')) return;
      if (modal.classList.contains('hidden')) {
        const old = previousFocus.get(modal);
        if (old && old.isConnected) old.focus();
        previousFocus.delete(modal);
        return;
      }
      if (previousFocus.has(modal)) return;
      previousFocus.set(modal, document.activeElement);
      modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-label', modal.querySelector('h2')?.textContent || '对局提示');
      modal.querySelector('button,input,select')?.focus();
    };
    new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'attributes') syncDialog(r.target);
        else for (const node of r.addedNodes) if (node.nodeType === 1) syncDialog(node);
      }
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    document.addEventListener('keydown', (e) => {
      const modal = [...document.querySelectorAll('.modal:not(.hidden)')].at(-1);
      if (!modal) return;
      if (e.key === 'Escape' && modal.id === 'rules-modal') { modal.classList.add('hidden'); return; }
      if (e.key !== 'Tab') return;
      const items = [...modal.querySelectorAll('button:not(:disabled),input,select,iframe,a[href]')].filter((el) => el.getClientRects().length);
      if (!items.length) return;
      const first = items[0], last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
