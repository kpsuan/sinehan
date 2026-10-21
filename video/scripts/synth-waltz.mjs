// A waltz synthesized in code, note by note on a BPM grid, for the Van Gogh letter reel: music box melody,
// accordion-like chords on beats 2 and 3, plucked bass on beat 1. 3/4 at 90 BPM: a beat is 20 video
// frames at 30 fps, a bar 60. Writes public/audio/vangogh.wav (44.1 kHz, 16-bit, stereo). No samples.
//   node scripts/synth-waltz.mjs [seconds]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'audio', 'vangogh.wav');
const BPM = 90;
const SR = 44100;
const SECONDS = Number(process.argv[2] || 52);
const BEAT = 60 / BPM;
const BAR = 3 * BEAT;
const N = Math.floor(SR * SECONDS);
const L = new Float32Array(N);
const R = new Float32Array(N);
const hz = (n) => 440 * 2 ** ((n - 69) / 12);

function play({ at, dur, note, vol = 0.2, pan = 0, voice = 'box' }) {
  const f0 = hz(note);
  const start = Math.floor(at * SR);
  const len = Math.floor(dur * SR);
  for (let i = 0; i < len && start + i < N; i++) {
    const t = i / SR;
    let s = 0;
    let env = 1;
    if (voice === 'box') {
      // music box: a bright bell, quick attack, long fade, a faint inharmonic overtone
      env = Math.exp(-t * 3.2) * Math.min(1, t * 900);
      s = Math.sin(2 * Math.PI * f0 * t) + 0.35 * Math.exp(-t * 9) * Math.sin(2 * Math.PI * f0 * 4.02 * t) + 0.18 * Math.sin(2 * Math.PI * f0 * 2 * t);
      s /= 1.5;
    } else if (voice === 'accordion') {
      // reedy: odd harmonics, two slightly detuned reeds (the "musette" shimmer), soft attack and release
      env = Math.min(1, t * 25) * Math.min(1, (dur - t) * 12);
      const vib = 1 + 0.004 * Math.sin(2 * Math.PI * 5.5 * t);
      for (const det of [1, 1.006]) for (let k = 1; k <= 7; k += 2) s += Math.sin(2 * Math.PI * f0 * det * vib * k * t) / k;
      s /= 2.6;
    } else if (voice === 'bass') {
      // plucked upright bass
      env = Math.exp(-t * 5) * Math.min(1, t * 600);
      s = Math.sin(2 * Math.PI * f0 * t) + 0.3 * Math.exp(-t * 12) * Math.sin(2 * Math.PI * f0 * 2 * t);
    } else if (voice === 'brush') {
      env = Math.exp(-t * 25);
      s = (Math.random() * 2 - 1) * 0.5;
    }
    const v = s * env * vol;
    L[start + i] += v * (1 - Math.max(0, pan));
    R[start + i] += v * (1 + Math.min(0, pan));
  }
}

// F major, with a turn to D minor and back. Chords per bar: [bass, chord tones].
const PROG = [
  [41, [57, 60, 65]], // F
  [41, [57, 60, 65]], // F
  [46, [58, 62, 65]], // Bb
  [48, [55, 60, 64]], // C
  [38, [57, 62, 65]], // Dm
  [46, [58, 62, 65]], // Bb
  [36, [55, 58, 64]], // C7
  [41, [57, 60, 65]], // F
];
// Melody: three notes a bar (one per beat), some bars with a pickup eighth. MIDI notes, 0 = rest.
const TUNE = [
  [72, 69, 72], [77, 76, 74], [74, 70, 74], [79, 77, 76],
  [77, 74, 77], [74, 70, 74], [76, 72, 70], [69, 0, 0],
  [72, 69, 72], [77, 76, 77], [79, 77, 74], [72, 76, 79],
  [81, 77, 74], [74, 77, 74], [72, 76, 79], [77, 0, 0],
];

// Sections follow the scenes (starts in seconds, all on downbeats): dear 0, margins 8, both 16, clinic 24,
// family 30, theater 36, sign-off 44; the film is 52 s. Each section sets how much plays.
const SECTIONS = [
  [0, { box: 0.7, acc: 0, bass: 0.6, brush: 0 }],
  [8, { box: 0.9, acc: 0.6, bass: 0.9, brush: 0.4 }],
  [16, { box: 1, acc: 0.9, bass: 1, brush: 0.8 }],
  [24, { box: 0.9, acc: 0.6, bass: 0.9, brush: 0.5 }],
  [30, { box: 1, acc: 1, bass: 1, brush: 0.9 }],
  [36, { box: 1, acc: 0.8, bass: 1, brush: 1, skip: true }],
  [44, { box: 0.9, acc: 0.9, bass: 0.9, brush: 0.4 }],
];
const sectionAt = (s) => SECTIONS.filter(([t]) => s >= t).pop()[1];

const bars = Math.floor(SECONDS / BAR);
for (let b = 0; b < bars; b++) {
  const at = b * BAR;
  const sec = sectionAt(at);
  const [bass, chord] = PROG[b % PROG.length];
  const last = b === bars - 1;
  // beat 1: bass; beats 2 and 3: the chord ("oom-pah-pah")
  play({ at, dur: BEAT * 1.2, note: bass, vol: 0.32 * sec.bass, voice: 'bass', pan: -0.15 });
  if (!last && sec.acc) for (const beat of [1, 2]) for (const n of chord) play({ at: at + beat * BEAT, dur: BEAT * 0.8, note: n, vol: 0.05 * sec.acc, voice: 'accordion', pan: 0.25 });
  if (sec.brush) for (const beat of [0, 1, 2]) play({ at: at + beat * BEAT, dur: 0.1, note: 60, vol: (beat ? 0.05 : 0.08) * sec.brush, voice: 'brush', pan: beat === 1 ? -0.3 : 0.3 });
  // melody
  const bar = TUNE[b % TUNE.length];
  bar.forEach((n, k) => {
    if (!n || last) return;
    const note = n;
    play({ at: at + k * BEAT, dur: BEAT * 1.6, note, vol: 0.16 * sec.box, voice: 'box', pan: Math.sin(b + k) * 0.35 });
    if (sec.skip && k === 2) play({ at: at + k * BEAT + BEAT / 2, dur: BEAT, note: note + 5, vol: 0.1 * sec.box, voice: 'box', pan: 0.4 }); // playful extra note
  });
  // final bar: a held F major chord, music box on top
  if (last) {
    for (const n of [53, 57, 60, 65]) play({ at, dur: BAR * 1.4, note: n, vol: 0.07, voice: 'accordion' });
    for (const [k, n] of [[0, 77], [0.5, 81], [1, 84]]) play({ at: at + k * BEAT, dur: 2.5, note: n, vol: 0.14, voice: 'box', pan: 0.2 });
  }
}

const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8);
buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
// Normalize so the loudest moment peaks near -1 dBFS (the raw mix is quiet).
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const gain = 0.95 / Math.max(peak, 1e-6);
for (let i = 0; i < N; i++) { L[i] *= gain; R[i] *= gain; }

for (let i = 0; i < N; i++) {
  const fade = Math.min(1, i / (SR * 0.05), (N - i) / (SR * 0.8));
  buf.writeInt16LE(Math.round(Math.tanh(L[i] * 1.1) * fade * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(Math.tanh(R[i] * 1.1) * fade * 32767), 46 + i * 4);
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, buf);
console.log(`wrote ${OUT.replace(ROOT, '.')}: ${SECONDS}s, 3/4 at ${BPM} BPM`);
