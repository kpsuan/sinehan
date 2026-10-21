// Fran's intro reel in Matisse cut-outs, told as "two hands": the designer's hand makes things beautiful
// but still; the developer's hand makes things move but plain; together they make Fran's work. Every scene
// has one main action (paper glides in and settles) plus the style's two motif loops (leaves drift and
// turn; beads hop in sequence). Motion sits on a 120 BPM grid: a beat is 15 frames, a bar 60; scenes are
// whole bars. Music is synthesized in code (scripts/synth.mjs → public/audio/matisse.wav).
import React from 'react';
import { AbsoluteFill, Html5Audio, Img, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { TransitionSeries, springTiming } from '@remotion/transitions';
import { slide } from '@remotion/transitions/slide';
import { drift, glide, pop } from '../../anim';
import { Bantay } from '../../components/Bantay';
import { BLACK, BLOB, BLUE, CORAL, CutWord, FROND, GREEN, LEAF, PAPER, Shape, YELLOW } from './Matisse';
import { asset, loop } from './shared';

const BEAT = 15;
const BAR = 60;
const INTER = "'Inter', sans-serif";
const GREY = '#d9d6cf';
const GREYINK = '#5c5a55';
const SKIN = '#e8b48f';

// Three torn-paper outlines, so no two cut-outs look alike.
const TEARS = [
  'polygon(3% 6%, 30% 0%, 62% 4%, 97% 2%, 100% 40%, 96% 70%, 100% 96%, 66% 100%, 34% 96%, 2% 100%, 0% 62%, 4% 30%)',
  'polygon(0% 10%, 18% 2%, 50% 6%, 82% 0%, 100% 12%, 97% 48%, 100% 88%, 80% 100%, 48% 95%, 14% 100%, 2% 80%, 5% 44%)',
  'polygon(6% 0%, 44% 5%, 72% 0%, 100% 8%, 94% 36%, 100% 64%, 96% 100%, 60% 94%, 28% 100%, 0% 92%, 5% 58%, 0% 28%)',
];

// A photo cut out of paper: glides in from an edge (main action), floats a little, carries a cut label.
const Torn: React.FC<{ src: string; at: number; x: number; y: number; w: number; h: number; tilt?: number; tear?: number; from?: 'left' | 'right' | 'top' | 'bottom'; label?: string; labelColor?: string; phase?: number; pos?: string }> = ({
  src, at, x, y, w, h, tilt = 0, tear = 0, from = 'bottom', label, labelColor = BLUE, phase = 0, pos = 'center',
}) => {
  const f = useCurrentFrame();
  const p = glide(f, at, 24);
  const off = (1 - p) * 800;
  const dx = from === 'left' ? -off : from === 'right' ? off : 0;
  const dy = from === 'top' ? -off : from === 'bottom' ? off : 0;
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: w, height: h, transform: `translate(${dx}px, ${dy + drift(f, 5, 150, phase)}px) rotate(${tilt + (1 - p) * 8}deg)` }}>
      <div style={{ position: 'absolute', inset: -6, background: '#fff', clipPath: TEARS[tear % TEARS.length] }} />
      <div style={{ position: 'absolute', inset: 0, clipPath: TEARS[tear % TEARS.length], background: '#eee' }}>
        <Img src={src} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: pos, filter: 'saturate(1.2) contrast(1.08)' }} />
      </div>
      {label && <Strip text={label} at={at + BEAT} x={-10} y={h - 26} color={labelColor} />}
    </div>
  );
};

// A strip of coloured paper with words on it.
const Strip: React.FC<{ text: string; at: number; x: number; y: number; color?: string; ink?: string; size?: number; tilt?: number; until?: number }> = ({
  text, at, x, y, color = BLUE, ink = '#fff', size = 24, tilt = -2, until,
}) => {
  const f = useCurrentFrame();
  const s = pop(f, at, { damping: 11, stiffness: 190, mass: 0.6 });
  const gone = until != null && f >= until ? 1 - Math.min(1, (f - until) / 6) : 1;
  return (
    <div style={{ position: 'absolute', left: x, top: y, padding: `${size * 0.35}px ${size * 0.8}px`, background: color, color: ink, fontFamily: INTER, fontWeight: 800, fontSize: size, letterSpacing: '-0.01em', whiteSpace: 'nowrap', transform: `rotate(${tilt}deg) scale(${s * gone})`, transformOrigin: '0 50%', opacity: Math.min(1, s * 3) * gone }}>
      {text}
    </div>
  );
};

// Loop 2: beads hop along in sequence, one per beat.
const Beads: React.FC<{ x: number; y: number; n?: number; at?: number; colors?: string[] }> = ({ x, y, n = 9, at = 0, colors = [CORAL, BLUE, YELLOW] }) => {
  const f = useCurrentFrame();
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const t = ((f - i * 3) % BEAT) / BEAT;
        const hop = Math.sin(Math.PI * t) * 20;
        return <div key={i} style={{ position: 'absolute', left: x + i * 54, top: y - hop, width: 26, height: 26, borderRadius: '50%', background: colors[i % colors.length], opacity: pop(f, at + i * 3) }} />;
      })}
    </>
  );
};

// Loop 1 lives in Shape (leaves drift and slowly turn). Each scene gets its own set.
const Leaves: React.FC<{ set: number; mono?: boolean }> = ({ set, mono }) => {
  const sets = [
    [[BLOB, BLUE, -200, 700, 520, 30, 'bottom'], [LEAF, GREEN, 1560, -120, 420, -20, 'top'], [FROND, YELLOW, 1650, 700, 380, 40, 'right']],
    [[LEAF, CORAL, -120, -140, 460, 50, 'top'], [FROND, GREEN, 1620, 120, 400, -30, 'right'], [BLOB, YELLOW, 1500, 780, 420, 10, 'bottom']],
    [[FROND, BLUE, -80, 560, 440, 20, 'left'], [LEAF, YELLOW, 1600, -100, 380, 30, 'top'], [BLOB, CORAL, 1640, 760, 360, -20, 'right']],
    [[BLOB, GREEN, -160, -120, 520, 0, 'left'], [LEAF, CORAL, 1580, 740, 420, -60, 'bottom'], [FROND, YELLOW, 760, -160, 300, 90, 'top']],
    [[LEAF, BLUE, -100, 740, 420, 110, 'bottom'], [FROND, CORAL, 1660, -80, 380, 10, 'top'], [BLOB, YELLOW, 1500, 700, 440, 20, 'right']],
    [[FROND, GREEN, -120, -100, 460, 20, 'left'], [BLOB, BLUE, 1560, 720, 440, 0, 'bottom'], [LEAF, CORAL, 1640, 80, 340, -40, 'right']],
  ] as const;
  return (
    <>
      {sets[set % sets.length].map(([d, fill, x, y, size, rot, from], i) => (
        <Shape key={i} d={d} fill={mono ? GREY : fill} x={x} y={y} size={size} rot={rot} at={i * 4} from={from} phase={i * 50 + set * 20} />
      ))}
    </>
  );
};

const Ground: React.FC<{ children: React.ReactNode; tint?: string }> = ({ children, tint = PAPER }) => <AbsoluteFill style={{ background: tint, overflow: 'hidden', fontFamily: INTER, color: BLACK }}>{children}</AbsoluteFill>;

// A cut-paper hand: palm, four fingers, a thumb. Moves along keyframes [frame, x, y]; taps dip it briefly.
const Hand: React.FC<{ path: [number, number, number][]; taps?: number[]; flip?: boolean; color?: string }> = ({ path, taps = [], flip, color = SKIN }) => {
  const f = useCurrentFrame();
  const t = path.map((p) => p[0]);
  const x = interpolate(f, t, path.map((p) => p[1]), { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const y = interpolate(f, t, path.map((p) => p[2]), { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const tap = taps.some((a) => f >= a && f < a + 6) ? 10 : 0;
  return (
    <svg viewBox="0 0 200 260" width={220} height={286} style={{ position: 'absolute', left: x - 110, top: y - 60 + tap, transform: `${flip ? 'scaleX(-1)' : ''} rotate(${drift(f, 3, 120)}deg)`, transformOrigin: '50% 30%' }}>
      <path d="M60 110 C 55 60, 70 40, 78 40 C 86 40, 90 60, 90 100 C 92 50, 100 30, 110 30 C 120 30, 124 50, 122 100 C 126 56, 134 40, 142 42 C 150 44, 154 60, 150 108 C 156 76, 166 66, 172 70 C 178 74, 178 90, 170 130 C 166 180, 150 220, 120 250 C 90 260, 50 240, 40 200 C 34 170, 24 150, 18 130 C 10 110, 22 98, 34 108 C 44 116, 52 124, 60 128 Z" fill={color} />
    </svg>
  );
};

// A cut-paper face: round, two eyes, a mouth that can smile.
const Face: React.FC<{ x: number; y: number; at: number; smile: number; color?: string }> = ({ x, y, at, smile, color = YELLOW }) => {
  const f = useCurrentFrame();
  const p = pop(f, at, { damping: 10, stiffness: 180, mass: 0.6 });
  return (
    <svg viewBox="0 0 200 200" width={220} height={220} style={{ position: 'absolute', left: x, top: y, transform: `scale(${p}) rotate(${drift(f, 4, 140)}deg)`, overflow: 'visible' }}>
      <path d={BLOB} fill={color} />
      <circle cx="78" cy="88" r="9" fill={BLACK} />
      <circle cx="126" cy="84" r="9" fill={BLACK} />
      <path d={`M68 128 Q 100 ${128 + smile * 34} 134 124`} stroke={BLACK} strokeWidth="9" fill="none" strokeLinecap="round" />
    </svg>
  );
};

// A cut-paper sun with rays that turn (a third loop, used in the designer's scene).
const Sun: React.FC<{ x: number; y: number; at: number; color?: string }> = ({ x, y, at, color = CORAL }) => {
  const f = useCurrentFrame();
  const p = pop(f, at, { damping: 10, stiffness: 180, mass: 0.6 });
  return (
    <svg viewBox="0 0 200 200" width={240} height={240} style={{ position: 'absolute', left: x, top: y, transform: `scale(${p}) rotate(${f * 0.4}deg)`, overflow: 'visible' }}>
      {Array.from({ length: 10 }, (_, i) => <path key={i} d="M100 100 L 90 10 Q 100 0 110 10 Z" fill={color} transform={`rotate(${i * 36} 100 100)`} />)}
      <circle cx="100" cy="100" r="46" fill={YELLOW} />
    </svg>
  );
};

// ---- 1. The designer's hand ----
const LeftHand: React.FC = () => {
  const f = useCurrentFrame();
  const run = 10 * BEAT; // the hand taps RUN
  const shiver = f > run + 6 && f < run + 24 ? Math.sin(f * 2.5) * 3 : 0;
  return (
    <Ground>
      <Leaves set={1} />
      <Strip text="the designer's hand" at={BEAT} x={120} y={90} color={CORAL} size={30} tilt={-2} />
      <div style={{ position: 'absolute', left: 120, top: 160, fontSize: 44, fontWeight: 800, opacity: glide(f, 2 * BEAT, 20) }}>Makes things beautiful.</div>
      {/* the sheet the hand works on */}
      <div style={{ position: 'absolute', left: 560, top: 230, width: 1100, height: 700, background: '#fff', clipPath: TEARS[0], transform: `translateY(${(1 - glide(f, 0, 24)) * 700}px) rotate(-1deg)` }} />
      <div style={{ position: 'absolute', left: 560, top: 230, width: 1100, height: 700, transform: `translateX(${shiver}px) rotate(-1deg)` }}>
        <svg viewBox="0 0 200 200" width={300} height={300} style={{ position: 'absolute', left: 80, top: 120, transform: `scale(${pop(f, 3 * BEAT)}) rotate(${(loop(f, 170) - 0.5) * 16}deg)` }}><path d={LEAF} fill={GREEN} /></svg>
        <Sun x={420} y={60} at={5 * BEAT} />
        <Face x={760} y={330} at={7 * BEAT} smile={0.2} />
        <Strip text="RUN ▶" at={9 * BEAT} x={80} y={560} color={BLACK} ink="#fff" size={28} tilt={-1} />
        <Strip text="…nothing moves." at={run + 14} x={300} y={566} color={GREY} ink={GREYINK} size={26} tilt={1} />
        <Strip text="?" at={run + 20} x={1000} y={240} color={YELLOW} ink={BLACK} size={40} tilt={12} />
      </div>
      <Hand path={[[0, 300, 1000], [2 * BEAT, 760, 700], [3 * BEAT, 760, 700], [4 * BEAT, 1040, 540], [5 * BEAT, 1040, 540], [6 * BEAT, 1400, 760], [7 * BEAT, 1400, 760], [8 * BEAT, 760, 900], [9 * BEAT, 740, 880], [run, 740, 870], [run + 20, 820, 900]]} taps={[3 * BEAT, 5 * BEAT, 7 * BEAT, run]} />
      <Beads x={120} y={1010} n={7} at={2 * BEAT} />
    </Ground>
  );
};

// ---- 2. The developer's hand ----
const CODE = ['let x = 0;', 'tick(() => x++);', 'box.style.left = x * 40;', 'render();'];
const RightHand: React.FC = () => {
  const f = useCurrentFrame();
  const running = f >= 8 * BEAT;
  const count = running ? Math.floor((f - 8 * BEAT) / BEAT) : 0;
  const slideX = running ? ((f - 8 * BEAT) % (2 * BEAT)) / (2 * BEAT) : 0;
  return (
    <Ground tint="#eeece6">
      <Leaves set={2} mono />
      <Strip text="the developer's hand" at={BEAT} x={1250} y={90} color={GREYINK} size={30} tilt={2} />
      <div style={{ position: 'absolute', left: 1250, top: 160, fontSize: 44, fontWeight: 800, opacity: glide(f, 2 * BEAT, 20) }}>Makes things move.</div>
      <div style={{ position: 'absolute', left: 120, top: 230, width: 1000, height: 700, background: GREY, clipPath: TEARS[1], transform: `translateY(${(1 - glide(f, 0, 24)) * 700}px) rotate(1deg)` }}>
        <div style={{ position: 'absolute', left: 90, top: 70 }}>
          {CODE.map((line, i) => (
            <Strip key={i} text={line} at={3 * BEAT + i * BEAT} x={0} y={i * 58} color="#fff" ink={GREYINK} size={24} tilt={i % 2 ? 0.6 : -0.6} />
          ))}
        </div>
        {/* it runs: a counter ticks and a grey square slides, on the beat */}
        <Strip text={`x = ${count}`} at={8 * BEAT} x={90} y={360} color={GREYINK} ink="#fff" size={26} tilt={0} />
        <div style={{ position: 'absolute', left: 90 + slideX * 560, top: 460, width: 110, height: 110, background: GREYINK, opacity: pop(f, 8 * BEAT) }} />
        <div style={{ position: 'absolute', left: 90, top: 585, width: 700, height: 6, background: GREYINK, opacity: pop(f, 8 * BEAT) }} />
        <Strip text="Works. Looks like a tax form." at={12 * BEAT} x={420} y={340} color={YELLOW} ink={BLACK} size={26} tilt={-1} />
      </div>
      <Hand path={[[0, 1600, 1000], [2 * BEAT, 500, 720], [3 * BEAT, 480, 700], [7 * BEAT, 520, 760], [8 * BEAT, 900, 880], [12 * BEAT, 900, 880], [13 * BEAT, 1100, 940]]} taps={[3 * BEAT, 4 * BEAT, 5 * BEAT, 6 * BEAT, 8 * BEAT]} flip color="#d8a98a" />
      <Beads x={1250} y={1010} n={7} at={2 * BEAT} colors={[GREYINK, GREY, '#b9b5ad']} />
    </Ground>
  );
};

// ---- 3. Together ----
const Together: React.FC = () => {
  const f = useCurrentFrame();
  const meet = 2 * BEAT; // the two sheets overlap here
  const met = f >= meet;
  const l = glide(f, 0, 30);
  const r = glide(f, 0, 30);
  const beatT = ((f - meet) % (2 * BEAT)) / (2 * BEAT);
  const burst = pop(f, meet, { damping: 9, stiffness: 180, mass: 0.6 });
  return (
    <Ground>
      <Leaves set={3} />
      {/* the white and grey sheets slide in and overlap */}
      <div style={{ position: 'absolute', left: 120 + (1 - l) * -1200, top: 200, width: 900, height: 620, background: '#fff', clipPath: TEARS[0], transform: 'rotate(-2deg)' }} />
      <div style={{ position: 'absolute', left: 900 + (1 - r) * 1200, top: 260, width: 900, height: 620, background: GREY, clipPath: TEARS[1], transform: 'rotate(2deg)', opacity: 0.9 }} />
      {/* on the overlap: the square becomes a coral leaf that moves on the beat, the face smiles */}
      {met && (
        <>
          <svg viewBox="0 0 200 200" width={200} height={200} style={{ position: 'absolute', left: 820 + beatT * 320, top: 560 - Math.sin(beatT * Math.PI) * 80, transform: `rotate(${beatT * 360}deg)` }}><path d={LEAF} fill={CORAL} /></svg>
          <Face x={1000} y={300} at={meet} smile={Math.min(1, (f - meet) / 20)} />
          {[CORAL, YELLOW, GREEN, BLUE, CORAL, YELLOW, GREEN, BLUE].map((c, i) => {
            const a = (i / 8) * Math.PI * 2;
            return <svg key={i} viewBox="0 0 200 200" width={80} height={80} style={{ position: 'absolute', left: 1080 + Math.cos(a) * 360 * burst, top: 400 + Math.sin(a) * 260 * burst, transform: `rotate(${a * 57 + burst * 120}deg) scale(${burst})`, opacity: 1 - Math.max(0, (f - meet - 30) / 30) }}><path d={LEAF} fill={c} /></svg>;
          })}
        </>
      )}
      <Strip text="…together." at={meet + 4} x={880} y={120} color={BLACK} ink="#fff" size={34} tilt={-2} />
      <CutWord text="FRAN" at={meet + BEAT} size={170} color={BLACK} x={140} y={300} />
      <CutWord text="SUAN" at={meet + 2 * BEAT} size={170} color={CORAL} x={300} y={470} />
      <Strip text="designer / developer" at={meet + 3 * BEAT} x={150} y={680} color={BLUE} size={30} tilt={-1.5} />
      <Strip text="BS Computer Science · UP Visayas '25" at={meet + 4 * BEAT} x={150} y={750} color={GREEN} size={26} tilt={1} />
      <Torn src={asset('grad-poster.jpg')} at={meet + BEAT} x={1380} y={520} w={380} h={460} tilt={5} tear={2} from="right" pos="center 12%" phase={30} />
      <Beads x={140} y={1010} n={9} at={meet} />
    </Ground>
  );
};

// ---- 4. Proof ----
const PROOF = [
  ['awfm-org.jpg', 'A Whole Family Matter · plan end-of-life care together', 120, 300, 560, 320, -2, 0, 'left', CORAL, 'top'],
  ['iskalusugan.jpg', 'isKalusugan · UPV health services', 720, 290, 520, 300, 2, 1, 'top', BLUE, 'center'],
  ['dswtree.jpg', 'DSWTree · plant trees, earn rewards', 1280, 300, 520, 300, -2, 2, 'right', GREEN, 'center'],
  ['tudlo.jpg', 'Tudlo · find a tutor', 420, 680, 500, 280, 2, 1, 'bottom', YELLOW, 'center'],
  ['dashboard.jpg', 'dashboards for busy people', 1000, 690, 500, 280, -2, 0, 'bottom', BLUE, 'center'],
] as const;
const Proof: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <Ground>
      <Leaves set={4} />
      <CutWord text="THINGS THAT DO BOTH" at={0} size={104} color={BLACK} x={120} y={100} />
      <div style={{ position: 'absolute', left: 124, top: 222, fontSize: 26, fontWeight: 600, color: GREYINK, opacity: glide(f, 2 * BEAT, 20) }}>They look good. They work. Research, design and code, all by me.</div>
      {PROOF.map(([src, label, x, y, w, h, tilt, tear, from, color, pos], i) => (
        <Torn key={src} src={asset(src)} at={2 * BEAT + i * BEAT} x={x} y={y} w={w} h={h} tilt={tilt} tear={tear} from={from} label={label} labelColor={color} pos={pos} phase={i * 40} />
      ))}
      <Strip text="Platform Innovation Lead at A Whole Family Matter" at={9 * BEAT} x={120} y={1000} color={CORAL} size={24} tilt={-1} />
      <Beads x={1230} y={1010} n={11} at={2 * BEAT} />
    </Ground>
  );
};

// ---- 5. For fun ----
const Fun: React.FC = () => {
  const f = useCurrentFrame();
  const spinAt = 6 * BEAT;
  const spinT = f - spinAt;
  const spinning = spinT >= 0 && spinT < 4 * BEAT;
  const spinX = spinning ? Math.cos((spinT / (2 * BEAT)) * Math.PI * 2) : 1;
  const spinY = spinning ? -Math.abs(Math.sin((spinT / (2 * BEAT)) * Math.PI)) * 36 : 0;
  const burst = pop(f, spinAt + 2, { damping: 9, stiffness: 180, mass: 0.6 });
  return (
    <Ground>
      <Leaves set={5} />
      <CutWord text="FOR FUN:" at={0} size={104} color={BLACK} x={120} y={100} />
      <CutWord text="SINEHAN" at={BEAT} size={104} color={BLUE} x={680} y={100} />
      <div style={{ position: 'absolute', left: 124, top: 250, width: 560, fontSize: 30, lineHeight: 1.4, fontWeight: 500, opacity: glide(f, 2 * BEAT, 20) }}>
        A movie theater for two. Same episode, same second, from two cities. Chat, call, and a dog who does tricks.
      </div>
      <Torn src={asset('sinehan-store.png')} at={2 * BEAT} x={760} y={290} w={700} h={438} tilt={-2} tear={0} from="right" phase={20} />
      {[CORAL, YELLOW, GREEN, BLUE, CORAL, YELLOW].map((c, i) => {
        const a = (i / 6) * Math.PI * 2;
        return <svg key={i} viewBox="0 0 200 200" width={90} height={90} style={{ position: 'absolute', left: 1300 + Math.cos(a) * 200 * burst, top: 860 + Math.sin(a) * 150 * burst, transform: `rotate(${a * 57 + burst * 90}deg) scale(${burst})`, opacity: burst }}><path d={LEAF} fill={c} /></svg>;
      })}
      <div style={{ position: 'absolute', left: 1180, top: 770, transform: `translateY(${spinY}px) scaleX(${spinX})`, transformOrigin: '50% 100%' }}>
        <Bantay pose={spinning ? 'happy' : f > spinAt + 4 * BEAT ? 'party' : 'sit'} size={270} />
      </div>
      <Strip text="/spin" at={5 * BEAT} x={1010} y={830} color={BLACK} ink="#fff" size={26} tilt={-4} />
      <Strip text="Wheee!" at={spinAt + 4} x={1460} y={760} color={YELLOW} ink={BLACK} size={30} tilt={6} />
      <Strip text="Chrome extension · WebRTC · Bantay the dog" at={9 * BEAT} x={124} y={520} color={GREEN} size={22} tilt={-1} />
      <Beads x={120} y={1010} n={9} at={BEAT} />
    </Ground>
  );
};

// ---- 6. The punchline ----
const Punchline: React.FC = () => (
  <Ground>
    <Leaves set={0} />
    <CutWord text="I MAKE THINGS WORK." at={0} size={118} color={BLACK} x={120} y={220} />
    <CutWord text="I LIKE THEM TO" at={2 * BEAT} size={92} color={CORAL} x={120} y={420} />
    <CutWord text="LOOK GOOD" at={3 * BEAT} size={92} color={BLUE} x={120} y={540} />
    <CutWord text="WHILE DOING IT." at={4 * BEAT} size={92} color={GREEN} x={120} y={660} />
    <Face x={1420} y={300} at={5 * BEAT} smile={1} />
    <Sun x={1500} y={620} at={6 * BEAT} />
    <Beads x={120} y={1010} n={11} at={BEAT} />
  </Ground>
);

// ---- 7. End ----
const LINKS = [['website', 'prandesal.framer.website', BLUE], ['github', 'github.com/kpsuan', CORAL], ['linkedin', 'linkedin.com/in/kpsuan', GREEN]] as const;
const End: React.FC = () => {
  const f = useCurrentFrame();
  const wave = f > 3 * BEAT ? Math.sin(((f - 3 * BEAT) / BEAT) * Math.PI) * 6 : 0;
  return (
    <Ground>
      <Leaves set={1} />
      <CutWord text="LET'S BUILD" at={0} size={130} color={BLACK} x={150} y={240} />
      <CutWord text="SOMETHING." at={BEAT} size={130} color={BLUE} x={360} y={420} />
      <div style={{ position: 'absolute', left: 160, top: 640, display: 'flex', gap: 10 }}>
        {LINKS.map(([k, v, c], i) => (
          <div key={k} style={{ position: 'relative', width: 530, height: 70 }}>
            <Strip text={`${k} · ${v}`} at={3 * BEAT + i * 5} x={0} y={0} color={c} ink="#fff" size={22} tilt={i % 2 ? 1.5 : -1.5} />
          </div>
        ))}
      </div>
      <div style={{ position: 'absolute', left: 160, top: 760, fontSize: 30, fontWeight: 600, color: BLACK, opacity: glide(f, 4 * BEAT, 20) }}>Fran Suan · designer / developer</div>
      <div style={{ position: 'absolute', right: 160, bottom: 50, transform: `rotate(${wave}deg)`, transformOrigin: '50% 100%' }}>
        <Bantay pose={f > 3 * BEAT ? 'paw' : 'sit'} size={250} />
      </div>
      <Beads x={160} y={1010} n={11} at={2 * BEAT} />
    </Ground>
  );
};

// ---- The film ----
const T = BEAT; // a one-beat paper slide between scenes
const SCENES: [string, React.FC, number][] = [
  ['left', LeftHand, 4 * BAR],
  ['right', RightHand, 4 * BAR],
  ['together', Together, 3 * BAR],
  ['proof', Proof, 4 * BAR],
  ['fun', Fun, 3 * BAR],
  ['punch', Punchline, 3 * BAR],
  ['end', End, 3 * BAR],
];
const STARTS = SCENES.reduce<number[]>((acc, s, i) => [...acc, i === 0 ? 0 : acc[i - 1] + SCENES[i - 1][2] - T], []);
export const MATISSE_DURATION = STARTS[STARTS.length - 1] + SCENES[SCENES.length - 1][2];

// Sound effects on the grid: [scene, name, scene-local frame, volume]
const CUES: [string, string, number, number][] = [
  ['left', 'swipe', 0, 0.3], ['left', 'pop', 3 * BEAT, 0.35], ['left', 'pop', 5 * BEAT, 0.35], ['left', 'pop', 7 * BEAT, 0.35], ['left', 'click', 10 * BEAT, 0.5], ['left', 'pop', 10 * BEAT + 20, 0.3],
  ['right', 'swipe', 0, 0.3], ...CODE.map((_, i) => ['right', 'typing', 3 * BEAT + i * BEAT, 0.3] as [string, string, number, number]), ['right', 'click', 8 * BEAT, 0.5], ['right', 'tick', 9 * BEAT, 0.25], ['right', 'tick', 10 * BEAT, 0.25], ['right', 'tick', 11 * BEAT, 0.25], ['right', 'pop', 12 * BEAT, 0.3],
  ['together', 'swipe', 0, 0.35], ['together', 'confetti', 2 * BEAT, 0.5], ['together', 'sparkle', 2 * BEAT + 4, 0.35], ['together', 'pop', 3 * BEAT, 0.35], ['together', 'pop', 4 * BEAT, 0.35], ['together', 'pop', 5 * BEAT, 0.3],
  ...PROOF.map((_, i) => ['proof', 'swipe', 2 * BEAT + i * BEAT, 0.3] as [string, string, number, number]), ['proof', 'pop', 9 * BEAT, 0.3],
  ['fun', 'swipe', 2 * BEAT, 0.3], ['fun', 'pop', 5 * BEAT, 0.3], ['fun', 'bark', 6 * BEAT, 0.5], ['fun', 'sparkle', 6 * BEAT + 2, 0.3],
  ['punch', 'pop', 0, 0.35], ['punch', 'pop', 2 * BEAT, 0.3], ['punch', 'pop', 3 * BEAT, 0.3], ['punch', 'pop', 4 * BEAT, 0.3], ['punch', 'pop', 5 * BEAT, 0.3],
  ['end', 'pop', 0, 0.35], ['end', 'pop', BEAT, 0.35], ['end', 'bark', 3 * BEAT, 0.4], ['end', 'pop', 3 * BEAT, 0.25], ['end', 'pop', 3 * BEAT + 5, 0.25], ['end', 'pop', 3 * BEAT + 10, 0.25],
];
const musicVolume = (f: number) => interpolate(f, [0, 8, MATISSE_DURATION - 20, MATISSE_DURATION], [0, 0.55, 0.55, 0.45], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

export const MatisseReel: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: INTER }}>
    <TransitionSeries>
      {SCENES.flatMap(([id, Scene, duration], i) => {
        const items = [
          <TransitionSeries.Sequence key={id} durationInFrames={duration}>
            <Scene />
          </TransitionSeries.Sequence>,
        ];
        if (i < SCENES.length - 1)
          items.push(<TransitionSeries.Transition key={`t${id}`} presentation={slide({ direction: i % 2 ? 'from-left' : 'from-right' })} timing={springTiming({ config: { damping: 200 }, durationInFrames: T })} />);
        return items;
      })}
    </TransitionSeries>
    <Html5Audio src={staticFile('audio/matisse.wav')} volume={musicVolume} />
    {CUES.map(([scene, name, at, volume], j) => (
      <Sequence key={j} from={STARTS[SCENES.findIndex((s) => s[0] === scene)] + at} layout="none">
        <Html5Audio src={staticFile(`audio/sfx/${name}.mp3`)} volume={volume} />
      </Sequence>
    ))}
  </AbsoluteFill>
);
