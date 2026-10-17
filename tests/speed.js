// How fast is a relay, from where you are? Run: node tests/speed.js [wss://server ...]
// (no addresses: sinehan.live and the Cloudflare test address). For each one it measures:
//   - a page load (/health): connecting + the server answering
//   - a message from one person to the other through the relay (two connections in a test party)
//   - a keep-alive ping and its answer
// and shows which Cloudflare location you enter through. Lower is better; under ~150 ms feels instant.
const WebSocket = require('../server/node_modules/ws');
const https = require('https');

const TARGETS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['wss://sinehan.live', 'wss://sinehan.sinehan-cloudflare.workers.dev'];
const ROUNDS = 15;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return `median ${s[Math.floor(s.length / 2)]} ms, best ${s[0]}, worst ${s[s.length - 1]}`;
};

function get(url) {
  return new Promise((resolve) => {
    const t = Date.now();
    https
      .get(url, (res) => {
        let body = '';
        res.on('data', (d) => (body += d));
        res.on('end', () => resolve({ ms: Date.now() - t, body, ray: res.headers['cf-ray'] || '' }));
      })
      .on('error', () => resolve({ ms: -1, body: '', ray: '' }));
  });
}
function open(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.got = [];
    ws.on('message', (d) => ws.got.push(JSON.parse(d)));
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}
async function waitFor(ws, test) {
  const until = Date.now() + 5000;
  while (!ws.got.some(test)) {
    if (Date.now() > until) throw new Error('no answer');
    await sleep(1);
  }
}

async function measure(target) {
  const http = target.replace(/^ws/, 'http');
  console.log(`\n${target}`);
  const page = [];
  let ray = '';
  for (let i = 0; i < 5; i++) {
    const r = await get(`${http}/health`);
    page.push(r.ms);
    ray = r.ray;
  }
  console.log(`  page load:          ${stats(page)}`);
  if (ray) console.log(`  you enter Cloudflare at: ${ray.split('-')[1]}`);

  const room = `speed-test-${Date.now()}`;
  const a = await open(target);
  const b = await open(target);
  a.send(JSON.stringify({ type: 'join', room }));
  await sleep(300);
  b.send(JSON.stringify({ type: 'join', room }));
  await sleep(500);
  const relay = [];
  const ping = [];
  for (let i = 0; i < ROUNDS; i++) {
    let t = Date.now();
    a.send(JSON.stringify({ type: 'speed', n: i }));
    await waitFor(b, (m) => m.type === 'speed' && m.n === i);
    relay.push(Date.now() - t);
    const pongs = a.got.filter((m) => m.type === 'pong').length;
    t = Date.now();
    a.send(JSON.stringify({ type: 'ping' }));
    await waitFor(a, () => a.got.filter((m) => m.type === 'pong').length > pongs);
    ping.push(Date.now() - t);
    await sleep(80);
  }
  console.log(`  person to person:   ${stats(relay)}`);
  console.log(`  ping round trip:    ${stats(ping)}`);
  a.send(JSON.stringify({ type: 'leave' }));
  b.send(JSON.stringify({ type: 'leave' }));
  a.close();
  b.close();
}

(async () => {
  for (const t of TARGETS) {
    try {
      await measure(t);
    } catch (e) {
      console.log(`  couldn't measure: ${e.message}`);
    }
  }
})();
