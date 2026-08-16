'use strict';
// 唐五共享 UI 组件：动漫风手势 SVG + 技能卡牌（index.html 先于 app.js 加载）

function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ==================== 动漫风数字手势（0-11） ====================
// 画法：整只手一条连续外轮廓（指尖弧→指缝谷→掌缘→腕一笔连成），无拼接缝
// 深棕描边 + 肤色平涂 + 指尖指甲 + 指节线 + 掌纹 + 单侧赛璐璐阴影
// 姿势按中国标准单手势：0空拳 1食 2V 3三指 4四指 5张开 6拇小 7捏合 8枪(L) 9钩 10实拳 11食小
var handSVG = (() => {
  const LINE = '#54331f', SKIN = '#ffdfae', SKIN2 = '#ffc891', SHADE = '#f2ab78', CREASE = '#e09a63', NAIL = '#fff5e8';
  const f = (n) => Math.round(n * 10) / 10;
  const rad = (d) => d * Math.PI / 180;
  const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  const mul = (a, s) => ({ x: a.x * s, y: a.y * s });
  const unit = (a) => { const l = Math.hypot(a.x, a.y) || 1; return { x: a.x / l, y: a.y / l }; };
  const perp = (a) => ({ x: -a.y, y: a.x });

  // 关节链：起点 + [角度,长度] 序列
  function chain(x, y, segs) {
    const js = [{ x, y }]; let cx = x, cy = y;
    for (const [a, l] of segs) { cx += Math.cos(rad(a)) * l; cy += Math.sin(rad(a)) * l; js.push({ x: cx, y: cy }); }
    return js;
  }
  function dirAt(joints, i) {
    const n = joints.length;
    if (i === 0) return unit(sub(joints[1], joints[0]));
    if (i === n - 1) return unit(sub(joints[n - 1], joints[n - 2]));
    return unit(add(unit(sub(joints[i], joints[i - 1])), unit(sub(joints[i + 1], joints[i]))));
  }
  // 关节链两侧偏移点：S- = -perp 侧（轮廓行进先来的一侧），S+ = +perp 侧
  function sides(joints, hw) {
    const Sm = [], Sp = [];
    for (let i = 0; i < joints.length; i++) {
      const p = perp(dirAt(joints, i));
      Sm.push(add(joints[i], mul(p, -hw[i])));
      Sp.push(add(joints[i], mul(p, hw[i])));
    }
    return { Sm, Sp };
  }
  // 链末端半圆鼓出点（指尖/圆底）
  function arcPoints(joints, hw) {
    const n = joints.length, C = joints[n - 1], d = dirAt(joints, n - 1), p = perp(d), r = hw[n - 1];
    const pts = [];
    for (const th of [-70, -35, 0, 35, 70]) {
      const a = rad(th);
      pts.push({ x: C.x + d.x * r * Math.cos(a) + p.x * r * Math.sin(a), y: C.y + d.y * r * Math.cos(a) + p.y * r * Math.sin(a) });
    }
    return pts;
  }
  // 一整串点 → 平滑闭合路径（二次贝塞尔过中点）
  function smoothClosed(pts) {
    let d = `M ${f(pts[0].x)} ${f(pts[0].y)}`;
    for (let i = 1; i < pts.length - 1; i++) {
      d += ` Q ${f(pts[i].x)} ${f(pts[i].y)} ${f((pts[i].x + pts[i + 1].x) / 2)} ${f((pts[i].y + pts[i + 1].y) / 2)}`;
    }
    d += ` L ${f(pts[pts.length - 1].x)} ${f(pts[pts.length - 1].y)} Z`;
    return d;
  }

  // 手掌轮廓参数（左缘点自下而上，右缘点自上而下）
  function palmProf(topY, xL, xR, wristY) {
    return {
      topY, xL, xR, wristY,
      wL: xL + 7, wR: xR - 9,
      left: [{ x: xL + 1, y: topY + 64 }, { x: xL - 7, y: topY + 38 }, { x: xL - 3, y: topY + 14 }],
      right: [{ x: xR + 3, y: topY + 14 }, { x: xR + 7, y: topY + 38 }, { x: xR + 1, y: topY + 64 }],
    };
  }
  // 统一外轮廓：左腕底 → 左掌缘上行 → 各特征(S-上行·尖弧·S+下行)，特征间山谷 → 右掌缘 → 腕底
  function unified(palm, feats, valleys) {
    const pts = [{ x: palm.wL, y: palm.wristY }, ...palm.left];
    const vpts = [];
    feats.forEach((ft, k) => {
      const { Sm, Sp } = sides(ft.joints, ft.hw);
      if (k > 0) {
        const prevS = sides(feats[k - 1].joints, feats[k - 1].hw);
        const a = prevS.Sp[0], b = Sm[0];
        const vp = { x: (a.x + b.x) / 2, y: Math.max(a.y, b.y) + valleys[k - 1] };
        vpts.push({ p: vp, depth: valleys[k - 1] });
        pts.push(vp);
      }
      pts.push(...Sm, ...arcPoints(ft.joints, ft.hw));
      for (let i = Sp.length - 1; i >= 0; i--) pts.push(Sp[i]);
    });
    pts.push(...palm.right, { x: palm.wR, y: palm.wristY }, { x: (palm.wL + palm.wR) / 2, y: palm.wristY + 7 });
    return { d: smoothClosed(pts), vpts };
  }
  // 单侧赛璐璐阴影条
  function shadeStrip(joints, hw) {
    const sj = joints.map((j, i) => add(j, mul(perp(dirAt(joints, i)), hw[i] * 0.42)));
    const shw = hw.map((w) => w * 0.26);
    const { Sm, Sp } = sides(sj, shw);
    return `<path d="${smoothClosed([...Sm, ...arcPoints(sj, shw), ...Sp.slice().reverse()])}" fill="${SHADE}" opacity="0.4"/>`;
  }
  // 指尖指甲
  function nailAt(joints, hw, s = 1) {
    const n = joints.length, C = joints[n - 1], d = dirAt(joints, n - 1);
    const cx = C.x + d.x * hw[n - 1] * 0.12, cy = C.y + d.y * hw[n - 1] * 0.12;
    const ang = Math.atan2(d.y, d.x) * 180 / Math.PI + 90;
    return `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(hw[n - 1] * 0.44 * s)}" ry="${f(hw[n - 1] * 0.64 * s)}" fill="${NAIL}" stroke="${LINE}" stroke-width="1.2" opacity="0.95" transform="rotate(${f(ang)} ${f(cx)} ${f(cy)})"/>`;
  }
  // 指节横纹
  function creaseAt(joints, hw, i, span = 0.5) {
    const j = joints[i], p = perp(dirAt(joints, i)), d = dirAt(joints, i);
    const a = add(j, mul(p, -hw[i] * span)), b = add(j, mul(p, hw[i] * span)), c = add(j, mul(d, -2.5));
    return `<path d="M ${f(a.x)} ${f(a.y)} Q ${f(c.x)} ${f(c.y)} ${f(b.x)} ${f(b.y)}" stroke="${CREASE}" stroke-width="1.7" fill="none" stroke-linecap="round" opacity="0.85"/>`;
  }
  // 蜷指节包上的横纹
  function humpCrease(joints, hw) {
    const t = 0.45;
    const mx = joints[0].x + (joints[1].x - joints[0].x) * t, my = joints[0].y + (joints[1].y - joints[0].y) * t;
    const w = hw[0] * 0.52;
    return `<path d="M ${f(mx - w)} ${f(my)} Q ${f(mx)} ${f(my + 2.6)} ${f(mx + w)} ${f(my)}" stroke="${CREASE}" stroke-width="1.6" fill="none" stroke-linecap="round" opacity="0.8"/>`;
  }
  // 掌侧阴影
  function palmShade(palm) {
    const t = palm.topY;
    return `<path d="M ${f(palm.xR - 18)} ${f(t + 10)} Q ${f(palm.xR - 2)} ${f(t + 34)} ${f(palm.xR - 5)} ${f(t + 58)} Q ${f(palm.xR - 8)} ${f(palm.wristY - 16)} ${f(palm.wR - 6)} ${f(palm.wristY - 10)} L ${f(palm.wR - 18)} ${f(palm.wristY - 8)} Q ${f(palm.xR - 22)} ${f(t + 54)} ${f(palm.xR - 32)} ${f(t + 12)} Z" fill="${SHADE}" opacity="0.38"/>`;
  }
  // 掌纹（生命线+智慧线）
  function palmLines(palm) {
    const t = palm.topY, xL = palm.xL, xR = palm.xR;
    return `<path d="M ${f(xL + 16)} ${f(t + 16)} Q ${f(xL + 34)} ${f(t + 32)} ${f(xL + 28)} ${f(t + 60)}" stroke="${CREASE}" stroke-width="1.8" fill="none" stroke-linecap="round" opacity="0.75"/>`
      + `<path d="M ${f(xL + 14)} ${f(t + 42)} Q ${f(xL + 44)} ${f(t + 50)} ${f(xR - 18)} ${f(t + 40)}" stroke="${CREASE}" stroke-width="1.8" fill="none" stroke-linecap="round" opacity="0.75"/>`;
  }
  // 深谷指缝线
  function sepLine(vp) {
    return `<path d="M ${f(vp.x)} ${f(vp.y - 1)} L ${f(vp.x)} ${f(vp.y + 8)}" stroke="${CREASE}" stroke-width="1.7" stroke-linecap="round" opacity="0.8"/>`;
  }
  // 拇指丘折痕
  function thenarCrease(palm) {
    return `<path d="M ${f(palm.xL + 8)} ${f(palm.topY + 34)} Q ${f(palm.xL + 18)} ${f(palm.topY + 44)} ${f(palm.xL + 20)} ${f(palm.topY + 58)}" stroke="${CREASE}" stroke-width="1.7" fill="none" stroke-linecap="round" opacity="0.7"/>`;
  }
  // 横搭拇指（覆盖层：圆底+指甲+阴影）
  function overlayThumb(joints, hw) {
    const { Sm, Sp } = sides(joints, hw);
    const rev = joints.slice().reverse(), revHw = hw.slice().reverse();
    const pts = [...Sm, ...arcPoints(joints, hw), ...Sp.slice().reverse(), ...arcPoints(rev, revHw)];
    let s = `<path d="${smoothClosed(pts)}" fill="url(#hskin)" stroke="${LINE}" stroke-width="3.5" stroke-linejoin="round"/>`;
    s += shadeStrip(joints, hw);
    s += nailAt(joints, hw, 1.05);
    return s;
  }
  // 手势 7：五指捏合（侧视，指尖收拢朝左，整手一条轮廓）
  function pinch() {
    const pts = [
      { x: 152, y: 164 }, { x: 172, y: 152 }, { x: 179, y: 128 }, { x: 170, y: 106 },
      { x: 148, y: 91 }, { x: 120, y: 85 }, { x: 94, y: 89 }, { x: 72, y: 99 }, { x: 59, y: 108 },
      { x: 67, y: 119 }, { x: 82, y: 133 }, { x: 104, y: 146 }, { x: 128, y: 154 },
    ];
    let s = `<path d="${smoothClosed(pts)}" fill="url(#hskin)" stroke="${LINE}" stroke-width="3.5" stroke-linejoin="round"/>`;
    s += `<path d="M 88 138 Q 116 152 148 148 Q 120 160 92 146 Z" fill="${SHADE}" opacity="0.4"/>`;
    s += `<path d="M 74 103 Q 94 96 112 92" stroke="${CREASE}" stroke-width="1.7" fill="none" stroke-linecap="round" opacity="0.8"/>`;
    s += `<path d="M 71 111 Q 94 111 112 107" stroke="${CREASE}" stroke-width="1.7" fill="none" stroke-linecap="round" opacity="0.8"/>`;
    s += `<path d="M 73 118 Q 92 122 108 121" stroke="${CREASE}" stroke-width="1.6" fill="none" stroke-linecap="round" opacity="0.7"/>`;
    s += `<path d="M 80 126 Q 100 138 122 142" stroke="${CREASE}" stroke-width="1.8" fill="none" stroke-linecap="round" opacity="0.8"/>`;
    s += `<path d="M 64 100 Q 60 106 62 112" stroke="${CREASE}" stroke-width="1.6" fill="none" stroke-linecap="round" opacity="0.75"/>`;
    s += `<ellipse cx="67" cy="102" rx="3.6" ry="5.4" fill="${NAIL}" stroke="${LINE}" stroke-width="1.2" transform="rotate(-50 67 102)"/>`;
    return s;
  }

  // 几何常量
  const FX = { i: 90, m: 110, r: 130, p: 148 };
  const FLEN = { i: [34, 28], m: [36, 32], r: [32, 28], p: [26, 20] };
  const FHW = { i: [9.5, 8, 6.5], m: [9.8, 8.2, 6.6], r: [9.3, 7.8, 6.3], p: [8.3, 7, 5.6] };
  const HUMP = { i: [24, -6], m: [25, -2], r: [24, 3], p: [20, 8] };

  // 特征描述 → 关节链特征
  function resolveFeat(spec, topY) {
    const parts = spec.split(':');
    const type = parts[0];
    if (type === 'up') {
      const id = parts[1], tilt = Number(parts[2]);
      const bend = (id === 'i' || id === 'm') ? 4 : -4;
      return { joints: chain(FX[id], topY + 8, [[tilt, FLEN[id][0]], [tilt + bend, FLEN[id][1]]]), hw: FHW[id], nail: true, creases: [1], shade: true };
    }
    if (type === 'hump') {
      const [h, tilt] = HUMP[parts[1]];
      const x = FX[parts[1]];
      return { joints: [{ x, y: topY + 12 }, { x: x + Math.sin(rad(tilt)) * h, y: topY + 12 - h * Math.cos(rad(tilt)) }], hw: [10.3, 8.4], hump: true };
    }
    if (type === 'thumb') {
      const [x, y, aA, lA, aB, lB] = parts[1].split(',').map(Number);
      return { joints: chain(x, y, [[aA, lA], [aB, lB]]), hw: [11, 9.5, 7.8], nail: true, creases: [1], shade: true };
    }
    if (type === 'gunIndex') return { joints: chain(80, topY + 8, [[184, 34], [176, 28]]), hw: FHW.i, nail: true, creases: [1], shade: true };
    if (type === 'gunThumb') return { joints: chain(82, topY + 6, [[-96, 26], [-84, 20]]), hw: [10.5, 9, 7.2], nail: true, creases: [1], shade: true };
    if (type === 'hook') return { joints: [{ x: 88, y: topY + 10 }, { x: 88, y: topY - 8 }, { x: 96, y: topY - 20 }, { x: 106, y: topY - 13 }], hw: [9.5, 8.3, 7, 5.4], shade: true };
    return null;
  }

  // 横搭拇指姿态表
  const THUMBS = {
    across: (t) => ({ joints: [{ x: 65, y: t + 46 }, { x: 94, y: t + 30 }, { x: 124, y: t + 24 }], hw: [11.5, 9.8, 7.8] }),
    far: (t) => ({ joints: [{ x: 65, y: t + 46 }, { x: 98, y: t + 28 }, { x: 132, y: t + 20 }], hw: [11.5, 9.8, 7.8] }),
    tuck: (t) => ({ joints: [{ x: 66, y: t + 50 }, { x: 96, y: t + 38 }, { x: 120, y: t + 32 }], hw: [10.5, 9, 7.2] }),
    mid: (t) => ({ joints: [{ x: 64, y: t + 38 }, { x: 94, y: t + 22 }, { x: 124, y: t + 18 }, { x: 144, y: t + 22 }], hw: [11.5, 10.3, 8.5, 7] }),
    tight: (t) => ({ joints: [{ x: 64, y: t + 42 }, { x: 92, y: t + 26 }, { x: 118, y: t + 22 }], hw: [11.5, 10, 8] }),
  };

  // 姿势表
  const POSES = {
    0: { palm: [110, 80, 152, 178], feats: ['hump:i', 'hump:m', 'hump:r', 'hump:p'], valleys: [5, 5, 5], thumb: 'tight', hole: true },
    1: { feats: ['up:i:-92', 'hump:m', 'hump:r', 'hump:p'], valleys: [10, 5, 5], thumb: 'across' },
    2: { feats: ['up:i:-103', 'up:m:-77', 'hump:r', 'hump:p'], valleys: [17, 11, 5], thumb: 'far' },
    3: { feats: ['up:i:-95', 'up:m:-90', 'up:r:-84', 'hump:p'], valleys: [9, 9, 10], thumb: 'far' },
    4: { feats: ['up:i:-95', 'up:m:-90', 'up:r:-85', 'up:p:-79'], valleys: [9, 9, 9], thumb: 'tuck', lines: true },
    5: { feats: ['thumb:72,130,-128,30,-102,24', 'up:i:-99', 'up:m:-91', 'up:r:-83', 'up:p:-73'], valleys: [13, 13, 13, 12], lines: true },
    6: { feats: ['thumb:74,132,-148,26,-112,22', 'hump:i', 'hump:m', 'hump:r', 'up:p:-66'], valleys: [13, 6, 6, 10], lines: true },
    7: { custom: 'pinch' },
    8: { feats: ['gunIndex', 'gunThumb', 'hump:m', 'hump:r', 'hump:p'], valleys: [12, 4, 5, 5] },
    9: { feats: ['hook', 'hump:m', 'hump:r', 'hump:p'], valleys: [9, 5, 5], thumb: 'across' },
    10: { palm: [110, 80, 152, 178], feats: ['hump:i', 'hump:m', 'hump:r', 'hump:p'], valleys: [5, 5, 5], thumb: 'mid' },
    11: { feats: ['up:i:-96', 'hump:m', 'hump:r', 'up:p:-69'], valleys: [10, 5, 10], thumb: 'far' },
  };

  function build(d) {
    const g = POSES[d] || POSES[0];
    let inner = '';
    if (g.custom === 'pinch') inner = pinch();
    else {
      const [t, xL, xR, wY] = g.palm || [104, 76, 156, 182];
      const palm = palmProf(t, xL, xR, wY);
      const feats = g.feats.map((s) => resolveFeat(s, t));
      const out = unified(palm, feats, g.valleys);
      inner += `<path d="${out.d}" fill="url(#hskin)" stroke="${LINE}" stroke-width="3.5" stroke-linejoin="round"/>`;
      inner += palmShade(palm);
      for (const ft of feats) if (ft && ft.shade) inner += shadeStrip(ft.joints, ft.hw);
      for (const ft of feats) {
        if (!ft) continue;
        if (ft.creases) for (const i of ft.creases) inner += creaseAt(ft.joints, ft.hw, i);
        if (ft.hump) inner += humpCrease(ft.joints, ft.hw);
        if (ft.nail) inner += nailAt(ft.joints, ft.hw);
      }
      for (const v of out.vpts) if (v.depth >= 12) inner += sepLine(v.p);
      if (g.lines) inner += palmLines(palm);
      if (g.thumb) {
        const tb = THUMBS[g.thumb](t);
        inner += overlayThumb(tb.joints, tb.hw);
        inner += thenarCrease(palm);
      }
      if (g.hole) inner += `<ellipse cx="88" cy="${t + 8}" rx="7" ry="4.4" fill="#38220f" stroke="${LINE}" stroke-width="2.4" transform="rotate(-18 88 ${t + 8})"/>`;
    }
    return `<svg class="hand" viewBox="0 0 220 210" role="img" aria-label="手势 ${d}">
  <defs><linearGradient id="hskin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${SKIN}"/><stop offset="1" stop-color="${SKIN2}"/></linearGradient></defs>
  <ellipse cx="110" cy="202" rx="48" ry="6" fill="#000000" opacity="0.15"/>
  ${inner}
</svg>`;
  }
  return build;
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

function skillCardHTML(sk, digit, afford, attrs = '') {
  const art = SKILL_ART[sk.id] || SKILL_ART._def;
  return `<button class="skill-card theme-${art.theme}${afford ? '' : ' disabled'}" ${afford ? '' : 'disabled'} ${attrs} title="${esc(sk.desc)}">
    <div class="card-art">${art.svg}</div>
    <div class="card-name">${esc(sk.name)}</div>
    <div class="card-desc">${esc(sk.desc)}</div>
    <div class="card-cost">⚡${digit}</div>
    ${sk.star ? '<div class="card-star">★</div>' : ''}
    ${sk.isDigit ? '<div class="card-tag">数字</div>' : ''}
  </button>`;
}
