'use strict';
// 活体验证：连接到正在运行的服务器（默认 http://127.0.0.1:8800），
// 两个机器人随机对战一整局，验证真实 HTTP + SSE 协议下的完整游戏流程。
const http = require('http');

const BASE = process.argv[2] || 'http://127.0.0.1:8800';
const MAX_STEPS = 2000;

const post = async (p, b) => {
  const res = await fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  return res.json();
};

(async () => {
  const a = await post('/api/hello', { name: '机器人A', roomCode: null });
  const b = await post('/api/hello', { name: '机器人B', roomCode: a.roomCode });
  if (!a.ok || !b.ok) { console.error('加入失败', a, b); process.exit(1); }
  console.log(`房间 ${a.roomCode}：A=${a.playerIdx}号位，B=${b.playerIdx}号位`);

  // SSE 状态队列
  let cur = null;
  const waiters = [];
  const pushState = (s) => { if (waiters.length) waiters.shift()(s); else cur = s; };
  const nextState = () => (cur ? Promise.resolve((() => { const s = cur; cur = null; return s; })()) : new Promise((r) => waiters.push(r)));

  http.get(`${BASE}/api/stream?room=${a.roomCode}&token=${a.token}`, (res) => {
    let buf = '';
    res.on('data', (c) => {
      buf += c;
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const m = chunk.match(/^data: (.*)$/m);
        if (m) pushState(JSON.parse(m[1]));
      }
    });
  });

  let steps = 0;
  let s = await nextState();
  console.log(`对局开始：先手 ${s.players[s.turn].name}（${s.players[s.turn].hp}血） vs 后手 ${s.players[1 - s.turn].name}（${s.players[1 - s.turn].hp}血）`);

  while (!s.over && steps < MAX_STEPS) {
    steps++;
    const actor = s.controller >= 0 ? s.controller : s.turn;
    const tok = actor === 0 ? a.token : b.token;
    const p = s.players[actor];
    if (s.step === 'awaitAdd') {
      await post('/api/action', { room: s.roomCode, token: tok, type: 'add', choice: Math.random() < 0.5 ? 0 : 1 });
    } else if (s.step === 'awaitAction') {
      const afford = p.energy >= p.skill;
      if (!afford || Math.random() < 0.3) {
        await post('/api/action', { room: s.roomCode, token: tok, type: 'pass' });
      } else {
        const list = s.catalog[p.skill];
        await post('/api/action', { room: s.roomCode, token: tok, type: 'act', skillIdx: Math.floor(Math.random() * list.length) });
      }
    } else {
      console.error('未知 step:', s.step);
      process.exit(1);
    }
    s = await nextState();
  }

  console.log(`\n结果：${s.result === 'draw' ? '平局' : `${s.players[s.winner].name} 获胜`}（${steps} 步）`);
  console.log(`血量：${s.players[0].name} ${s.players[0].hp} | ${s.players[1].name} ${s.players[1].hp}`);
  console.log('日志摘要：');
  for (const line of s.log.slice(-10)) console.log('  ' + line);
  process.exit(s.over ? 0 : 1);
})().catch((e) => { console.error('异常:', e.message); process.exit(1); });
