// Owns the WebSocket to the relay, fans messages out to tabs, and keeps the chat history.
let ws = null;
let pingTimer = null;
let status = { connected: false, peers: 0, room: '' };
const ports = new Set();
const HISTORY_LIMIT = 300;

// Toolbar icon opens the sidebar.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

chrome.storage.local.get(['server', 'room', 'active']).then(({ server, room, active }) => {
  if (active && server && room) connect(server, room);
});

// Tabs connect as 'party', the sidebar as 'panel'.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'party' && port.name !== 'panel') return;
  ports.add(port);
  port.onMessage.addListener((msg) => {
    // Sidebar ↔ tab messages (handing her camera to a fullscreen tab) never leave this browser.
    if (msg.local) {
      for (const p of ports) if (p !== port) p.postMessage(msg);
      return;
    }
    if (msg.type === 'chat') {
      remember({ ...msg, mine: true });
      // Keep this browser's other chat views in step (sidebar ↔ fullscreen chat).
      for (const p of ports) if (p !== port) p.postMessage({ ...msg, mine: true });
    }
    send(msg);
  });
  port.onDisconnect.addListener(() => ports.delete(port));
});

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type === 'history') {
    // Wait for pending writes so the sidebar doesn't miss the newest message.
    historyWrite.then(() => chrome.storage.local.get('history')).then(({ history = [] }) => reply(history));
    return true;
  }
  if (msg.type === 'join-invite') {
    // Clicked "Join" on an invite page: open the sidebar while we still have the click, then join.
    if (sender.tab) chrome.sidePanel.open({ windowId: sender.tab.windowId }).catch(() => {});
    const room = String(msg.room || '').slice(0, 64);
    if (room) joinRoom(msg.server, room);
  } else if (msg.type === 'connect') {
    joinRoom(msg.server, msg.room);
  } else if (msg.type === 'disconnect') {
    chrome.storage.local.set({ active: false });
    disconnect();
  }
  reply(status);
});

function joinRoom(server, room) {
  // A different room means a different party, so start its chat fresh.
  historyWrite = historyWrite
    .then(() => chrome.storage.local.get('room'))
    .then(({ room: previous }) => {
      const update = { server, room, active: true };
      if (previous !== room) update.history = [];
      return chrome.storage.local.set(update);
    });
  connect(server, room);
}

// Chat history lives here (not in the sidebar) so it survives closing the sidebar,
// and messages that arrive while it's closed are still there when it reopens.
let historyWrite = Promise.resolve();
function remember(msg) {
  const entry = { id: msg.id, name: msg.name, text: msg.text, avatar: msg.avatar, mine: msg.mine, at: Date.now() };
  historyWrite = historyWrite
    .then(() => chrome.storage.local.get('history'))
    .then(({ history = [] }) => chrome.storage.local.set({ history: [...history, entry].slice(-HISTORY_LIMIT) }))
    .catch(console.error);
}

function connect(server, room) {
  disconnect();
  status = { connected: false, peers: 0, room, server };
  ws = new WebSocket(server);

  ws.onopen = () => {
    status.connected = true;
    ws.send(JSON.stringify({ type: 'join', room }));
    // Keeps the relay connection (and this service worker) alive.
    pingTimer = setInterval(() => send({ type: 'ping' }), 20000);
  };

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'joined' || msg.type === 'peer') status.peers = msg.count;
    if (msg.type === 'chat') {
      remember({ ...msg, mine: false });
      // Lets tabs know whether to flash the message on the video (sidebar closed or hidden by fullscreen).
      msg.panelOpen = [...ports].some((p) => p.name === 'panel');
    }
    for (const port of ports) port.postMessage(msg);
  };

  // Dropped connection (not a manual Leave — disconnect() unhooks this first): retry.
  ws.onclose = () => {
    clearInterval(pingTimer);
    status.connected = false;
    chrome.storage.local.get('active').then(({ active }) => {
      if (active) setTimeout(() => connect(server, room), 3000);
    });
  };
}

function disconnect() {
  clearInterval(pingTimer);
  if (ws) {
    ws.onclose = null;
    ws.close();
    ws = null;
  }
  status = { connected: false, peers: 0, room: '' };
}

function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}
