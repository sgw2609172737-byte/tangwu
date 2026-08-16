'use strict';
// 服务端 AI 驱动：人机对战中，AI 作为 1 号玩家自动决策（自建 server.js 与 Vercel api/* 共用）
// 语义：AI 房间里 0 号 = 人类，1 号 = AI；连 AI 的回合与"AI 控制人类回合（尤里）"都由 AI 决策。
const { addHand, actSkill, passTurn } = require('../engine');
const AI = require('../ai');

const AI_IDX = 1;

function actor(g) { return g.controller >= 0 ? g.controller : g.turn; }

// 一直走到"轮到人类"或游戏结束（含再次行动、AI 连续回合、AI 控制的回合）
function runAI(room) {
  const g = room.game;
  const timeMs = 800; // 服务端每步预算（Vercel 限时内足够深）
  let guard = 0;
  while (!g.over && actor(g) === AI_IDX && guard++ < 200) {
    const a = AI.chooseAction(g, AI_IDX, room.difficulty || 'normal', timeMs);
    if (!a) break;
    if (a.type === 'add') addHand(g, a.choice);
    else if (a.type === 'act') actSkill(g, a.skillIdx, { buffIdx: a.buffIdx });
    else passTurn(g);
  }
}

module.exports = { runAI, AI_IDX };
