'use strict';
// 唐五共享 UI 组件：动漫风手势 SVG + 技能卡牌（index.html 先于 app.js 加载）

function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ==================== 动漫风数字手势（0-11） ====================
// 画法：整只手一条连续外轮廓（指尖弧→指缝谷→掌缘→腕一笔连成），无拼接缝
// 深棕描边 + 肤色平涂 + 指尖指甲 + 指节线 + 掌纹 + 单侧赛璐璐阴影
// 姿势按中国标准单手势：0空拳 1食 2V 3三指 4四指 5张开 6拇小 7捏合 8枪(L) 9钩 10实拳 11食小
'use strict';
// 唐五共享 UI 组件：手势 SVG + 技能卡牌（index.html 先于 app.js 加载）

function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ==================== 圆润卡通数字手势（0-11） ====================
// 画风：胶囊手指 + 椭圆手掌 + 圆润拇指，参考中文数字手势（0空拳 1食指 2V 3中三指
// 4四指 5张开 6拇小 7捏合 8枪L 9食指弯钩 10空心零(拇食指成环) 11食指+小拇指）
var handSVG = (() => {
  const LINE = '#54331f', SKIN = '#ffdfae', SKIN2 = '#ffc98b', SHADE = '#f2ab78';
  const f = (n) => Math.round(n * 10) / 10;
  const SK = 'url(#twSkin)';

  // 手指/拇指胶囊：基点(x,y)，角度 ang（0=竖直向上，正=顺时针向右偏），长 len，宽 w
  function cap(x, y, len, w, ang) {
    return '<rect x="' + f(-w / 2) + '" y="' + f(-len) + '" width="' + f(w) + '" height="' + f(len) + '" rx="' + f(w / 2) + '" fill="' + SK + '" stroke="' + LINE + '" stroke-width="2" transform="translate(' + f(x) + ' ' + f(y) + ') rotate(' + f(ang) + ')"/>';
  }
  function bump(x, y, r) {
    return '<circle cx="' + f(x) + '" cy="' + f(y) + '" r="' + f(r || 5.2) + '" fill="' + SK + '" stroke="' + LINE + '" stroke-width="2"/>';
  }
  const fingerSet = (arr) => arr.map(function (a) { return cap(a[0], a[1], a[2], a[3], a[4]); }).join('');
  const bumps = (arr) => arr.map(function (a) { return bump(a[0], a[1]); }).join('');

  // 手掌 + 右侧浅阴影 + 手腕
  function palm() {
    return '<ellipse cx="50" cy="62" rx="21" ry="22.5" fill="' + SK + '" stroke="' + LINE + '" stroke-width="2"/>'
      + '<ellipse cx="55.5" cy="65" rx="12.5" ry="15.5" fill="' + SHADE + '" opacity="0.26"/>'
      + '<rect x="39.5" y="82" width="21" height="13" rx="6" fill="' + SKIN2 + '" stroke="' + LINE + '" stroke-width="2"/>';
  }
  // 掌纹（低调）
  function creases() {
    return '<path d="M41 57 Q50 61 59 56.5" stroke="' + LINE + '" stroke-width="1.6" fill="none" opacity="0.32"/>'
      + '<path d="M43 69 Q50.5 72 58 68.5" stroke="' + LINE + '" stroke-width="1.6" fill="none" opacity="0.26"/>';
  }

  const KNUCK = [[36, 41.5], [45.5, 40], [55, 39.8], [64, 41]];   // 拳面四指节
  const F4 = [                                                     // 伸出四指（左→右：小→食）
    [35, 45, 26, 10, -9],
    [44.5, 43, 33, 10.5, -2.5],
    [54, 42.5, 36, 11, 2.5],
    [63.5, 45, 31, 11, 9],
  ];
  const THUMB_TUCK = bump(29.5, 67, 6.2);                          // 拇指收在掌侧
  const THUMB_OUT = (a) => cap(30.5, 69, 23, 12, a);               // 拇指伸出

  const POSES = {
    // 0 空拳：四指节 + 拇指横抱拳底
    0: () => palm() + bumps(KNUCK) + cap(37, 71.5, 25, 11.5, 96) + creases(),
    // 1 食指
    1: () => fingerSet([[63.5, 45, 33, 11, 3]]) + palm() + bumps([[54, 40.5], [45, 41.8], [36, 43.5]]) + THUMB_TUCK + creases(),
    // 2 V（食指+中指）
    2: () => fingerSet([[64, 45, 30, 11, 14], [54.5, 44, 35, 11, -9]]) + palm() + bumps([[45, 42.5], [36, 44.5]]) + THUMB_TUCK + creases(),
    // 3 中三指（食/中/环），拇指小指收
    3: () => fingerSet([[65, 45.5, 30, 11, 12], [55, 43.5, 36, 11, 2], [45, 43.5, 32, 10.5, -8]]) + palm() + bumps([[36, 45], [29.5, 66.5]]) + creases(),
    // 4 四指
    4: () => fingerSet(F4) + palm() + THUMB_TUCK + creases(),
    // 5 张开（+拇指）
    5: () => fingerSet(F4) + palm() + THUMB_OUT(-44) + creases(),
    // 6 拇指+小指
    6: () => fingerSet([[35, 45, 27, 10, -4]]) + palm() + bumps([[44.5, 42.5], [54, 41.5], [63.5, 42.5]]) + THUMB_OUT(-48) + creases(),
    // 7 捏合（拇指+食指对捏，余指收）
    7: () => palm() + bumps([[42.5, 54], [51, 53], [59, 52.5]]) + cap(33.5, 66, 27, 11, 24) + cap(62.5, 64.5, 27, 11, -22) + creases(),
    // 8 枪L（拇指向上 + 食指指向右）
    8: () => palm() + bumps([[36.5, 46], [42.5, 42.5]]) + cap(50, 52, 25, 11, -3) + cap(55, 57.5, 28, 10.5, 90) + creases(),
    // 9 食指弯钩（上段伸出、下段下勾）
    9: () => palm() + bumps([[36, 41.5], [45.5, 40], [55, 39.8]]) + cap(59, 46, 18, 11, -10) + cap(55.9, 28.3, 15, 11, 122) + bump(30, 66, 6) + creases(),
    // 10 空心零（拇指+食指指尖成环，中三指伸出）
    10: () => fingerSet([[50.5, 42.5, 34, 11, 2], [42, 43, 31, 10.5, -4.5], [34, 45, 25, 10, -11]])
      + palm() + cap(46, 65, 25, 11, 44)
      + '<circle cx="66" cy="40" r="8.5" fill="none" stroke="' + LINE + '" stroke-width="12"/>'
      + '<circle cx="66" cy="40" r="8.5" fill="none" stroke="' + SKIN + '" stroke-width="8"/>'
      + creases(),
    // 11 食指+小指
    11: () => fingerSet([[64, 45, 31, 11, 8], [35, 45, 26, 10, -10]]) + palm() + bumps([[54, 41], [44.5, 42.5]]) + THUMB_TUCK + creases(),
  };

  return function handSVG(n) {
    const pose = POSES[n] || POSES[0];
    return '<svg class="hand" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">'
      + '<defs><linearGradient id="twSkin" x1="0" y1="0" x2="0.9" y2="1">'
      + '<stop offset="0" stop-color="' + SKIN + '"/><stop offset="1" stop-color="' + SKIN2 + '"/>'
      + '</linearGradient></defs>' + pose() + '</svg>';
  };
})();

// ==================== 技能卡牌插画 ====================
// 每个技能一张独立 SVG 插画：中心徽章（描边+平涂+辉光）+ 斜向光束 + 星光粒子
const SKILL_ART = (() => {
  const O = '#372231'; // 徽章描边
  const f = (n) => Math.round(n * 10) / 10;
  const D2R = Math.PI / 180;

  // ---------- 基础元素（围绕 0,0 绘制，约 ±30 范围内）----------
  const P = {
    spark(x, y, s, c, o = 0.9) {
      return `<path d="M ${x} ${y - s} Q ${f(x + s * 0.22)} ${f(y - s * 0.22)} ${x + s} ${y} Q ${f(x + s * 0.22)} ${f(y + s * 0.22)} ${x} ${y + s} Q ${f(x - s * 0.22)} ${f(y + s * 0.22)} ${x - s} ${y} Q ${f(x - s * 0.22)} ${f(y - s * 0.22)} ${x} ${y - s} Z" fill="${c}" opacity="${o}"/>`;
    },
    ring(r, c, w, dash) {
      return `<circle r="${r}" fill="none" stroke="${c}" stroke-width="${w || 3}" opacity="0.8"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
    },
    num(n, c) {
      return `<g transform="rotate(-12)">${P.ring(34, 'rgba(255,255,255,0.55)', 2.5, '7 9')}</g>` +
        `<text y="18" text-anchor="middle" font-family="'Arial Black', Arial, sans-serif" font-size="52" font-weight="900" fill="${c}" stroke="${O}" stroke-width="7" paint-order="stroke" stroke-linejoin="round">${n}</text>`;
    },
    smile(mode) {
      const mouth = mode === 'grin'
        ? `<path d="M -13 4 Q 0 22 13 4 Z" fill="#7a2d30" stroke="${O}" stroke-width="2.5" stroke-linejoin="round"/><path d="M -8.5 6.5 Q 0 11 8.5 6.5" stroke="#ffffff" stroke-width="2.2" fill="none" stroke-linecap="round"/>`
        : `<path d="M -11 5 Q 0 15 11 5" stroke="${O}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
      return `<circle r="26" fill="#ffd45e" stroke="${O}" stroke-width="3.5"/>
        <path d="M -15 -7 Q -11 -12 -7 -7" stroke="${O}" stroke-width="3" fill="none" stroke-linecap="round"/>
        <path d="M 7 -7 Q 11 -12 15 -7" stroke="${O}" stroke-width="3" fill="none" stroke-linecap="round"/>
        <circle cx="-16" cy="3" r="4" fill="#ff9d76" opacity="0.7"/><circle cx="16" cy="3" r="4" fill="#ff9d76" opacity="0.7"/>${mouth}`;
    },
    star(x, y, r, c) {
      let p = '';
      for (let i = 0; i < 5; i++) {
        const a1 = (-90 + i * 72) * D2R, a2 = a1 + 36 * D2R;
        p += `${i ? 'L' : 'M'} ${f(x + r * Math.cos(a1))} ${f(y + r * Math.sin(a1))} L ${f(x + r * 0.45 * Math.cos(a2))} ${f(y + r * 0.45 * Math.sin(a2))} `;
      }
      return `<path d="${p} Z" fill="${c}" stroke="${O}" stroke-width="2.5" stroke-linejoin="round"/>`;
    },
    bolt(x, y, s, c) {
      return `<path d="M ${f(x + 2 * s)} ${f(y - 16 * s)} L ${f(x - 8 * s)} ${f(y + 2 * s)} L ${f(x - 1 * s)} ${f(y + 2 * s)} L ${f(x - 2 * s)} ${f(y + 16 * s)} L ${f(x + 8 * s)} ${f(y - 2 * s)} L ${f(x + 1 * s)} ${f(y - 2 * s)} Z" fill="${c}" stroke="${O}" stroke-width="2.5" stroke-linejoin="round"/>`;
    },
    drop(x, y, s, c) {
      return `<path d="M ${x} ${f(y - 14 * s)} C ${f(x + 8 * s)} ${f(y - 2 * s)} ${f(x + 10 * s)} ${f(y + 4 * s)} ${f(x + 10 * s)} ${f(y + 8 * s)} A ${f(10 * s)} ${f(10 * s)} 0 1 1 ${f(x - 10 * s)} ${f(y + 8 * s)} C ${f(x - 10 * s)} ${f(y + 4 * s)} ${f(x - 8 * s)} ${f(y - 2 * s)} ${x} ${f(y - 14 * s)} Z" fill="${c}" stroke="${O}" stroke-width="${f(2.6 * s)}"/>`;
    },
    flame(c1, c2) {
      return `<path d="M 0 26 C -16 20 -22 6 -14 -6 C -10 -12 -8 -16 -7 -24 C -2 -18 0 -14 0 -8 C 4 -12 8 -16 9 -26 C 18 -14 22 2 14 14 C 10 21 5 26 0 26 Z" fill="${c1}" stroke="${O}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M 0 22 C -8 18 -11 8 -6 0 C -4 -3 -3 -6 -2 -10 C 2 -5 8 0 8 8 C 8 15 4 20 0 22 Z" fill="${c2}"/>`;
    },
    shield(c, inner) {
      return `<path d="M 0 -26 L 21 -18 L 21 0 Q 21 18 0 27 Q -21 18 -21 0 L -21 -18 Z" fill="${c}" stroke="${O}" stroke-width="3.5" stroke-linejoin="round"/>
        <path d="M 0 -19 L 14 -14 L 14 0 Q 14 13 0 20 Q -14 13 -14 0 L -14 -14 Z" fill="rgba(255,255,255,0.2)"/>${inner || ''}`;
    },
    peach() {
      return `<path d="M 0 -14 C 14 -20 24 -8 22 6 C 20 20 10 26 0 26 C -10 26 -20 20 -22 6 C -24 -8 -14 -20 0 -14 Z" fill="#ffb37c" stroke="${O}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M 0 -14 Q -5 4 -2 24" stroke="#e07b4f" stroke-width="2.5" fill="none" stroke-linecap="round"/>
        <path d="M 0 -14 Q 2 -26 14 -28 Q 16 -18 4 -13 Z" fill="#7ecb5f" stroke="${O}" stroke-width="2.5" stroke-linejoin="round"/>
        <circle cx="-9" cy="3" r="5" fill="#ff8f66" opacity="0.6"/>`;
    },
    robot(c) {
      return `<path d="M 0 -16 L 0 -23" stroke="${O}" stroke-width="3" stroke-linecap="round"/>
        <circle cx="0" cy="-26" r="3.5" fill="#ffd166" stroke="${O}" stroke-width="2"/>
        <rect x="-19" y="-16" width="38" height="30" rx="9" fill="${c}" stroke="${O}" stroke-width="3"/>
        <rect x="-26" y="-8" width="7" height="12" rx="3" fill="${c}" stroke="${O}" stroke-width="2.5"/>
        <rect x="19" y="-8" width="7" height="12" rx="3" fill="${c}" stroke="${O}" stroke-width="2.5"/>
        <circle cx="-8" cy="-4" r="4.5" fill="#7fe3f0" stroke="${O}" stroke-width="2.2"/>
        <circle cx="8" cy="-4" r="4.5" fill="#7fe3f0" stroke="${O}" stroke-width="2.2"/>
        <path d="M -8 7 h16" stroke="${O}" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="3 3"/>`;
    },
    mist(c) {
      return `<path d="M -26 -10 Q -14 -18 -6 -10 T 14 -10 T 30 -10" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round" opacity="0.95"/>
        <path d="M -32 2 Q -20 -6 -12 2 T 8 2 T 28 2" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round" opacity="0.7"/>
        <path d="M -22 14 Q -12 8 -4 14 T 16 14" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round" opacity="0.5"/>`;
    },
    wind(c) {
      return `<path d="M -26 -12 L 6 -12 A 8 8 0 1 0 -2 -20" fill="none" stroke="${c}" stroke-width="4.5" stroke-linecap="round"/>
        <path d="M -30 0 L 18 0 A 9 9 0 1 1 9 9" fill="none" stroke="${c}" stroke-width="4.5" stroke-linecap="round"/>
        <path d="M -24 12 L 0 12" stroke="${c}" stroke-width="4.5" stroke-linecap="round"/>`;
    },
    snow(x, y, r, c) {
      let s = '';
      for (let i = 0; i < 6; i++) {
        s += `<path d="M ${x} ${y} L ${f(x + r * Math.cos(i * 60 * D2R))} ${f(y + r * Math.sin(i * 60 * D2R))}" stroke="${c}" stroke-width="3" stroke-linecap="round"/>`;
      }
      return s + `<circle cx="${x}" cy="${y}" r="3" fill="${c}"/>`;
    },
    crystal(c) {
      return `<path d="M -18 -10 L -10 2 L -18 20 L -24 2 Z" fill="${c}" stroke="${O}" stroke-width="2.5" stroke-linejoin="round" opacity="0.9"/>
        <path d="M 18 -10 L 24 2 L 18 20 L 10 2 Z" fill="${c}" stroke="${O}" stroke-width="2.5" stroke-linejoin="round" opacity="0.9"/>
        <path d="M 0 -26 L 10 -8 L 0 26 L -10 -8 Z" fill="${c}" stroke="${O}" stroke-width="2.5" stroke-linejoin="round"/>
        <path d="M 0 -26 L 0 26" stroke="#ffffff" stroke-width="1.6" opacity="0.6"/>`;
    },
    skull(c) {
      return `<path d="M -19 -4 A 19 19 0 1 1 19 -4 L 19 6 Q 19 12 13 12 L 13 19 L 6 19 L 6 14 L -6 14 L -6 19 L -13 19 L -13 12 Q -19 12 -19 6 Z" fill="${c}" stroke="${O}" stroke-width="3" stroke-linejoin="round"/>
        <circle cx="-8" cy="-3" r="5.5" fill="${O}"/><circle cx="8" cy="-3" r="5.5" fill="${O}"/>
        <path d="M 0 3 L -3 9 L 3 9 Z" fill="${O}"/>`;
    },
    mega(c) {
      return `<path d="M -18 -4 L 4 -14 L 4 12 L -18 2 Z" fill="${c}" stroke="${O}" stroke-width="2.5" stroke-linejoin="round"/>
        <rect x="4" y="-16" width="8" height="30" rx="3" fill="${c}" stroke="${O}" stroke-width="2.5"/>
        <path d="M -16 2 L -14 12 L -8 12 L -8 4" fill="${c}" stroke="${O}" stroke-width="2.5" stroke-linejoin="round"/>
        <path d="M 19 -12 A 16 16 0 0 1 19 10" fill="none" stroke="#ffd166" stroke-width="3" stroke-linecap="round"/>
        <path d="M 25 -18 A 24 24 0 0 1 25 16" fill="none" stroke="#ffd166" stroke-width="3" stroke-linecap="round" opacity="0.55"/>`;
    },
    thorn(c) {
      const spikes = [[-16, 2, -30], [-4, -6, -10], [8, -8, 20], [18, -2, 40]]
        .map(([x, y, r]) => `<path d="M ${x} ${y} L ${f(x + 8 * Math.cos(r * D2R))} ${f(y + 8 * Math.sin(r * D2R))}" stroke="${O}" stroke-width="2.6" stroke-linecap="round"/>`).join('');
      return `<path d="M -28 16 Q -6 -18 24 -10" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round"/>
        <path d="M -24 -12 Q 2 16 28 8" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round" opacity="0.75"/>${spikes}`;
    },
    cards24() {
      return `<rect x="-24" y="-16" width="26" height="36" rx="4" fill="#ffffff" stroke="${O}" stroke-width="2.5" transform="rotate(-12)"/>
        <path d="M -19 -8 h5 M -16.5 -10.5 v5" stroke="#d33" stroke-width="2" transform="rotate(-12)"/>
        <rect x="0" y="-18" width="26" height="36" rx="4" fill="#fff8e7" stroke="${O}" stroke-width="2.5" transform="rotate(8)"/>
        <text x="13" y="9" text-anchor="middle" font-family="'Arial Black', Arial" font-size="16" font-weight="900" fill="#d33" transform="rotate(8)">24</text>`;
    },
    swords(c) {
      const sw = (rot) => `<g transform="rotate(${rot})">
        <path d="M -2.6 -26 L 0 -32 L 2.6 -26 L 2.6 8 L -2.6 8 Z" fill="#dfe8ff" stroke="${O}" stroke-width="2" stroke-linejoin="round"/>
        <rect x="-8" y="8" width="16" height="4.5" rx="2" fill="${c}" stroke="${O}" stroke-width="2"/>
        <rect x="-2.6" y="12.5" width="5.2" height="10" rx="2" fill="#7a5230" stroke="${O}" stroke-width="2"/></g>`;
      return sw(-38) + sw(38);
    },
    bag(c, mark) {
      return `<path d="M -6 -22 L 6 -22 L 9 -14 Q 24 -6 22 10 Q 20 24 0 24 Q -20 24 -22 10 Q -24 -6 -9 -14 Z" fill="${c}" stroke="${O}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M -9 -14 Q 0 -10 9 -14" stroke="${O}" stroke-width="2.5" fill="none"/>
        <path d="M -6 -22 Q 0 -27 6 -22" stroke="${O}" stroke-width="2.5" fill="none"/>
        <text y="13" text-anchor="middle" font-family="'Arial Black', Arial" font-size="17" font-weight="900" fill="#ffffff" stroke="${O}" stroke-width="3" paint-order="stroke">${mark || '¥'}</text>`;
    },
    chart(c) {
      return `<rect x="-23" y="0" width="10" height="18" rx="2" fill="${c}" stroke="${O}" stroke-width="2.2"/>
        <rect x="-7" y="-8" width="10" height="26" rx="2" fill="${c}" stroke="${O}" stroke-width="2.2"/>
        <rect x="9" y="-16" width="10" height="34" rx="2" fill="${c}" stroke="${O}" stroke-width="2.2"/>
        <path d="M -21 -12 L -5 -20 L 5 -14 L 23 -30" fill="none" stroke="#ffd166" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M 13 -30 L 25 -31 L 23 -19" fill="none" stroke="#ffd166" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
    },
    battery(c) {
      return `<rect x="-25" y="-14" width="45" height="28" rx="6" fill="#33402c" stroke="${O}" stroke-width="3"/>
        <rect x="20" y="-6" width="7" height="12" rx="2" fill="#33402c" stroke="${O}" stroke-width="2.5"/>
        ${P.bolt(-1, 0, 1.05, c)}`;
    },
    up(c) {
      return `<path d="M -16 0 L 0 -16 L 16 0" fill="none" stroke="${c}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M -16 16 L 0 0 L 16 16" fill="none" stroke="${c}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`;
    },
    dice(c, pips) {
      const dots = { 1: [[0, 0]], 3: [[-8, -8], [0, 0], [8, 8]], 5: [[-8, -8], [8, -8], [0, 0], [-8, 8], [8, 8]], 6: [[-8, -9], [8, -9], [-8, 0], [8, 0], [-8, 9], [8, 9]] }[pips] || [[0, 0]];
      return `<g transform="rotate(12)"><rect x="-17" y="-17" width="34" height="34" rx="8" fill="${c}" stroke="${O}" stroke-width="3"/>` +
        dots.map(([dx, dy]) => `<circle cx="${dx}" cy="${dy}" r="3.4" fill="#ffffff"/>`).join('') + `</g>`;
    },
    scale(c) {
      return `<path d="M 0 -24 L 0 14 M -12 20 L 12 20" stroke="${c}" stroke-width="4" stroke-linecap="round"/>
        <path d="M -22 -20 L 22 -20" stroke="${c}" stroke-width="4" stroke-linecap="round"/>
        <path d="M -22 -20 L -30 -6 M -22 -20 L -14 -6 M 22 -20 L 14 -6 M 22 -20 L 30 -6" stroke="${c}" stroke-width="2.2"/>
        <path d="M -32 -6 A 10 10 0 0 0 -12 -6 Z" fill="${c}" stroke="${O}" stroke-width="2.5"/>
        <path d="M 12 -6 A 10 10 0 0 0 32 -6 Z" fill="${c}" stroke="${O}" stroke-width="2.5"/>
        <circle cx="0" cy="-25" r="4" fill="${c}" stroke="${O}" stroke-width="2"/>`;
    },
    leaf(c) {
      return `<path d="M 0 22 Q -22 8 -16 -14 Q 4 -26 20 -12 Q 22 10 0 22 Z" fill="${c}" stroke="${O}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M 0 20 Q 2 0 16 -10" stroke="#2f7a3d" stroke-width="2.5" fill="none" stroke-linecap="round"/>
        <path d="M -32 -8 A 15 15 0 0 1 -32 10" fill="none" stroke="#a7f3c7" stroke-width="3" stroke-linecap="round" opacity="0.8"/>
        <path d="M -38 -12 A 22 22 0 0 1 -38 14" fill="none" stroke="#a7f3c7" stroke-width="3" stroke-linecap="round" opacity="0.45"/>`;
    },
    medkit(c) {
      return `<path d="M -8 -12 L -8 -18 Q -8 -23 0 -23 Q 8 -23 8 -18 L 8 -12" fill="none" stroke="${O}" stroke-width="3.5"/>
        <rect x="-23" y="-12" width="46" height="32" rx="7" fill="${c}" stroke="${O}" stroke-width="3"/>
        <rect x="-5" y="-6" width="10" height="20" rx="2" fill="#ffffff"/>
        <rect x="-10" y="-1" width="20" height="10" rx="2" fill="#ffffff"/>`;
    },
    mask(c) {
      return `<path d="M -24 -6 Q 0 -16 24 -6 L 24 4 Q 0 14 -24 4 Z" fill="${c}" stroke="${O}" stroke-width="3" stroke-linejoin="round"/>
        <ellipse cx="-10" cy="-1" rx="5" ry="3.6" fill="#ffffff"/><ellipse cx="10" cy="-1" rx="5" ry="3.6" fill="#ffffff"/>
        <circle cx="-9" cy="-1" r="1.8" fill="${O}"/><circle cx="11" cy="-1" r="1.8" fill="${O}"/>`;
    },
    eye(iris) {
      return `<path d="M -26 0 Q 0 -20 26 0 Q 0 20 -26 0 Z" fill="#ffffff" stroke="${O}" stroke-width="3" stroke-linejoin="round"/>
        <circle r="9" fill="${iris}" stroke="${O}" stroke-width="2.5"/>
        <circle r="4" fill="${O}"/><circle cx="3" cy="-3" r="1.6" fill="#ffffff"/>`;
    },
    spiral(c) {
      return `<path d="M 0 0 A 5 5 0 0 1 5 5 A 10 10 0 0 1 -5 15 A 15 15 0 0 1 -20 0 A 20 20 0 0 1 0 -20 A 25 25 0 0 1 25 5" fill="none" stroke="${c}" stroke-width="4.5" stroke-linecap="round"/>`;
    },
    flask(c) {
      return `<rect x="-9" y="-29" width="18" height="6" rx="2" fill="#8a6f4d" stroke="${O}" stroke-width="2.5"/>
        <path d="M -6 -24 L 6 -24 L 6 -10 Q 20 -2 20 12 A 20 20 0 0 1 -20 12 Q -20 -2 -6 -10 Z" fill="${c}" stroke="${O}" stroke-width="3" stroke-linejoin="round"/>
        <circle cx="-6" cy="8" r="4" fill="#d6ff8a" opacity="0.85"/><circle cx="7" cy="14" r="3" fill="#d6ff8a" opacity="0.85"/><circle cx="2" cy="1" r="2.2" fill="#d6ff8a" opacity="0.85"/>`;
    },
    rifle(c) {
      return `<g transform="rotate(-16)">
        <path d="M -34 2 L -21 -3 L -19 1 L 6 -3 L 8 -7 L 12 -7 L 13 -3 L 34 -3 L 34 1 L 12 1 L 10 9 L 3 9 L 2 2 L -8 4 L -12 9 L -19 9 L -17 3 Z" fill="${c}" stroke="${O}" stroke-width="2.5" stroke-linejoin="round"/>
        <rect x="-6" y="-13" width="13" height="5" rx="2.2" fill="${c}" stroke="${O}" stroke-width="2"/></g>
        <circle cx="26" cy="-20" r="10" fill="none" stroke="#ff5d73" stroke-width="2.5"/>
        <path d="M 26 -28 v16 M 18 -20 h16" stroke="#ff5d73" stroke-width="2.2"/>`;
    },
    infinity(c) {
      return `<path d="M 0 0 C -8 -14 -26 -14 -26 0 C -26 14 -8 14 0 0 C 8 14 26 14 26 0 C 26 -14 8 -14 0 0 Z" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;
    },
    wrench(c) {
      return `<g transform="rotate(45)"><path d="M -5.5 -21 A 8 8 0 1 0 5.5 -21 L 3 -13 L 3 14 A 4.5 4.5 0 0 1 -3 14 L -3 -13 Z" fill="${c}" stroke="${O}" stroke-width="2.5" stroke-linejoin="round"/></g>`;
    },
    swap(c) {
      return `<path d="M -18 -6 A 16 16 0 0 1 12 -13" fill="none" stroke="${c}" stroke-width="4.5" stroke-linecap="round"/>
        <path d="M 9 -21 L 17 -11 L 6 -9 Z" fill="${c}" stroke="${O}" stroke-width="2" stroke-linejoin="round"/>
        <path d="M 18 6 A 16 16 0 0 1 -12 13" fill="none" stroke="${c}" stroke-width="4.5" stroke-linecap="round"/>
        <path d="M -9 21 L -17 11 L -6 9 Z" fill="${c}" stroke="${O}" stroke-width="2" stroke-linejoin="round"/>`;
    },
    miniFist() {
      return handSVG(10).replace('<svg class="hand"', '<svg x="-33" y="-32" width="66" height="63"')
        + `<path d="M 24 -26 L 31 -34 M 30 -16 L 39 -21 M 20 -33 L 24 -42" stroke="#ffd166" stroke-width="3.5" stroke-linecap="round"/>`;
    },
  };

  // ---------- 场景组装：光束 + 辉光 + 徽章 + 粒子 ----------
  function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
  function scene(id, glow, inner) {
    const spots = [[-74, -32, 5], [68, -28, 4], [-62, 28, 4], [72, 26, 5], [-34, -40, 3.4], [40, 38, 3.6], [-80, 2, 3.4], [80, -2, 3.2]];
    const h = hash(id);
    let sp = '';
    for (let i = 0; i < 4; i++) {
      const [x, y, s] = spots[(h + i * 3) % spots.length];
      sp += P.spark(x, y, s, '#ffffff', 0.45 + ((h + i) % 3) * 0.18);
    }
    return `<svg class="card-svg" viewBox="0 0 200 112" preserveAspectRatio="xMidYMid slice" aria-hidden="true">`
      + `<path d="M 34 -20 L 70 -20 L -2 132 L -38 132 Z" fill="#ffffff" opacity="0.05"/>`
      + `<path d="M 96 -20 L 110 -20 L 38 132 L 24 132 Z" fill="#ffffff" opacity="0.04"/>`
      + `<circle cx="100" cy="54" r="45" fill="${glow}" opacity="0.3"/><circle cx="100" cy="54" r="30" fill="#ffffff" opacity="0.1"/>`
      + `<g transform="translate(100 54)">${inner}</g>`
      + `<g transform="translate(100 54)">${sp}</g></svg>`;
  }

  // ---------- 40 个技能的插画定义 ----------
  const A = {
    danxiao: ['energy', '#ffd166', P.smile('happy') + `<circle cx="-30" cy="-18" r="4" fill="#fff3c4" opacity="0.7"/><circle cx="-36" cy="-26" r="2.6" fill="#fff3c4" opacity="0.5"/>`],
    jinghua: ['heal', '#7cf0b0', P.drop(0, -2, 1.35, '#9fe8ff') + P.ring(30, 'rgba(255,255,255,0.5)', 2) + P.spark(-22, -20, 5, '#ffffff') + P.spark(20, -12, 4, '#ffffff')],
    jiaren: ['summon', '#7ff0e0', P.robot('#b8c4d8')],
    jiarenqh: ['summon', '#7ff0e0', `<g transform="translate(-7 1) scale(0.85)">${P.robot('#b8c4d8')}</g><g transform="translate(22 -16) scale(0.75)">${P.wrench('#ffd166')}</g>`],
    xiao: ['energy', '#ffd166', P.smile('grin') + P.spark(28, -22, 4.5, '#ffffff')],
    quan: ['attack', '#ff8d96', P.miniFist()],
    yi: ['digit', '#9fb2ff', P.num('1', '#cfe0ff') + P.spark(30, -24, 4.5, '#ffffff')],
    tao: ['heal', '#7cf0b0', P.peach() + P.spark(24, -20, 4.5, '#ffffff')],
    huanwu: ['control', '#c39bff', P.mist('#d9c8ff') + P.spark(24, -24, 4, '#ffffff')],
    huifu: ['heal', '#7cf0b0', P.ring(27, 'rgba(167,243,199,0.7)', 3) + `<rect x="-7" y="-20" width="14" height="40" rx="4" fill="#f4fff8" stroke="${O}" stroke-width="3"/><rect x="-20" y="-7" width="40" height="14" rx="4" fill="#f4fff8" stroke="${O}" stroke-width="3"/>` + P.spark(26, -22, 4, '#ffffff')],
    jingji: ['defense', '#8fd3ff', P.thorn('#4caf6d')],
    chaofeng: ['control', '#c39bff', `<g transform="translate(-4 0)">${P.mega('#ff9d5c')}</g><text x="26" y="-16" text-anchor="middle" font-family="'Arial Black', Arial" font-size="22" font-weight="900" fill="#ffd166" stroke="${O}" stroke-width="4" paint-order="stroke">!</text>`],
    xiaolieyan: ['attack', '#ff8d96', P.flame('#ff7a3d', '#ffd166') + `<g transform="translate(22 12) scale(0.5)">${P.flame('#ff9d5c', '#ffe08a')}</g>`],
    san: ['digit', '#9fb2ff', P.num('3', '#cfe0ff')],
    hanfeng: ['attack', '#ff8d96', P.wind('#bfe9ff') + P.snow(20, -18, 8, '#ffffff')],
    tanghua: ['summon', '#7ff0e0', `<g transform="translate(-3 -4) scale(0.8)">${P.robot('#b8c4d8')}</g><g transform="translate(4 24) scale(0.6)">${P.infinity('#ffd166')}</g>`],
    xiaoxiaotou: ['attack', '#ff8d96', `<g transform="translate(0 -8)">${P.mask('#3a3f4a')}</g><g transform="translate(2 18)"><circle r="10" fill="#ffd166" stroke="${O}" stroke-width="2.5"/><text y="5" text-anchor="middle" font-family="'Arial Black', Arial" font-size="12" font-weight="900" fill="#8a6a10">¥</text></g>`],
    dian24: ['special', '#ffe08a', P.cards24() + P.spark(-28, -22, 4, '#ffffff')],
    yizhanyangzhan: ['attack', '#ff8d96', P.swords('#ffb84d') + `<g transform="translate(0 -24)"><circle r="7" fill="#ffd166" stroke="${O}" stroke-width="2"/><text y="3.5" text-anchor="middle" font-family="'Arial Black', Arial" font-size="9" font-weight="900" fill="#8a6a10">¥</text></g>`],
    si: ['digit', '#9fb2ff', P.num('4', '#cfe0ff')],
    cuidu: ['attack', '#ff8d96', `<g transform="rotate(40) translate(-4 -2)"><path d="M -2.4 -24 L 0 -31 L 2.4 -24 L 2.4 6 L -2.4 6 Z" fill="#cfe8d8" stroke="${O}" stroke-width="2.2" stroke-linejoin="round"/><rect x="-7" y="6" width="14" height="4" rx="2" fill="#7a5230" stroke="${O}" stroke-width="2"/><rect x="-2" y="10" width="4" height="10" rx="1.5" fill="#5a3d22" stroke="${O}" stroke-width="1.8"/></g>` + P.drop(14, 6, 0.55, '#8dff5a') + P.drop(20, 20, 0.42, '#8dff5a')],
    shangjin: ['attack', '#ff8d96', P.bag('#e8a33d') + P.star(22, -20, 8, '#ffe08a')],
    touzi: ['energy', '#ffd166', P.chart('#4caf6d')],
    wudi: ['defense', '#8fd3ff', P.shield('#4f8fd5', P.star(0, 1, 11, '#ffe08a'))],
    yingneng: ['energy', '#ffd166', P.battery('#8dff5a') + P.spark(28, -22, 4, '#ffffff')],
    jiubaK: ['special', '#ffe08a', P.rifle('#5a4632')],
    qianghua: ['energy', '#ffd166', P.up('#ffd166') + P.star(22, -18, 7, '#ffffff')],
    bing: ['control', '#c39bff', P.crystal('#aee6ff') + P.snow(-22, -18, 7, '#ffffff')],
    qibu: ['attack', '#ff8d96', `<g transform="translate(-3 2)">${P.skull('#e8e2d8')}</g><g transform="translate(21 -20)"><circle r="10.5" fill="#7c4fd5" stroke="${O}" stroke-width="2.5"/><text y="5.5" text-anchor="middle" font-family="'Arial Black', Arial" font-size="14" font-weight="900" fill="#ffffff">7</text></g>`],
    shuangbei: ['energy', '#ffd166', P.drop(-11, 2, 1, '#7fe3f0') + P.drop(11, -3, 1.2, '#a5f3ff') + `<text x="24" y="24" text-anchor="middle" font-family="'Arial Black', Arial" font-size="14" font-weight="900" fill="#ffd166" stroke="${O}" stroke-width="3" paint-order="stroke">×2</text>`],
    gongping: ['control', '#c39bff', P.scale('#e8d28a')],
    ba: ['digit', '#9fb2ff', P.num('8', '#cfe0ff')],
    huxi: ['heal', '#7cf0b0', `<g transform="translate(8 0)">${P.leaf('#6fdc8c')}</g>`],
    jijiu: ['heal', '#7cf0b0', P.medkit('#e84f4f') + P.spark(26, -20, 4, '#ffffff')],
    duming: ['special', '#ffe08a', `<g transform="translate(-5 2)">${P.dice('#e84f4f', 5)}</g><g transform="translate(19 -17) scale(0.42)">${P.skull('#e8e2d8')}</g>` + P.spark(-28, -22, 4, '#ffffff')],
    youli: ['control', '#c39bff', P.spiral('#d9a5ff') + `<circle r="3.5" fill="#d9a5ff"/>`],
    yuandu: ['attack', '#ff8d96', P.flask('#5fbf5f') + P.drop(24, -14, 0.5, '#8dff5a')],
    jidao: ['attack', '#ff8d96', `<g transform="translate(0 -12) scale(0.9)">${P.mask('#3a3f4a')}</g>` + P.bolt(0, 13, 0.95, '#ffd166')],
    bishi: ['control', '#c39bff', `<path d="M -26 0 Q 0 -20 26 0 Q 0 20 -26 0 Z" fill="#ffffff" stroke="${O}" stroke-width="3" stroke-linejoin="round"/><circle cx="0" cy="6" r="8" fill="#7c4fd5" stroke="${O}" stroke-width="2.5"/><circle cx="0" cy="6" r="3.6" fill="${O}"/><path d="M -26 0 Q 0 -20 26 0 Q 12 -2 0 -2 Q -12 -2 -26 0 Z" fill="#b9a5e8" stroke="${O}" stroke-width="2.5" stroke-linejoin="round"/>`],
    shipo: ['control', '#c39bff', `<path d="M 6 0 L 36 -15 L 36 15 Z" fill="#ffe08a" opacity="0.3"/>` + P.eye('#4f8fd5') + P.spark(30, -20, 3.6, '#ffffff')],
    _def: ['special', '#ffe08a', P.star(0, 0, 22, '#ffe08a')],
  };

  const out = {};
  for (const [id, [theme, glow, inner]] of Object.entries(A)) out[id] = { theme, svg: scene(id, glow, inner) };
  return out;
})();

function skillCardHTML(sk, digit, afford, attrs = '', keyHint = 0) {
  const art = SKILL_ART[sk.id] || SKILL_ART._def;
  return `<button class="skill-card theme-${art.theme}${afford ? '' : ' disabled'}" ${afford ? '' : 'disabled'} ${attrs} title="${esc(sk.desc)}">
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
  function ac() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  function tone(freq, dur, type, vol, slideTo) {
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
    click() { tone(560, 0.06, 'square', 0.03); },
    whoosh() { tone(200, 0.2, 'sine', 0.045, 700); },
    hurt() { tone(150, 0.18, 'sawtooth', 0.05, 85); },
    heal() { tone(430, 0.13, 'sine', 0.04, 680); },
  };
})();
