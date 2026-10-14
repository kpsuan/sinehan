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

function onMessage(msg) {
  if (msg.local) {
    onLocal(msg).catch((e) => console.error('[watch-party] camera hand-off', e));
  } else if (msg.type === 'chat') {
    if (seenChat.has(msg.id)) return;
    seenChat.add(msg.id);
    // `mine` = sent from this browser's fullscreen chat rather than this sidebar.
    addChat(msg.name, msg.text, msg.mine ? 'me' : 'them', msg.avatar);
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
    } else {
      addChat('', `${peer?.name || 'Your person'} left`, 'system');
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
chrome.storage.local.get(['name', 'avatar', 'server', 'room']).then(({ name, avatar, server, room }) => {
  me.name = name || '';
  me.avatar = Number.isInteger(avatar) && avatar < AVATAR_COUNT ? avatar : Math.floor(Math.random() * AVATAR_COUNT);
  chrome.storage.local.set({ avatar: me.avatar });
  $('name').value = me.name;
  $('server').value = server || 'ws://localhost:8080';
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
  button.onclick = () => {
    me.avatar = i;
    chrome.storage.local.set({ avatar: i });
    sendProfile(false);
    renderProfiles();
  };
  $('avatars').append(button);
});

$('connect').onclick = () => {
  const server = $('server').value.trim();
  const room = $('room').value.trim();
  if (server && room) chrome.runtime.sendMessage({ type: 'connect', server, room }, showStatus);
};
$('disconnect').onclick = () => {
  if (pc) endCall('You left');
  $('inviteBox').hidden = true;
  chrome.runtime.sendMessage({ type: 'disconnect' }, showStatus);
};

// Gear icon in the header shows/hides the settings section.
$('settingsBtn').onclick = () => ($('settings').open = !$('settings').open);
$('settings').addEventListener('toggle', () => $('settingsBtn').setAttribute('aria-pressed', String($('settings').open)));

function showStatus(s) {
  if (!s) return;
  const wasConnected = status.connected;
  status = s;
  // An invite link may have connected us to a different room/server — reflect it.
  if (s.room && document.activeElement !== $('room')) $('room').value = s.room;
  if (s.server && document.activeElement !== $('server')) $('server').value = s.server;
  $('status').textContent = !s.room ? 'Not connected'
    : !s.connected ? 'Connecting…'
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
}
const pollStatus = () => chrome.runtime.sendMessage({ type: 'status' }, showStatus);
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
    chrome.runtime.sendMessage({ type: 'connect', server, room }, showStatus);
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const base = server.replace(/^ws/, 'http').replace(/\/+$/, '');
  let link = `${base}/join?room=${encodeURIComponent(room)}`;
  if (tab?.url?.startsWith('http')) link += `&to=${encodeURIComponent(tab.url)}`;

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

function renderProfiles() {
  $('who').replaceChildren(avatarEl(me.avatar, 30), ...(peer ? [avatarEl(peer.avatar, 30)] : []));
  $('names').textContent = peer ? `${myName()} & ${peer.name}` : myName();
  $('myAvatar').replaceChildren(avatarEl(me.avatar, 48));
  [...$('avatars').children].forEach((b, i) => {
    b.classList.toggle('selected', i === me.avatar);
    b.setAttribute('aria-checked', String(i === me.avatar));
  });
  render();
}

// ---- Chat ----
// History is kept by the background script, so closing the sidebar doesn't lose it.
const seenChat = new Set();
chrome.runtime.sendMessage({ type: 'history' }, (history = []) => {
  const live = [...$('log').children]; // anything that arrived while history was loading
  for (const m of history) {
    if (m.id && seenChat.has(m.id)) continue;
    if (m.id) seenChat.add(m.id);
    addChat(m.name, m.text, m.mine ? 'me' : 'them', m.avatar);
  }
  $('log').append(...live);
  $('log').scrollTop = $('log').scrollHeight;
});

function myName() {
  return $('name').value.trim() || 'Me';
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
  seenChat.add(id);
  send({ type: 'chat', id, name: myName(), avatar: me.avatar, text });
  addChat(myName(), text, 'me', me.avatar);
}

// Messages that are only a few emoji (no other text) show big, and float on the other person's video.
function isEmojiOnly(text) {
  return /\p{Extended_Pictographic}/u.test(text) && !/[0-9#*]/.test(text)
    && /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Emoji_Component}|‍|️|\s)+$/u.test(text)
    && [...new Intl.Segmenter().segment(text.replace(/\s/g, ''))].length <= 8;
}

function addChat(name, text, kind, avatar) {
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
    line.append(avatarEl(Number(avatar) || 0), bubble);
  }
  $('log').appendChild(line);
  $('log').scrollTop = $('log').scrollHeight;
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

// ---- Video call ----
// Video goes browser-to-browser over WebRTC; the relay only carries the setup messages.
// Uses the "perfect negotiation" pattern so it doesn't matter who starts or turns on their camera first.
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
let pc = null;
let localStream = null;
let remoteStream = null;
let makingOffer = false;
let ignoreOffer = false;

function signal(data) {
  send({ type: 'rtc', from: myId, name: myName(), ...data });
}

function createPeer() {
  pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  remoteStream = new MediaStream();

  pc.onnegotiationneeded = async () => {
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

async function onSignal({ description, candidate, bye, from, name }) {
  if (bye) {
    if (pc) endCall(`${name || 'They'} hung up`);
    return;
  }
  if (description) {
    if (!pc) {
      if (description.type !== 'offer') return;
      createPeer();
      addChat('', `${name || 'They'} started a video call`, 'system');
    }
    const polite = myId < from;
    const collision = description.type === 'offer' && (makingOffer || pc.signalingState !== 'stable');
    ignoreOffer = !polite && collision;
    if (ignoreOffer) return;
    await pc.setRemoteDescription(description);
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
    localStream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480 },
      audio: { echoCancellation: true, noiseSuppression: true },
    });
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
  if (!pc) createPeer();
  for (const track of localStream.getTracks()) pc.addTrack(track, localStream);
  render();
  return true;
}

function endCall(reason, notify = false) {
  if (notify) signal({ bye: true });
  stopAllRelays();
  if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
  pc?.close();
  pc = null;
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
$('join').onclick = turnOnCamera;
$('hangup').onclick = () => endCall('You hung up', true);

$('mic').onclick = () => toggleTrack('audio', $('mic'));
$('cam').onclick = () => toggleTrack('video', $('cam'));
function toggleTrack(kind, button) {
  const track = localStream?.getTracks().find((t) => t.kind === kind);
  if (!track) return;
  track.enabled = !track.enabled;
  button.classList.toggle('off', !track.enabled);
}

// ---- Camera hand-off to fullscreen tabs ----
// Fullscreen hides this sidebar, so a fullscreen tab asks for her camera and we forward the video
// track to it over a second connection that stays inside this browser (messages marked `local`).
const relays = new Map(); // tab view id -> RTCPeerConnection

async function onLocal(msg) {
  const relay = relays.get(msg.from);
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
  $('join').hidden = !inCall || hasCamera;
  $('mic').hidden = $('cam').hidden = !hasCamera;
  $('pip').hidden = !seeingThem;
  $('hangup').hidden = !inCall;
  $('local').hidden = !hasCamera;

  $('placeholder').hidden = seeingThem;
  $('faces').replaceChildren(avatarEl(me.avatar, 52), ...(peer ? [avatarEl(peer.avatar, 52)] : []));
  $('phText').textContent = !status.connected ? 'Not in a room yet. Use Invite to start one.'
    : !bothHere ? 'Waiting for them to join.'
    : !inCall ? 'Camera’s off.'
    : 'Connecting…';
}
render();
