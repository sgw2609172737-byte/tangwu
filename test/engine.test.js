'use strict';
// 《唐五》引擎单元测试：覆盖回合流程、全部关键技能与边界
// 注意：释放技能会先扣能量（费用=技能手数字）；非"再次行动"技能释放后回合立即换边；
//       每回合必须先"相加"（或处于 awaitAction）才能行动/空过。
const assert = require('assert');
const { createGame, startGame, addHand, actSkill, passTurn } = require('../engine');
const { SKILLS, solve24 } = require('../skills');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

function mk(names) { const g = createGame(names || ['A', 'B']); startGame(g); return g; }
function cur(g) { return g.players[g.turn]; }
function opp(g) { return g.players[1 - g.turn]; }
function sid(g, id) { const i = SKILLS[cur(g).skill].findIndex((s) => s.id === id); assert.notStrictEqual(i, -1, `技能 ${id} 不在当前数字 ${cur(g).skill} 中`); return i; }
function act(g, id, opts) { const r = actSkill(g, sid(g, id), opts); if (r && r.err) throw new Error(r.err); }
function pass(g) { const r = passTurn(g); if (r && r.err) throw new Error(r.err); }
function add(g, c) { const r = addHand(g, c); if (r && r.err) throw new Error(r.err); }
// 完成当前玩家的一个完整回合：相加（若需要）+ 空过；冰封回合会自动跳过
function skipTurn(g) { if (g.step === 'awaitAdd') add(g, 0); if (g.step === 'awaitAction') pass(g); }
// 让当前玩家直接释放指定技能：设置技能手数字、补足能量
function force(g, d, step = 'awaitAction') { g.step = step; cur(g).skill = d; }

console.log('《唐五》引擎测试');
test('初始状态：能量2/技能1，先手20血后手21血，开局+1能量', () => {
  const g = mk(['A', 'B']);
  assert.strictEqual(g.phase, 'playing');
  assert.strictEqual(g.players[g.turn].hp, 20); // 先手20血
  assert.strictEqual(g.players[1 - g.turn].hp, 21); // 后手21血
  const p = cur(g);
  assert.strictEqual(p.energy, 3);
  assert.strictEqual(p.skill, 1);
  assert.strictEqual(g.step, 'awaitAdd');
});

test('首回合相加：加对方能量手(2)→3，加对方技能手(1)→2', () => {
  let g = mk();
  add(g, 0); assert.strictEqual(cur(g).skill, 3);
  g = mk();
  add(g, 1); assert.strictEqual(cur(g).skill, 2);
});

test('释放技能扣费+回合结束换边', () => {
  const g = mk(); const first = g.turn;
  const p = g.players[first];
  add(g, 1); // skill = (1+1)%10 = 2
  assert.strictEqual(p.energy, 3);
  const hpBefore = p.hp;
  act(g, 'huifu'); // 回复术士：费用2，+2血
  assert.strictEqual(p.energy, 1); // 3-2
  assert.strictEqual(p.hp, hpBefore + 2);
  assert.strictEqual(g.turn, 1 - first); // 回合已换边
  assert.strictEqual(cur(g).energy, 3); // 对方回合开始+1
  assert.strictEqual(g.step, 'awaitAdd');
});

test('能量封顶11、封底0', () => {
  const g = mk(); const p = cur(g), o = opp(g);
  p.energy = 11;
  force(g, 0); act(g, 'danxiao'); // 费用0，回合结束
  assert.strictEqual(p.energy, 11); // 11+1 封顶
  // o 的回合：o 用寒风打 p（p 能量-1，p 受3伤）；o 回合结束后回到 p（+1 能量）
  o.energy = 11; p.energy = 1;
  const hpBefore = p.hp;
  force(g, 3); act(g, 'hanfeng');
  assert.strictEqual(p.hp, hpBefore - 3);
  assert.strictEqual(p.energy, 1); // 1-1=0，随后 p 回合开始 +1
  // p 的回合：p 用小小偷偷 o（o 能量 2-4 → 封底0，随后 o 回合 +1）
  p.energy = 11; o.energy = 2;
  force(g, 4); act(g, 'xiaoxiaotou');
  assert.strictEqual(o.energy, 1); // 2-4=0（不为负）→ +1
});

test('投资：先扣5费，+3再翻倍，封顶11', () => {
  const g = mk(); const p = cur(g), o = opp(g);
  p.energy = 5;
  force(g, 5); act(g, 'touzi');
  assert.strictEqual(p.energy, 6); // (5-5+3)*2
  o.energy = 11;
  force(g, 5); act(g, 'touzi');
  assert.strictEqual(o.energy, 11); // (11-5+3)*2=18 → 封顶11
});

test('无敌：抵挡伤害+2血并消失', () => {
  const g = mk(); const p = cur(g), o = opp(g);
  o.hp = 21; o.wudi = true;
  force(g, 1); act(g, 'quan');
  assert.strictEqual(o.hp, 23); // 未扣血 +2
  assert.strictEqual(o.wudi, false);
});

test('荆棘：反弹⌈n/2⌉一次', () => {
  const g = mk(); const p = cur(g), o = opp(g);
  o.hp = 21; o.jingji = true; p.energy = 11;
  const hpBefore = p.hp;
  force(g, 6); act(g, 'jiubaK'); // 9伤（无连携）
  assert.strictEqual(o.hp, 12);
  assert.strictEqual(p.hp, hpBefore - 5); // 反弹ceil(9/2)=5
  assert.strictEqual(o.jingji, false);
});

test('荆棘反弹被攻击方无敌抵挡（+2血）', () => {
  const g = mk(); const p = cur(g), o = opp(g);
  o.hp = 21; o.jingji = true; p.wudi = true; p.energy = 11;
  const hpBefore = p.hp;
  force(g, 6); act(g, 'jiubaK');
  assert.strictEqual(o.hp, 12);
  assert.strictEqual(p.hp, hpBefore + 2); // 反弹5被无敌挡 → +2
  assert.strictEqual(p.wudi, false);
});

test('假人复活：灵魂转移、继承状态', () => {
  const g = mk(); const p = cur(g), o = opp(g);
  o.hp = 5; o.dummy = { alive: true, hp: 3, castBefore: true }; o.energy = 10;
  p.energy = 11;
  force(g, 9); act(g, 'yuandu'); // 10伤 + 能量-2
  assert.strictEqual(o.hp, 3); // 复活为假人血量
  assert.strictEqual(o.dummy.alive, false);
  assert.strictEqual(o.inDummyCombat, true);
  assert.strictEqual(o.energy, 9); // 10-2=8，随后 o 回合开始 +1
  assert.strictEqual(g.over, false);
});

test('98K连携：114514秒杀无视假人', () => {
  const g = mk(); const p = cur(g), o = opp(g);
  o.hp = 30; o.dummy = { alive: true, hp: 9, castBefore: true }; o.wudi = true; o.jingji = true;
  p.energy = 11;
  force(g, 6);
  g.chainCount = 3; g.chainDigits = new Set(['san', 'ba']);
  act(g, 'jiubaK');
  assert.strictEqual(g.over, true);
  assert.strictEqual(g.winner, g.turn);
  assert.strictEqual(o.dummy.alive, true); // 被无视，未触发复活
  assert.ok(o.hp <= 0);
});

test('七步：-4→净化降为-3→净化解除；不触发无敌', () => {
  const g = mk(); const first = g.turn;
  const p = g.players[first], o = g.players[1 - first];
  p.hp = 20; p.qibu = { stage: 1, owner: 1 - first }; p.wudi = true;
  skipTurn(g); // p回合结束 → -4（不触发无敌）
  assert.strictEqual(p.hp, 16);
  assert.strictEqual(p.wudi, true); // 无敌保留
  skipTurn(g); // o回合
  assert.strictEqual(g.turn, first);
  force(g, 0); act(g, 'jinghua'); // p净化：+1血，七步→-3；回合结束再-3
  assert.strictEqual(p.qibu.stage, 2);
  assert.strictEqual(p.hp, 14); // 16+1-3
  skipTurn(g); // o回合
  assert.strictEqual(g.turn, first);
  force(g, 0); act(g, 'jinghua'); // 解除；回合结束不再扣
  assert.strictEqual(p.qibu.stage, 0);
  assert.strictEqual(p.hp, 15); // 14+1
});

test('冰封：只+1能量、跳过相加与行动', () => {
  const g = mk(); const first = g.turn;
  const o = opp(g);
  o.freeze = 2; o.huxi = true; o.shuangbei = true; o.hp = 21;
  skipTurn(g); // p回合结束 → o被冰封回合自动跳过 → 回到p
  assert.strictEqual(o.energy, 3); // 2+1 only
  assert.strictEqual(o.hp, 21); // 呼吸回血不生效
  assert.strictEqual(o.freeze, 1);
  assert.strictEqual(g.turn, first);
  assert.strictEqual(g.step, 'awaitAdd');
});

test('赌命：6回合倒计时归零直接败北（无视假人）', () => {
  const g = mk(); const first = g.turn;
  const p = g.players[first];
  const hpBefore = p.hp;
  p.energy = 8; p.dummy = { alive: true, hp: 5, castBefore: true };
  force(g, 8); act(g, 'duming');
  assert.strictEqual(p.energy, 4); // 8-8+4
  assert.strictEqual(p.hp, hpBefore + 6);
  assert.strictEqual(g.step, 'awaitAdd'); // 再次行动
  skipTurn(g); // 完成再次行动并结束回合
  assert.strictEqual(p.duming.turnsLeft, 5);
  // 倒计时只在赌命者自己的回合结束时递减：再过5个自己的回合（中间夹5个对方回合）→ 死亡
  for (let i = 0; i < 10 && !g.over; i++) skipTurn(g);
  assert.strictEqual(g.over, true);
  assert.strictEqual(g.winner, 1 - first);
  assert.strictEqual(p.dummy.alive, true); // 被无视
});

test('赏金：含自身5伤结算能量', () => {
  const g = mk(); const p = cur(g), o = opp(g);
  o.hp = 30; p.energy = 10;
  force(g, 5); act(g, 'shangjin');
  assert.strictEqual(p.energy, 7); // 10-5+ceil(5/3)=10-5+2
  assert.strictEqual(o.hp, 25);
});

test('以战养战：16伤→+6能量', () => {
  const g = mk(); const p = cur(g);
  p.cumulativeDmg = 16; p.energy = 8;
  force(g, 4); act(g, 'yizhanyangzhan');
  assert.strictEqual(p.energy, 10); // 8-4+6
});

test('极盗：清零并获得⌈1/3⌉', () => {
  const g = mk(); const p = cur(g), o = opp(g);
  o.energy = 10; p.energy = 9;
  force(g, 9); act(g, 'jidao');
  assert.strictEqual(o.energy, 1); // 清零后 o 回合开始 +1
  assert.strictEqual(p.energy, 4); // 9-9+4
});

test('幻雾：对方下回合跳过相加', () => {
  const g = mk(); const first = g.turn;
  const o = g.players[1 - first];
  force(g, 2); act(g, 'huanwu'); // p回合结束
  assert.strictEqual(g.turn, 1 - first);
  assert.strictEqual(g.step, 'awaitAction'); // 跳过相加
  assert.strictEqual(cur(g).skill, 1);
  pass(g); // o空过 → 回到p
  assert.strictEqual(g.turn, first);
});

test('嘲讽：对方下回合伤害<4 → 反伤(4-n)', () => {
  const g = mk(); const first = g.turn;
  const p = g.players[first], o = g.players[1 - first];
  p.chaofeng = { pending: true, dmg: 0 };
  o.hp = 21;
  const pHp = p.hp;
  skipTurn(g); // p回合 → o回合
  assert.strictEqual(g.turn, 1 - first);
  o.energy = 11;
  force(g, 1); act(g, 'quan'); // o打p 2伤 → 回合结束嘲讽结算
  assert.strictEqual(p.hp, pHp - 2);
  assert.strictEqual(o.hp, 19); // 反伤 4-2=2
  assert.strictEqual(g.turn, first);
});

test('盈能：1回合未攻击后下次伤害+1，用后重新计数', () => {
  const g = mk(); const first = g.turn;
  const p = g.players[first], o = g.players[1 - first];
  p.energy = 8;
  force(g, 6); act(g, 'yingneng'); // p回合结束 → idle=1
  assert.strictEqual(p.yingneng.idle, 1);
  skipTurn(g); // o回合
  assert.strictEqual(g.turn, first);
  o.hp = 21; p.energy = 11;
  force(g, 1); act(g, 'quan'); // 2+1=3
  assert.strictEqual(o.hp, 18);
  assert.strictEqual(p.yingneng.idle, 0);
});

test('淬毒：攻击技能给目标挂1层下回合毒伤，不受增伤', () => {
  const g = mk(); const first = g.turn;
  const p = g.players[first], o = g.players[1 - first];
  p.energy = 11;
  force(g, 4); act(g, 'cuidu');
  assert.strictEqual(p.cuidu, true);
  skipTurn(g); // o回合
  assert.strictEqual(g.turn, first);
  o.hp = 21;
  p.duming = { active: true, turnsLeft: 99, extraUsed: true }; // 赌命+3存在，但毒伤不受增伤
  p.energy = 11;
  force(g, 1); act(g, 'quan'); // 2+3=5伤 + 挂毒
  assert.strictEqual(o.hp, 16);
  assert.strictEqual(o.delayed.length, 1);
  assert.strictEqual(o.delayed[0].dmg, 1);
  p.duming = { active: false, turnsLeft: 0, extraUsed: false };
  skipTurn(g); // o回合 → p回合开始，毒伤结算
  assert.strictEqual(g.turn, first);
  assert.strictEqual(o.hp, 15); // 1点毒伤（无增伤）
});

test('净化：解除小烈焰延迟伤', () => {
  const g = mk(); const first = g.turn;
  const p = g.players[first], o = g.players[1 - first];
  o.hp = 21; p.energy = 11;
  force(g, 3); act(g, 'xiaolieyan'); // 3伤 + 挂2延迟
  assert.strictEqual(o.hp, 18);
  assert.strictEqual(o.delayed.length, 1);
  assert.strictEqual(g.turn, 1 - first); // o回合
  force(g, 0); act(g, 'jinghua'); // o净化自己：+1血，解除延迟
  assert.strictEqual(o.delayed.length, 0);
  assert.strictEqual(o.hp, 19);
  assert.strictEqual(g.turn, first); // p回合开始：延迟已解除
  assert.strictEqual(o.hp, 19);
});

test('尤里：完全控制对方下回合', () => {
  const g = mk(); const first = g.turn;
  const o = opp(g);
  cur(g).energy = 11;
  force(g, 9); act(g, 'youli');
  assert.strictEqual(g.turn, 1 - first);
  assert.strictEqual(g.controller, first); // 控制权在对方回合开始时生效
});

test('公平正义：去除指定buff', () => {
  const g = mk(); const p = cur(g), o = opp(g);
  o.qianghua = true; o.wudi = true; o.jingji = true;
  p.energy = 11;
  force(g, 7); act(g, 'gongping', { buffIdx: 1 }); // 去除无敌
  assert.strictEqual(o.wudi, false);
  assert.strictEqual(o.qianghua, true);
  assert.strictEqual(o.jingji, true);
});

test('识破：互换本体与假人血量再打1伤', () => {
  const g = mk(); const p = cur(g), o = opp(g);
  o.hp = 10; o.dummy = { alive: true, hp: 3, castBefore: true };
  p.energy = 9;
  force(g, 9); act(g, 'shipo');
  assert.strictEqual(o.hp, 2); // 3-1
  assert.strictEqual(o.dummy.hp, 10);
});

test('同时倒下→平局（荆棘反杀）', () => {
  const g = mk(); const p = cur(g), o = opp(g);
  p.hp = 1; o.hp = 1; o.jingji = true; p.energy = 11;
  force(g, 9); act(g, 'yuandu'); // 10伤
  assert.strictEqual(g.over, true);
  assert.strictEqual(g.result, 'draw');
});

test('数字连携链：数字技能入链、其他技能断链、换回合清零', () => {
  const g = mk();
  cur(g).energy = 11;
  force(g, 3); act(g, 'san'); // 数字技能 → 再次行动
  assert.strictEqual(g.chainCount, 1);
  assert.strictEqual(g.step, 'awaitAdd');
  add(g, 0);
  force(g, 1); act(g, 'quan'); // 非数字 → 断链
  assert.strictEqual(g.chainCount, 0);
});

test('24点求解器', () => {
  assert.strictEqual(solve24([1, 2, 3, 4]), true);
  assert.strictEqual(solve24([3, 3, 8, 8]), true); // 8/(3-8/3)
  assert.strictEqual(solve24([5, 5, 5, 5]), true); // 5*5-5/5
  assert.strictEqual(solve24([1, 1, 1, 1]), false);
  assert.strictEqual(solve24([1, 1, 1, 2]), false);
  assert.strictEqual(solve24([9, 9, 9, 9]), false);
});

test('能量不足无法释放技能', () => {
  const g = mk();
  force(g, 9); cur(g).energy = 3;
  const r = actSkill(g, 0);
  assert.ok(r && r.err);
  assert.strictEqual(g.step, 'awaitAction'); // 状态不变
});

console.log(`\n通过 ${passed} 项测试${process.exitCode ? '（有失败）' : ''}`);
