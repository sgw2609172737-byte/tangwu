'use strict';
// Vercel 版的状态存储：Upstash Redis（REST 直连，零依赖）
// 需要两个环境变量（在 Vercel 项目设置里配置）：
//   UPSTASH_REDIS_REST_URL   — 形如 https://xxx.upstash.io
//   UPSTASH_REDIS_REST_TOKEN — 形如 Axxx...（Upstash 控制台提供）
const { serializeGame, deserializeGame } = require('../engine');

const URL = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const TTL = 60 * 60 * 24; // 房间保留 24 小时

if (!URL || !TOKEN) {
  // 允许模块被加载，但首次调用时报错，便于本地诊断
}

async function redisCommand(cmd) {
  if (!URL || !TOKEN) throw new Error('未配置 UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN');
  const res = await fetch(URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const data = await res.json();
  if (data.error) throw new Error(String(data.error));
  return data.result;
}

const roomKey = (code) => `tangwu:room:${code}`;
const lockKey = (code) => `tangwu:lock:${code}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function loadRoom(code) {
  const raw = await redisCommand(['GET', roomKey(code)]);
  if (!raw) return null;
  const room = JSON.parse(raw);
  room.game = deserializeGame(room.game);
  return room;
}

async function saveRoom(room) {
  const payload = {
    code: room.code,
    game: serializeGame(room.game),
    players: room.players,
    rematch: room.rematch,
    ai: !!room.ai,
    difficulty: room.difficulty || 'normal',
  };
  await redisCommand(['SET', roomKey(room.code), JSON.stringify(payload), 'EX', TTL]);
}

async function acquireLock(code) {
  try { return (await redisCommand(['SET', lockKey(code), '1', 'NX', 'EX', '5'])) === 'OK'; }
  catch (e) { return false; }
}
async function releaseLock(code) {
  try { await redisCommand(['DEL', lockKey(code)]); } catch (e) { /* ignore */ }
}

// 带锁的读-改-写（避免两个玩家同时操作产生竞态）
async function withRoomLock(code, fn) {
  for (let i = 0; i < 8; i++) {
    if (await acquireLock(code)) {
      try { return await fn(); }
      finally { await releaseLock(code); }
    }
    await sleep(60);
  }
  throw new Error('服务器忙，请重试');
}

module.exports = { loadRoom, saveRoom, withRoomLock, sleep };
