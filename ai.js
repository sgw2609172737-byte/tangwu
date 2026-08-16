'use strict';
// 唐五 AI：纯逻辑，三档难度（easy/normal/hard），零外部依赖
// 双环境：Node 里 module.exports（服务端人机对战）；浏览器里 window.__TWAI（本地版）
// hard = 迭代加深 α-β 搜索（时间预算内尽量加深），normal = 我→对手→我，easy = 随机为主
(function () {
  const ENG = (typeof window !== 'undefined' && window.__TW_engine) ? window.__TW_engine : require('./engine');
  const SK = (typeof window !== 'undefined' && window.__TW_skills) ? window.__TW_skills : require('./skills');

  const TIMEOUT = { timeout: true };

  function cloneGame(g) {
    return ENG.deserializeGame(ENG.serializeGame(g));
  }
  function actorOf(g) { return g.controller >= 0 ? g.controller : g.turn; }

  function legalActions(g) {
    if (g.over) return [];
    const p = g.players[g.turn];
    const out = [];
    if (g.step === 'awaitAdd') {
      out.push({ type: 'add', choice: 0 });
      out.push({ type: 'add', choice: 1 });
    } else if (g.step === 'awaitAction') {
      const digit = p.skill;
      const list = SK.SKILLS[digit] || [];
      if (p.energy >= digit) {
        list.forEach((sk, i) => {
          if (sk.id === 'gongping') {
            const buffs = SK.positiveBuffs(g.players[1 - g.turn]);
            if (buffs.length) buffs.forEach((b, bi) => out.push({ type: 'act', skillIdx: i, buffIdx: bi }));
            else out.push({ type: 'act', skillIdx: i });
          } else {
            out.push({ type: 'act', skillIdx: i });
          }
        });
      }
      out.push({ type: 'pass' });
    }
    return out;
  }

  function apply(g, a) {
    if (a.type === 'add') ENG.addHand(g, a.choice);
    else if (a.type === 'act') ENG.actSkill(g, a.skillIdx, { buffIdx: a.buffIdx });
    else if (a.type === 'pass') ENG.passTurn(g);
  }

  // 评估函数：从 aiIdx 视角给局面打分（越高越好）
  function evalGame(g, aiIdx) {
    if (g.over) {
      if (g.result === 'draw') return 0;
      return g.winner === aiIdx ? 100000 : -100000;
    }
    const me = g.players[aiIdx], op = g.players[1 - aiIdx];
    let s = 0;
    const hpD = me.hp - op.hp;
    s += hpD * 8;                                   // 血量差
    if (op.hp <= 8) s += (8 - op.hp) * 8;           // 斩杀逼近：对方快死时抢伤害
    if (me.hp <= 8) s -= (8 - me.hp) * 8;           // 自己危险
    s += (me.energy - op.energy) * 2.5;             // 费用差
    if (me.dummy.alive) s += 10;                    // 假人 = 第二条命
    if (op.dummy.alive) s -= 10;
    const posOf = (p) => (p.shuangbei || 0) * 5 + (p.huxi || 0) * 6 + (p.qianghua ? 4 : 0)
      + (p.wudi ? 7 : 0) + (p.jingji ? 3 : 0) + (p.yingneng.active ? 3 : 0)
      + (p.bishi ? 3 : 0) + (p.cuidu ? 6 : 0) + (p.tanghua ? 2 : 0);
    s += posOf(me) - posOf(op);                     // 正面 buff 差（含层数）
    if (me.qibu.stage > 0) s -= 12;                 // 负面状态
    if (op.qibu.stage > 0) s += 12;
    if (me.duming.active) s -= 8;                   // 赌命倒计时压力
    if (op.duming.active) s += 8;
    if (me.freeze > 0) s -= 10;
    if (op.freeze > 0) s += 10;
    s += op.delayed.length * 5 - me.delayed.length * 5; // 延迟伤害
    if (g.chainCount >= 2) s += 12;                 // 98K 连携威胁（鼓励攒连携）
    if (g.chainCount >= 3) s += 20;
    return s;
  }

  // 动作排序：对 maximize 节点先试"立即评估最好"的动作（利于 α-β 剪枝）
  function ordered(g, aiIdx, actions, maximize) {
    const scored = actions.map((a) => {
      const c = cloneGame(g);
      apply(c, a);
      return { a, v: evalGame(c, aiIdx) };
    });
    scored.sort((x, y) => (maximize ? y.v - x.v : x.v - y.v));
    return scored.map((s) => s.a);
  }

  function minimax(g, aiIdx, depth, alpha, beta, deadline) {
    if (Date.now() > deadline) throw TIMEOUT;
    if (g.over || depth <= 0) return evalGame(g, aiIdx);
    const actions = legalActions(g);
    if (!actions.length) return evalGame(g, aiIdx);
    const maximize = actorOf(g) === aiIdx;
    // 排序只在浅层做（省算力、让深度更深）；深层直接用原序
    const list = depth >= 2 ? ordered(g, aiIdx, actions, maximize) : actions;
    let best = maximize ? -Infinity : Infinity;
    for (const a of list) {
      const c = cloneGame(g);
      apply(c, a);
      const v = minimax(c, aiIdx, depth - 1, alpha, beta, deadline);
      if (maximize) {
        best = Math.max(best, v);
        alpha = Math.max(alpha, v);
      } else {
        best = Math.min(best, v);
        beta = Math.min(beta, v);
      }
      if (beta <= alpha) break;
    }
    return best;
  }

  // 固定深度（normal 用）：我→对手→我
  function bestByEval(g, aiIdx, actions, depth) {
    let best = null, bestScore = -Infinity;
    for (const a of ordered(g, aiIdx, actions, true)) {
      const c = cloneGame(g);
      apply(c, a);
      const score = (c.over ? evalGame(c, aiIdx) : minimax(c, aiIdx, depth, -Infinity, Infinity, Infinity)) + Math.random() * 0.001;
      if (score > bestScore) { bestScore = score; best = a; }
    }
    return best;
  }

  // 迭代加深（hard 用）：时间预算内逐层加深，用"完整算完的最深层"结果
  function hardSearch(g, aiIdx, actions, timeMs) {
    const deadline = Date.now() + timeMs;
    let best = null;
    for (let depth = 2; depth <= 12; depth++) {
      let dBest = null, dBScore = -Infinity, ok = true;
      try {
        for (const a of ordered(g, aiIdx, actions, true)) {
          const c = cloneGame(g);
          apply(c, a);
          const score = (c.over ? evalGame(c, aiIdx) : minimax(c, aiIdx, depth, -Infinity, Infinity, deadline)) + Math.random() * 0.001;
          if (score > dBScore) { dBScore = score; dBest = a; }
        }
      } catch (e) {
        if (e === TIMEOUT) ok = false; else throw e;
      }
      if (!ok || Date.now() > deadline) break;
      best = dBest;
    }
    return best || bestByEval(g, aiIdx, actions, 1);
  }

  // 对外：为决策者挑一个动作。timeMs 仅对 hard 生效（服务端可传小预算）
  function chooseAction(g, aiIdx, difficulty, timeMs) {
    const actions = legalActions(g);
    if (!actions.length) return null;
    if (difficulty === 'easy') {
      if (Math.random() < 0.5) return actions[(Math.random() * actions.length) | 0];
      return bestByEval(g, aiIdx, actions, 1);
    }
    if (difficulty === 'normal') return bestByEval(g, aiIdx, actions, 2);
    return hardSearch(g, aiIdx, actions, timeMs || 3000); // 困难：本地预算 3 秒，尽量加深
  }

  const __aiExport = { chooseAction, legalActions, evalGame };
  if (typeof module !== 'undefined' && module.exports) module.exports = __aiExport;
  if (typeof window !== 'undefined') window.__TWAI = __aiExport;
})();
