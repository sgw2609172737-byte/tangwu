'use strict';
// 《唐五》联机服务器：HTTP + SSE（零依赖，仅用 Node 内置模块）
// 房间码创建/加入、断线重连、再来一局；所有规则在服务器端权威结算
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { createGame, startGame, submitBan, addHand, actSkill, passTurn, publicState } = require('./engine');
const { runAI } = require('./lib/ai-player');
const AI = require('./ai');

const PORT = Number(process.env.PORT || 8800);
const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

const rooms = new Map();    // roomCode -> room
const tokenMap = new Map(); // token -> { room, idx }

function genCode() {
  const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let c;
  do { c = Array.from({ length: 4 }, () => CHARS[crypto.randomInt(CHARS.length)]).join(''); } while (rooms.has(c));
  return c;
}

function newRoom() {
  const code = genCode();
  const game = createGame(['玩家1', '玩家2']);
  const room = {
    code,
    game,
    players: [{ name: null, token: null, sse: null }, { name: null, token: null, sse: null }],
    rematch: [false, false],
  };
  rooms.set(code, room);
  return room;
}

function stateFor(room, youIdx) {
  return {
    roomCode: room.code,
    ai: !!room.ai,
    connected: room.players.map((p) => !!p.sse),
    rematch: room.rematch.slice(),
    ...publicState(room.game, youIdx),
  };
}

function broadcast(room) {
  for (let i = 0; i < 2; i++) {
    const pl = room.players[i];
    if (pl.sse) {
      try { pl.sse.write(`data: ${JSON.stringify(stateFor(room, i))}\n\n`); }
      catch (e) { /* 连接已断，close 事件会清理 */ }
    }
  }
}

function json(res, data, code = 200) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function readBody(req, res, cb) {
  let data = '';
  req.on('data', (c) => { data += c; if (data.length > 1e5) req.destroy(); });
  req.on('end', () => { let body = {}; try { body = JSON.parse(data || '{}'); } catch (e) { /* ignore */ } cb(body); });
}

// ---------- 接口 ----------
function handleHello(req, res, body) {
  const name = String(body.name || '').trim().slice(0, 12) || '玩家';
  const roomCode = String(body.roomCode || '').trim().toUpperCase();
  const token = String(body.token || '');
  // 断线重连：token 仍有效则直接恢复席位
  if (token && tokenMap.has(token)) {
    const t = tokenMap.get(token);
    if (t.room.code === roomCode) {
      return json(res, { ok: true, roomCode: t.room.code, playerIdx: t.idx, token, name: t.room.players[t.idx].name });
    }
  }
  let room = roomCode ? rooms.get(roomCode) : null;
  if (!room) room = newRoom();
  // 人机对战：AI 为 1 号，创建进入 ban 阶段（人类先 ban，AI 随后自动 ban）
  if (body.ai && !roomCode) {
    room.ai = true;
    room.difficulty = ['easy', 'normal', 'hard'].includes(body.difficulty) ? body.difficulty : 'normal';
    room.players[1].name = 'AI';
    room.game.players[0].name = name;
    room.game.players[1].name = 'AI';
    const idx = 0;
    const newToken = crypto.randomBytes(16).toString('hex');
    room.players[0].name = name;
    room.players[0].token = newToken;
    tokenMap.set(newToken, { room, idx });
    if (room.game.phase === 'waiting') room.game.phase = 'banning';
    broadcast(room);
    return json(res, { ok: true, roomCode: room.code, playerIdx: idx, token: newToken, name });
  }
  const idx = room.players.findIndex((p) => !p.name);
  if (idx === -1) return json(res, { ok: false, err: '房间已满（2人）' }, 400);
  room.players[idx].name = name;
  const newToken = crypto.randomBytes(16).toString('hex');
  room.players[idx].token = newToken;
  tokenMap.set(newToken, { room, idx });
  if (room.players.every((p) => p.name) && room.game.phase === 'waiting') {
    room.game.players.forEach((gp, i) => { gp.name = room.players[i].name; });
    room.game.phase = 'banning'; // 双方就位 → 进入盲ban
  }
  broadcast(room);
  json(res, { ok: true, roomCode: room.code, playerIdx: idx, token: newToken, name });
}

function handleAction(req, res, body) {
  const t = body.token && tokenMap.get(String(body.token));
  if (!t) return json(res, { ok: false, err: '无效令牌' }, 403);
  const room = t.room, g = room.game, idx = t.idx;
  // 再来一局：任何时候都可发起（对局结束后）
  if (body.type === 'rematch') {
    if (room.ai) {
      // AI 房：AI 自动同意，立即重开（重新进入 ban 阶段）
      const name = room.players[0].name;
      room.game = createGame([name, 'AI']);
      room.game.phase = 'banning';
      broadcast(room);
      return json(res, { ok: true });
    }
    room.rematch[idx] = true;
    if (room.rematch.every(Boolean)) {
      const names = room.players.map((p) => p.name);
      room.game = createGame(names);
      room.game.phase = 'banning';
      room.rematch = [false, false];
    }
    broadcast(room);
    return json(res, { ok: true });
  }
  // 盲ban：禁用阶段提交
  if (body.type === 'ban') {
    let r = submitBan(g, idx, String(body.skillId || ''));
    if (r && r.err) return json(res, { ok: false, err: r.err }, 400);
    // AI 房：人类 ban 完后 AI 自动 ban
    if (room.ai && g.phase === 'banning' && !g.banPicks[1]) {
      submitBan(g, 1, AI.chooseBan(g, 1, room.difficulty));
    }
    if (g.phase === 'playing' && room.ai) runAI(room); // AI 若先手自动走完
    broadcast(room);
    return json(res, { ok: true });
  }
  const actor = g.controller >= 0 ? g.controller : g.turn;
  if (idx !== actor) return json(res, { ok: false, err: '不是你的操作回合' }, 403);
  let r;
  switch (body.type) {
    case 'add': r = addHand(g, Number(body.choice)); break;
    case 'act': r = actSkill(g, Number(body.skillIdx), { buffIdx: body.buffIdx != null ? Number(body.buffIdx) : null }); break;
    case 'pass': r = passTurn(g); break;
    default: return json(res, { ok: false, err: '未知操作' }, 400);
  }
  if (r && r.err) return json(res, { ok: false, err: r.err }, 400);
  if (room.ai) runAI(room); // 人机对战：人类操作后，AI 自动响应
  broadcast(room);
  json(res, { ok: true });
}

function handleStream(req, res, url) {
  const q = new URLSearchParams(url.split('?')[1] || '');
  const token = q.get('token');
  const t = token && tokenMap.get(token);
  if (!t || t.room.code !== q.get('room')) {
    res.writeHead(403); res.end('forbidden'); return;
  }
  const idx = t.idx;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': connected\n\n');
  res.write(`data: ${JSON.stringify(stateFor(t.room, idx))}\n\n`);
  const prev = t.room.players[idx].sse;
  if (prev && prev !== res) { try { prev.end(); } catch (e) { /* ignore */ } }
  t.room.players[idx].sse = res;
  broadcast(t.room);
  const hb = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) { /* ignore */ } }, 25000);
  res.on('close', () => {
    clearInterval(hb);
    if (t.room.players[idx].sse === res) {
      t.room.players[idx].sse = null;
      broadcast(t.room);
    }
  });
}

function handleState(req, res, u) {
  const token = u.searchParams.get('token');
  const t = token && tokenMap.get(token);
  if (!t || t.room.code !== u.searchParams.get('room')) return json(res, { ok: false, err: '无效令牌' }, 403);
  json(res, stateFor(t.room, t.idx));
}

function serveStatic(req, res, urlPath) {
  let p = urlPath === '/' ? '/index.html' : urlPath;
  const file = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(p)));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('404 Not Found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname === '/api/hello' && req.method === 'POST') return readBody(req, res, (b) => handleHello(req, res, b));
  if (u.pathname === '/api/action' && req.method === 'POST') return readBody(req, res, (b) => handleAction(req, res, b));
  if (u.pathname === '/api/stream' && req.method === 'GET') return handleStream(req, res, u.pathname + u.search);
  if (u.pathname === '/api/state' && req.method === 'GET') return handleState(req, res, u);
  if (req.method === 'GET') return serveStatic(req, res, u.pathname);
  res.writeHead(404); res.end('404');
});

function lanIPs() {
  const out = [];
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) {
    for (const it of ifs[name]) if (it.family === 'IPv4' && !it.internal) out.push(it.address);
  }
  return out;
}

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log('==============================================');
    console.log('  🖐 《唐五》联机服务器已启动');
    console.log(`  本机访问:  http://localhost:${PORT}`);
    for (const ip of lanIPs()) console.log(`  局域网访问: http://${ip}:${PORT}`);
    console.log('  公网联机: 请参考 README.md（内网穿透/端口映射/VPS）');
    console.log('==============================================');
  });
}

module.exports = { server };
