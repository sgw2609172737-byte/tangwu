'use strict';
// AI 冒烟测试：三档难度各跑若干局 AI vs AI，验证不崩溃、动作全部合法
// 注：游戏无回合上限，弱 AI（easy 随机）之间可能长期不分胜负，故"是否结束"只作报告，不作断言。
const path = require('path');
const fs = require('fs');
const engine = require('../engine');
const skills = require('../skills');
const { createGame, startGame, addHand, actSkill, passTurn } = engine;

global.window = { __TW_engine: engine, __TW_skills: skills };
eval(fs.readFileSync(path.join(__dirname, '..', 'public', 'ai.js'), 'utf8'));
const AI = global.window.__TWAI;

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
if (allOk) console.log('AI 冒烟测试通过：三档均不崩溃、动作全部合法');
