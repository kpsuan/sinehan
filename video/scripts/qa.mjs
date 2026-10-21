// QA for a finished film: samples frames from the MP4 and checks the two things the delivery gate blocks:
//   - 0.3 s or more of blank frames mid-film (near-uniform frames, not counting the first/last half second)
//   - a blue-purple background in over 30% of the film (counted as AI slop)
// plus a few warnings (very dark/bright stretches, audio missing). Writes out/qa/<name>.json and prints a verdict.
//   node scripts/qa.mjs out/matisse.mp4
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FFMPEG = join(ROOT, 'node_modules', '@remotion', 'compositor-win32-x64-msvc', 'ffmpeg.exe');
const file = process.argv[2];
if (!file || !existsSync(file)) {
  console.error('usage: node scripts/qa.mjs <film.mp4>');
  process.exit(2);
}
const name = basename(file, '.mp4');
const dir = join(ROOT, 'out', 'qa', name);
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

// 10 samples a second, tiny (48×27): enough to judge blankness and colour, fast to read.
const FPS = 10;
execFileSync(FFMPEG, ['-v', 'error', '-i', file, '-vf', `fps=${FPS},scale=48:27`, '-f', 'image2', '-pix_fmt', 'rgb24', '-c:v', 'ppm', join(dir, 'f%05d.ppm')]);
let meta = '';
try {
  execFileSync(FFMPEG, ['-i', file], { stdio: ['ignore', 'pipe', 'pipe'] });
} catch (e) {
  meta = String(e.stderr || '');
}
const hasAudio = /Stream #\d+:\d+.*Audio/.test(meta);
const durationMatch = meta.match(/Duration: (\d+):(\d+):([\d.]+)/);
const duration = durationMatch ? Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3]) : 0;

// Read a binary PPM (P6).
function readPPM(path) {
  const b = readFileSync(path);
  let i = 0;
  const tok = () => {
    while (b[i] === 0x20 || b[i] === 0x0a || b[i] === 0x0d || b[i] === 0x09) i++;
    const s = i;
    while (!(b[i] === 0x20 || b[i] === 0x0a || b[i] === 0x0d || b[i] === 0x09)) i++;
    return b.toString('ascii', s, i);
  };
  tok();
  const w = Number(tok());
  const h = Number(tok());
  tok();
  i++;
  return { w, h, px: b.subarray(i) };
}
const rgb2hsv = (r, g, b) => {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return { h, s: max ? d / max : 0, v: max / 255 };
};

const frames = readdirSync(dir).filter((f) => f.endsWith('.ppm')).sort();
const stats = frames.map((f) => {
  const { w, h, px } = readPPM(join(dir, f));
  const n = w * h;
  let sum = [0, 0, 0], sq = [0, 0, 0], bluePurple = 0, dark = 0;
  for (let p = 0; p < n; p++) {
    const r = px[p * 3], g = px[p * 3 + 1], b = px[p * 3 + 2];
    sum[0] += r; sum[1] += g; sum[2] += b;
    sq[0] += r * r; sq[1] += g * g; sq[2] += b * b;
    const { h: hue, s, v } = rgb2hsv(r, g, b);
    if (hue >= 215 && hue <= 290 && s > 0.25 && v > 0.12) bluePurple++;
    if (v < 0.08) dark++;
  }
  const mean = sum.map((x) => x / n);
  const variance = sq.map((x, k) => x / n - mean[k] * mean[k]).reduce((a, b) => a + b, 0) / 3;
  return { mean, std: Math.sqrt(Math.max(0, variance)), bluePurple: bluePurple / n, dark: dark / n };
});

// Blank: almost no variation across the frame (a solid colour). Count runs of them, ignoring the first and
// last half second (fades in and out are allowed).
const edge = Math.round(FPS * 0.5);
let longestBlank = 0, run = 0, blankAt = null;
stats.forEach((s, i) => {
  const blank = s.std < 6;
  if (blank && i >= edge && i < stats.length - edge) {
    run++;
    if (run > longestBlank) { longestBlank = run; blankAt = (i - run + 1) / FPS; }
  } else run = 0;
});
const blankSeconds = longestBlank / FPS;
const bluePurpleShare = stats.filter((s) => s.bluePurple > 0.5).length / stats.length;
const darkShare = stats.filter((s) => s.dark > 0.9).length / stats.length;

const problems = [];
const warnings = [];
if (blankSeconds >= 0.3) problems.push(`blank frames for ${blankSeconds.toFixed(1)}s mid-film (at ${blankAt?.toFixed(1)}s)`);
if (bluePurpleShare > 0.3) problems.push(`blue-purple background in ${(bluePurpleShare * 100).toFixed(0)}% of frames (limit 30%)`);
if (!hasAudio) problems.push('no audio track');
if (darkShare > 0.2) warnings.push(`very dark frames in ${(darkShare * 100).toFixed(0)}% of the film`);
if (duration && duration < 10) warnings.push(`only ${duration.toFixed(1)}s long`);

const report = { file, duration, frames: stats.length, hasAudio, blankSeconds, bluePurpleShare, darkShare, problems, warnings, checkedAt: new Date().toISOString() };
mkdirSync(join(ROOT, 'out', 'qa'), { recursive: true });
writeFileSync(join(ROOT, 'out', 'qa', `${name}.json`), JSON.stringify(report, null, 2));
rmSync(dir, { recursive: true, force: true });

console.log(`QA ${name}: ${duration.toFixed(1)}s, ${stats.length} samples, audio ${hasAudio ? 'yes' : 'NO'}`);
console.log(`  blank mid-film: ${blankSeconds.toFixed(1)}s (limit 0.3)   blue-purple: ${(bluePurpleShare * 100).toFixed(0)}% (limit 30%)   dark: ${(darkShare * 100).toFixed(0)}%`);
for (const w of warnings) console.log(`  warning: ${w}`);
for (const p of problems) console.log(`  RED: ${p}`);
console.log(problems.length ? 'RESULT: RED' : 'RESULT: GREEN');
process.exit(problems.length ? 1 : 0);
