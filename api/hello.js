'use strict';
// Vercel 版：创建/加入房间（POST /api/hello）
const crypto = require('crypto');
const { createGame } = require('../engine');
const { loadRoom, saveRoom, withRoomLock } = require('../lib/vercel-store');

const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

async function genRoomCode() {
  for (;;) {
    const c = Array.from({ length: 4 }, () => CHARS[crypto.randomInt(CHARS.length)]).join('');
    if (!(await loadRoom(c))) return c;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ ok: false, err: '方法不允许' }); return; }
  const body = req.body || {};
  const name = String(body.name || '').trim().slice(0, 12) || '玩家';
  const roomCode = String(body.roomCode || '').trim().toUpperCase();
  const token = String(body.token || '');

  // 断线重连：token + 房间码命中则恢复席位
  if (token && roomCode) {
    const existing = await loadRoom(roomCode);
    if (existing) {
      const i = existing.players.findIndex((p) => p.token === token);
      if (i >= 0) return res.json({ ok: true, roomCode, playerIdx: i, token, name: existing.players[i].name });
    }
  }

  try {
    const result = await withRoomLock(roomCode, async () => {
      let room = roomCode ? await loadRoom(roomCode) : null;
      if (!room) {
        const code = await genRoomCode();
        room = {
          code,
          game: createGame(['玩家1', '玩家2']),
          players: [{ name: null, token: null }, { name: null, token: null }],
          rematch: [false, false],
          ai: false,
          difficulty: 'normal',
        };
      }
      // 人机对战：创建进入 ban 阶段（AI 为 1 号，人类先 ban）
      if (body.ai && !roomCode) {
        room.ai = true;
        room.difficulty = ['easy', 'normal', 'hard'].includes(body.difficulty) ? body.difficulty : 'normal';
        room.players[0] = { name, token: crypto.randomBytes(16).toString('hex') };
        room.players[1] = { name: 'AI', token: null };
        room.game.players[0].name = name;
        room.game.players[1].name = 'AI';
        if (room.game.phase === 'waiting') room.game.phase = 'banning';
        await saveRoom(room);
        return { ok: true, roomCode: room.code, playerIdx: 0, token: room.players[0].token, name };
      }
      const idx = room.players.findIndex((p) => !p.name);
      if (idx === -1) throw new Error('房间已满（2人）');
      room.players[idx].name = name;
      room.players[idx].token = crypto.randomBytes(16).toString('hex');
      if (room.players.every((p) => p.name) && room.game.phase === 'waiting') {
        room.game.players.forEach((gp, i) => { gp.name = room.players[i].name; });
        room.game.phase = 'banning'; // 双方就位 → 进入盲ban
      }
      await saveRoom(room);
      return { ok: true, roomCode: room.code, playerIdx: idx, token: room.players[idx].token, name };
    });
    res.json(result);
  } catch (e) {
    res.status(400).json({ ok: false, err: e.message });
  }
};
