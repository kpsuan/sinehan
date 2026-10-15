// End-to-end test: two (sometimes three) real Chromium browsers with the extension loaded,
// talking through a local relay, playing a local test video. Run: npm test (in /tests).
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const EXT = path.resolve(__dirname, '../extension');
const SERVER = path.resolve(__dirname, '../server/server.js');
const RELAY_PORT = 18090;
const SITE_PORT = 18091;
const RELAY = `ws://localhost:${RELAY_PORT}`;
const SITE = `http://localhost:${SITE_PORT}`;

// ---------- tiny test harness ----------
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${!ok && detail ? `  -> ${detail}` : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, timeout = 6000, step = 100) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      last = await fn();
      if (last) return last;
    } catch (e) {
      last = e.message;
    }
    await sleep(step);
  }
  return false;
}
function section(title) {
  console.log(`\n== ${title}`);
}

// ---------- local test site: a page with a playable <video> ----------
function makeWav(seconds = 120, rate = 8000) {
  const samples = seconds * rate;
  const buf = Buffer.alloc(44 + samples * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + samples * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) buf.writeInt16LE(Math.round(Math.sin(i / 20) * 200), 44 + i * 2);
  return buf;
}
const WAV = makeWav();
const VIDEO_PAGE = `<!doctype html><html><body style="margin:0;background:#3a3150">
<div id="player" style="width:640px;height:360px;position:relative;background:#111">
  <video id="v" src="/tone.wav" preload="auto" style="width:100%;height:100%"></video>
</div>
<video id="decoy" src="/tone.wav" preload="auto" style="width:80px;height:45px"></video>
<button id="fs" onclick="document.getElementById('player').requestFullscreen()">fs</button>
<script>
  window.__keys = 0; document.addEventListener('keydown', () => window.__keys++);
  window.__events = []; const v = document.getElementById('v');
  for (const t of ['play','pause','seeked']) v.addEventListener(t, () => window.__events.push(t));
</script></body></html>`;
const site = http.createServer((req, res) => {
  if (req.url.startsWith('/tone.wav')) {
    // Range support so the media element can seek.
    const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
    if (range) {
      const start = +range[1];
      const end = range[2] ? +range[2] : WAV.length - 1;
      res.writeHead(206, { 'content-type': 'audio/wav', 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${WAV.length}`, 'content-length': end - start + 1 });
      return res.end(WAV.subarray(start, end + 1));
    }
    res.writeHead(200, { 'content-type': 'audio/wav', 'accept-ranges': 'bytes', 'content-length': WAV.length });
    return res.end(WAV);
  }
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(VIDEO_PAGE);
});

// ---------- relay (the real server.js) ----------
let relay = null;
function startRelay() {
  relay = spawn(process.execPath, [SERVER], { env: { ...process.env, PORT: String(RELAY_PORT), KLIPY_API_KEY: '' }, stdio: 'ignore' });
  return sleep(700);
}
function stopRelay() {
  relay?.kill();
  relay = null;
  return sleep(300);
}

// ---------- browsers ----------
const pageErrors = [];
async function launch(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `sinehan-${label}-`));
  const ctx = await chromium.launchPersistentContext(dir, {
    channel: 'chromium',
    headless: true,
    permissions: ['clipboard-read', 'clipboard-write'],
    args: [
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const extId = sw.url().split('/')[2];
  const watch = (p) => {
    p.on('pageerror', (e) => pageErrors.push(`[${label}] ${p.url()}: ${e.message}`));
    // Chrome logs blocked extension-resource loads (e.g. fonts) as console errors, not page errors.
    p.on('console', (m) => {
      if (m.type() === 'error' && /chrome-extension:|Unsafe attempt/i.test(m.text())) pageErrors.push(`[${label}] ${p.url()}: ${m.text()}`);
    });
  };
  ctx.pages().forEach(watch);
  ctx.on('page', watch);
  return { label, ctx, extId };
}

async function openPanel(user) {
  const p = await user.ctx.newPage();
  await p.goto(`chrome-extension://${user.extId}/sidepanel.html`);
  await p.waitForSelector('#avatars button', { state: 'attached' });
  return p;
}
async function openVideo(user) {
  const p = await user.ctx.newPage();
  await p.goto(`${SITE}/watch`);
  await p.waitForFunction(() => document.getElementById('v').readyState >= 1);
  await sleep(2500); // content script attaches on a 1s interval, then the tab is picked as the show
  return p;
}
async function connect(panel, name, room, server = RELAY) {
  if (!(await panel.$eval('#settings', (d) => d.open))) await panel.click('#settingsBtn');
  await panel.$eval('#advanced', (d) => (d.open = true));
  await panel.fill('#name', name);
  await panel.fill('#server', server);
  await panel.fill('#room', room);
  await panel.click('#connect');
}
async function leave(panel) {
  if (!(await panel.$eval('#settings', (d) => d.open))) await panel.click('#settingsBtn');
  await panel.click('#disconnect');
  await until(async () => (await panel.$eval('#disconnect', (b) => b.textContent)) === 'Leave', 4000); // past the "Leaving…" moment
}
const text = (p, sel) => p.$eval(sel, (el) => el.textContent.trim());
const logLines = (p) => p.$$eval('#log .line', (ls) => ls.map((l) => ({ cls: l.className, text: l.textContent.trim() })));
async function chat(panel, msg) {
  await panel.fill('#msg', msg);
  await panel.press('#msg', 'Enter');
}
const shown = (p, re) => p.evaluate((src) => [...document.querySelectorAll('[data-sinehan]')].some((e) => new RegExp(src).test(e.textContent)), re.source);
const showingIn = (p) => p.evaluate(() => [...document.querySelectorAll('[data-sinehan]')].some((e) => /is calling/.test(e.textContent) && getComputedStyle(e).opacity !== '0'));
const vstate = (p) => p.evaluate(() => { const v = document.getElementById('v'); return { paused: v.paused, t: v.currentTime }; });

// =====================================================================
(async () => {
  await new Promise((r) => site.listen(SITE_PORT, r));
  await startRelay();
  const A = await launch('A');
  const B = await launch('B');
  let C = null;

  try {
    // ---------------------------------------------------------------
    section('Connecting & profiles');
    let pA = await openPanel(A);
    const pB = await openPanel(B);
    check('fresh sidebar shows "Not connected"', (await text(pA, '#status')) === 'Not connected');
    await pA.click('#settingsBtn'); // close Settings to see the first screen
    check('first screen is the welcome screen', await pA.$eval('#welcome', (w) => !w.hidden) && await pA.$eval('.chat', (c) => getComputedStyle(c).display === 'none'));
    await pA.fill('#wlName', 'Alice');
    check('welcome: name is saved like in Settings', (await pA.inputValue('#name')) === 'Alice');
    await pA.fill('#wlLink', 'not a link');
    await pA.press('#wlLink', 'Enter');
    check('welcome: a bad invite link is explained', await pA.$eval('#wlError', (e) => !e.hidden));
    await pA.click('#settingsBtn');
    check('Start call disabled before connecting', await pA.$eval('#start', (b) => b.disabled));

    await connect(pA, 'Alice', 'r1');
    check('A waits alone in the room', await until(async () => (await text(pA, '#status')) === 'Waiting for them to join'));
    check('settings collapse after connecting', await until(() => pA.$eval('#settings', (d) => !d.open)));
    check('gear reflects settings closed', (await pA.$eval('#settingsBtn', (b) => b.getAttribute('aria-pressed'))) === 'false');

    if (await pB.$eval('#settings', (d) => d.open)) await pB.click('#settingsBtn');
    await pB.fill('#wlName', 'Bob');
    await pB.fill('#wlLink', `http://localhost:${RELAY_PORT}/join?room=r1&n=Alice&a=0`);
    await pB.press('#wlLink', 'Enter');
    check('welcome: pasting an invite link joins the party', await until(async () => (await text(pB, '#status')) !== 'Not connected'));
    check('…and the welcome screen gives way to the call and chat', await until(() => pB.$eval('#welcome', (w) => w.hidden)));
    check('both show "Together"', await until(async () => (await text(pA, '#status')) === 'Together' && (await text(pB, '#status')) === 'Together'));
    check('A header shows both names', await until(async () => (await text(pA, '#names')) === 'Alice & Bob'), await text(pA, '#names'));
    check('B header shows both names', await until(async () => (await text(pB, '#names')) === 'Bob & Alice'), await text(pB, '#names'));
    check('Start call enabled when both are here', await until(() => pA.$eval('#start', (b) => !b.disabled)));

    // The reported bug: renaming didn't update the header.
    await pA.click('#settingsBtn');
    await pA.fill('#name', 'fran');
    check('rename: own header updates immediately', (await text(pA, '#names')) === 'fran & Bob', await text(pA, '#names'));
    check('rename: other side updates', await until(async () => (await text(pB, '#names')) === 'Bob & fran'), await text(pB, '#names'));
    await pA.reload();
    await pA.waitForSelector('#avatars button', { state: 'attached' });
    check('rename survives sidebar reload', await until(async () => (await pA.inputValue('#name')) === 'fran' && (await text(pA, '#names')).startsWith('fran')));

    await pA.click('#settingsBtn');
    await pA.click('#avatars button:nth-child(3)');
    check('avatar: own picker selection', await pA.$eval('#avatars button:nth-child(3)', (b) => b.classList.contains('selected')));
    check('avatar: other side sees new picture', await until(() => pB.$eval('#who .avatar:nth-child(2) img', (i) => i.src.endsWith('avatars/3.png'))));
    check('avatar images load', await until(() => pB.$$eval('#who img', (is) => is.every((i) => i.complete && i.naturalWidth > 0))));
    await pA.click('#settingsBtn');

    // ---------------------------------------------------------------
    section('Chat');
    await chat(pA, 'hello there');
    check('chat: B receives', await until(async () => (await logLines(pB)).some((l) => l.cls.includes('them') && l.text.includes('hello there'))));
    check('chat: A sees own message as "me"', (await logLines(pA)).some((l) => l.cls.includes('me') && l.text.includes('hello there')));
    check('chat: input cleared after send', (await pA.inputValue('#msg')) === '');
    const before = (await logLines(pA)).length;
    await chat(pA, '   ');
    check('chat: blank message not sent', (await logLines(pA)).length === before);

    await chat(pB, '<img src=x onerror="window.__xss=1">');
    await until(async () => (await logLines(pA)).some((l) => l.text.includes('<img src=x')));
    check('chat: HTML shows as text (no injection)', await pA.evaluate(() => !window.__xss && ![...document.querySelectorAll('#log .msg img')].length));

    await chat(pB, '😂');
    check('chat: emoji-only shows big', await until(() => pA.$$eval('#log .msg.big', (m) => m.some((x) => x.textContent.includes('😂')))));
    await chat(pB, 'lol 😂');
    await sleep(400);
    check('chat: text + emoji is a normal bubble', await pA.$$eval('#log .msg', (m) => m.some((x) => x.textContent.includes('lol 😂') && !x.classList.contains('big'))));
    const long = 'x'.repeat(600);
    await pA.fill('#msg', long);
    check('chat: message capped at 500 chars', (await pA.inputValue('#msg')).length === 500);
    await pA.fill('#msg', '');

    await pB.click('#emojiBtn');
    check('emoji tray opens', await pB.$eval('#emojiTray', (t) => !t.hidden));
    await pB.click('#emojiGrid .emoji-grid button:first-child');
    check('emoji grid inserts into message box', (await pB.inputValue('#msg')).length > 0);
    await pB.fill('#msg', '');
    await pB.keyboard.press('Escape');
    check('Escape closes emoji tray', await pB.$eval('#emojiTray', (t) => t.hidden));

    await pA.reload();
    await pA.waitForSelector('#avatars button', { state: 'attached' });
    const histA = await until(async () => { const l = await logLines(pA); return l.length >= 4 ? l : false; });
    check('history: restored after sidebar reload', histA && histA.some((l) => l.text.includes('hello there')));
    check('history: no duplicates', histA && histA.filter((l) => l.text.includes('hello there')).length === 1);
    check('history: own messages still "me"', histA && histA.some((l) => l.cls.includes('me') && l.text.includes('hello there')));

    // ---------------------------------------------------------------
    section('Playback sync');
    const vA = await openVideo(A);
    const vB = await openVideo(B);
    check('test video loads', (await vA.evaluate(() => document.getElementById('v').duration)) > 60);

    await vA.evaluate(() => document.getElementById('v').play());
    check('play on A plays on B', await until(async () => !(await vstate(vB)).paused));
    await sleep(800);
    await vA.evaluate(() => document.getElementById('v').pause());
    check('pause on A pauses on B', await until(async () => (await vstate(vB)).paused));
    await vA.evaluate(() => { document.getElementById('v').currentTime = 42; });
    check('seek on A seeks B', await until(async () => Math.abs((await vstate(vB)).t - 42) < 1.5), JSON.stringify(await vstate(vB)));
    await vB.evaluate(() => document.getElementById('v').play());
    check('play on B plays on A (both directions)', await until(async () => !(await vstate(vA)).paused));
    await vB.evaluate(() => document.getElementById('v').pause());
    await until(async () => (await vstate(vA)).paused);

    // No echo: after one action, things settle instead of bouncing back and forth.
    await vA.evaluate(() => (window.__events = []));
    await vB.evaluate(() => (window.__events = []));
    await vA.evaluate(() => { document.getElementById('v').currentTime = 60; });
    await sleep(3000);
    const evA = await vA.evaluate(() => window.__events);
    const evB = await vB.evaluate(() => window.__events);
    check('no echo loop after a seek', evA.length <= 2 && evB.length <= 2, `A=${evA} B=${evB}`);

    // Hidden/small decoy videos must not hijack sync.
    await vA.evaluate(() => document.getElementById('decoy').play());
    await sleep(1500);
    check('small decoy <video> is ignored', (await vstate(vB)).paused, JSON.stringify({ A: await vstate(vA), B: await vstate(vB), evA: await vA.evaluate(() => window.__events), evB: await vB.evaluate(() => window.__events) }));
    await vA.evaluate(() => document.getElementById('decoy').pause());

    // Late join: B reloads the page and should land where A is.
    await vA.evaluate(() => { document.getElementById('v').currentTime = 75; });
    await sleep(1200);
    await vB.reload();
    await vB.waitForFunction(() => document.getElementById('v').readyState >= 1);
    check('reloaded page catches up to the other side', await until(async () => Math.abs((await vstate(vB)).t - 75) < 2, 8000), JSON.stringify(await vstate(vB)));

    // ---------------------------------------------------------------
    section('Ads');
    // Simulates a streaming site's on-screen ad label inside the player.
    const showAd = (p, on) => p.evaluate((on) => {
      let el = document.getElementById('adlabel');
      if (on && !el) {
        el = document.createElement('span');
        el.id = 'adlabel';
        el.textContent = 'Ad 1 of 2';
        el.style.cssText = 'position:absolute;top:8px;left:8px;color:#fff';
        document.getElementById('player').append(el);
      }
      if (!on) el?.remove();
    }, on);
    const both = async () => JSON.stringify({ A: await vstate(vA), B: await vstate(vB) });

    await vA.evaluate(() => { document.getElementById('v').currentTime = 50; });
    await until(async () => Math.abs((await vstate(vB)).t - 50) < 1.5);
    await vA.evaluate(() => document.getElementById('v').play());
    await until(async () => !(await vstate(vB)).paused);
    await showAd(vA, true);
    check('ad on A pauses B', await until(async () => (await vstate(vB)).paused, 4000), await both());
    check('B is told it’s an ad', await until(() => vB.evaluate(() => [...document.querySelectorAll('[data-sinehan]')].some((e) => /ad/i.test(e.textContent)))));
    const bTime = (await vstate(vB)).t;
    await vA.evaluate(() => { document.getElementById('v').currentTime = 2; }); // the ad's own playback position
    await sleep(1500);
    check('ad position is never sent to B', Math.abs((await vstate(vB)).t - bTime) < 1, await both());
    check('A keeps playing its ad', !(await vstate(vA)).paused);
    await showAd(vA, false);
    check('ad over: B resumes', await until(async () => !(await vstate(vB)).paused, 5000), await both());
    check('ad over: A jumps back to where B is', await until(async () => { const a = await vstate(vA); const b = await vstate(vB); return a.t > 40 && Math.abs(a.t - b.t) < 1.5; }, 5000), await both());

    // Both get ads: whoever finishes first waits for the other.
    await showAd(vA, true);
    await until(async () => (await vstate(vB)).paused, 4000);
    await showAd(vB, true);
    await sleep(1500);
    await showAd(vA, false);
    check('both ads: first one done waits paused', await until(async () => (await vstate(vA)).paused, 4000), await both());
    await sleep(1000);
    check('…and keeps waiting while the other’s ad runs', (await vstate(vA)).paused);
    await showAd(vB, false);
    check('both ads: both resume together', await until(async () => { const a = await vstate(vA); const b = await vstate(vB); return !a.paused && !b.paused && Math.abs(a.t - b.t) < 1.5; }, 6000), await both());

    // Someone who paused on purpose stays paused after the other’s ad.
    await vA.evaluate(() => document.getElementById('v').pause());
    await until(async () => (await vstate(vB)).paused);
    await showAd(vA, true);
    await sleep(1500);
    await showAd(vA, false);
    await sleep(2500);
    check('manual pause is kept after the other’s ad', (await vstate(vB)).paused, await both());
    check('no false ad detection on a normal page', !(await vB.evaluate(() => [...document.querySelectorAll('[data-sinehan]')].some((e) => e.textContent.includes('Ad playing')))));

    // ---------------------------------------------------------------
    section('Reactions & notices on the video');
    await chat(pA, '🔥');
    check('emoji floats over B’s video', await until(() => vB.evaluate(() => [...document.body.children].some((e) => e.textContent === '🔥'))));
    check('overlay font (Inter) loads on the page', await until(() => vB.evaluate(() => document.fonts.check('13px WatchPartyInter'))));
    check('own emoji does not float on A’s video', !(await vA.evaluate(() => [...document.body.children].some((e) => e.textContent === '🔥'))));

    await pB.close(); // B's sidebar closed
    await sleep(500);
    await chat(pA, 'are you there?');
    check('sidebar closed: message shows as a notice on the video', await until(() => vB.evaluate(() => [...document.body.querySelectorAll('div')].some((d) => d.textContent.includes('are you there?')))));
    let pB2 = await openPanel(B);
    check('sidebar closed: message is waiting in history', await until(async () => (await logLines(pB2)).some((l) => l.text.includes('are you there?'))));

    // ---------------------------------------------------------------
    section('Video call');
    await until(() => pB2.$eval('#start', (b) => !b.disabled));
    await pA.click('#start');
    check('caller sees own camera', await until(() => pA.$eval('#local', (v) => !v.hidden && v.videoWidth > 0), 8000));
    check('callee gets "Join with camera"', await until(() => pB2.$eval('#join', (b) => !b.hidden), 8000));
    check('incoming call rings: "is calling" with Decline', await until(async () => (await text(pB2, '#phText')).includes('is calling') && await pB2.$eval('#decline', (b) => !b.hidden)));
    check('callee already sees caller', await until(() => pB2.$eval('#remote', (v) => v.videoWidth > 0), 10000));
    await pB2.click('#join');
    check('caller sees callee', await until(() => pA.$eval('#remote', (v) => v.videoWidth > 0), 10000));
    check('call controls visible', await pA.$eval('#mic', (b) => !b.hidden) && await pA.$eval('#hangup', (b) => !b.hidden));
    check('calls start with the mic off (released)', await pA.$eval('#mic', (b) => b.classList.contains('off')));
    check('they see a "Mic off" badge on your video', await until(() => pB2.$eval('#remoteMic', (b) => !b.hidden)));
    check('you get a hint that your mic is off', (await logLines(pA)).some((l) => l.text.includes('Your mic is off')));
    await pA.click('#mic');
    check('mic turns on', await until(() => pA.$eval('#mic', (b) => !b.classList.contains('off'))));
    check('…and their "Mic off" badge goes away', await until(() => pB2.$eval('#remoteMic', (b) => b.hidden)));
    check('…and the other side receives audio', await until(() => pB2.evaluate(() => document.getElementById('remote').srcObject?.getAudioTracks().some((t) => t.readyState === 'live')), 8000));
    // Audio really flows (bytes arriving), in both directions.
    const audioIn = (p) => p.evaluate(async () => {
      let bytes = 0;
      (await pc.getStats()).forEach((r) => { if (r.type === 'inbound-rtp' && r.kind === 'audio') bytes += r.bytesReceived || 0; });
      return bytes;
    });
    const flowing = async (p) => { const b1 = await audioIn(p); await sleep(1500); return (await audioIn(p)) > b1 + 500; };
    check('B actually hears A (audio bytes arriving)', await until(() => flowing(pB2), 10000));
    await pB2.click('#mic');
    check('B turns their mic on too', await until(() => pB2.$eval('#mic', (b) => !b.classList.contains('off'))));
    check('A actually hears B', await until(() => flowing(pA), 10000));
    await pB2.click('#mic');
    await pA.click('#mic');
    check('mic turns off again', await until(() => pA.$eval('#mic', (b) => b.classList.contains('off'))));
    check('…and is really released', await pA.evaluate(() => !document.getElementById('local').srcObject?.getAudioTracks().length));

    // Settings lists the real camera/mic and switches mid-call.
    await pA.click('#settingsBtn');
    const cams = await until(async () => { const o = await pA.$$eval('#camSelect option', (os) => os.map((x) => ({ v: x.value, t: x.textContent }))); return o.length > 1 ? o : false; });
    check('settings lists cameras by name', cams && cams.some((o) => o.v && /fake|camera/i.test(o.t)), JSON.stringify(cams));
    check('settings lists microphones', (await pA.$$eval('#micSelect option', (os) => os.length)) > 1);
    check('no permission prompt needed once allowed', await pA.$eval('#devicePerm', (b) => b.hidden));
    await pA.selectOption('#camSelect', cams.find((o) => o.v).v);
    await sleep(1500);
    check('switching camera mid-call keeps video going', await pA.$eval('#local', (v) => v.videoWidth > 0 && v.srcObject.getVideoTracks()[0].readyState === 'live'));
    check('…and the other side still sees you', await until(() => pB2.$eval('#remote', (v) => v.videoWidth > 0)));
    check('camera choice is remembered', (await pA.evaluate(() => chrome.storage.local.get('cameraId'))).cameraId === cams.find((o) => o.v).v);
    await pA.click('#settingsBtn');

    // ---------------------------------------------------------------
    section('Fullscreen overlay');
    await vB.bringToFront(); // Chrome only allows fullscreen in the active tab
    await vB.click('#fs');
    check('page went fullscreen', await until(() => vB.evaluate(() => !!document.fullscreenElement)));
    check('chat button appears in fullscreen', await until(() => vB.locator('.fab').isVisible()));
    check('her camera appears in fullscreen', await until(() => vB.locator('.cam video').evaluate((v) => v.videoWidth > 0 && !v.parentElement.hidden), 10000));

    // The floating camera: drag it, it grows on hover, and its buttons run your mic/camera.
    const camPos = () => vB.locator('.cam').evaluate((c) => ({ x: c.offsetLeft, y: c.offsetTop }));
    const start = await camPos();
    const box = await vB.locator('.cam').boundingBox();
    await vB.mouse.move(box.x + 40, box.y + 40);
    await vB.mouse.down();
    await vB.mouse.move(box.x - 200, box.y + 150, { steps: 8 });
    await vB.mouse.up();
    const moved = await camPos();
    check('camera can be dragged around', start.x - moved.x > 100 && moved.y - start.y > 80, JSON.stringify({ start, moved }));
    check('…and its spot is remembered', await until(async () => !!(await pB2.evaluate(() => chrome.storage.local.get('camPos'))).camPos));
    await vB.mouse.move(box.x - 200 + 60, box.y + 150 + 40);
    check('it grows on hover', await until(() => vB.locator('.cam').evaluate((c) => getComputedStyle(c).transform !== 'none')));
    const micWasOff = await pB2.$eval('#mic', (b) => b.classList.contains('off'));
    await vB.locator('.cam .c-mic').click();
    check('fullscreen mic button toggles your mic', await until(async () => (await pB2.$eval('#mic', (b) => b.classList.contains('off'))) !== micWasOff));
    check('…and the button shows the new state', await until(async () => (await vB.locator('.cam .c-mic').evaluate((b) => b.classList.contains('off'))) !== micWasOff));
    await vB.locator('.cam .c-mic').click();
    await until(async () => (await pB2.$eval('#mic', (b) => b.classList.contains('off'))) === micWasOff);
    await vB.locator('.cam .c-cam').click();
    check('fullscreen camera button turns your camera off', await until(() => pB2.$eval('#cam', (b) => b.classList.contains('off'))));
    check('…which the other side sees', await until(() => vB.locator('.cam .c-cam').evaluate((b) => b.classList.contains('off'))));
    await vB.locator('.cam .c-cam').click();
    check('…and back on', await until(() => pB2.$eval('#cam', (b) => !b.classList.contains('off'))));
    await vB.locator('.fab').click();
    check('fullscreen chat opens with history', await until(async () => (await vB.locator('.panel .log').textContent()).includes('are you there?')));
    const keysBefore = await vB.evaluate(() => window.__keys);
    const playingBefore = (await vstate(vB)).paused;
    await vB.locator('.panel input').fill('');
    await vB.locator('.panel input').pressSequentially('hi from fullscreen f k');
    check('typing does not reach the player’s shortcuts', (await vB.evaluate(() => window.__keys)) === keysBefore && (await vstate(vB)).paused === playingBefore);
    await vB.locator('.panel input').press('Enter');
    check('fullscreen chat sends to the other person', await until(async () => (await logLines(pA)).some((l) => l.text.includes('hi from fullscreen'))));
    check('fullscreen chat also shows in own sidebar as "me"', await until(async () => (await logLines(pB2)).some((l) => l.cls.includes('me') && l.text.includes('hi from fullscreen'))));
    await chat(pA, 'seen in fullscreen?');
    check('incoming chat appears in fullscreen chat', await until(async () => (await vB.locator('.panel .log').textContent()).includes('seen in fullscreen?')));
    await vB.locator('.panel .close').click();
    await chat(pA, 'unread one');
    check('unread badge when fullscreen chat is closed', await until(async () => (await vB.locator('.badge').textContent()) === '1'));
    await vB.locator('.quick button').first().isVisible();
    await vB.locator('.fab').click();
    await vB.locator('.quick button').first().click();
    check('quick reaction from fullscreen reaches the other side', await until(async () => (await logLines(pA)).some((l) => l.text === '😂' || l.text.endsWith('😂'))));
    await vB.locator('.cam').hover();
    await vB.locator('.cam .c-exit').click();
    check('exit button leaves fullscreen', await until(() => vB.evaluate(() => !document.fullscreenElement)));
    check('overlay removed after leaving fullscreen', await until(async () => (await vB.locator('.fab').count()) === 0));

    // ---------------------------------------------------------------
    section('Hang up');
    await pA.click('#hangup');
    check('hang up ends call on both sides', await until(async () => !(await pB2.$eval('#start', (b) => b.hidden)) && !(await pA.$eval('#start', (b) => b.hidden))));
    check('callee told the call ended', (await logLines(pB2)).some((l) => l.text.includes('hung up')));
    check('out of a call, the video area tucks away to just the buttons', await pA.$eval('.call', (c) => c.classList.contains('compact')) && !(await pA.$eval('.stage', (s) => s.checkVisibility())));

    // ---------------------------------------------------------------
    section('Voice call');
    await pA.click('#startVoice');
    check('voice call: they can join with voice', await until(() => pB2.$eval('#joinVoice', (b) => !b.hidden), 8000));
    await pB2.click('#joinVoice');
    check('…both connect, mics on, no cameras', await until(async () => {
      const side = (p) => p.evaluate(() => pc?.connectionState === 'connected' && !!localStream?.getAudioTracks().length && !localStream.getVideoTracks().length);
      return (await side(pA)) && (await side(pB2));
    }, 15000));
    check('…with a short stage instead of the video area', await pA.$eval('.call', (c) => c.classList.contains('voice')));
    await pA.click('#cam');
    check('turning the camera on mid-call shows them your video', await until(() => pB2.$eval('#remote', (v) => v.videoWidth > 0), 15000));
    await pA.click('#hangup');
    await until(async () => !(await pB2.$eval('#start', (b) => b.hidden)));

    // ---------------------------------------------------------------
    section('Ringing');
    await pA.click('#start');
    await until(() => pB2.$eval('#decline', (b) => !b.hidden), 8000);
    await pB2.click('#decline');
    check('declining tells the caller', await until(async () => (await logLines(pA)).some((l) => l.text.includes('declined')), 8000));
    check('…and ends the call on both sides', await until(async () => !(await pA.$eval('#start', (b) => b.hidden)) && !(await pB2.$eval('#start', (b) => b.hidden))));

    // Your sidebar is closed when she calls: the show's tab shows it, and opening the sidebar picks it up.
    // (Run on A: B's real Chrome sidebar was opened earlier by the fullscreen Exit button.)
    await pA.close();
    await sleep(800);
    await pB2.click('#start');
    check('sidebar closed: the call shows on the video', await until(() => shown(vA, /is calling/), 20000));
    pA = await openPanel(A);
    check('opening the sidebar picks up the ringing call', await until(() => pA.$eval('#decline', (b) => !b.hidden), 8000));
    await pA.click('#join');
    check('answering late still connects both ways', await until(async () => (await pA.$eval('#remote', (v) => v.videoWidth > 0)) && (await pB2.$eval('#remote', (v) => v.videoWidth > 0)), 25000));
    check('the banner goes away once answered', await until(async () => !(await showingIn(vA))));
    await pA.click('#hangup');
    await until(async () => !(await pB2.$eval('#start', (b) => b.hidden)));


    // ---------------------------------------------------------------
    section('Watch tab & watching together');
    const watchTitle = (p) => p.$eval('#watchTitle', (e) => (e.classList.contains('none') ? '' : e.textContent));
    check('each side picked its show tab', await until(async () => (await watchTitle(pA)) && (await watchTitle(pB2))));

    // A second tab with a video can't control anything, and isn't controlled.
    await vA.evaluate(() => document.getElementById('v').pause());
    await until(async () => (await vstate(vB)).paused);
    const vA2 = await A.ctx.newPage();
    await vA2.goto(`${SITE}/other`);
    await vA2.waitForFunction(() => document.getElementById('v').readyState >= 1);
    await sleep(2500);
    await vA2.evaluate(() => document.getElementById('v').play());
    await sleep(2000);
    check('a second video tab doesn’t control the other side', (await vstate(vB)).paused);
    await vA2.evaluate(() => document.getElementById('v').pause());
    await vB.evaluate(() => document.getElementById('v').play());
    check('the show tab still follows', await until(async () => !(await vstate(vA)).paused));
    check('…but the other tab isn’t touched', (await vstate(vA2)).paused);
    await vB.evaluate(() => document.getElementById('v').pause());
    await until(async () => (await vstate(vA)).paused);

    // "Watch here" moves the show; they were watching together, so B follows on its own.
    await vA2.bringToFront();
    check('"Watch here" offered for another tab', await until(() => pA.$eval('#watchHere', (b) => !b.hidden)));
    await pA.click('#watchHere');
    check('sidebar shows the show through the glass (backdrop)', await until(async () => { await pA.evaluate(() => updateBackdrop(true)); return pA.$eval('#backdrop', (b) => b.classList.contains('on') && b.style.backgroundImage.startsWith('url("data:image/jpeg')); }));
    check('B follows to the new show automatically', await until(() => vB.url().endsWith('/other'), 10000), vB.url());
    await vB.waitForFunction(() => document.getElementById('v').readyState >= 1);
    await sleep(2500);
    await vA2.evaluate(() => document.getElementById('v').play());
    check('the new show tab syncs', await until(async () => !(await vstate(vB)).paused, 6000), await both());
    await vA2.evaluate(() => document.getElementById('v').pause());
    await until(async () => (await vstate(vB)).paused);
    await vA.evaluate(() => document.getElementById('v').play());
    await sleep(1500);
    check('the old tab no longer syncs', (await vstate(vB)).paused);
    await vA.evaluate(() => document.getElementById('v').pause());

    // Not watching the same thing: a prompt instead of moving them.
    const WS = require('../server/node_modules/ws');
    const raw = new WS(RELAY);
    await new Promise((r) => raw.on('open', r));
    raw.send(JSON.stringify({ type: 'join', room: 'r1' }));
    await sleep(1500); // let A's own "now watching" (sent when someone joins) go by first
    raw.send(JSON.stringify({ type: 'now-watching', url: `${SITE}/somewhere-else`, title: 'Another Show', from: `${SITE}/not-here` }));
    check('when not together: "Go" prompt in the sidebar', await until(() => pB2.$eval('#followBar', (b) => !b.hidden && b.textContent.includes('Another Show'))));
    check('…and on the video', await until(() => shown(vB, /Another Show/)));
    check('…without moving anyone', vB.url().endsWith('/other'));
    await pB2.click('#followClose');
    check('prompt can be dismissed', await pB2.$eval('#followBar', (b) => b.hidden));
    raw.close();
    await sleep(600);

    section('Saved watch guides');
    // (Reddit is mocked; this checks saving, sharing and shared ticks)
    await pA.evaluate(async () => {
      const ep = (n, title) => ({ key: `S1E${n}`, season: 1, number: n, label: `S1 E${n}`, title, reason: '', pasted: true, guides: 1, comments: 0, summary: false, url: '' });
      Reddit.watchGuide = async (show, topic) => ({ show, topic, hasGuide: true, problems: [], threads: [], episodes: [ep(1, 'Pilot'), ep(2, 'Two'), ep(3, 'Three')] });
      setEpisodesMode('guide');
      showBest(true);
      $('bestQuery').value = 'Test Show';
      $('guideTopic').value = 'The Arc';
      await makeGuide();
    });
    check('a new guide offers Save & share', await until(async () => (await text(pA, '.g-head button')) === 'Save & share'));
    await pA.click('.g-head button');
    check('saving posts a guide card in their chat', await until(() => pB2.$$eval('#log .gc-open', (b) => b.length > 0)));
    check('…not a long list of episodes', !(await logLines(pB2)).some((l) => /S1E1, S1E2/.test(l.text)));
    await pB2.locator('#log .gc-open').last().click();
    check('…and Open guide opens it on their side', await until(async () => (await pB2.$$eval('.g-ep', (r) => r.length)) === 3));
    await pA.locator('.g-ep').first().click();
    check('ticking an episode ticks it for both', await until(() => pB2.$eval('.g-ep', (r) => r.classList.contains('done'))));
    await pB2.click('.g-back');
    check('their saved guides list it', await until(async () => (await pB2.$$eval('.g-saved .t-title', (t) => t.map((x) => x.textContent))).includes('Test Show · The Arc')),
      await pB2.evaluate(() => `mode=${episodesMode} open=${!!openGuide} results=${$('bestResults').textContent.slice(0, 160)}`));
    await pA.evaluate(() => showBest(false));
    await pB2.evaluate(() => showBest(false));

    // ---------------------------------------------------------------
    section('Typing, timestamps, hand-holding');
    await pA.fill('#msg', '');
    await pA.locator('#msg').pressSequentially('typing something');
    check('typing indicator on the other side', await until(async () => !(await pB2.$eval('#typing', (t) => t.hidden)) && (await text(pB2, '#typing')).includes('fran')));
    await pA.fill('#msg', '');

    await vA2.evaluate(() => { document.getElementById('v').currentTime = 30; });
    await until(async () => Math.abs((await vstate(vB)).t - 30) < 1.5);
    await sleep(3000); // the show position reaches the sidebar (updated about once a second, then polled)
    await chat(pA, 'this scene!');
    const stamp = await until(() => pB2.$$eval('#log .msg', (ms) => ms.find((m) => m.textContent.includes('this scene!'))?.querySelector('.stamp')?.textContent));
    check('chat messages carry the show time', stamp === '0:30', stamp);
    check('typing indicator clears when the message arrives', await pB2.$eval('#typing', (t) => t.hidden));
    await vA2.evaluate(() => { document.getElementById('v').currentTime = 80; });
    await until(async () => Math.abs((await vstate(vB)).t - 80) < 1.5);
    await pB2.locator('#log .msg', { hasText: 'this scene!' }).locator('.stamp').click();
    check('clicking a timestamp takes both back there', await until(async () => Math.abs((await vstate(vB)).t - 30) < 1.5 && Math.abs((await vstate(vA2)).t - 30) < 1.5), await both());

    await pA.click('#handBtn');
    check('hold hand: their video glows with a note', await until(() => shown(vB, /holding your hand/)));
    check('hold hand: their sidebar glows', await until(() => pB2.$eval('.top', (t) => t.classList.contains('holding'))));

    await vA2.evaluate(() => { document.getElementById('v').currentTime = 95; });
    check('big jumps are announced', await until(() => shown(vB, /skipped ahead/)));

    section('Countdown, buffering');
    await until(() => pA.$eval('#countdownBtn', (b) => !b.disabled));
    await pA.click('#countdownBtn');
    check('3-2-1 shows on both screens', await until(async () => (await shown(vA2, /^[321]$/)) && (await shown(vB, /^[321]$/))));
    check('…then both play together', await until(async () => { const a = await vstate(vA2); const b = await vstate(vB); return !a.paused && !b.paused && Math.abs(a.t - b.t) < 1; }, 6000), await both());

    await pA.click('#breakBtn');
    check('Break offers CR break or Stop for tonight', await pA.$eval('#breakMenu', (m) => !m.hidden));
    await pA.click('#crBreak');
    check('CR break pauses both', await until(async () => (await vstate(vA2)).paused && (await vstate(vB)).paused, 5000), await both());
    check('…they see who is away, with a timer', await until(() => shown(vB, /fran is on a CR break\s*\d+:\d\d/)));
    check('…and you get an "I’m back" button', await until(async () => (await text(pA, '#breakBtn')) === 'I’m back') && await shown(vA2, /I’m back/));
    check('…no emoji in the sidebar header', !(await pA.$eval('.top', (t) => /[\u{1F300}-\u{1FAFF}]/u.test(t.textContent))));
    await vA2.locator('button', { hasText: 'I’m back' }).click();
    check('coming back counts both in, then plays together', await until(async () => { const a = await vstate(vA2); const b = await vstate(vB); return !a.paused && !b.paused && Math.abs(a.t - b.t) < 1; }, 7000), await both());
    // (faded-out pop-ups stay in the page invisibly, so only count what's actually showing)
    const showing = (p, re) => p.evaluate((src) => [...document.querySelectorAll('[data-sinehan]')].some((e) => new RegExp(src).test(e.textContent) && getComputedStyle(e).opacity !== '0'), re.source);
    check('…and the break notice is gone', await until(async () => !(await showing(vB, /CR break/)), 5000));
    await vA2.evaluate(() => { const v = document.getElementById('v'); v.playbackRate = 0; v.dispatchEvent(new Event('waiting')); });
    check('when one side is loading, the other waits', await until(async () => (await vstate(vB)).paused, 5000), await both());
    check('…and is told why', await until(() => shown(vB, /loading/i)));
    await vA2.evaluate(() => { const v = document.getElementById('v'); v.playbackRate = 1; v.dispatchEvent(new Event('playing')); });
    check('…then both continue', await until(async () => !(await vstate(vB)).paused && !(await vstate(vA2)).paused, 5000), await both());
    // Stop for tonight: both pause, and both save the spot for next time.
    const savedSpot = (p) => p.evaluate(() => new Promise((r) => chrome.runtime.sendMessage({ type: 'resume' }, r)));
    await pA.click('#breakBtn');
    await pA.click('#goodnightBtn');
    check('Stop for tonight pauses both', await until(async () => (await vstate(vA2)).paused && (await vstate(vB)).paused, 5000), await both());
    check('…they are told', await until(() => shown(vB, /stopped for tonight/)));
    check('…and both save the spot', await until(async () => typeof (await savedSpot(pA))?.time === 'number' && typeof (await savedSpot(pB2))?.time === 'number'), JSON.stringify(await savedSpot(pB2)));

    // ---------------------------------------------------------------
    section('Phone companion');
    const phone = await A.ctx.newPage();
    await phone.setViewportSize({ width: 390, height: 844 });
    await phone.goto(`http://localhost:${RELAY_PORT}/party?room=r1`);
    check('phone: asks who you are first', await phone.locator('#setup').isVisible());
    await phone.fill('#name', 'Phone');
    await phone.click('#go');
    check('phone: joins and sees both of you watching', await until(async () => (await phone.textContent('#status')) === 'Both of you are watching'));
    check('phone: doesn’t count as a person on the laptops', (await text(pA, '#status')) === 'Together' && !(await logLines(pA)).slice(-3).some((l) => /joined|left/.test(l.text) && l.cls.includes('system') && l.text.includes('Phone')));
    check('phone: shows what’s on', await until(async () => !(await phone.$eval('#title', (t) => t.classList.contains('none')))));

    await phone.fill('#msg', 'hi from my phone');
    await phone.press('#msg', 'Enter');
    check('phone: chat reaches the laptops', await until(async () => (await logLines(pB2)).some((l) => l.text.includes('hi from my phone'))));
    await chat(pB2, 'hello phone');
    check('phone: chat from the laptops arrives', await until(async () => (await phone.textContent('#log')).includes('hello phone')));

    await vA2.evaluate(() => document.getElementById('v').play());
    await until(async () => !(await vstate(vB)).paused);
    check('phone: sees the show playing', await until(async () => (await phone.textContent('#clock')).startsWith('Playing')));
    await phone.click('#playBtn');
    check('phone remote: pause stops both laptops', await until(async () => (await vstate(vA2)).paused && (await vstate(vB)).paused, 5000), await both());
    const tBefore = (await vstate(vA2)).t;
    await phone.click('#fwdBtn');
    check('phone remote: +10s moves both', await until(async () => (await vstate(vA2)).t > tBefore + 8 && Math.abs((await vstate(vB)).t - (await vstate(vA2)).t) < 1.5, 5000), await both());
    await phone.click('#countBtn');
    check('phone remote: 3·2·1 starts both together', await until(async () => { const a = await vstate(vA2); const b = await vstate(vB); return !a.paused && !b.paused && Math.abs(a.t - b.t) < 1; }, 7000), await both());

    await phone.click('#leave');
    await sleep(1500);
    check('phone leaving doesn’t pause anyone', !(await vstate(vA2)).paused && !(await vstate(vB)).paused);
    check('…or announce anything', !(await logLines(pA)).slice(-2).some((l) => l.cls.includes('system') && /left/.test(l.text)));
    await vA2.evaluate(() => document.getElementById('v').pause());
    await until(async () => (await vstate(vB)).paused);

    // ---------------------------------------------------------------
    section('Invite link');
    await vA2.bringToFront(); // invite from the show's tab
    await pA.click('#invite');
    check('link icon shows "copied"', await until(() => pA.$eval('#invite', (b) => b.classList.contains('copied'))));
    const link = await pA.evaluate(() => navigator.clipboard.readText()).catch(() => '') || await pA.inputValue('#inviteLink');
    check('invite link points at join page with room', /\/join\?room=r1/.test(link), link);
    C = await launch('C');
    const join = await C.ctx.newPage();
    await join.goto(link);
    check('join page detects the extension', await until(() => join.evaluate(() => document.documentElement.dataset.wpReady === '1')));
    check('join page shows Join button', await join.locator('#wp-join').isVisible());
    await join.click('#wp-join');
    if (link.includes('&to=')) check('after Join: taken to the show', await until(() => join.url().startsWith(`${SITE}/other`)), join.url());
    else check('after Join: confirmation shown', await until(() => join.locator('#wp-done').isVisible()));
    const pC = await openPanel(C);
    check('invitee is connected to the same room', await until(async () => (await pC.inputValue('#room')) === 'r1' && (await text(pC, '#status')) === 'Together'));

    // Invite from an empty room makes one up and connects.
    await leave(pC);
    await until(async () => (await text(pC, '#status')) === 'Not connected');
    if (!(await pC.$eval('#settings', (d) => d.open))) await pC.click('#settingsBtn');
    check('server and room are tucked under Advanced', await pC.$eval('#advanced', (d) => !d.open && !d.querySelector('#server').checkVisibility()));
    await pC.click('#advanced summary');
    await pC.fill('#room', '');
    await pC.click('#invite');
    check('invite with no room creates a hard-to-guess one', await until(async () => /^party-[a-z2-9]{20}$/.test(await pC.inputValue('#room'))));
    check('…and connects to it', await until(async () => (await text(pC, '#status')) === 'Waiting for them to join'));
    check('third person leaving is announced as "left"', await until(async () => (await logLines(pA)).some((l) => l.cls.includes('system') && l.text.includes('left'))));
    check('…and does not drop the remaining partner', (await text(pA, '#names')).includes('Bob'));

    // Bad server address: no crash, just keeps trying.
    await leave(pC);
    await connect(pC, 'Cee', 'nowhere', 'ws://localhost:1');
    await sleep(1500);
    check('unreachable server shows "Connecting…"', (await text(pC, '#status')) === 'Connecting…');
    await leave(pC);

    // ---------------------------------------------------------------
    section('Leaving, rooms, and server restarts');
    await vA2.evaluate(() => document.getElementById('v').play());
    await until(async () => !(await vstate(vB)).paused);
    await leave(pB2);
    check('partner leaving pauses the show', await until(async () => (await vstate(vA2)).paused), await both());
    check('partner leaving is announced', await until(async () => (await logLines(pA)).filter((l) => l.text.includes('left')).length >= 2));
    check('partner removed from header', await until(async () => (await text(pA, '#names')) === 'fran'));
    check('status back to waiting', await until(async () => (await text(pA, '#status')) === 'Waiting for them to join'));

    // Leave ends the party: chat clears, and it's saved under Past parties.
    check('leaving clears the chat', await until(() => pB2.$$eval('#log .line', (l) => l.length === 0)));
    check('Watching bar hides when not in a party', await until(() => pB2.$eval('#watchBar', (b) => b.hidden)));
    check('…the welcome screen offers to pick up where you left off', await until(() => pB2.$eval('#wlResume', (w) => !w.hidden)));
    check('Leave closes Settings and shows the welcome screen', await until(async () => !(await pB2.$eval('#settings', (d) => d.open)) && await pB2.$eval('#welcome', (w) => !w.hidden)));
    await pB2.click('#historyBtn');
    const parties = await until(async () => { const t = await pB2.$$eval('#sessions .session', (s) => s.map((x) => x.textContent)); return t.length ? t : false; });
    check('the party is saved in Past parties', parties && /\d+ messages?/.test(parties[0]), JSON.stringify(parties));
    await pB2.click('#sessions .session');
    check('a past party can be read back', await until(async () => (await pB2.$$eval('#sessionLog .line', (l) => l.map((x) => x.textContent))).some((t) => t.includes('hello there'))));
    check('…with its timestamps (not clickable there)', await pB2.$$eval('#sessionLog .stamp', (st) => st.length > 0 && st.every((b) => b.disabled)));
    await pB2.click('#sessionDelete');
    check('a past party can be deleted', await until(async () => (await pB2.$$eval('#sessions .session', (x) => x.length)) === parties.length - 1));
    await pB2.click('#historyBtn');
    check('closing Past parties returns to the welcome screen (not in a party)', await pB2.evaluate(() => document.getElementById('historyView').hidden && !document.body.classList.contains('show-history')
      && !document.getElementById('welcome').hidden && getComputedStyle(document.querySelector('.chat')).display === 'none'));

    await connect(pB2, 'Bob', 'r2');
    await until(async () => (await text(pB2, '#status')) === 'Waiting for them to join');
    await pB2.reload();
    await pB2.waitForSelector('#avatars button', { state: 'attached' });
    await sleep(800);
    check('joining a different room starts a fresh chat', !(await logLines(pB2)).some((l) => l.text.includes('hello there')));
    await leave(pB2).catch(() => {});
    await connect(pB2, 'Bob', 'r1');
    check('rejoin original room', await until(async () => (await text(pA, '#status')) === 'Together'));

    await sleep(1500);
    await vA2.evaluate(() => document.getElementById('v').play());
    await until(async () => !(await vstate(vB)).paused);
    await stopRelay();
    check('connection lost pauses the show', await until(async () => (await vstate(vA2)).paused), await both());
    check('server down: shows reconnecting', await until(async () => (await text(pA, '#status')) === 'Connecting…'));
    await startRelay();
    check('server back: both reconnect on their own', await until(async () => (await text(pA, '#status')) === 'Together' && (await text(pB2, '#status')) === 'Together', 15000));
    await chat(pA, 'after restart');
    check('chat works after reconnect', await until(async () => (await logLines(pB2)).some((l) => l.text.includes('after restart'))));

    await vA2.evaluate(() => document.getElementById('v').play());
    check('sync works after reconnect', await until(async () => !(await vstate(vB)).paused));
    await vA2.close();
    check('closing the show pauses the other side', await until(async () => (await vstate(vB)).paused), JSON.stringify(await vstate(vB)));
    check('…and tells them', await until(() => shown(vB, /closed the show/)));
    check('…and the closed tab is no longer the show', await until(async () => !(await watchTitle(pA)).includes('/other')), await watchTitle(pA));
  } catch (e) {
    check('test run crashed', false, e.stack);
  } finally {
    section('Uncaught errors in extension pages');
    check('no uncaught page errors', pageErrors.length === 0, pageErrors.join('\n'));
    await Promise.allSettled([A.ctx.close(), B.ctx.close(), C?.ctx.close()]);
    await stopRelay();
    site.close();
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} passed`);
    process.exit(failed.length ? 1 : 0);
  }
})();
