'use strict';
// 端到端联机测试：真实 HTTP 服务器 + 两个客户端（fetch + SSE）
const assert = require('assert');
const http = require('http');
const { server } = require('../server');

let passed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; });
}

const jpost = async (base, path, body) => {
  const res = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return res.json();
};

// 读取一次 SSE 状态快照（跳过 ': connected' 心跳，等待第一个 data: 帧）
function snapshot(base, roomCode, token) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${base}/api/stream?room=${roomCode}&token=${token}`, (res) => {
      let buf = '';
      res.on('data', (c) => {
        buf += c;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const m = chunk.match(/^data: (.*)$/m);
          if (m) { req.destroy(); resolve(JSON.parse(m[1])); }
        }
      });
    });
    req.on('error', reject);
    setTimeout(() => reject(new Error('SSE 超时')), 5000);
  });
}

(async () => {
  const port = 8800 + Math.floor(Math.random() * 1000);
  server.listen(port, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${port}`;
  console.log('端到端联机测试（端口 ' + port + '）');

  await test('静态页面可访问', async () => {
    const res = await fetch(base + '/');
    const text = await res.text();
    assert.strictEqual(res.status, 200);
    assert.ok(text.includes('唐五'));
  });

  let a, b, roomCode;
  await test('创建房间并加入', async () => {
    a = await jpost(base, '/api/hello', { name: 'Alice', roomCode: null });
    assert.ok(a.ok);
    assert.strictEqual(a.playerIdx, 0);
    roomCode = a.roomCode;
    b = await jpost(base, '/api/hello', { name: 'Bob', roomCode });
    assert.ok(b.ok);
    assert.strictEqual(b.playerIdx, 1);
  });

  await test('满员房间拒绝第三人', async () => {
    const c = await jpost(base, '/api/hello', { name: 'Eve', roomCode });
    assert.strictEqual(c.ok, false);
  });

  let sa;
  await test('加入后自动开局，状态正确', async () => {
    sa = await snapshot(base, roomCode, a.token);
    assert.strictEqual(sa.phase, 'playing');
    assert.strictEqual(sa.players[sa.turn].hp, 20); // 先手20血
    assert.strictEqual(sa.players[1 - sa.turn].hp, 21); // 后手21血
    assert.strictEqual(sa.step, 'awaitAdd');
    const actor = sa.turn;
    assert.strictEqual(sa.players[actor].energy, 3);
    assert.strictEqual(sa.players[1 - actor].energy, 2);
  });

  await test('非行动者操作被拒绝', async () => {
    const actor = sa.controller >= 0 ? sa.controller : sa.turn;
    const r = await jpost(base, '/api/action', { room: roomCode, token: (actor === 0 ? b : a).token, type: 'pass' });
    assert.strictEqual(r.ok, false);
  });

  await test('无效令牌被拒绝', async () => {
    const r = await jpost(base, '/api/action', { room: roomCode, token: 'bad', type: 'pass' });
    assert.strictEqual(r.ok, false);
  });

  await test('完整回合流转：相加→释放→换边', async () => {
    const actorToken = sa.turn === 0 ? a.token : b.token;
    const oppShownE = sa.players[1 - sa.turn].shownE;
    await jpost(base, '/api/action', { room: roomCode, token: actorToken, type: 'add', choice: 0 });
    const s2 = await snapshot(base, roomCode, actorToken);
    assert.strictEqual(s2.step, 'awaitAction');
    assert.strictEqual(s2.players[s2.turn].skill, (1 + oppShownE) % 10);
    // 释放技能（选当前数字的第一个，若付不起则空过）
    const digit = s2.players[s2.turn].skill;
    const afford = s2.players[s2.turn].energy >= digit;
    if (afford) {
      await jpost(base, '/api/action', { room: roomCode, token: actorToken, type: 'act', skillIdx: 0 });
      const s3 = await snapshot(base, roomCode, actorToken);
      assert.ok(s3.log.length > 0);
    } else {
      await jpost(base, '/api/action', { room: roomCode, token: actorToken, type: 'pass' });
    }
    const s4 = await snapshot(base, roomCode, actorToken);
    assert.strictEqual(s4.turn, 1 - s2.turn);
  });

  await test('断线重连恢复席位', async () => {
    const back = await jpost(base, '/api/hello', { name: 'Alice', roomCode, token: a.token });
    assert.ok(back.ok);
    assert.strictEqual(back.playerIdx, 0);
  });

  await test('再来一局：双方确认后重置', async () => {
    await jpost(base, '/api/action', { room: roomCode, token: a.token, type: 'rematch' });
    let s = await snapshot(base, roomCode, a.token);
    assert.strictEqual(s.rematch[0], true);
    assert.strictEqual(s.over, false);
    await jpost(base, '/api/action', { room: roomCode, token: b.token, type: 'rematch' });
    s = await snapshot(base, roomCode, a.token);
    assert.strictEqual(s.phase, 'playing');
    assert.strictEqual(s.players[s.turn].hp, 20);
    assert.strictEqual(s.players[1 - s.turn].hp, 21);
    assert.strictEqual(s.rematch.every((v) => !v), true);
  });

  server.close();
  console.log(`\n通过 ${passed} 项端到端测试${process.exitCode ? '（有失败）' : ''}`);
})();
