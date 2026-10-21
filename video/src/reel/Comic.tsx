// Fran's intro reel, comic-book edition: ink borders, halftone dots, speech bubbles, bursts, speed lines,
// hard cuts, and a faster beat. Same story as Reel.tsx. ~42 seconds, 1920×1080, no voiceover.
import React, { useState } from 'react';
import { AbsoluteFill, Html5Audio, Img, Sequence, cancelRender, continueRender, delayRender, interpolate, random, staticFile, useCurrentFrame } from 'remotion';
import { TransitionSeries, springTiming, type TransitionPresentation } from '@remotion/transitions';
import { slide } from '@remotion/transitions/slide';
import { wipe } from '@remotion/transitions/wipe';
import { FPS, drift, ease, fadeIn, glide, pop, sec } from '../anim';
import { Bantay } from '../components/Bantay';
import { Sidebar, type Line } from '../components/Sidebar';

const asset = (name: string) => staticFile(`reel/${name}`);
const INK = '#141414';
const PAPER = '#fff3d6';
const YELLOW = '#ffd93d';
const RED = '#ff4d4d';
const BLUE = '#2f7cff';
const MINT = '#5fd3a6';
const PINK = '#ff7ab8';
const COMIC = "'Bangers', 'Impact', sans-serif";
const BODY = "'Inter', system-ui, sans-serif";

// Bangers (OFL), loaded before the first frame.
const useBangers = () => {
  const [handle] = useState(() => delayRender('Loading Bangers'));
  useState(() => {
    new FontFace('Bangers', `url(${asset('Bangers.ttf')}) format('truetype')`)
      .load()
      .then((face) => {
        document.fonts.add(face);
        continueRender(handle);
      })
      .catch((err) => cancelRender(err));
    return null;
  });
};

// ---- Comic pieces ----

// Paper with halftone dots and a coloured tint.
const Paper: React.FC<{ tint?: string; children?: React.ReactNode }> = ({ tint = PAPER, children }) => (
  <AbsoluteFill style={{ background: tint, fontFamily: BODY, color: INK, overflow: 'hidden' }}>
    <AbsoluteFill style={{ backgroundImage: `radial-gradient(${INK} 1.4px, transparent 1.6px)`, backgroundSize: '11px 11px', opacity: 0.1 }} />
    {children}
  </AbsoluteFill>
);

// Big comic lettering: Bangers, ink outline, hard offset shadow. Words slam in one by one.
const Shout: React.FC<{ text: string; delay?: number; size?: number; color?: string; step?: number; tilt?: number; style?: React.CSSProperties }> = ({
  text, delay = 0, size = 120, color = '#fff', step = 4, tilt = -2, style,
}) => {
  const f = useCurrentFrame();
  return (
    <div style={{ fontFamily: COMIC, fontSize: size, lineHeight: 1, letterSpacing: '0.02em', transform: `rotate(${tilt}deg)`, ...style }}>
      {text.split(' ').map((w, i) => {
        const p = pop(f, delay + i * step, { damping: 10, stiffness: 220, mass: 0.6 });
        return (
          <span
            key={i}
            style={{
              display: 'inline-block', marginRight: '0.22em', color, WebkitTextStroke: `${Math.max(2, size * 0.03)}px ${INK}`,
              textShadow: `${size * 0.06}px ${size * 0.06}px 0 ${INK}`, transform: `scale(${p}) rotate(${(1 - p) * 20}deg)`, opacity: Math.min(1, p * 3),
            }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
};

// A yellow caption box, the narrator's voice in comics ("Meanwhile…").
const CaptionBox: React.FC<{ text: string; at: number; x: number; y: number; bg?: string; size?: number; tilt?: number; width?: number }> = ({
  text, at, x, y, bg = YELLOW, size = 30, tilt = -1.5, width,
}) => {
  const f = useCurrentFrame();
  const p = glide(f, at, 14);
  return (
    <div
      style={{
        position: 'absolute', left: x, top: y, width, padding: '12px 20px', background: bg, border: `4px solid ${INK}`, boxShadow: `7px 7px 0 ${INK}`,
        fontFamily: BODY, fontWeight: 800, fontSize: size, lineHeight: 1.25, textTransform: 'uppercase', letterSpacing: '0.01em',
        transform: `rotate(${tilt}deg) translateY(${(1 - p) * -30}px)`, opacity: p,
      }}
    >
      {text}
    </div>
  );
};

// A framed panel with ink border and a hard shadow; punches in from slightly big.
const Panel: React.FC<{ at: number; x: number; y: number; w: number; h: number; tilt?: number; children: React.ReactNode; bg?: string; phase?: number }> = ({
  at, x, y, w, h, tilt = 0, children, bg = '#fff', phase = 0,
}) => {
  const f = useCurrentFrame();
  const p = pop(f, at, { damping: 11, stiffness: 200, mass: 0.6 });
  return (
    <div
      style={{
        position: 'absolute', left: x, top: y, width: w, height: h, background: bg, border: `5px solid ${INK}`, boxShadow: `10px 10px 0 ${INK}`,
        overflow: 'hidden', transform: `rotate(${tilt}deg) scale(${0.6 + p * 0.4}) translateY(${drift(f, 3, 160, phase)}px)`, opacity: Math.min(1, p * 2),
      }}
    >
      {children}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(${INK} 1px, transparent 1.2px)`, backgroundSize: '7px 7px', opacity: 0.08, mixBlendMode: 'multiply' }} />
    </div>
  );
};

// A speech bubble with a tail. Tail points down-left by default.
const Bubble: React.FC<{ text: string; at: number; x: number; y: number; w?: number; size?: number; tail?: 'bl' | 'br' | 'tl'; thought?: boolean }> = ({
  text, at, x, y, w = 360, size = 30, tail = 'bl', thought = false,
}) => {
  const f = useCurrentFrame();
  const p = pop(f, at, { damping: 9, stiffness: 200, mass: 0.6 });
  const tailStyle: React.CSSProperties =
    tail === 'br' ? { right: 40, bottom: -22, transform: 'skewX(30deg)' } : tail === 'tl' ? { left: 40, top: -22, transform: 'skewX(-30deg) rotate(180deg)' } : { left: 40, bottom: -22, transform: 'skewX(-30deg)' };
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: w, transform: `scale(${p})`, transformOrigin: tail === 'tl' ? '20% 0%' : tail === 'br' ? '80% 100%' : '20% 100%', opacity: Math.min(1, p * 3) }}>
      <div style={{ position: 'relative', padding: '18px 26px', background: '#fff', border: `4px solid ${INK}`, borderRadius: thought ? 60 : 28, fontFamily: BODY, fontWeight: 700, fontSize: size, lineHeight: 1.25, textAlign: 'center' }}>
        {text}
        {!thought && <div style={{ position: 'absolute', width: 26, height: 26, background: '#fff', borderLeft: `4px solid ${INK}`, borderBottom: `4px solid ${INK}`, ...tailStyle }} />}
      </div>
      {thought && [0, 1].map((i) => <div key={i} style={{ position: 'absolute', left: 30 - i * 22, bottom: -18 - i * 24, width: 22 - i * 8, height: 22 - i * 8, borderRadius: '50%', background: '#fff', border: `4px solid ${INK}` }} />)}
    </div>
  );
};

// A starburst sticker with a word in it ("POW!").
const Burst: React.FC<{ text: string; at: number; x: number; y: number; r?: number; fill?: string; color?: string; tilt?: number; points?: number; seed?: string }> = ({
  text, at, x, y, r = 120, fill = YELLOW, color = INK, tilt = -8, points = 14, seed = 'b',
}) => {
  const f = useCurrentFrame();
  const p = pop(f, at, { damping: 8, stiffness: 240, mass: 0.5 });
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2;
    const rad = i % 2 ? r * (0.68 + random(seed + i) * 0.08) : r;
    pts.push(`${r + Math.cos(a) * rad},${r + Math.sin(a) * rad}`);
  }
  return (
    <div style={{ position: 'absolute', left: x - r, top: y - r, width: r * 2, height: r * 2, transform: `rotate(${tilt + (1 - p) * 40}deg) scale(${p})`, opacity: Math.min(1, p * 3) }}>
      <svg width={r * 2} height={r * 2} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <polygon points={pts.join(' ')} fill={INK} transform="translate(8 8)" />
        <polygon points={pts.join(' ')} fill={fill} stroke={INK} strokeWidth={5} strokeLinejoin="round" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontFamily: COMIC, fontSize: r * 0.5, color, letterSpacing: '0.02em', textAlign: 'center', lineHeight: 0.95 }}>
        {text}
      </div>
    </div>
  );
};

// Radial speed lines behind an action beat.
const SpeedLines: React.FC<{ x: number; y: number; from: number; to: number; r?: number; color?: string }> = ({ x, y, from, to, r = 700, color = INK }) => {
  const f = useCurrentFrame();
  if (f < from || f > to) return null;
  const o = Math.min(1, (f - from) / 4, (to - f) / 6);
  return (
    <svg style={{ position: 'absolute', left: x - r, top: y - r, opacity: o * 0.8 }} width={r * 2} height={r * 2}>
      {Array.from({ length: 36 }, (_, i) => {
        const a = (i / 36) * Math.PI * 2 + (f % 2) * 0.04;
        const inner = r * (0.35 + random(`s${i}`) * 0.2);
        return <line key={i} x1={r + Math.cos(a) * inner} y1={r + Math.sin(a) * inner} x2={r + Math.cos(a) * r} y2={r + Math.sin(a) * r} stroke={color} strokeWidth={2 + random(`w${i}`) * 5} strokeLinecap="round" />;
      })}
    </svg>
  );
};

// A photo inside a panel, slightly boosted so it reads like a printed comic.
const Photo: React.FC<{ src: string; pos?: string }> = ({ src, pos = 'center' }) => (
  <Img src={src} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: pos, display: 'block', filter: 'contrast(1.15) saturate(1.25)' }} />
);

// Small page number / issue tag.
const PageTag: React.FC<{ text: string }> = ({ text }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ position: 'absolute', right: 60, top: 50, padding: '6px 14px', background: INK, color: '#fff', fontFamily: COMIC, fontSize: 28, letterSpacing: '0.06em', opacity: fadeIn(f, 2, 8) }}>
      {text}
    </div>
  );
};

// Text typed out, for the code panel.
const Typed: React.FC<{ text: string; from: number; cps?: number; size?: number; color?: string }> = ({ text, from, cps = 34, size = 24, color = INK }) => {
  const f = useCurrentFrame();
  const n = Math.max(0, Math.min(text.length, Math.floor(((f - from) / FPS) * cps)));
  if (f < from) return null;
  return <div style={{ fontFamily: "'Cascadia Code', Consolas, monospace", fontSize: size, color, minHeight: size * 1.6 }}>{text.slice(0, n)}</div>;
};

// ---- Scene 1: cover ----
export const Cover: React.FC = () => {
  const f = useCurrentFrame();
  const k = pop(f, 10, { damping: 9, stiffness: 160, mass: 0.7 });
  return (
    <Paper tint={YELLOW}>
      <SpeedLines x={1380} y={520} from={28} to={70} r={900} />
      <PageTag text="ISSUE #1" />
      <Img src={asset('k.png')} style={{ position: 'absolute', left: 70, top: 46, width: 60, transform: `scale(${k}) rotate(${(1 - k) * -180}deg)`, filter: 'drop-shadow(3px 3px 0 #141414)' }} />
      <div style={{ position: 'absolute', left: 80, top: 230 }}>
        <Shout text="FRAN" delay={20} size={300} color="#fff" tilt={-3} />
        <Shout text="SUAN" delay={30} size={300} color={RED} tilt={-3} style={{ marginTop: -30, marginLeft: 60 }} />
      </div>
      <CaptionBox text="Designer / Developer" at={48} x={120} y={830} bg="#fff" size={34} tilt={-2} />
      <CaptionBox text="BS Computer Science · UP Visayas" at={58} x={560} y={850} bg={MINT} size={28} tilt={1.5} />
      <Panel at={28} x={1180} y={150} w={560} h={690} tilt={4} phase={20}>
        <Photo src={asset('grad.jpg')} pos="center 15%" />
      </Panel>
      <Bubble text="Hi, it's me :)" at={46} x={930} y={110} w={300} size={34} tail="br" />
      <Burst text="CLASS OF '25!" at={64} x={1700} y={820} r={135} fill={RED} color="#fff" tilt={10} seed="c" />
    </Paper>
  );
};

// ---- Scene 2: make it look good ----
const LOOKS: { src: string; label: string; x: number; y: number; w: number; h: number; tilt: number }[] = [
  { src: 'landing-pages.jpg', label: 'landing pages', x: 110, y: 330, w: 540, h: 300, tilt: -2 },
  { src: 'maps.jpg', label: 'map legends', x: 690, y: 320, w: 540, h: 300, tilt: 1.5 },
  { src: 'listing.jpg', label: 'Amazon images', x: 1270, y: 330, w: 540, h: 300, tilt: -1.5 },
  { src: 'fling.jpg', label: 'brands', x: 200, y: 700, w: 500, h: 280, tilt: 2 },
  { src: 'class-wall.jpg', label: 'a class, on a wall', x: 760, y: 710, w: 500, h: 280, tilt: -2 },
  { src: 'vid-egypt.jpg', label: 'video, too', x: 1320, y: 700, w: 500, h: 280, tilt: 1.5 },
];
export const Looks: React.FC = () => (
  <Paper tint={PAPER}>
    <PageTag text="PAGE 2" />
    <div style={{ position: 'absolute', left: 90, top: 70 }}>
      <Shout text="FIRST, I MAKE THINGS LOOK GOOD!" delay={4} size={118} color={YELLOW} tilt={-1.5} style={{ width: 1500 }} />
    </div>
    {LOOKS.map((c, i) => (
      <React.Fragment key={c.src}>
        <Panel at={30 + i * 10} x={c.x} y={c.y} w={c.w} h={c.h} tilt={c.tilt} phase={i * 40}>
          <Photo src={asset(c.src)} />
        </Panel>
        <CaptionBox text={c.label} at={40 + i * 10} x={c.x + 20} y={c.y + c.h - 30} bg="#fff" size={22} tilt={c.tilt} />
      </React.Fragment>
    ))}
    <Burst text="WOW!" at={100} x={1760} y={560} r={95} fill={PINK} tilt={12} seed="w" />
  </Paper>
);

// ---- Scene 3: make it work ----
const CODE = ['const party = await join(room);', 'video.addEventListener("pause", () =>', '  party.send({ type: "pause", time: video.currentTime })', ');', '// …and the other side follows.'];
const WORKS: { src: string; label: string; x: number; y: number; w: number; h: number; tilt: number }[] = [
  { src: 'iskalusugan.jpg', label: 'isKalusugan · UPV health', x: 960, y: 300, w: 430, h: 242, tilt: -2 },
  { src: 'dashboard.jpg', label: 'dashboards', x: 1430, y: 280, w: 430, h: 242, tilt: 2 },
  { src: 'dswtree.jpg', label: 'DSWTree · plant trees', x: 970, y: 650, w: 430, h: 242, tilt: 1.5 },
  { src: 'tudlo.jpg', label: 'Tudlo · find a tutor', x: 1440, y: 630, w: 430, h: 242, tilt: -2 },
];
export const Works: React.FC = () => (
  <Paper tint="#dff1ff">
    <PageTag text="PAGE 3" />
    <div style={{ position: 'absolute', left: 90, top: 70 }}>
      <Shout text="THEN I MAKE THEM WORK!" delay={4} size={118} color={BLUE} tilt={-1.5} style={{ width: 1500 }} />
    </div>
    <Panel at={26} x={90} y={330} w={800} h={330} tilt={-1} bg="#fff">
      <div style={{ padding: '22px 28px' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>{[RED, YELLOW, MINT].map((c) => <div key={c} style={{ width: 16, height: 16, borderRadius: '50%', background: c, border: `3px solid ${INK}` }} />)}</div>
        {CODE.map((line, i) => <Typed key={i} text={line} from={40 + i * 18} color={line.startsWith('//') ? '#777' : INK} />)}
      </div>
    </Panel>
    {WORKS.map((c, i) => (
      <React.Fragment key={c.src}>
        <Panel at={60 + i * 12} x={c.x} y={c.y} w={c.w} h={c.h} tilt={c.tilt} phase={i * 50}>
          <Photo src={asset(c.src)} />
        </Panel>
        <CaptionBox text={c.label} at={70 + i * 12} x={c.x + 16} y={c.y + c.h - 28} bg="#fff" size={21} tilt={c.tilt} />
      </React.Fragment>
    ))}
    {['React', 'TypeScript', 'Django REST', 'Postgres', 'Svelte'].map((t, i) => (
      <CaptionBox key={t} text={t} at={140 + i * 6} x={110 + i * 165} y={760 + (i % 2) * 40} bg={i % 2 ? MINT : YELLOW} size={22} tilt={i % 2 ? 2 : -2} />
    ))}
    <Burst text="CLICK!" at={44} x={830} y={300} r={80} fill={YELLOW} tilt={10} seed="k" points={12} />
  </Paper>
);

// ---- Scene 4: meanwhile ----
export const Meanwhile: React.FC = () => {
  const f = useCurrentFrame();
  const swap = ease(f, [130, 148], [0, 1]);
  return (
    <Paper tint="#f3e3ff">
      <PageTag text="PAGE 4" />
      <CaptionBox text="Meanwhile, at A Whole Family Matter…" at={4} x={90} y={70} bg={YELLOW} size={34} tilt={-1.5} />
      <div style={{ position: 'absolute', left: 90, top: 200 }}>
        <Shout text="PLATFORM INNOVATION LEAD" delay={14} size={96} color="#d26ad6" tilt={-1.5} style={{ width: 760 }} />
      </div>
      <Bubble text="Research, design and code. All me. An app so families can plan end-of-life care together, not one person with a stack of paper forms." at={56} x={90} y={520} w={720} size={27} tail="br" />
      {['research', 'design', 'code', 'GDPR from day one'].map((t, i) => (
        <CaptionBox key={t} text={t} at={100 + i * 7} x={110 + i * 190} y={880} bg={i === 3 ? PINK : '#fff'} size={22} tilt={i % 2 ? 1.5 : -1.5} />
      ))}
      <Panel at={24} x={940} y={180} w={900} h={700} tilt={1.5} phase={30}>
        <Img src={asset('awfm-org.jpg')} style={{ position: 'absolute', inset: 0, width: '100%', objectFit: 'cover', objectPosition: 'top', opacity: 1 - swap }} />
        <Img src={asset('awfm-app.jpg')} style={{ position: 'absolute', inset: 0, width: '100%', objectFit: 'cover', objectPosition: 'top', opacity: swap }} />
      </Panel>
      <Burst text="TA-DA!" at={132} x={900} y={230} r={90} fill={YELLOW} tilt={-10} seed="t" />
    </Paper>
  );
};

// ---- Scene 5: for fun ----
const CHAT: Line[] = [
  { kind: 'msg', who: 'them', text: 'wait is he gonna', time: '9:41', at: 36 },
  { kind: 'emoji', who: 'you', text: '😭', time: '9:41', at: 54 },
  { kind: 'msg', who: 'you', text: '/spin', time: '9:42', at: 104 },
  { kind: 'sys', text: 'Kismet asked Bantay to spin', at: 112 },
];
export const Fun: React.FC = () => {
  const f = useCurrentFrame();
  const spinT = f - 116;
  const spinning = spinT >= 0 && spinT < 56;
  const spinX = spinning ? Math.cos((spinT / 28) * Math.PI * 2) : 1;
  const spinY = spinning ? -Math.abs(Math.sin((spinT / 28) * Math.PI)) * 34 : 0;
  return (
    <Paper tint="#e9e4ff">
      <PageTag text="PAGE 5" />
      <SpeedLines x={1290} y={870} from={116} to={176} r={520} />
      <div style={{ position: 'absolute', left: 90, top: 70 }}>
        <Shout text="FOR FUN, I BUILT" delay={4} size={96} color="#fff" tilt={-1.5} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 6 }}>
          <Img src={asset('sinehan-icon.png')} style={{ width: 90, transform: `scale(${pop(f, 24)})`, filter: 'drop-shadow(4px 4px 0 #141414)' }} />
          <Shout text="SINEHAN!" delay={22} size={150} color="#c9b6f2" tilt={-2} />
        </div>
      </div>
      <Bubble text="A movie theater for two. Same episode, same second, from two cities. With a chat, a call, and a dog who does tricks." at={48} x={90} y={420} w={620} size={26} tail="bl" />
      <Panel at={30} x={720} y={330} w={660} h={412} tilt={-1.5} phase={40}>
        <Photo src={asset('sinehan-store.png')} />
      </Panel>
      <div style={{ position: 'absolute', left: 1440, top: 120, border: `5px solid ${INK}`, boxShadow: `10px 10px 0 ${INK}`, borderRadius: 14, transform: `rotate(2deg) scale(${pop(f, 14, { damping: 11, stiffness: 200, mass: 0.6 })})` }}>
        <Sidebar lines={CHAT} chatHeight={300} />
      </div>
      <div style={{ position: 'absolute', left: 1150, top: 740, transform: `translateY(${spinY}px) scaleX(${spinX})`, transformOrigin: '50% 100%' }}>
        <Bantay pose={spinning ? 'happy' : f > 170 ? 'party' : 'sit'} size={280} />
      </div>
      <Burst text="WHEEE!" at={124} x={1480} y={760} r={100} fill={YELLOW} tilt={8} seed="e" />
      <CaptionBox text="Chrome extension · WebRTC · Bantay the dog" at={160} x={110} y={880} bg="#fff" size={22} tilt={-1} />
    </Paper>
  );
};

// ---- Scene 6: off the clock ----
export const Life: React.FC = () => (
  <Paper tint="#ffe3ec">
    <PageTag text="PAGE 6" />
    <div style={{ position: 'absolute', left: 90, top: 70 }}>
      <Shout text="OFF THE CLOCK…" delay={4} size={118} color={PINK} tilt={-1.5} />
    </div>
    <Panel at={24} x={110} y={330} w={520} h={400} tilt={-3} phase={0}>
      <Photo src={asset('dog.jpg')} pos="center 30%" />
    </Panel>
    <Bubble text="pets <3" at={40} x={470} y={250} w={200} size={30} tail="bl" />
    <Panel at={40} x={700} y={290} w={400} h={520} tilt={2} phase={60}>
      <Photo src={asset('sunset.jpg')} />
    </Panel>
    <CaptionBox text="sunsets" at={56} x={730} y={770} bg="#fff" size={24} tilt={2} />
    <Panel at={56} x={1170} y={350} w={560} h={315} tilt={-2} phase={120}>
      <Photo src={asset('vid-upv.jpg')} />
    </Panel>
    <CaptionBox text="videos for friends" at={72} x={1200} y={630} bg="#fff" size={24} tilt={-2} />
    <CaptionBox text="Iloilo, Philippines" at={84} x={1180} y={800} bg={YELLOW} size={26} tilt={-2} />
    <Burst text="ZZZ" at={30} x={1770} y={200} r={70} fill="#fff" tilt={10} seed="z" points={10} />
    <div style={{ position: 'absolute', left: 1540, top: 90, transform: 'scaleX(-1)' }}>
      <Bantay pose="lying" size={230} />
    </div>
  </Paper>
);

// ---- Scene 7: back cover ----
const LINKS = [['website', 'prandesal.framer.website'], ['github', 'github.com/kpsuan'], ['linkedin', 'linkedin.com/in/kpsuan']];
export const Back: React.FC = () => {
  const f = useCurrentFrame();
  const wave = f > 44 ? Math.sin(((f - 44) / 14) * Math.PI * 2) * 6 : 0;
  return (
    <Paper tint={YELLOW}>
      <SpeedLines x={960} y={420} from={10} to={60} r={1000} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', paddingBottom: 60 }}>
        <Shout text="LET'S BUILD SOMETHING!" delay={8} size={150} color="#fff" tilt={-2} style={{ textAlign: 'center', width: 1500 }} />
        <CaptionBox text="Fran Suan · designer / developer" at={36} x={700} y={560} bg="#fff" size={28} tilt={-1} />
        <div style={{ position: 'absolute', top: 680, display: 'flex', gap: 22 }}>
          {LINKS.map(([k, v], i) => {
            const s = pop(f, 50 + i * 8, { damping: 10, stiffness: 220, mass: 0.6 });
            return (
              <div key={k} style={{ padding: '14px 24px', background: INK, color: '#fff', border: `4px solid ${INK}`, boxShadow: `7px 7px 0 ${RED}`, display: 'flex', gap: 14, alignItems: 'baseline', transform: `scale(${s}) rotate(${i % 2 ? 1 : -1}deg)`, opacity: Math.min(1, s * 3) }}>
                <span style={{ fontFamily: COMIC, fontSize: 24, color: YELLOW, letterSpacing: '0.06em' }}>{k}</span>
                <span style={{ fontFamily: BODY, fontWeight: 600, fontSize: 26 }}>{v}</span>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
      <div style={{ position: 'absolute', right: 160, bottom: 50, transform: `rotate(${wave}deg)`, transformOrigin: '50% 100%' }}>
        <Bantay pose={f > 44 ? 'paw' : 'sit'} size={250} />
      </div>
      <Burst text="THE END?" at={70} x={230} y={840} r={120} fill={RED} color="#fff" tilt={-10} seed="end" />
    </Paper>
  );
};

// ---- The reel ----
const T = 8;
const SCENES: [string, React.FC, number][] = [
  ['cover', Cover, sec(5.5)],
  ['looks', Looks, sec(6)],
  ['works', Works, sec(7)],
  ['meanwhile', Meanwhile, sec(7)],
  ['fun', Fun, sec(8)],
  ['life', Life, sec(5)],
  ['back', Back, sec(5.5)],
];
const STARTS = SCENES.reduce<number[]>((acc, s, i) => [...acc, i === 0 ? 0 : acc[i - 1] + SCENES[i - 1][2] - T], []);
export const COMIC_DURATION = STARTS[STARTS.length - 1] + SCENES[SCENES.length - 1][2];

// Sound effects: [scene, name, scene-local frame, volume]. Comic ones (pow, boing, zip, ding, stamp) are
// generated by scripts/comic-audio.mjs; the rest come from the product video.
const CUES: [string, string, number, number][] = [
  ['cover', 'zip', 10, 0.4], ['cover', 'pow', 20, 0.55], ['cover', 'pow', 30, 0.55], ['cover', 'stamp', 48, 0.5], ['cover', 'stamp', 58, 0.45], ['cover', 'boing', 46, 0.45], ['cover', 'pow', 64, 0.5], ['cover', 'confetti', 66, 0.4],
  ['looks', 'pow', 4, 0.5], ...LOOKS.map((_, i) => ['looks', 'stamp', 30 + i * 10, 0.4] as [string, string, number, number]), ['looks', 'boing', 100, 0.5],
  ['works', 'pow', 4, 0.5], ['works', 'stamp', 26, 0.4], ['works', 'typing', 40, 0.3], ['works', 'click', 44, 0.5], ['works', 'typing', 76, 0.3], ...WORKS.map((_, i) => ['works', 'stamp', 60 + i * 12, 0.4] as [string, string, number, number]), ['works', 'ding', 140, 0.35],
  ['meanwhile', 'stamp', 4, 0.45], ['meanwhile', 'pow', 14, 0.5], ['meanwhile', 'stamp', 24, 0.4], ['meanwhile', 'boing', 56, 0.45], ['meanwhile', 'ding', 132, 0.4], ['meanwhile', 'click', 130, 0.4],
  ['fun', 'pow', 4, 0.5], ['fun', 'pow', 22, 0.55], ['fun', 'stamp', 14, 0.4], ['fun', 'boing', 48, 0.45], ['fun', 'typing', 96, 0.3], ['fun', 'zip', 116, 0.45], ['fun', 'bark', 124, 0.55], ['fun', 'sparkle', 170, 0.3],
  ['life', 'pow', 4, 0.5], ['life', 'stamp', 24, 0.4], ['life', 'boing', 40, 0.4], ['life', 'stamp', 56, 0.4], ['life', 'stamp', 84, 0.4],
  ['back', 'zip', 8, 0.4], ['back', 'pow', 8, 0.55], ['back', 'stamp', 50, 0.4], ['back', 'stamp', 58, 0.4], ['back', 'stamp', 66, 0.4], ['back', 'bark', 48, 0.45], ['back', 'pow', 70, 0.5],
];

const musicVolume = (f: number) => {
  const up = interpolate(f, [0, 10], [0, 1], { extrapolateRight: 'clamp' });
  const down = interpolate(f, [COMIC_DURATION - 40, COMIC_DURATION], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return 0.5 * up * down;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TRANSITIONS: TransitionPresentation<any>[] = [wipe({ direction: 'from-left' }), slide({ direction: 'from-bottom' }), wipe({ direction: 'from-top-left' }), slide({ direction: 'from-right' }), wipe({ direction: 'from-right' }), slide({ direction: 'from-top' })];

export const Comic: React.FC = () => {
  useBangers();
  return (
    <AbsoluteFill style={{ fontFamily: BODY }}>
      <TransitionSeries>
        {SCENES.flatMap(([id, Scene, duration], i) => {
          const items = [
            <TransitionSeries.Sequence key={id} durationInFrames={duration}>
              <Scene />
            </TransitionSeries.Sequence>,
          ];
          if (i < SCENES.length - 1)
            items.push(<TransitionSeries.Transition key={`t${id}`} presentation={TRANSITIONS[i % TRANSITIONS.length]} timing={springTiming({ config: { damping: 200 }, durationInFrames: T })} />);
          return items;
        })}
      </TransitionSeries>
      <Html5Audio src={staticFile('audio/music-upbeat.mp3')} volume={musicVolume} />
      {CUES.map(([scene, name, at, volume], j) => (
        <Sequence key={j} from={STARTS[SCENES.findIndex((s) => s[0] === scene)] + at} layout="none">
          <Html5Audio src={staticFile(`audio/sfx/${name}.mp3`)} volume={volume} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
