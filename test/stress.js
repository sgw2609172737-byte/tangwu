'use strict';
// 随机对局压力测试：验证引擎无崩溃、无死锁
const { createGame, startGame, addHand, actSkill, passTurn } = require('../engine');
const { SKILLS } = require('../skills');

const GAMES = Number(process.argv[2] || 300);
const MAX_STEPS = 3000;
let wins = 0, draws = 0, timeouts = 0, dumingDeaths = 0;
let minSteps = Infinity, maxSteps = 0;

for (let i = 0; i < GAMES; i++) {
  const g = createGame([`A${i}`, `B${i}`]);
  startGame(g);
  let steps = 0;
  try {
    while (!g.over && steps < MAX_STEPS) {
      steps++;
      const p = g.players[g.turn];
      if (g.step === 'awaitAdd') {
        addHand(g, Math.random() < 0.5 ? 0 : 1);
      } else if (g.step === 'awaitAction') {
        const list = SKILLS[p.skill];
        const afford = p.energy >= p.skill;
        const r = Math.random();
        if (r < 0.28 || !afford) passTurn(g);
        else {
          const idx = Math.floor(Math.random() * list.length);
          actSkill(g, idx, { buffIdx: Math.random() < 0.5 ? 0 : 1 });
        }
      } else {
        throw new Error(`未知 step: ${g.step}`);
      }
    }
  } catch (e) {
    console.error(`第${i}局崩溃:`, e.message);
    process.exitCode = 1;
    break;
  }
  if (g.over) {
    if (g.result === 'draw') draws++; else wins++;
    if (g.players.some((p) => p.duming && p.duming.active && p.duming.turnsLeft <= 0)) dumingDeaths++;
  } else timeouts++;
  minSteps = Math.min(minSteps, steps);
  maxSteps = Math.max(maxSteps, steps);
}

console.log(`共 ${GAMES} 局：分出胜负 ${wins}，平局 ${draws}，超时未分胜负 ${timeouts}（赌命致死 ${dumingDeaths}）`);
console.log(`步数范围：${minSteps} ~ ${maxSteps}`);
if (!process.exitCode) console.log('✓ 无崩溃、无死锁');
