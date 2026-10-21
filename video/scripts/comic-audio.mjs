// Audio for the comic-style reel: an upbeat track and a few comic sound effects, with ElevenLabs, into
// public/audio/. Existing files are skipped, so re-running never spends credits twice.
//   ELEVENLABS_API_KEY=... node scripts/comic-audio.mjs
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'audio');
const KEY = process.env.ELEVENLABS_API_KEY;
const API = 'https://api.elevenlabs.io/v1';

const MUSIC_PROMPT =
  'Upbeat, punchy, fun indie pop-rock instrumental for a playful comic-book style intro video. Bright driving drums, ' +
  'bouncy bass, crunchy rhythm guitar, handclaps, a catchy whistled or synth lead melody. Around 128 BPM. Energetic ' +
  'and cheerful from the first beat, a short big build at the end and a clean stinger finish. No vocals.';

const SFX = {
  pow: ['Comic book punch hit with a short cartoon impact thud, punchy and dry', 0.6],
  boing: ['Classic cartoon spring boing, bouncy and short', 0.7],
  zip: ['Quick cartoon zip whoosh, like a character dashing past, short', 0.5],
  ding: ['Bright cartoon idea ding, single bell, short', 0.6],
  stamp: ['Rubber stamp slammed on paper, short thud with a little squeak', 0.6],
};

async function post(path, body, file) {
  if (existsSync(file)) return console.log('skip', file.replace(ROOT, '.'));
  if (!KEY) throw new Error('ELEVENLABS_API_KEY is not set');
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${await res.text()}`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log('made', file.replace(ROOT, '.'));
}

for (const [name, [text, duration_seconds]] of Object.entries(SFX))
  await post('/sound-generation', { text, duration_seconds, prompt_influence: 0.6 }, join(OUT, 'sfx', `${name}.mp3`));

await post(
  '/music?output_format=mp3_44100_128',
  { prompt: MUSIC_PROMPT, music_length_ms: 50 * 1000, force_instrumental: true },
  join(OUT, 'music-upbeat.mp3'),
);
