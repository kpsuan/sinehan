// Sidebar: connection settings, invite links, profiles, video call (WebRTC) and chat.
const $ = (id) => document.getElementById(id);
const myId = crypto.randomUUID();
let port = null;
let status = { connected: false, peers: 0, room: '', server: '' };
let me = { name: '', avatar: 0 };
let peer = null; // { name, avatar } once the other side has said hello
let askedPeer = false;

// Premade profile pictures: hand-drawn faces (avatars/1-4.png) on a soft color.
const AVATAR_COLORS = ['#c9b6f2', '#f1c9b0', '#bfe0d0', '#c6d4ec'];
const AVATAR_COUNT = AVATAR_COLORS.length;

function avatarEl(index, size = 26) {
  const el = document.createElement('span');
  el.className = 'avatar';
  el.style.width = el.style.height = `${size}px`;
  const i = Number.isInteger(index) && index >= 0 && index < AVATAR_COUNT ? index : 0;
  el.style.background = AVATAR_COLORS[i];
  const img = document.createElement('img');
  img.src = `avatars/${i + 1}.png`;
  img.alt = '';
  el.append(img);
  return el;
}

// ---- Link to background (which owns the relay connection) ----
function connectPort() {
  port = chrome.runtime.connect({ name: 'panel' });
  port.onMessage.addListener(onMessage);
  port.onDisconnect.addListener(() => setTimeout(connectPort, 1000));
}
connectPort();

function send(msg) {
  try { port.postMessage(msg); } catch {}
}

// One-off request to the background; ignores the harmless error when it's restarting.
function ask(msg, then) {
  chrome.runtime.sendMessage(msg, (reply) => {
    if (chrome.runtime.lastError) return;
    then?.(reply);
  });
}

function onMessage(msg) {
  if (msg.local) {
    onLocal(msg).catch((e) => console.error('[watch-party] camera hand-off', e));
  } else if (msg.type === 'chat') {
    if (seenChat.has(msg.id)) return;
    seenChat.add(msg.id);
    // `mine` = sent from this browser's fullscreen chat rather than this sidebar.
    addChat(msg.name, msg.text, msg.mine ? 'me' : 'them', msg.avatar, msg.vt);
    if (!msg.mine) showTyping(null);
  } else if (msg.type === 'mic') {
    if (pc && msg.on === false && theirMicOn !== false) addChat('', `${peer?.name ? `${peer.name}’s` : 'Their'} mic is off`, 'system');
    theirMicOn = !!msg.on;
    render();
  } else if (msg.type === 'hold' && msg.reason === 'break') {
    addChat('', msg.active ? `${msg.name || 'They'} is on a CR break` : `${msg.name || 'They'} is back`, 'system');
  } else if (msg.type === 'typing') {
    showTyping(msg.name);
  } else if (msg.type === 'hand') {
    $('who').closest('.top').classList.remove('holding');
    void $('who').offsetWidth; // restart the animation
    $('who').closest('.top').classList.add('holding');
  } else if (msg.type === 'now-watching') {
    theirShow = { url: msg.url, title: msg.title };
    renderWatch();
  } else if (msg.type === 'watchlist-changed') {
    if (!$('listView').hidden) listItems();
  } else if (msg.type === 'show-closed') {
    addChat('', `${peer?.name || 'They'} closed the show`, 'system');
  } else if (msg.type === 'profile') {
    peer = { name: String(msg.name || '').slice(0, 30) || 'Your person', avatar: Number(msg.avatar) || 0 };
    if (msg.ask) sendProfile(false);
    renderProfiles();
  } else if (msg.type === 'rtc' && msg.from !== myId) {
    onSignal(msg).catch((e) => console.error('[watch-party] rtc', e));
  } else if (msg.type === 'peer') {
    if (msg.joined ?? msg.count > 1) {
      addChat('', `${peer?.name || 'They'} joined`, 'system');
      sendProfile(true);
    } else if (msg.dropped && msg.count < 2) {
      // Lost connection, not leaving: keep their name, and the call if it's still connected.
      addChat('', `${peer?.name ? `${peer.name}’s` : 'Their'} connection dropped`, 'system');
    } else {
      // With only two of you, it's them; anyone else (a third browser) is just "someone".
      addChat('', msg.count < 2 ? `${peer?.name || 'Your person'} left` : 'Someone left', 'system');
      if (msg.count < 2) {
        peer = null;
        renderProfiles();
        if (pc) endCall('Call ended — they left');
      }
    }
  }
}

function sendProfile(ask) {
  send({ type: 'profile', name: myName(), avatar: me.avatar, ask });
}

// ---- Profile & connection settings ----
const DEFAULT_SERVER = 'wss://sinehan.live';
const OLD_SERVERS = ['ws://localhost:8080', 'wss://sinehan-rhua.onrender.com']; // earlier defaults

chrome.storage.local.get(['name', 'avatar', 'server', 'room']).then(({ name, avatar, server, room }) => {
  me.name = name || '';
  me.avatar = Number.isInteger(avatar) && avatar < AVATAR_COUNT ? avatar : Math.floor(Math.random() * AVATAR_COUNT);
  chrome.storage.local.set({ avatar: me.avatar });
  $('name').value = me.name;
  $('server').value = !server || OLD_SERVERS.includes(server) ? DEFAULT_SERVER : server;
  $('room').value = room || '';
  renderProfiles();
});

let profileTimer = null;
$('name').oninput = () => {
  me.name = $('name').value.trim();
  chrome.storage.local.set({ name: me.name });
  renderProfiles(); // header shows the new name right away
  clearTimeout(profileTimer);
  profileTimer = setTimeout(() => sendProfile(false), 600);
};

Array.from({ length: AVATAR_COUNT }, (_, i) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('role', 'radio');
  button.setAttribute('aria-label', `Picture ${i + 1}`);
  button.append(avatarEl(i, 40));
  button.onclick = () => setAvatar(i);
  $('avatars').append(button);
  const small = button.cloneNode(true);
  small.onclick = () => setAvatar(i);
  $('wlAvatars').append(small);
});

function setAvatar(i) {
  me.avatar = i;
  chrome.storage.local.set({ avatar: i });
  sendProfile(false);
  renderProfiles();
}

$('connect').onclick = () => {
  const server = $('server').value.trim();
  const room = $('room').value.trim();
  if (server && room) ask({ type: 'connect', server, room }, showStatus);
};
$('disconnect').onclick = () => {
  if (pc) endCall('You left');
  $('inviteBox').hidden = true;
  ask({ type: 'disconnect' }, showStatus);
  // Leaving ends the party: the chat is saved under "Past parties" and this one starts fresh.
  $('log').replaceChildren();
  seenChat.clear();
  theirShow = null;
};

// Gear icon in the header shows/hides the settings section.
$('settingsBtn').onclick = () => ($('settings').open = !$('settings').open);
$('settings').addEventListener('toggle', () => $('settingsBtn').setAttribute('aria-pressed', String($('settings').open)));

// ---- Welcome (not in a party yet) ----
function renderWelcome() {
  const show = !status.room && !$('settings').open && $('historyView').hidden && $('listView').hidden;
  $('welcome').hidden = !show;
  document.body.classList.toggle('welcome', show);
}
$('settings').addEventListener('toggle', renderWelcome);
$('wlName').addEventListener('input', () => {
  $('name').value = $('wlName').value;
  $('name').dispatchEvent(new Event('input')); // same as typing in Settings
});
$('wlStart').onclick = async () => {
  $('wlError').hidden = true;
  await $('invite').onclick(); // makes a room, connects, copies the link
  addChat('', 'Invite link copied. Send it to the other person.', 'system');
};
$('wlJoin').onsubmit = (e) => {
  e.preventDefault();
  let link;
  try {
    link = new URL($('wlLink').value.trim());
  } catch {}
  const room = link?.searchParams.get('room');
  if (!link || !/^https?:$/.test(link.protocol) || !room) {
    $('wlError').textContent = 'That doesn’t look like a Sinehan invite link.';
    $('wlError').hidden = false;
    return;
  }
  $('wlError').hidden = true;
  const server = `${link.protocol === 'https:' ? 'wss:' : 'ws:'}//${link.host}`;
  $('server').value = server;
  $('room').value = room;
  ask({ type: 'connect', server, room }, showStatus);
  const to = link.searchParams.get('to');
  if (to && /^https?:\/\//.test(to)) ask({ type: 'follow', url: to }); // open the show they're on
  $('wlLink').value = '';
};

chrome.runtime.sendMessage({ type: 'pending-call' }, (call) => {
  if (chrome.runtime.lastError || !call || pc) return;
  startRinging(call.name);
});

function showStatus(s) {
  if (!s) return;
  const prev = status;
  const wasConnected = prev.connected;
  status = s;
  // An invite link may have connected us to a different room/server — reflect it.
  // Only when the connection itself changed — never overwrite what someone is typing or just typed.
  if (s.room && s.room !== prev.room && document.activeElement !== $('room')) $('room').value = s.room;
  if (s.server && s.server !== prev.server && document.activeElement !== $('server')) $('server').value = s.server;
  $('status').textContent = !s.room ? 'Not connected'
    : !s.connected ? (s.retrying ? 'Connection lost. Reconnecting…' : 'Connecting…')
    : s.peers > 1 ? 'Together'
    : 'Waiting for them to join';
  $('status').dataset.state = !s.connected ? 'off' : s.peers > 1 ? 'live' : 'waiting';
  if (!wasConnected && s.connected) $('settings').open = false;
  if (s.connected && s.peers > 1 && !peer && !askedPeer) {
    askedPeer = true;
    sendProfile(true);
  }
  if (s.peers < 2) askedPeer = false;
  render();
  renderWatch();
  renderWelcome();
}
const pollStatus = () => ask({ type: 'status' }, showStatus);
pollStatus();
setInterval(pollStatus, 1000);

// ---- Invite link ----
// Points at the relay's /join page; the extension picks it up there, joins the room
// and forwards them to whatever you're watching.
$('invite').onclick = async () => {
  const server = $('server').value.trim();
  if (!server) {
    $('settings').open = true;
    $('server').focus();
    return;
  }
  let room = $('room').value.trim();
  if (!room) room = $('room').value = `party-${crypto.randomUUID().slice(0, 6)}`;
  if (!status.connected || status.room !== room) {
    ask({ type: 'connect', server, room }, showStatus);
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url?.startsWith('http')) ask({ type: 'set-watch', tabId: tab.id }, showStatus); // inviting to this = watching this
  const base = server.replace(/^ws/, 'http').replace(/\/+$/, '');
  let link = `${base}/join?room=${encodeURIComponent(room)}`;
  // Who's inviting and to what, so the invite page can say so.
  link += `&n=${encodeURIComponent(myName())}&a=${me.avatar}`;
  const niceTitle = status.watch?.tabId === tab?.id && status.watch?.showTitle;
  if (tab?.url?.startsWith('http')) link += `&to=${encodeURIComponent(tab.url)}&t=${encodeURIComponent((niceTitle || tab.title || '').slice(0, 120))}`;
  const picture = showPicture(tab?.url, status.watch?.tabId === tab?.id ? status.watch?.image : null);
  if (picture) link += `&img=${encodeURIComponent(picture)}`;

  try {
    await navigator.clipboard.writeText(link);
    // Quick confirmation on the icon itself: link turns into a check for a moment.
    $('invite').classList.add('copied');
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => $('invite').classList.remove('copied'), 1600);
  } catch {
    // Clipboard blocked: show the link so it can be copied by hand.
    $('inviteLink').value = link;
    $('inviteBox').hidden = false;
    $('inviteLink').select();
  }
};
let copiedTimer = null;
$('inviteLink').onclick = () => $('inviteLink').select();

// A picture of the show for the invite page: YouTube's own thumbnail, otherwise the image the page
// publishes for link previews (reported by the show's tab).
function showPicture(url, published) {
  try {
    const u = new URL(url);
    const v = u.searchParams.get('v');
    if (/(^|\.)youtube\.com$/.test(u.hostname) && /^[\w-]{6,20}$/.test(v || '')) return `https://i.ytimg.com/vi/${v}/hqdefault.jpg`;
  } catch {}
  return /^https:\/\//.test(published || '') && published.length < 600 ? published : null;
}

function renderProfiles() {
  $('who').replaceChildren(avatarEl(me.avatar, 30), ...(peer ? [avatarEl(peer.avatar, 30)] : []));
  $('names').textContent = peer ? `${myName()} & ${peer.name}` : myName();
  $('myAvatar').replaceChildren(avatarEl(me.avatar, 48));
  for (const list of [$('avatars'), $('wlAvatars')]) {
    [...list.children].forEach((b, i) => {
      b.classList.toggle('selected', i === me.avatar);
      b.setAttribute('aria-checked', String(i === me.avatar));
    });
  }
  $('wlAvatar').replaceChildren(avatarEl(me.avatar, 38));
  if (document.activeElement !== $('wlName')) $('wlName').value = $('name').value;
  render();
}

// ---- Appearance: Glass (the show shows through), Dark, Light ----
// Cached in localStorage too, so the sidebar opens in the right theme without a flash.
let theme = 'glass';
function applyTheme(t) {
  theme = ['glass', 'dark', 'light'].includes(t) ? t : 'glass';
  document.documentElement.dataset.theme = theme;
  document.querySelectorAll('[data-theme-choice]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeChoice === theme)));
  try {
    localStorage.setItem('theme', theme);
  } catch {}
  if (theme !== 'glass') $('backdrop').classList.remove('on');
}
try {
  applyTheme(localStorage.getItem('theme'));
} catch {
  applyTheme('glass');
}
chrome.storage.local.get('theme').then(({ theme: saved }) => saved && applyTheme(saved));
document.querySelectorAll('[data-theme-choice]').forEach((b) => {
  b.onclick = () => {
    applyTheme(b.dataset.themeChoice);
    chrome.storage.local.set({ theme });
    if (theme === 'glass') updateBackdrop(true);
  };
});

// ---- See-through backdrop ----
// Chrome draws the sidebar as a solid surface, so to get real "glass" we put a blurred snapshot of the
// show behind the cards, refreshed every few seconds while you're in a party.
// Protected video (Netflix, Prime…) can capture as solid black; then we keep the plain dark background.
async function updateBackdrop(force = false) {
  if (theme !== 'glass' || !status.connected || (!force && document.visibilityState === 'hidden')) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  if (!tab || !/^https?:/.test(tab.url || '')) return;
  let shot;
  try {
    shot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 30 });
  } catch {
    return;
  }
  if (await isBlank(shot)) return $('backdrop').classList.remove('on');
  $('backdrop').style.backgroundImage = `url(${shot})`;
  $('backdrop').classList.add('on');
}
// Average brightness of a tiny copy of the image; near zero = a black (protected) frame.
async function isBlank(src) {
  const img = new Image();
  img.src = src;
  await img.decode().catch(() => {});
  const c = document.createElement('canvas');
  c.width = 24;
  c.height = 14;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, c.width, c.height);
  const px = g.getImageData(0, 0, c.width, c.height).data;
  let sum = 0;
  for (let i = 0; i < px.length; i += 4) sum += px[i] + px[i + 1] + px[i + 2];
  return sum / (px.length / 4) / 3 < 6;
}
setInterval(updateBackdrop, 3000);

// ---- What we're watching ----
let theirShow = null; // { url, title } — what they said they're watching
let activeTab = null;

function showKey(url) {
  try {
    const u = new URL(url);
    const v = u.searchParams.get('v');
    return u.origin + u.pathname + (v ? `?v=${v}` : '');
  } catch {
    return url || '';
  }
}

async function renderWatch() {
  const w = status.watch;
  if (!status.connected) {
    // Not in a party: nothing to show, and no need to keep checking tabs.
    $('watchBar').hidden = true;
    $('followBar').hidden = true;
    $('backdrop').classList.remove('on');
    return;
  }
  $('watchTitle').textContent = w ? w.showTitle || w.title || w.url : 'Nothing yet. Open a show and click Watch here.';
  $('watchTitle').classList.toggle('none', !w);
  $('watchIcon').hidden = !w?.favIconUrl;
  if (w?.favIconUrl && $('watchIcon').src !== w.favIconUrl) $('watchIcon').src = w.favIconUrl;
  [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  $('watchHere').hidden = !(activeTab?.url?.startsWith('http') && activeTab.id !== w?.tabId);
  $('countdownBtn').disabled = !w || !(status.connected && status.peers > 1);
  $('breakBtn').disabled = !onBreak && !(status.connected && status.peers > 1);
  $('handBtn').disabled = !(status.connected && status.peers > 1);
  // Their prompt goes away once we're on the same thing.
  $('watchBar').hidden = !status.connected;
  const showPrompt = status.connected && theirShow && showKey(theirShow.url) !== showKey(w?.url || '');
  $('followBar').hidden = !showPrompt;
  if (showPrompt) $('followText').textContent = `${peer?.name ? `${peer.name} is` : 'They’re'} watching ${theirShow.title ? `“${theirShow.title}”` : 'something new'}`;
}

$('watchHere').onclick = () => {
  if (activeTab) ask({ type: 'set-watch', tabId: activeTab.id }, showStatus);
};
$('followGo').onclick = () => {
  if (theirShow) ask({ type: 'follow', url: theirShow.url }, showStatus);
};
$('followClose').onclick = () => {
  theirShow = null;
  renderWatch();
};
$('handBtn').onclick = () => {
  send({ type: 'hand', name: myName() });
  $('handBtn').classList.remove('sent');
  void $('handBtn').offsetWidth;
  $('handBtn').classList.add('sent');
};
$('countdownBtn').onclick = () => send({ local: true, type: 'countdown-start' }); // the show's tab runs it

// CR break: the show's tab pauses both of you; "I'm back" counts you both back in.
let onBreak = false;
const BREAK_ICON = $('breakBtn').innerHTML;
$('breakBtn').onclick = () => {
  if (!status.watch) return addChat('', 'Open your show first (or click Watch here), then take a break.', 'system');
  send({ local: true, type: 'break-toggle' });
};
function renderBreak() {
  $('breakBtn').classList.toggle('on', onBreak);
  if (onBreak) $('breakBtn').textContent = 'I’m back';
  else $('breakBtn').innerHTML = BREAK_ICON; // fixed icon markup from this file
  $('breakBtn').title = onBreak ? 'End your break: count down 3-2-1 and play' : 'CR break: pause for both of you';
}

// ---- Chat ----
// History is kept by the background script, so closing the sidebar doesn't lose it.
const seenChat = new Set();
ask({ type: 'history' }, (history = []) => {
  const live = [...$('log').children]; // anything that arrived while history was loading
  for (const m of history) {
    if (m.id && seenChat.has(m.id)) continue;
    if (m.id) seenChat.add(m.id);
    addChat(m.name, m.text, m.mine ? 'me' : 'them', m.avatar, m.vt);
  }
  $('log').append(...live);
  $('log').scrollTop = $('log').scrollHeight;
});

function myName() {
  return $('name').value.trim() || 'Guest';
}

$('form').onsubmit = (e) => {
  e.preventDefault();
  const text = $('msg').value.trim();
  if (!text) return;
  sendChat(text);
  $('msg').value = '';
  closeTrays();
};

function sendChat(text) {
  const id = crypto.randomUUID();
  const vt = showTime();
  seenChat.add(id);
  send({ type: 'chat', id, name: myName(), avatar: me.avatar, text, vt });
  addChat(myName(), text, 'me', me.avatar, vt);
}

// Where the show is right now (from the show's tab), for stamping chat messages.
function showTime() {
  const pos = status.pos;
  if (!pos || Date.now() - pos.at > 5000) return undefined;
  return pos.time + (pos.paused ? 0 : (Date.now() - pos.at) / 1000);
}

function clock(seconds) {
  const sec = Math.max(0, Math.round(seconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const ss = String(sec % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

// "… is typing" — we send a ping at most every 2s while typing; theirs fades after a few seconds.
let lastTypingSent = 0;
$('msg').addEventListener('input', () => {
  if (!$('msg').value.trim() || Date.now() - lastTypingSent < 2000) return;
  lastTypingSent = Date.now();
  send({ type: 'typing', name: myName() });
});
let typingTimer = null;
function showTyping(name) {
  clearTimeout(typingTimer);
  $('typing').hidden = !name;
  if (!name) return;
  $('typing').textContent = `${name} is typing…`;
  typingTimer = setTimeout(() => ($('typing').hidden = true), 3500);
}

// Messages that are only a few emoji (no other text) show big, and float on the other person's video.
function isEmojiOnly(text) {
  return /\p{Extended_Pictographic}/u.test(text) && !/[0-9#*]/.test(text)
    && /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Emoji_Component}|‍|️|\s)+$/u.test(text)
    && [...new Intl.Segmenter().segment(text.replace(/\s/g, ''))].length <= 8;
}

// `into` = which list (the live chat, or a past party being read); past parties' timestamps aren't clickable.
function addChat(name, text, kind, avatar, vt, into = $('log')) {
  const live = into === $('log');
  const line = document.createElement('div');
  line.className = `line ${kind}`;
  if (kind === 'system') {
    line.textContent = text;
  } else {
    const bubble = document.createElement('div');
    bubble.className = 'msg';
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = name;
    if (isEmojiOnly(text || '')) bubble.classList.add('big');
    bubble.append(who, document.createTextNode(text || ''));
    // Where in the show it was said; clicking jumps you both there.
    if (typeof vt === 'number' && Number.isFinite(vt)) {
      const stamp = document.createElement('button');
      stamp.className = 'stamp';
      stamp.type = 'button';
      stamp.textContent = clock(vt);
      stamp.title = live ? 'Jump here together' : 'Where in the show this was said';
      if (live) stamp.onclick = () => send({ local: true, type: 'jump', time: vt });
      else stamp.disabled = true;
      bubble.append(document.createElement('br'), stamp);
    }
    line.append(avatarEl(Number(avatar) || 0), bubble);
  }
  into.appendChild(line);
  into.scrollTop = into.scrollHeight;
}

// ---- Past parties ----
let openSession = null;
function showHistory(on) {
  if (on) showList(false);
  document.body.classList.toggle('show-history', on);
  $('historyView').hidden = !on;
  renderWelcome();
  $('historyBtn').setAttribute('aria-pressed', String(on));
  if (on) listSessions();
}
$('historyBtn').onclick = () => showHistory($('historyView').hidden);
$('historyBack').onclick = () => (openSession ? listSessions() : showHistory(false));

function partyDate(ts) {
  return new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function listSessions() {
  openSession = null;
  $('hvTitle').textContent = 'Past parties';
  $('sessionLog').hidden = true;
  $('sessions').hidden = false;
  $('sessionDelete').hidden = true;
  ask({ type: 'sessions' }, (sessions = []) => {
    $('historyClear').hidden = !sessions.length;
    $('sessions').replaceChildren(...sessions.map((x) => {
      const b = document.createElement('button');
      b.className = 'session';
      b.type = 'button';
      const title = document.createElement('span');
      title.className = 's-title';
      title.textContent = x.shows?.length ? x.shows.join(' · ') : 'Watch party';
      const meta = document.createElement('span');
      meta.className = 's-meta';
      meta.textContent = `${partyDate(x.endedAt)} · ${x.count} message${x.count === 1 ? '' : 's'}`;
      b.append(title, meta);
      b.onclick = () => readSession(x.id);
      return b;
    }));
  });
}

function readSession(id) {
  ask({ type: 'session', id }, (x) => {
    if (!x) return listSessions();
    openSession = x.id;
    $('hvTitle').textContent = `${partyDate(x.endedAt)}${x.shows?.length ? ` · ${x.shows[0]}` : ''}`;
    $('sessions').hidden = true;
    $('historyClear').hidden = true;
    $('sessionDelete').hidden = false;
    $('sessionLog').hidden = false;
    $('sessionLog').replaceChildren();
    for (const m of x.messages) addChat(m.name, m.text, m.mine ? 'me' : 'them', m.avatar, m.vt, $('sessionLog'));
    $('sessionLog').scrollTop = 0;
  });
}

$('sessionDelete').onclick = () => {
  if (openSession) ask({ type: 'delete-session', id: openSession }, listSessions);
};
$('historyClear').onclick = () => {
  if (confirm('Delete all past parties? This can’t be undone.')) ask({ type: 'clear-sessions' }, listSessions);
};

// ---- Watchlist ----
// Shared: what either of you saves shows up for both (the background keeps and syncs it).
function showList(on) {
  if (on) showHistory(false);
  document.body.classList.toggle('show-list', on);
  $('listView').hidden = !on;
  $('listBtn').setAttribute('aria-pressed', String(on));
  renderWelcome();
  if (on) listItems();
}
$('listBtn').onclick = () => showList($('listView').hidden);
$('listBack').onclick = () => showList(false);

$('listSave').onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  if (!tab?.url?.startsWith('http')) return flashSave('Open a show first');
  $('listSave').disabled = true;
  ask({ type: 'watchlist-save', tabId: tab.id, by: myName() }, (r) => {
    $('listSave').disabled = false;
    flashSave(r?.ok ? 'Saved' : 'Couldn’t save');
    listItems();
  });
};
let saveTimer = null;
function flashSave(text) {
  $('listSave').textContent = text;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => ($('listSave').textContent = 'Save this tab'), 1600);
}

function siteName(url) {
  try {
    return new URL(url).hostname.replace(/^(www|m)\./, '');
  } catch {
    return '';
  }
}

function listItems() {
  ask({ type: 'watchlist' }, (items = []) => {
    $('items').replaceChildren(...items.map((x) => {
      const row = document.createElement('div');
      row.className = 'item';
      const thumb = document.createElement('span');
      thumb.className = 'thumb';
      if (/^https:\/\//.test(x.image || '')) thumb.style.backgroundImage = `url("${encodeURI(x.image)}")`;
      else thumb.textContent = siteName(x.url).split('.')[0].slice(0, 10);
      const text = document.createElement('span');
      text.className = 'i-text';
      const title = document.createElement('span');
      title.className = 'i-title';
      title.textContent = x.title || siteName(x.url);
      title.title = x.title || x.url;
      const meta = document.createElement('span');
      meta.className = 'i-meta';
      meta.textContent = `${siteName(x.url)} · saved by ${x.by === myName() ? 'you' : x.by || 'them'}`;
      text.append(title, meta);
      const watchBtn = document.createElement('button');
      watchBtn.className = 'primary';
      watchBtn.textContent = 'Watch';
      watchBtn.title = status.connected ? 'Open it and bring them along' : 'Open it';
      watchBtn.onclick = () => {
        ask({ type: 'follow', url: x.url }, showStatus); // the show's tab goes there; they get "watching …"
        showList(false);
      };
      const remove = document.createElement('button');
      remove.className = 'i-remove';
      remove.title = 'Remove from the watchlist (for both of you)';
      remove.setAttribute('aria-label', 'Remove');
      remove.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>'; // fixed markup
      remove.onclick = () => ask({ type: 'watchlist-delete', id: x.id }, listItems);
      row.append(thumb, text, watchBtn, remove);
      return row;
    }));
  });
}

// ---- Emoji tray ----
const QUICK_REACTIONS = '😂 😭 😍 😱 🔥 👏 ❤️ 💀';
const EMOJI = {
  Faces: '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 😉 😊 😇 🥰 😍 🤩 😘 😚 😋 😛 😜 🤪 😝 🤗 🤭 🤫 🤔 🤨 😐 😑 😶 😏 😒 🙄 😬 😌 😔 😴 🥴 😵 🤯 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😲 😳 🥺 😨 😰 😢 😭 😱 😖 😣 😞 😩 🥱 😤 😡 🤬 😈 💀 🤡 👻 🙈 🙉 🙊',
  Love: '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💋 😻 🫶 🥹',
  Hands: '👍 👎 👏 🙌 🤝 🙏 ✌️ 🤞 🤟 🤘 👌 🤌 👈 👉 👆 👇 ✋ 👋 💪 🫡',
  'Movie night': '🍿 🎬 🎥 📺 🎞️ 🍕 🍔 🌮 🍟 🍫 🍩 🍪 🍦 🍷 🥂 🍺 ☕ 🛋️ 🌙 ⭐ 🔥 ✨ 💯 💤 🎉 🎊 👀',
};

function emojiButton(emoji, onPick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = emoji;
  b.onclick = () => onPick(emoji);
  return b;
}

for (const e of QUICK_REACTIONS.split(' ')) $('quick').append(emojiButton(e, (pick) => sendChat(pick)));
for (const [label, list] of Object.entries(EMOJI)) {
  const title = document.createElement('div');
  title.className = 'tray-label';
  title.textContent = label;
  const grid = document.createElement('div');
  grid.className = 'emoji-grid';
  for (const e of list.split(' ')) {
    grid.append(emojiButton(e, (pick) => {
      const input = $('msg');
      input.setRangeText(pick, input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length, 'end');
      input.focus();
    }));
  }
  $('emojiGrid').append(title, grid);
}

function closeTrays() {
  $('emojiTray').hidden = true;
  $('emojiBtn').setAttribute('aria-pressed', 'false');
}
$('emojiBtn').onclick = () => {
  const opening = $('emojiTray').hidden;
  closeTrays();
  if (!opening) return;
  $('emojiTray').hidden = false;
  $('emojiBtn').setAttribute('aria-pressed', 'true');
};
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeTrays(); });

// A soft two-note chime every two seconds, made in the browser (no sound file needed).
function makeRinger() {
  let ctx = null;
  let timer = null;
  const chime = () => {
    try {
      ctx ||= new AudioContext();
      ctx.resume?.();
      const t = ctx.currentTime;
      [[659.25, 0], [880, 0.18]].forEach(([freq, delay]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, t + delay);
        gain.gain.linearRampToValueAtTime(0.12, t + delay + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.6);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t + delay);
        osc.stop(t + delay + 0.65);
      });
    } catch {}
  };
  return {
    start() { if (timer) return; chime(); timer = setInterval(chime, 2000); },
    stop() { clearInterval(timer); timer = null; },
    get on() { return !!timer; },
  };
}

const ringer = makeRinger();
let incoming = null; // { name } while someone is calling and we haven't answered
let ringTimeout = null;
function startRinging(name) {
  incoming = { name: name || 'They' };
  ringer.start();
  send({ local: true, type: 'ringing', name: incoming.name }); // the show's tab shows it in fullscreen
  clearTimeout(ringTimeout);
  ringTimeout = setTimeout(() => {
    if (!incoming) return;
    addChat('', `Missed call from ${incoming.name}`, 'system');
    stopRinging();
    if (pc && !localStream) endCall(null);
  }, 40000);
  render();
}
function stopRinging() {
  if (!incoming && !ringer.on) return;
  incoming = null;
  ringer.stop();
  clearTimeout(ringTimeout);
  send({ local: true, type: 'ring-stop' });
  chrome.runtime.sendMessage({ type: 'call-handled' }, () => void chrome.runtime.lastError);
  render();
}

// ---- Video call ----
// Video goes browser-to-browser over WebRTC; the relay only carries the setup messages.
// Uses the "perfect negotiation" pattern so it doesn't matter who starts or turns on their camera first.
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
let pc = null;
let localStream = null;
let remoteStream = null;
let makingOffer = false;
let ignoreOffer = false;
let awaitingOffer = false;
let audioTx = null;
let theirMicOn = null; // what they told us (null = not in a call / unknown) // the transceiver our mic goes out on (track swapped in/out without renegotiating)
// Mic on/off is remembered. Off means the microphone is fully released, which keeps Bluetooth
// headphones in high-quality mode and stops Windows from turning the show down "for a call".
let micOn = false;
chrome.storage.local.get('micOn').then(({ micOn: saved }) => (micOn = saved === true));

// ---- Which camera / mic (Settings) ----
let cameraId = '';
let micId = '';
chrome.storage.local.get(['cameraId', 'micId']).then((saved) => {
  cameraId = saved.cameraId || '';
  micId = saved.micId || '';
  listDevices();
});

const videoConstraints = () => ({ width: 640, height: 480, ...(cameraId ? { deviceId: { exact: cameraId } } : {}) });
const audioConstraints = () => ({ echoCancellation: true, noiseSuppression: true, ...(micId ? { deviceId: { exact: micId } } : {}) });

// Like getUserMedia, but if the chosen device is gone (unplugged), fall back to the default one.
async function getMedia(kind) {
  const constraints = () => (kind === 'video' ? { video: videoConstraints() } : { audio: audioConstraints() });
  try {
    return await navigator.mediaDevices.getUserMedia(constraints());
  } catch (e) {
    const chosen = kind === 'video' ? cameraId : micId;
    if (!chosen || !['OverconstrainedError', 'NotFoundError', 'NotReadableError'].includes(e.name)) throw e;
    if (kind === 'video') cameraId = '';
    else micId = '';
    chrome.storage.local.set({ cameraId, micId });
    addChat('', `Your chosen ${kind === 'video' ? 'camera' : 'mic'} isn’t available, so the default one is used.`, 'system');
    return navigator.mediaDevices.getUserMedia(constraints());
  }
}

async function listDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
  // Chrome adds "default"/"communications" stand-ins for audio; "System default" covers those.
  const real = (kind) => devices.filter((d) => d.kind === kind && d.deviceId && !['default', 'communications'].includes(d.deviceId));
  fillDevices($('camSelect'), real('videoinput'), cameraId, 'Camera');
  fillDevices($('micSelect'), real('audioinput'), micId, 'Microphone');
  // Without camera/mic permission, Chrome hides device names.
  $('devicePerm').hidden = devices.some((d) => d.label);
}

function fillDevices(select, list, chosen, noun) {
  const options = [new Option('System default', '')];
  list.forEach((d, i) => options.push(new Option(d.label || `${noun} ${i + 1}`, d.deviceId)));
  select.replaceChildren(...options);
  select.value = list.some((d) => d.deviceId === chosen) ? chosen : '';
}

navigator.mediaDevices.addEventListener('devicechange', listDevices);
$('settings').addEventListener('toggle', () => $('settings').open && listDevices());
$('devicePerm').onclick = () => chrome.tabs.create({ url: 'permission.html' });

$('camSelect').onchange = async () => {
  cameraId = $('camSelect').value;
  chrome.storage.local.set({ cameraId });
  // Mid-call: swap the camera in place, no hanging up.
  const old = localStream?.getVideoTracks()[0];
  if (!pc || !old) return;
  try {
    const [track] = (await getMedia('video')).getVideoTracks();
    track.enabled = old.enabled;
    await pc.getSenders().find((s) => s.track === old)?.replaceTrack(track);
    old.stop();
    localStream.removeTrack(old);
    localStream.addTrack(track);
    $('local').srcObject = localStream;
  } catch (e) {
    addChat('', `Couldn’t switch camera: ${e.message || e.name}`, 'system');
  }
};

$('micSelect').onchange = async () => {
  micId = $('micSelect').value;
  chrome.storage.local.set({ micId });
  if (pc && localStream?.getAudioTracks().length) {
    await setMic(false);
    await setMic(true); // reopen on the newly chosen mic
  }
};

// ---- Call audio: their voice, and turning the show down while they talk ----
let duckLevel = 0.5; // the show's volume while they talk, as a share of yours (0 = leave it alone)
chrome.storage.local.get(['duckLevel', 'voiceVol']).then((saved) => {
  if (typeof saved.duckLevel === 'number') duckLevel = saved.duckLevel;
  $('duckSelect').value = String(duckLevel);
  if (typeof saved.voiceVol === 'number') $('voiceVol').value = String(saved.voiceVol);
  $('remote').volume = Number($('voiceVol').value);
});
$('duckSelect').onchange = () => {
  duckLevel = Number($('duckSelect').value);
  chrome.storage.local.set({ duckLevel });
  if (!duckLevel) setDucked(false);
};
$('voiceVol').oninput = () => {
  $('remote').volume = Number($('voiceVol').value);
  chrome.storage.local.set({ voiceVol: Number($('voiceVol').value) });
};

// Listens to their side of the call: a few loud moments in a row = talking; a second or so of quiet = done.
let voiceMeter = null; // { ctx, timer, track }
let ducked = false;
function watchTheirVoice() {
  const track = remoteStream?.getAudioTracks()[0];
  if (!track || voiceMeter?.track === track) return;
  stopVoiceMeter();
  try {
    const ctx = new AudioContext();
    ctx.resume?.();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(new MediaStream([track])).connect(analyser); // only measured, not played again
    const samples = new Float32Array(analyser.fftSize);
    let loud = 0;
    let lastLoud = 0;
    const timer = setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const x of samples) sum += x * x;
      const now = Date.now();
      loud = Math.sqrt(sum / samples.length) > 0.025 ? loud + 1 : 0;
      if (loud >= 2) lastLoud = now;
      setDucked(duckLevel > 0 && theirMicOn !== false && now - lastLoud < 1200);
    }, 100);
    voiceMeter = { ctx, timer, track };
  } catch (e) {
    console.warn('[watch-party] voice meter', e);
  }
}
let duckRepeat = 0;
function setDucked(on) {
  // While on, repeat every second, so the show comes back up by itself if this sidebar goes away.
  if (on === ducked && (!on || Date.now() - duckRepeat < 1000)) return;
  ducked = on;
  duckRepeat = Date.now();
  send({ local: true, type: 'duck', on, level: duckLevel });
}
function stopVoiceMeter() {
  if (!voiceMeter) return;
  clearInterval(voiceMeter.timer);
  voiceMeter.ctx.close().catch(() => {});
  voiceMeter = null;
  setDucked(false);
}

function signal(data) {
  send({ type: 'rtc', from: myId, name: myName(), ...data });
}

function createPeer() {
  pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  remoteStream = new MediaStream();

  pc.onnegotiationneeded = async () => {
    if (awaitingOffer) return; // answering a call late: wait for their fresh offer instead of racing it
    try {
      makingOffer = true;
      await pc.setLocalDescription();
      signal({ description: pc.localDescription.toJSON() });
    } catch (e) {
      console.error('[watch-party] offer failed', e);
    } finally {
      makingOffer = false;
    }
  };
  pc.onicecandidate = ({ candidate }) => {
    if (candidate) signal({ candidate: candidate.toJSON() });
  };
  pc.ontrack = ({ track }) => {
    remoteStream.addTrack(track);
    if (track.kind === 'audio') watchTheirVoice();
    $('remote').srcObject = remoteStream;
    $('remote').play().catch(() => {});
    track.onunmute = render;
    render();
    if (track.kind === 'video') send({ local: true, type: 'cam-available' }); // a fullscreen tab may want it
  };
  pc.onconnectionstatechange = () => {
    if (pc?.connectionState === 'failed') endCall('Call dropped — the connection failed');
    render();
  };
}

async function onSignal({ description, candidate, bye, declined, want, from, name }) {
  // They picked up late and want a fresh offer from us (our first one went unanswered).
  if (want === 'offer') {
    if (!pc || !localStream) return;
    try {
      makingOffer = true;
      if (pc.signalingState === 'have-local-offer') await pc.setLocalDescription({ type: 'rollback' });
      await pc.setLocalDescription(await pc.createOffer({ iceRestart: true }));
      signal({ description: pc.localDescription.toJSON() });
    } finally {
      makingOffer = false;
    }
    return;
  }
  if (bye) {
    if (incoming && !localStream) {
      addChat('', `Missed call from ${incoming.name}`, 'system');
      stopRinging();
      if (pc) endCall(null);
    } else if (pc) {
      endCall(declined ? `${name || 'They'} declined` : `${name || 'They'} hung up`);
    }
    return;
  }
  if (description) {
    if (!pc) {
      if (description.type !== 'offer') return;
      createPeer();
      addChat('', `${name || 'They'} started a video call`, 'system');
      if (!localStream) startRinging(name);
    }
    const polite = myId < from;
    const collision = description.type === 'offer' && (makingOffer || pc.signalingState !== 'stable');
    ignoreOffer = !polite && collision;
    if (ignoreOffer) {
      if (pc.localDescription?.type === 'offer') signal({ description: pc.localDescription.toJSON() });
      return;
    }
    await pc.setRemoteDescription(description);
    if (description.type === 'offer') awaitingOffer = false;
    if (description.type === 'offer') {
      await pc.setLocalDescription();
      signal({ description: pc.localDescription.toJSON() });
    }
    render();
  } else if (candidate && pc) {
    try {
      await pc.addIceCandidate(candidate);
    } catch (e) {
      if (!ignoreOffer) throw e;
    }
  }
}

async function turnOnCamera() {
  try {
    localStream = await getMedia('video');
  } catch (e) {
    if (e.name === 'NotAllowedError') {
      // The side panel can't show Chrome's permission prompt, so ask once from a normal tab.
      chrome.tabs.create({ url: 'permission.html' });
      addChat('', 'Allow camera & mic in the tab that just opened, then click the call button again.', 'system');
    } else {
      addChat('', `Couldn’t start your camera: ${e.message || e.name}`, 'system');
    }
    return false;
  }
  $('local').srcObject = localStream;
  // Answering a call that started while our sidebar was closed: ask them for a fresh offer, rather than
  // both sides offering at once. (Falls back to offering ourselves if nothing comes.)
  const late = !pc;
  if (late) awaitingOffer = true;
  if (!pc) createPeer();
  for (const track of localStream.getTracks()) pc.addTrack(track, localStream);
  micTransceiver(); // ready for the mic, even if it starts off
  if (late) {
    signal({ want: 'offer' });
    setTimeout(() => {
      if (!awaitingOffer || !pc) return;
      awaitingOffer = false;
      pc.onnegotiationneeded?.();
    }, 5000);
  }
  if (micOn) await setMic(true);
  listDevices(); // names are visible now that we have permission
  send({ type: 'mic', on: !!localStream.getAudioTracks().length });
  if (!localStream.getAudioTracks().length) addChat('', 'Your mic is off. Click the mic button to talk.', 'system');
  render();
  return true;
}

// Reuse an audio slot the other side offered, or add one; either way we can swap the mic in later.
function micTransceiver() {
  if (audioTx && pc.getTransceivers().includes(audioTx)) return audioTx;
  audioTx = pc.getTransceivers().find((t) => t.receiver.track?.kind === 'audio' && !t.sender.track && t.currentDirection !== 'stopped')
    || pc.addTransceiver('audio', { direction: 'sendrecv', streams: [localStream] });
  if (audioTx.direction !== 'sendrecv') audioTx.direction = 'sendrecv';
  audioTx.sender.setStreams?.(localStream);
  return audioTx;
}

async function setMic(on) {
  if (!pc || !localStream) return;
  const current = localStream.getAudioTracks()[0];
  if (on && !current) {
    let track;
    try {
      [track] = (await getMedia('audio')).getAudioTracks();
    } catch (e) {
      addChat('', `Couldn’t turn on your mic: ${e.message || e.name}`, 'system');
      return;
    }
    localStream.addTrack(track);
    await micTransceiver().sender.replaceTrack(track);
  } else if (!on && current) {
    await micTransceiver().sender.replaceTrack(null);
    current.stop(); // releases the microphone itself
    localStream.removeTrack(current);
  }
  micOn = on;
  chrome.storage.local.set({ micOn });
  send({ type: 'mic', on });
  render();
}

function endCall(reason, notify = false) {
  if (incoming) stopRinging();
  if (notify) signal({ bye: true });
  stopAllRelays();
  stopVoiceMeter();
  if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
  pc?.close();
  pc = null;
  awaitingOffer = false;
  audioTx = null;
  theirMicOn = null;
  localStream?.getTracks().forEach((t) => t.stop());
  localStream = null;
  remoteStream = null;
  $('remote').srcObject = null;
  $('local').srcObject = null;
  if (reason) addChat('', reason, 'system');
  render();
}

$('start').onclick = async () => {
  if (await turnOnCamera()) addChat('', 'Calling. They need the sidebar open to pick up.', 'system');
};
$('join').onclick = () => {
  stopRinging();
  turnOnCamera();
};
$('decline').onclick = () => {
  const who = incoming?.name;
  stopRinging();
  signal({ bye: true, declined: true });
  if (pc) endCall(null);
  addChat('', `You declined ${who ? `${who}’s` : 'the'} call`, 'system');
};
$('hangup').onclick = () => endCall('You hung up', true);

$('mic').onclick = () => setMic(!localStream?.getAudioTracks().length);
$('cam').onclick = () => toggleTrack('video', $('cam'));
function toggleTrack(kind, button) {
  const track = localStream?.getTracks().find((t) => t.kind === kind);
  if (!track) return;
  track.enabled = !track.enabled;
  button.classList.toggle('off', !track.enabled);
  sendCallState();
}

// Keeps the fullscreen camera's mic/camera buttons matching the real state.
let lastCallState = '';
function sendCallState(force = false) {
  const state = {
    mic: !!localStream?.getAudioTracks().length,
    cam: !!localStream?.getVideoTracks()[0]?.enabled,
    hasCamera: !!localStream,
  };
  const key = JSON.stringify(state);
  if (!force && key === lastCallState) return;
  lastCallState = key;
  send({ local: true, type: 'call-state', ...state });
}

// ---- Camera hand-off to fullscreen tabs ----
// Fullscreen hides this sidebar, so a fullscreen tab asks for her camera and we forward the video
// track to it over a second connection that stays inside this browser (messages marked `local`).
const relays = new Map(); // tab view id -> RTCPeerConnection

async function onLocal(msg) {
  if (msg.type === 'break-state') {
    onBreak = !!msg.active;
    return renderBreak();
  }
  const relay = relays.get(msg.from);
  if (msg.type === 'call-control') {
    // From the floating camera in fullscreen.
    if (msg.action === 'mic') await setMic(!localStream?.getAudioTracks().length);
    else if (msg.action === 'cam') toggleTrack('video', $('cam'));
    return sendCallState(true);
  }
  if (msg.type === 'call-state-request') return sendCallState(true);
  if (msg.type === 'cam-want') await startRelay(msg.from);
  else if (msg.type === 'cam-answer') await relay?.setRemoteDescription(msg.description);
  else if (msg.type === 'cam-ice') await relay?.addIceCandidate(msg.candidate).catch(() => {});
  else if (msg.type === 'cam-stop') stopRelay(msg.from);
}

async function startRelay(viewId) {
  const track = remoteStream?.getVideoTracks()[0];
  if (!track) return; // no call yet; we'll announce 'cam-available' when there is one
  stopRelay(viewId);
  const relay = new RTCPeerConnection();
  relays.set(viewId, relay);
  relay.addTrack(track, new MediaStream([track]));
  relay.onicecandidate = ({ candidate }) => {
    if (candidate) send({ local: true, type: 'cam-ice', to: viewId, candidate: candidate.toJSON() });
  };
  await relay.setLocalDescription();
  send({ local: true, type: 'cam-offer', to: viewId, description: relay.localDescription.toJSON() });
}

function stopRelay(viewId) {
  relays.get(viewId)?.close();
  relays.delete(viewId);
}

function stopAllRelays() {
  for (const viewId of [...relays.keys()]) {
    stopRelay(viewId);
    send({ local: true, type: 'cam-bye', to: viewId });
  }
}

// Fullscreen hides the side panel, so pop her video out into a floating window first.
$('pip').onclick = async () => {
  try {
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    else await $('remote').requestPictureInPicture();
  } catch (e) {
    addChat('', `Couldn’t pop out: ${e.message}`, 'system');
  }
};

function render() {
  const bothHere = status.connected && status.peers > 1;
  const inCall = !!pc;
  const hasCamera = !!localStream;
  const seeingThem = !!remoteStream?.getVideoTracks().length;

  $('start').hidden = inCall;
  $('start').disabled = !bothHere;
  $('join').hidden = !(inCall || incoming) || hasCamera;
  $('decline').hidden = !incoming;
  $('start').hidden = inCall || !!incoming;
  $('mic').hidden = $('cam').hidden = !hasCamera;
  $('mic').classList.toggle('off', !localStream?.getAudioTracks().length);
  sendCallState();
  $('mic').title = localStream?.getAudioTracks().length ? 'Mic on: click to turn it off' : 'Mic off: click to talk';
  $('pip').hidden = !seeingThem;
  $('hangup').hidden = !inCall;
  $('local').hidden = !hasCamera;
  $('remoteMic').hidden = !(inCall && seeingThem && theirMicOn === false);

  $('placeholder').hidden = seeingThem;
  $('faces').replaceChildren(avatarEl(me.avatar, 52), ...(peer ? [avatarEl(peer.avatar, 52)] : []));
  $('phText').textContent = incoming ? `${incoming.name} is calling…`
    : !status.connected ? 'Not in a room yet. Use Invite to start one.'
    : !bothHere ? 'Waiting for them to join.'
    : !inCall ? 'Camera’s off.'
    : 'Connecting…';
}
render();
