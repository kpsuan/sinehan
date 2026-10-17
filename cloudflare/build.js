// Copies the website into dist/ for Cloudflare's static assets: the pages from server/ (landing.html becomes
// index.html) and the files from server/public/ under static/. The extension zip goes to files/, which the
// Worker serves as /download. Only these are published; nothing else from server/ is.
const fs = require('fs');
const path = require('path');

const SERVER = path.join(__dirname, '..', 'server');
const DIST = path.join(__dirname, 'dist');
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(path.join(DIST, 'static'), { recursive: true });
fs.mkdirSync(path.join(DIST, 'files'), { recursive: true });

const PAGES = { 'landing.html': 'index.html', 'join.html': 'join.html', 'party.html': 'party.html', 'guide.html': 'guide.html', 'privacy.html': 'privacy.html' };
for (const [from, to] of Object.entries(PAGES)) fs.copyFileSync(path.join(SERVER, from), path.join(DIST, to));

for (const name of fs.readdirSync(path.join(SERVER, 'public'))) {
  const src = path.join(SERVER, 'public', name);
  if (!fs.statSync(src).isFile()) continue;
  if (name === 'sinehan-extension.zip') fs.copyFileSync(src, path.join(DIST, 'files', name));
  else fs.copyFileSync(src, path.join(DIST, 'static', name));
}
console.log('built dist/');
