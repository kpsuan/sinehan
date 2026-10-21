// Music synthesized in code, note by note on a BPM grid: a light, playful track for the Matisse reel.
// Writes public/audio/matisse.wav (44.1 kHz, 16-bit, stereo). No samples, no libraries.
//   node scripts/synth.mjs [seconds]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'audio', 'matisse.wav');

export const BPM = 120;
const SR = 44100;
const SECONDS = Number(process.argv[2] || 44);
const BEAT = 60 / BPM;
const N = Math.floor(SR * SECONDS);
const L = new Float32Array(N);
const R = new Float32Array(N);

const note = (n) => 440 * 2 ** ((n - 69) / 12); // MIDI → Hz

// One voice: a tone with an attack/decay envelope, mixed into both channels with a pan (−1..1).
function play({ at, dur, freq, vol = 0.2, pan = 0, wave = 'pluck' }) {
  const start = Math.floor(at * SR);
  const len = Math.floor(dur * SR);
  for (let i = 0; i < len && start + i < N; i++) {
    const t = i / SR;
    const env =
      wave === 'pluck' ? Math.exp(-t * 6) * Math.min(1, t * 400)
      : wave === 'pad' ? Math.min(1, t * 8) * Math.min(1, (dur - t) * 8)
      : wave === 'kick' ? Math.exp(-t * 18)
      : wave === 'hat' ? Math.exp(-t * 60)
      : Math.exp(-t * 4);
    let s;
    if (wave === 'kick') s = Math.sin(2 * Math.PI * (freq * Math.exp(-t * 12) + 40) * t);
    else if (wave === 'hat') s = (Math.random() * 2 - 1) * 0.6;
    else if (wave === 'pad') s = (Math.sin(2 * Math.PI * freq * t) + 0.5 * Math.sin(2 * Math.PI * freq * 2.005 * t) + 0.25 * Math.sin(2 * Math.PI * freq * 0.5 * t)) / 1.75;
    else {
      // pluck: a bright triangle-ish tone whose upper harmonics fade faster (like a marimba/kalimba)
      const h2 = Math.exp(-t * 14);
      const h3 = Math.exp(-t * 22);
      s = (Math.sin(2 * Math.PI * freq * t) + 0.5 * h2 * Math.sin(2 * Math.PI * freq * 2 * t) + 0.25 * h3 * Math.sin(2 * Math.PI * freq * 3 * t)) / 1.5;
    }
    const v = s * env * vol;
    L[start + i] += v * (1 - Math.max(0, pan));
    R[start + i] += v * (1 + Math.min(0, pan));
  }
}

// ---- The tune ----
// C major pentatonic, bouncing; a two-bar melody that varies by section. Sections follow the reel's scenes
// (left hand 0–7.5s, right hand 7.5–15, together 15–20.5, proof 20.5–28, fun 28–33.5, punchline 33.5–39, end 39–45).
// The melody waits for the two hands to meet at 15s; the intro is drums, bass and a thin tune.
const PENTA = [60, 62, 64, 67, 69, 72, 74, 76, 79];
const MELODIES = [
  [0, 2, 4, 2, 5, 4, 2, 0, 1, 2, 4, 5, 4, 2, 1, 0],
  [4, 5, 7, 5, 4, 2, 4, 5, 7, 8, 7, 5, 4, 2, 1, 2],
  [5, 7, 8, 7, 5, 4, 5, 7, 4, 5, 7, 5, 4, 2, 4, 5],
  [0, 4, 7, 4, 0, 4, 7, 8, 7, 4, 2, 4, 5, 4, 2, 0],
];
const BASS = [[48, 48, 55, 55], [45, 45, 52, 52], [41, 41, 48, 48], [43, 43, 47, 47]]; // C A F G, by bar
const totalBeats = Math.floor(SECONDS / BEAT);

for (let b = 0; b < totalBeats; b++) {
  const at = b * BEAT;
  const bar = Math.floor(b / 4);
  const sec = at;
  const section = sec < 7.5 ? 0 : sec < 15 ? 1 : sec < 20.5 ? 3 : sec < 28 ? 2 : sec < 33.5 ? 1 : sec < 39 ? 3 : 2;
  const energy = sec < 7.5 ? 0.55 : sec < 15 ? 0.7 : sec >= 39 ? 1.1 : 1;
  const last = sec >= SECONDS - 2 * BEAT;

  // drums: soft kick on 1 and 3, a brush-like hat on every 8th, a clap-ish hat on 2 and 4 after the intro
  if (b % 2 === 0) play({ at, dur: 0.25, freq: 70, vol: 0.5 * energy, wave: 'kick' });
  for (let e = 0; e < 2; e++) play({ at: at + e * BEAT / 2, dur: 0.06, freq: 0, vol: (e ? 0.05 : 0.08) * energy, wave: 'hat', pan: e ? 0.4 : -0.4 });
  if (sec >= 15 && b % 2 === 1) play({ at, dur: 0.12, freq: 0, vol: 0.14 * energy, wave: 'hat' });

  // bass: one note per beat, bouncing octaves
  const bass = BASS[bar % 4][b % 4] + (b % 2 ? 12 : 0);
  play({ at, dur: 0.45, freq: note(bass), vol: 0.22 * energy, wave: 'pluck', pan: -0.2 });

  // melody: two notes per beat (8ths), pan drifting left/right so it feels like cut-outs passing by
  const mel = MELODIES[section];
  for (let e = 0; e < 2; e++) {
    const idx = ((b % 8) * 2 + e) % 16;
    const n = PENTA[mel[idx]] + (section === 3 ? 12 : 0);
    const accent = e === 0 && b % 2 === 0 ? 1.2 : 0.9;
    play({ at: at + e * BEAT / 2, dur: 0.5, freq: note(n), vol: 0.16 * accent * energy, wave: 'pluck', pan: Math.sin(b / 3) * 0.5 });
  }

  // pad: a warm chord under each bar after the intro
  if (b % 4 === 0 && sec >= 15 && !last) {
    const root = BASS[bar % 4][0] + 12;
    for (const iv of [0, 4, 7]) play({ at, dur: 4 * BEAT, freq: note(root + iv), vol: 0.045 * energy, wave: 'pad', pan: iv === 4 ? 0.3 : -0.3 });
  }

  // final stinger: a bright chord on the last beat, left to ring
  if (last && b === totalBeats - 2) {
    for (const n of [60, 64, 67, 72, 76]) play({ at, dur: 2.5, freq: note(n), vol: 0.14, wave: 'pluck', pan: (n - 68) / 20 });
    play({ at, dur: 0.3, freq: 60, vol: 0.5, wave: 'kick' });
  }
}

// ---- Master: soft clip and write WAV ----
const clip = (x) => Math.tanh(x * 1.1);
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8);
buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  const fade = Math.min(1, i / (SR * 0.05), (N - i) / (SR * 0.5)); // tiny fade in, half-second fade out
  buf.writeInt16LE(Math.round(clip(L[i]) * fade * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(clip(R[i]) * fade * 32767), 46 + i * 4);
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, buf);
console.log(`wrote ${OUT.replace(ROOT, '.')}: ${SECONDS}s at ${BPM} BPM`);
