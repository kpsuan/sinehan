// Tiny relay: everyone in the same room gets everyone else's messages.
const fs = require('fs');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const rooms = new Map(); // room -> Set<ws>
const JOIN_PAGE = fs.readFileSync(path.join(__dirname, 'join.html'));
const LANDING_PAGE = fs.readFileSync(path.join(__dirname, 'landing.html'));
const PARTY_PAGE = fs.readFileSync(path.join(__dirname, 'party.html'));
const GUIDE_PAGE = fs.readFileSync(path.join(__dirname, 'guide.html'));
const PRIVACY_PAGE = fs.readFileSync(path.join(__dirname, 'privacy.html'));
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
  ['bantay.js', 'text/javascript; charset=utf-8'],
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
    // A missing file is a 404 for that request, never a crash of the whole relay.
    const stream = fs.createReadStream(path.join(__dirname, 'public', name));
    stream.on('open', () => {
      res.writeHead(200, { 'content-type': STATIC_FILES.get(name), 'cache-control': 'public, max-age=3600' });
      stream.pipe(res);
    });
    stream.on('error', () => {
      if (!res.headersSent) res.writeHead(404);
      res.end();
    });
    return;
  }
  // The extension itself, for the landing page's Download button.
  if (url.pathname === '/download') {
    res.writeHead(200, {
      'content-type': 'application/zip',
      'content-disposition': 'attachment; filename="sinehan-extension.zip"',
      'cache-control': 'no-cache',
    });
    return fs
      .createReadStream(path.join(__dirname, 'public', 'sinehan-extension.zip'))
      .on('error', () => res.end())
      .pipe(res);
  }
  if (url.pathname === '/health') return res.end('watch-party relay ok');
  // The phone companion: chat, reactions and a remote for the show playing on a laptop.
  if (url.pathname === '/party') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(PARTY_PAGE);
  }
  // A watch guide as a page, for any device. The guide itself is in the link after #, so it never reaches us.
  if (url.pathname === '/privacy') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(PRIVACY_PAGE);
  }
  if (url.pathname === '/guide') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(GUIDE_PAGE);
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
    const r = await fetch(
      `https://api.klipy.com/api/v1/${encodeURIComponent(KLIPY_API_KEY)}/gifs/${endpoint}?${params}`,
    );
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
// Limits that keep one misbehaving client from hurting everyone else.
const MAX_MESSAGE = 64 * 1024; // biggest real message is a call setup (a few KB)
const MAX_PER_ROOM = 10; // two people, their phones, and room to spare
const BURST = 120; // messages a connection may send at once (a call setup sends a few dozen)
const PER_SECOND = 40; // ...refilled at this rate; beyond it, messages are dropped
const wss = new WebSocketServer({ server, maxPayload: MAX_MESSAGE });

// ---- Guide pages ----
// A watch guide opened as a page (any device) syncs its ticks through a "guide channel": a code made
// from the party's room and the guide, which can't be turned back into the room. The page joins only
// that channel and can only send ticks for that guide; it never sees the party's chat.
const guideChannel = (room, id) => crypto.createHash('sha256').update(`${room}|${id}`).digest('hex').slice(0, 24);
const channelSockets = new Map(); // channel -> Set<ws> (guide pages)
const channelRoom = new Map(); // channel -> room (learned when the party's sidebars mention the guide)
function learnChannel(room, id) {
  if (!id) return null;
  const ch = guideChannel(room, String(id).slice(0, 200));
  channelRoom.delete(ch);
  channelRoom.set(ch, room);
  if (channelRoom.size > 5000) channelRoom.delete(channelRoom.keys().next().value);
  return ch;
}

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
  // A bad message (too big, malformed frame) errors this connection only; never the whole relay.
  ws.on('error', () => ws.terminate());
  let tokens = BURST;
  let refilled = Date.now();
  let dropped = 0;

  ws.on('message', (raw) => {
    // Flood control: a token per message, refilled over time. Someone who keeps flooding is cut off.
    const now = Date.now();
    tokens = Math.min(BURST, tokens + ((now - refilled) / 1000) * PER_SECOND);
    refilled = now;
    if (tokens < 1) {
      if (++dropped > 1000) ws.close(1008, 'too many messages');
      return;
    }
    tokens -= 1;
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    // The answer lets the extension notice a connection that died without closing (it reconnects).
    if (msg.type === 'ping') return send(ws, { type: 'pong' });

    // Leaving on purpose, so the other side hears "left" rather than "connection dropped".
    if (msg.type === 'leave') {
      ws.leftOnPurpose = true;
      return leave();
    }

    if (msg.type === 'join') {
      ws.leftOnPurpose = true; // switching rooms counts as leaving the old one
      leave();
      ws.leftOnPurpose = false;
      const wanted = String(msg.room).slice(0, 64);
      if ((rooms.get(wanted)?.size || 0) >= MAX_PER_ROOM) {
        send(ws, { type: 'room-full', max: MAX_PER_ROOM });
        return;
      }
      room = wanted;
      // A phone companion (chat + remote) doesn't count as a person watching, and comes and goes quietly.
      ws.companion = msg.companion === true;
      if (!rooms.has(room)) rooms.set(room, new Set());
      rooms.get(room).add(ws);
      const count = watchers(room);
      send(ws, { type: 'joined', count });
      if (!ws.companion) broadcast(room, ws, { type: 'peer', count, joined: true });
      return;
    }

    // A guide page: ticks for its guide only, passed to the party and to other pages of the same guide.
    if (msg.type === 'guide-join') {
      leave();
      leaveChannel();
      ws.channel = /^[0-9a-f]{24}$/.test(msg.channel || '') ? msg.channel : null;
      if (!ws.channel) return;
      if (!channelSockets.has(ws.channel)) channelSockets.set(ws.channel, new Set());
      channelSockets.get(ws.channel).add(ws);
      return;
    }
    if (ws.channel) {
      if (msg.type !== 'guide-tick' && msg.type !== 'guide-add' && msg.type !== 'guide-art') return;
      const art = (x) =>
        typeof x === 'string' && (x === '' || /^(https:\/\/static\.tvmaze\.com\/|data:image\/jpeg;base64,)/.test(x))
          ? x.slice(0, 60000)
          : '';
      const tick =
        msg.type === 'guide-art'
          ? {
              type: 'guide-art',
              id: String(msg.id || '').slice(0, 200),
              poster: art(msg.poster),
              background: art(msg.background),
              at: Number(msg.at) || Date.now(),
            }
          : msg.type === 'guide-add'
            ? {
                type: 'guide-add',
                id: String(msg.id || '').slice(0, 200),
                key: String(msg.key || '').slice(0, 104),
                title: String(msg.title || '').slice(0, 120),
                kind: String(msg.kind || '').slice(0, 20),
              }
            : {
                type: 'guide-tick',
                id: String(msg.id || '').slice(0, 200),
                key: String(msg.key || '').slice(0, 104),
                v: !!msg.v,
                at: Number(msg.at) || Date.now(),
              };
      const partyRoom = channelRoom.get(ws.channel);
      if (partyRoom && guideChannel(partyRoom, tick.id) === ws.channel) broadcast(partyRoom, null, tick);
      for (const page of channelSockets.get(ws.channel) || []) if (page !== ws) send(page, tick);
      return;
    }

    // The party's own guide messages also reach any open pages of that guide.
    if (room && (msg.type === 'guide-tick' || msg.type === 'guide-sync' || msg.type === 'guide-art')) {
      const ch = learnChannel(room, msg.type === 'guide-tick' ? msg.id : msg.guide?.id);
      for (const page of channelSockets.get(ch) || []) send(page, msg);
    }
    if (room && msg.type === 'guide-channels') {
      for (const id of (Array.isArray(msg.ids) ? msg.ids : []).slice(0, 50)) learnChannel(room, id);
      return;
    }

    if (room) broadcast(room, ws, msg);
  });

  ws.on('close', () => {
    leave();
    leaveChannel();
  });
  function leaveChannel() {
    if (!ws.channel) return;
    const pages = channelSockets.get(ws.channel);
    pages?.delete(ws);
    if (pages && !pages.size) channelSockets.delete(ws.channel);
    ws.channel = null;
  }

  function leave() {
    if (!room) return;
    const members = rooms.get(room);
    members.delete(ws);
    if (!members.size) rooms.delete(room);
    else if (!ws.companion)
      broadcast(room, null, { type: 'peer', count: watchers(room), joined: false, dropped: !ws.leftOnPurpose });
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
