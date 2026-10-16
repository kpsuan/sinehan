// The call: a hidden page (Chrome's offscreen document) that runs the whole video/voice call, so it keeps
// going when Chrome closes or reloads the sidebar (fullscreen), or the show's tab changes episode.
// The sidebar and the fullscreen overlay are only screens for it: they send commands ('call-cmd') and get
// the video over a connection inside this browser ('cam-want' / 'cam-offer'); their voice plays here.
// Offscreen pages only have chrome.runtime, so settings arrive from the background ('call-config').

const myId = crypto.randomUUID();
let port = null;
let config = { name: 'Guest', server: '', cameraId: '', micId: '', micOn: false, duckLevel: 0.5, voiceVol: 1 };

function connectPort() {
  port = chrome.runtime.connect({ name: 'call' });
  port.onMessage.addListener((msg) => onMessage(msg).catch((e) => console.warn('[watch-party] call:', e?.name, e?.message)));
  port.onDisconnect.addListener(() => {
    void chrome.runtime.lastError;
    port = null;
    setTimeout(connectPort, 500); // the background restarted
  });
}
connectPort();
function send(msg) {
  try {
    port?.postMessage(msg);
  } catch {}
}
const save = (values) => chrome.runtime.sendMessage({ type: 'call-save', values }, () => void chrome.runtime.lastError);
const note = (text) => send({ local: true, type: 'call-note', text });

// ---- Ringing ----
// A soft knock every 2s, synthesized (no sound file).
function makeRinger() {
  let ctx = null;
  let timer = null;
  const chime = () => {
    try {
      ctx ||= new AudioContext();
      ctx.resume?.();
      const t = ctx.currentTime;
      // A soft wooden knock (marimba-like: a quick tap that fades fast), twice. Not a sustained tone.
      [
        [523.25, 0],
        [659.25, 0.16],
      ].forEach(([freq, delay]) => {
        for (const [mult, level] of [
          [1, 0.11],
          [3.9, 0.025],
        ]) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = freq * mult;
          gain.gain.setValueAtTime(0, t + delay);
          gain.gain.linearRampToValueAtTime(level, t + delay + 0.006);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + (mult === 1 ? 0.42 : 0.12));
          osc.connect(gain).connect(ctx.destination);
          osc.start(t + delay);
          osc.stop(t + delay + 0.45);
        }
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
    note(`Missed call from ${incoming.name}`);
    stopRinging();
    if (pc && !localStream) endCall(null);
  }, 40000);
  emit();
}
function stopRinging() {
  if (!incoming && !ringer.on) return;
  incoming = null;
  ringer.stop();
  clearTimeout(ringTimeout);
  send({ local: true, type: 'ring-stop' });
  chrome.runtime.sendMessage({ type: 'call-handled' }, () => void chrome.runtime.lastError);
  emit();
}

// ---- The connection ----
// Video goes browser-to-browser over WebRTC; the relay only carries the setup messages. "Perfect
// negotiation", so it doesn't matter who starts or turns their camera on first.
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
// The relay may add a TURN server: it relays the call when your networks can't connect directly (common on
// mobile data and on ISPs that share one address between many homes).
let iceServers = ICE_SERVERS;
let iceAt = 0;
async function loadIce() {
  if (Date.now() - iceAt < 3600 * 1000) return;
  const server = String(config.server || '').trim().replace(/^ws/, 'http').replace(/\/+$/, '');
  if (!server) return;
  try {
    const r = await fetch(`${server}/ice`, { signal: AbortSignal.timeout(2500) });
    const { iceServers: list } = r.ok ? await r.json() : {};
    if (Array.isArray(list) && list.length) {
      iceServers = list;
      iceAt = Date.now();
    }
  } catch {}
}

let pc = null;
let localStream = null;
let remoteStream = null;
let makingOffer = false;
let ignoreOffer = false;
let awaitingOffer = false;
let myOffer = ''; // the id of the offer we're waiting on an answer to
let attachOnOffer = null; // picking up: adds our camera and mic once their offer arrives
let restartedIce = false;
let failTimer = null;
let audioTx = null; // the transceiver our mic goes out on (track swapped without renegotiating)
let theirMicOn = null; // what they told us (null = not in a call / unknown)
// A call is between two of these call pages. Once one has answered, setup goes only to it (`to`), and
// messages from any other of theirs are ignored, so two answers can't collide.
let callPeer = null;

function signal(data) {
  if (data.description?.sdp) data = { ...data, description: { ...data.description, sdp: tuneVoice(data.description.sdp) } };
  send({ type: 'rtc', from: myId, name: config.name || 'Guest', ...(callPeer ? { to: callPeer } : {}), ...data });
}
// What we ask of their voice (Opus): error correction, so a lost packet is patched from the next one
// instead of cutting out on patchy Wi-Fi; and silence sent as (almost) nothing, leaving that bandwidth
// to the show. Each side asks this in the setup it sends, and the other side sends that way.
function tuneVoice(sdp) {
  const pt = sdp.match(/a=rtpmap:(\d+) opus\/48000/i)?.[1];
  if (!pt) return sdp;
  const want = { useinbandfec: '1', usedtx: '1' };
  const fmtp = new RegExp(`^a=fmtp:${pt} ([^\r\n]*)`, 'm');
  if (fmtp.test(sdp)) {
    return sdp.replace(fmtp, (line, params) => {
      const have = Object.fromEntries(params.split(';').map((p) => p.trim().split('=')).filter(([k]) => k));
      return `a=fmtp:${pt} ${Object.entries({ ...have, ...want }).map(([k, v]) => `${k}=${v}`).join(';')}`;
    });
  }
  return sdp.replace(new RegExp(`(a=rtpmap:${pt} opus/48000[^\r\n]*)`, 'i'), `$1\r\na=fmtp:${pt} useinbandfec=1;usedtx=1`);
}
const offerOut = () => {
  myOffer = crypto.randomUUID().slice(0, 8);
  signal({ description: pc.localDescription.toJSON(), oid: myOffer });
};

function createPeer() {
  pc = new RTCPeerConnection({ iceServers, iceCandidatePoolSize: 2 }); // starts finding routes before the offer
  restartedIce = false;
  remoteStream = new MediaStream();

  pc.onnegotiationneeded = async () => {
    if (awaitingOffer) return; // picking up: wait for their offer instead of racing it
    try {
      makingOffer = true;
      await pc.setLocalDescription();
      if (pc.localDescription.type === 'offer') offerOut();
      else signal({ description: pc.localDescription.toJSON() });
    } catch (e) {
      console.warn('[watch-party] offer failed', e);
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
    if (track.kind === 'audio') {
      playVoice();
      watchTheirVoice();
    }
    track.onunmute = () => {
      emit();
      if (track.kind === 'video') refreshViews();
    };
    emit();
    if (track.kind === 'video') {
      refreshViews();
      send({ local: true, type: 'cam-available' }); // a fullscreen tab may want it
    }
  };
  // Settings stick once the connection has negotiated them (and again after a camera is added or switched).
  pc.onsignalingstatechange = () => pc?.signalingState === 'stable' && tuneSenders();
  pc.onconnectionstatechange = () => {
    const state = pc?.connectionState;
    if (partnerGone && (state === 'disconnected' || state === 'failed')) checkGone(); // they're gone: don't drag it out
    if (state === 'connected') {
      clearTimeout(failTimer);
      if (localStream) send({ type: 'mic', on: !!localStream.getAudioTracks().length }); // (in case they missed it)
    }
    if (state === 'failed' && partnerGone) return emit(); // no point retrying; checkGone() ends it
    if (state === 'failed') {
      // Try once more on a fresh route before giving up.
      if (!restartedIce) {
        restartedIce = true;
        note('The call’s connection dropped. Reconnecting…');
        pc.restartIce();
        clearTimeout(failTimer);
        failTimer = setTimeout(() => {
          if (pc && pc.connectionState !== 'connected') endCall('Call dropped. Your networks couldn’t connect.', true);
        }, 15000);
      } else {
        endCall('Call dropped. Your networks couldn’t connect.', true);
      }
    }
    emit();
  };
}

async function onSignal({ description, candidate, bye, declined, want, from, name, oid, re, to }) {
  if (to && to !== myId) return; // for another of their call pages
  if (callPeer && from !== callPeer && from !== 'tab') return;
  if (description && pc && !callPeer) callPeer = from;
  // They picked up and want our offer: resend the one still waiting (nobody answered it; it carries our
  // network candidates). Undoing it and making a new one raced with the browser's own renegotiation.
  if (want === 'offer') {
    if (!pc || !localStream) return;
    if (pc.signalingState === 'have-local-offer' && pc.localDescription) return offerOut();
    if (pc.signalingState !== 'stable' || makingOffer) return;
    try {
      makingOffer = true;
      await pc.setLocalDescription(await pc.createOffer({ iceRestart: true }));
      offerOut();
    } catch (e) {
      console.warn('[watch-party] fresh offer', e);
    } finally {
      makingOffer = false;
    }
    return;
  }
  if (bye) {
    if (incoming && !localStream) {
      note(`Missed call from ${incoming.name}`);
      stopRinging();
      if (pc) endCall(null);
    } else if (pc) {
      endCall(declined ? `${name || 'They'} declined` : `${name || 'They'} hung up`);
    }
    return;
  }
  if (description) {
    if (!pc) {
      // A new call: just ring. Picking up asks them for their offer.
      if (description.type !== 'offer' || incoming) return;
      note(`${name || 'They'} started a call`);
      startRinging(name);
      return;
    }
    const polite = myId < from;
    const collision = description.type === 'offer' && (makingOffer || pc.signalingState !== 'stable');
    ignoreOffer = !polite && collision;
    if (ignoreOffer) {
      if (pc.localDescription?.type === 'offer') signal({ description: pc.localDescription.toJSON(), oid: myOffer });
      return;
    }
    // An answer to an older offer (we've sent a newer one since), or after we've settled: nothing to answer.
    if (description.type === 'answer' && (pc.signalingState !== 'have-local-offer' || (re && re !== myOffer))) return;
    try {
      await pc.setRemoteDescription(description);
    } catch (e) {
      // A mismatched answer: start over with a fresh offer rather than leaving the call stuck.
      console.warn('[watch-party] call setup', e);
      if (description.type === 'answer' && pc?.signalingState === 'have-local-offer') {
        await pc.setLocalDescription({ type: 'rollback' }).catch(() => {});
        pc.onnegotiationneeded?.();
      }
      return;
    }
    if (description.type === 'offer') {
      awaitingOffer = false;
      if (attachOnOffer) {
        const attach = attachOnOffer;
        attachOnOffer = null;
        await attach(); // our camera and mic join their offer's slots, in this answer
        if (!pc) return;
      }
      await pc.setLocalDescription();
      signal({ description: pc.localDescription.toJSON(), re: oid });
    }
    emit();
  } else if (candidate && pc) {
    try {
      await pc.addIceCandidate(candidate);
    } catch (e) {
      if (!ignoreOffer) throw e;
    }
  }
}

// ---- Camera and mic ----
const videoConstraints = () => ({
  width: 640,
  height: 480,
  frameRate: { ideal: 24, max: 30 },
  ...(config.cameraId ? { deviceId: { exact: config.cameraId } } : {}),
});

// The call shares your internet with the show you're streaming. So the camera is capped (~700 kbps, 24 fps;
// smooth first, sharpness drops when the connection is tight) and the voice goes first, which keeps
// Netflix/Prime from dropping to low quality or buffering because of the call.
const VIDEO_MAX_BITRATE = 700_000;
async function tuneSenders() {
  if (!pc) return;
  for (const sender of pc.getSenders()) {
    const kind = sender.track?.kind;
    if (!kind) continue;
    const params = sender.getParameters();
    if (!params.encodings?.length) continue;
    const e = params.encodings[0];
    if (kind === 'video') {
      if (e.maxBitrate === VIDEO_MAX_BITRATE) continue;
      e.maxBitrate = VIDEO_MAX_BITRATE;
      e.maxFramerate = 24;
      params.degradationPreference = 'maintain-framerate';
    } else {
      if (e.priority === 'high') continue;
      e.priority = 'high';
      e.networkPriority = 'high';
    }
    await sender.setParameters(params).catch((err) => console.warn('[watch-party] tune', kind, err?.message));
  }
}
const audioConstraints = () => ({ echoCancellation: true, noiseSuppression: true, ...(config.micId ? { deviceId: { exact: config.micId } } : {}) });
// Like getUserMedia, but if the chosen device is gone (unplugged), fall back to the default one.
async function getMedia(kind) {
  const constraints = () => (kind === 'video' ? { video: videoConstraints() } : { audio: audioConstraints() });
  try {
    return await navigator.mediaDevices.getUserMedia(constraints());
  } catch (e) {
    const key = kind === 'video' ? 'cameraId' : 'micId';
    if (!config[key] || !['OverconstrainedError', 'NotFoundError', 'NotReadableError'].includes(e.name)) throw e;
    config[key] = '';
    save({ [key]: '' });
    note(`Your chosen ${kind === 'video' ? 'camera' : 'mic'} isn’t available, so the default one is used.`);
    return navigator.mediaDevices.getUserMedia(constraints());
  }
}

// voice = start (or answer) with just the mic; the camera can still be turned on later.
// how: 'start' (we're calling) or 'answer' (picking up).
async function turnOnCamera(voice = false, how = 'start') {
  let voiceTrack = null;
  await loadIce();

  // Picking up: ask them for their offer and answer it with our camera and mic, so only one side sets the
  // call up. Asked right away, while the camera starts. If no offer comes within 5s, we offer.
  const answering = !pc && how === 'answer';
  let attachFn = null;
  let openGate;
  const gate = new Promise((r) => (openGate = r));
  if (answering) {
    awaitingOffer = true;
    createPeer();
    const mine = async () => {
      if (await gate) await attachFn?.();
    };
    attachOnOffer = mine;
    signal({ want: 'offer' });
    setTimeout(async () => {
      if (!awaitingOffer || !pc || attachOnOffer !== mine) return;
      awaitingOffer = false;
      attachOnOffer = null;
      await mine(); // adding our tracks starts the offer
    }, 5000);
  }
  try {
    if (voice) {
      [voiceTrack] = (await getMedia('audio')).getAudioTracks();
      localStream = new MediaStream();
    } else {
      localStream = await getMedia('video');
    }
  } catch (e) {
    // No camera/mic permission yet: the sidebar opens the page that asks for it.
    send({ local: true, type: 'call-error', error: e.name === 'NotAllowedError' ? 'permission' : e.message || e.name });
    if (answering) {
      openGate(false);
      endCall(null);
    }
    return false;
  }

  const attach = async () => {
    if (!pc || !localStream) return;
    for (const track of localStream.getTracks()) pc.addTrack(track, localStream);
    micTransceiver(); // ready for the mic, even if it starts off
    if (voiceTrack) {
      // A voice call is for talking: the mic starts on.
      localStream.addTrack(voiceTrack);
      await micTransceiver().sender.replaceTrack(voiceTrack);
      config.micOn = true;
      save({ micOn: true });
    } else if (config.micOn) {
      await setMic(true);
    }
    if (!localStream) return;
    send({ type: 'mic', on: !!localStream.getAudioTracks().length });
    if (!localStream.getAudioTracks().length) note('Your mic is off. Click the mic button to talk.');
    emit();
  };
  attachFn = attach;
  if (answering) openGate(true);
  else {
    // Calling: our offer goes out as soon as the camera is in.
    if (!pc) createPeer();
    await attach();
  }
  if (!localStream) return false; // the call ended while it was starting
  refreshViews();
  emit();
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

// Mic off means the microphone is fully released, which keeps Bluetooth headphones in high-quality mode and
// stops Windows from turning the show down "for a call".
async function setMic(on) {
  if (!pc || !localStream) return;
  const current = localStream.getAudioTracks()[0];
  if (on && !current) {
    let track;
    try {
      [track] = (await getMedia('audio')).getAudioTracks();
    } catch (e) {
      note(`Couldn’t turn on your mic: ${e.message || e.name}`);
      return;
    }
    if (!pc || !localStream) return track.stop(); // the call ended while the mic was starting
    localStream.addTrack(track);
    await micTransceiver().sender.replaceTrack(track);
  } else if (!on && current) {
    await micTransceiver().sender.replaceTrack(null);
    current.stop();
    localStream?.removeTrack(current);
  }
  config.micOn = on;
  save({ micOn: on });
  send({ type: 'mic', on });
  emit();
}

// The camera: off/on (still in the call), or added to a voice call.
async function toggleCamera() {
  const track = localStream?.getVideoTracks()[0];
  if (track) {
    track.enabled = !track.enabled;
    emit();
    return;
  }
  if (!pc || !localStream) return;
  try {
    const [t] = (await getMedia('video')).getVideoTracks();
    if (!pc || !localStream) return t.stop(); // the call ended while the camera was starting
    localStream.addTrack(t);
    pc.addTrack(t, localStream);
    refreshViews();
  } catch (e) {
    note(`Couldn’t start your camera: ${e.message || e.name}`);
  }
  emit();
}

// A different camera or mic chosen in Settings, mid-call: swap it in place, no hanging up.
async function switchCamera() {
  const old = localStream?.getVideoTracks()[0];
  if (!pc || !old) return;
  try {
    const [track] = (await getMedia('video')).getVideoTracks();
    if (!pc || !localStream) return track.stop();
    track.enabled = old.enabled;
    await pc.getSenders().find((s) => s.track === old)?.replaceTrack(track);
    old.stop();
    localStream.removeTrack(old);
    localStream.addTrack(track);
    refreshViews();
  } catch (e) {
    note(`Couldn’t switch camera: ${e.message || e.name}`);
  }
}
async function switchMic() {
  if (pc && localStream?.getAudioTracks().length) {
    await setMic(false);
    await setMic(true);
  }
}

let partnerGone = false;
let goneTimer = null;
function checkGone() {
  clearTimeout(goneTimer);
  if (!partnerGone || !pc) return;
  goneTimer = setTimeout(() => {
    if (partnerGone && pc && pc.connectionState !== 'connected') endCall('Call ended. Their connection dropped.');
  }, pc.connectionState === 'connected' ? 20000 : 8000);
}

function endCall(reason, notify = false) {
  if (incoming) stopRinging();
  if (notify) signal({ bye: true });
  stopAllViews();
  stopVoiceMeter();
  pc?.close();
  pc = null;
  clearTimeout(failTimer);
  clearTimeout(goneTimer);
  awaitingOffer = false;
  attachOnOffer = null;
  myOffer = '';
  callPeer = null;
  audioTx = null;
  theirMicOn = null;
  localStream?.getTracks().forEach((t) => t.stop());
  localStream = null;
  remoteStream = null;
  $voice.srcObject = null;
  if (reason) note(reason);
  emit();
}

// ---- Their voice ----
const $voice = document.getElementById('voice');
function playVoice() {
  $voice.srcObject = remoteStream;
  $voice.volume = Math.max(0, Math.min(1, Number(config.voiceVol) || 0));
  $voice.play().catch((e) => console.warn('[watch-party] voice playback', e?.name));
}
// Listens to their side of the call: a few loud moments in a row = talking; a second or so of quiet = done.
// While they talk, the show's tab turns the show down (duckLevel).
let voiceMeter = null; // { ctx, timer, track }
let ducked = false;
let duckRepeat = 0;
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
      setDucked(config.duckLevel > 0 && theirMicOn !== false && now - lastLoud < 1200);
    }, 100);
    voiceMeter = { ctx, timer, track };
  } catch (e) {
    console.warn('[watch-party] voice meter', e);
  }
}
function setDucked(on) {
  // While on, repeat every second, so the show comes back up by itself if this page goes away.
  if (on === ducked && (!on || Date.now() - duckRepeat < 1000)) return;
  ducked = on;
  duckRepeat = Date.now();
  send({ local: true, type: 'duck', on, level: config.duckLevel });
}
function stopVoiceMeter() {
  if (!voiceMeter) return;
  clearInterval(voiceMeter.timer);
  voiceMeter.ctx.close().catch(() => {});
  voiceMeter = null;
  setDucked(false);
}

// ---- Screens ----
// The sidebar and a fullscreen tab each get the video over a connection inside this browser: their camera,
// and (for the sidebar) yours. Rebuilt whenever a camera starts, stops or changes.
const views = new Map(); // view id -> { pc, self }
async function startView(viewId, self) {
  stopView(viewId);
  const theirs = remoteStream?.getVideoTracks()[0];
  const mine = self ? localStream?.getVideoTracks()[0] : null;
  if (!theirs && !mine) return void views.set(viewId, { pc: null, self }); // offered once there's video
  const relay = new RTCPeerConnection();
  views.set(viewId, { pc: relay, self });
  const ids = {};
  if (theirs) {
    const s = new MediaStream([theirs]);
    ids.remote = s.id;
    relay.addTrack(theirs, s);
  }
  if (mine) {
    const s = new MediaStream([mine]);
    ids.local = s.id;
    relay.addTrack(mine, s);
  }
  relay.onicecandidate = ({ candidate }) => {
    if (candidate) send({ local: true, type: 'cam-ice', to: viewId, candidate: candidate.toJSON() });
  };
  relay.onconnectionstatechange = () => {
    if (relay.connectionState === 'failed' && views.get(viewId)?.pc === relay) stopView(viewId); // that screen is gone
  };
  await relay.setLocalDescription();
  send({ local: true, type: 'cam-offer', to: viewId, ids, description: relay.localDescription.toJSON() });
}
function stopView(viewId) {
  views.get(viewId)?.pc?.close();
  views.delete(viewId);
}
function stopAllViews() {
  for (const viewId of [...views.keys()]) {
    stopView(viewId);
    send({ local: true, type: 'cam-bye', to: viewId });
  }
}
function refreshViews() {
  for (const [viewId, v] of [...views]) startView(viewId, v.self);
}

// ---- State for the screens ----
function state() {
  const camTrack = localStream?.getVideoTracks()[0];
  return {
    inCall: !!pc,
    incoming: incoming?.name || null,
    hasCamera: !!localStream, // in the call with our media (the fullscreen camera's word for it)
    camOn: !!camTrack?.enabled,
    localVideo: !!camTrack,
    mic: !!localStream?.getAudioTracks().length,
    cam: !!camTrack?.enabled,
    seeingThem: !!remoteStream?.getVideoTracks().length,
    theirMicOn,
    connection: pc?.connectionState || '',
  };
}
let lastState = '';
function emit(force = false) {
  const s = state();
  const key = JSON.stringify(s);
  if (!force && key === lastState) return;
  lastState = key;
  send({ local: true, type: 'call-state', ...s });
  chrome.runtime.sendMessage({ type: 'call-busy', busy: s.inCall || !!s.incoming }, () => void chrome.runtime.lastError);
}

// ---- Messages ----
async function onMessage(msg) {
  if (msg.type === 'call-config') {
    const before = { ...config };
    config = { ...config, ...msg.config };
    if (before.cameraId !== config.cameraId) switchCamera();
    if (before.micId !== config.micId) switchMic();
    if (before.voiceVol !== config.voiceVol) $voice.volume = Math.max(0, Math.min(1, Number(config.voiceVol) || 0));
    if (before.duckLevel !== config.duckLevel && !config.duckLevel) setDucked(false);
    return;
  }
  if (msg.type === 'rtc' && msg.from !== myId) return onSignal(msg);
  if (msg.type === 'mic') {
    theirMicOn = !!msg.on;
    return emit();
  }
  if (msg.type === 'peer' && !(msg.joined ?? msg.count > 1) && !msg.dropped && msg.count < 2) {
    if (pc) endCall('Call ended. They left.');
    else if (incoming) stopRinging();
    return;
  }
  // Their connection to the party dropped (closed the browser, lost Wi-Fi): like Messenger, a few seconds to
  // come back, then the call ends. If the call itself is still connected, it carries on.
  if (msg.type === 'peer' && msg.dropped && msg.count < 2) {
    partnerGone = true;
    if (incoming) stopRinging();
    checkGone();
    return;
  }
  if ((msg.type === 'peer' && (msg.joined ?? msg.count > 1)) || (msg.type === 'joined' && msg.count > 1)) {
    partnerGone = false;
    clearTimeout(goneTimer);
    return;
  }
  if (!msg.local) return;
  if (msg.type === 'call-cmd') {
    const c = msg.cmd;
    if (c === 'start') {
      if (!pc && !incoming) await turnOnCamera(!!msg.voice, 'start');
    } else if (c === 'answer') {
      if (incoming || (pc && !localStream)) {
        stopRinging();
        await turnOnCamera(!!msg.voice, 'answer');
      }
    } else if (c === 'decline') {
      if (!incoming) return;
      stopRinging();
      signal({ bye: true, declined: true });
      if (pc) endCall(null);
    } else if (c === 'hangup') {
      if (pc || incoming) endCall(msg.reason || null, msg.notify !== false);
    } else if (c === 'mic') {
      await setMic(typeof msg.on === 'boolean' ? msg.on : !localStream?.getAudioTracks().length);
    } else if (c === 'cam') {
      await toggleCamera();
    }
    return emit(true);
  }
  if (msg.type === 'call-control') {
    // From the floating camera in fullscreen.
    if (msg.action === 'mic') await setMic(!localStream?.getAudioTracks().length);
    else if (msg.action === 'cam') await toggleCamera();
    return emit(true);
  }
  if (msg.type === 'call-state-request') return emit(true);
  if (msg.type === 'cam-want') return startView(msg.from, !!msg.self);
  const view = views.get(msg.from)?.pc;
  if (msg.type === 'cam-answer') await view?.setRemoteDescription(msg.description);
  else if (msg.type === 'cam-ice') await view?.addIceCandidate(msg.candidate).catch(() => {});
  else if (msg.type === 'cam-stop') stopView(msg.from);
}

// Questions from the sidebar (and tests): call details that aren't part of the shared state.
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type !== 'call-query') return;
  if (msg.q === 'stats') {
    (async () => {
      let audioIn = 0;
      if (pc) (await pc.getStats()).forEach((r) => r.type === 'inbound-rtp' && r.kind === 'audio' && (audioIn += r.bytesReceived || 0));
      const video = pc?.getSenders().find((x) => x.track?.kind === 'video')?.getParameters().encodings?.[0];
      const asked = pc?.remoteDescription?.sdp || '';
      reply({ ...state(), audioIn, voicePlaying: !$voice.paused, id: myId, videoMaxBitrate: video?.maxBitrate || 0,
        voiceFec: /useinbandfec=1/.test(asked), voiceDtx: /usedtx=1/.test(asked) });
    })();
    return true;
  }
  reply(state());
});
