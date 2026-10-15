// Relay limits: oversized messages, flooding, and full rooms.
// Run: node tests/relay.js
const WebSocket = require('../server/node_modules/ws');
const { spawn } = require('child_process');
const path = require('path');

const PORT = 18391;
let passed = 0;
let failed = 0;
function check(name, ok, detail = '') {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `  (${detail})`}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function client(room) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    ws.got = [];
    ws.on('message', (raw) => ws.got.push(JSON.parse(raw)));
    ws.on('open', () => {
      if (room) ws.send(JSON.stringify({ type: 'join', room }));
      resolve(ws);
    });
    ws.on('error', () => resolve(ws));
  });
}
const closed = (ws) =>
  new Promise((r) => (ws.readyState === WebSocket.CLOSED ? r(true) : ws.once('close', () => r(true))));

(async () => {
  const relay = spawn('node', [path.join(__dirname, '../server/server.js')], {
    env: { ...process.env, PORT: String(PORT) },
  });
  await sleep(800);
  try {
    // A normal pair still works.
    const a = await client('limits-1');
    const b = await client('limits-1');
    await sleep(200);
    a.send(JSON.stringify({ type: 'chat', text: 'hi' }));
    await sleep(200);
    check(
      'normal messages get through',
      b.got.some((m) => m.type === 'chat'),
    );

    // A call setup's burst of messages gets through in full.
    const before = b.got.length;
    for (let i = 0; i < 60; i++) a.send(JSON.stringify({ type: 'rtc', candidate: { i } }));
    await sleep(300);
    check(
      'a burst like a call setup (60 at once) all arrives',
      b.got.length - before === 60,
      `${b.got.length - before}`,
    );

    // Flooding is dropped, then cut off.
    const f = await client('limits-2');
    const g = await client('limits-2');
    await sleep(200);
    for (let i = 0; i < 1500; i++) f.send(JSON.stringify({ type: 'typing' }));
    await sleep(500);
    const gotFlood = g.got.filter((m) => m.type === 'typing').length;
    check('a flood is mostly dropped', gotFlood < 200, `${gotFlood} of 1500 delivered`);
    check('…and the flooder is disconnected', await Promise.race([closed(f), sleep(1500).then(() => false)]));

    // Oversized messages close the connection.
    const h = await client('limits-3');
    h.send(JSON.stringify({ type: 'chat', text: 'x'.repeat(100 * 1024) }));
    check('a message over 64 KB closes the connection', await Promise.race([closed(h), sleep(1500).then(() => false)]));

    // An 11th person can't join a room of 10.
    const crowd = [];
    for (let i = 0; i < 10; i++) crowd.push(await client('limits-4'));
    const late = await client('limits-4');
    check('the relay is still up after all that', late.readyState === WebSocket.OPEN);
    await sleep(300);
    check(
      'the 11th person in a room is told it is full',
      late.got.some((m) => m.type === 'room-full'),
    );
    crowd[0].send(JSON.stringify({ type: 'chat', text: 'still here' }));
    await sleep(200);
    check('…and does not receive the room’s messages', !late.got.some((m) => m.type === 'chat'));

    // A guide page joins a guide channel: it gets ticks for that guide, never the party's chat.
    const crypto = require('crypto');
    const p1 = await client('guides-1');
    const p2 = await client('guides-1');
    await sleep(200);
    p1.send(JSON.stringify({ type: 'guide-channels', ids: ['show|arc'] }));
    const page = await client(null);
    page.send(
      JSON.stringify({
        type: 'guide-join',
        channel: crypto.createHash('sha256').update('guides-1|show|arc').digest('hex').slice(0, 24),
      }),
    );
    await sleep(200);
    p1.send(JSON.stringify({ type: 'chat', text: 'private' }));
    p1.send(JSON.stringify({ type: 'guide-tick', id: 'show|arc', key: 'S1E1', v: true, at: 1 }));
    await sleep(300);
    check(
      'a guide page gets ticks for its guide',
      page.got.some((m) => m.type === 'guide-tick' && m.key === 'S1E1'),
    );
    check('…but never the party’s chat', !page.got.some((m) => m.type === 'chat'));
    page.send(JSON.stringify({ type: 'guide-tick', id: 'show|arc', key: 'S1E2', v: true, at: 2 }));
    page.send(JSON.stringify({ type: 'chat', text: 'sneaky' }));
    await sleep(300);
    check(
      'ticks from the page reach the party',
      p2.got.some((m) => m.type === 'guide-tick' && m.key === 'S1E2'),
    );
    check('…and nothing else from it does', !p2.got.some((m) => m.text === 'sneaky'));

    // Pings are answered (the extension uses this to notice dead connections).
    a.send(JSON.stringify({ type: 'ping' }));
    await sleep(200);
    check(
      'pings are answered',
      a.got.some((m) => m.type === 'pong'),
    );
  } finally {
    relay.kill();
  }
  console.log(`\n${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
