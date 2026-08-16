'use strict';
// 活体验证（轮询版）：模拟新版浏览器客户端——只用 GET /api/state 轮询 + POST /api/action，
// 在运行中的服务器上随机对战一整局。
const BASE = process.argv[2] || 'http://127.0.0.1:8800';
const MAX_STEPS = 1500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const post = async (p, b) => {
  const res = await fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  return res.json();
};
const getState = async (room, token) => {
  const res = await fetch(`${BASE}/api/state?room=${room}&token=${token}`);
  if (!res.ok) return null;
  return res.json();
};

(async () => {
  const a = await post('/api/hello', { name: '轮询甲', roomCode: null });
  const b = await post('/api/hello', { name: '轮询乙', roomCode: a.roomCode });
  console.log(`房间 ${a.roomCode}（${a.playerIdx}/${b.playerIdx} 号位）`);

  let steps = 0;
  for (;;) {
    await sleep(30);
    const s = await getState(a.roomCode, a.token);
    if (!s) continue;
    if (s.over) {
      console.log(`\n结果：${s.result === 'draw' ? '平局' : s.players[s.winner].name + ' 获胜'}（${steps} 步）`);
      console.log(`血量：${s.players[0].name} ${s.players[0].hp} | ${s.players[1].name} ${s.players[1].hp}`);
      console.log('日志摘要：');
      for (const line of s.log.slice(-8)) console.log('  ' + line);
      break;
    }
    if (steps++ > MAX_STEPS) { console.error('超时未结束'); process.exit(1); }
    const actor = s.controller >= 0 ? s.controller : s.turn;
    const tok = actor === 0 ? a.token : b.token;
    const p = s.players[actor];
    if (s.step === 'awaitAdd') {
      await post('/api/action', { room: s.roomCode, token: tok, type: 'add', choice: Math.random() < 0.5 ? 0 : 1 });
    } else if (s.step === 'awaitAction') {
      if (p.energy < p.skill || Math.random() < 0.3) {
        await post('/api/action', { room: s.roomCode, token: tok, type: 'pass' });
      } else {
        const list = s.catalog[p.skill];
        await post('/api/action', { room: s.roomCode, token: tok, type: 'act', skillIdx: Math.floor(Math.random() * list.length) });
      }
    }
  }
})().catch((e) => { console.error('异常:', e.message); process.exit(1); });
