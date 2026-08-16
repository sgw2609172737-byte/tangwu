'use strict';
// Vercel 版：拉取当前状态（GET /api/state?room=CODE&token=TOKEN，客户端短轮询）
const { publicState } = require('../engine');
const { loadRoom } = require('../lib/vercel-store');

module.exports = async function handler(req, res) {
  const q = req.query || {};
  const roomCode = String(q.room || '').toUpperCase();
  const token = String(q.token || '');
  const room = await loadRoom(roomCode);
  if (!room) { res.status(404).json({ ok: false, err: '房间不存在' }); return; }
  const idx = room.players.findIndex((p) => p.token === token);
  if (idx === -1) { res.status(403).json({ ok: false, err: '无效令牌' }); return; }
  res.json({
    roomCode: room.code,
    ai: !!room.ai,
    connected: room.players.map((p) => !!p.name),
    rematch: room.rematch.slice(),
    ...publicState(room.game, idx),
  });
};
