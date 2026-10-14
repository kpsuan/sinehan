// Watches the page's <video> and mirrors play/pause/seek to/from the other person.
// In fullscreen (where Chrome hides the sidebar) it also shows a chat button and her camera over the video.
const isNetflix = location.hostname.endsWith('netflix.com');
const viewId = crypto.randomUUID(); // identifies this tab/frame to the sidebar for the camera hand-off
let port = null;
let video = null;
// What we just applied from the other side. Local events that match it are our own echo (skip them);
// anything else is a real action by this person and is sent even if it happens right away.
let applied = null; // { paused, time, until }

function connectPort() {
  port = chrome.runtime.connect({ name: 'party' });
  port.onMessage.addListener(onRemote);
  port.onDisconnect.addListener(() => setTimeout(connectPort, 1000));
}
connectPort();

function post(msg) {
  try { port.postMessage(msg); } catch {}
}

setInterval(() => {
  const v = mainVideo();
  if (v && v !== video) attach(v);
}, 1000);

// The biggest visible <video> that has media is the player; sites like Prime Video also keep
// hidden previews/ads around, so "the first <video>" isn't reliable.
function mainVideo() {
  let best = null;
  let bestScore = 0;
  for (const v of document.querySelectorAll('video')) {
    const r = v.getBoundingClientRect();
    const score = r.width * r.height * (v.readyState > 0 ? 2 : 1);
    if (score > bestScore) {
      best = v;
      bestScore = score;
    }
  }
  return best;
}

const VIDEO_EVENTS = ['play', 'pause', 'seeked'];
function onVideoEvent(e) {
  if (e.target !== video) return;
  if (applied && Date.now() < applied.until && video.paused === applied.paused && Math.abs(video.currentTime - applied.time) < 1.5) return;
  applied = null; // a real local action: from here on nothing is an echo of the old remote change
  sendState(e.type);
}

function attach(v) {
  for (const ev of VIDEO_EVENTS) video?.removeEventListener(ev, onVideoEvent);
  video = v;
  for (const ev of VIDEO_EVENTS) v.addEventListener(ev, onVideoEvent);
  // Just opened the show (e.g. from an invite link)? Ask the other side where they are
  // (unless this is an ad's own player taking over; we re-sync when the ad ends).
  if (!detectAd()) post({ type: 'sync-request' });
}

// ---- Invite page (served by the relay at /join) ----
if (window.top === window && document.querySelector('meta[name="watch-party-join"]')) {
  const params = new URLSearchParams(location.search);
  const room = params.get('room');
  const to = params.get('to');
  document.documentElement.dataset.wpReady = '1'; // lets the page swap "install the extension" for the Join button
  document.getElementById('wp-join')?.addEventListener('click', () => {
    const server = location.origin.replace(/^http/, 'ws');
    chrome.runtime.sendMessage({ type: 'join-invite', server, room }, () => {
      if (to && /^https?:\/\//.test(to)) location.href = to;
      else document.getElementById('wp-done')?.removeAttribute('hidden');
    });
  });
}

function sendState(type) {
  if (!video || myAd) return; // never share an ad's play/pause/position
  post({ type, time: video.currentTime, paused: video.paused });
}

function onRemote(msg) {
  if (msg.local) return onLocal(msg);
  if (msg.type === 'chat') {
    const text = String(msg.text || '');
    overlay?.add(msg); // keeps the fullscreen chat current, including what we sent from the sidebar
    if (msg.mine) return;
    // Emoji-only messages float up over the video so they're seen without looking at the chat.
    if (isEmojiOnly(text) && video) {
      floatEmoji(text);
      return;
    }
    if (overlay?.isOpen()) return;
    // The sidebar shows chat, but not when it's closed or hidden by fullscreen — so flash it on the video.
    if (document.fullscreenElement || !msg.panelOpen) {
      toast(`${msg.name}: ${text.length > 60 ? text.slice(0, 60) + '…' : text}`);
    }
    return;
  }
  if (msg.type === 'sync-request') {
    sendState('state');
    return;
  }
  if (msg.type === 'ad') {
    onTheirAd(!!msg.active);
    return;
  }
  if (msg.type === 'peer') {
    const joined = msg.joined ?? msg.count > 1;
    toast(joined ? 'They joined' : 'They left');
    if (!joined) releaseAdHold(); // don't stay paused for someone who left mid-ad
    if (joined) sendState('state'); // bring the newcomer to where we are
    return;
  }
  if (msg.type === 'joined') {
    toast(msg.count > 1 ? 'Connected. You’re both here.' : 'Connected. Waiting for them to join.');
    return;
  }
  if (!video || typeof msg.time !== 'number') return;
  if (myAd) return; // we're in an ad; we'll ask where they are once it ends

  applied = { paused: !!msg.paused, time: msg.time, until: Date.now() + 1500 };
  if (Math.abs(video.currentTime - msg.time) > 1) seek(msg.time);
  if (msg.paused) video.pause();
  else video.play().catch(() => toast('Click the video once so the browser lets it autoplay'));
  if (msg.type !== 'state') toast(msg.paused ? 'Paused' : 'Playing');
}

function seek(seconds) {
  // Setting currentTime directly crashes Netflix's player, so ask its own API (netflix-main.js).
  if (isNetflix) window.postMessage({ source: 'watch-party', seekMs: seconds * 1000 }, '*');
  else video.currentTime = seconds;
}

// ---- Ads ----
// While one of us watches an ad, the other is paused, and nothing from the ad is synced.
// When the ad ends, the person who had it jumps back to where the other one is.
let myAd = false;
let theirAd = false;
let pausedForAd = false;
let adStreak = 0;

setInterval(() => {
  if (!video) return;
  const now = detectAd();
  if (now === myAd) {
    adStreak = 0;
    return;
  }
  if (++adStreak < 2) return; // must hold for ~1s, so a flicker doesn't count
  adStreak = 0;
  myAd = now;
  post({ type: 'ad', active: myAd });
  if (myAd) toast('Ad playing. They’re paused until it’s over.');
  else if (theirAd) holdForAd('Your ad’s done. Waiting for theirs to finish.');
  else {
    pausedForAd = false;
    post({ type: 'sync-request' }); // land back exactly where they are
  }
}, 500);

function onTheirAd(active) {
  theirAd = active;
  if (active) {
    if (!myAd) holdForAd('They’re watching an ad. Paused until it’s over.');
  } else if (pausedForAd && !myAd) {
    releaseAdHold();
    toast('Ad’s over. Back together.');
  }
}

function holdForAd(message) {
  // Only auto-resume later if it was actually playing (don't override someone who'd paused on purpose).
  pausedForAd = !!video && !video.paused;
  if (pausedForAd) {
    applied = { paused: true, time: video.currentTime, until: Date.now() + 1500 };
    video.pause();
  }
  toast(message);
}

function releaseAdHold() {
  theirAd = false;
  if (!pausedForAd || !video) return;
  pausedForAd = false;
  applied = { paused: false, time: video.currentTime, until: Date.now() + 1500 };
  video.play().catch(() => {});
}

// YouTube marks its player while an ad plays. Other services don't have a known marker, so we
// look for the on-screen ad label they all show ("Ad", "Ad 1 of 3", "Ad · 0:15", …) inside the player.
const AD_LABELS = [
  /^(ad|ads|advertisement|sponsored)$/i,
  /^ads?\s*\d+\s*(of|\/)\s*\d+/i,
  /^ads?\s*[·•:|-]?\s*\d{1,2}:\d{2}$/i,
  /^ads?\s*(break|[·•])/i,
  /^your (video|show|program|movie) will (resume|play|begin)/i,
];

function detectAd() {
  if (location.hostname.endsWith('youtube.com')) {
    return !!document.querySelector('#movie_player.ad-showing, #movie_player.ad-interrupting');
  }
  const walker = document.createTreeWalker(playerRoot(), NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue.trim();
    if (!text || text.length > 40 || !AD_LABELS.some((re) => re.test(text))) continue;
    const el = node.parentElement;
    if (el && !el.closest('[data-sinehan]') && el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return true;
  }
  return false;
}

// The player = the largest ancestor of the video that's still about the video's size
// (so we search the player's own overlays, not the rest of the page).
function playerRoot() {
  const rect = video.getBoundingClientRect();
  const area = Math.max(1, rect.width * rect.height);
  let root = video.parentElement || video;
  for (let el = root, i = 0; el.parentElement && i < 10; i++) {
    el = el.parentElement;
    const r = el.getBoundingClientRect();
    if (r.width * r.height > area * 1.6) break;
    root = el;
  }
  return root;
}

// ---- Fullscreen: chat button + her camera ----
let overlay = null;
let camPc = null;

document.addEventListener('fullscreenchange', () => {
  const fs = document.fullscreenElement;
  // Only the frame whose player went fullscreen draws the overlay (and never inside a bare <video>).
  if (fs && video && fs !== video && fs.contains(video)) {
    overlay?.destroy();
    overlay = buildOverlay(fs);
    post({ local: true, type: 'cam-want', from: viewId });
  } else if (overlay) {
    overlay.destroy();
    overlay = null;
    closeCam();
    post({ local: true, type: 'cam-stop', from: viewId });
  }
});

// The sidebar (which runs the call) streams her camera to us over a connection inside this browser.
async function onLocal(msg) {
  if (msg.to && msg.to !== viewId) return;
  if (msg.type === 'cam-available') {
    if (overlay) post({ local: true, type: 'cam-want', from: viewId });
  } else if (msg.type === 'cam-offer') {
    if (!overlay) return;
    closeCam();
    camPc = new RTCPeerConnection();
    camPc.ontrack = ({ track, streams }) => overlay?.setCam(streams[0] || new MediaStream([track]));
    camPc.onicecandidate = ({ candidate }) => {
      if (candidate) post({ local: true, type: 'cam-ice', from: viewId, candidate: candidate.toJSON() });
    };
    await camPc.setRemoteDescription(msg.description);
    await camPc.setLocalDescription();
    post({ local: true, type: 'cam-answer', from: viewId, description: camPc.localDescription.toJSON() });
  } else if (msg.type === 'cam-ice') {
    await camPc?.addIceCandidate(msg.candidate).catch(() => {});
  } else if (msg.type === 'cam-bye') {
    closeCam();
  }
}

function closeCam() {
  camPc?.close();
  camPc = null;
  overlay?.setCam(null);
}

const QUICK_REACTIONS = ['😂', '😭', '😍', '😱', '🔥', '👏', '❤️', '💀'];

function buildOverlay(fsHost) {
  const host = document.createElement('div');
  host.dataset.sinehan = '';
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none;';
  // Shadow DOM so the site's CSS can't touch ours (and vice versa).
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      * { box-sizing: border-box; }
      :host { font: 13px/1.4 ${FONT}; color: #ece6f3; }
      button { font: inherit; color: inherit; cursor: pointer; }
      [hidden] { display: none !important; }
      .cam { position: absolute; top: 20px; right: 20px; width: 240px; aspect-ratio: 4 / 3; border-radius: 10px; overflow: hidden;
        background: #0d0a11; box-shadow: 0 6px 24px rgba(0,0,0,.5); pointer-events: auto; }
      .cam video { width: 100%; height: 100%; object-fit: cover; display: block; }
      .cam .hide { position: absolute; top: 6px; right: 6px; width: 24px; height: 24px; border: 0; border-radius: 50%;
        background: rgba(22,17,28,.7); opacity: 0; transition: opacity .15s; }
      .cam:hover .hide { opacity: 1; }
      .fab { position: absolute; right: 24px; bottom: 96px; width: 44px; height: 44px; border-radius: 50%; border: 1px solid #2c2337;
        background: #1f1827; display: grid; place-items: center; pointer-events: auto; box-shadow: 0 4px 16px rgba(0,0,0,.45); }
      .fab:hover { background: #2a2134; }
      .fab svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
      .badge { position: absolute; top: -3px; right: -3px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px;
        background: #c9b6f2; color: #1b1325; font-size: 11px; font-weight: 700; line-height: 18px; text-align: center; }
      .panel { position: absolute; right: 24px; bottom: 152px; width: 300px; height: min(380px, 60vh); display: flex; flex-direction: column;
        border-radius: 10px; border: 1px solid #2c2337; background: rgba(22,17,28,.94); box-shadow: 0 8px 30px rgba(0,0,0,.5); pointer-events: auto; overflow: hidden; }
      .head { display: flex; justify-content: space-between; align-items: center; padding: 9px 12px; border-bottom: 1px solid #2c2337; font-weight: 600; }
      .head button { border: 0; background: none; color: #978ca6; font-size: 16px; line-height: 1; padding: 2px 4px; }
      .log { flex: 1; overflow-y: auto; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; scrollbar-width: thin; scrollbar-color: #2c2337 transparent; }
      .msg { max-width: 82%; align-self: flex-start; padding: 6px 10px; border-radius: 12px 12px 12px 3px; background: #251d2e; overflow-wrap: anywhere; }
      .msg.me { align-self: flex-end; border-radius: 12px 12px 3px 12px; background: #c9b6f2; color: #1b1325; }
      .msg.big { background: none; font-size: 26px; line-height: 1.15; padding: 0 2px; }
      .who { display: block; font-size: 11px; color: #978ca6; }
      .msg.me .who, .msg.big .who { display: none; }
      .quick { display: flex; justify-content: space-between; padding: 6px 10px; border-top: 1px solid #2c2337; }
      .quick button { border: 0; background: none; font-size: 18px; padding: 2px 4px; border-radius: 6px; }
      .quick button:hover { background: #2c2337; }
      form { display: flex; gap: 6px; padding: 8px 10px; border-top: 1px solid #2c2337; }
      input { flex: 1; min-width: 0; padding: 7px 9px; border-radius: 6px; border: 1px solid #2c2337; background: #1f1827; color: inherit; font: inherit; outline: none; }
      input:focus { border-color: #c9b6f2; }
      form button { border: 0; border-radius: 6px; padding: 0 12px; background: #c9b6f2; color: #1b1325; font-weight: 600; }
    </style>
    <div class="cam" hidden><video autoplay playsinline muted></video><button class="hide" title="Hide camera">✕</button></div>
    <div class="panel" hidden>
      <div class="head">Chat <button class="close" title="Close">✕</button></div>
      <div class="log"></div>
      <div class="quick"></div>
      <form><input maxlength="500" placeholder="Message" autocomplete="off" /><button>Send</button></form>
    </div>
    <button class="fab" title="Chat">
      <svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z" /></svg>
      <span class="badge" hidden></span>
    </button>`;

  const $ = (sel) => root.querySelector(sel);
  const seen = new Set();
  let unread = 0;
  let camHidden = false;
  let loadedHistory = false;

  function add(msg) {
    if (msg.id) {
      if (seen.has(msg.id)) return;
      seen.add(msg.id);
    }
    const el = document.createElement('div');
    const text = String(msg.text || '');
    el.className = `msg${msg.mine ? ' me' : ''}${isEmojiOnly(text) ? ' big' : ''}`;
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = msg.name || '';
    el.append(who, document.createTextNode(text));
    $('.log').append(el);
    $('.log').scrollTop = $('.log').scrollHeight;
    if (!msg.mine && $('.panel').hidden && loadedHistory) {
      unread += 1;
      $('.badge').textContent = unread;
      $('.badge').hidden = false;
    }
  }

  function open() {
    $('.panel').hidden = false;
    unread = 0;
    $('.badge').hidden = true;
    $('input').focus();
  }
  $('.fab').onclick = () => ($('.panel').hidden ? open() : ($('.panel').hidden = true));
  $('.close').onclick = () => ($('.panel').hidden = true);
  $('.hide').onclick = () => {
    camHidden = true;
    $('.cam').hidden = true;
  };

  async function sendChat(text) {
    const { name, avatar } = await chrome.storage.local.get(['name', 'avatar']);
    const msg = { type: 'chat', id: crypto.randomUUID(), name: name || 'Me', avatar, text };
    post(msg);
    add({ ...msg, mine: true });
  }
  $('form').onsubmit = (e) => {
    e.preventDefault();
    const text = $('input').value.trim();
    if (!text) return;
    sendChat(text);
    $('input').value = '';
  };
  for (const emoji of QUICK_REACTIONS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = emoji;
    b.onclick = () => sendChat(emoji);
    $('.quick').append(b);
  }

  // Typing in our chat shouldn't trigger the player's shortcuts (space = pause, f = fullscreen, …).
  const swallow = (e) => {
    if (e.composedPath()[0] === $('input')) e.stopImmediatePropagation();
  };
  const keyEvents = ['keydown', 'keyup', 'keypress'];
  for (const type of keyEvents) {
    host.addEventListener(type, (e) => e.stopPropagation());
    window.addEventListener(type, swallow, true);
  }

  // Recent history so the fullscreen chat isn't empty.
  chrome.runtime.sendMessage({ type: 'history' }, (history = []) => {
    for (const m of history.slice(-60)) add(m);
    loadedHistory = true;
  });

  fsHost.appendChild(host);

  return {
    add,
    isOpen: () => !$('.panel').hidden,
    setCam(stream) {
      $('.cam video').srcObject = stream;
      $('.cam').hidden = !stream || camHidden;
    },
    destroy() {
      for (const type of keyEvents) window.removeEventListener(type, swallow, true);
      host.remove();
    },
  };
}

let toastEl = null;
let toastTimer = null;
function toast(text) {
  if (window.top !== window && !video) return;
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.dataset.sinehan = '';
    toastEl.style.cssText =
      'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483647;padding:8px 12px;border-radius:6px;' +
      'background:#1f1827;border:1px solid #2c2337;border-left:3px solid #c9b6f2;color:#ece6f3;max-width:60vw;' +
      `font:13px/1.4 ${FONT};box-shadow:0 4px 16px rgba(0,0,0,.4);pointer-events:none;transition:opacity .3s`;
  }
  const host = document.fullscreenElement || document.body;
  if (toastEl.parentNode !== host) host.appendChild(toastEl);
  toastEl.textContent = text;
  toastEl.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.style.opacity = '0'), 2500);
}

// Inter for our overlays, under a private name so we never change the site's own fonts.
const FONT = "'WatchPartyInter',system-ui,sans-serif";
try {
  const face = new FontFace('WatchPartyInter', `url(${chrome.runtime.getURL('fonts/inter.woff2')})`, { weight: '100 900' });
  face.load().then(() => document.fonts.add(face)).catch(() => {}); // some sites block extension fonts; system-ui is the fallback
} catch {}

function isEmojiOnly(text) {
  return /\p{Extended_Pictographic}/u.test(text) && !/[0-9#*]/.test(text)
    && /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Emoji_Component}|‍|️|\s)+$/u.test(text)
    && [...new Intl.Segmenter().segment(text.replace(/\s/g, ''))].length <= 8;
}

// Emoji drift up from the bottom-right of the video and fade out, like live-stream reactions.
function floatEmoji(text) {
  let emoji = [...new Intl.Segmenter().segment(text.replace(/\s/g, ''))].map((s) => s.segment);
  if (emoji.length === 1) emoji = [emoji[0], emoji[0], emoji[0]]; // a single one gets a little burst
  const host = document.fullscreenElement || document.body;
  emoji.forEach((e, i) => {
    setTimeout(() => {
      const el = document.createElement('div');
      el.dataset.sinehan = '';
      el.textContent = e;
      el.style.cssText =
        `position:fixed;left:${62 + Math.random() * 28}vw;bottom:10vh;z-index:2147483647;` +
        `font-size:${38 + Math.random() * 18}px;line-height:1;pointer-events:none;` +
        'filter:drop-shadow(0 2px 6px rgba(0,0,0,.45));will-change:transform,opacity';
      host.appendChild(el);
      const drift = (Math.random() - 0.5) * 90;
      el.animate(
        [
          { transform: 'translate(0, 0) scale(.5)', opacity: 0 },
          { transform: `translate(${drift * 0.3}px, -8vh) scale(1.1)`, opacity: 1, offset: 0.15 },
          { transform: `translate(${drift}px, -55vh) scale(1)`, opacity: 0 },
        ],
        { duration: 3200 + Math.random() * 900, easing: 'cubic-bezier(.2,.6,.4,1)' },
      ).onfinish = () => el.remove();
    }, i * 170);
  });
}
