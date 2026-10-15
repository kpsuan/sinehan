// Tiny relay: everyone in the same room gets everyone else's messages.
const fs = require('fs');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const rooms = new Map(); // room -> Set<ws>
const JOIN_PAGE = fs.readFileSync(path.join(__dirname, 'join.html'));
const LANDING_PAGE = fs.readFileSync(path.join(__dirname, 'landing.html'));
const PARTY_PAGE = fs.readFileSync(path.join(__dirname, 'party.html'));
// Only these exact files are served from public/.
const STATIC_FILES = new Map([
  ['logo.png', 'image/png'],
  ['avatar1.png', 'image/png'],
  ['avatar2.png', 'image/png'],
  ['avatar3.png', 'image/png'],
  ['avatar4.png', 'image/png'],
  ['film-bridge.webp', 'image/webp'],
  ['film-sintel.webp', 'image/webp'],
  ['film-action.webp', 'image/webp'],
  ['film-canal.webp', 'image/webp'],
  ['film-laundromat.webp', 'image/webp'],
  ['sidebar-dark.webp', 'image/webp'],
]);
const KLIPY_API_KEY = process.env.KLIPY_API_KEY;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  // Invite links land here; the extension takes it from there.
  if (url.pathname === '/join') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(JOIN_PAGE);
  }
  if (url.pathname === '/gifs') return gifs(url, res);
  // Images for the landing and invite pages.
  if (url.pathname.startsWith('/static/')) {
    const name = url.pathname.slice('/static/'.length);
    if (!STATIC_FILES.has(name)) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { 'content-type': STATIC_FILES.get(name), 'cache-control': 'public, max-age=86400' });
    return fs.createReadStream(path.join(__dirname, 'public', name)).pipe(res);
  }
  // The extension itself, for the landing page's Download button.
  if (url.pathname === '/download') {
    res.writeHead(200, {
      'content-type': 'application/zip',
      'content-disposition': 'attachment; filename="sinehan-extension.zip"',
      'cache-control': 'no-cache',
    });
    return fs.createReadStream(path.join(__dirname, 'public', 'sinehan-extension.zip')).pipe(res);
  }
  if (url.pathname === '/health') return res.end('watch-party relay ok');
  // The phone companion: chat, reactions and a remote for the show playing on a laptop.
  if (url.pathname === '/party') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(PARTY_PAGE);
  }
  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(LANDING_PAGE);
  }
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('Not found');
});

// GIF search via KLIPY. Proxied so the API key stays on the server, not in the extension.
async function gifs(url, res) {
  if (!KLIPY_API_KEY) return json(res, 503, { error: 'no-key' });
  const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
  const params = new URLSearchParams({
    page: String(Math.max(1, parseInt(url.searchParams.get('page'), 10) || 1)),
    per_page: '24',
    customer_id: (url.searchParams.get('cid') || 'anonymous').slice(0, 64),
    content_filter: 'medium',
  });
  if (q) params.set('q', q);
  const endpoint = q ? 'search' : 'trending';

  try {
    const r = await fetch(`https://api.klipy.com/api/v1/${encodeURIComponent(KLIPY_API_KEY)}/gifs/${endpoint}?${params}`);
    const body = await r.json();
    if (!r.ok || !body.result) return json(res, 502, { error: 'klipy' });
    const pick = (file, size) => {
      const f = file?.[size]?.webp || file?.[size]?.gif;
      return f && { url: f.url, width: f.width, height: f.height };
    };
    const items = (body.data?.data || [])
      .filter((g) => g.type !== 'ad' && g.file)
      .map((g) => ({
        id: g.id,
        title: g.title || '',
        preview: pick(g.file, 'sm') || pick(g.file, 'xs'),
        full: pick(g.file, 'md') || pick(g.file, 'sm'),
      }))
      .filter((g) => g.preview && g.full);
    json(res, 200, { gifs: items, hasNext: Boolean(body.data?.has_next) });
  } catch (e) {
    console.error('klipy request failed', e);
    json(res, 502, { error: 'klipy' });
  }
}

function json(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(data));
}
const wss = new WebSocketServer({ server });

// Notice dropped connections quickly (closed laptop, lost Wi-Fi) so the other side can pause:
// every 10s we ping; anyone who didn't answer the previous ping is dropped.
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 10000);

wss.on('connection', (ws) => {
  let room = null;
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'ping') return;

    if (msg.type === 'join') {
      leave();
      room = String(msg.room).slice(0, 64);
      // A phone companion (chat + remote) doesn't count as a person watching, and comes and goes quietly.
      ws.companion = msg.companion === true;
      if (!rooms.has(room)) rooms.set(room, new Set());
      rooms.get(room).add(ws);
      const count = watchers(room);
      send(ws, { type: 'joined', count });
      if (!ws.companion) broadcast(room, ws, { type: 'peer', count, joined: true });
      return;
    }

    if (room) broadcast(room, ws, msg);
  });

  ws.on('close', leave);

  function leave() {
    if (!room) return;
    const members = rooms.get(room);
    members.delete(ws);
    if (!members.size) rooms.delete(room);
    else if (!ws.companion) broadcast(room, null, { type: 'peer', count: watchers(room), joined: false });
    room = null;
  }
});

// People watching = everyone in the room except phone companions.
function watchers(room) {
  let n = 0;
  for (const c of rooms.get(room) || []) if (!c.companion) n++;
  return n;
}

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function broadcast(room, from, msg) {
  for (const client of rooms.get(room) || []) if (client !== from) send(client, msg);
}

server.listen(PORT, () => console.log(`relay listening on :${PORT}`));
