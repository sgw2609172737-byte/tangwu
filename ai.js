'use strict';
// 共享、零依赖 AI：局面评估 + 有预算的迭代加深 alpha-beta 搜索。
(function () {
  const ENG = (typeof window !== 'undefined' && window.__TW_engine) ? window.__TW_engine : require('./engine');
  const SK = (typeof window !== 'undefined' && window.__TW_skills) ? window.__TW_skills : require('./skills');
  const TIMEOUT = {};
  const actorOf = (g) => g.controller >= 0 ? g.controller : g.turn;
  // 搜索不携带历史日志；完整复制可变的嵌套状态，绝不写入真实对局。
  function cloneGame(g) {
    return { ...g, log: [], chainDigits: new Set(g.chainDigits), banned: [...g.banned], banPicks: [...g.banPicks],
      players: g.players.map((p) => ({ ...p, dummy: { ...p.dummy }, yingneng: { ...p.yingneng },
        qibu: { ...p.qibu }, duming: { ...p.duming }, chaofeng: { ...p.chaofeng }, delayed: p.delayed.map((d) => ({ ...d })) })) };
  }
  function legalActions(g) {
    if (g.over || g.phase !== 'playing') return [];
    const p = g.players[g.turn];
    if (g.step === 'awaitAdd') return [{ type: 'add', choice: 0 }, { type: 'add', choice: 1 }];
    if (g.step !== 'awaitAction') return [];
    const out = [];
    if (p.streak < 24 && p.energy >= p.skill) {
      (SK.SKILLS[p.skill] || []).forEach((sk, i) => {
        if (g.banned.includes(sk.id)) return;
        if (sk.id === 'gongping') {
          const buffs = SK.positiveBuffs(g.players[1 - g.turn]);
          if (buffs.length) { buffs.forEach((b, bi) => out.push({ type: 'act', skillIdx: i, buffIdx: bi })); return; }
        }
        out.push({ type: 'act', skillIdx: i });
      });
    }
    out.push({ type: 'pass' });
    return out;
  }
  function apply(g, a) {
    if (a.type === 'add') return ENG.addHand(g, a.choice);
    if (a.type === 'act') return ENG.actSkill(g, a.skillIdx, { buffIdx: a.buffIdx });
    return ENG.passTurn(g);
  }
  function handPower(g, p) {
    if (p.energy < p.skill) return -2;
    let power = 0;
    for (const sk of SK.SKILLS[p.skill] || []) {
      if (g.banned.includes(sk.id)) continue;
      power = Math.max(power, sk.isAttack ? 7 : sk.grantsAgain ? 5 : sk.id === 'qibu' ? 6 : 1);
    }
    return power;
  }
  function playerValue(g, p) {
    const hp = p.hp * 10 - Math.max(0, 11 - p.hp) * 9;
    const delayed = p.delayed.reduce((sum, d) => sum + d.dmg, 0);
    const deathClock = p.duming.active ? 12 + 65 / Math.max(1, p.duming.turnsLeft) : 0;
    return hp + p.energy * 2.4 + handPower(g, p)
      + (p.dummy.alive ? 20 + Math.min(25, p.dummy.hp) * 5 : 0)
      + p.shuangbei * 9 + p.huxi * 13 + (p.qianghua ? 9 : 0)
      + (p.wudi ? 20 : 0) + (p.jingji ? 10 : 0) + (p.cuidu ? 12 : 0)
      + (p.bishi ? 7 : 0) + (p.tanghua ? 3 : 0)
      + (p.yingneng.active ? 4 + p.yingneng.idle * 4 : 0)
      + (p.chaofeng.pending ? 7 : 0)
      - (p.qibu.stage === 1 ? 25 : p.qibu.stage === 2 ? 16 : 0)
      - delayed * 7 - p.freeze * 12 - deathClock;
  }
  function evalGame(g, aiIdx) {
    if (g.over) return g.result === 'draw' ? 0 : g.winner === aiIdx ? 100000 : -100000;
    let score = playerValue(g, g.players[aiIdx]) - playerValue(g, g.players[1 - aiIdx]);
    // 连携属于出招者，不能在两个玩家的视角都加分。
    const chain = Math.min(3, g.chainCount) * 5 + (g.chainCount >= 3 && g.chainDigits.size >= 2 ? 18 : 0);
    score += (g.turn === aiIdx ? 1 : -1) * chain;
    if (g.controller >= 0) score += g.controller === aiIdx ? 12 : -12;
    return score;
  }
  const actionKey = (a) => `${a.type}:${a.choice ?? ''}:${a.skillIdx ?? ''}:${a.buffIdx ?? ''}`;
  function children(g, aiIdx, preferred) {
    const maximize = actorOf(g) === aiIdx;
    const seen = new Set();
    const out = [];
    for (const a of legalActions(g)) {
      const next = cloneGame(g);
      apply(next, a);
      const key = positionKey(next);
      // 两只手相同、重复增益等动作可抵达同一状态，只搜索一次。
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ a, g: next, value: evalGame(next, aiIdx) });
    }
    return out.sort((a, b) => {
      if (preferred) {
        const d = Number(actionKey(b.a) === preferred) - Number(actionKey(a.a) === preferred);
        if (d) return d;
      }
      return maximize ? b.value - a.value : a.value - b.value;
    });
  }
  function positionKey(g) {
    const { log, banPicks, visualEvents, visualSeq, ...position } = g;
    return JSON.stringify({ ...position, chainDigits: [...g.chainDigits].sort() });
  }
  function checkBudget(ctx) {
    if (++ctx.nodes > ctx.maxNodes || Date.now() >= ctx.deadline) throw TIMEOUT;
  }
  function search(g, aiIdx, depth, alpha, beta, ctx) {
    checkBudget(ctx);
    if (g.over) return evalGame(g, aiIdx);
    // 在相加节点多看一步，把费用不足导致的自动空过纳入叶子评估。
    if (depth <= 0 && g.step !== 'awaitAdd') return evalGame(g, aiIdx);
    if (depth < -1) return evalGame(g, aiIdx);
    const key = positionKey(g);
    const cached = ctx.table.get(key);
    const oldAlpha = alpha, oldBeta = beta;
    if (cached && cached.depth >= depth) {
      if (cached.flag === 'exact') return cached.value;
      if (cached.flag === 'lower') alpha = Math.max(alpha, cached.value);
      else beta = Math.min(beta, cached.value);
      if (alpha >= beta) return cached.value;
    }
    const list = children(g, aiIdx, cached && cached.action);
    if (!list.length) return evalGame(g, aiIdx);
    const maximize = actorOf(g) === aiIdx;
    let best = maximize ? -Infinity : Infinity, bestAction;
    for (const child of list) {
      const value = search(child.g, aiIdx, depth - 1, alpha, beta, ctx);
      if (maximize ? value > best : value < best) { best = value; bestAction = actionKey(child.a); }
      if (maximize) alpha = Math.max(alpha, best); else beta = Math.min(beta, best);
      if (alpha >= beta) break;
    }
    if (ctx.table.size < 30000) ctx.table.set(key, { depth, value: best, action: bestAction,
      flag: best <= oldAlpha ? 'upper' : best >= oldBeta ? 'lower' : 'exact' });
    return best;
  }
  function chooseAction(g, aiIdx, difficulty = 'normal', timeMs) {
    if (actorOf(g) !== aiIdx) return null;
    const list = children(g, aiIdx);
    if (!list.length) return null;
    // 包括持续伤害/反弹等非攻击胜法；只接受真正决策者的胜利。
    const kill = list.find((c) => c.g.over && c.g.winner === aiIdx);
    if (kill) return kill.a;
    if (list.length === 1) return list[0].a;
    if (difficulty === 'easy') {
      return Math.random() < 0.45 ? list[Math.floor(Math.random() * list.length)].a : list[0].a;
    }
    const hard = difficulty === 'hard';
    const budget = Number.isFinite(timeMs) ? Math.max(0, timeMs) : hard ? 700 : 100;
    const ctx = { deadline: Date.now() + budget, nodes: 0, maxNodes: hard ? 40000 : 2500, table: new Map() };
    let best = list[0].a;
    // 只提交完整搜索完的一层；超时直接采用上一层，不额外启动无预算搜索。
    for (let depth = 1; depth <= (hard ? 16 : 4); depth++) {
      let candidate = best, bestScore = -Infinity, alpha = -Infinity;
      list.sort((a, b) => Number(actionKey(b.a) === actionKey(best)) - Number(actionKey(a.a) === actionKey(best)));
      try {
        for (const child of list) {
          const score = search(child.g, aiIdx, depth, alpha, Infinity, ctx);
          if (score > bestScore) { bestScore = score; candidate = child.a; }
          alpha = Math.max(alpha, score);
        }
      } catch (e) { if (e === TIMEOUT) break; throw e; }
      best = candidate;
      if (bestScore >= 100000) break;
    }
    return best;
  }
  const BAN_POOL = ['jiubaK', 'yuandu', 'duming', 'youli', 'jijiu', 'shipo', 'cuidu', 'bing'];
  function chooseBan(g, aiIdx, difficulty) {
    const pool = difficulty === 'easy' ? Object.values(SK.SKILLS).flat().map((s) => s.id) : BAN_POOL;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  const api = { chooseAction, chooseBan, legalActions, evalGame };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.__TWAI = api;
})();
