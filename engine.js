'use strict';
// 《唐五》游戏引擎：回合流程、伤害管线、buff、胜负判定（纯逻辑，无网络依赖）
const { SKILLS, positiveBuffs } = require('./skills');

const CAP_E = 11;          // 能量上限
const MAX_ACTIONS = 50;    // 每回合行动次数上限（含再次行动）

// ---------- 基础工具 ----------
function log(g, msg) {
  g.log.push(msg);
  if (g.log.length > 400) g.log.splice(0, g.log.length - 400);
}
function idx(g, pl) { return g.players.indexOf(pl); }
function cur(g) { return g.players[g.turn]; }
function opp(g) { return g.players[1 - g.turn]; }
function gain(g, p, n) { p.energy = Math.min(CAP_E, p.energy + n); }
function loseE(g, p, n) { p.energy = Math.max(0, p.energy - n); }
function heal(g, p, n) { p.hp += n; }

// ---------- 玩家状态 ----------
function mkPlayer(name, hp) {
  return {
    name, hp,
    energy: 2, skill: 1,
    jingji: false,                                   // 荆棘
    wudi: false,                                     // 无敌
    yingneng: { active: false, idle: 0 },            // 盈能
    shuangbei: false,                                // 双倍圣水
    huxi: false,                                     // 呼吸回血
    qianghua: false,                                 // 强化（永久）
    bishi: false,                                    // 鄙视（永久被动）
    tanghua: false,                                  // 假人唐化（永久）
    cuidu: false,                                    // 淬毒（永久）
    dummy: { alive: false, hp: 0, castBefore: false }, // 假人
    inDummyCombat: false,                            // 假人作战状态（灵魂已转移到假人）
    qibu: { stage: 0, owner: -1 },                   // 七步：0无 1每回合-4 2每回合-3
    duming: { active: false, turnsLeft: 0, extraUsed: false }, // 赌命
    freeze: 0,                                       // 冰封剩余回合
    huanwuSkip: false,                               // 幻雾：下回合跳过相加
    chaofeng: { pending: false, dmg: 0 },            // 嘲讽
    delayed: [],                                     // 自己身上的延迟伤害 [{owner,dmg,desc,noBonus}]
    cumulativeDmg: 0,                                // 本局累计造成的伤害（以战养战）
    turnDmg: 0,                                      // 本回合造成的伤害（赏金）
    dealtThisTurn: false,                            // 本回合是否造成过伤害（盈能）
    controlledBy: -1,                                // 尤里：下回合被谁控制
  };
}

function createGame(names) {
  const turn = Math.random() < 0.5 ? 0 : 1; // 先手随机
  return {
    phase: 'waiting',                                // waiting | playing | over
    players: [
      mkPlayer(names[0] || '玩家1', turn === 0 ? 20 : 21), // 先手20血，后手21血
      mkPlayer(names[1] || '玩家2', turn === 1 ? 20 : 21),
    ],
    turn,
    step: 'idle',                                    // idle | awaitAdd | awaitAction | over
    controller: -1,                                  // 当前回合的实际决策者（尤里）
    chainCount: 0,                                   // 98K 数字连携计数
    chainDigits: new Set(),
    actionsUsed: 0,
    pendingDumingAgain: false,                       // 赌命"瞬时伤害≥9"的额外行动
    log: [],
    over: false, result: null, winner: -1,
  };
}

// ---------- 胜负 ----------
function endGame(g, winnerIdx) {
  if (g.over) return;
  g.over = true;
  g.phase = 'over';
  g.step = 'over';
  g.winner = winnerIdx;
  g.result = winnerIdx === -1 ? 'draw' : 'win';
  log(g, winnerIdx === -1 ? '🤝 双方同时倒下，平局！' : `🏆 ${g.players[winnerIdx].name} 获胜！`);
}

function checkDeaths(g) {
  if (g.over) return;
  const d0 = g.players[0].hp <= 0, d1 = g.players[1].hp <= 0;
  if (d0 && d1) endGame(g, -1);
  else if (d0) endGame(g, 1);
  else if (d1) endGame(g, 0);
}

// ---------- 伤害管线 ----------
// 结算顺序：盈能/赌命增伤 → 无敌抵挡（+2血，荆棘不触发）→ 扣血 → 赌命≥9额外行动 →
//           荆棘反弹（一次性，⌈n/2⌉）→ 假人复活 → 胜负检查
function dealDamage(g, source, target, amount, opts = {}) {
  if (g.over || amount <= 0) return false;
  const { ignoreWudi = false, ignoreJingji = false, bypassDummy = false, isDot = false, noBonus = false, note = '' } = opts;
  // 增伤（盈能一次性、赌命每段+3）；延迟/持续伤害与反弹伤害不吃增伤
  if (!noBonus && source) {
    if (source.yingneng.active && source.yingneng.idle > 0) {
      const b = Math.min(source.yingneng.idle, 6);
      amount += b;
      source.yingneng.idle = 0;
      log(g, `⚡ 盈能加成 +${b}（${source.name}）`);
    }
    if (source.duming.active) amount += 3;
  }
  // 无敌（仅抵挡瞬时伤害，dot 不触发；98K 无视）
  if (!isDot && target.wudi && !ignoreWudi) {
    target.wudi = false;
    heal(g, target, 2);
    log(g, `🛡 ${target.name} 的无敌抵挡了攻击，+2血`);
    return false;
  }
  target.hp -= amount;
  log(g, `${note ? '[' + note + '] ' : ''}${target.name} 受到 ${amount} 点伤害（HP ${target.hp}）`);
  if (source) {
    source.cumulativeDmg += amount;
    if (source === cur(g)) { source.turnDmg += amount; source.dealtThisTurn = true; }
    // 赌命：瞬时伤害≥9 → 额外行动（整局限一次，且仅当前行动者触发）
    if (!isDot && source.duming.active && !source.duming.extraUsed && amount >= 9 && source === cur(g)) {
      source.duming.extraUsed = true;
      g.pendingDumingAgain = true;
      log(g, `☠ 赌命：${source.name} 单次伤害≥9，获得额外行动！`);
    }
    // 嘲讽积累：对方下回合对你造成的伤害
    if (target.chaofeng.pending && source === cur(g) && source !== target) {
      target.chaofeng.dmg += amount;
    }
  }
  // 荆棘反弹（被无敌抵挡时不触发；98K 无视）
  if (target.jingji && !ignoreJingji && source && source !== target) {
    target.jingji = false;
    const r = Math.ceil(amount / 2);
    log(g, `🌵 ${target.name} 的荆棘反弹 ${r} 点伤害`);
    dealDamage(g, target, source, r, { noBonus: true, note: '荆棘反弹' });
  }
  // 假人复活（98K、赌命倒计时无视）
  if (target.hp <= 0 && target.dummy.alive && !bypassDummy) {
    const dhp = target.dummy.hp;
    target.dummy.alive = false;
    target.dummy.hp = 0;
    target.inDummyCombat = true;
    target.hp = dhp;
    log(g, `🤖 ${target.name} 的假人替他挡下致命一击！复活后 HP ${target.hp}`);
  }
  checkDeaths(g);
  return true;
}

// ---------- 回合流程 ----------
function startTurn(g) {
  if (g.over) return;
  const p = cur(g), o = opp(g);
  g.actionsUsed = 0;
  g.pendingDumingAgain = false;
  g.chainCount = 0;
  g.chainDigits.clear();
  p.dealtThisTurn = false;
  p.turnDmg = 0;
  // 鄙视：对方回合前，若其技能手数字更大
  if (o.bishi && o.skill > p.skill) {
    gain(g, o, 1); loseE(g, p, 1);
    log(g, `👁 鄙视触发：${o.name} +1能量，${p.name} -1能量`);
  }
  // 尤里：本回合决策者
  g.controller = p.controlledBy >= 0 ? p.controlledBy : -1;
  p.controlledBy = -1;
  // 冰封：只能+1能量
  if (p.freeze > 0) {
    p.freeze--;
    gain(g, p, 1);
    log(g, `❄ ${p.name} 被冰封，本回合只能获得1点能量（剩余${p.freeze}回合）`);
    endTurn(g);
    return;
  }
  // 正常回合开始
  gain(g, p, 1);
  if (p.shuangbei) { gain(g, p, 1); log(g, `💧 双倍圣水：${p.name} 额外+1能量`); }
  if (p.huxi) { heal(g, p, 1); log(g, `💚 呼吸回血：${p.name} +1血`); }
  // 延迟伤害触发：对方身上、由我造成的延迟伤害（小烈焰/淬毒），在我的回合开始时自动结算
  const pend = o.delayed.filter((d) => d.owner === idx(g, p));
  if (pend.length) {
    o.delayed = o.delayed.filter((d) => d.owner !== idx(g, p));
    for (const d of pend) {
      dealDamage(g, p, o, d.dmg, { isDot: true, noBonus: !!d.noBonus, note: d.desc });
      if (g.over) return;
    }
  }
  // 幻雾：跳过相加
  if (p.huanwuSkip) {
    p.huanwuSkip = false;
    g.step = 'awaitAction';
    log(g, `🌫 幻雾生效：${p.name} 本回合跳过技能手相加`);
  } else {
    g.step = 'awaitAdd';
  }
}

function endTurn(g) {
  if (g.over) return;
  const p = cur(g), o = opp(g);
  // 七步：回合结束时扣血（不触发无敌、不受增伤）
  if (p.qibu.stage > 0) {
    const d = p.qibu.stage === 1 ? 4 : 3;
    const owner = g.players[p.qibu.owner] || o;
    dealDamage(g, owner, p, d, { isDot: true, noBonus: true, note: '七步' });
    if (g.over) return;
  }
  // 嘲讽：对方下回合伤害 n<4 → 反伤 (4-n)
  if (o.chaofeng.pending) {
    o.chaofeng.pending = false;
    const n = o.chaofeng.dmg;
    if (n < 4) {
      log(g, `🗡 嘲讽触发：对方只造成${n}点伤害`);
      dealDamage(g, o, p, 4 - n, { note: '嘲讽' });
      if (g.over) return;
    } else {
      log(g, `🗡 嘲讽未触发（对方造成${n}点伤害）`);
    }
  }
  // 盈能：本回合未攻击则计数+1（上限6）
  if (p.yingneng.active && !p.dealtThisTurn) {
    p.yingneng.idle = Math.min(6, p.yingneng.idle + 1);
  }
  // 赌命倒计时（赌命者自己的回合结束时-1，含释放当回合；归零直接败北，无视假人）
  if (p.duming.active) {
    p.duming.turnsLeft--;
    if (p.duming.turnsLeft <= 0) {
      log(g, `☠ 赌命时间到！${p.name} 血量清零，直接败北`);
      p.hp = 0;
      endGame(g, 1 - idx(g, p));
      return;
    }
  }
  if (g.over) return;
  g.turn = 1 - g.turn;
  startTurn(g);
}

function startGame(g) {
  g.phase = 'playing';
  log(g, `🎮 游戏开始！先手：${g.players[g.turn].name}（20血），后手：${g.players[1 - g.turn].name}（21血）`);
  startTurn(g);
}

// ---------- 玩家操作 ----------
function addHand(g, choice) {
  if (g.over || g.step !== 'awaitAdd') return { err: '现在不是相加阶段' };
  const p = cur(g), o = opp(g);
  const shown = choice === 0 ? o.energy % 10 : o.skill;
  const old = p.skill;
  p.skill = (p.skill + shown) % 10;
  g.step = 'awaitAction';
  log(g, `✋ ${p.name} 技能手与对方${choice === 0 ? '能量手' : '技能手'}（${shown}）相加：${old} → ${p.skill}`);
  return { ok: true };
}

function actSkill(g, skillIdx, opts = {}) {
  if (g.over || g.step !== 'awaitAction') return { err: '现在不能释放技能' };
  const p = cur(g), o = opp(g);
  const list = SKILLS[p.skill];
  const sk = list && list[skillIdx];
  if (!sk) return { err: '技能不存在' };
  if (p.energy < p.skill) return { err: '能量不足' };
  p.energy -= p.skill;
  g.actionsUsed++;
  log(g, `🎯 ${p.name} 释放了【${sk.name}】（消耗 ${p.skill} 能量）`);
  const ctx = {
    g, p, o, pIdx: idx(g, p), skill: sk, opts: opts || {},
    log: (m) => log(g, m),
    gain: (n) => gain(g, p, n),
    healSelf: (n) => heal(g, p, n),
    dmg: (t, amt, o2 = {}) => dealDamage(g, p, t, amt, o2),
    kill: (sk.id === 'jiubaK' && g.chainCount >= 3 && g.chainDigits.size >= 2),
  };
  sk.run(ctx);
  if (g.over) return { ok: true };
  // 赌命：使用攻击技能后 +1 能量
  if (p.duming.active && sk.isAttack) {
    gain(g, p, 1);
    log(g, `☠ 赌命：攻击技能后 +1能量`);
  }
  // 淬毒：攻击技能给目标附加"下回合1毒伤"（每放一次攻击技能挂一层）
  if (p.cuidu && sk.isAttack) {
    o.delayed.push({ owner: idx(g, p), dmg: 1, desc: '淬毒', noBonus: true });
    log(g, `🕷 淬毒：${o.name} 下回合将额外受到1点毒伤`);
  }
  // 98K 数字连携链更新（数字技能入链，其他技能断链）
  if (sk.isDigit) { g.chainCount++; g.chainDigits.add(sk.id); }
  else { g.chainCount = 0; g.chainDigits.clear(); }
  // 再次行动
  let again = !!sk.grantsAgain;
  if (g.pendingDumingAgain) { again = true; g.pendingDumingAgain = false; }
  if (again && g.actionsUsed < MAX_ACTIONS) {
    g.step = 'awaitAdd';
    log(g, `🔁 ${p.name} 获得再次行动`);
  } else if (again) {
    log(g, `⚠️ 行动次数已达上限（${MAX_ACTIONS}），回合结束`);
    endTurn(g);
  } else {
    endTurn(g);
  }
  return { ok: true };
}

function passTurn(g) {
  if (g.over || g.step !== 'awaitAction') return { err: '现在不能空过' };
  log(g, `⏭ ${cur(g).name} 选择空过`);
  endTurn(g);
  return { ok: true };
}

// ---------- 对外状态 ----------
function buffList(p) {
  const out = [];
  if (p.jingji) out.push({ key: 'jingji', name: '荆棘', detail: '反弹一次伤害' });
  if (p.wudi) out.push({ key: 'wudi', name: '无敌', detail: '抵挡一次攻击+2血' });
  if (p.yingneng.active) out.push({ key: 'yingneng', name: '盈能', detail: `闲置${p.yingneng.idle}回合` });
  if (p.shuangbei) out.push({ key: 'shuangbei', name: '双倍圣水', detail: '每回合额外+1能量' });
  if (p.huxi) out.push({ key: 'huxi', name: '呼吸回血', detail: '每回合+1血' });
  if (p.qianghua) out.push({ key: 'qianghua', name: '强化', detail: '*技能加血+2' });
  if (p.bishi) out.push({ key: 'bishi', name: '鄙视', detail: '被动偷能量' });
  if (p.tanghua) out.push({ key: 'tanghua', name: '假人唐化', detail: '假人可无限召唤' });
  if (p.cuidu) out.push({ key: 'cuidu', name: '淬毒', detail: '攻击附带1毒伤' });
  if (p.dummy.alive) out.push({ key: 'dummy', name: '假人', detail: `${p.dummy.hp}血` });
  if (p.inDummyCombat) out.push({ key: 'dummyC', name: '假人作战', detail: '灵魂在假人中' });
  if (p.qibu.stage === 1) out.push({ key: 'qibu', name: '七步', detail: '每回合结束-4' });
  if (p.qibu.stage === 2) out.push({ key: 'qibu', name: '七步', detail: '每回合结束-3' });
  if (p.duming.active) out.push({ key: 'duming', name: '赌命', detail: `剩${p.duming.turnsLeft}回合` });
  if (p.freeze > 0) out.push({ key: 'freeze', name: '冰封', detail: `${p.freeze}回合` });
  if (p.chaofeng.pending) out.push({ key: 'chaofeng', name: '嘲讽', detail: '待触发' });
  if (p.huanwuSkip) out.push({ key: 'huanwu', name: '幻雾', detail: '下回合跳过相加' });
  if (p.delayed.length) out.push({ key: 'delayed', name: '延迟伤害', detail: p.delayed.map((d) => d.desc).join('+') });
  return out;
}

function publicState(g, youIdx) {
  const catalog = {};
  for (const d of Object.keys(SKILLS)) {
    catalog[d] = SKILLS[d].map((s) => ({ id: s.id, name: s.name, desc: s.desc, star: !!s.star, isDigit: !!s.isDigit, isAttack: !!s.isAttack }));
  }
  return {
    you: youIdx,
    phase: g.phase,
    turn: g.turn,
    step: g.step,
    controller: g.controller,
    actionsUsed: g.actionsUsed,
    chainCount: g.chainCount,
    chainDigits: Array.from(g.chainDigits),
    over: g.over,
    result: g.result,
    winner: g.winner,
    players: g.players.map((p) => ({
      name: p.name, hp: p.hp, energy: p.energy, skill: p.skill, shownE: p.energy % 10,
      buffs: buffList(p),
      positiveBuffs: positiveBuffs(p).map((b) => ({ key: b.key, name: b.name })),
    })),
    log: g.log.slice(),
    catalog,
  };
}

// ---------- 序列化（用于把房间状态存入 Redis 等外部存储） ----------
function serializeGame(g) {
  return JSON.stringify({ ...g, chainDigits: Array.from(g.chainDigits || []) });
}
function deserializeGame(json) {
  const g = JSON.parse(json);
  g.chainDigits = new Set(Array.isArray(g.chainDigits) ? g.chainDigits : []);
  return g;
}

module.exports = { createGame, startGame, addHand, actSkill, passTurn, publicState, serializeGame, deserializeGame, SKILLS };
