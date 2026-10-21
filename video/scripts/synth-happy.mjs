// A light, happy track synthesized in code, note by note on a BPM grid, for the light one-minute reel:
// strummed ukulele (Karplus-Strong plucked strings), a glockenspiel tune, hand claps, a shaker and a soft bass.
// C–G–Am–F at 120 BPM: a beat is 15 video frames at 30 fps, a bar 60. Writes public/audio/happy.wav
// (44.1 kHz, 16-bit, stereo). No samples.
//   node scripts/synth-happy.mjs [seconds]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'audio', 'happy.wav');
const BPM = 120;
const SR = 44100;
const SECONDS = Number(process.argv[2] || 60);
const BEAT = 60 / BPM;
const BAR = 4 * BEAT;
const N = Math.floor(SR * SECONDS);
const L = new Float32Array(N);
const R = new Float32Array(N);
const hz = (n) => 440 * 2 ** ((n - 69) / 12);

// Seeded noise so every run writes the same file.
let seed = 7;
const noise = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;

const mix = (start, i, v, pan) => {
  if (start + i >= N || start + i < 0) return;
  L[start + i] += v * (1 - Math.max(0, pan));
  R[start + i] += v * (1 + Math.min(0, pan));
};

// A plucked nylon string: Karplus-Strong, a burst of noise circulating through a damped delay line.
function pluck(at, note, vol, pan, dur = 1.2) {
  const period = Math.round(SR / hz(note));
  const buf = new Float32Array(period);
  for (let k = 0; k < period; k++) buf[k] = noise() * 0.5;
  const start = Math.floor(at * SR);
  const len = Math.floor(dur * SR);
  let prev = 0;
  for (let i = 0; i < len; i++) {
    const k = i % period;
    const next = buf[(i + 1) % period];
    const out = 0.996 * 0.5 * (buf[k] + next);
    buf[k] = out;
    // soften the attack a touch (nylon, not steel)
    const s = 0.6 * out + 0.4 * prev;
    prev = s;
    mix(start, i, s * vol * Math.min(1, (len - i) / (SR * 0.05)), pan);
  }
}

// A glockenspiel: a bright bar with its characteristic inharmonic partial, long ring.
function glock(at, note, vol, pan) {
  const f0 = hz(note);
  const start = Math.floor(at * SR);
  const len = Math.floor(1.1 * SR);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const s = Math.sin(2 * Math.PI * f0 * t) * Math.exp(-t * 4) + 0.4 * Math.sin(2 * Math.PI * f0 * 2.76 * t) * Math.exp(-t * 11);
    mix(start, i, s * vol * Math.min(1, t * 2000), pan);
  }
}

function bass(at, note, vol, dur) {
  const f0 = hz(note);
  const start = Math.floor(at * SR);
  const len = Math.floor(dur * SR);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const s = Math.sin(2 * Math.PI * f0 * t) + 0.25 * Math.sin(2 * Math.PI * f0 * 2 * t);
    mix(start, i, s * vol * Math.exp(-t * 3) * Math.min(1, t * 300) * Math.min(1, (len - i) / (SR * 0.03)), 0);
  }
}

function kick(at, vol) {
  const start = Math.floor(at * SR);
  for (let i = 0; i < SR * 0.25; i++) {
    const t = i / SR;
    mix(start, i, Math.sin(2 * Math.PI * (50 + 90 * Math.exp(-t * 30)) * t) * Math.exp(-t * 14) * vol, 0);
  }
}

// A hand clap: a few quick noise bursts a hair apart, then a short tail.
function clap(at, vol, pan = 0) {
  const start = Math.floor(at * SR);
  let lp = 0;
  for (let i = 0; i < SR * 0.18; i++) {
    const t = i / SR;
    const env = (t < 0.03 ? Math.exp(-((t * 1000) % 10) / 2.5) : 0) + Math.exp(-(t - 0.02) * 30) * (t > 0.02 ? 1 : 0);
    const n = noise();
    lp += 0.5 * (n - lp);
    mix(start, i, (n - lp) * env * vol, pan);
  }
}

function shaker(at, vol, pan) {
  const start = Math.floor(at * SR);
  let lp = 0;
  for (let i = 0; i < SR * 0.06; i++) {
    const t = i / SR;
    const n = noise();
    lp += 0.3 * (n - lp);
    mix(start, i, (n - lp) * Math.exp(-t * 70) * Math.min(1, t * 400) * vol, pan);
  }
}

// Ukulele voicings (G-C-E-A, re-entrant), and the bass root, per bar.
const CHORDS = [
  { uke: [67, 60, 64, 72], root: 48 }, // C
  { uke: [67, 62, 67, 71], root: 43 }, // G
  { uke: [69, 60, 64, 69], root: 45 }, // Am
  { uke: [69, 60, 65, 69], root: 41 }, // F
];
// Strum on eighths: down, down-up, up-down-up (the classic island strum). [eighth, direction]
const STRUM = [[0, 'd'], [2, 'd'], [3, 'u'], [5, 'u'], [6, 'd'], [7, 'u']];
// Glockenspiel tune: two bars of eighths per phrase (0 = rest), C major, cheerful leaps.
const TUNE = [
  [72, 0, 76, 79, 0, 76, 74, 72, 74, 0, 74, 76, 79, 0, 0, 0],
  [72, 0, 76, 79, 0, 81, 79, 76, 77, 0, 76, 74, 72, 0, 0, 0],
  [84, 0, 83, 81, 0, 79, 76, 79, 81, 0, 79, 77, 76, 0, 74, 0],
  [72, 74, 76, 0, 79, 0, 76, 0, 77, 76, 74, 0, 72, 0, 0, 0],
];

// Sections follow the reel's scenes (starts in seconds): hello 0, looks 6.5, works 14.6, motion 22.6,
// now 29.6, fun 37.2, life 46.2, end 52.2. Each sets what plays.
const SECTIONS = [
  [0, { uke: 0.9, glock: 0.6, perc: 0, bass: 0.5 }],
  [6.5, { uke: 1, glock: 1, perc: 1, bass: 1 }],
  [22.6, { uke: 1, glock: 0.8, perc: 1, bass: 1, phrase: 2 }],
  [29.6, { uke: 0.9, glock: 0.7, perc: 0.5, bass: 0.8 }],
  [37.2, { uke: 1, glock: 1, perc: 1, bass: 1, phrase: 2 }],
  [46.2, { uke: 1, glock: 0.9, perc: 0.8, bass: 1 }],
  [52.2, { uke: 1, glock: 1, perc: 1, bass: 1 }],
];
const sectionAt = (s) => SECTIONS.filter(([t]) => s >= t + 1e-6 || t === 0).pop()[1];

const bars = Math.floor(SECONDS / BAR);
for (let b = 0; b < bars; b++) {
  const at = b * BAR;
  const sec = sectionAt(at);
  const chord = CHORDS[b % 4];
  const last = b === bars - 1;
  if (last) {
    // the ending: one big down-strum on C, a glock flourish, a last clap
    CHORDS[0].uke.forEach((n, k) => pluck(at + k * 0.02, n, 0.5, (k - 1.5) * 0.15, 3));
    [72, 76, 79, 84].forEach((n, k) => glock(at + k * 0.09, n, 0.22, 0.3));
    bass(at, 36, 0.4, 2.5);
    kick(at, 0.5);
    clap(at, 0.35);
    continue;
  }
  // ukulele strum
  for (const [e, dir] of STRUM) {
    const strings = dir === 'd' ? chord.uke : [...chord.uke].reverse();
    const t0 = at + (e * BEAT) / 2;
    strings.forEach((n, k) => pluck(t0 + k * 0.012, n, (dir === 'd' ? 0.32 : 0.22) * sec.uke, (k - 1.5) * 0.12 + 0.15));
  }
  // bass: root on 1, fifth on the "and" of 2, root on 3
  bass(at, chord.root, 0.42 * sec.bass, BEAT * 1.4);
  bass(at + 1.5 * BEAT, chord.root + 7, 0.3 * sec.bass, BEAT * 0.8);
  bass(at + 2 * BEAT, chord.root, 0.38 * sec.bass, BEAT * 1.6);
  // percussion
  if (sec.perc) {
    kick(at, 0.45 * sec.perc);
    kick(at + 2 * BEAT, 0.4 * sec.perc);
    clap(at + BEAT, 0.3 * sec.perc, -0.1);
    clap(at + 3 * BEAT, 0.3 * sec.perc, 0.1);
    for (let s = 0; s < 16; s++) shaker(at + (s * BEAT) / 4, (s % 2 ? 0.05 : 0.09) * sec.perc, s % 2 ? 0.35 : -0.35);
  }
  // glockenspiel tune, in two-bar phrases
  const phrase = TUNE[((Math.floor(b / 2) % 2) + (sec.phrase || 0)) % TUNE.length];
  for (let e = 0; e < 8; e++) {
    const n = phrase[(b % 2) * 8 + e];
    if (n) glock(at + (e * BEAT) / 2, n, 0.13 * sec.glock, Math.sin(b + e) * 0.3);
  }
}

// Normalize so the loudest moment peaks near -1 dBFS.
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const gain = 0.9 / Math.max(peak, 1e-6);
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8);
buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  const fade = Math.min(1, i / (SR * 0.02), (N - i) / (SR * 0.6));
  buf.writeInt16LE(Math.round(Math.tanh(L[i] * gain * 1.05) * fade * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(Math.tanh(R[i] * gain * 1.05) * fade * 32767), 46 + i * 4);
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, buf);
console.log(`wrote ${OUT.replace(ROOT, '.')}: ${SECONDS}s at ${BPM} BPM`);
