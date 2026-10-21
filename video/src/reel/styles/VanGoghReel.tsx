// Fran's intro reel in Van Gogh's manner, told as a letter: each line is written across the screen in brush
// handwriting while a painted scene settles behind it. Every scene has one main action plus the style's two
// motif loops: the night sky's strokes curl around drifting swirls, and every star or lamp has a halo whose
// rings spread outward and fade. Motion sits on a 3/4 waltz at 90 BPM: a beat is 20 frames, a bar 60; scenes
// are whole bars. Music is synthesized in code (scripts/synth-waltz.mjs → public/audio/vangogh.wav).
// Palette stays in teals, ochres and greens (no blue-violet), as the delivery QA asks.
import React from 'react';
import { AbsoluteFill, Html5Audio, Img, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { drift, ease, fadeIn, glide, pop } from '../../anim';
import { Bantay } from '../../components/Bantay';
import { asset, loop } from './shared';

const BEAT = 20;
const BAR = 60;
const HAND = "'Caveat Brush', cursive";
const INTER = "'Inter', sans-serif";
const SKY = '#0f3a45';
const SKY_STROKES = ['#1b5868', '#226d7c', '#2f8190', '#174b58', '#3a8f8f'];
const SWIRL_LIGHT = ['#8cc9c0', '#c9e4c5', '#e9efc0'];
const STAR = '#f6cf45';
const OCHRE = '#d8962a';
const CREAM = '#fbefd0';
const CYPRESS = '#173322';
const CYPRESS_LIGHT = '#3d6b3c';

// Deterministic pseudo-random in [0, 1) per index, so every render paints the same strokes.
const rand = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// ---- Motif 1: the sky. Short strokes on a jittered grid, each turned along a flow field made of a gentle
// drift plus whirlpools around a few centres; the centres orbit slowly and the strokes sway along their
// direction, so the sky keeps curling. A soft pulse lands on each downbeat.
type Swirl = { x: number; y: number; r: number; spin: number };
const Sky: React.FC<{ swirls: Swirl[]; strength?: number }> = ({ swirls, strength = 1 }) => {
  const f = useCurrentFrame();
  const centres = swirls.map((s, i) => ({ ...s, x: s.x + Math.cos((f + i * 70) / 38) * 26, y: s.y + Math.sin((f + i * 70) / 38) * 18 }));
  const downbeat = Math.exp(-(f % BAR) / 9);
  const strokes = [];
  const COLS = 42;
  const ROWS = 24;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const i = row * COLS + col;
      const x = (col + rand(i)) * (1920 / COLS);
      const y = (row + rand(i + 999)) * (1080 / ROWS);
      let vx = 1;
      let vy = 0.25 * Math.sin(x / 260 + y / 340 + f / 90);
      let near = 0;
      for (const c of centres) {
        const dx = x - c.x;
        const dy = y - c.y;
        const d = Math.hypot(dx, dy) + 1;
        const w = Math.exp(-((d / c.r) ** 2)) * 3.2 * strength;
        vx += (-dy / d) * w * c.spin;
        vy += (dx / d) * w * c.spin;
        near = Math.max(near, Math.exp(-((d / (c.r * 0.75)) ** 2)) * strength);
      }
      const a = Math.atan2(vy, vx);
      const len = 22 + rand(i + 3) * 14;
      const sway = Math.sin((f + rand(i + 7) * 120) / 16) * 5;
      const cx = x + Math.cos(a) * sway;
      const cy = y + Math.sin(a) * sway;
      const color = near > 0.35 ? SWIRL_LIGHT[Math.floor(rand(i + 11) * 3)] : SKY_STROKES[Math.floor(rand(i + 13) * SKY_STROKES.length)];
      strokes.push(
        <line
          key={i}
          x1={cx - (Math.cos(a) * len) / 2}
          y1={cy - (Math.sin(a) * len) / 2}
          x2={cx + (Math.cos(a) * len) / 2}
          y2={cy + (Math.sin(a) * len) / 2}
          stroke={color}
          strokeWidth={5 + rand(i + 17) * 4 + near * 3 + downbeat * near * 2}
          strokeLinecap="round"
          opacity={0.75 + near * 0.25}
        />,
      );
    }
  }
  return (
    <AbsoluteFill style={{ background: SKY }}>
      <svg width={1920} height={1080} style={{ position: 'absolute' }}>
        {strokes}
      </svg>
    </AbsoluteFill>
  );
};

// ---- Motif 2: a halo. A light with rings of brush dabs that keep spreading outward and fading.
const Halo: React.FC<{ x: number; y: number; r: number; color?: string; grow?: number; phase?: number }> = ({ x, y, r, color = STAR, grow = 1, phase = 0 }) => {
  const f = useCurrentFrame();
  const PERIOD = 60;
  const rings = [0, 1, 2].map((k) => {
    const t = ((f + phase + (k * PERIOD) / 3) % PERIOD) / PERIOD;
    const rr = r * (1.2 + t * 1.8 * grow);
    return <circle key={k} cx={x} cy={y} r={rr} fill="none" stroke={color} strokeWidth={r * 0.22} strokeDasharray={`${r * 0.35} ${r * 0.28}`} strokeLinecap="round" opacity={(1 - t) * 0.75} />;
  });
  return (
    <svg width={1920} height={1080} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
      <circle cx={x} cy={y} r={r * 1.5 * grow} fill={color} opacity={0.18} />
      {rings}
      <circle cx={x} cy={y} r={r} fill={color} />
      <circle cx={x - r * 0.25} cy={y - r * 0.25} r={r * 0.45} fill="#fff6c8" />
    </svg>
  );
};

const Moon: React.FC<{ x: number; y: number }> = ({ x, y }) => (
  <>
    <Halo x={x} y={y} r={56} color="#f2b33a" phase={30} />
    <svg width={1920} height={1080} style={{ position: 'absolute', left: 0, top: 0 }}>
      <circle cx={x + 22} cy={y - 14} r={46} fill={SKY} />
    </svg>
  </>
);

// A cypress: a dark green flame of upward strokes, swaying.
const Cypress: React.FC<{ x: number; h: number; phase?: number }> = ({ x, h, phase = 0 }) => {
  const f = useCurrentFrame();
  const sway = Math.sin((f + phase) / 45) * 3;
  const strokes = Array.from({ length: 34 }, (_, i) => {
    const t = i / 34;
    const w = Math.sin(t * Math.PI) * 120 * (1 - t * 0.5);
    const px = (rand(i + 50) - 0.5) * w;
    return <path key={i} d={`M ${px} ${1080 - t * h} q ${12 * (rand(i) - 0.5)} -60 ${px * 0.2 - px} -140`} stroke={i % 3 ? CYPRESS_LIGHT : '#26472c'} strokeWidth={10} fill="none" strokeLinecap="round" />;
  });
  return (
    <svg width={400} height={1080} style={{ position: 'absolute', left: x - 200, top: 0, overflow: 'visible', transform: `skewX(${sway}deg)`, transformOrigin: 'bottom' }}>
      <g transform="translate(200 0)">
        <path d={`M -90 1080 C -120 ${1080 - h * 0.4}, -20 ${1080 - h * 0.8}, 0 ${1080 - h} C 20 ${1080 - h * 0.8}, 120 ${1080 - h * 0.4}, 90 1080 Z`} fill={CYPRESS} />
        {strokes}
      </g>
    </svg>
  );
};

// A painting in a gilt frame. `swing` hangs it from above with a little pendulum settle.
const Gilt: React.FC<{ src: string; x: number; y: number; w: number; h: number; at: number; swing?: boolean; fit?: 'cover' | 'contain'; pos?: string }> = ({ src, x, y, w, h, at, swing = false, fit = 'cover', pos = 'center' }) => {
  const f = useCurrentFrame();
  const p = swing ? pop(f, at, { damping: 7, stiffness: 120, mass: 0.7 }) : glide(f, at, 30);
  const rot = swing ? (1 - p) * -14 : 0;
  const dy = (1 - Math.min(1, p)) * (swing ? -140 : 160);
  return (
    <div
      style={{
        position: 'absolute', left: x, top: y, width: w, height: h, padding: 16,
        background: 'linear-gradient(135deg, #8a5a18, #f2c75c 25%, #a8701f 50%, #f7d77a 75%, #7a4c12)',
        boxShadow: '0 18px 40px rgba(0,0,0,0.45), inset 0 0 0 4px rgba(90,55,10,0.6)',
        transform: `translateY(${dy}px) rotate(${rot}deg)`, transformOrigin: 'top center', opacity: Math.min(1, p * 2),
      }}
    >
      <Img src={src} style={{ width: '100%', height: '100%', objectFit: fit, objectPosition: pos, display: 'block', background: '#1d2a22', boxShadow: 'inset 0 0 0 3px #5b3a0c' }} />
    </div>
  );
};

// Brush handwriting, revealed left to right as if written, about 25 characters a second. A soft dark wash
// fades in behind it and each letter carries a dark outline, so it never drowns in the busy sky.
const Write: React.FC<{ text: string; at: number; x: number; y: number; size: number; color?: string; width?: number; speed?: number }> = ({ text, at, x, y, size, color = CREAM, width, speed = 1.2 }) => {
  const f = useCurrentFrame();
  const len = Math.max(8, text.length * speed);
  const shown = ease(f, [at, at + len], [0, 100]);
  return (
    <div style={{ position: 'absolute', left: x, top: y, width, fontFamily: HAND, fontSize: size, lineHeight: 1.1, whiteSpace: width ? 'normal' : 'nowrap', opacity: shown > 0 ? 1 : 0, clipPath: `inset(-60% calc(${100 - shown}% - ${size * 0.6 * Math.min(1, shown / 5)}px) -60% -${size * 0.6}px)` }}>
      <div style={{ position: 'absolute', inset: `${size * 0.05}px -${size * 0.35}px`, background: 'rgba(7,26,31,0.72)', borderRadius: size * 0.5, filter: `blur(${size * 0.22}px)` }} />
      <div
        style={{
          position: 'relative', color, WebkitTextStroke: `${Math.max(4, size * 0.07)}px rgba(7,26,31,0.92)`, paintOrder: 'stroke fill',
          textShadow: '0 3px 0 rgba(0,0,0,0.4)',
        }}
      >
        {text}
      </div>
    </div>
  );
};

// Writing a long line over two rows: the second starts when the first finishes.
const Lines: React.FC<{ rows: string[]; at: number; x: number; y: number; size: number; color?: string }> = ({ rows, at, x, y, size, color }) => {
  let t = at;
  return (
    <>
      {rows.map((r, i) => {
        const start = t;
        t += Math.max(8, r.length * 1.2) + 4;
        return <Write key={i} text={r} at={start} x={x} y={y + i * size * 1.15} size={size} color={color} />;
      })}
    </>
  );
};

const Stars: React.FC<{ list: [number, number, number][] }> = ({ list }) => (
  <>
    {list.map(([x, y, r], i) => (
      <Halo key={i} x={x} y={y} r={r} phase={i * 17} />
    ))}
  </>
);

// ---- Scenes (frames are local to each scene) ----

// "Dear whoever's watching, I'm Fran." The painted portrait rises into the night.
const Dear: React.FC = () => (
  <AbsoluteFill>
    <Sky swirls={[{ x: 760, y: 300, r: 260, spin: 1 }, { x: 1250, y: 420, r: 170, spin: -1 }]} />
    <Moon x={1720} y={150} />
    <Stars list={[[160, 110, 16], [560, 90, 13], [980, 150, 15], [1420, 90, 12]]} />
    <Cypress x={90} h={820} />
    <Gilt src={asset('grad-vg.jpg')} x={1250} y={210} w={420} h={525} at={BEAT} pos="center 20%" />
    <Write text="Dear whoever's watching," at={2 * BEAT} x={170} y={330} size={104} />
    <Write text="I'm Fran." at={6 * BEAT} x={300} y={500} size={190} color={STAR} />
  </AbsoluteFill>
);

// A page of code, and doodles that creep in around it, one per beat.
const CODE = ['def shortest_path(graph, a, b):', '    seen, queue = {a}, [[a]]', '    while queue:', '        path = queue.pop(0)', '        if path[-1] == b:', '            return path', '        for n in graph[path[-1]]:', '            ...'];
const DOODLES: { d: string; x: number; y: number; color: string }[] = [
  { d: 'M 50 50 m -36 0 a 36 36 0 1 0 72 0 a 36 36 0 1 0 -72 0 M 50 50 m -18 0 a 18 18 0 1 1 36 0 a 10 10 0 1 1 -20 0', x: -60, y: 40, color: OCHRE }, // swirl sun
  { d: 'M 50 95 L 50 45 M 50 45 q -25 -30 0 -40 q 25 10 0 40 q -40 -5 -38 -28 q 30 -6 38 28 q 40 -5 38 -28 q -30 -6 -38 28', x: 780, y: 110, color: '#c8513a' }, // flower
  { d: 'M 50 5 L 61 38 L 95 38 L 67 58 L 78 92 L 50 71 L 22 92 L 33 58 L 5 38 L 39 38 Z', x: 770, y: 440, color: '#2f8190' }, // star
  { d: 'M 50 50 m -40 0 a 40 40 0 1 0 80 0 a 40 40 0 1 0 -80 0 M 35 40 l 0 4 M 65 40 l 0 4 M 32 62 q 18 16 36 0', x: -70, y: 420, color: '#3d6b3c' }, // smiley
];
const Margins: React.FC = () => {
  const f = useCurrentFrame();
  const page = glide(f, 0, 24);
  return (
    <AbsoluteFill>
      <Sky swirls={[{ x: 1500, y: 260, r: 230, spin: 1 }, { x: 300, y: 900, r: 200, spin: -1 }]} strength={0.8} />
      <Stars list={[[1760, 120, 14], [1260, 80, 11]]} />
      <div style={{ position: 'absolute', left: 230, top: 120, width: 860, height: 640, transform: `translateY(${(1 - page) * 700}px) rotate(-3deg)`, background: '#f3e6c4', boxShadow: '0 20px 50px rgba(0,0,0,0.5)', borderRadius: 6, overflow: 'visible' }}>
        {/* ruled lines and a margin rule */}
        {Array.from({ length: 13 }, (_, i) => (
          <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: 60 + i * 44, height: 2, background: 'rgba(47,129,144,0.35)' }} />
        ))}
        <div style={{ position: 'absolute', left: 120, top: 0, bottom: 0, width: 3, background: 'rgba(200,81,58,0.5)' }} />
        {CODE.map((line, i) => (
          <div key={i} style={{ position: 'absolute', left: 140, top: 66 + i * 44, fontFamily: "'Courier New', monospace", fontSize: 26, fontWeight: 700, color: '#3b2a14', whiteSpace: 'pre', opacity: fadeIn(f, 12 + i * 6, 6) }}>
            {line}
          </div>
        ))}
        {DOODLES.map((dd, i) => {
          const at = 2 * BEAT + i * BEAT * 1.5;
          const drawn = ease(f, [at, at + 30], [1, 0]);
          return (
            <svg key={i} viewBox="0 0 100 100" width={150} height={150} style={{ position: 'absolute', left: dd.x, top: dd.y, overflow: 'visible', transform: `rotate(${drift(f, 4, 120, i * 30)}deg)` }}>
              <path d={dd.d} fill="none" stroke={dd.color} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={drawn} />
            </svg>
          );
        })}
      </div>
      <Lines rows={['I studied computer science', 'at UP Visayas,', 'but I kept drawing', 'in the margins.']} at={BEAT} x={1190} y={300} size={68} />
    </AbsoluteFill>
  );
};

// "So I became both." Three paintings swing onto the wall, one per beat.
const Both: React.FC = () => (
  <AbsoluteFill>
    <Sky swirls={[{ x: 960, y: 150, r: 300, spin: 1 }]} strength={0.9} />
    <Stars list={[[200, 140, 15], [1700, 150, 15], [620, 60, 10], [1300, 60, 10]]} />
    <Write text="So I became both." at={0} x={560} y={60} size={130} color={STAR} />
    {[
      ['landing-pages.jpg', 110, 'web design'],
      ['maps.jpg', 700, 'maps'],
      ['listing.jpg', 1290, 'listings'],
    ].map(([src, x, label], i) => (
      <React.Fragment key={i}>
        <Gilt src={asset(src as string)} x={x as number} y={330} w={520} h={293} at={2 * BEAT + i * BEAT} swing />
        <Write text={label as string} at={5 * BEAT + i * BEAT} x={(x as number) + 20} y={680} size={60} />
      </React.Fragment>
    ))}
    <Write text="I design it, and then I build it." at={8 * BEAT} x={500} y={860} size={78} />
  </AbsoluteFill>
);

// A clinic under a street lamp whose halo grows: isKalusugan.
const Clinic: React.FC = () => {
  const f = useCurrentFrame();
  const grow = ease(f, [0, 4 * BEAT], [0.4, 1.6]);
  return (
    <AbsoluteFill>
      <Sky swirls={[{ x: 400, y: 260, r: 260, spin: -1 }]} strength={0.7} />
      {/* lamp post */}
      <div style={{ position: 'absolute', left: 300, top: 330, width: 18, height: 750, background: '#1e2b1d', borderRadius: 6 }} />
      <div style={{ position: 'absolute', left: 262, top: 250, width: 94, height: 90, background: '#2a2a18', clipPath: 'polygon(20% 0, 80% 0, 100% 100%, 0 100%)' }} />
      <Halo x={309} y={300} r={34} color="#f7c948" grow={grow} />
      <Gilt src={asset('iskalusugan.jpg')} x={760} y={110} w={960} h={540} at={BEAT} pos="top" />
      <Lines rows={['At UPV I built isKalusugan,', 'so students could book a checkup without the line.']} at={2 * BEAT} x={560} y={760} size={70} />
    </AbsoluteFill>
  );
};

// A little house whose windows light up one per beat: A Whole Family Matter.
const Family: React.FC = () => {
  const f = useCurrentFrame();
  const windows: [number, number][] = [[60, 120], [180, 120], [60, 230], [180, 230]];
  return (
    <AbsoluteFill>
      <Sky swirls={[{ x: 1500, y: 200, r: 240, spin: 1 }, { x: 600, y: 160, r: 180, spin: -1 }]} strength={0.8} />
      <Stars list={[[1100, 100, 14], [1780, 380, 12]]} />
      <div style={{ position: 'absolute', left: 140, top: 340, transform: `translateY(${(1 - glide(f, 0, 24)) * 400}px)` }}>
        <svg width={320} height={360} viewBox="0 0 320 360" style={{ overflow: 'visible' }}>
          <path d="M 10 110 L 160 0 L 310 110 Z" fill="#8a3b22" />
          <rect x={30} y={100} width={260} height={250} fill={OCHRE} />
          {windows.map(([x, y], i) => {
            const on = pop(f, BEAT + i * BEAT);
            return (
              <g key={i}>
                <rect x={x} y={y} width={80} height={80} fill="#2b2a1a" />
                <rect x={x} y={y} width={80} height={80} fill={STAR} opacity={Math.min(1, on)} />
                <circle cx={x + 40} cy={y + 40} r={60 * on} fill={STAR} opacity={0.18 * Math.min(1, on)} />
              </g>
            );
          })}
        </svg>
      </div>
      <Gilt src={asset('dashboard.jpg')} x={800} y={90} w={840} h={632} at={BEAT} pos="top" />
      <Lines rows={['Now I help families plan', 'end-of-life care, together.']} at={2 * BEAT} x={620} y={780} size={74} />
      <Write text="A Whole Family Matter" at={5 * BEAT} x={140} y={760} size={48} color={STAR} />
    </AbsoluteFill>
  );
};

// Two windows, two cities apart; a ribbon of stars draws itself between them, and Bantay dances on beat.
const Theater: React.FC = () => {
  const f = useCurrentFrame();
  const drawn = ease(f, [BEAT, 4 * BEAT], [0, 1]);
  const ARC = (t: number) => ({ x: 170 + t * 1580, y: 360 - Math.sin(t * Math.PI) * 300 });
  const ribbon = Array.from({ length: 26 }, (_, i) => {
    const t = i / 25;
    if (t > drawn) return null;
    const p = ARC(t);
    return <Halo key={i} x={p.x} y={p.y + Math.sin((f + i * 9) / 12) * 6} r={i % 4 === 0 ? 11 : 7} phase={i * 7} />;
  });
  const hop = Math.abs(Math.sin((f / BEAT) * Math.PI)) * 18;
  return (
    <AbsoluteFill>
      <Sky swirls={[{ x: 960, y: 120, r: 280, spin: 1 }]} />
      {[100, 1680].map((x, i) => (
        <div key={i} style={{ position: 'absolute', left: x, top: 390, width: 140, height: 170, background: '#2b2a1a', border: '10px solid #6b4a1c', boxShadow: `0 0 ${40 + 20 * loop(f, 60, i * 30)}px ${STAR}` }}>
          <div style={{ position: 'absolute', inset: 0, background: STAR, opacity: 0.85 }} />
          <div style={{ position: 'absolute', left: 60, top: 0, bottom: 0, width: 10, background: '#6b4a1c' }} />
          <div style={{ position: 'absolute', top: 70, left: 0, right: 0, height: 10, background: '#6b4a1c' }} />
        </div>
      ))}
      {ribbon}
      <Gilt src={asset('sinehan-store.png')} x={560} y={270} w={800} h={500} at={2 * BEAT} />
      <svg width={420} height={160} style={{ position: 'absolute', left: 1330, top: 785, opacity: fadeIn(f, 3 * BEAT, 10) }}>
        <path d="M 0 160 Q 210 -20 420 160 Z" fill={CYPRESS} />
        {Array.from({ length: 14 }, (_, i) => <path key={i} d={`M ${40 + i * 25} ${150 - Math.sin((i / 13) * Math.PI) * 70} q 6 -22 ${(rand(i) - 0.5) * 20} -34`} stroke={CYPRESS_LIGHT} strokeWidth={8} strokeLinecap="round" fill="none" />)}
      </svg>
      <div style={{ position: 'absolute', left: 1420, top: 640 - hop, transform: `rotate(${Math.sin((f / BEAT) * Math.PI) * 8}deg)`, opacity: fadeIn(f, 3 * BEAT, 10) }}>
        <Bantay pose={f > 6 * BEAT ? 'party' : 'happy'} size={230} />
      </div>
      <Lines rows={['And for my partner and me, two cities apart,', 'I built a movie theater for two.']} at={3 * BEAT} x={200} y={820} size={70} />
    </AbsoluteFill>
  );
};

// The sign-off, under the brightest sky.
const LINKS = ['prandesal.framer.website', 'github.com/kpsuan', 'linkedin.com/in/kpsuan'];
const SignOff: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Sky swirls={[{ x: 1100, y: 250, r: 320, spin: 1 }, { x: 1650, y: 600, r: 200, spin: -1 }]} strength={1.15} />
      <Moon x={1780} y={130} />
      <Stars list={[[900, 90, 14], [1350, 520, 12], [700, 700, 10]]} />
      <Cypress x={1820} h={700} phase={40} />
      <Gilt src={asset('sunset-vg.jpg')} x={120} y={130} w={480} h={640} at={0} />
      <Lines rows={["I'd love to make", 'something with you.']} at={BEAT} x={720} y={170} size={100} />
      <Write text="Yours," at={3.5 * BEAT} x={760} y={450} size={80} />
      <Write text="Fran" at={4.5 * BEAT} x={820} y={510} size={200} color={STAR} speed={4} />
      {LINKS.map((l, i) => (
        <div key={l} style={{ position: 'absolute', left: 760, top: 790 + i * 64, fontFamily: INTER, fontSize: 42, fontWeight: 700, color: CREAM, WebkitTextStroke: '5px rgba(7,26,31,0.92)', paintOrder: 'stroke fill', textShadow: '0 0 14px rgba(6,28,34,0.95)', opacity: fadeIn(f, 5 * BEAT + i * BEAT / 2, 10) }}>
          {l}
        </div>
      ))}
    </AbsoluteFill>
  );
};

// Scenes in whole bars: [component, bars]. Starts land on downbeats; a one-beat dissolve joins them.
const SCENES: [React.FC, number][] = [
  [Dear, 4],
  [Margins, 4],
  [Both, 4],
  [Clinic, 3],
  [Family, 3],
  [Theater, 4],
  [SignOff, 4],
];
const STARTS = SCENES.reduce<number[]>((acc, [, bars], i) => [...acc, i ? acc[i - 1] + SCENES[i - 1][1] * BAR : 0], []);
export const VANGOGH_DURATION = SCENES.reduce((n, [, bars]) => n + bars * BAR, 0);
const DISSOLVE = BEAT;

const musicVolume = (f: number) => interpolate(f, [0, 8, VANGOGH_DURATION - 20, VANGOGH_DURATION], [0, 1, 1, 0.85], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

export const VanGoghReel: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: SKY }}>
      {SCENES.map(([Scene, bars], i) => {
        const from = STARTS[i];
        const len = bars * BAR + (i < SCENES.length - 1 ? DISSOLVE : 0);
        const opacity = i === 0 ? 1 : interpolate(f, [from, from + DISSOLVE], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        return (
          <Sequence key={i} from={from} durationInFrames={len}>
            <AbsoluteFill style={{ opacity }}>
              <Scene />
            </AbsoluteFill>
          </Sequence>
        );
      })}
      <Html5Audio src={staticFile('audio/vangogh.wav')} volume={musicVolume} />
    </AbsoluteFill>
  );
};
