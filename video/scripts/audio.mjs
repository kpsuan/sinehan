// Generates the video's narration, sound effects and music with ElevenLabs, into public/audio/.
// Files that already exist are skipped, so re-running never spends credits twice; delete a file to redo it.
//   ELEVENLABS_API_KEY=... node scripts/audio.mjs [vo|sfx|music|manifest] [--only=name]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'audio');
const KEY = process.env.ELEVENLABS_API_KEY;
const API = 'https://api.elevenlabs.io/v1';

// The narrator, from the ElevenLabs Voice Library (override with VOICE_ID).
const VOICE = process.env.VOICE_ID || 'K6AzvUWLhMiziMuhhX31';

const SFX = {
  pop: ['Soft bubbly cartoon UI pop, cute and short, clean', 0.5],
  click: ['Crisp single mouse click, clean UI sound', 0.5],
  whoosh: ['Soft airy whoosh for a slide transition, gentle and smooth', 1],
  swipe: ['Quick finger swipe across a glass phone screen, short swish', 0.6],
  confetti: ['Party popper burst with confetti paper rustle, joyful', 1.6],
  tick: ['Soft wooden tick, single countdown beep, warm', 0.5],
  go: ['Bright cheerful two-note chime, start signal', 1],
  toggle: ['Satisfying light switch toggle snap, clean UI', 0.5],
  typing: ['Light quiet laptop keyboard typing, a few keys', 1.2],
  sparkle: ['Gentle magical twinkle sparkle, soft chimes', 1],
  bark: ['One small cute happy puppy bark, single yip, clean', 0.6],
};

const MUSIC_PROMPT =
  'Warm, light lo-fi indie pop instrumental for a cozy product video about two people watching movies together ' +
  'from far apart. Soft electric piano, mellow clean guitar, gentle brushed drums, playful plucked melody, ' +
  'subtle bass. Around 95 BPM. Uplifting and intimate, never busy, leaves room for a voiceover. ' +
  'Builds slightly in the middle and ends cleanly with a soft final chord.';

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
  console.log('made', file.replace(ROOT, '.'), res.headers.get('character-cost') ?? '');
}

const lines = JSON.parse(readFileSync(join(ROOT, 'src', 'narration.json'), 'utf8'));
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
const step = process.argv[2] ?? 'all';

if (step === 'vo' || step === 'all')
  for (const { scene, text } of lines) {
    if (only && only !== scene) continue;
    await post(
      `/text-to-speech/${VOICE}?output_format=mp3_44100_128`,
      {
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true },
      },
      join(OUT, 'vo', `${scene}.mp3`),
    );
  }

if (step === 'sfx' || step === 'all')
  for (const [name, [text, duration_seconds]] of Object.entries(SFX)) {
    if (only && only !== name) continue;
    await post('/sound-generation', { text, duration_seconds, prompt_influence: 0.6 }, join(OUT, 'sfx', `${name}.mp3`));
  }

if (step === 'music' || step === 'all') {
  const seconds = Number(process.env.MUSIC_SECONDS || 86);
  await post(
    '/music?output_format=mp3_44100_128',
    { prompt: MUSIC_PROMPT, music_length_ms: seconds * 1000, force_instrumental: true },
    join(OUT, 'music.mp3'),
  );
}

// Durations of every generated file, so the video can time scenes and duck the music under the voice.
if (step === 'manifest' || step === 'all') {
  const probe = (f) =>
    Number(
      execFileSync('npx', ['remotion', 'ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], {
        cwd: ROOT,
        shell: true,
      })
        .toString()
        .trim(),
    );
  const manifest = { vo: {}, sfx: {}, music: 0 };
  for (const { scene } of lines) {
    const f = join(OUT, 'vo', `${scene}.mp3`);
    if (existsSync(f)) manifest.vo[scene] = probe(f);
  }
  for (const name of Object.keys(SFX)) {
    const f = join(OUT, 'sfx', `${name}.mp3`);
    if (existsSync(f)) manifest.sfx[name] = probe(f);
  }
  if (existsSync(join(OUT, 'music.mp3'))) manifest.music = probe(join(OUT, 'music.mp3'));
  writeFileSync(join(ROOT, 'src', 'audio.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(manifest);
}
