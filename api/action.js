'use strict';
// Vercel 版：执行操作（POST /api/action）
// type: add(choice) | act(skillIdx, buffIdx) | pass | rematch
const { createGame, startGame, addHand, actSkill, passTurn } = require('../engine');
const { loadRoom, saveRoom, withRoomLock } = require('../lib/vercel-store');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ ok: false, err: '方法不允许' }); return; }
  const body = req.body || {};
  const token = String(body.token || '');
  const roomCode = String(body.room || '').toUpperCase();

  try {
    const r = await withRoomLock(roomCode, async () => {
      const room = await loadRoom(roomCode);
      if (!room) throw Object.assign(new Error('房间不存在'), { code: 404 });
      const g = room.game;
      const idx = room.players.findIndex((p) => p.token === token);
      if (idx === -1) throw Object.assign(new Error('无效令牌'), { code: 403 });

      if (body.type === 'rematch') {
        room.rematch[idx] = true;
        if (room.rematch.every(Boolean)) {
          const names = room.players.map((p) => p.name);
          room.game = createGame(names);
          room.rematch = [false, false];
          startGame(room.game);
        }
        await saveRoom(room);
        return { ok: true };
      }

      const actor = g.controller >= 0 ? g.controller : g.turn;
      if (idx !== actor) throw Object.assign(new Error('不是你的操作回合'), { code: 403 });

      let r2;
      switch (body.type) {
        case 'add': r2 = addHand(g, Number(body.choice)); break;
        case 'act': r2 = actSkill(g, Number(body.skillIdx), { buffIdx: body.buffIdx != null ? Number(body.buffIdx) : null }); break;
        case 'pass': r2 = passTurn(g); break;
        default: throw Object.assign(new Error('未知操作'), { code: 400 });
      }
      if (r2 && r2.err) throw Object.assign(new Error(r2.err), { code: 400 });
      await saveRoom(room);
      return { ok: true };
    });
    res.json(r);
  } catch (e) {
    res.status(e.code || 500).json({ ok: false, err: e.message });
  }
};
