// Watches the page's <video> and mirrors play/pause/seek to/from the other person — but only in the
// show's tab (the "watch tab" the background picks). Also: ads and buffering holds, auto-pause,
// hand-holding glow, 3-2-1 countdown, and the fullscreen chat/camera overlay.
const isNetflix = location.hostname.endsWith('netflix.com');
const viewId = crypto.randomUUID(); // identifies this tab/frame to the sidebar for the camera hand-off
const QUICK_REACTIONS = ['😂', '😭', '😍', '😱', '🔥', '👏', '❤️', '💀'];
let port = null;
let video = null;
let isWatchTab = false; // only the show's tab syncs
let hasWatch = false; // whether any tab is the show yet
// What we just applied from the other side. Local events that match it are our own echo (skip them);
// anything else is a real action by this person and is sent even if it happens right away.
let applied = null; // { paused, time, until }

// After the extension is reloaded or updated, copies of this script in tabs that were already open
// keep running but can't reach the extension anymore. They notice and switch themselves off quietly.
const timers = [];
let dead = false;
function extensionAlive() {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
}
function every(ms, fn) {
  timers.push(setInterval(() => (extensionAlive() ? fn() : shutdown()), ms));
}
function shutdown() {
  if (dead) return;
  dead = true;
  timers.forEach(clearInterval);
  overlay?.destroy();
  overlay = null;
}

function connectPort() {
  if (dead || !extensionAlive()) return shutdown();
  try {
    port = chrome.runtime.connect({ name: 'party' });
  } catch {
    return shutdown();
  }
  port.onMessage.addListener(onRemote);
  port.onDisconnect.addListener(() => {
    void chrome.runtime.lastError; // expected when the background restarts; we just reconnect
    port = null;
    setTimeout(connectPort, 1000);
  });
}
connectPort();

// Back/forward cache: Chrome freezes this page and closes our connection. Let go cleanly and
// reconnect if the page comes back.
window.addEventListener('pagehide', (e) => {
  if (!e.persisted || !port) return;
  const p = port;
  port = null;
  p.disconnect();
});
window.addEventListener('pageshow', (e) => {
  if (e.persisted && !port) connectPort();
});

function post(msg) {
  try {
    port?.postMessage(msg);
  } catch {}
}

// One-off requests to the background; quietly ignored if it can't answer (page frozen, extension reloaded).
function ask(msg, then) {
  if (!extensionAlive()) return shutdown();
  try {
    chrome.runtime.sendMessage(msg, (reply) => {
      if (chrome.runtime.lastError) return;
      then?.(reply);
    });
  } catch {}
}

// Our name/picture, for reactions sent from this tab.
let me = { name: 'Guest', avatar: 0 };
chrome.storage.local.get(['name', 'avatar']).then(({ name, avatar }) => (me = { name: name || 'Guest', avatar }));
chrome.storage.onChanged.addListener((c) => {
  if (c.name) me.name = c.name.newValue || 'Guest';
  if (c.avatar) me.avatar = c.avatar.newValue;
});

// ---- Finding the player ----
let lastClaim = 0;
every(1000, () => {
  const v = mainVideo();
  if (v && v !== video) attach(v);
  // No show picked yet and this tab has a real player: offer it as the show.
  if (video && !isWatchTab && !hasWatch && video.readyState > 0 && Date.now() - lastClaim > 3000) {
    const r = video.getBoundingClientRect();
    if (r.width >= 400 && r.height >= 200) {
      lastClaim = Date.now();
      post({ type: 'claim' });
    }
  }
  // Where we are in the show, for chat timestamps.
  if (isWatchTab && video && !myAd) post({ type: 'position', time: video.currentTime, paused: video.paused });
});

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

const VIDEO_EVENTS = ['play', 'pause', 'seeked', 'waiting', 'playing'];
function onVideoEvent(e) {
  if (e.target !== video) return;
  if (e.type === 'waiting') return onWaiting();
  if (e.type === 'playing') return onPlaying();
  if (e.type === 'pause') clearTimeout(stallTimer);
  if (applied && Date.now() < applied.until && video.paused === applied.paused && Math.abs(video.currentTime - applied.time) < 1.5) return;
  applied = null; // a real local action: from here on nothing is an echo of the old remote change
  if (e.type === 'pause' && myBuffering) onPlaying(); // paused on purpose while loading: stop holding them
  sendState(e.type);
}

function attach(v) {
  for (const ev of VIDEO_EVENTS) video?.removeEventListener(ev, onVideoEvent);
  video = v;
  for (const ev of VIDEO_EVENTS) v.addEventListener(ev, onVideoEvent);
  // Just opened the show (e.g. from an invite link)? Ask the other side where they are
  // (unless this is an ad's own player taking over; we re-sync when the ad ends).
  if (isWatchTab && !detectAd()) post({ type: 'sync-request' });
}

// ---- Invite page (served by the relay at /join) ----
if (window.top === window && document.querySelector('meta[name="watch-party-join"]')) {
  const params = new URLSearchParams(location.search);
  const room = params.get('room');
  const to = params.get('to');
  document.documentElement.dataset.wpReady = '1'; // lets the page swap "install the extension" for the Join button
  document.getElementById('wp-join')?.addEventListener('click', () => {
    const server = location.origin.replace(/^http/, 'ws');
    ask({ type: 'join-invite', server, room }, () => {
      if (to && /^https?:\/\//.test(to)) location.href = to;
      else document.getElementById('wp-done')?.removeAttribute('hidden');
    });
  });
}

let pageKey = showKey(location.href);
let switchedAt = 0;
function sendState(type) {
  if (!video || !isWatchTab || myAd) return; // never share an ad's play/pause/position
  // Sites like YouTube switch videos without reloading; the moments around a switch are the old and
  // new video stopping/starting, not anything to sync. The other side follows via "now watching" instead.
  const key = showKey(location.href);
  if (key !== pageKey) {
    pageKey = key;
    switchedAt = Date.now();
  }
  if (type !== 'state' && Date.now() - switchedAt < 2500) return; // (answers to "where are you?" still go out)
  post({ type, time: video.currentTime, paused: video.paused });
}

// Pause because of something on their side (left, closed the show, connection lost).
function pauseFor(message) {
  if (video && !video.paused) {
    applied = { paused: true, time: video.currentTime, until: Date.now() + 1500 };
    video.pause();
  }
  toast(message);
}

function onRemote(msg) {
  if (msg.local) return onLocal(msg);
  if (msg.type === 'role') {
    const was = isWatchTab;
    isWatchTab = !!msg.watching;
    hasWatch = !!msg.hasWatch;
    if (isWatchTab && !was && video && !detectAd()) post({ type: 'sync-request' });
    if (!isWatchTab && overlay) {
      overlay.destroy();
      overlay = null;
    }
    return;
  }
  // Everything below is for the show's tab only (the background doesn't send it elsewhere either).
  if (!isWatchTab) return;

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
  if (msg.type === 'sync-request') return sendState('state');
  if (msg.type === 'hold') return onTheirHold(msg.reason, !!msg.active, msg.time);
  if (msg.type === 'hand') return holdHand(msg.name);
  if (msg.type === 'countdown') return startCountdown(msg.time);
  if (msg.type === 'now-watching') return showFollowBanner(msg.url, msg.title, msg.from);
  if (msg.type === 'show-closed') return pauseFor('They closed the show. Paused.');
  if (msg.type === 'connection') {
    if (!msg.up) {
      clearTheirHolds();
      pauseFor('Connection lost. Paused until it’s back.');
    }
    return;
  }
  if (msg.type === 'peer') {
    const joined = msg.joined ?? msg.count > 1;
    if (joined) {
      toast('They joined');
      sendState('state'); // bring the newcomer to where we are
    } else if (msg.count < 2) {
      clearTheirHolds(); // don't stay held for someone who left mid-ad
      pauseFor('They left. Paused.');
    }
    return;
  }
  if (msg.type === 'joined') {
    toast(msg.count > 1 ? 'Connected. You’re both here.' : 'Connected. Waiting for them to join.');
    if (msg.count > 1 && video) post({ type: 'sync-request' }); // (re)connected: line up with them
    return;
  }
  if (!video || typeof msg.time !== 'number') return;
  if (myAd) return; // we're in an ad; we'll ask where they are once it ends

  const delta = msg.time - video.currentTime;
  applied = { paused: !!msg.paused, time: msg.time, until: Date.now() + 1500 };
  if (Math.abs(delta) > 1) seek(msg.time);
  if (msg.paused) video.pause();
  else video.play().catch(() => toast('Click the video once so the browser lets it autoplay'));
  // Big jumps (skipping the intro, rewinding a scene) get called out so they're not a surprise.
  if (msg.type === 'seeked' && Math.abs(delta) > 10) toast(`They ${delta > 0 ? 'skipped ahead' : 'went back'} ${clock(Math.abs(delta))}`);
  else if (msg.type === 'play' || msg.type === 'pause') toast(msg.paused ? 'Paused' : 'Playing');
}

function seek(seconds) {
  // Setting currentTime directly crashes Netflix's player, so ask its own API (netflix-main.js).
  if (isNetflix) window.postMessage({ source: 'watch-party', seekMs: seconds * 1000 }, '*');
  else video.currentTime = seconds;
}

function clock(seconds) {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

// ---- Holds: ads and buffering ----
// While one of us is in an ad or loading, the other is paused; nothing from an ad is synced.
// When it's over, the person who was held resumes and the other lines back up with them.
let myAd = false;
let myBuffering = false;
const theirHolds = new Set(); // 'ad' | 'buffer'
let pausedForHold = false;
let adStreak = 0;

every(500, () => {
  if (!video || !isWatchTab) return;
  const now = detectAd();
  if (now === myAd) {
    adStreak = 0;
    return;
  }
  if (++adStreak < 2) return; // must hold for ~1s, so a flicker doesn't count
  adStreak = 0;
  myAd = now;
  post({ type: 'hold', reason: 'ad', active: myAd });
  if (myAd) toast('Ad playing. They’re paused until it’s over.');
  else if (theirHolds.size) holdPlayback('Your ad’s done. Waiting for them.');
  else {
    pausedForHold = false;
    post({ type: 'sync-request' }); // land back exactly where they are
  }
});

// Buffering: a stall that lasts more than a moment (and isn't just a quick seek) holds the other side.
let stallTimer = null;
function onWaiting() {
  if (!isWatchTab || myAd || video.paused) return;
  clearTimeout(stallTimer);
  const stalledAt = video.currentTime;
  stallTimer = setTimeout(() => {
    if (!video.paused && !myAd && video.currentTime - stalledAt < 0.3) {
      myBuffering = true;
      post({ type: 'hold', reason: 'buffer', active: true, time: video.currentTime });
      toast('Loading… They’ll wait for you.');
    }
  }, 1500);
}
function onPlaying() {
  clearTimeout(stallTimer);
  if (!myBuffering) return;
  myBuffering = false;
  post({ type: 'hold', reason: 'buffer', active: false });
}

function onTheirHold(reason, active, time) {
  if (active) {
    theirHolds.add(reason);
    if (!myAd) holdPlayback(reason === 'ad' ? 'They’re watching an ad. Paused until it’s over.' : 'They’re loading. Waiting for them…', time);
  } else {
    theirHolds.delete(reason);
    if (!theirHolds.size && pausedForHold && !myAd) {
      releasePlayback();
      toast(reason === 'ad' ? 'Ad’s over. Back together.' : 'Back together.');
    }
  }
}

function holdPlayback(message, time) {
  // Only auto-resume later if it was actually playing (don't override someone who'd paused on purpose).
  if (!pausedForHold) pausedForHold = !!video && !video.paused;
  if (video && !video.paused) {
    applied = { paused: true, time: typeof time === 'number' ? time : video.currentTime, until: Date.now() + 1500 };
    video.pause();
    // Loading: wait at the spot they're stuck on, so we restart from the same moment.
    if (typeof time === 'number' && Math.abs(video.currentTime - time) > 1) seek(time);
  }
  toast(message);
}

function releasePlayback() {
  if (!pausedForHold || !video) return;
  pausedForHold = false;
  applied = { paused: false, time: video.currentTime, until: Date.now() + 1500 };
  video.play().catch(() => {});
}

function clearTheirHolds() {
  theirHolds.clear();
  pausedForHold = false;
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
  if (!video) return false;
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

// ---- Hold my hand ----
let handEl = null;
function holdHand(name) {
  const host = document.fullscreenElement || document.body;
  if (!handEl) {
    handEl = document.createElement('div');
    handEl.dataset.sinehan = '';
    handEl.style.cssText = 'position:fixed;inset:0;z-index:2147483645;pointer-events:none;opacity:0;' +
      'box-shadow:inset 0 0 140px 40px rgba(201,182,242,.55)';
  }
  if (handEl.parentNode !== host) host.appendChild(handEl);
  handEl.animate([{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 0.35, offset: 0.5 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }],
    { duration: 2600, easing: 'ease-in-out' });
  toast(`${name || 'They'} is holding your hand 🤝`);
}

// ---- 3-2-1 countdown ----
// Both sides pause at the same spot, count down together, then play at the same moment.
let countdownTimer = null;
let countEl = null;
function startCountdown(time) {
  if (!video || myAd) return;
  clearInterval(countdownTimer);
  const at = typeof time === 'number' ? time : video.currentTime;
  applied = { paused: true, time: at, until: Date.now() + 6000 };
  video.pause();
  if (Math.abs(video.currentTime - at) > 0.5) seek(at);
  let n = 3;
  showCount(n);
  countdownTimer = setInterval(() => {
    n -= 1;
    if (n > 0) return showCount(n);
    clearInterval(countdownTimer);
    showCount(null);
    applied = { paused: false, time: video.currentTime, until: Date.now() + 1500 };
    video.play().catch(() => toast('Click the video once so the browser lets it autoplay'));
  }, 1000);
}
function showCount(n) {
  ensureFont();
  if (!countEl) {
    countEl = document.createElement('div');
    countEl.dataset.sinehan = '';
    countEl.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2147483647;pointer-events:none;' +
      'width:150px;height:150px;border-radius:50%;display:grid;place-items:center;background:rgba(22,18,30,.58);backdrop-filter:blur(18px) saturate(140%);-webkit-backdrop-filter:blur(18px) saturate(140%);border:1px solid rgba(255,255,255,.12);' +
      `color:#efeaf6;font:600 72px/1 ${FONT};box-shadow:0 8px 40px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.1)`;
  }
  if (n == null) return countEl.remove();
  const host = document.fullscreenElement || document.body;
  if (countEl.parentNode !== host) host.appendChild(countEl);
  countEl.textContent = n;
  countEl.animate([{ transform: 'translate(-50%,-50%) scale(1.25)', opacity: 0.4 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }], { duration: 300, easing: 'ease-out' });
}

// ---- "They're watching something else" banner ----
function showKey(url) {
  try {
    const u = new URL(url, location.href);
    const v = u.searchParams.get('v');
    return u.origin + u.pathname + (v ? `?v=${v}` : '');
  } catch {
    return url || '';
  }
}
let bannerEl = null;
function showFollowBanner(url, title, from) {
  if (!/^https?:\/\//.test(url || '') || showKey(url) === showKey(location.href)) return; // already here
  // We were watching the same thing and they moved on (clicked another video, next episode): follow.
  if (from && showKey(from) === showKey(location.href)) {
    toast(`Following them to ${title ? `“${title}”` : 'the next video'}`);
    ask({ type: 'follow', url });
    return;
  }
  ensureFont();
  bannerEl?.remove();
  bannerEl = document.createElement('div');
  bannerEl.dataset.sinehan = '';
  bannerEl.style.cssText = 'position:fixed;left:50%;bottom:96px;transform:translateX(-50%);z-index:2147483647;display:flex;align-items:center;gap:10px;' +
    'padding:9px 10px 9px 14px;border-radius:9px;background:rgba(22,18,30,.58);backdrop-filter:blur(18px) saturate(140%);-webkit-backdrop-filter:blur(18px) saturate(140%);border:1px solid rgba(255,255,255,.12);color:#efeaf6;' +
    `font:13px/1.4 ${FONT};box-shadow:0 6px 24px rgba(0,0,0,.45);max-width:min(560px,90vw)`;
  const label = document.createElement('span');
  label.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
  label.textContent = `They’re now watching ${title ? `“${title}”` : 'something else'}`;
  const go = document.createElement('button');
  go.textContent = 'Go there';
  go.style.cssText = 'flex:none;border:0;border-radius:6px;padding:6px 10px;background:#c9b6f2;color:#1b1325;font:inherit;font-weight:600;cursor:pointer';
  go.onclick = () => ask({ type: 'follow', url });
  const close = document.createElement('button');
  close.textContent = '✕';
  close.title = 'Dismiss';
  close.style.cssText = 'flex:none;border:0;background:none;color:#978ca6;font:inherit;cursor:pointer;padding:4px';
  close.onclick = () => bannerEl?.remove();
  bannerEl.append(label, go, close);
  (document.fullscreenElement || document.body).appendChild(bannerEl);
  setTimeout(() => bannerEl?.remove(), 30000);
}

// ---- Fullscreen: chat button + her camera ----
let overlay = null;
let camPc = null;

document.addEventListener('fullscreenchange', () => {
  const fs = document.fullscreenElement;
  // Only the show's player draws the overlay (and never inside a bare <video>).
  if (isWatchTab && fs && video && fs !== video && fs.contains(video)) {
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

// Messages from the sidebar in this browser: camera hand-off, jump to a chat timestamp, countdown.
async function onLocal(msg) {
  if (msg.to && msg.to !== viewId) return;
  if (msg.type === 'jump') {
    if (isWatchTab && video && typeof msg.time === 'number') seek(msg.time); // the seek then syncs to them
  } else if (msg.type === 'countdown-start') {
    if (isWatchTab && video) {
      const time = video.currentTime;
      post({ type: 'countdown', time });
      startCountdown(time);
    }
  } else if (msg.type === 'call-state') {
    overlay?.setCallState(msg);
  } else if (msg.type === 'cam-available') {
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

function buildOverlay(fsHost) {
  ensureFont();
  const host = document.createElement('div');
  host.dataset.sinehan = '';
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none;';
  // Shadow DOM so the site's CSS can't touch ours (and vice versa). The template is static markup.
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      * { box-sizing: border-box; }
      :host { font: 13px/1.4 ${FONT}; color: #ece6f3; }
      button { font: inherit; color: inherit; cursor: pointer; }
      [hidden] { display: none !important; }
      .cam { position: absolute; top: 20px; left: calc(100% - 260px); width: 240px; aspect-ratio: 4 / 3; border-radius: 8px; overflow: hidden;
        background: #0d0a11; box-shadow: 0 6px 24px rgba(0,0,0,.5); pointer-events: auto; cursor: grab; touch-action: none;
        transform-origin: var(--origin, top right); transition: transform .18s ease; }
      .cam:hover:not(.dragging) { transform: scale(1.5); }
      .cam.dragging { cursor: grabbing; transition: none; }
      .cam video { width: 100%; height: 100%; object-fit: cover; display: block; pointer-events: none; }
      .cam .hide { position: absolute; top: 6px; right: 6px; width: 22px; height: 22px; border: 0; border-radius: 50%;
        background: rgba(22,17,28,.7); font-size: 11px; opacity: 0; transition: opacity .15s; }
      .controls { position: absolute; left: 0; right: 0; bottom: 0; display: flex; justify-content: center; gap: 6px; padding: 18px 6px 6px;
        background: linear-gradient(transparent, rgba(13,10,17,.85)); opacity: 0; transition: opacity .15s; }
      .cam:hover .hide, .cam:hover .controls { opacity: 1; }
      .cam.dragging .hide, .cam.dragging .controls { opacity: 0; }
      .controls button { width: 28px; height: 28px; border: 0; border-radius: 50%; display: grid; place-items: center; background: rgba(236,230,243,.16); }
      .controls button:hover { background: rgba(236,230,243,.28); }
      .controls button.off { background: rgba(229,134,143,.85); color: #1b1325; }
      .controls button[hidden] { display: none; }
      .controls svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }
      .fab, .hand { position: absolute; right: 24px; width: 44px; height: 44px; border-radius: 50%; border: 1px solid rgba(255,255,255,.14);
        background: rgba(22,18,30,.5); backdrop-filter: blur(16px) saturate(140%); display: grid; place-items: center; pointer-events: auto;
        box-shadow: 0 6px 20px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.08); }
      .fab { bottom: 96px; }
      .hand { bottom: 148px; font-size: 18px; }
      .fab:hover, .hand:hover { background: rgba(40,33,52,.65); }
      .fab svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
      .badge { position: absolute; top: -3px; right: -3px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px;
        background: #c9b6f2; color: #1b1325; font-size: 11px; font-weight: 700; line-height: 18px; text-align: center; }
      .panel { position: absolute; right: 80px; bottom: 96px; width: 300px; height: min(380px, 60vh); display: flex; flex-direction: column;
        border-radius: 10px; border: 1px solid rgba(255,255,255,.12); background: rgba(20,16,27,.55); backdrop-filter: blur(22px) saturate(140%);
        box-shadow: 0 12px 36px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.08); pointer-events: auto; overflow: hidden; }
      .head { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,.08); font-weight: 600; }
      .head button { border: 0; background: none; color: #978ca6; font-size: 16px; line-height: 1; padding: 2px 4px; }
      .log { flex: 1; overflow-y: auto; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; scrollbar-width: thin; scrollbar-color: #2c2337 transparent; }
      .msg { max-width: 82%; align-self: flex-start; padding: 7px 11px; border-radius: 10px 10px 10px 3px; background: rgba(255,255,255,.09); border: 1px solid rgba(255,255,255,.08); overflow-wrap: anywhere; }
      .msg.me { align-self: flex-end; border-radius: 10px 10px 3px 10px; background: #c9b6f2; border-color: transparent; color: #1b1325; }
      .msg.big { background: none; border-color: transparent; font-size: 26px; line-height: 1.15; padding: 0 2px; }
      .who { display: block; font-size: 11px; color: #978ca6; }
      .msg.me .who, .msg.big .who { display: none; }
      .quick { display: flex; justify-content: space-between; padding: 6px 10px; border-top: 1px solid rgba(255,255,255,.08); }
      .quick button { border: 0; background: none; font-size: 18px; padding: 2px 4px; border-radius: 6px; }
      .quick button:hover { background: rgba(255,255,255,.1); }
      form { display: flex; gap: 6px; padding: 8px 10px; border-top: 1px solid rgba(255,255,255,.08); }
      input { flex: 1; min-width: 0; padding: 8px 10px; border-radius: 7px; border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.06); color: inherit; font: inherit; outline: none; }
      input:focus { border-color: #c9b6f2; }
      form button { border: 0; border-radius: 7px; padding: 0 12px; background: #c9b6f2; color: #1b1325; font-weight: 600; box-shadow: 0 4px 16px rgba(201,182,242,.3); }
    </style>
    <div class="cam" hidden>
      <video autoplay playsinline muted></video>
      <button class="hide" title="Hide">✕</button>
      <div class="controls">
        <button class="c-mic" title="Mute / unmute your mic"><svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg></button>
        <button class="c-cam" title="Turn your camera on / off"><svg viewBox="0 0 24 24"><rect x="3" y="7" width="12" height="10" rx="2" /><path d="M15 10.5l6-3.5v10l-6-3.5" /></svg></button>
        <button class="c-exit" title="Exit fullscreen and open the sidebar"><svg viewBox="0 0 24 24"><path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" /><path d="M14 10l6-6M10 14l-6 6" /></svg></button>
      </div>
    </div>
    <div class="panel" hidden>
      <div class="head">Chat <button class="close" title="Close">✕</button></div>
      <div class="log"></div>
      <div class="quick"></div>
      <form><input maxlength="500" placeholder="Message" autocomplete="off" /><button>Send</button></form>
    </div>
    <button class="hand" title="Hold their hand">🤝</button>
    <button class="fab" title="Chat">
      <svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z" /></svg>
      <span class="badge" hidden></span>
    </button>`;

  const $ = (sel) => root.querySelector(sel);
  const seen = new Set();
  let unread = 0;
  let camHidden = false;
  let loadedHistory = false;
  let lastTyping = 0;

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

  // Her camera: drag it anywhere (remembered), it grows toward the middle of the screen on hover,
  // and its controls work your mic/camera in the call (which runs in the sidebar).
  const cam = $('.cam');
  function placeCam(x, y) {
    const w = cam.offsetWidth || 240;
    const h = cam.offsetHeight || 180;
    const left = Math.min(Math.max(8, x), innerWidth - w - 8);
    const top = Math.min(Math.max(8, y), innerHeight - h - 8);
    cam.style.left = `${left}px`;
    cam.style.top = `${top}px`;
    // Zoom from the corner nearest the screen edge, so it grows inward and never off-screen.
    cam.style.setProperty('--origin', `${top + h / 2 > innerHeight / 2 ? 'bottom' : 'top'} ${left + w / 2 > innerWidth / 2 ? 'right' : 'left'}`);
  }
  chrome.storage.local.get('camPos').then(({ camPos }) => {
    if (camPos) placeCam(camPos.x * innerWidth, camPos.y * innerHeight);
  }).catch(() => {});
  let drag = null;
  cam.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.composedPath().some((el) => el.tagName === 'BUTTON')) return;
    const r = cam.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false };
    cam.setPointerCapture(e.pointerId);
  });
  cam.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.moved) {
      drag.moved = true;
      cam.classList.add('dragging'); // un-zoom while moving, so it follows the pointer exactly
    }
    placeCam(e.clientX - drag.dx, e.clientY - drag.dy);
  });
  const endDrag = () => {
    if (!drag) return;
    if (drag.moved) {
      cam.classList.remove('dragging');
      const r = cam.getBoundingClientRect();
      chrome.storage.local.set({ camPos: { x: r.left / innerWidth, y: r.top / innerHeight } }).catch(() => {});
    }
    drag = null;
  };
  cam.addEventListener('pointerup', endDrag);
  cam.addEventListener('pointercancel', endDrag);

  $('.c-mic').onclick = () => post({ local: true, type: 'call-control', action: 'mic' });
  $('.c-cam').onclick = () => post({ local: true, type: 'call-control', action: 'cam' });
  $('.c-exit').onclick = () => {
    // Chrome hides the sidebar in fullscreen: leave fullscreen and bring the sidebar back.
    ask({ type: 'open-sidebar' }, (r) => {
      if (!r?.ok) toast('Click the Sinehan icon to open the sidebar');
    });
    document.exitFullscreen?.().catch(() => {});
  };
  $('.hand').onclick = () => {
    post({ type: 'hand', name: me.name });
    toast('Holding their hand 🤝');
  };

  function sendChat(text) {
    const msg = { type: 'chat', id: crypto.randomUUID(), name: me.name, avatar: me.avatar, text, vt: video?.currentTime };
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
  $('input').oninput = () => {
    if (Date.now() - lastTyping < 2000) return;
    lastTyping = Date.now();
    post({ type: 'typing', name: me.name });
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
  ask({ type: 'history' }, (history = []) => {
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
      if (stream) post({ local: true, type: 'call-state-request' });
    },
    setCallState({ mic, cam: camOn, hasCamera }) {
      $('.c-mic').classList.toggle('off', !mic);
      $('.c-mic').title = mic ? 'Mute your mic' : 'Unmute your mic';
      $('.c-cam').classList.toggle('off', !camOn);
      $('.c-cam').title = camOn ? 'Turn your camera off' : 'Turn your camera on';
      $('.c-mic').hidden = $('.c-cam').hidden = !hasCamera; // (watching her without your own camera on)
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
  ensureFont();
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.dataset.sinehan = '';
    toastEl.style.cssText =
      'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483647;padding:8px 14px;border-radius:8px;' +
      'background:rgba(22,18,30,.58);backdrop-filter:blur(18px) saturate(140%);-webkit-backdrop-filter:blur(18px) saturate(140%);border:1px solid rgba(255,255,255,.12);color:#efeaf6;max-width:60vw;' +
      `font:13px/1.4 ${FONT};box-shadow:0 8px 28px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.08);pointer-events:none;transition:opacity .3s`;
  }
  const host = document.fullscreenElement || document.body;
  if (toastEl.parentNode !== host) host.appendChild(toastEl);
  toastEl.textContent = text;
  toastEl.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.style.opacity = '0'), 2500);
}

// Inter for our overlays, under a private name so we never change the site's own fonts.
// Pages can't load chrome-extension:// URLs as fonts, so we hand the font over as bytes instead,
// and only once something is actually about to be shown.
const FONT = "'WatchPartyInter',system-ui,sans-serif";
let fontRequested = false;
function ensureFont() {
  if (fontRequested || !extensionAlive()) return;
  fontRequested = true;
  fetch(chrome.runtime.getURL('fonts/inter.woff2'))
    .then((r) => r.arrayBuffer())
    .then((bytes) => new FontFace('WatchPartyInter', bytes, { weight: '100 900' }).load())
    .then((face) => document.fonts.add(face))
    .catch(() => {}); // system-ui is the fallback
}

function isEmojiOnly(text) {
  return /\p{Extended_Pictographic}/u.test(text) && !/[0-9#*]/.test(text)
    && /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Emoji_Component}|‍|️|\s)+$/u.test(text)
    && [...new Intl.Segmenter().segment(text.replace(/\s/g, ''))].length <= 8;
}

// Emoji drift up from the bottom-right of the video and fade out, like live-stream reactions.
function floatEmoji(text) {
  ensureFont();
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
