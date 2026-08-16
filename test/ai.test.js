'use strict';
// AI 冒烟测试：三档难度各跑若干局 AI vs AI，验证不崩溃、动作全部合法；并测服务端 runAI 驱动
// 注：游戏无回合上限，弱 AI（easy 随机）之间可能长期不分胜负，故"是否结束"只作报告，不作断言。
const engine = require('../engine');
const AI = require('../ai');
const { runAI } = require('../lib/ai-player');
const { createGame, startGame, addHand, actSkill, passTurn } = engine;

function runGame(diff, maxSteps) {
  const g = createGame(['A', 'B']);
  startGame(g);
  let guard = 0;
  while (!g.over && guard++ < maxSteps) {
    const actor = g.controller >= 0 ? g.controller : g.turn;
    const a = AI.chooseAction(g, actor, diff);
    if (!a) throw new Error(`${diff} 无动作可用`);
    let r;
    if (a.type === 'add') r = addHand(g, a.choice);
    else if (a.type === 'act') r = actSkill(g, a.skillIdx, { buffIdx: a.buffIdx });
    else r = passTurn(g);
    if (r && r.err) throw new Error(`${diff} 动作非法：${r.err}`);
  }
  return g.over;
}

const diffs = ['easy', 'normal', 'hard'];
let allOk = true;
for (const d of diffs) {
  const n = d === 'hard' ? 8 : 15;
  try {
    let ended = 0;
    for (let i = 0; i < n; i++) if (runGame(d, 800)) ended++;
    console.log(`  ✓ ${d}：无崩溃/无非法动作（${ended}/${n} 局在 800 步内分出胜负）`);
  } catch (e) {
    allOk = false;
    console.error(`  ✗ ${d}\n    ${e.message}`);
    process.exitCode = 1;
  }
}

// runAI：模拟"人类创建人机房后，AI 自动走完自己的回合回到人类"
try {
  let humanTurnCount = 0;
  for (let i = 0; i < 30; i++) {
    const g = createGame(['你', 'AI']);
    startGame(g);
    const room = { game: g, difficulty: diffs[i % 3] };
    runAI(room); // AI 若先手则走完；否则不动
    if (g.over) continue; // AI 先手直接秒杀人类？理论上开局不可能
    if (g.controller >= 0 ? g.controller === 1 : g.turn === 1) throw new Error('runAI 后仍轮到 AI');
    if (g.step === 'awaitAdd' || g.step === 'awaitAction') humanTurnCount++;
  }
  console.log(`  ✓ runAI：30 局均正确回到人类回合（${humanTurnCount} 局轮到人类行动）`);
} catch (e) {
  allOk = false;
  console.error(`  ✗ runAI\n    ${e.message}`);
  process.exitCode = 1;
}

if (allOk) console.log('AI 冒烟测试通过：三档均不崩溃、动作全部合法，runAI 正常');
