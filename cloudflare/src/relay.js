// The live relay: everyone in the same party (room) gets everyone else's messages. Same rules as
// server/server.js, as a Durable Object with WebSocket hibernation: between messages it sleeps (and costs
// nothing), and the clients' {"type":"ping"} keep-alives are answered with {"type":"pong"} without waking it.
// What each connection is (its room, phone or not, guide channel) is saved on the connection itself
// (serializeAttachment), so it survives the object sleeping; the indexes below are rebuilt from those.
import { DurableObject } from 'cloudflare:workers';

const MAX_MESSAGE = 64 * 1024; // biggest real message is a call setup (a few KB)
const MAX_PER_ROOM = 10; // two people, their phones, and room to spare
const BURST = 120; // messages a connection may send at once (a call setup sends a few dozen)
const PER_SECOND = 40; // ...refilled at this rate; beyond it, messages are dropped
// A connection that stops pinging is gone (closed laptop, lost Wi-Fi): laptops ping every 5-10s, phones and
// guide pages every 20s. Checked every 15s while anyone is connected.
const SILENT_LAPTOP = 35000;
const SILENT_OTHER = 65000;
const CHECK_EVERY = 15000;

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
// A guide page syncs ticks through a channel hashed from the room and guide, which can't be turned back into
// the room. It can only send ticks for that guide and never sees the party's chat.
async function guideChannel(room, id) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${room}|${id}`))).slice(0, 24);
}

export class Relay extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}'));
    this.rooms = null; // room -> Set<ws>
    this.pages = null; // guide channel -> Set<ws>
    this.channelRoom = new Map(); // guide channel -> room (also kept in storage)
    this.buckets = new WeakMap(); // ws -> { tokens, at, dropped } (flood control; fine to lose when asleep)
    this.heard = new WeakMap(); // ws -> last message time (besides pings)
  }

  // ---- Connections ----
  async fetch(request) {
    if (new URL(request.url).pathname === '/where') {
      // Cloudflare's trace shows which data center this object runs in.
      const trace = await (await fetch('https://www.cloudflare.com/cdn-cgi/trace')).text();
      return new Response(trace.match(/colo=(\w+)/)?.[1] || '?');
    }
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ room: null, companion: false, channel: null, left: false, at: Date.now() });
    this.heard.set(server, Date.now());
    await this.checkLater();
    return new Response(null, { status: 101, webSocket: client });
  }
  info(ws) {
    return ws.deserializeAttachment() || {};
  }
  setInfo(ws, changes) {
    ws.serializeAttachment({ ...this.info(ws), ...changes });
  }
  index() {
    if (this.rooms) return;
    this.rooms = new Map();
    this.pages = new Map();
    for (const ws of this.ctx.getWebSockets()) {
      const a = this.info(ws);
      if (a.room) add(this.rooms, a.room, ws);
      if (a.channel) add(this.pages, a.channel, ws);
    }
  }
  watchers(room) {
    let n = 0;
    for (const ws of this.rooms.get(room) || []) if (!this.info(ws).companion) n++;
    return n;
  }
  broadcast(room, from, msg) {
    for (const ws of this.rooms.get(room) || []) if (ws !== from) send(ws, msg);
  }

  // ---- Messages ----
  async webSocketMessage(ws, raw) {
    this.index();
    this.heard.set(ws, Date.now());
    if (typeof raw !== 'string') return;
    if (raw.length > MAX_MESSAGE) {
      // Too big to be real (as the Node relay does: it closes the connection).
      this.gone(ws);
      try {
        ws.close(1009, 'message too big');
      } catch {}
      return;
    }

    // Flood control: a token per message, refilled over time. Someone who keeps flooding is cut off.
    const now = Date.now();
    const b = this.buckets.get(ws) || { tokens: BURST, at: now, dropped: 0 };
    b.tokens = Math.min(BURST, b.tokens + ((now - b.at) / 1000) * PER_SECOND);
    b.at = now;
    this.buckets.set(ws, b);
    if (b.tokens < 1) {
      if (++b.dropped > 1000) ws.close(1008, 'too many messages');
      return;
    }
    b.tokens -= 1;
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    const a = this.info(ws);

    if (msg.type === 'ping') return send(ws, { type: 'pong' }); // (normally answered without waking us)

    // Leaving on purpose, so the other side hears "left" rather than "connection dropped".
    if (msg.type === 'leave') return this.leave(ws, false);

    if (msg.type === 'join') {
      this.leave(ws, false); // switching rooms counts as leaving the old one
      const wanted = String(msg.room).slice(0, 64);
      if ((this.rooms.get(wanted)?.size || 0) >= MAX_PER_ROOM) return send(ws, { type: 'room-full', max: MAX_PER_ROOM });
      // A phone companion (chat + remote) doesn't count as a person watching, and comes and goes quietly.
      const companion = msg.companion === true;
      this.setInfo(ws, { room: wanted, companion, left: false });
      add(this.rooms, wanted, ws);
      const count = this.watchers(wanted);
      send(ws, { type: 'joined', count });
      if (!companion) this.broadcast(wanted, ws, { type: 'peer', count, joined: true });
      return;
    }

    // A guide page: ticks for its guide only, passed to the party and to other pages of the same guide.
    if (msg.type === 'guide-join') {
      this.leave(ws, false);
      this.leaveChannel(ws);
      const channel = /^[0-9a-f]{24}$/.test(msg.channel || '') ? msg.channel : null;
      if (!channel) return;
      this.setInfo(ws, { channel });
      add(this.pages, channel, ws);
      return;
    }
    if (a.channel) {
      if (msg.type !== 'guide-tick' && msg.type !== 'guide-add' && msg.type !== 'guide-art') return;
      const art = (x) =>
        typeof x === 'string' && (x === '' || /^(https:\/\/static\.tvmaze\.com\/|data:image\/jpeg;base64,)/.test(x)) ? x.slice(0, 60000) : '';
      const tick =
        msg.type === 'guide-art'
          ? { type: 'guide-art', id: String(msg.id || '').slice(0, 200), poster: art(msg.poster), background: art(msg.background), at: Number(msg.at) || Date.now() }
          : msg.type === 'guide-add'
            ? { type: 'guide-add', id: String(msg.id || '').slice(0, 200), key: String(msg.key || '').slice(0, 104), title: String(msg.title || '').slice(0, 120), kind: String(msg.kind || '').slice(0, 20) }
            : { type: 'guide-tick', id: String(msg.id || '').slice(0, 200), key: String(msg.key || '').slice(0, 104), v: !!msg.v, at: Number(msg.at) || Date.now() };
      const partyRoom = await this.roomOf(a.channel);
      if (partyRoom && (await guideChannel(partyRoom, tick.id)) === a.channel) this.broadcast(partyRoom, null, tick);
      for (const page of this.pages.get(a.channel) || []) if (page !== ws) send(page, tick);
      return;
    }

    const room = a.room;
    // The party's own guide messages also reach any open pages of that guide.
    if (room && (msg.type === 'guide-tick' || msg.type === 'guide-sync' || msg.type === 'guide-art')) {
      const ch = await this.learnChannel(room, msg.type === 'guide-tick' ? msg.id : msg.guide?.id);
      for (const page of this.pages.get(ch) || []) send(page, msg);
    }
    if (room && msg.type === 'guide-channels') {
      for (const id of (Array.isArray(msg.ids) ? msg.ids : []).slice(0, 50)) await this.learnChannel(room, id);
      return;
    }
    if (room) this.broadcast(room, ws, msg);
  }

  async learnChannel(room, id) {
    if (!id) return null;
    const ch = await guideChannel(room, String(id).slice(0, 200));
    if (this.channelRoom.get(ch) !== room) {
      this.channelRoom.set(ch, room);
      if (this.channelRoom.size > 5000) this.channelRoom.delete(this.channelRoom.keys().next().value);
      await this.ctx.storage.put(`ch:${ch}`, room);
    }
    return ch;
  }
  async roomOf(channel) {
    if (this.channelRoom.has(channel)) return this.channelRoom.get(channel);
    const room = await this.ctx.storage.get(`ch:${channel}`);
    if (room) this.channelRoom.set(channel, room);
    return room || null;
  }

  // ---- Leaving ----
  // dropped: gone without saying so (closed browser, lost connection), so the other side hears "dropped".
  leave(ws, dropped) {
    this.index();
    const a = this.info(ws);
    if (!a.room) return;
    const members = this.rooms.get(a.room);
    members?.delete(ws);
    if (members && !members.size) this.rooms.delete(a.room);
    this.setInfo(ws, { room: null, left: !dropped });
    if (members?.size && !a.companion) this.broadcast(a.room, null, { type: 'peer', count: this.watchers(a.room), joined: false, dropped });
  }
  leaveChannel(ws) {
    const a = this.info(ws);
    if (!a.channel) return;
    const pages = this.pages.get(a.channel);
    pages?.delete(ws);
    if (pages && !pages.size) this.pages.delete(a.channel);
    this.setInfo(ws, { channel: null });
  }
  gone(ws) {
    this.index();
    this.leave(ws, true);
    this.leaveChannel(ws);
  }
  async webSocketClose(ws, code) {
    this.gone(ws);
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, 'bye');
    } catch {}
  }
  async webSocketError(ws) {
    this.gone(ws);
  }

  // ---- Silent connections ----
  // The keep-alive pings are answered without waking us, so every 15s (while anyone is connected) we look
  // at when each one last pinged, and let go of the ones that stopped: the other side then hears "dropped".
  async checkLater() {
    if ((await this.ctx.storage.getAlarm()) == null) await this.ctx.storage.setAlarm(Date.now() + CHECK_EVERY);
  }
  async alarm() {
    this.index();
    const now = Date.now();
    const sockets = this.ctx.getWebSockets();
    for (const ws of sockets) {
      const a = this.info(ws);
      const pinged = this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() || 0;
      const last = Math.max(pinged, this.heard.get(ws) || 0, a.at || 0);
      const limit = a.room && !a.companion ? SILENT_LAPTOP : SILENT_OTHER;
      if (now - last > limit) {
        this.gone(ws);
        try {
          ws.close(1001, 'silent');
        } catch {}
      }
    }
    if (this.ctx.getWebSockets().length) await this.ctx.storage.setAlarm(Date.now() + CHECK_EVERY);
  }
}

function add(map, key, ws) {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(ws);
}
function send(ws, msg) {
  try {
    ws.send(JSON.stringify(msg));
  } catch {}
}
