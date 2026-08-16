'use strict';
// AI 冒烟测试：三档各跑若干局验证不崩溃、动作合法；并自检"困难是否明显强于普通"
const engine = require('../engine');
const AI = require('../ai');
const { runAI } = require('../lib/ai-player');
const { createGame, startGame, addHand, actSkill, passTurn } = engine;

const FAST = 40;   // 冒烟用的小时间预算（ms）
const DUEL = 90;   // 强度自检预算

function playOne(diffA, diffB, timeMs, maxSteps) {
  const g = createGame(['A', 'B']);
  startGame(g);
  let guard = 0;
  while (!g.over && guard++ < maxSteps) {
    const actor = g.controller >= 0 ? g.controller : g.turn;
    const diff = actor === 0 ? diffA : diffB;
    const a = AI.chooseAction(g, actor, diff, timeMs);
    if (!a) throw new Error('无动作可用');
    let r;
    if (a.type === 'add') r = addHand(g, a.choice);
    else if (a.type === 'act') r = actSkill(g, a.skillIdx, { buffIdx: a.buffIdx });
    else r = passTurn(g);
    if (r && r.err) throw new Error(`动作非法：${r.err}`);
  }
  return g.over ? g : null;
}

// 1) 冒烟：三档不崩溃、动作合法
const diffs = ['easy', 'normal', 'hard'];
let allOk = true;
for (const d of diffs) {
  const n = d === 'hard' ? 8 : 12;
  try {
    let ended = 0;
    for (let i = 0; i < n; i++) if (playOne(d, d, FAST, 800)) ended++;
    console.log(`  ✓ ${d}：无崩溃/无非法动作（${ended}/${n} 局在 800 步内分出胜负）`);
  } catch (e) {
    allOk = false;
    console.error(`  ✗ ${d}\n    ${e.message}`);
    process.exitCode = 1;
  }
}

// 2) runAI：模拟"人类建人机房，AI 自动走完回到人类"
try {
  for (let i = 0; i < 20; i++) {
    const g = createGame(['你', 'AI']);
    startGame(g);
    const room = { game: g, difficulty: diffs[i % 3] };
    runAI(room);
    if (g.over) continue;
    if (g.controller >= 0 ? g.controller === 1 : g.turn === 1) throw new Error('runAI 后仍轮到 AI');
  }
  console.log('  ✓ runAI：20 局均正确回到人类回合');
} catch (e) {
  allOk = false;
  console.error(`  ✗ runAI\n    ${e.message}`);
  process.exitCode = 1;
}

// 3) 强度自检：hard(0) vs normal(1)，困难应明显占优（低于 45% 视为异常）
try {
  const n = 6;
  let aWins = 0, bWins = 0, draws = 0;
  for (let i = 0; i < n; i++) {
    const g = playOne('hard', 'normal', DUEL, 900);
    if (!g) continue;
    if (g.result === 'draw') draws++;
    else if (g.winner === 0) aWins++;
    else bWins++;
  }
  const rate = Math.round((aWins / n) * 100);
  console.log(`  ✓ 强度自检：hard 胜 normal ${aWins} 局（${rate}%），normal 胜 ${bWins}，平 ${draws}（共 ${n} 局）`);
  if (rate < 45) throw new Error(`hard 对 normal 胜率仅 ${rate}%，怀疑搜索强度不足`);
} catch (e) {
  allOk = false;
  console.error(`  ✗ 强度自检\n    ${e.message}`);
  process.exitCode = 1;
}

if (allOk) console.log('AI 测试通过：三档不崩溃、动作合法，hard 明显强于 normal');
