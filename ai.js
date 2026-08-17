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
      if (p.streak >= 24) { out.push({ type: 'pass' }); return out; } // 连出上限：只能空过
      if (p.energy >= digit) {
        list.forEach((sk, i) => {
          if (g.banned && g.banned.indexOf(sk.id) >= 0) return; // 跳过被禁技能
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

  // 评估函数：从 aiIdx 视角给局面打分（越高越好）——激进型（轻量，不含战术检测，保证搜索深度）
  function evalGame(g, aiIdx) {
    if (g.over) {
      if (g.result === 'draw') return 0;
      return g.winner === aiIdx ? 100000 : -100000;
    }
    const me = g.players[aiIdx], o = g.players[1 - aiIdx];
    let s = 0;
    const hpD = me.hp - o.hp;
    s += hpD * 9;                                   // 血量差（最重要）
    if (o.hp <= 10) s += (10 - o.hp) * 10;          // 斩杀逼近：对方进斩杀线就抢
    if (me.hp <= 10) s -= (10 - me.hp) * 10;        // 自己危险时优先保命
    s += (me.energy - o.energy) * 1.2;              // 费用差（权重调低，避免囤积）
    s += (me.cumulativeDmg - o.cumulativeDmg) * 1.5; // 累计伤害差（鼓励持续压制）
    if (me.dummy.alive) s += 10;                    // 假人 = 第二条命
    if (o.dummy.alive) s -= 10;
    const posOf = (pl) => (pl.shuangbei || 0) * 5 + (pl.huxi || 0) * 6 + (pl.qianghua ? 4 : 0)
      + (pl.wudi ? 7 : 0) + (pl.jingji ? 3 : 0) + (pl.yingneng.active ? 3 : 0)
      + (pl.bishi ? 3 : 0) + (pl.cuidu ? 6 : 0) + (pl.tanghua ? 2 : 0);
    s += posOf(me) - posOf(o);                      // 正面 buff 差（含层数）
    if (me.qibu.stage > 0) s -= 12;                 // 负面状态
    if (o.qibu.stage > 0) s += 12;
    if (me.duming.active) s -= 8;                   // 赌命倒计时压力
    if (o.duming.active) s += 8;
    if (me.freeze > 0) s -= 10;
    if (o.freeze > 0) s += 10;
    s += o.delayed.length * 6 - me.delayed.length * 6; // 延迟伤害
    if (g.chainCount >= 2) s += 14;                 // 98K 连携威胁（鼓励攒链）
    if (g.chainCount >= 3) s += 20;
    return s;
  }

  // 战术必杀过滤器：当前玩家一步能直接斩杀 → 立即返回该动作（不进入搜索）
  function findKill(g) {
    if (g.over || g.step !== 'awaitAction') return null;
    const p = g.players[g.turn];
    if (p.energy < p.skill) return null;
    const list = SK.SKILLS[p.skill] || [];
    for (let i = 0; i < list.length; i++) {
      if (!list[i].isAttack) continue;
      if (g.banned && g.banned.indexOf(list[i].id) >= 0) continue; // 被禁技能不可用
      const c = cloneGame(g);
      ENG.actSkill(c, i, {});
      if (c.over && c.winner === g.turn) return { type: 'act', skillIdx: i };
    }
    return null;
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

  // 战术延伸（quiescence）：深度耗尽但局面"热"（有人濒死且能动手）时再往下看 1 层，
  // 避免"该杀不杀、被杀没看见"的水平线短视
  function quiesce(g, aiIdx, deadline) {
    if (g.over) return evalGame(g, aiIdx);
    if (Date.now() > deadline) return evalGame(g, aiIdx);
    const p = g.players[g.turn], o = g.players[1 - g.turn];
    // 热局面判定：本方能放技能且对方血量可能被斩杀，或自己危险
    const hot = (o.hp <= 14 && p.energy >= p.skill) || (p.hp <= 14 && o.energy >= o.skill);
    if (!hot) return evalGame(g, aiIdx);
    const actions = legalActions(g);
    if (!actions.length) return evalGame(g, aiIdx);
    const maximize = actorOf(g) === aiIdx;
    let best = maximize ? -Infinity : Infinity;
    for (const a of actions) {
      const c = cloneGame(g);
      apply(c, a);
      const v = evalGame(c, aiIdx);
      best = maximize ? Math.max(best, v) : Math.min(best, v);
    }
    return best;
  }

  function minimax(g, aiIdx, depth, alpha, beta, deadline) {
    if (Date.now() > deadline) throw TIMEOUT;
    if (g.over) return evalGame(g, aiIdx);
    if (depth <= 0) return quiesce(g, aiIdx, deadline);
    const actions = legalActions(g);
    if (!actions.length) return evalGame(g, aiIdx);
    const maximize = actorOf(g) === aiIdx;
    // 不排序：本游戏分支很小（≤6），排序开销远大于剪枝收益，直接原序可显著加深
    const list = actions;
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
    for (let depth = 2; depth <= 14; depth++) {
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
    // 战术必杀：本回合一步能杀就杀（任何难度都不该放过白捡的斩杀）
    const kill = findKill(g);
    if (kill) return kill;
    if (difficulty === 'easy') {
      if (Math.random() < 0.5) return actions[(Math.random() * actions.length) | 0];
      return bestByEval(g, aiIdx, actions, 1);
    }
    if (difficulty === 'normal') return bestByEval(g, aiIdx, actions, 2);
    return hardSearch(g, aiIdx, actions, timeMs || 5000); // 困难：本地预算 5 秒，尽量加深
  }

  // 盲ban：AI 选一个技能禁用（盲选，无对局信息，仅按"强技能优先"）
  const BAN_POOL = ['jiubaK', 'yuandu', 'duming', 'youli', 'jijiu', 'shipo', 'cuidu', 'bing'];
  function chooseBan(g, aiIdx, difficulty) {
    const all = Object.keys(SK.SKILLS).flatMap((d) => SK.SKILLS[d].map((s) => s.id));
    if (difficulty === 'easy') return all[(Math.random() * all.length) | 0];
    return BAN_POOL[(Math.random() * BAN_POOL.length) | 0];
  }

  const __aiExport = { chooseAction, chooseBan, legalActions, evalGame };
  if (typeof module !== 'undefined' && module.exports) module.exports = __aiExport;
  if (typeof window !== 'undefined') window.__TWAI = __aiExport;
})();
