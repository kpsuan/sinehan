// Owns the WebSocket to the relay, decides which tab is "the show" (the watch tab), routes messages
// between the relay, that tab and the sidebar, and keeps the chat history.
let ws = null;
let pingTimer = null;
let status = { connected: false, peers: 0, room: '' };
const ports = new Set();
const HISTORY_LIMIT = 300;
const DEFAULT_SERVER = 'wss://sinehan.live';

// Retired relay addresses; saved settings pointing at them are migrated to the default.
const OLD_SERVERS = ['ws://localhost:8080', 'wss://sinehan-rhua.onrender.com'];

// The one tab that syncs. Everything from other tabs is ignored, and nothing is sent to them.
let watch = null; // { tabId, url, title, favIconUrl }
let lastPos = null; // { time, paused, at } — the watch tab's playback position, for chat timestamps

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

// Coming back to a party: Chrome reopened (or the background restarted) soon after, you're back in it; after
// longer (closed for the night), the party is over: it goes to Past parties and you start fresh.
const REJOIN_WITHIN = 2 * 3600 * 1000;
const shouldRejoin = ({ active, aliveAt }, now = Date.now()) => !!active && (!aliveAt || now - aliveAt < REJOIN_WITHIN);
setInterval(() => status.connected && chrome.storage.local.set({ aliveAt: Date.now() }), 60000);

chrome.storage.local.get(['server', 'room', 'active', 'watch', 'aliveAt']).then(async ({ server, room, active, watch: saved, aliveAt }) => {
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
  if (active && !shouldRejoin({ active, aliveAt })) {
    chrome.storage.local.set({ active: false });
    archiveParty();
    return;
  }
  if (active && server && room) connect(server, room);
});

// ---- Ports: tabs connect as 'party', the sidebar as 'panel', the call page as 'call' ----
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'party' && port.name !== 'panel' && port.name !== 'call') return;
  port.tabId = port.sender?.tab?.id;
  ports.add(port);
  if (port.name === 'party') sendRole(port);
  if (port.name === 'call') callConnected(port);

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
      // Past parties are named after what actually played, not every tab that was picked.
      if (fromWatchTab && watch && !msg.paused && !watch.played) {
        watch.played = true;
        noteShow(showName(watch.showTitle || watch.title));
      }
      return;
    }
    if (msg.type === 'meta') {
      // The show's link-preview picture, for invite pages.
      if (fromWatchTab && watch) {
        const pic = (x) => (/^https:\/\//.test(x || '') && x.length < 600 ? x : '');
        watch.image = pic(msg.image);
        watch.fallbackImage = pic(msg.fallbackImage); // the page's biggest image, if it publishes none
        watch.showTitle = String(msg.title || '').slice(0, 120); // e.g. Netflix's real show name
        watch.ep = /^S\d+E\d+$/.test(msg.ep || '') ? msg.ep : ''; // the episode on, when the player shows it
      }
      return;
    }

    // Playback messages only count from the show's tab; stray videos elsewhere can't control anything.
    if (fromTab && !fromWatchTab && msg.type !== 'chat') return;

    if (msg.type === 'goodnight' && fromWatchTab) saveSpot(msg);

    // Your own play / pause / jump, for the sidebar's chat (theirs arrive from the relay).
    if (fromWatchTab && ['play', 'pause', 'seeked'].includes(msg.type)) {
      for (const p of ports)
        if (p.name === 'panel') postTo(p, { type: 'playback', action: msg.type, time: msg.time, mine: true });
    }
    if (msg.type === 'bantay-trick') {
      for (const p of ports) if (p !== port && p.name === 'party' && isWatchTab(p)) postTo(p, { ...msg, mine: true });
    }
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

// The sidebar and the call page hear everything; tabs only if they're the show.
const wantsMessage = (port) => port.name === 'panel' || port.name === 'call' || isWatchTab(port);

function sendRole(port) {
  postTo(port, { type: 'role', watching: isWatchTab(port), hasWatch: !!watch });
}
function broadcastLocal(msg) {
  for (const p of ports) if (wantsMessage(p)) postTo(p, msg);
}

// ---- One-off requests (sidebar, invite page, banners) ----
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type === 'call-query') return; // the call page answers these
  if (msg.type === 'history') {
    // Wait for pending writes so the sidebar doesn't miss the newest message.
    historyWrite.then(() => chrome.storage.local.get('history')).then(({ history = [] }) => reply(history));
    return true;
  }
  if (msg.type === 'call-ensure') {
    ensureCallPage().then(() => reply(true), () => reply(false));
    return true;
  }
  if (msg.type === 'call-save') {
    // Settings the call page changed (it can't use storage itself).
    const v = msg.values || {};
    const allowed = Object.fromEntries(Object.entries(v).filter(([k]) => ['micOn', 'cameraId', 'micId'].includes(k)));
    chrome.storage.local.set(allowed);
    return;
  }
  if (msg.type === 'call-busy') {
    callBusy(!!msg.busy);
    return;
  }
  if (msg.type === 'call-handled') {
    clearPendingCall();
    reply(true);
    return;
  }
  if (msg.type === 'open-sidebar') {
    // From in-page buttons; must run right away, while Chrome still counts the click as a user gesture.
    if (!sender.tab) return reply({ ok: false });
    chrome.sidePanel.open({ windowId: sender.tab.windowId }).then(
      () => reply({ ok: true }),
      () => reply({ ok: false }),
    );
    return true;
  }
  if (msg.type === 'join-invite') {
    // "Join" on an invite page: open the sidebar while we still have the click, then join.
    // That tab is about to become the show, so make it the watch tab.
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
    historyWrite
      .then(() => chrome.storage.local.get('sessions'))
      .then(({ sessions = [] }) =>
        reply(sessions.map(({ messages, ...summary }) => ({ ...summary, count: messages.length }))),
      );
    return true;
  } else if (msg.type === 'session') {
    chrome.storage.local
      .get('sessions')
      .then(({ sessions = [] }) => reply(sessions.find((x) => x.id === msg.id) || null));
    return true;
  } else if (msg.type === 'delete-session' || msg.type === 'clear-sessions') {
    historyWrite = historyWrite
      .then(() => chrome.storage.local.get('sessions'))
      .then(({ sessions = [] }) =>
        chrome.storage.local.set({
          sessions: msg.type === 'clear-sessions' ? [] : sessions.filter((x) => x.id !== msg.id),
        }),
      );
    historyWrite.then(() => reply({ ok: true }));
    return true;
  } else if (msg.type === 'guides') {
    guidesWrite.then(readGuides).then((list) => reply(list.map(guideSummary)));
    return true;
  } else if (msg.type === 'guide-get') {
    guidesWrite.then(readGuides).then((list) => reply(list.find((g) => g.id === msg.id) || null));
    return true;
  } else if (msg.type === 'guide-save') {
    const guide = cleanGuide(msg.guide);
    if (!guide) return reply(null);
    if (status.connected && status.room) guide.room = status.room;
    saveGuides([guide], !!guide.room && guide.room === status.room)
      .then(() => readGuides())
      .then((list) => reply(list.find((g) => g.id === guide.id) || null));
    return true;
  } else if (msg.type === 'guide-tick') {
    const tick = { id: String(msg.id || ''), key: String(msg.key || ''), v: !!msg.v, at: Date.now() };
    tickGuide(tick, true)
      .then(() => readGuides())
      .then((list) => reply(list.find((g) => g.id === tick.id) || null));
    return true;
  } else if (msg.type === 'guide-delete') {
    guidesWrite = guidesWrite
      .then(readGuides)
      .then((list) => chrome.storage.local.set({ guides: list.filter((g) => g.id !== msg.id) }));
    guidesWrite.then(() => reply(true));
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
  } else if (msg.type === 'refresh-watch') {
    if (watch) chrome.tabs.reload(watch.tabId).catch(() => {});
    reply(true);
    return;
  } else if (msg.type === 'match-get') {
    readMatch().then((m) => reply(m && m.room === status.room ? m : null));
    return true;
  } else if (msg.type === 'match-start') {
    startDeck(msg).then(reply);
    return true;
  } else if (msg.type === 'match-vote') {
    voteCard(str(msg.card, 80), !!msg.yes, true).then(reply);
    return true;
  } else if (msg.type === 'match-end') {
    chrome.storage.local.remove('matchDeck').then(() => {
      panels({ type: 'match-changed' });
      reply(true);
    });
    return true;
  } else if (msg.type === 'guesses') {
    guessWrite.then(readGuesses).then((list) => reply({ list: list.map(guessView), wants: revealWants }));
    return true;
  } else if (msg.type === 'guess-lock') {
    lockGuess(msg).then(reply);
    return true;
  } else if (msg.type === 'guess-reveal') {
    wantReveal('me', str(msg.show, 100));
    reply(true);
    return;
  } else if (msg.type === 'guess-verdict') {
    setVerdict(str(msg.id, 80), msg.right === true ? 'right' : msg.right === false ? 'wrong' : null, true);
    reply(true);
    return;
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
  // watchLive: the show's tab is running our content script, which tabs open before an extension
  // reload/update don't until refreshed.
  const watchLive = !!watch && [...ports].some((p) => p.name === 'party' && p.tabId === watch.tabId);
  return { ...status, retrying, watch, watchLive, pos: lastPos };
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
  const {
    history = [],
    room,
    partyShows = [],
    sessions = [],
  } = await chrome.storage.local.get(['history', 'room', 'partyShows', 'sessions']);
  const update = { history: [], partyShows: [] };
  if (history.length > 1) {
    // (a party with a single line, like the invite note, isn't worth keeping)
    const shows = [...new Set(partyShows.filter(Boolean))];
    update.sessions = [
      { id: crypto.randomUUID(), room, startedAt: history[0].at, endedAt: Date.now(), shows, messages: history },
      ...sessions,
    ].slice(0, MAX_SESSIONS);
  }
  await chrome.storage.local.set(update);
}
function archiveParty() {
  historyWrite = historyWrite.then(archiveNow).catch(console.error);
}

// A show's name from its tab title: "Prime Video: The Mentalist - Season 3" → "The Mentalist".
function showName(title) {
  return String(title || '')
    .replace(/^\(\d+\)\s*/, '')
    .replace(/^(Prime Video|Amazon\.com|Watch)\s*:\s*/i, '')
    .replace(/\s*[|\-–—]\s*(YouTube|Netflix|Prime Video|Amazon\.com|Max|HBO Max|Crunchyroll|Disney\+|Hulu|Facebook).*$/i, '')
    .replace(/:?\s*(Season|S)\s*\d+.*$/i, '')
    .replace(/[\s\-–—:|·]+$/, '')
    .trim()
    .slice(0, 120);
}

// Remember what this party watched, for its title in "Past parties".
function noteShow(title) {
  if (!title) return;
  historyWrite = historyWrite
    .then(() => chrome.storage.local.get('partyShows'))
    .then(({ partyShows = [] }) =>
      partyShows.includes(title) ? null : chrome.storage.local.set({ partyShows: [...partyShows, title].slice(-5) }),
    )
    .catch(console.error);
}

// ---- Saved watch guides ----
// Saving a guide keeps it here and sends it to the other person, so it shows up in their list too.
// Ticks are shared (you watch together); for each episode the latest tick or untick wins.
const MAX_GUIDES = 12;
let guidesWrite = Promise.resolve();
async function readGuides() {
  return (await chrome.storage.local.get('guides')).guides || [];
}
const str = (x, n) => String(x ?? '').slice(0, n);

// An episode ("S4E7") or, in a franchise's watch order, a title ("T:iron man").
const GUIDE_KEY = /^(S\d+E\d+|T:[\p{L}\p{N} ]{1,100})$/u;
function cleanGuide(g) {
  if (!g || typeof g !== 'object' || !g.id || !g.show) return null;
  const done = {};
  for (const [k, t] of Object.entries(g.done || {}).slice(0, 300)) {
    if (GUIDE_KEY.test(k) && t && typeof t.at === 'number') done[k] = { v: !!t.v, at: t.at };
  }
  return {
    id: str(g.id, 200),
    show: str(g.show, 100),
    topic: str(g.topic, 100),
    room: str(g.room, 64), // the party it was saved in: it only syncs there
    art: cleanArt(g.art),
    wiki: /^[a-z0-9-]+(\.[a-z0-9-]+)*\.fandom\.com$/.test(g.wiki || '') ? g.wiki : '',
    by: str(g.by, 30),
    at: Number(g.at) || Date.now(),
    episodes: (Array.isArray(g.episodes) ? g.episodes : [])
      .slice(0, 150)
      .map((e) => ({
        key: str(e.key, 104),
        season: Number(e.season) || 0,
        number: Number(e.number) || 0,
        label: str(e.label, 20),
        title: str(e.title, 120),
        kind: str(e.kind, 20),
        order: Number(e.order) || 0,
        reason: str(e.reason, 160),
        pasted: !!e.pasted,
        guides: Number(e.guides) || 0,
        comments: Number(e.comments) || 0,
        summary: !!e.summary,
        summaryTerm: str(e.summaryTerm, 40),
        fandom: !!e.fandom,
        url: /^https:\/\//.test(e.url || '') ? str(e.url, 400) : '',
        added: !!e.added,
      }))
      .filter((e) => GUIDE_KEY.test(e.key)),
    threads: (Array.isArray(g.threads) ? g.threads : []).slice(0, 6).map((t) => ({
      title: str(t.title, 200),
      sub: str(t.sub, 60),
      upvotes: Number(t.upvotes) || 0,
      url: /^https:\/\//.test(t.url || '') ? str(t.url, 400) : '',
      pasted: !!t.pasted,
    })),
    done,
  };
}

// The artwork picked on a guide's page: TVmaze pictures or a small uploaded one; the newest pick wins.
function cleanArt(a) {
  if (!a || typeof a !== 'object') return null;
  const ok = (x) =>
    typeof x === 'string' &&
    x.length < 60000 &&
    (x === '' ||
      /^(https:\/\/static\.tvmaze\.com\/uploads\/images\/[\w/.-]+|data:image\/jpeg;base64,[A-Za-z0-9+/=]+)$/.test(x))
      ? x
      : '';
  return { poster: ok(a.poster), background: ok(a.background), at: Number(a.at) || 0 };
}
function mergeGuide(mine, theirs) {
  if (!mine) return theirs;
  const newer = theirs.at > mine.at ? theirs : mine;
  const done = { ...mine.done };
  for (const [k, t] of Object.entries(theirs.done)) if (!done[k] || t.at > done[k].at) done[k] = t;
  const art = (theirs.art?.at || 0) > (mine.art?.at || 0) ? theirs.art : mine.art;
  return { ...newer, room: mine.room || theirs.room, art, done };
}
function guideSummary(g) {
  return {
    id: g.id,
    show: g.show,
    topic: g.topic,
    by: g.by,
    at: g.at,
    count: g.episodes.length,
    watched: g.episodes.filter((e) => g.done[e.key]?.v).length,
  };
}
const panels = (msg) => {
  for (const p of ports) if (p.name === 'panel') postTo(p, msg);
};

// Save guides (ours, or ones they sent). `share` sends them on to the other person.
function saveGuides(incoming, share, from = null) {
  guidesWrite = guidesWrite
    .then(readGuides)
    .then(async (list) => {
      const added = [];
      for (const g of incoming) {
        const i = list.findIndex((x) => x.id === g.id);
        if (i < 0 && from) added.push({ show: g.show, topic: g.topic, by: g.by });
        if (i < 0) list.unshift(g);
        else list[i] = mergeGuide(list[i], g);
      }
      await chrome.storage.local.set({ guides: list.slice(0, MAX_GUIDES) });
      panels({ type: 'guides-changed', added });

      // One guide per message keeps each well under the relay's size limit.
      if (share) for (const g of incoming) send({ type: 'guide-sync', guide: list.find((x) => x.id === g.id) || g });
      if (share) send({ type: 'guide-channels', ids: incoming.map((g) => g.id) });
    })
    .catch(console.error);
  return guidesWrite;
}
function tickGuide(tick, share) {
  if (!tick.id || !GUIDE_KEY.test(tick.key)) return guidesWrite;
  guidesWrite = guidesWrite
    .then(readGuides)
    .then(async (list) => {
      const g = list.find((x) => x.id === tick.id);
      if (!g) return;
      if (!g.done[tick.key] || tick.at >= g.done[tick.key].at) g.done[tick.key] = { v: tick.v, at: tick.at };
      await chrome.storage.local.set({ guides: list });
      panels({ type: 'guides-changed', added: [], id: tick.id });

      // Only share within the party it belongs to.
      if (share && g.room && g.room === status.room) send({ type: 'guide-tick', ...tick });
    })
    .catch(console.error);
  return guidesWrite;
}

// An episode added on a guide's page (any device): add it to this party's copy of the guide.
function addFromPage(msg) {
  const key = str(msg.key, 104);
  if (!GUIDE_KEY.test(key)) return;
  guidesWrite = guidesWrite
    .then(readGuides)
    .then(async (list) => {
      const g = list.find((x) => x.id === msg.id && x.room === status.room);
      if (!g || g.episodes.some((e) => e.key === key)) return;
      const m = key.match(/^S(\d+)E(\d+)$/);
      g.episodes.push({
        key,
        season: m ? Number(m[1]) : 0,
        number: m ? Number(m[2]) : 0,
        label: m ? `S${m[1]} E${m[2]}` : 'Film',
        title: str(msg.title, 120),
        kind: m ? '' : str(msg.kind, 20) || 'Films',
        order: 0,
        reason: '',
        pasted: false,
        guides: 0,
        comments: 0,
        summary: false,
        summaryTerm: '',
        fandom: false,
        url: '',
        added: true,
      });
      if (m) g.episodes.sort((a, b) => a.season - b.season || a.number - b.number);
      g.at = Date.now();
      await chrome.storage.local.set({ guides: list });
      panels({ type: 'guides-changed', added: [], id: g.id });
    })
    .catch(console.error);
}

// When you're both here: catch each other up on this party's guides (never other parties').
function shareGuides() {
  guidesWrite.then(readGuides).then((list) => {
    const mine = list.filter((g) => g.room && g.room === status.room);
    mine.forEach((g) => send({ type: 'guide-sync', guide: g }));
    if (mine.length) send({ type: 'guide-channels', ids: mine.map((g) => g.id) });
  });
}

// ---- "Who did it?" ----
// Lock a guess about who's behind it. Your partner sees only that you locked one (and a fingerprint of
// it); when you both tap Reveal, each side opens its own guesses, and the fingerprint proves nobody
// changed theirs after the fact. Guesses stick to the show, so a mystery can run for seasons.
let guessWrite = Promise.resolve();
const revealWants = {}; // show -> { me, them }: both tapped Reveal → open
async function readGuesses() {
  return (await chrome.storage.local.get('guesses')).guesses || [];
}
function changeGuesses(fn) {
  const run = guessWrite.then(readGuesses).then(async (list) => {
    const result = await fn(list);
    await chrome.storage.local.set({ guesses: list.slice(-300) });
    panels({ type: 'guesses-changed' });
    return result;
  });
  guessWrite = run.catch(console.error);
  return run;
}
// What the sidebar may show: their guesses only once revealed (they aren't even here before then).
const guessView = (g) => ({ id: g.id, room: g.room, show: g.show, showName: g.showName, ep: g.ep, vt: g.vt, by: g.by, mine: g.mine, at: g.at,
  revealed: g.revealed, verified: g.verified, verdict: g.verdict,
  text: g.mine || g.revealed ? g.text : '', note: g.mine || g.revealed ? g.note : '', image: g.mine || g.revealed ? g.image : '' });
async function fingerprint(salt, text, note) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}|${text}|${note}`));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const guessImage = (x) => (/^https:\/\/static\.tvmaze\.com\/[\w/.-]+$/.test(x || '') ? x : '');
async function lockGuess(msg) {
  const text = str(msg.text, 80).trim();
  if (!text) return null;
  const note = str(msg.note, 200).trim();
  const salt = crypto.randomUUID();
  const g = {
    id: crypto.randomUUID(), show: str(msg.show, 100), showName: str(msg.showName, 100), ep: str(msg.ep, 40),
    vt: typeof msg.vt === 'number' ? msg.vt : null, by: str(msg.by, 30), mine: true, room: status.room, at: Date.now(),
    text, note, image: guessImage(msg.image), salt, hash: await fingerprint(salt, text, note), revealed: false, verified: true, verdict: null,
  };
  await changeGuesses((list) => list.push(g));
  send({ type: 'guess-lock', id: g.id, show: g.show, showName: g.showName, ep: g.ep, vt: g.vt, by: g.by, at: g.at, hash: g.hash });
  return guessView(g);
}
function theirGuess(msg) {
  const id = str(msg.id, 80);
  if (!id) return;
  changeGuesses((list) => {
    if (list.some((g) => g.id === id)) return;
    list.push({ id, show: str(msg.show, 100), showName: str(msg.showName, 100), ep: str(msg.ep, 40), vt: typeof msg.vt === 'number' ? msg.vt : null,
      by: str(msg.by, 30), mine: false, room: status.room, at: Number(msg.at) || Date.now(), hash: str(msg.hash, 64),
      text: '', note: '', image: '', revealed: false, verified: false, verdict: null });
  });
}
function wantReveal(who, show) {
  if (!show) return;
  const w = (revealWants[show] ||= { me: false, them: false });
  w[who] = true;
  if (who === 'me') send({ type: 'guess-reveal-ask', show });
  panels({ type: 'guesses-changed' });
  if (!w.me || !w.them) return;
  delete revealWants[show];
  // Both want to see: open ours.
  changeGuesses((list) => {
    for (const g of list) {
      if (g.mine && g.show === show && !g.revealed) {
        g.revealed = true;
        send({ type: 'guess-open', id: g.id, text: g.text, note: g.note, image: g.image, salt: g.salt });
      }
    }
  });
}
function openTheirGuess(msg) {
  const id = str(msg.id, 80);
  changeGuesses(async (list) => {
    const g = list.find((x) => x.id === id && !x.mine);
    if (!g || g.revealed) return;
    g.text = str(msg.text, 80);
    g.note = str(msg.note, 200);
    g.image = guessImage(msg.image);
    g.revealed = true;
    g.verified = (await fingerprint(str(msg.salt, 80), g.text, g.note)) === g.hash;
  });
}
function setVerdict(id, verdict, share) {
  changeGuesses((list) => {
    const g = list.find((x) => x.id === id);
    if (!g || !g.revealed) return;
    g.verdict = verdict;
    // Only one answer per episode: marking one guess right settles the others from the same round
    // (the same name is right too, anything else is wrong).
    if (verdict === 'right') {
      const same = (x) => String(x || '').trim().toLowerCase();
      for (const x of list) {
        if (x === g || !x.revealed || x.show !== g.show || (x.ep || '') !== (g.ep || '') || Math.abs((x.at || 0) - (g.at || 0)) > 3 * 3600 * 1000) continue;
        x.verdict = same(x.text) === same(g.text) ? 'right' : 'wrong';
      }
    }
    if (share) send({ type: 'guess-verdict', id, verdict });
  });
}

// ---- Tonight: swipe to match ----
// One of you deals a deck of shows; you each swipe on your own; a show you both say yes to is a match.
// The deck and both sides' answers are kept here, so the other person can swipe later.
async function readMatch() {
  return (await chrome.storage.local.get('matchDeck')).matchDeck || null;
}
let matchWrite = Promise.resolve();
function changeMatch(fn) {
  const run = matchWrite.then(readMatch).then(async (m) => {
    const next = await fn(m);
    if (next) await chrome.storage.local.set({ matchDeck: next });
    panels({ type: 'match-changed' });
    return next;
  });
  matchWrite = run.catch(console.error);
  return run;
}
const cleanCard = (c) => c && {
  id: str(c.id, 80),
  kind: c.kind === 'continue' || c.kind === 'movie' ? c.kind : 'show',
  title: str(c.title, 120),
  sub: str(c.sub, 160),
  summary: str(c.summary, 300),
  image: /^https:\/\/(static\.tvmaze\.com|upload\.wikimedia\.org|image\.tmdb\.org)\//.test(c.image || '') ? str(c.image, 600) : '',
  url: /^https:\/\//.test(c.url || '') ? str(c.url, 600) : '',
  where: str(c.where, 40),
};
function startDeck(msg) {
  const cards = (Array.isArray(msg.cards) ? msg.cards : []).slice(0, 30).map(cleanCard).filter((c) => c?.id && c.title);
  if (!cards.length) return Promise.resolve(null);
  return changeMatch(() => {
    const deck = { id: crypto.randomUUID(), by: str(msg.by, 30), byMe: true, at: Date.now(), room: status.room, cards, mine: {}, theirs: {} };
    send({ type: 'match-deck', id: deck.id, by: deck.by, cards });
    return deck;
  });
}
function theirDeck(msg) {
  const cards = (Array.isArray(msg.cards) ? msg.cards : []).slice(0, 30).map(cleanCard).filter((c) => c?.id && c.title);
  if (!cards.length) return;
  changeMatch(() => ({ id: str(msg.id, 80), by: str(msg.by, 30), byMe: false, at: Date.now(), room: status.room, cards, mine: {}, theirs: {} }));
}
function voteCard(card, yes, mine, deckId) {
  return changeMatch((m) => {
    if (!m || !m.cards.some((c) => c.id === card)) return null;
    if (!mine && deckId && deckId !== m.id) return null;
    (mine ? m.mine : m.theirs)[card] = yes;
    if (mine) send({ type: 'match-vote', id: m.id, card, yes });
    return m;
  });
}

// ---- Watch streak ----
// Each day you're in a party together counts; two or more days in a row get a small celebration
// (once a day), on the video and in the chat.
async function noteTogether() {
  const day = (d) => d.toLocaleDateString('en-CA'); // YYYY-MM-DD, local
  const today = day(new Date());
  const { togetherDays = [], streakCheered = '' } = await chrome.storage.local.get(['togetherDays', 'streakCheered']);
  const days = [...new Set([...togetherDays, today])].sort().slice(-60);
  let streak = 0;
  for (let d = new Date(); days.includes(day(d)); d.setDate(d.getDate() - 1)) streak += 1;
  const cheer = streak >= 2 && streakCheered !== today;
  await chrome.storage.local.set({ togetherDays: days, ...(cheer ? { streakCheered: today } : {}) });
  if (cheer) setTimeout(() => broadcastLocal({ local: true, type: 'bantay-streak', days: streak }), 2500);
}

// ---- Stop for tonight ----
// Either of you (or the phone) stops for the night: both pause and the spot is saved, so the sidebar
// can offer to pick up there next time.
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
  watch = {
    tabId,
    url: tab.url || watch.url,
    title: tab.title || watch.title,
    favIconUrl: tab.favIconUrl || watch.favIconUrl,
  };
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
// Kept here, not in the sidebar, so messages that arrive while it's closed are there when it reopens.
let historyWrite = Promise.resolve();
function remember(msg) {
  const entry = {
    id: msg.id,
    name: msg.name,
    text: msg.text,
    avatar: msg.avatar,
    vt: msg.vt,
    mine: msg.mine,
    at: Date.now(),
  };

  // A locked "Who did it?" guess shows as a sealed card (its contents live in the guesses store).
  if (msg.guess?.id) entry.guess = { id: str(msg.guess.id, 80) };
  // A shared watch guide shows as a card with an Open button.
  if (msg.guide?.id)
    entry.guide = {
      id: str(msg.guide.id, 200),
      show: str(msg.guide.show, 100),
      topic: str(msg.guide.topic, 60),
      count: Number(msg.guide.count) || 0,
    };
  historyWrite = historyWrite
    .then(() => chrome.storage.local.get('history'))
    .then(({ history = [] }) => chrome.storage.local.set({ history: [...history, entry].slice(-HISTORY_LIMIT) }))
    .catch(console.error);
}

// ---- The call page ----
// Calls run in an offscreen document, so they survive the sidebar closing or reloading (Chrome does that
// around fullscreen) and the show's tab navigating. It's started for a call and closed a while after.
const callPort = () => [...ports].find((p) => p.name === 'call');
let callStarting = null;
let callWaiters = [];
const callQueue = [];
const CALL_SETTINGS = ['name', 'server', 'cameraId', 'micId', 'micOn', 'duckLevel', 'voiceVol'];
function ensureCallPage() {
  if (callPort()) return Promise.resolve();
  callStarting ||= (async () => {
    clearTimeout(callCloseTimer);
    const exists = await chrome.offscreen.hasDocument?.().catch(() => false);
    if (!exists) {
      await chrome.offscreen
        .createDocument({
          url: 'offscreen.html',
          reasons: ['WEB_RTC', 'USER_MEDIA'],
          justification: 'Keeps your watch-party call going when the sidebar closes or the video goes fullscreen.',
        })
        .catch((e) => {
          if (!/single offscreen/i.test(e?.message || '')) throw e; // (already being created)
        });
    }
    if (!callPort()) await new Promise((resolve, reject) => {
      callWaiters.push(resolve);
      setTimeout(() => reject(new Error('call page did not start')), 8000);
    });
  })().finally(() => (callStarting = null));
  return callStarting;
}
async function callConnected(port) {
  const values = await chrome.storage.local.get(CALL_SETTINGS);
  postTo(port, { type: 'call-config', config: values });
  for (const msg of callQueue.splice(0)) postTo(port, msg);
  callWaiters.splice(0).forEach((r) => r());
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !CALL_SETTINGS.some((k) => k in changes)) return;
  const port = callPort();
  if (!port) return;
  const config = Object.fromEntries(CALL_SETTINGS.filter((k) => k in changes).map((k) => [k, changes[k].newValue]));
  postTo(port, { type: 'call-config', config });
});
// Closed two minutes after the last call or ring ends (started again for the next one).
let callCloseTimer = null;
function callBusy(busy) {
  clearTimeout(callCloseTimer);
  if (busy) return;
  callCloseTimer = setTimeout(() => chrome.offscreen.closeDocument?.().catch(() => {}), 120000);
}

// ---- Incoming calls while the sidebar is closed ----
// The call lives in the sidebar. If it's closed when they call, ring on the show's tab and with a
// notification; opening the sidebar picks the call up.
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
  chrome.notifications?.create(
    'sinehan-call',
    {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: `${pendingCall.name} is calling`,
      message: 'Open Sinehan to answer.',
      requireInteraction: true,
      priority: 2,
    },
    () => void chrome.runtime.lastError,
  );
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
// if nothing comes back for a while we drop it ourselves and reconnect.
const SILENCE_LIMIT = 15000; // no pong for this long: the connection is dead (Wi-Fi gone, laptop slept)
let retrying = false; // lost the connection and trying to get it back
let retryCount = 0;
function connect(server, room) {
  disconnect();
  status = { connected: false, peers: 0, room, server };
  const sock = (ws = new WebSocket(server));
  let lastHeard = Date.now();
  let answersPings = false; // relays that don't answer pings rely on the socket closing instead

  // A connection that never opens (stuck handshake) is retried instead of waited on.
  const openTimer = setTimeout(() => {
    if (ws === sock && sock.readyState !== WebSocket.OPEN) {
      sock.onclose = null;
      sock.close();
      lost();
    }
  }, 8000);
  sock.onopen = () => {
    clearTimeout(openTimer);
    retryCount = 0;
    status.connected = true;
    retrying = false;
    lastHeard = Date.now();
    sock.send(JSON.stringify({ type: 'join', room }));
    chrome.storage.local.set({ aliveAt: Date.now() });
    broadcastLocal({ type: 'connection', up: true });

    // Keeps the connection (and this service worker) alive, and detects a silently dead one.
    pingTimer = setInterval(() => {
      send({ type: 'ping' });
      if (answersPings && Date.now() - lastHeard > SILENCE_LIMIT) {
        sock.onclose = null;
        sock.close();
        lost();
      }
    }, 5000);
  };

  sock.onmessage = (e) => {
    lastHeard = Date.now();
    let msg;
    try {
      msg = JSON.parse(e.data);
    } catch {
      return;
    }
    if (msg.type === 'pong') {
      answersPings = true;
      return;
    }

    // The room is full: tell the sidebar and stop trying.
    if (msg.type === 'room-full') {
      for (const port of ports) if (port.name === 'panel') postTo(port, msg);
      chrome.storage.local.set({ active: false });
      disconnect();
      return;
    }
    if (msg.type === 'joined' || msg.type === 'peer') status.peers = msg.count;
    if ((msg.type === 'joined' && msg.count > 1) || (msg.type === 'peer' && msg.joined)) noteTogether();
    if (msg.type === 'joined' && msg.count > 1) setTimeout(announceShow, 500); // let a returning partner know
    if (msg.type === 'peer' && msg.joined) setTimeout(announceShow, 500);
    if (msg.type === 'companion-hello') setTimeout(announceShow, 300); // a phone joined: tell it what's on
    if (msg.type === 'mic' && !callPort() && callQueue.length) callQueue.push(msg); // a call is starting up here
    if (msg.type === 'rtc') {
      onCallSignal(msg);
      // An incoming call with no call page yet: start it, and hand it the messages once it's up.
      if (!callPort()) {
        if (callQueue.length < 100) callQueue.push(msg);
        ensureCallPage().catch(console.error);
        return;
      }
    }
    if (msg.type === 'goodnight') saveSpot(msg);
    // "Reveal" from your own phone counts as your tap.
    if (msg.type === 'phone-reveal')
      chrome.storage.local.get('name').then(({ name }) => name && name === msg.for && wantReveal('me', str(msg.show, 100)));
    if ((msg.type === 'joined' && msg.count > 1) || (msg.type === 'peer' && msg.joined)) shareGuides();

    // Tell the relay about this party's guides, so their pages can sync even before anyone ticks.
    if (msg.type === 'joined') {
      guidesWrite.then(readGuides).then((list) => {
        const ids = list.filter((g) => g.room === status.room).map((g) => g.id);
        if (ids.length) send({ type: 'guide-channels', ids });
      });
    }
    if (msg.type === 'guide-sync') {
      const g = cleanGuide(msg.guide);
      if (g) {
        g.room = status.room; // sent within this party
        saveGuides([g], false, 'them');
      }
    }
    if (msg.type === 'guide-add') addFromPage(msg);
    if (msg.type === 'guess-lock') theirGuess(msg);
    if (msg.type === 'match-deck') theirDeck(msg);
    if (msg.type === 'match-vote') voteCard(str(msg.card, 80), !!msg.yes, false, str(msg.id, 80));
    if (msg.type === 'guess-reveal-ask') wantReveal('them', str(msg.show, 100));
    if (msg.type === 'guess-open') openTheirGuess(msg);
    if (msg.type === 'guess-verdict') setVerdict(str(msg.id, 80), msg.verdict === 'right' ? 'right' : msg.verdict === 'wrong' ? 'wrong' : null, false);
    if (msg.type === 'guide-art') {
      const art = cleanArt(msg);
      guidesWrite = guidesWrite
        .then(readGuides)
        .then(async (list) => {
          const g = list.find((x) => x.id === msg.id && x.room === status.room);
          if (!g || (g.art?.at || 0) >= art.at) return;
          g.art = art;
          await chrome.storage.local.set({ guides: list });
        })
        .catch(console.error);
    }
    if (msg.type === 'guide-tick')
      tickGuide({ id: str(msg.id, 200), key: str(msg.key, 104), v: !!msg.v, at: Number(msg.at) || Date.now() }, false);
    if (msg.type === 'chat') {
      remember({ ...msg, mine: false });

      // Tells the show's tab whether to flash it on the video (sidebar closed or hidden by fullscreen).
      msg.panelOpen = [...ports].some((p) => p.name === 'panel');
    }
    for (const port of ports) if (wantsMessage(port)) postTo(port, msg);
  };

  // Dropped connection (not Leave; disconnect() unhooks this first): tell the tabs to pause, then retry.
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
      // Quick first retries (a blip), then backing off so a dead network isn't hammered.
      const wait = [400, 1000, 2000, 4000, 8000][Math.min(retryCount++, 4)];
      setTimeout(() => ws === sock && connect(server, room), wait);
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
