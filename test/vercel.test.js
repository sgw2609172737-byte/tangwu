'use strict';
// Vercel 版逻辑的离线测试：用内存 Map 模拟 Upstash Redis，直接调用 api/* 处理器
const assert = require('assert');

// 1. 先设环境变量并覆盖全局 fetch，再 require 各模块
const memStore = new Map();
process.env.UPSTASH_REDIS_REST_URL = 'https://fake.upstash.io';
process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';
global.fetch = async (url, opts) => {
  const cmd = JSON.parse(opts.body);
  const [op, ...args] = cmd;
  let result = null;
  if (op === 'SET') {
    const [key, value, ...flags] = args;
    const nx = flags.includes('NX');
    const ei = flags.indexOf('EX');
    const ex = ei >= 0 ? Number(flags[ei + 1]) : 0;
    if (nx && memStore.has(key)) result = null;
    else { memStore.set(key, value); result = 'OK'; }
  } else if (op === 'GET') {
    result = memStore.has(args[0]) ? memStore.get(args[0]) : null;
  } else if (op === 'DEL') {
    result = memStore.delete(args[0]) ? 1 : 0;
  }
  return { json: async () => ({ result }) };
};

const hello = require('../api/hello');
const action = require('../api/action');
const state = require('../api/state');

function fakeRes() {
  const r = { code: 200, body: null };
  return { status(c) { r.code = c; return this; }, json(o) { r.body = o; return this; }, get result() { return r; } };
}
const call = async (fn, method, body, query) => {
  const res = fakeRes();
  await fn({ method, body: body || {}, query: query || {} }, res);
  return res.result;
};

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

(async () => {
  console.log('Vercel 版逻辑离线测试');
  let a, b, roomCode;

  await test('创建房间', async () => {
    a = (await call(hello, 'POST', { name: 'Alice', roomCode: null })).body;
    assert.strictEqual(a.ok, true);
    assert.strictEqual(a.playerIdx, 0);
    roomCode = a.roomCode;
  });

  await test('加入房间并自动开局', async () => {
    b = (await call(hello, 'POST', { name: 'Bob', roomCode })).body;
    assert.strictEqual(b.ok, true);
    assert.strictEqual(b.playerIdx, 1);
  });

  await test('满员拒绝第三人', async () => {
    const r = await call(hello, 'POST', { name: 'Eve', roomCode });
    assert.strictEqual(r.code, 400);
    assert.strictEqual(r.body.ok, false);
  });

  let sa;
  await test('状态正确（先手20/后手21，先手能量3）', async () => {
    sa = (await call(state, 'GET', null, { room: roomCode, token: a.token })).body;
    assert.strictEqual(sa.phase, 'playing');
    assert.strictEqual(sa.players[sa.turn].hp, 20);
    assert.strictEqual(sa.players[1 - sa.turn].hp, 21);
    assert.strictEqual(sa.players[sa.turn].energy, 3);
    assert.strictEqual(sa.step, 'awaitAdd');
  });

  await test('断线重连恢复席位', async () => {
    const r = await call(hello, 'POST', { name: 'Alice', roomCode, token: a.token });
    assert.strictEqual(r.body.ok, true);
    assert.strictEqual(r.body.playerIdx, 0);
  });

  await test('非行动者操作被拒绝', async () => {
    const actor = sa.turn;
    const r = await call(action, 'POST', { room: roomCode, token: actor === 0 ? b.token : a.token, type: 'pass' });
    assert.strictEqual(r.code, 403);
  });

  await test('无效令牌被拒绝', async () => {
    const r = await call(action, 'POST', { room: roomCode, token: 'bad', type: 'pass' });
    assert.strictEqual(r.code, 403);
  });

  await test('完整回合：相加→释放→换边（跨 Redis 读存）', async () => {
    const actor = sa.turn;
    const actorToken = actor === 0 ? a.token : b.token;
    await call(action, 'POST', { room: roomCode, token: actorToken, type: 'add', choice: 0 });
    let s = (await call(state, 'GET', null, { room: roomCode, token: actorToken })).body;
    assert.strictEqual(s.step, 'awaitAction');
    const digit = s.players[s.turn].skill;
    if (s.players[s.turn].energy >= digit) {
      await call(action, 'POST', { room: roomCode, token: actorToken, type: 'act', skillIdx: 0 });
    } else {
      await call(action, 'POST', { room: roomCode, token: actorToken, type: 'pass' });
    }
    s = (await call(state, 'GET', null, { room: roomCode, token: actorToken })).body;
    assert.strictEqual(s.turn, 1 - actor); // 行动后回合换边
  });

  await test('再来一局：双方确认后重置', async () => {
    await call(action, 'POST', { room: roomCode, token: a.token, type: 'rematch' });
    await call(action, 'POST', { room: roomCode, token: b.token, type: 'rematch' });
    const s = (await call(state, 'GET', null, { room: roomCode, token: a.token })).body;
    assert.strictEqual(s.phase, 'playing');
    assert.strictEqual(s.players[s.turn].hp, 20);
    assert.strictEqual(s.players[1 - s.turn].hp, 21);
  });

  await test('引擎序列化往返（链数字 Set 恢复）', async () => {
    const { createGame, serializeGame, deserializeGame } = require('../engine');
    const g = createGame(['A', 'B']);
    g.chainCount = 3;
    g.chainDigits = new Set(['san', 'ba']);
    const g2 = deserializeGame(serializeGame(g));
    assert.strictEqual(g2.chainCount, 3);
    assert.ok(g2.chainDigits instanceof Set);
    assert.strictEqual(g2.chainDigits.size, 2);
    assert.strictEqual(g2.chainDigits.has('san'), true);
  });

  console.log(`\n通过 ${passed} 项 Vercel 逻辑测试${process.exitCode ? '（有失败）' : ''}`);
})();
