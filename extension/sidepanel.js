// Sidebar: connection settings, invite links, profiles, video call (WebRTC) and chat.
const $ = (id) => document.getElementById(id);
const myId = crypto.randomUUID();
let port = null;
let status = { connected: false, peers: 0, room: '', server: '' };
let me = { name: '', avatar: 0 };
let peer = null; // { name, avatar } once the other side has said hello
let askedPeer = false;

// Premade profile pictures (avatars/1-4.png), each on a soft color.
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

// ---- Bantay ----
// The mascot (bantay.js); the coat is picked in Settings and the show's tab reads the same setting.
let bantayCoat = 'white';
function drawBantay() {
  $('wlBantay').innerHTML = Bantay.svg('sit', { coat: bantayCoat }); // fixed markup
  $('rbDog').innerHTML = Bantay.svg('asleep', { coat: bantayCoat });
  document
    .querySelectorAll('.g-empty svg.bantay')
    .forEach((el) => (el.outerHTML = Bantay.svg('lying', { coat: bantayCoat })));
  document.documentElement.style.setProperty('--bantay-lying', `url("${Bantay.dataUri('lying', bantayCoat)}")`);
  document
    .querySelectorAll('#bantayCoats button')
    .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.coat === bantayCoat)));
}
for (const [id, name] of Object.entries(Bantay.coats)) {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.coat = id;
  b.title = name;
  b.innerHTML = Bantay.svg('head', { coat: id }); // fixed markup
  b.append(Object.assign(document.createElement('span'), { textContent: name }));
  b.onclick = () => {
    bantayCoat = id;
    chrome.storage.local.set({ bantayCoat });
    drawBantay();
  };
  $('bantayCoats').append(b);
}
drawBantay();
chrome.storage.local.get('bantayOnVideo').then(({ bantayOnVideo: v }) => ($('bantayOnVideo').checked = v !== false));
$('bantayOnVideo').onchange = () => chrome.storage.local.set({ bantayOnVideo: $('bantayOnVideo').checked });
chrome.storage.local.get('bantayCoat').then(({ bantayCoat: saved }) => {
  if (saved && Bantay.coats[saved]) {
    bantayCoat = saved;
    drawBantay();
  }
});

// ---- Link to background ----
// The background owns the relay connection.
function connectPort() {
  port = chrome.runtime.connect({ name: 'panel' });
  port.onMessage.addListener(onMessage);
  port.onDisconnect.addListener(() => setTimeout(connectPort, 1000));
}
connectPort();

function send(msg) {
  try {
    port.postMessage(msg);
  } catch {}
}

// One-off request; ignores the error when the background is restarting.
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
    addChat(msg.name, msg.text, msg.mine ? 'me' : 'them', msg.avatar, msg.vt, $('log'), msg.guide, msg.guess);
    if (!msg.mine) showTyping(null);
  } else if (msg.type === 'mic') {
    if (pc && msg.on === false && theirMicOn !== false)
      addChat('', `${peer?.name ? `${peer.name}’s` : 'Their'} mic is off`, 'system');
    theirMicOn = !!msg.on;
    render();
  } else if (msg.type === 'hold' && msg.reason === 'break') {
    addChat('', msg.active ? `${msg.name || 'They'} is on a CR break` : `${msg.name || 'They'} is back`, 'system');
  } else if (msg.type === 'typing') {
    showTyping(msg.name);
  } else if (msg.type === 'hand') {
    $('who').closest('.top').classList.remove('holding');
    void $('who').offsetWidth; // force a reflow so the animation restarts
    $('who').closest('.top').classList.add('holding');
  } else if (msg.type === 'now-watching') {
    theirShow = { url: msg.url, title: msg.title };
    renderWatch();
  } else if (msg.type === 'room-full') {
    $('wlError').textContent = `That party is full (${msg.max || 10} people at most). Ask them for a new invite link.`;
    $('wlError').hidden = false;
  } else if (msg.type === 'match-changed') {
    const before = tonight?.id;
    loadTonight();
    // A deck dealt by them: say so in the chat.
    ask({ type: 'match-get' }, (m) => {
      if (m && m.id !== before && !m.byMe) addChat('', `${m.by || 'They'} dealt a deck. Open Guides → Tonight to swipe.`, 'system');
    });
  } else if (msg.type === 'guesses-changed') {
    loadGuesses();
  } else if (msg.type === 'guides-changed') {
    if ($('bestView').hidden || episodesMode !== 'guide') return;
    if (!openGuide) listGuides();
    else if (openGuide.saved && (!msg.id || msg.id === openGuide.id)) {
      const scroll = openGuide;
      ask({ type: 'guide-get', id: openGuide.id }, (g) => {
        if (g && openGuide === scroll) {
          openGuide = { ...g, saved: true, problems: scroll.problems, shown: true };
          renderGuide(openGuide);
        }
      });
    }
  } else if (msg.type === 'play' || msg.type === 'pause' || msg.type === 'seeked') {
    playbackLine(peer?.name || 'They', msg.type, msg.time);
  } else if (msg.type === 'playback') {
    playbackLine('You', msg.action, msg.time);
  } else if (msg.type === 'goodnight') {
    addChat(
      '',
      `${msg.name || peer?.name || 'They'} stopped for tonight${typeof msg.time === 'number' ? ` at ${clock(msg.time)}` : ''}`,
      'system',
    );
    setTimeout(loadResume, 400);
  } else if (msg.type === 'show-closed') {
    addChat('', `${peer?.name || 'They'} closed the show`, 'system');
  } else if (msg.type === 'profile') {
    peer = { name: String(msg.name || '').slice(0, 30) || 'Your person', avatar: Number(msg.avatar) || 0 };
    if (msg.ask) sendProfile(false);
    renderProfiles();
  } else if (msg.type === 'rtc' && msg.from !== myId) {
    // Setup hiccups (late duplicates, races) resolve themselves, so warn rather than error.
    onSignal(msg).catch((e) => console.warn('[watch-party] call setup:', e?.name, e?.message));
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
const OLD_SERVERS = ['ws://localhost:8080', 'wss://sinehan-rhua.onrender.com']; // old defaults, replaced on load

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
  renderProfiles();
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

// Leaving lingers briefly ("Leaving…") so the sidebar doesn't feel like it snapped shut.
let leaving = false;
$('disconnect').onclick = async () => {
  if (leaving) return;
  leaving = true;
  const button = $('disconnect');
  button.disabled = $('connect').disabled = true;
  button.innerHTML = 'Leaving<span class="dots"><i>.</i><i>.</i><i>.</i></span>'; // fixed markup
  if (pc) endCall('You left');
  await new Promise((r) => setTimeout(r, 900));
  $('inviteBox').hidden = true;
  ask({ type: 'disconnect' }, showStatus);

  // Leaving ends the party: the chat is saved under "Past parties" and this one starts fresh.
  $('log').replaceChildren();
  seenChat.clear();
  theirShow = null;

  // We left, so no "they left" message comes: forget them here.
  peer = null;
  askedPeer = false;
  renderProfiles();
  $('room').value = ''; // the next party gets a new room
  document.body.classList.add('just-left');
  setTimeout(() => document.body.classList.remove('just-left'), 700);
  $('settings').open = false; // back to the welcome screen
  button.textContent = 'Leave';
  button.disabled = $('connect').disabled = false;
  leaving = false;
};

// A different party: its own chat (the old one is in Past parties), no one else here yet.
function startFresh() {
  $('log').replaceChildren();
  seenChat.clear();
  theirShow = null;
  peer = null;
  askedPeer = false;
  renderProfiles();

  // After the background has filed the old chat away, show whatever this party already has.
  setTimeout(
    () =>
      ask({ type: 'history' }, (history = []) => {
        for (const m of history) {
          if (m.id && seenChat.has(m.id)) continue;
          if (m.id) seenChat.add(m.id);
          addChat(m.name, m.text, m.mine ? 'me' : 'them', m.avatar, m.vt, $('log'), m.guide, m.guess);
        }
      }),
    400,
  );
}

$('settingsBtn').onclick = () => ($('settings').open = !$('settings').open);
$('settings').addEventListener('toggle', () => {
  $('settingsBtn').setAttribute('aria-pressed', String($('settings').open));
  if ($('settings').open && !$('historyView').hidden) showHistory(false);
});

// ---- Bantay's introduction (the first time) ----
// He hops in, barks hello, then walks you through the three steps. Tap him on the welcome screen for
// another bark.
const INTRO = [
  { pose: 'happy', bark: ['Woof!', 'U・ᴥ・U'], title: 'Hi, I’m Bantay.', text: 'I keep watch while the two of you watch together, from two places.' },
  { pose: 'guard', bark: ['(•ᴥ•)?'], title: 'Open your show', text: 'YouTube, Netflix, Prime Video or almost any site with a video. Keep this sidebar open beside it.' },
  { pose: 'sit', bark: ['Arf!', 'Arf!'], title: 'Start a party, send the link', text: 'Your invite link is copied for you. They tap it and land on the same show, at the same scene.' },
  { pose: 'lying', bark: ['(ᵔᴥᵔ)'], title: 'Watch together', text: 'Play, pause and skip stay in sync. Chat, call, take CR breaks and pick what’s next, right here.' },
];
let introStep = 0;
// Barks (and dog kaomoji), one after another: each pops up with a little hop.
const BARKS = [['Arf!', 'Arf!'], ['Woof!'], ['U・ᴥ・U'], ['(ᵔᴥᵔ)'], ['Woof!', '(•ᴥ•)'], ['Arf!', 'U・ᴥ・U']];
function bark(lines = ['Woof!'], bubble = $('introBark'), dog = $('introDog')) {
  const list = Array.isArray(lines) ? lines : [lines];
  clearTimeout(bubble.t);
  (bubble.timers || []).forEach(clearTimeout);
  bubble.timers = list.map((text, i) => setTimeout(() => {
    bubble.textContent = text;
    bubble.classList.remove('on');
    void bubble.offsetWidth;
    bubble.classList.add('on');
    if (i > 0) hop(dog);
    clearTimeout(bubble.t);
    bubble.t = setTimeout(() => bubble.classList.remove('on'), i === list.length - 1 ? 1400 : 900);
  }, i * 520));
}
function hop(el) {
  el.classList.remove('hop');
  void el.offsetWidth;
  el.classList.add('hop');
}
function showIntroStep() {
  const s = INTRO[introStep];
  $('introDog').innerHTML = Bantay.svg(s.pose, { coat: bantayCoat }); // fixed markup
  $('introTitle').textContent = s.title;
  $('introText').textContent = s.text;
  $('introDots').replaceChildren(...INTRO.map((_, i) => Object.assign(document.createElement('i'), { className: i === introStep ? 'on' : '' })));
  $('introNext').textContent = introStep === INTRO.length - 1 ? 'Let’s watch' : 'Next';
  for (const id of ['introDog', 'introTitle', 'introText']) {
    $(id).classList.remove('intro-step-in');
    void $(id).offsetWidth;
    $(id).classList.add('intro-step-in');
  }
  hop($('introDog'));
  if (s.bark) setTimeout(() => bark(s.bark), 380);
}
function endIntro() {
  $('intro').hidden = true;
  for (const n of $('welcome').children) if (n.id !== 'intro') n.toggleAttribute('hidden', n.dataset.wasHidden === '1');
  chrome.storage.local.set({ introSeen: true });
  hop($('wlBantay'));
}
function startIntro() {
  // First run: straight to Bantay (not the settings).
  $('settings').open = false;
  renderWelcome();
  for (const n of $('welcome').children) {
    if (n.id === 'intro') continue;
    n.dataset.wasHidden = n.hasAttribute('hidden') ? '1' : '';
    n.setAttribute('hidden', '');
  }
  $('intro').hidden = false;
  introStep = 0;
  showIntroStep();
}
$('introNext').onclick = () => {
  if (introStep === INTRO.length - 1) return endIntro();
  introStep += 1;
  showIntroStep();
};
$('introSkip').onclick = endIntro;
$('introDog').onclick = () => {
  hop($('introDog'));
  bark(BARKS[Math.floor(Math.random() * BARKS.length)]);
};
// On the welcome screen: tap Bantay, he hops and wags.
$('wlBantay').onclick = () => {
  hop($('wlBantay'));
  bark(BARKS[Math.floor(Math.random() * BARKS.length)], $('wlBark'), $('wlBantay'));
};
chrome.storage.local.get('introSeen').then(({ introSeen }) => {
  if (!introSeen && !status.room) startIntro();
});

// ---- Welcome (not in a party yet) ----
function renderWelcome() {
  const show = !status.room && !$('settings').open && $('historyView').hidden && $('bestView').hidden;
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
  // The link icon copies this party's invite; with no party yet, "Start a party" makes one.
  $('invite').disabled = !s.room;
  $('invite').title = s.room ? 'Copy invite link' : 'Start a party first';

  // An invite link may have moved us to another room/server: reflect it, but never over what someone is typing.
  if (s.room && s.room !== prev.room && document.activeElement !== $('room')) $('room').value = s.room;

  // Straight from one party into another (an invite link while open): start fresh.
  if (s.room && prev.room && s.room !== prev.room) startFresh();
  if (s.server && s.server !== prev.server && document.activeElement !== $('server')) $('server').value = s.server;
  $('status').textContent = !s.room
    ? 'Not connected'
    : !s.connected
      ? s.retrying
        ? 'Connection lost. Reconnecting…'
        : 'Connecting…'
      : s.peers > 1
        ? 'Together'
        : 'Waiting for them to join';
  $('status').dataset.state = !s.connected ? 'off' : s.peers > 1 ? 'live' : 'waiting';
  $('partyNow').textContent = !s.room
    ? 'Not in a party. Start one from the home screen.'
    : !s.connected
      ? 'In a party, reconnecting…'
      : s.peers > 1
        ? 'In a party, together.'
        : 'In a party, waiting for them.';
  if (!leaving) $('disconnect').disabled = !s.room;
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
// A new party's name: 20 random letters and digits, so nobody can stumble into your room by guessing.
function newRoomId() {
  const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
  return `party-${[...crypto.getRandomValues(new Uint8Array(20))].map((b) => abc[b % abc.length]).join('')}`;
}

// The link points at the relay's /join page, where the extension joins the room and opens your show.
$('invite').onclick = async () => {
  const server = $('server').value.trim();
  if (!server) {
    $('settings').open = true;
    $('advanced').open = true;
    $('server').focus();
    return;
  }

  // Not in a party: always a new room, so an old party's chat and invite link don't carry over.
  const room = status.room || ($('room').value = newRoomId());
  if (!status.connected || status.room !== room) {
    ask({ type: 'connect', server, room }, showStatus);
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url?.startsWith('http')) ask({ type: 'set-watch', tabId: tab.id }, showStatus); // inviting to this = watching this
  const base = server.replace(/^ws/, 'http').replace(/\/+$/, '');
  let link = `${base}/join?room=${encodeURIComponent(room)}`;

  // Who's inviting and to what, so the invite page can say so.
  link += `&n=${encodeURIComponent(myName())}&a=${me.avatar}`;
  const onShow = status.watch?.tabId === tab?.id;
  const title = inviteTitle((onShow && status.watch?.showTitle) || tab?.title || '');
  if (tab?.url?.startsWith('http'))
    link += `&to=${encodeURIComponent(tab.url)}&t=${encodeURIComponent(title.slice(0, 120))}`;

  // Picture: YouTube's or the page's own, else TVmaze artwork, else the page's biggest image.
  const picture =
    showPicture(tab?.url, onShow ? status.watch?.image : null) ||
    (title && (await tvPicture(title))) ||
    showPicture(null, onShow ? status.watch?.fallbackImage : null);
  if (picture) link += `&img=${encodeURIComponent(picture)}`;

  try {
    await navigator.clipboard.writeText(link);

    // Brief confirmation: the link icon turns into a check.
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

// "Prime Video: The Mentalist - Season 3" -> "The Mentalist" (the invite page shows the platform separately).
function inviteTitle(raw) {
  return tidyTitle(String(raw || '').replace(/^(Prime Video|Amazon\.com|Watch)\s*:\s*/i, '')).replace(
    /[\s\-–—:|·]+$/,
    '',
  );
}

// TVmaze artwork (free, no key) for pages with no picture; gives up after 1.5s.
const tvPictures = new Map();
async function tvPicture(title) {
  const name = tidyTitle(title).replace(/[\s\-–—:|·]+$/, '');
  if (!name) return '';
  if (tvPictures.has(name)) return tvPictures.get(name);
  let pic = '';
  try {
    const r = await fetch(`https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(name)}`, {
      signal: AbortSignal.timeout(1500),
    });
    const show = r.ok ? await r.json() : null;

    // Only if it's really this show, not just the closest name.
    if (show && norm(show.name) === norm(name)) pic = String(show.image?.original || '').replace(/^http:/, 'https:');
  } catch {}
  tvPictures.set(name, pic);
  return pic;
}

// YouTube's thumbnail, else the page's link-preview image (reported by the show's tab).
function showPicture(url, published) {
  try {
    const u = new URL(url);
    const v = u.searchParams.get('v');
    if (/(^|\.)youtube\.com$/.test(u.hostname) && /^[\w-]{6,20}$/.test(v || ''))
      return `https://i.ytimg.com/vi/${v}/hqdefault.jpg`;
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

// ---- Appearance ----
// Glass, Dark or Light; also cached in localStorage so the sidebar opens without a theme flash.
let theme = 'glass';
function applyTheme(t) {
  theme = ['glass', 'dark', 'light'].includes(t) ? t : 'glass';
  document.documentElement.dataset.theme = theme;
  document
    .querySelectorAll('[data-theme-choice]')
    .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeChoice === theme)));
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
// Chrome draws the sidebar solid, so glass is faked with a blurred snapshot of the show behind the cards.
// Protected video (Netflix, Prime…) can capture as solid black; then the plain background stays.
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
let theirShow = null; // { url, title }: what they say they're watching
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

// The show's tab lacks our page script (open since before an extension reload): offer a refresh,
// after 3s so a tab that's still loading doesn't flash it.
let staleSince = 0;
function renderStale() {
  const stale = status.connected && status.watch && status.watchLive === false;
  if (!stale) staleSince = 0;
  else if (!staleSince) staleSince = Date.now();
  $('staleBar').hidden = !(stale && Date.now() - staleSince > 3000);
}
$('staleGo').onclick = () => {
  ask({ type: 'refresh-watch' });
  staleSince = Date.now();
  $('staleBar').hidden = true;
};

async function renderWatch() {
  renderStale();
  const w = status.watch;
  if (!status.connected) {
    $('watchBar').hidden = true;
    $('followBar').hidden = true;
    $('backdrop').classList.remove('on');
    return;
  }
  $('watchTitle').textContent = w
    ? w.showTitle || w.title || w.url
    : 'Nothing yet. Open a show and click Watch this tab.';
  $('watchTitle').classList.toggle('none', !w);
  $('watchIcon').hidden = !w?.favIconUrl;
  if (w?.favIconUrl && $('watchIcon').src !== w.favIconUrl) $('watchIcon').src = w.favIconUrl;
  [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  $('watchHere').hidden = !(activeTab?.url?.startsWith('http') && activeTab.id !== w?.tabId);
  $('watchHere').textContent = w ? 'Watch this tab instead' : 'Watch this tab';
  $('countdownBtn').disabled = !w || !(status.connected && status.peers > 1);
  $('breakBtn').disabled = !onBreak && !status.connected;
  renderResume();
  $('handBtn').disabled = !(status.connected && status.peers > 1);
  $('watchBar').hidden = !status.connected;

  // Their prompt goes away once we're on the same thing.
  const showPrompt = status.connected && theirShow && showKey(theirShow.url) !== showKey(w?.url || '');
  $('followBar').hidden = !showPrompt;
  if (showPrompt)
    $('followText').textContent =
      `${peer?.name ? `${peer.name} is` : 'They’re'} watching ${theirShow.title ? `“${theirShow.title}”` : 'something new'}`;
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

// On a break the button means "I'm back"; otherwise it opens the CR break / stop for tonight menu.
$('breakBtn').onclick = () => {
  if (onBreak) return send({ local: true, type: 'break-toggle' });
  showBreakMenu($('breakMenu').hidden);
};
function showBreakMenu(on) {
  $('breakMenu').hidden = !on;
  $('breakBtn').setAttribute('aria-expanded', String(on));
  $('crBreak').disabled = !(status.connected && status.peers > 1);
}
$('crBreak').onclick = () => {
  showBreakMenu(false);
  if (!status.watch) return addChat('', 'Open your show first (or click Watch this tab), then take a break.', 'system');
  send({ local: true, type: 'break-toggle' });
};
$('goodnightBtn').onclick = () => {
  showBreakMenu(false);
  if (!status.watch) return addChat('', 'Open your show first, then stop for tonight.', 'system');
  send({ local: true, type: 'goodnight-start' }); // the show's tab pauses both of you and reports the spot
  const at = showTime();
  addChat(
    '',
    `You stopped for tonight${typeof at === 'number' ? ` at ${clock(at)}` : ''}. Next time, pick up right there.`,
    'system',
  );
  setTimeout(loadResume, 600);
};

// ---- Pick up where you left off ----
let resume = null; // { url, title, time, at, by }
function loadResume() {
  ask({ type: 'resume' }, (r) => {
    resume = r || null;
    renderResume();
  });
}
function renderResume() {
  const here = resume && status.watch && showKey(status.watch.url) === showKey(resume.url);
  const name = resume ? resume.title || siteOf(resume.url) : '';
  const when = resume ? `${clock(resume.time)} · ${partyDate(resume.at)}` : '';
  $('resumeBar').hidden = !resume || !status.connected || here;
  if (resume) $('resumeTitle').textContent = `${name} · at ${when}`;
  $('wlResume').hidden = !resume;
  if (resume) {
    const title = document.createElement('b');
    title.textContent = name;
    $('wlResumeText').replaceChildren(title, document.createTextNode(`Stopped at ${when}`));
  }
}
function siteOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
const resumeGo = () =>
  ask({ type: 'resume-go' }, (s) => {
    showStatus(s);
    resume = null;
    renderResume();
    ask({ type: 'resume-dismiss' });
  });
$('resumeGo').onclick = resumeGo;
$('wlResumeGo').onclick = resumeGo;
$('resumeClose').onclick = () =>
  ask({ type: 'resume-dismiss' }, () => {
    resume = null;
    renderResume();
  });
loadResume();
function renderBreak() {
  $('breakBtn').classList.toggle('on', onBreak);
  $('breakLabel').textContent = onBreak ? 'I’m back' : 'Break';
  $('breakBtn').title = onBreak ? 'End your break: count down 3-2-1 and play' : 'CR break: pause for both of you';
}

// ---- Who paused, played or jumped, in the chat ----
// e.g. "sapi paused at 12:34".
let lastPlayback = null; // { who, el, at }
function playbackLine(who, action, time) {
  if (typeof time !== 'number' || !Number.isFinite(time)) return;
  const at = clock(time);
  const text =
    action === 'pause'
      ? `${who} paused at ${at}`
      : action === 'play'
        ? `${who} pressed play at ${at}`
        : `${who} jumped to ${at}`;
  const log = $('log');

  // Quick repeated jumps by the same person (scrubbing) update one line; pause and play always get their own.
  if (
    action === 'seeked' &&
    lastPlayback?.action === 'seeked' &&
    lastPlayback.who === who &&
    Date.now() - lastPlayback.at < 4000 &&
    lastPlayback.el === log.lastElementChild
  ) {
    lastPlayback.el.textContent = text;
    lastPlayback.at = Date.now();
    return;
  }
  addChat('', text, 'system');
  log.lastElementChild.classList.add('playback');
  lastPlayback = { who, action, el: log.lastElementChild, at: Date.now() };
}

// ---- Chat ----
// History lives in the background script, so closing the sidebar doesn't lose it.
const seenChat = new Set();
ask({ type: 'history' }, (history = []) => {
  const live = [...$('log').children]; // anything that arrived while history was loading
  for (const m of history) {
    if (m.id && seenChat.has(m.id)) continue;
    if (m.id) seenChat.add(m.id);
    addChat(m.name, m.text, m.mine ? 'me' : 'them', m.avatar, m.vt, $('log'), m.guide, m.guess);
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

function sendChat(text, extra = {}) {
  const id = crypto.randomUUID();
  const vt = showTime();
  seenChat.add(id);
  send({ type: 'chat', id, name: myName(), avatar: me.avatar, text, vt, ...extra });
  addChat(myName(), text, 'me', me.avatar, vt, $('log'), extra.guide, extra.guess);
}

// Current position in the show (from the show's tab), for stamping chat messages.
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
  return (
    /\p{Extended_Pictographic}/u.test(text) &&
    !/[0-9#*]/.test(text) &&
    /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Emoji_Component}|‍|️|\s)+$/u.test(text) &&
    [...new Intl.Segmenter().segment(text.replace(/\s/g, ''))].length <= 8
  );
}

// `into` = which list (the live chat, or a past party being read); past parties' timestamps aren't clickable.
function addChat(name, text, kind, avatar, vt, into = $('log'), guide = null, guess = null) {
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
    if (isEmojiOnly(text || '') && !guide && !guess) bubble.classList.add('big');
    if (guess?.id) {
      // A "Who did it?" guess: sealed until you both reveal.
      bubble.classList.add('guess-card');
      bubble.dataset.guess = guess.id;
      bubble.append(who);
      drawGuessCard(bubble);
    } else if (guide?.id) {
      // A shared watch guide shows as a card with an Open button.
      bubble.classList.add('card-msg');
      const label = document.createElement('span');
      label.className = 'gc-label';
      label.textContent = 'Watch guide';
      const title = document.createElement('b');
      title.className = 'gc-title';
      title.textContent = guide.topic ? `${guide.show} · ${guide.topic}` : guide.show;
      const meta = document.createElement('span');
      meta.className = 'gc-meta';
      meta.textContent = `${guide.count} to watch`;
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'gc-open';
      open.textContent = 'Open guide';
      open.onclick = () => openGuideFromChat(guide.id);
      bubble.append(who, label, title, meta, open);
    } else {
      bubble.append(who, document.createTextNode(text || ''));
    }

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
  if (on) showBest(false);
  if (on) $('settings').open = false; // one at a time: Past parties or Settings
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
    $('historyClear').hidden = !sessions.some((x) => x.count > 1);
    $('sessions').replaceChildren(
      ...sessions.filter((x) => x.count > 1).map((x) => {
        const b = document.createElement('button');
        b.className = 'session';
        b.type = 'button';
        const title = document.createElement('span');
        title.className = 's-title';
        const shows = [...new Set((x.shows || []).map(inviteTitle).filter(Boolean))];
        title.textContent = shows.length ? shows.join(' · ') : 'Watch party';
        const meta = document.createElement('span');
        meta.className = 's-meta';
        meta.textContent = `${partyDate(x.endedAt)} · ${x.count} message${x.count === 1 ? '' : 's'}`;
        b.append(title, meta);
        b.onclick = () => readSession(x.id);
        return b;
      }),
    );
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

// ---- Best episodes (from Reddit) ----
// Reads what Reddit says about the show (reddit.js) and ranks the episodes people name most.
function showBest(on) {
  if (on) showHistory(false);
  document.body.classList.toggle('show-best', on);
  $('bestView').hidden = !on;
  renderWelcome();
  if (!on) return;
  const w = status.watch;
  const name = w ? inviteTitle(w.showTitle || w.title) : ''; // just the show: "The Mentalist"
  if (name && name !== $('bestQuery').dataset.for) {
    $('bestQuery').value = name;
    $('bestQuery').dataset.for = name;
    if (episodesMode === 'best') askReddit();
  } else if (!name) {
    $('bestQuery').focus();
  }
}
$('bestBtn').onclick = () => showBest($('bestView').hidden);
$('bestBack').onclick = () => showBest(false);
$('bestForm').onsubmit = (e) => {
  e.preventDefault();
  if (episodesMode === 'guide') makeGuide();
  else askReddit();
};

// Best (Reddit's favorites) or Watch guide (the episodes you need, maybe for one story).
let episodesMode = 'best';
function setEpisodesMode(mode) {
  if (mode === episodesMode) return;
  episodesMode = mode;
  $('modeBest').setAttribute('aria-selected', String(mode === 'best'));
  $('modeGuide').setAttribute('aria-selected', String(mode === 'guide'));
  $('modeTonight').setAttribute('aria-selected', String(mode === 'tonight'));
  $('bestForm').hidden = mode === 'tonight';
  $('guideFields').hidden = mode !== 'guide';
  $('bestSubmit').textContent = mode === 'guide' ? 'Make guide' : 'Ask Reddit';
  bestRun += 1; // drop whatever the other tab was loading
  $('bestResults').replaceChildren();
  if (mode === 'tonight') {
    loadTonight();
    renderTonight();
  } else if (mode === 'guide') {
    if (openGuide) renderGuide(openGuide);
    else listGuides();
  } else if ($('bestQuery').value.trim()) {
    askReddit();
  }
}
$('modeBest').onclick = () => setEpisodesMode('best');
$('modeGuide').onclick = () => setEpisodesMode('guide');
$('modeTonight').onclick = () => setEpisodesMode('tonight');
// ---- Tonight: swipe to match ----
// One of you deals a deck; you each swipe on your own; a show you both say yes to is a match. The
// background keeps the deck and both sides' answers (theirs are only used to find matches).
const X_ICON = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>';
const HEART_ICON = '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>';
const GENRES = ['Any', 'Crime', 'Drama', 'Comedy', 'Thriller', 'Mystery', 'Romance', 'Science-Fiction', 'Fantasy', 'Action', 'Horror', 'Anime', 'Family'];
// Where it streams: TVmaze's web channel (or network, for HBO) names.
const PLATFORMS = [
  ['Any', 'Any platform', null],
  ['Netflix', 'Netflix', /netflix/i],
  ['Prime Video', 'Prime Video', /prime video|amazon/i],
  ['Disney+', 'Disney+', /disney\+/i],
  ['Max', 'Max / HBO', /^(max|hbo|hbo max)$/i],
  ['Hulu', 'Hulu', /hulu/i],
  ['Apple TV+', 'Apple TV+', /apple tv/i],
  ['Paramount+', 'Paramount+', /paramount\+/i],
  ['Peacock', 'Peacock', /peacock/i],
  ['Crunchyroll', 'Crunchyroll', /crunchyroll/i],
];
let tonight = null; // the deck from the background
let tonightSeenMatches = new Set();
let dealing = false;
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids);
  return n;
};
function loadTonight() {
  ask({ type: 'match-get' }, (m) => {
    tonight = m || null;
    if (episodesMode === 'tonight' && !$('bestView').hidden) renderTonight();
  });
}
// Where to watch a TVmaze show: a search on its service, or a web search.
function watchUrl(show) {
  const where = show.webChannel?.name || show.network?.name || '';
  const q = encodeURIComponent(show.name);
  const by = [
    [/netflix/i, `https://www.netflix.com/search?q=${q}`],
    [/prime|amazon/i, `https://www.primevideo.com/search/ref=atv_sr_sug_sc?phrase=${q}`],
    [/\bmax\b|hbo/i, `https://play.max.com/search?q=${q}`],
    [/disney/i, `https://www.disneyplus.com/search?q=${q}`],
    [/hulu/i, `https://www.hulu.com/search?q=${q}`],
    [/apple/i, `https://tv.apple.com/search?term=${q}`],
    [/crunchyroll/i, `https://www.crunchyroll.com/search?q=${q}`],
    [/youtube/i, `https://www.youtube.com/results?search_query=${q}`],
  ].find(([re]) => re.test(where));
  return { where, url: by ? by[1] : `https://www.google.com/search?q=${encodeURIComponent(`watch ${show.name} online`)}` };
}
const tvCard = (s) => {
  const { where, url } = watchUrl(s);
  return {
    id: `tv:${s.id}`, kind: 'show', title: s.name,
    sub: [s.premiered?.slice(0, 4), where, (s.genres || []).slice(0, 2).join(', ')].filter(Boolean).join(' · '),
    summary: String(s.summary || '').replace(/<[^>]+>/g, '').trim().slice(0, 260),
    image: String(s.image?.medium || '').replace(/^http:/, 'https:'), url, where,
  };
};
async function dealDeck(genre, platform = 'Any') {
  const onPlatform = PLATFORMS.find(([v]) => v === platform)?.[2];
  const cards = [];
  // 1. Carry on with what you're watching: each saved guide's next episode.
  const saved = (await askP({ type: 'guides' })) || [];
  for (const x of platform === 'Any' ? saved.slice(0, 4) : []) {
    const g = await askP({ type: 'guide-get', id: x.id });
    const next = g?.episodes.find((e) => !isDone(g, e.key));
    if (!next) continue;
    let image = /^https:\/\/static\.tvmaze\.com\//.test(g.art?.poster || '') ? g.art.poster : '';
    let url = '';
    try {
      const r = await fetch(`https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(g.show)}`);
      const s = r.ok ? await r.json() : null;
      if (s) {
        image ||= String(s.image?.medium || '').replace(/^http:/, 'https:');
        url = watchUrl(s).url;
      }
    } catch {}
    cards.push({ id: `guide:${g.id}`, kind: 'continue', title: g.topic ? `${g.show} · ${g.topic}` : g.show,
      sub: `Up next: ${next.kind ? next.title : `${next.label}${next.title ? ` · ${next.title}` : ''}`}`, summary: '', image, url: url || (await guidePageLink({ ...g, saved: true })), where: '' });
  }
  // 2. Well-liked shows from TVmaze in that genre (a few pages of its catalogue, the most-watched first).
  // One platform is a smaller slice of the catalogue, so it looks through more pages.
  const pages = new Set();
  while (pages.size < (onPlatform ? 12 : 4)) pages.add(Math.floor(Math.random() * 300));
  const shows = (await Promise.all([...pages].map((n) => fetch(`https://api.tvmaze.com/shows?page=${n}`).then((r) => (r.ok ? r.json() : [])).catch(() => [])))).flat();
  const picks = shows
    .filter((s) => s.image?.medium && (s.rating?.average || 0) >= 7 && (s.weight || 0) >= (onPlatform ? 60 : 70) && (genre === 'Any' || (s.genres || []).includes(genre)))
    .filter((s) => !onPlatform || onPlatform.test(s.webChannel?.name || s.network?.name || ''))
    .sort((a, b) => (b.weight || 0) - (a.weight || 0) || (b.rating?.average || 0) - (a.rating?.average || 0))
    .slice(0, 30);
  for (let i = picks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [picks[i], picks[j]] = [picks[j], picks[i]];
  }
  cards.push(...picks.slice(0, Math.max(0, 16 - cards.length)).map(tvCard));
  return cards;
}

function renderTonight() {
  const out = [];
  const together = status.connected && status.peers > 1;
  const m = tonight;
  const them = peer?.name || 'They';
  const intro = (text, pose = 'sit') => {
    const box = el('div', { className: 'tn-intro' });
    box.innerHTML = Bantay.svg(pose, { coat: bantayCoat }); // fixed markup
    box.append(el('span', { textContent: text }));
    return box;
  };
  if (!m) {
    out.push(intro(together
      ? 'Can’t decide? Deal a deck: you each swipe on your own, and a show you both say yes to is a match.'
      : 'Start a party first. Then deal a deck and you each swipe; a show you both like is a match.'));
    const genre = el('select', { id: 'tnGenre' });
    genre.append(...GENRES.map((g) => new Option(g === 'Any' ? 'Any genre' : g.replace('Science-Fiction', 'Sci-fi'), g)));
    const platform = el('select', { id: 'tnPlatform' });
    platform.append(...PLATFORMS.map(([v, label]) => new Option(label, v)));
    const deal = el('button', { type: 'button', className: 'primary wide', textContent: dealing ? 'Dealing…' : 'Deal a deck', disabled: !together || dealing });
    deal.onclick = async () => {
      dealing = true;
      renderTonight();
      const cards = await dealDeck(genre.value, platform.value).catch(() => []);
      dealing = false;
      if (!cards.length) {
        renderTonight();
        $('bestResults').append(note('Couldn’t find shows just now. Try another genre or platform.'));
        return;
      }
      ask({ type: 'match-start', cards, by: myName() }, (deck) => {
        tonight = deck;
        renderTonight();
      });
    };
    out.push(el('div', { className: 'tn-row' }, genre, platform), deal);
    $('bestResults').replaceChildren(el('div', { className: 'tn' }, ...out));
    return;
  }
  const matches = m.cards.filter((c) => m.mine[c.id] && m.theirs[c.id]);
  const next = m.cards.find((c) => m.mine[c.id] === undefined);
  const theirCount = Object.keys(m.theirs).length;
  // A new match: celebrate it.
  const fresh = matches.find((c) => !tonightSeenMatches.has(`${m.id}|${c.id}`));
  if (fresh) {
    tonightSeenMatches.add(`${m.id}|${fresh.id}`);
    const box = el('div', { className: 'tn-match' });
    box.innerHTML = Bantay.svg('party', { coat: bantayCoat }); // fixed markup
    const go = el('button', { type: 'button', className: 'primary', textContent: fresh.where ? `Watch it on ${fresh.where}` : 'Watch it' });
    go.onclick = () => fresh.url && ask({ type: 'follow', url: fresh.url }, showStatus);
    box.append(el('b', { textContent: 'It’s a match!' }), el('span', { className: 'tn-sub', textContent: `You and ${them} both picked ${fresh.title}.` }), go);
    out.push(box);
  }
  if (next) {
    const done = m.cards.length - m.cards.filter((c) => m.mine[c.id] === undefined).length;
    out.push(el('div', { className: 'tn-progress' }, el('span', { textContent: `${done + 1} of ${m.cards.length}` }),
      el('span', { textContent: theirCount ? `${them} has swiped ${theirCount}` : `${m.byMe ? 'You' : them} dealt this deck` })));
    const card = el('div', { className: 'tn-card' });
    if (next.image) card.append(el('img', { src: next.image, alt: '' }));
    else card.append(el('div', { className: 'tn-noimg', textContent: next.title }));
    if (next.kind === 'continue') card.append(el('span', { className: 'tn-tag', textContent: 'Keep watching' }));
    card.append(el('span', { className: 'tn-stamp yes', textContent: 'YES' }), el('span', { className: 'tn-stamp no', textContent: 'NOPE' }));
    const body = el('div', { className: 'tn-body' }, el('b', { textContent: next.title }));
    if (next.sub) body.append(el('span', { className: 'tn-sub', textContent: next.sub }));
    if (next.summary) body.append(el('span', { className: 'tn-sum', textContent: next.summary }));
    card.append(body);
    const vote = (yes) => {
      card.style.transform = `translateX(${yes ? 120 : -120}%) rotate(${yes ? 14 : -14}deg)`;
      card.style.opacity = '0';
      setTimeout(() => ask({ type: 'match-vote', card: next.id, yes }), 180);
    };
    // Drag it left or right (or use the buttons).
    let startX = null;
    card.onpointerdown = (e) => {
      startX = e.clientX;
      card.setPointerCapture(e.pointerId);
      card.classList.add('dragging');
    };
    card.onpointermove = (e) => {
      if (startX == null) return;
      const dx = e.clientX - startX;
      card.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
      card.querySelector('.tn-stamp.yes').style.opacity = String(Math.max(0, Math.min(1, dx / 90)));
      card.querySelector('.tn-stamp.no').style.opacity = String(Math.max(0, Math.min(1, -dx / 90)));
    };
    card.onpointerup = (e) => {
      if (startX == null) return;
      const dx = e.clientX - startX;
      startX = null;
      card.classList.remove('dragging');
      if (Math.abs(dx) > 90) return vote(dx > 0);
      card.style.transform = '';
      card.querySelectorAll('.tn-stamp').forEach((s) => (s.style.opacity = '0'));
    };
    out.push(card);
    const no = el('button', { type: 'button', className: 'no' });
    no.innerHTML = `${X_ICON}<span>Nope</span>`; // fixed markup
    no.onclick = () => vote(false);
    const yes = el('button', { type: 'button', className: 'yes' });
    yes.innerHTML = `${HEART_ICON}<span>Yes</span>`; // fixed markup
    yes.onclick = () => vote(true);
    out.push(el('div', { className: 'tn-votes' }, no, yes));
  } else {
    // Done swiping: the matches, or the closest picks while you wait for them.
    const theirsDone = m.cards.every((c) => m.theirs[c.id] !== undefined);
    if (!matches.length) {
      out.push(intro(theirsDone ? 'No match this round. These got a yes from one of you:' : `You’re done. Waiting for ${them} to finish swiping…`, theirsDone ? 'tilt' : 'lying'));
    } else {
      out.push(el('div', { className: 'gt-sub', textContent: matches.length === 1 ? 'Your match' : 'Your matches' }));
    }
    const shown = matches.length ? matches : theirsDone ? m.cards.filter((c) => m.mine[c.id] || m.theirs[c.id]).slice(0, 6) : [];
    const list = el('div', { className: 'tn-list' });
    for (const c of shown) {
      const go = el('button', { type: 'button', className: 'primary', textContent: 'Watch' });
      go.onclick = () => c.url && ask({ type: 'follow', url: c.url }, showStatus);
      list.append(el('div', { className: 'tn-item' }, ...(c.image ? [el('img', { src: c.image, alt: '' })] : []), el('span', {}, el('b', { textContent: c.title }), c.sub || ''), go));
    }
    if (shown.length) out.push(list);
  }
  const again = el('button', { type: 'button', textContent: 'New deck' });
  again.onclick = () => ask({ type: 'match-end' }, () => {
    tonight = null;
    renderTonight();
  });
  out.push(el('div', { className: 'tn-row' }, again));
  $('bestResults').replaceChildren(el('div', { className: 'tn' }, ...out));
}

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

// ---- Watch guide ----
// Saved guides are kept, show in the other person's list too, and share ticks; unsaved ticks last until you leave.
let openGuide = null; // the guide on screen: { id, show, topic, episodes, threads, done, saved, problems }
const guideId = (show, topic) => `${norm(show)}|${norm(topic)}`;
const askP = (msg) => new Promise((r) => ask(msg, r));
const isDone = (g, key) => !!g.done?.[key]?.v;

const OPEN_ICON =
  '<svg viewBox="0 0 24 24"><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" /></svg>';
async function listGuides() {
  openGuide = null;
  const run = ++bestRun;
  const list = (await askP({ type: 'guides' })) || [];
  if (run !== bestRun || episodesMode !== 'guide') return;
  if (!list.length) {
    const empty = note(
      'Make a guide for a show or a franchise (and a story or saga, if you like). Saved guides show up here for both of you.',
    );
    empty.classList.add('g-empty');
    empty.insertAdjacentHTML('afterbegin', Bantay.svg('lying', { coat: bantayCoat })); // fixed markup
    $('bestResults').replaceChildren(empty);
    return;
  }
  const h = document.createElement('h2');
  h.className = 'g-saved-h';
  h.textContent = 'Saved guides';
  $('bestResults').replaceChildren(
    h,
    ...list.map((x) => {
      const row = document.createElement('div');
      row.className = 'g-saved';
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'g-saved-open';
      const title = document.createElement('span');
      title.className = 't-title';
      title.textContent = x.topic ? `${x.show} · ${x.topic}` : x.show;
      const meta = document.createElement('span');
      meta.className = 't-meta';
      meta.textContent = `${x.watched} of ${x.count} watched · saved by ${x.by === myName() ? 'you' : x.by || 'them'}`;
      open.append(title, meta);
      open.onclick = () => showGuide(x.id);
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'i-remove';
      del.title = 'Remove from your saved guides';
      del.setAttribute('aria-label', 'Remove');
      del.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>'; // fixed markup
      del.onclick = () => ask({ type: 'guide-delete', id: x.id }, listGuides);

      // Open it as a page in a new tab (the same link works on any device).
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'i-remove g-link';
      link.title = 'Open this guide as a page';
      link.setAttribute('aria-label', 'Open as a page');
      link.innerHTML = OPEN_ICON; // fixed markup
      link.onclick = async () => {
        const g = await askP({ type: 'guide-get', id: x.id });
        if (g) chrome.tabs.create({ url: await guidePageLink({ ...g, saved: true }) });
      };
      row.append(open, link, del);
      return row;
    }),
  );
}

async function showGuide(id) {
  const g = await askP({ type: 'guide-get', id });
  if (!g) return listGuides();
  $('bestQuery').value = g.show;
  $('guideTopic').value = g.topic || '';
  $('guideLink').value = '';
  showLinkRow(false);
  openGuide = { ...g, saved: true, problems: [] };
  renderGuide(openGuide, true);
}

// From a guide card in chat: open the Episodes view on that guide.
function openGuideFromChat(id) {
  setEpisodesMode('guide');
  showBest(true);
  showGuide(id);
}

async function makeGuide() {
  const show = $('bestQuery').value.trim();
  if (!show) return $('bestQuery').focus();
  const run = ++bestRun;
  $('bestResults').replaceChildren(note('Reading guides…'));
  let g;
  try {
    sortGuideFields();
    g = await Reddit.watchGuide(show, $('guideTopic').value, $('guideLink').value);
  } catch {
    if (run === bestRun)
      $('bestResults').replaceChildren(note('Couldn’t make a guide just now. Try again in a moment.'));
    return;
  }
  if (run !== bestRun) return;
  const id = guideId(show, g.topic);
  const saved = await askP({ type: 'guide-get', id });
  openGuide = { ...g, id, by: myName(), at: Date.now(), done: saved?.done || {}, saved: !!saved };
  renderGuide(openGuide, true);
}

// Topic and guide link are easy to mix up: a link typed as the topic moves to the link box, and vice versa.
const looksLikeLink = (v) => /^\s*(https?:\/\/|www\.|(old\.)?reddit\.com\/|redd\.it\/)/i.test(v);
function showLinkRow(on) {
  $('guideLinkRow').hidden = !on;
  $('guideLinkToggle').hidden = on;
}
function sortGuideFields() {
  const topic = $('guideTopic').value.trim();
  const link = $('guideLink').value.trim();
  if (looksLikeLink(topic)) {
    $('guideLink').value = topic;
    $('guideTopic').value = '';
    showLinkRow(true);
  } else if (link && !looksLikeLink(link)) {
    $('guideTopic').value = topic ? `${topic}, ${link}` : link;
    $('guideLink').value = '';
  }
}
$('guideLinkToggle').onclick = () => {
  showLinkRow(true);
  $('guideLink').focus();
};
$('guideTopic').addEventListener('input', () => looksLikeLink($('guideTopic').value) && sortGuideFields());
$('guideLink').addEventListener('change', sortGuideFields);

// Long text cut at a word, with an ellipsis.
const short = (text, n) => {
  const t = String(text || '').trim();
  return t.length <= n ? t : `${t.slice(0, n).replace(/\s+\S*$/, '')}…`;
};

// sinehan.live/guide#g=…: the guide deflated and base64url'd into the link, plus a live-tick channel
// when it's saved and you're in its party.
async function guidePageLink(g) {
  // Keys only, so the link stays short (the page looks up titles and details): a show as "1.1 1.11 2.8",
  // a franchise as titles prefixed F/S/X (film/series/short); ticked ones as their positions.
  const series = g.episodes.every((e) => /^S\d+E\d+$/.test(e.key));
  const data = {
    v: 2,
    s: g.show,
    t: g.topic || '',
    k: series
      ? g.episodes.map((e) => e.key.slice(1).replace('E', '.')).join(' ')
      : g.episodes.map((e) => `${{ Films: 'F', Series: 'S' }[e.kind] || 'X'}${e.title}`).join('\n'),
    d: g.episodes
      .map((e, i) => (isDone(g, e.key) ? i : -1))
      .filter((i) => i >= 0)
      .join(' '),
    f: g.wiki || '', // the fan wiki, so the page can link each episode to its page
  };

  // The artwork picked for it (TVmaze pictures only: an uploaded one is too big for a link).
  const tvmaze = (x) =>
    /^https:\/\/static\.tvmaze\.com\/uploads\/images\//.test(x || '')
      ? x.replace('https://static.tvmaze.com/uploads/images/', '')
      : '';
  if (g.art && (tvmaze(g.art.poster) || tvmaze(g.art.background)))
    data.a = { p: tvmaze(g.art.poster), b: tvmaze(g.art.background), at: g.art.at };
  const server = ($('server').value.trim() || DEFAULT_SERVER).replace(/\/+$/, '');

  // Live ticks: a channel hashed from room and guide; the room itself never goes in the link,
  // so the link can't be used to read your party.
  if (g.saved && g.room && g.room === status.room && status.connected) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${g.room}|${g.id}`));
    const channel = [...new Uint8Array(hash)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 24);
    Object.assign(data, { c: channel, w: server });
  }
  const squeezed = new Blob([JSON.stringify(data)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const bytes = new Uint8Array(await new Response(squeezed).arrayBuffer());
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const packed = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${server.replace(/^ws/, 'http')}/guide#g=${packed}`;
}

// Clear: empty the boxes and the results, back to your saved guides.
function updateClear() {
  $('bestClear').hidden = !(
    $('bestQuery').value ||
    $('guideTopic').value ||
    $('guideLink').value ||
    $('bestResults').childElementCount
  );
}
$('bestClear').onclick = () => {
  $('bestQuery').value = $('guideTopic').value = $('guideLink').value = '';
  showLinkRow(false);
  bestRun += 1;
  openGuide = null;
  $('bestResults').replaceChildren();
  if (episodesMode === 'guide') listGuides();
  updateClear();
  $('bestQuery').focus();
};
for (const id of ['bestQuery', 'guideTopic', 'guideLink']) $(id).addEventListener('input', updateClear);
new MutationObserver(updateClear).observe($('bestResults'), { childList: true });

// Add an episode (or, in a franchise, a title) you typed. Looks it up in the show's episode list.
async function addToGuide(g, text) {
  const franchise = g.franchise || g.episodes.some((e) => e.kind);
  let entry = null;
  if (franchise) {
    const title = text.slice(0, 120);
    entry = {
      key: `T:${norm(title).slice(0, 100)}`,
      kind: /\bseries|season\b/i.test(title) ? 'Series' : 'Films',
      season: 0,
      number: 0,
      label: 'Film',
      title,
    };
  } else {
    const guide = await Reddit.episodeGuide(g.show).catch(() => null);
    let key = [...Reddit.episodesIn(text).keys()].find((k) => /^S\d+E\d+$/.test(k));
    if (!key && guide) key = Reddit.titleIn(text, guide) || guide.eps.find((e) => norm(e.name) === norm(text))?.key;

    // "episode 5" in a one-season show
    if (!key && guide?.seasons === 1)
      key = [...Reddit.episodesIn(text).keys()].map((k) => k.replace(/^E/, 'S1E')).find((k) => /^S1E\d+$/.test(k));
    if (!key) return { ok: false, message: 'Couldn’t tell which episode. Try S2E5, or its exact title.' };
    if (guide && !guide.byKey.has(key))
      return { ok: false, message: `${key.replace(/^S(\d+)E(\d+)$/, 'S$1 E$2')} isn’t in ${g.show}’s episode list.` };
    const [, s, n] = key.match(/^S(\d+)E(\d+)$/);
    entry = {
      key,
      season: Number(s),
      number: Number(n),
      label: `S${s} E${n}`,
      title: guide?.byKey.get(key)?.name || '',
    };
  }
  if (g.episodes.some((e) => e.key === entry.key))
    return { ok: false, message: `${entry.title || entry.label} is already in this guide.` };
  const episodes = [
    ...g.episodes,
    {
      ...entry,
      reason: '',
      pasted: false,
      guides: 0,
      comments: 0,
      summary: false,
      fandom: false,
      url: '',
      added: true,
    },
  ].sort((a, b) => (a.kind || b.kind ? 0 : a.season - b.season || a.number - b.number));
  const name = entry.title ? `${entry.label === 'Film' ? '' : `${entry.label} · `}${entry.title}` : entry.label;
  if (g.saved) {
    // Saved: keep it, and it shows up on their side too.
    const { problems, saved, shown, ...rest } = g;
    const stored = await askP({ type: 'guide-save', guide: { ...rest, episodes, at: Date.now() } });
    if (stored && openGuide === g) {
      openGuide = { ...stored, saved: true, problems: g.problems, shown: true };
      renderGuide(openGuide);
    }
  } else {
    g.episodes = episodes;
    renderGuide(g);
  }
  return { ok: true, message: `Added ${name}.` };
}

// Save (and send to them) or, once saved, post its card in chat again.
async function saveGuide(g) {
  const { problems, saved, ...guide } = g;
  const stored = await askP({ type: 'guide-save', guide: { ...guide, at: Date.now() } });
  if (!stored) return;
  openGuide = { ...stored, saved: true, problems: [] };
  postGuideCard(openGuide);
  renderGuide(openGuide);
}
function postGuideCard(g) {
  if (!status.connected) return;
  const name = g.topic ? `${g.show} · ${g.topic}` : g.show;
  sendChat(`shared a watch guide: ${name} (${g.episodes.length} episodes)`, {
    guide: { id: g.id, show: g.show, topic: g.topic, count: g.episodes.length },
  });
}

const CHECK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>';
async function renderGuide(g, fresh = false) {
  if (g !== openGuide) return;
  if (fresh) g.shown = false;
  const done = Object.fromEntries(g.episodes.map((e) => [e.key, isDone(g, e.key)]));
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'g-back';
  back.textContent = 'All saved guides';
  back.onclick = listGuides;
  const out = [back, ...(g.problems || []).map((p) => note(p))];
  if (!g.episodes.length) {
    out.push(
      note(
        g.topic
          ? `No guide or summary mentions “${g.topic}”. Try another name for it, or paste a guide thread.`
          : 'No guides found for this show. Paste a guide thread you trust.',
        {
          label: 'Search Reddit for a guide',
          onClick: () =>
            openTab(
              `https://www.reddit.com/search/?q=${encodeURIComponent(`${g.show} ${g.topic || 'essential'} episodes guide`)}`,
            ),
        },
      ),
    );
    $('bestResults').replaceChildren(...out);
    return;
  }
  const total = g.episodes.length;
  const watched = g.episodes.filter((e) => done[e.key]).length;
  const head = document.createElement('div');
  head.className = 'g-head';
  const count = document.createElement('span');
  count.className = 'g-count';
  const noun = g.franchise || g.episodes.some((e) => e.kind) ? 'title' : 'episode';
  count.textContent = `${g.topic ? `${g.topic} · ` : ''}${total} ${noun}${total === 1 ? '' : 's'} · ${watched} watched`;
  const share = document.createElement('button');
  share.type = 'button';
  if (!g.saved) {
    share.className = 'primary';
    share.textContent = status.connected ? 'Save & share' : 'Save';
    share.title = 'Keep this guide; it also shows up in their saved guides';
    share.onclick = () => {
      share.disabled = true;
      saveGuide(g);
    };
  } else {
    share.textContent = 'Share in chat';
    share.disabled = !status.connected;
    share.onclick = () => {
      postGuideCard(g);
      share.textContent = 'Shared';
      share.disabled = true;
    };
  }

  // A page for any device (phone, tablet, someone without the extension), with the guide inside the link.
  const page = document.createElement('button');
  page.type = 'button';
  page.textContent = 'Page link';
  page.title = 'Copy a link to this guide as a page that opens on any device';
  page.onclick = async () => {
    try {
      await navigator.clipboard.writeText(await guidePageLink(g));
      page.textContent = 'Link copied';
    } catch {
      page.textContent = 'Couldn’t copy';
    }
    setTimeout(() => (page.textContent = 'Page link'), 1800);
  };
  head.append(count, share, page);
  const bar = document.createElement('div');
  bar.className = 'g-bar';
  const fill = document.createElement('i');
  fill.style.width = `${Math.round((watched / total) * 100)}%`;
  bar.append(fill);
  out.push(head, bar);

  const next = g.episodes.find((e) => !done[e.key]);
  let season = null;
  let nextRow = null;
  for (const e of g.episodes) {
    const section = e.kind || `Season ${e.season}`;
    if (section !== season) {
      season = section;
      const h = document.createElement('div');
      h.className = 'g-season';
      h.textContent = section;
      out.push(h);
    }
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `g-ep${done[e.key] ? ' done' : ''}${e === next ? ' next' : ''}`;
    row.setAttribute('aria-pressed', String(!!done[e.key]));
    const box = document.createElement('span');
    box.className = 'g-check';
    box.innerHTML = CHECK; // fixed markup
    const body = document.createElement('span');
    body.className = 'g-body';
    const title = document.createElement('span');
    title.className = 'g-title';
    title.textContent = e.kind ? e.title : e.title ? `${e.label} · ${e.title}` : e.label;
    if (e === next) {
      const n = document.createElement('span');
      n.className = 'g-next';
      n.textContent = 'Up next';
      title.append(n);
    }
    body.append(title);
    if (e.reason) {
      const why = document.createElement('span');
      why.className = 'g-why';
      why.textContent = Reddit.cleanReason(e.reason, e.title); // also tidies older saved guides
      body.append(why);
    }
    const src = document.createElement('span');
    src.className = 'g-src';
    const chip = (text, mine) => {
      const c = document.createElement('span');
      c.textContent = text;
      if (mine) c.className = 'mine';
      src.append(c);
    };
    if (e.pasted) chip('Your thread', true);
    const others = e.guides - (e.pasted ? 1 : 0);
    if (others > 0) chip(`In ${others} guide${others === 1 ? '' : 's'}`);
    if (!e.guides && e.comments) chip(`Suggested in ${e.comments} comments`);
    if (e.summary) chip(`Summary mentions ${e.summaryTerm || g.topic}`);
    if (e.fandom) chip('Fandom wiki');
    if (e.added) chip('Added by you', true);
    body.append(src);
    row.append(box, body);

    // Tick it off as you watch; the list remembers.
    row.onclick = async () => {
      const v = !done[e.key];
      if (g.saved) {
        // Saved: ticks are kept and shared with the other person.
        const stored = await askP({ type: 'guide-tick', id: g.id, key: e.key, v });
        if (stored && openGuide === g) {
          openGuide = { ...stored, saved: true, problems: g.problems, shown: true };
          renderGuide(openGuide);
        }
      } else {
        g.done = { ...g.done, [e.key]: { v, at: Date.now() } };
        renderGuide(g);
      }
    };
    out.push(row);
    if (e === next) nextRow = row;
  }

  // Add your own: "S2E5", "2x05", "season 2 episode 5", or its title (a film or series in a franchise).
  const add = document.createElement('form');
  add.className = 'g-add';
  const addInput = Object.assign(document.createElement('input'), {
    id: 'guideAdd',
    maxLength: 100,
    autocomplete: 'off',
    placeholder:
      g.franchise || g.episodes.some((e) => e.kind)
        ? 'Add a film or series by its title'
        : 'Add an episode: S2E5, 2x05 or its title',
  });
  const addBtn = Object.assign(document.createElement('button'), { type: 'submit', textContent: 'Add' });
  const addNote = Object.assign(document.createElement('p'), { className: 'g-add-note' });
  addNote.hidden = true;
  add.append(addInput, addBtn, addNote);
  add.onsubmit = async (ev) => {
    ev.preventDefault();
    const text = addInput.value.trim();
    if (!text) return;
    addBtn.disabled = true;
    const result = await addToGuide(g, text);
    addBtn.disabled = false;
    if (result.ok) addInput.value = '';
    addNote.textContent = result.message;
    addNote.hidden = false;
  };
  out.push(add);

  if (g.threads.length) {
    const box = document.createElement('div');
    box.className = 'b-threads';
    const h = document.createElement('h2');
    h.textContent = 'Guides used';
    box.append(h);
    for (const t of g.threads) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'thread';
      const title = document.createElement('span');
      title.className = 't-title';
      title.textContent = t.title;
      const meta = document.createElement('span');
      meta.className = 't-meta';
      meta.textContent = `${t.pasted ? 'Your thread · ' : ''}${t.sub}${t.upvotes ? ` · ${shortNum(t.upvotes)} upvotes` : ''}`;
      b.append(title, meta);
      b.onclick = () => openTab(t.url);
      box.append(b);
    }
    out.push(box);
  }
  const scroll = $('bestResults').scrollTop;
  $('bestResults').replaceChildren(...out);

  // First time showing this guide: jump to what's next. Re-renders (ticking) keep your place.
  if (g.shown) $('bestResults').scrollTop = scroll;
  else nextRow?.scrollIntoView({ block: 'center' });
  g.shown = true;
}

// Tab titles carry the site's name and notification counts; keep just the show's name.
function tidyTitle(title) {
  return String(title || '')
    .replace(/^\(\d+\)\s*/, '')
    .replace(
      /\s*[|\-–—]\s*(YouTube|Netflix|Prime Video|Amazon\.com|Max|HBO Max|Crunchyroll|Disney\+|Hulu|Facebook)\b.*$/i,
      '',
    )
    .replace(/:?\s*\b(Season|S)\s*\d+.*$/i, '') // "Show: Season 2 Episode 3" → "Show"
    .trim();
}

// 1234 → "1.2k"
function shortNum(n) {
  n = Number(n) || 0;
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '')}k` : String(n);
}

function note(text, button) {
  const el = document.createElement('div');
  el.className = 'b-note';
  el.textContent = text;
  if (button) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = button.label;
    b.onclick = button.onClick;
    el.append(document.createElement('br'), b);
  }
  return el;
}
const openTab = (url) => chrome.tabs.create({ url });

let bestRun = 0;
async function askReddit() {
  const show = $('bestQuery').value.trim();
  if (!show) return;
  const run = ++bestRun;
  $('bestResults').replaceChildren(note('Reading Reddit…'));
  let r;
  try {
    r = await Reddit.bestEpisodes(show);
  } catch {
    if (run !== bestRun) return;
    $('bestResults').replaceChildren(
      note(
        'Reddit didn’t answer. It sometimes turns away requests unless you’re signed in to reddit.com in this browser.',
        { label: 'Open the search on Reddit', onClick: () => openTab(Reddit.searchUrl(show)) },
      ),
    );
    return;
  }
  if (run !== bestRun) return;
  const out = [];
  if (r.episodes.length) {
    r.episodes.forEach((ep, i) => {
      const row = document.createElement('div');
      row.className = 'ep';
      const rankEl = document.createElement('span');
      rankEl.className = 'e-rank';
      rankEl.textContent = i + 1;
      const body = document.createElement('div');
      body.className = 'e-body';
      const head = document.createElement('div');
      head.className = 'e-head';
      const labelEl = document.createElement('span');
      labelEl.className = 'e-label';
      labelEl.textContent = ep.title ? `${ep.label} · ${ep.title}` : ep.label;
      const count = document.createElement('span');
      count.className = 'e-count';
      count.textContent =
        `${ep.mentions} mention${ep.mentions === 1 ? '' : 's'} · ${shortNum(ep.upvotes)} upvotes` +
        (ep.described
          ? ` · ${ep.described === ep.mentions ? 'matched from what people describe' : `${ep.described} matched from descriptions`}`
          : '');
      head.append(labelEl, count);
      const quote = document.createElement('span');
      quote.className = 'e-quote';
      quote.textContent = ep.quoteUpvotes ? `${ep.quote} (${shortNum(ep.quoteUpvotes)} upvotes)` : ep.quote;
      const actions = document.createElement('div');
      actions.className = 'e-actions';
      const read = document.createElement('button');
      read.type = 'button';
      read.textContent = 'Read on Reddit';
      read.onclick = () => openTab(ep.url);
      const share = document.createElement('button');
      share.type = 'button';
      share.textContent = 'Share in chat';
      share.disabled = !status.connected;
      share.onclick = () => {
        sendChat(
          `Reddit’s pick for ${r.show}: ${ep.label}${ep.title ? ` “${ep.title}”` : ''} (${shortNum(ep.upvotes)} upvotes)`,
        );
        share.textContent = 'Shared';
        share.disabled = true;
      };
      actions.append(read, share);
      body.append(head, quote, actions);
      row.append(rankEl, body);
      out.push(row);
    });
  } else {
    out.push(
      note(
        r.threads.length
          ? 'Nobody named specific episodes. These threads talk about it:'
          : 'Reddit didn’t have threads about this. Try the show’s exact name.',
        r.threads.length ? null : { label: 'Open the search on Reddit', onClick: () => openTab(r.searchUrl) },
      ),
    );
  }
  if (r.threads.length) {
    const box = document.createElement('div');
    box.className = 'b-threads';
    const h = document.createElement('h2');
    h.textContent = 'From these threads';
    box.append(h);
    for (const t of r.threads) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'thread';
      const title = document.createElement('span');
      title.className = 't-title';
      title.textContent = t.title;
      const meta = document.createElement('span');
      meta.className = 't-meta';
      meta.textContent = `${t.sub} · ${shortNum(t.upvotes)} upvotes · ${shortNum(t.comments)} comments`;
      b.append(title, meta);
      b.onclick = () => openTab(t.url);
      box.append(b);
    }
    out.push(box);
  }
  $('bestResults').replaceChildren(...out);
}

// ---- Emoji tray ----
const QUICK_REACTIONS = '😂 😭 😍 😱 🔥 👏 ❤️ 💀';
const EMOJI = {
  Faces:
    '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 😉 😊 😇 🥰 😍 🤩 😘 😚 😋 😛 😜 🤪 😝 🤗 🤭 🤫 🤔 🤨 😐 😑 😶 😏 😒 🙄 😬 😌 😔 😴 🥴 😵 🤯 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😲 😳 🥺 😨 😰 😢 😭 😱 😖 😣 😞 😩 🥱 😤 😡 🤬 😈 💀 🤡 👻 🙈 🙉 🙊',
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
    grid.append(
      emojiButton(e, (pick) => {
        const input = $('msg');
        input.setRangeText(
          pick,
          input.selectionStart ?? input.value.length,
          input.selectionEnd ?? input.value.length,
          'end',
        );
        input.focus();
      }),
    );
  }
  $('emojiGrid').append(title, grid);
}

function closeTrays() {
  $('emojiTray').hidden = true;
  $('emojiBtn').setAttribute('aria-pressed', 'false');
  $('guessTray').hidden = true;
  $('guessBtn').setAttribute('aria-pressed', 'false');
}

// ---- "Who did it?" ----
// The background keeps guesses (sealed until both reveal); chat carries a card that shows their state.
let guesses = new Map(); // id -> guess (theirs have no text until revealed)
let revealWants = {};
let guessPick = null; // { name, image } picked from the cast
const LOCK_ICON = '<svg viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="9.5" rx="2" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></svg>';
function loadGuesses() {
  ask({ type: 'guesses' }, (r) => {
    if (!r) return;
    guesses = new Map(r.list.map((g) => [g.id, g]));
    revealWants = r.wants || {};
    document.querySelectorAll('.guess-card[data-guess]').forEach(drawGuessCard);
  });
}
loadGuesses();
const currentShowName = () => (status.watch ? inviteTitle(status.watch.showTitle || status.watch.title) : '');

function drawGuessCard(card) {
  const g = guesses.get(card.dataset.guess);
  const who = card.querySelector('.who');
  card.replaceChildren(who);
  const top = document.createElement('div');
  top.className = 'gq-top';
  const pose = !g?.revealed ? 'head-tilt' : g.verdict === 'right' ? 'happy' : g.verdict === 'wrong' ? 'tilt' : 'guard';
  top.innerHTML = Bantay.svg(pose === 'happy' || pose === 'tilt' || pose === 'guard' ? 'head' : pose, { coat: bantayCoat }); // fixed markup
  const label = document.createElement('div');
  label.innerHTML = '<div class="gq-label">Who did it?</div>';
  const meta = document.createElement('div');
  meta.className = 'gq-meta';
  meta.textContent = g ? [g.showName, g.ep, typeof g.vt === 'number' ? `at ${clock(g.vt)}` : ''].filter(Boolean).join(' · ') : 'A locked guess';
  label.append(meta);
  top.append(label);
  card.append(top);
  if (!g) return;
  const whoName = g.mine ? 'You' : g.by || 'They';
  if (!g.revealed) {
    const sealed = document.createElement('div');
    sealed.className = 'gq-sealed';
    sealed.innerHTML = LOCK_ICON; // fixed markup
    sealed.append(g.mine ? `Your guess: ${g.text}` : `${whoName} locked a guess`);
    card.append(sealed);
    if (g.mine && g.note) card.append(Object.assign(document.createElement('div'), { className: 'gq-note', textContent: g.note }));
    const actions = document.createElement('div');
    actions.className = 'gq-actions';
    const w = revealWants[g.show] || {};
    const btn = Object.assign(document.createElement('button'), { type: 'button', className: 'go' });
    if (w.me) {
      btn.textContent = `Waiting for ${peer?.name || 'them'} to reveal…`;
      btn.disabled = true;
    } else {
      btn.textContent = w.them ? `${peer?.name || 'They'} wants to reveal. Reveal` : 'Reveal';
      btn.onclick = () => ask({ type: 'guess-reveal', show: g.show });
    }
    actions.append(btn);
    card.append(actions);
    return;
  }
  // Revealed: the name (and face), the note, whether it's unchanged since it was locked, and who was right.
  const reveal = document.createElement('div');
  reveal.className = 'gq-who';
  if (g.image) reveal.append(Object.assign(document.createElement('img'), { src: g.image, alt: '' }));
  const name = document.createElement('div');
  name.append(Object.assign(document.createElement('div'), { className: 'gq-meta', textContent: `${whoName} guessed` }), Object.assign(document.createElement('b'), { textContent: g.text }));
  reveal.append(name);
  card.append(reveal);
  if (g.note) card.append(Object.assign(document.createElement('div'), { className: 'gq-note', textContent: `“${g.note}”` }));
  card.append(Object.assign(document.createElement('div'), { className: 'gq-check', textContent: g.mine || g.verified ? `Locked ${partyDate(g.at)}, unchanged` : 'Couldn’t confirm this one wasn’t changed' }));
  if (!g.verdict) {
    const actions = document.createElement('div');
    actions.className = 'gq-actions';
    for (const [text, right] of [['Right', true], ['Wrong', false]]) {
      const b = Object.assign(document.createElement('button'), { type: 'button', textContent: text, className: right ? 'go' : '' });
      b.onclick = () => ask({ type: 'guess-verdict', id: g.id, right });
      actions.append(b);
    }
    card.append(actions);
  } else {
    card.append(Object.assign(document.createElement('div'), { className: 'gq-verdict', textContent: g.verdict === 'right' ? `${whoName} got it!` : 'Not this time' }));
    // The score for this show so far.
    const score = {};
    for (const x of guesses.values()) if (x.show === g.show && x.verdict === 'right') score[x.mine ? myName() : x.by || 'They'] = (score[x.mine ? myName() : x.by || 'They'] || 0) + 1;
    const line = Object.entries(score).sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n} ${c}`).join(' · ');
    if (line) card.append(Object.assign(document.createElement('div'), { className: 'gq-score', textContent: `${g.showName}: ${line}` }));
  }
}

// The tray: the show's cast to pick from (TVmaze), or any name.
let castFor = '';
// The show from TVmaze (main cast and episode list), and an episode's guest stars: on a procedural, the
// one who did it is nearly always a guest.
let trayShow = null; // { name, show } (TVmaze, with cast and episodes)
const castChip = (c, list) => {
  const nameText = c.character?.name || c.person?.name || '';
  const image = String(c.character?.image?.medium || c.person?.image?.medium || '').replace(/^http:/, 'https:');
  const b = Object.assign(document.createElement('button'), { type: 'button', title: c.person?.name ? `${nameText} (${c.person.name})` : nameText });
  b.setAttribute('aria-pressed', 'false');
  if (image) b.append(Object.assign(document.createElement('img'), { src: image, alt: '', loading: 'lazy' }));
  else b.append(Object.assign(document.createElement('span'), { className: 'gt-noface' }));
  b.append(Object.assign(document.createElement('span'), { textContent: nameText }));
  b.onclick = () => {
    guessPick = { name: nameText, image };
    $('guessName').value = nameText;
    $('guessCast').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  };
  return b;
};
const hint = (t) => Object.assign(document.createElement('p'), { className: 'gt-hint', textContent: t });
async function drawCast() {
  const data = trayShow?.show;
  const main = data?._embedded?.cast || [];
  const epId = $('guessEp').value;
  const parts = [];
  if (epId) {
    parts.push(hint('Loading this episode’s guest stars…'));
    $('guessCast').replaceChildren(...parts);
    let guests = [];
    try {
      const r = await fetch(`https://api.tvmaze.com/episodes/${encodeURIComponent(epId)}/guestcast`);
      guests = r.ok ? await r.json() : [];
    } catch {}
    if ($('guessEp').value !== epId) return;
    parts.length = 0;
    parts.push(Object.assign(document.createElement('div'), { className: 'gt-sub', textContent: 'This episode' }));
    if (guests.length) {
      const grid = Object.assign(document.createElement('div'), { className: 'gt-cast' });
      grid.append(...guests.slice(0, 40).map((c) => castChip(c)));
      parts.push(grid);
    } else {
      parts.push(hint('No guest list for this episode. Type a name below.'));
    }
  }
  if (main.length) {
    parts.push(Object.assign(document.createElement('div'), { className: 'gt-sub', textContent: 'Main cast' }));
    const grid = Object.assign(document.createElement('div'), { className: 'gt-cast' });
    grid.append(...main.slice(0, 24).map((c) => castChip(c)));
    parts.push(grid);
  }
  if (!parts.length) parts.push(hint('No cast list for this one. Type a name below.'));
  $('guessCast').replaceChildren(...parts);
}
$('guessEp').onchange = () => {
  guessPick = null;
  $('guessEp').dataset.picked = $('guessEp').value;
  drawCast();
};
async function openGuessTray() {
  const show = currentShowName();
  $('guessShow').textContent = show || '';
  $('guessErr').hidden = true;
  guessPick = null;
  if (!show) {
    $('guessEp').parentElement.hidden = true;
    $('guessCast').replaceChildren(hint('Open your show first (or click Watch this tab).'));
    return;
  }
  if (trayShow?.name !== show) {
    trayShow = { name: show, show: null };
    $('guessCast').replaceChildren(hint('Loading the cast…'));
    try {
      const r = await fetch(`https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(show)}&embed[]=cast&embed[]=episodes`);
      const data = r.ok ? await r.json() : null;
      if (trayShow.name === show && data && Reddit.sameShow(data.name, show)) trayShow.show = data;
    } catch {}
    if (trayShow.name !== show) return;
  }
  // The episode menu: the one on screen (when the player shows it), or pick one.
  const eps = trayShow.show?._embedded?.episodes || [];
  $('guessEp').parentElement.hidden = !eps.length;
  const on = status.watch?.ep || '';
  $('guessEp').replaceChildren(new Option('Whole show (main cast)', ''), ...eps.map((e) => new Option(`S${e.season} E${e.number} · ${e.name}`, String(e.id))));
  const current = eps.find((e) => `S${e.season}E${e.number}` === on);
  $('guessEp').value = current ? String(current.id) : $('guessEp').dataset.picked || '';
  drawCast();
}
const pickedEpisodeLabel = () => {
  const e = (trayShow?.show?._embedded?.episodes || []).find((x) => String(x.id) === $('guessEp').value);
  return e ? `S${e.season} E${e.number}` : '';
};
$('guessBtn').onclick = () => {
  const opening = $('guessTray').hidden;
  closeTrays();
  if (!opening) return;
  $('guessTray').hidden = false;
  $('guessBtn').setAttribute('aria-pressed', 'true');
  openGuessTray();
};
$('guessName').addEventListener('input', () => {
  if (guessPick && $('guessName').value !== guessPick.name) {
    guessPick = null;
    $('guessCast').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', 'false'));
  }
});
$('guessLock').onclick = () => {
  const showName = currentShowName();
  const text = $('guessName').value.trim();
  const err = (t) => { $('guessErr').textContent = t; $('guessErr').hidden = false; };
  if (!showName) return err('Open your show first.');
  if (!text) return err('Pick someone, or type a name.');
  if (!(status.connected && status.peers > 1)) return err('Your partner needs to be here to see it.');
  ask({ type: 'guess-lock', show: norm(showName), showName, ep: pickedEpisodeLabel(), vt: showTime(), by: myName(), text, note: $('guessNote').value.trim(), image: guessPick?.name === text ? guessPick.image : '' }, (g) => {
    if (!g) return err('Couldn’t lock that one. Try again.');
    guesses.set(g.id, g);
    sendChat('locked a guess', { guess: { id: g.id } });
    $('guessName').value = $('guessNote').value = '';
    closeTrays();
  });
};
$('emojiBtn').onclick = () => {
  const opening = $('emojiTray').hidden;
  closeTrays();
  if (!opening) return;
  $('emojiTray').hidden = false;
  $('emojiBtn').setAttribute('aria-pressed', 'true');
};
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeTrays();
});

// ---- Incoming call ----
// Ringtone: a soft two-note chime every 2s, synthesized (no sound file).
function makeRinger() {
  let ctx = null;
  let timer = null;
  const chime = () => {
    try {
      ctx ||= new AudioContext();
      ctx.resume?.();
      const t = ctx.currentTime;
      [
        [659.25, 0],
        [880, 0.18],
      ].forEach(([freq, delay]) => {
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
    start() {
      if (timer) return;
      chime();
      timer = setInterval(chime, 2000);
    },
    stop() {
      clearInterval(timer);
      timer = null;
    },
    get on() {
      return !!timer;
    },
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
let audioTx = null; // the transceiver our mic goes out on (track swapped without renegotiating)
let theirMicOn = null; // what they told us (null = not in a call / unknown)

// Mic on/off is remembered. Off means the microphone is fully released, which keeps Bluetooth
// headphones in high-quality mode and stops Windows from turning the show down "for a call".
let micOn = false;
chrome.storage.local.get('micOn').then(({ micOn: saved }) => (micOn = saved === true));

// ---- Camera and mic choice ----
let cameraId = '';
let micId = '';
chrome.storage.local.get(['cameraId', 'micId']).then((saved) => {
  cameraId = saved.cameraId || '';
  micId = saved.micId || '';
  listDevices();
});

const videoConstraints = () => ({ width: 640, height: 480, ...(cameraId ? { deviceId: { exact: cameraId } } : {}) });
const audioConstraints = () => ({
  echoCancellation: true,
  noiseSuppression: true,
  ...(micId ? { deviceId: { exact: micId } } : {}),
});

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
    addChat(
      '',
      `Your chosen ${kind === 'video' ? 'camera' : 'mic'} isn’t available, so the default one is used.`,
      'system',
    );
    return navigator.mediaDevices.getUserMedia(constraints());
  }
}

async function listDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);

  // Chrome adds "default"/"communications" stand-ins for audio; "System default" covers those.
  const real = (kind) =>
    devices.filter((d) => d.kind === kind && d.deviceId && !['default', 'communications'].includes(d.deviceId));
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
    if (!pc || !localStream) return track.stop(); // the call ended meanwhile
    track.enabled = old.enabled;
    await pc
      .getSenders()
      .find((s) => s.track === old)
      ?.replaceTrack(track);
    old.stop();
    if (!localStream) return track.stop();
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

// ---- Call audio ----
// Their voice volume, and turning the show down while they talk.
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
    if (!remoteStream) return; // a late track from a call that just ended
    remoteStream.addTrack(track);
    if (track.kind === 'audio') watchTheirVoice();
    $('remote').srcObject = remoteStream;
    $('remote')
      .play()
      .catch(() => {});
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

    // An answer that arrives after we've already settled (a duplicate from a resent offer) has nothing to answer.
    if (description.type === 'answer' && pc.signalingState !== 'have-local-offer') return;
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

// voice = start (or answer) with just the mic; the camera can still be turned on later.
async function turnOnCamera(voice = false) {
  let voiceTrack = null;
  try {
    if (voice) {
      [voiceTrack] = (await getMedia('audio')).getAudioTracks();
      localStream = new MediaStream();
    } else {
      localStream = await getMedia('video');
    }
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

  // Answering a call that started while our sidebar was closed: ask for a fresh offer rather than both
  // sides offering at once; offer ourselves if none comes within 5s.
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
  if (voiceTrack) {
    // A voice call is for talking: the mic starts on.
    localStream.addTrack(voiceTrack);
    await micTransceiver().sender.replaceTrack(voiceTrack);
    micOn = true;
    chrome.storage.local.set({ micOn });
  } else if (micOn) {
    await setMic(true);
  }
  listDevices(); // names are visible now that we have permission
  if (!localStream) return false; // the call ended while it was starting
  send({ type: 'mic', on: !!localStream.getAudioTracks().length });
  if (!localStream.getAudioTracks().length) addChat('', 'Your mic is off. Click the mic button to talk.', 'system');
  render();
  return true;
}

// Reuse an audio slot the other side offered, or add one; either way we can swap the mic in later.
function micTransceiver() {
  if (audioTx && pc.getTransceivers().includes(audioTx)) return audioTx;
  audioTx =
    pc
      .getTransceivers()
      .find((t) => t.receiver.track?.kind === 'audio' && !t.sender.track && t.currentDirection !== 'stopped') ||
    pc.addTransceiver('audio', { direction: 'sendrecv', streams: [localStream] });
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
    if (!pc || !localStream) return track.stop(); // the call ended while the mic was starting
    localStream.addTrack(track);
    await micTransceiver().sender.replaceTrack(track);
  } else if (!on && current) {
    await micTransceiver().sender.replaceTrack(null);
    current.stop(); // releases the microphone itself
    localStream?.removeTrack(current);
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
$('startVoice').onclick = async () => {
  if (await turnOnCamera(true)) addChat('', 'Voice calling. They need the sidebar open to pick up.', 'system');
};
$('join').onclick = () => {
  stopRinging();
  turnOnCamera();
};
$('joinVoice').onclick = () => {
  stopRinging();
  turnOnCamera(true);
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
  if (!track && kind === 'video') return addCamera();
  if (!track) return;
  track.enabled = !track.enabled;
  button.classList.toggle('off', !track.enabled);
  sendCallState();
}

// On a voice call: turn the camera on (it's added to the call, and they see you).
async function addCamera() {
  if (!pc || !localStream) return;
  try {
    const [track] = (await getMedia('video')).getVideoTracks();
    if (!pc || !localStream) return track.stop(); // the call ended while the camera was starting
    localStream.addTrack(track);
    pc.addTrack(track, localStream);
    $('local').srcObject = localStream;
  } catch (e) {
    addChat('', `Couldn’t start your camera: ${e.message || e.name}`, 'system');
  }
  render();
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
  if (msg.type === 'bantay-streak') {
    addChat('', `${msg.days} nights in a row together. Bantay is proud.`, 'system');
    return;
  }
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

  $('start').disabled = $('startVoice').disabled = !bothHere;
  $('join').hidden = $('joinVoice').hidden = !(inCall || incoming) || hasCamera;
  $('decline').hidden = !incoming;
  $('start').hidden = $('startVoice').hidden = inCall || !!incoming;
  const camOn = !!localStream?.getVideoTracks()[0]?.enabled;
  $('cam').classList.toggle('off', hasCamera && !camOn);
  $('cam').title = camOn ? 'Camera on: click to turn it off' : 'Turn your camera on';

  // Not in a call: just the buttons. In a call with no video either way: a short stage.
  const callEl = document.querySelector('.call');
  callEl.classList.toggle('compact', !inCall && !incoming);
  callEl.classList.toggle('voice', inCall && !seeingThem && !camOn);
  $('mic').hidden = $('cam').hidden = !hasCamera;
  $('mic').classList.toggle('off', !localStream?.getAudioTracks().length);
  sendCallState();
  $('mic').title = localStream?.getAudioTracks().length ? 'Mic on: click to turn it off' : 'Mic off: click to talk';
  $('pip').hidden = !seeingThem;
  $('hangup').hidden = !inCall;
  $('local').hidden = !localStream?.getVideoTracks().length;
  $('remoteMic').hidden = !(inCall && seeingThem && theirMicOn === false);

  $('placeholder').hidden = seeingThem;
  $('faces').replaceChildren(avatarEl(me.avatar, 52), ...(peer ? [avatarEl(peer.avatar, 52)] : []));
  $('phText').textContent = incoming
    ? `${incoming.name} is calling…`
    : !status.connected
      ? 'Not in a room yet. Use Invite to start one.'
      : !bothHere
        ? 'Waiting for them to join.'
        : !inCall
          ? 'Camera’s off.'
          : pc.connectionState === 'connected'
            ? 'On a voice call'
            : 'Connecting…';
}
render();
