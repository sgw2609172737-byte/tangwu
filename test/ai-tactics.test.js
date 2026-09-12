'use strict';
const assert = require('node:assert/strict');
const E = require('../engine');
const AI = require('../ai');
const SK = require('../skills');
function position(digit, hp = 20, opponentHp = 20) {
  const g = E.createGame(['A', 'B']);
  g.turn = 0; g.phase = 'playing'; g.step = 'awaitAction';
  g.players[0].hp = hp; g.players[0].skill = digit; g.players[0].energy = 11;
  g.players[1].hp = opponentHp;
  return g;
}
function apply(g, a) { return a.type === 'act' ? E.actSkill(g, a.skillIdx, { buffIdx: a.buffIdx }) : a.type === 'add' ? E.addHand(g, a.choice) : E.passTurn(g); }
const tests = {
  '控制对方时不替对方斩杀自己'() {
    const g = position(6, 20, 5); g.controller = 1;
    const a = AI.chooseAction(g, 1, 'hard', 80);
    apply(g, a);
    assert.ok(!g.over || g.winner !== 0);
  },
  '直接斩杀优先，且不修改输入状态'() {
    const g = position(6, 20, 9), before = E.serializeGame(g);
    const a = AI.chooseAction(g, 0, 'hard', 50);
    assert.equal(E.serializeGame(g), before);
    assert.equal(SK.SKILLS[6][a.skillIdx].id, 'jiubaK');
    apply(g, a); assert.equal(g.winner, 0);
  },
  '七步等非攻击技能结算致胜也识别'() {
    const g = position(7, 20, 3); g.players[1].freeze = 1;
    const a = AI.chooseAction(g, 0, 'hard', 60);
    assert.equal(SK.SKILLS[7][a.skillIdx].id, 'qibu');
    apply(g, a); assert.equal(g.winner, 0);
  },
  '避免反弹导致自己先死'() {
    const g = position(6, 3, 20); g.players[1].jingji = true;
    const a = AI.chooseAction(g, 0, 'hard', 70); apply(g, a);
    assert.ok(!g.over || g.winner === 0);
  },
  '98K连携无视无敌和假人'() {
    const g = position(6, 20, 80); g.chainCount = 3; g.chainDigits = new Set(['yi', 'san']);
    g.players[1].wudi = true; g.players[1].dummy = { alive: true, hp: 100, castBefore: true };
    apply(g, AI.chooseAction(g, 0, 'hard', 50)); assert.equal(g.winner, 0);
  },
  '净化优先保命'() {
    const g = position(0, 2, 20); g.players[0].qibu = { stage: 1, owner: 1 };
    g.banned = ['jiaren'];
    const a = AI.chooseAction(g, 0, 'hard', 80);
    assert.equal(SK.SKILLS[0][a.skillIdx].id, 'jinghua');
  },
  '连携评分双方视角反对称'() {
    const g = position(3); g.chainCount = 3; g.chainDigits = new Set(['yi', 'san']);
    assert.ok(Math.abs(AI.evalGame(g, 0) + AI.evalGame(g, 1)) < 1e-8);
  },
  '禁用、连出上限与错误决策者不越权'() {
    const g = position(6); g.banned = ['jiubaK'];
    assert.ok(AI.legalActions(g).every((a) => a.skillIdx !== 1));
    g.players[0].streak = 24;
    assert.deepEqual(AI.chooseAction(g, 0, 'hard', 0), { type: 'pass' });
    assert.equal(AI.chooseAction(g, 1, 'hard', 0), null);
    g.phase = 'banning'; assert.deepEqual(AI.legalActions(g), []);
  },
  '零预算返回合法动作，不再启动长时间回退搜索'() {
    const g = position(4); const started = performance.now();
    const a = AI.chooseAction(g, 0, 'hard', 0);
    assert.ok(performance.now() - started < 250);
    assert.equal(apply(g, a).ok, true);
  },
  '24点缓存保持排列不变且不混淆失败结果'() {
    for (const nums of [[1, 3, 4, 6], [1, 1, 1, 1], [0, 0, 0, 0], [2, 2, 6, 6]]) {
      const result = SK.solve24(nums);
      assert.equal(SK.solve24(nums.slice().reverse()), result);
    }
    assert.equal(SK.solve24([1, 3, 4, 6]), true);
    assert.equal(SK.solve24([1, 1, 1, 1]), false);
  }
};
for (const [name, test] of Object.entries(tests)) { test(); console.log('  ✓ ' + name); }
console.log(`通过 ${Object.keys(tests).length} 项 AI 战术回归测试`);
