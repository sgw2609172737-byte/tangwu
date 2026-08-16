'use strict';
// 唐五 AI：纯逻辑，三档难度（easy/normal/hard），零外部依赖
// 双环境：Node 里 module.exports（服务端人机对战）；浏览器里 window.__TWAI（本地版）
(function () {
  const ENG = (typeof window !== 'undefined' && window.__TW_engine) ? window.__TW_engine : require('./engine');
  const SK = (typeof window !== 'undefined' && window.__TW_skills) ? window.__TW_skills : require('./skills');

  // 克隆局面（走引擎自带序列化，Set 也能正确还原）
  function cloneGame(g) {
    return ENG.deserializeGame(ENG.serializeGame(g));
  }
  // 当前回合的实际决策者（尤里控制时是控制者）
  function actorOf(g) { return g.controller >= 0 ? g.controller : g.turn; }

  // 枚举当前决策者所有合法动作
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

  // 在给定局面上执行一个动作（直接调用真引擎）
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
    s += (me.hp - op.hp) * 6;                 // 血量差最重要
    s += (me.energy - op.energy) * 2.5;       // 费用差
    if (me.dummy.alive) s += 8;               // 假人 = 第二条命
    if (op.dummy.alive) s -= 8;
    const posOf = (p) => (p.shuangbei || 0) * 4 + (p.huxi || 0) * 5 + (p.qianghua ? 3 : 0)
      + (p.wudi ? 5 : 0) + (p.jingji ? 3 : 0) + (p.yingneng.active ? 2 : 0)
      + (p.bishi ? 3 : 0) + (p.cuidu ? 4 : 0) + (p.tanghua ? 2 : 0);
    s += posOf(me) - posOf(op);               // 正面 buff 差
    if (me.qibu.stage > 0) s -= 10;           // 负面状态
    if (op.qibu.stage > 0) s += 10;
    if (me.duming.active) s -= 6;             // 赌命倒计时压力
    if (op.duming.active) s += 6;
    if (me.freeze > 0) s -= 8;
    if (op.freeze > 0) s += 8;
    s += op.delayed.length * 3 - me.delayed.length * 3; // 延迟伤害
    s += (g.chainCount >= 2 ? 4 : 0);         // 98K 连携威胁
    return s;
  }

  // 极小化极大：maximize 取决于当前决策者是否 AI（支持尤里控制、再次行动）
  function minimax(g, aiIdx, depth) {
    if (g.over) return evalGame(g, aiIdx);
    const actions = legalActions(g);
    if (!actions.length) return evalGame(g, aiIdx);
    const maximize = actorOf(g) === aiIdx;
    let best = maximize ? -Infinity : Infinity;
    for (const a of actions) {
      const c = cloneGame(g);
      apply(c, a);
      const v = depth <= 1 ? evalGame(c, aiIdx) : minimax(c, aiIdx, depth - 1);
      best = maximize ? Math.max(best, v) : Math.min(best, v);
    }
    return best;
  }

  // 从动作列表里挑最佳（depth=0 贪心只看自己；depth=1 再算对手最优反制）
  function bestByEval(g, aiIdx, actions, depth) {
    let best = null, bestScore = -Infinity;
    for (const a of actions) {
      const c = cloneGame(g);
      apply(c, a);
      let score;
      if (depth > 0 && !c.over) score = minimax(c, aiIdx, depth);
      else score = evalGame(c, aiIdx);
      score += Math.random() * 0.001; // 平局时打破死板
      if (score > bestScore) { bestScore = score; best = a; }
    }
    return best;
  }

  // 对外：为决策者挑一个动作
  function chooseAction(g, aiIdx, difficulty) {
    const actions = legalActions(g);
    if (!actions.length) return null;
    if (difficulty === 'easy') {
      if (Math.random() < 0.55) return actions[(Math.random() * actions.length) | 0];
      return bestByEval(g, aiIdx, actions, 0);
    }
    if (difficulty === 'normal') return bestByEval(g, aiIdx, actions, 0);
    return bestByEval(g, aiIdx, actions, 1); // 困难：含对手反制的 1 层搜索
  }

  const __aiExport = { chooseAction, legalActions, evalGame };
  if (typeof module !== 'undefined' && module.exports) module.exports = __aiExport;
  if (typeof window !== 'undefined') window.__TWAI = __aiExport;
})();
