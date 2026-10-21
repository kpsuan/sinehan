// Delivery: runs QA on the film, requires a review note from the independent viewer, and only then copies
// the film into out/delivery/ with a short manifest. Anything red stops it.
//   node scripts/deliver.mjs out/matisse.mp4 [review/matisse.md]
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const film = process.argv[2];
const review = process.argv[3] || join(ROOT, 'review', `${basename(film || '', '.mp4')}.md`);
if (!film || !existsSync(film)) {
  console.error('usage: node scripts/deliver.mjs <film.mp4> [review.md]');
  process.exit(2);
}
const name = basename(film, '.mp4');

// 1. The QA script must pass.
let qaOk = true;
try {
  execFileSync(process.execPath, [join(ROOT, 'scripts', 'qa.mjs'), film], { stdio: 'inherit' });
} catch {
  qaOk = false;
}
if (!qaOk) {
  console.error('deliver: QA is RED; fix and re-render first.');
  process.exit(1);
}

// 2. The independent review must exist and not list open red findings.
if (!existsSync(review)) {
  console.error(`deliver: no review at ${review}. Have a viewer who took no part in making it watch the film and write one.`);
  process.exit(1);
}
const notes = readFileSync(review, 'utf8');
const open = notes.split('\n').filter((l) => /^\s*-\s*\[ \]\s*RED/i.test(l));
if (open.length) {
  console.error(`deliver: the review has ${open.length} open red finding(s):\n${open.join('\n')}`);
  process.exit(1);
}

// 3. Deliver.
const dir = join(ROOT, 'out', 'delivery');
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 10);
const dest = join(dir, `${name}-${stamp}.mp4`);
copyFileSync(film, dest);
const qa = JSON.parse(readFileSync(join(ROOT, 'out', 'qa', `${name}.json`), 'utf8'));
writeFileSync(join(dir, `${name}-${stamp}.md`), `# ${name}\n\nDelivered ${new Date().toISOString()}\n\n- Film: ${dest}\n- Duration: ${qa.duration.toFixed(1)}s\n- QA: green (blank ${qa.blankSeconds.toFixed(1)}s, blue-purple ${(qa.bluePurpleShare * 100).toFixed(0)}%)\n- Review: ${review}\n`);
console.log(`delivered: ${dest}`);
