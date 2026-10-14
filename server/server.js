// Tiny relay: everyone in the same room gets everyone else's messages.
const fs = require('fs');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const rooms = new Map(); // room -> Set<ws>
const JOIN_PAGE = fs.readFileSync(path.join(__dirname, 'join.html'));
const KLIPY_API_KEY = process.env.KLIPY_API_KEY;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  // Invite links land here; the extension takes it from there.
  if (url.pathname === '/join') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(JOIN_PAGE);
  }
  if (url.pathname === '/gifs') return gifs(url, res);
  res.end('watch-party relay ok');
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

wss.on('connection', (ws) => {
  let room = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'ping') return;

    if (msg.type === 'join') {
      leave();
      room = String(msg.room).slice(0, 64);
      if (!rooms.has(room)) rooms.set(room, new Set());
      rooms.get(room).add(ws);
      const count = rooms.get(room).size;
      send(ws, { type: 'joined', count });
      broadcast(room, ws, { type: 'peer', count, joined: true });
      return;
    }

    if (room) broadcast(room, ws, msg);
  });

  ws.on('close', leave);

  function leave() {
    if (!room) return;
    const members = rooms.get(room);
    members.delete(ws);
    if (members.size) broadcast(room, null, { type: 'peer', count: members.size, joined: false });
    else rooms.delete(room);
    room = null;
  }
});

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function broadcast(room, from, msg) {
  for (const client of rooms.get(room) || []) if (client !== from) send(client, msg);
}

server.listen(PORT, () => console.log(`relay listening on :${PORT}`));
