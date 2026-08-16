'use strict';
// 唐五 AI：纯逻辑，三档难度（easy/normal/hard），零外部依赖
// 双环境：Node 里 module.exports（服务端人机对战）；浏览器里 window.__TWAI（本地版）
// hard = 2 层 α-β 搜索（算到"我→对手→我"），normal = 1 层（我→对手），easy = 随机为主
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
    const hpD = me.hp - op.hp;
    s += hpD * 7;                                // 血量差
    // 斩杀逼近（非线性）：对方快死时抢伤害，自己快死时保命
    if (op.hp <= 8) s += (8 - op.hp) * 6;
    if (me.hp <= 8) s -= (8 - me.hp) * 6;
    s += (me.energy - op.energy) * 3;            // 费用差
    if (me.dummy.alive) s += 9;                  // 假人 = 第二条命
    if (op.dummy.alive) s -= 9;
    const posOf = (p) => (p.shuangbei || 0) * 4 + (p.huxi || 0) * 6 + (p.qianghua ? 4 : 0)
      + (p.wudi ? 6 : 0) + (p.jingji ? 3 : 0) + (p.yingneng.active ? 3 : 0)
      + (p.bishi ? 3 : 0) + (p.cuidu ? 5 : 0) + (p.tanghua ? 2 : 0);
    s += posOf(me) - posOf(op);                  // 正面 buff 差（含层数）
    if (me.qibu.stage > 0) s -= 12;              // 负面状态
    if (op.qibu.stage > 0) s += 12;
    if (me.duming.active) s -= 7;                // 赌命倒计时压力
    if (op.duming.active) s += 7;
    if (me.freeze > 0) s -= 10;
    if (op.freeze > 0) s += 10;
    s += op.delayed.length * 4 - me.delayed.length * 4; // 延迟伤害
    s += (g.chainCount >= 2 ? 5 : 0) + (g.chainCount >= 3 ? 10 : 0); // 98K 连携威胁
    return s;
  }

  // α-β 极小化极大：maximize 取决于当前决策者是否 AI（支持尤里控制、再次行动）
  function minimax(g, aiIdx, depth, alpha, beta) {
    if (g.over || depth <= 0) return evalGame(g, aiIdx);
    const actions = legalActions(g);
    if (!actions.length) return evalGame(g, aiIdx);
    const maximize = actorOf(g) === aiIdx;
    let best = maximize ? -Infinity : Infinity;
    for (const a of actions) {
      const c = cloneGame(g);
      apply(c, a);
      const v = minimax(c, aiIdx, depth - 1, alpha, beta);
      if (maximize) {
        best = Math.max(best, v);
        alpha = Math.max(alpha, v);
      } else {
        best = Math.min(best, v);
        beta = Math.min(beta, v);
      }
      if (beta <= alpha) break; // 剪枝
    }
    return best;
  }

  // 从动作列表里挑最佳（depth=0 只看自己；depth≥1 继续往下搜索）
  function bestByEval(g, aiIdx, actions, depth) {
    // 根节点按"立即结果"排序，让 α-β 剪枝更有效
    const scored = actions.map((a) => {
      const c = cloneGame(g);
      apply(c, a);
      return { a, v: evalGame(c, aiIdx) };
    });
    scored.sort((x, y) => y.v - x.v);
    let best = null, bestScore = -Infinity;
    for (const { a, v: v0 } of scored) {
      let score = v0;
      if (depth > 0) {
        const c = cloneGame(g);
        apply(c, a);
        score = c.over ? evalGame(c, aiIdx) : minimax(c, aiIdx, depth, -Infinity, Infinity);
      }
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
    if (difficulty === 'normal') return bestByEval(g, aiIdx, actions, 1); // 我→对手
    return bestByEval(g, aiIdx, actions, 2); // 困难：我→对手→我（α-β）
  }

  const __aiExport = { chooseAction, legalActions, evalGame };
  if (typeof module !== 'undefined' && module.exports) module.exports = __aiExport;
  if (typeof window !== 'undefined') window.__TWAI = __aiExport;
})();
