'use strict';
// 从开局执行真实合法行动，检查数值、终局和训练复盘的一致性。
const assert = require('node:assert/strict');
const E = require('../engine');
const AI = require('../ai');
const R = require('../replay');
const all = Object.values(E.SKILLS).flat();
let seed = 0x7308;
function random(n) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % n; }
const seen = new Set();
let completed = 0, bounded = 0, steps = 0;
for (let i = 0; i < 500; i++) {
  const g = E.createGame(['人类', 'AI']);
  g.searchOnly = true; g.turn = random(2);
  g.players[g.turn].hp = 20; g.players[1-g.turn].hp = 21;
  g.phase = 'banning';
  for (let p = 0; p < 2; p++) assert.equal(E.submitBan(g, p, all[random(all.length)].id).ok, true);
  const record = R.create(g);
  for (let turn = 0; !g.over && turn < 1000; turn++) {
    const actions = AI.legalActions(g);
    assert.ok(actions.length, `局 ${i} 步 ${turn} 缺少合法行动`);
    const pass = actions.find(a => a.type === 'pass');
    const action = pass && random(6) === 0 ? pass : actions[random(actions.length)];
    if (action.type === 'act') seen.add(E.SKILLS[g.players[g.turn].skill][action.skillIdx].id);
    assert.equal(R.perform(g, action, record).ok, true);
    steps++;
    assert.equal(g.resolvingSkill, undefined); assert.equal(g.resolvingDamage, undefined);
    for (const p of g.players) {
      assert.ok(Number.isSafeInteger(p.hp));
      assert.ok(Number.isInteger(p.energy) && p.energy >= 0 && p.energy <= 11);
      assert.ok(Number.isInteger(p.skill) && p.skill >= 0 && p.skill <= 9);
      assert.ok(p.yingneng.charge >= 0 && p.yingneng.charge <= 6);
      assert.ok([0, 1, 2].includes(p.qibu.stage));
      assert.ok(!p.dummy.alive || p.dummy.hp > 0);
      assert.ok(p.dummy.reserve.every(hp => Number.isSafeInteger(hp) && hp > 0));
    }
    if (!g.over) {
      assert.ok(g.players.every(p => p.hp > 0), '存活对局中存在未结算的死亡');
      assert.ok(['awaitAdd', 'awaitAction'].includes(g.step));
    } else {
      assert.equal(g.phase, 'over'); assert.equal(g.step, 'over');
      if (g.winner >= 0) {
        assert.ok(g.players[g.winner].hp > 0);
        assert.ok(g.players[1-g.winner].hp <= 0, '双方仍存活却被判负');
      } else if (g.endReason.code !== 'no-action-draw') assert.ok(g.players.every(p => p.hp <= 0));
    }
  }
  if (g.over) {
    const reconstructed = R.reconstruct(R.finish(record, g));
    assert.equal(E.serializeGame(reconstructed), E.serializeGame(g), '完整棋谱与实局结算不一致');
    completed++;
  } else bounded++; // 治疗可以使合法对局很长；达到采样上限不等于死锁。
}
assert.deepEqual([...seen].sort(), all.map(sk => sk.id).sort(), '随机真实行动没有覆盖全部 40 技能');
console.log(`✓ 固定种子 500 局、${steps} 步，覆盖全部 40 技能；${completed} 局终局逐项复盘一致，${bounded} 局达到 1000 步采样上限`);
