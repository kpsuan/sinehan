// Owns the WebSocket to the relay, decides which tab is "the show" (the watch tab), routes messages
// between the relay, that tab and the sidebar, and keeps the chat history.
let ws = null;
let pingTimer = null;
let status = { connected: false, peers: 0, room: '' };
const ports = new Set();
const HISTORY_LIMIT = 300;
const DEFAULT_SERVER = 'wss://sinehan.live';
// Addresses earlier versions used; anyone still on them moves to the real domain.
const OLD_SERVERS = ['ws://localhost:8080', 'wss://sinehan-rhua.onrender.com'];

// The one tab that syncs. Everything from other tabs is ignored, and nothing is sent to them.
let watch = null; // { tabId, url, title, favIconUrl }
let lastPos = null; // { time, paused, at } — the watch tab's playback position, for chat timestamps

// Toolbar icon opens the sidebar.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

chrome.storage.local.get(['server', 'room', 'active', 'watch']).then(async ({ server, room, active, watch: saved }) => {
  if (OLD_SERVERS.includes(server)) {
    server = DEFAULT_SERVER;
    chrome.storage.local.set({ server });
  }
  // Tab ids don't survive a browser restart, so only keep the watch tab if it still exists.
  if (saved?.tabId != null) {
    const tab = await chrome.tabs.get(saved.tabId).catch(() => null);
    if (tab) setWatchState(tab);
    else chrome.storage.local.remove('watch');
  }
  if (active && server && room) connect(server, room);
});

// ---- Ports: tabs connect as 'party', the sidebar as 'panel' ----
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'party' && port.name !== 'panel') return;
  port.tabId = port.sender?.tab?.id;
  ports.add(port);
  if (port.name === 'party') sendRole(port);

  port.onMessage.addListener((msg) => {
    // Sidebar ↔ tab messages (camera hand-off, jump to a chat timestamp, countdown) never leave this browser.
    if (msg.local) {
      for (const p of ports) if (p !== port) postTo(p, msg);
      return;
    }
    const fromTab = port.name === 'party';
    const fromWatchTab = fromTab && isWatchTab(port);

    if (msg.type === 'claim') {
      // A tab with a real player, and no show picked yet: make it the show.
      if (!watch && port.tabId != null) setWatchTab(port.tabId, true);
      return;
    }
    if (msg.type === 'position') {
      if (fromWatchTab) lastPos = { time: msg.time, paused: msg.paused, at: Date.now() };
      return;
    }
    if (msg.type === 'meta') {
      // The show's link-preview picture, for invite pages.
      if (fromWatchTab && watch) {
        watch.image = /^https:\/\//.test(msg.image || '') && msg.image.length < 600 ? msg.image : '';
        watch.showTitle = String(msg.title || '').slice(0, 120); // e.g. Netflix's real show name
      }
      return;
    }
    // Playback messages only count from the show's tab; stray videos elsewhere can't control anything.
    if (fromTab && !fromWatchTab && msg.type !== 'chat') return;

    if (msg.type === 'goodnight' && fromWatchTab) saveSpot(msg);
    if (msg.type === 'chat') {
      remember({ ...msg, mine: true });
      // Keep this browser's other chat views in step (sidebar ↔ fullscreen chat).
      for (const p of ports) if (p !== port && wantsMessage(p)) postTo(p, { ...msg, mine: true });
    }
    send(msg);
  });
  port.onDisconnect.addListener(() => {
    void chrome.runtime.lastError;
    ports.delete(port);
  });
});

function postTo(port, msg) {
  try {
    port.postMessage(msg);
  } catch {
    ports.delete(port); // that page is gone or frozen in the back/forward cache
  }
}

const isWatchTab = (port) => watch != null && port.tabId === watch.tabId;
// The sidebar hears everything; tabs only if they're the show.
const wantsMessage = (port) => port.name === 'panel' || isWatchTab(port);

function sendRole(port) {
  postTo(port, { type: 'role', watching: isWatchTab(port), hasWatch: !!watch });
}
function broadcastLocal(msg) {
  for (const p of ports) if (wantsMessage(p)) postTo(p, msg);
}

// ---- One-off requests (sidebar, invite page, banners) ----
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type === 'history') {
    // Wait for pending writes so the sidebar doesn't miss the newest message.
    historyWrite.then(() => chrome.storage.local.get('history')).then(({ history = [] }) => reply(history));
    return true;
  }
  if (msg.type === 'pending-call') {
    reply(pendingCall);
    return;
  }
  if (msg.type === 'call-handled') {
    clearPendingCall();
    reply(true);
    return;
  }
  if (msg.type === 'open-sidebar') {
    // From the floating camera's exit button; must run right away, while Chrome still counts the click.
    if (!sender.tab) return reply({ ok: false });
    chrome.sidePanel.open({ windowId: sender.tab.windowId }).then(() => reply({ ok: true }), () => reply({ ok: false }));
    return true;
  }
  if (msg.type === 'join-invite') {
    // Clicked "Join" on an invite page: open the sidebar while we still have the click, then join.
    // That tab is about to become the show, so it's the watch tab.
    if (sender.tab) {
      chrome.sidePanel.open({ windowId: sender.tab.windowId }).catch(() => {});
      setWatchTab(sender.tab.id, false);
    }
    const room = String(msg.room || '').slice(0, 64);
    if (room) joinRoom(msg.server, room);
  } else if (msg.type === 'connect') {
    joinRoom(msg.server, msg.room);
  } else if (msg.type === 'disconnect') {
    chrome.storage.local.set({ active: false });
    disconnect();
    archiveParty(); // Leave ends the party: its chat moves to "Past parties"
  } else if (msg.type === 'sessions') {
    historyWrite.then(() => chrome.storage.local.get('sessions')).then(({ sessions = [] }) =>
      reply(sessions.map(({ messages, ...summary }) => ({ ...summary, count: messages.length }))));
    return true;
  } else if (msg.type === 'session') {
    chrome.storage.local.get('sessions').then(({ sessions = [] }) => reply(sessions.find((x) => x.id === msg.id) || null));
    return true;
  } else if (msg.type === 'delete-session' || msg.type === 'clear-sessions') {
    historyWrite = historyWrite
      .then(() => chrome.storage.local.get('sessions'))
      .then(({ sessions = [] }) => chrome.storage.local.set({ sessions: msg.type === 'clear-sessions' ? [] : sessions.filter((x) => x.id !== msg.id) }));
    historyWrite.then(() => reply({ ok: true }));
    return true;
  } else if (msg.type === 'resume') {
    chrome.storage.local.get('resume').then(({ resume }) => reply(resume || null));
    return true;
  } else if (msg.type === 'resume-go') {
    // Open the saved show; its tab asks for the spot once the player is there (resume-check).
    chrome.storage.local.get('resume').then(async ({ resume }) => {
      if (!resume) return reply(null);
      await chrome.storage.local.set({ resume: { ...resume, pending: true } });
      await follow(resume.url);
      reply(statusView());
    });
    return true;
  } else if (msg.type === 'resume-check') {
    chrome.storage.local.get('resume').then(({ resume }) => {
      if (!resume?.pending || showKey(resume.url) !== showKey(msg.url || '')) return reply(null);
      chrome.storage.local.set({ resume: { ...resume, pending: false } });
      reply({ time: resume.time });
    });
    return true;
  } else if (msg.type === 'resume-dismiss') {
    chrome.storage.local.remove('resume').then(() => reply(true));
    return true;
  } else if (msg.type === 'set-watch') {
    setWatchTab(msg.tabId, true).then(() => reply(statusView()));
    return true;
  } else if (msg.type === 'follow') {
    follow(msg.url).then(() => reply(statusView()));
    return true;
  }
  reply(statusView());
});

function statusView() {
  return { ...status, retrying, watch, pos: lastPos };
}

function joinRoom(server, room) {
  // A different room means a different party: the old one's chat goes to "Past parties".
  historyWrite = historyWrite
    .then(() => chrome.storage.local.get('room'))
    .then(({ room: previous }) => (previous !== room ? archiveNow() : null))
    .then(() => chrome.storage.local.set({ server, room, active: true }))
    .catch(console.error);
  connect(server, room);
}

// ---- Past parties ----
// When a party ends, its chat is saved with when it was and what you watched; newest 20 are kept.
const MAX_SESSIONS = 20;
async function archiveNow() {
  const { history = [], room, partyShows = [], sessions = [] } = await chrome.storage.local.get(['history', 'room', 'partyShows', 'sessions']);
  const update = { history: [], partyShows: [] };
  if (history.length) {
    const shows = [...new Set([...partyShows, watch?.title].filter(Boolean))];
    update.sessions = [{ id: crypto.randomUUID(), room, startedAt: history[0].at, endedAt: Date.now(), shows, messages: history }, ...sessions].slice(0, MAX_SESSIONS);
  }
  await chrome.storage.local.set(update);
}
function archiveParty() {
  historyWrite = historyWrite.then(archiveNow).catch(console.error);
}
// Remember what this party watched, for its title in "Past parties".
function noteShow(title) {
  if (!title) return;
  historyWrite = historyWrite
    .then(() => chrome.storage.local.get('partyShows'))
    .then(({ partyShows = [] }) => (partyShows.includes(title) ? null : chrome.storage.local.set({ partyShows: [...partyShows, title].slice(-5) })))
    .catch(console.error);
}

// ---- Stop for tonight ----
// Either of you (or the phone) stops for the night: both shows pause and the spot is saved, so next
// time the sidebar offers to pick up right there.
function saveSpot(msg) {
  const url = /^https?:\/\//.test(msg.url || '') ? msg.url : watch?.url;
  if (!url) return;
  const time = typeof msg.time === 'number' ? msg.time : lastPos?.time;
  if (typeof time !== 'number' || !Number.isFinite(time)) return;
  const title = String(msg.title || watch?.showTitle || watch?.title || '').slice(0, 120);
  chrome.storage.local.set({ resume: { url, title, time, at: Date.now(), by: String(msg.name || '').slice(0, 30) } });
}

// ---- Watch tab ----
async function setWatchTab(tabId, announce) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab) return;
  const from = watch?.url;
  setWatchState(tab);
  if (announce && showKey(from || '') !== showKey(tab.url || '')) announceShow(from);
}

function setWatchState(tab) {
  const changed = watch?.tabId !== tab.id;
  watch = { tabId: tab.id, url: tab.url || '', title: tab.title || '', favIconUrl: tab.favIconUrl || '' };
  chrome.storage.local.set({ watch });
  if (changed) {
    lastPos = null;
    for (const p of ports) if (p.name === 'party') sendRole(p);
  }
}

function clearWatch() {
  watch = null;
  lastPos = null;
  chrome.storage.local.remove('watch');
  for (const p of ports) if (p.name === 'party') sendRole(p);
}

// Tell the other person what we're watching. `from` is what we were on before: if they're still
// there (we were watching together), their tab follows automatically; otherwise they get a prompt.
function announceShow(from) {
  if (!watch || !/^https?:/.test(watch.url)) return;
  const title = watch.showTitle || watch.title;
  noteShow(title);
  send({ type: 'now-watching', url: watch.url, title, from });
}

// Go where they are: reuse the show's tab if we have one, otherwise open a new one.
async function follow(url) {
  if (!/^https?:\/\//.test(url || '')) return;
  if (watch) {
    await chrome.tabs.update(watch.tabId, { url, active: true }).catch(() => clearWatch());
    if (watch) return;
  }
  const tab = await chrome.tabs.create({ url });
  setWatchState(tab);
}

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId !== watch?.tabId) return;
  clearWatch();
  send({ type: 'show-closed' }); // the other side pauses instead of carrying on alone
});

// The show's tab moved to a different page (new episode or show): tell the other side.
let announceTimer = null;
let announceFrom = null;
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (tabId !== watch?.tabId) return;
  const urlChanged = info.url && showKey(info.url) !== showKey(watch.url);
  if (urlChanged && !announceTimer) announceFrom = watch.url; // where we were before this run of changes
  watch = { tabId, url: tab.url || watch.url, title: tab.title || watch.title, favIconUrl: tab.favIconUrl || watch.favIconUrl };
  chrome.storage.local.set({ watch });
  if (urlChanged) {
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => {
      announceTimer = null;
      announceShow(announceFrom); // after a moment, so the page has set its real title
    }, 1000);
  }
});

// Same show = same page, ignoring tracking/query noise (but keeping YouTube's ?v=).
function showKey(url) {
  try {
    const u = new URL(url);
    const v = u.searchParams.get('v');
    return u.origin + u.pathname + (v ? `?v=${v}` : '');
  } catch {
    return url || '';
  }
}

// ---- Chat history ----
// Lives here (not in the sidebar) so it survives closing the sidebar,
// and messages that arrive while it's closed are still there when it reopens.
let historyWrite = Promise.resolve();
function remember(msg) {
  const entry = { id: msg.id, name: msg.name, text: msg.text, avatar: msg.avatar, vt: msg.vt, mine: msg.mine, at: Date.now() };
  historyWrite = historyWrite
    .then(() => chrome.storage.local.get('history'))
    .then(({ history = [] }) => chrome.storage.local.set({ history: [...history, entry].slice(-HISTORY_LIMIT) }))
    .catch(console.error);
}

// ---- Incoming calls while the sidebar is closed ----
// The call itself lives in the sidebar. If it's closed when they call, ring on the show's tab and with
// a notification; opening the sidebar picks the call up.
let pendingCall = null; // { name, at }
let pendingTimer = null;
function onCallSignal(msg) {
  const panelOpen = [...ports].some((p) => p.name === 'panel');
  if (msg.bye) {
    if (pendingCall) clearPendingCall();
    return;
  }
  if (panelOpen || pendingCall || msg.description?.type !== 'offer') return;
  pendingCall = { name: msg.name || 'They', at: Date.now() };
  broadcastLocal({ local: true, type: 'incoming-call', name: pendingCall.name });
  chrome.notifications?.create('sinehan-call', {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: `${pendingCall.name} is calling`,
    message: 'Open Sinehan to answer.',
    requireInteraction: true,
    priority: 2,
  }, () => void chrome.runtime.lastError);
  clearTimeout(pendingTimer);
  pendingTimer = setTimeout(clearPendingCall, 40000);
}
function clearPendingCall() {
  if (!pendingCall) return;
  pendingCall = null;
  clearTimeout(pendingTimer);
  chrome.notifications?.clear('sinehan-call', () => void chrome.runtime.lastError);
  broadcastLocal({ local: true, type: 'call-gone' });
}
chrome.notifications?.onClicked.addListener(async (id) => {
  if (id !== 'sinehan-call') return;
  const win = watch ? (await chrome.tabs.get(watch.tabId).catch(() => null))?.windowId : undefined;
  const target = win ?? (await chrome.windows.getLastFocused().catch(() => null))?.id;
  if (target != null) {
    chrome.windows.update(target, { focused: true }).catch(() => {});
    chrome.sidePanel.open({ windowId: target }).catch(() => {});
  }
  chrome.notifications.clear(id);
});

// ---- Relay connection ----
// A connection can die without closing (Wi-Fi gone, laptop asleep): the relay answers our pings, and
// if nothing at all comes back for a while we drop it ourselves and reconnect.
const SILENCE_LIMIT = 25000;
let retrying = false; // lost the connection and trying to get it back
function connect(server, room) {
  disconnect();
  status = { connected: false, peers: 0, room, server };
  const sock = (ws = new WebSocket(server));
  let lastHeard = Date.now();
  let answersPings = false; // older relays don't answer; then we only rely on the socket closing

  sock.onopen = () => {
    status.connected = true;
    retrying = false;
    lastHeard = Date.now();
    sock.send(JSON.stringify({ type: 'join', room }));
    broadcastLocal({ type: 'connection', up: true });
    // Keeps the relay connection (and this service worker) alive, and checks it's still really there.
    pingTimer = setInterval(() => {
      send({ type: 'ping' });
      if (answersPings && Date.now() - lastHeard > SILENCE_LIMIT) {
        sock.onclose = null;
        sock.close();
        lost();
      }
    }, 10000);
  };

  sock.onmessage = (e) => {
    lastHeard = Date.now();
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    if (msg.type === 'pong') {
      answersPings = true;
      return;
    }
    if (msg.type === 'joined' || msg.type === 'peer') status.peers = msg.count;
    if (msg.type === 'joined' && msg.count > 1) setTimeout(announceShow, 500); // let a returning partner know
    if (msg.type === 'peer' && msg.joined) setTimeout(announceShow, 500);
    if (msg.type === 'companion-hello') setTimeout(announceShow, 300); // a phone joined: tell it what's on
    if (msg.type === 'rtc') onCallSignal(msg);
    if (msg.type === 'goodnight') saveSpot(msg);
    if (msg.type === 'chat') {
      remember({ ...msg, mine: false });
      // Lets the show's tab know whether to flash the message on the video (sidebar closed or hidden by fullscreen).
      msg.panelOpen = [...ports].some((p) => p.name === 'panel');
    }
    for (const port of ports) if (wantsMessage(port)) postTo(port, msg);
  };

  // Dropped connection (not a manual Leave — disconnect() unhooks this first): pause the show, then retry.
  function lost() {
    clearInterval(pingTimer);
    if (ws !== sock) return; // already replaced by a newer connection
    const wasConnected = status.connected;
    status.connected = false;
    status.peers = 0;
    if (wasConnected) broadcastLocal({ type: 'connection', up: false });
    chrome.storage.local.get('active').then(({ active }) => {
      if (!active || ws !== sock) return;
      retrying = true;
      setTimeout(() => ws === sock && connect(server, room), 3000);
    });
  }
  sock.onclose = lost;
}

function disconnect() {
  clearInterval(pingTimer);
  retrying = false;
  if (ws) {
    ws.onclose = null;
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'leave' })); // they hear "left", not "dropped"
    ws.close();
    ws = null;
  }
  status = { connected: false, peers: 0, room: '' };
}

function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}
