// Fran's intro reel: ~43 seconds dark, or one minute light, 1920×1080, no voiceover. Music, on-screen words and motion only.
// Scenes are in order below; each gets its own frame count starting at 0.
import React, { createContext, useContext } from 'react';
import { AbsoluteFill, Html5Audio, Img, Sequence, interpolate, random, staticFile, useCurrentFrame } from 'remotion';
import { TransitionSeries, springTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { C, DARK, FONT, LIGHT, type Palette } from '../theme';
import { FPS, drift, ease, fadeIn, fadeOut, glide, pop, press, sec } from '../anim';
import { Bantay } from '../components/Bantay';
import { Backdrop, BrowserWindow, Confetti } from '../components/ui';
import { Sidebar, type Line } from '../components/Sidebar';

const ORANGE = '#f08a3c';
const CREAM = '#f7f0e7';
const SUN = '#f2c94c';
const MINT = '#9fd6b0';
const asset = (name: string) => staticFile(`reel/${name}`);

// Two looks for the same reel: the original dark cut and a light one. Every colour that differs between them
// comes from here.
type Look = {
  light: boolean; text: string; muted: string; faint: string; accent: string; accentInk: string; edge: string; mint: string;
  pink: string; pinkChipBg: string; pinkChipInk: string; codeBg: string; codeInk: string; dot: string; shadow: string; linkBg: string; palette: Palette;
};
const DARK_LOOK: Look = {
  light: false, text: C.text, muted: C.muted, faint: C.faint, accent: C.accent, accentInk: C.accentInk, edge: C.edge, mint: MINT,
  pink: '#d26ad6', pinkChipBg: 'rgba(210,106,214,.18)', pinkChipInk: '#f0c7f2', codeBg: '#120f17', codeInk: '#d8d0e6', dot: '#3a3344',
  shadow: 'rgba(0,0,0,.55)', linkBg: 'rgba(255,255,255,.06)', palette: DARK,
};
const LIGHT_LOOK: Look = {
  light: true, text: '#16131c', muted: '#5f5a69', faint: '#a29cab', accent: '#6c4ef5', accentInk: '#ffffff', edge: 'rgba(30,20,50,.1)', mint: '#1f9d63',
  pink: '#b23fb6', pinkChipBg: 'rgba(178,63,182,.12)', pinkChipInk: '#8e2a92', codeBg: '#ffffff', codeInk: '#2b2533', dot: '#e4dfea',
  shadow: 'rgba(60,40,20,.18)', linkBg: '#ffffff', palette: LIGHT,
};
const LookContext = createContext<Look>(DARK_LOOK);
const useLook = () => useContext(LookContext);
// Which scene we're in, for the corner tag's number ("01", "02", …).
const SceneNo = createContext(0);

// The stage behind every scene: Sinehan's dark glow, or warm paper with a soft light from above.
const Stage: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const t = useLook();
  if (!t.light) return <Backdrop>{children}</Backdrop>;
  return (
    <AbsoluteFill style={{ background: '#fbf8f3', fontFamily: FONT, color: t.text }}>
      <AbsoluteFill style={{ background: 'radial-gradient(120% 80% at 50% -10%, #ffffff 0%, #fbf6ef 55%, #f3ebe0 100%)' }} />
      {children}
    </AbsoluteFill>
  );
};

// ---- Small pieces ----

// A word that rises in, one for each word of a line.
const Rise: React.FC<{ text: string; delay?: number; size?: number; weight?: number; color?: string; step?: number; style?: React.CSSProperties }> = ({
  text, delay = 0, size = 96, weight = 800, color: colorProp, step = 3, style,
}) => {
  const f = useCurrentFrame();
  const t = useLook();
  return (
    <div style={{ fontSize: size, fontWeight: weight, lineHeight: 1.04, letterSpacing: '-0.035em', color: colorProp ?? t.text, ...style }}>
      {text.split(' ').map((w, i) => {
        const p = glide(f, delay + i * step, 22);
        return (
          <span key={i} style={{ display: 'inline-block', marginRight: '0.24em', opacity: p, transform: `translateY(${(1 - p) * 44}px)` }}>
            {w}
          </span>
        );
      })}
    </div>
  );
};

// Text typed out one character at a time, with a blinking caret.
const Typed: React.FC<{ text: string; from: number; cps?: number; size?: number; color?: string; caret?: boolean }> = ({
  text, from, cps = 18, size = 36, color: colorProp, caret = true,
}) => {
  const f = useCurrentFrame();
  const t = useLook();
  const n = Math.max(0, Math.min(text.length, Math.floor(((f - from) / FPS) * cps)));
  const done = n >= text.length;
  const blink = Math.floor(f / 16) % 2 === 0;
  if (f < from) return null;
  return (
    <div style={{ fontSize: size, fontWeight: 500, color: colorProp ?? t.muted, fontFamily: FONT, whiteSpace: 'pre' }}>
      {text.slice(0, n)}
      {caret && (!done || blink) && <span style={{ color: t.accent }}>|</span>}
    </div>
  );
};

// A sticker-like label that pops in, slightly tilted.
const Chip: React.FC<{ text: string; at: number; x: number; y: number; bg?: string; ink?: string; tilt?: number; size?: number }> = ({
  text, at, x, y, bg = ORANGE, ink = '#1b1325', tilt = -4, size = 26,
}) => {
  const f = useCurrentFrame();
  const t = useLook();
  const s = pop(f, at, { damping: 8, stiffness: 180, mass: 0.6 });
  return (
    <div
      style={{
        position: 'absolute', left: x, top: y, padding: `${size * 0.35}px ${size * 0.75}px`, borderRadius: 999,
        background: bg, color: ink, fontSize: size, fontWeight: 700, letterSpacing: '-0.01em', whiteSpace: 'nowrap',
        transform: `rotate(${tilt}deg) scale(${s})`, transformOrigin: '50% 50%', opacity: Math.min(1, s * 2),
        boxShadow: `0 10px 30px ${t.shadow}`,
      }}
    >
      {text}
    </div>
  );
};

// A photo in a white frame, like a polaroid, that pops in tilted and floats a little.
const Polaroid: React.FC<{ src: string; at: number; x: number; y: number; w: number; h?: number; tilt?: number; caption?: string; phase?: number; fit?: 'cover' | 'contain'; pos?: string }> = ({
  src, at, x, y, w, h, tilt = 0, caption, phase = 0, fit = 'cover', pos = 'center',
}) => {
  const f = useCurrentFrame();
  const t = useLook();
  const s = pop(f, at, { damping: 9, stiffness: 150, mass: 0.7 });
  const ph = h ?? w * 0.75;
  return (
    <div
      style={{
        position: 'absolute', left: x, top: y, width: w, padding: 14, paddingBottom: caption ? 46 : 14, background: '#fff', borderRadius: 6,
        boxShadow: `0 30px 70px ${t.shadow}`,
        transform: `rotate(${tilt}deg) scale(${s}) translateY(${drift(f, 5, 170, phase)}px)`, transformOrigin: '50% 60%',
        opacity: Math.min(1, s * 2),
      }}
    >
      <Img src={src} style={{ width: '100%', height: ph, objectFit: fit, objectPosition: pos, display: 'block', background: '#eee' }} />
      {caption && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 12, textAlign: 'center', fontSize: 20, color: '#333', fontWeight: 500 }}>
          {caption}
        </div>
      )}
    </div>
  );
};

// A screenshot card with a label, dealt in from off-screen like a playing card.
const Deal: React.FC<{ src: string; at: number; x: number; y: number; w: number; h: number; tilt?: number; label?: string; from?: 'right' | 'bottom'; phase?: number }> = ({
  src, at, x, y, w, h, tilt = 0, label, from = 'bottom', phase = 0,
}) => {
  const f = useCurrentFrame();
  const t = useLook();
  const p = glide(f, at, 24);
  const dx = from === 'right' ? (1 - p) * 900 : 0;
  const dy = from === 'bottom' ? (1 - p) * 700 : 0;
  const chip = pop(f, at + 14);
  return (
    <div
      style={{
        position: 'absolute', left: x, top: y, width: w, height: h, borderRadius: 16, overflow: 'visible',
        transform: `translate(${dx}px, ${dy}px) rotate(${tilt + (1 - p) * 10}deg) translateY(${drift(f, 4, 190, phase)}px)`,
        transformOrigin: '50% 50%', opacity: Math.min(1, p * 2),
      }}
    >
      <div style={{ width: '100%', height: '100%', borderRadius: 16, overflow: 'hidden', boxShadow: `0 30px 80px ${t.shadow}`, background: '#1c1724' }}>
        <Img src={src} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </div>
      {label && (
        <div
          style={{
            position: 'absolute', left: 14, bottom: -18, padding: '8px 16px', borderRadius: 999, background: CREAM, color: '#1b1325',
            fontSize: 22, fontWeight: 700, whiteSpace: 'nowrap', transform: `scale(${chip})`, transformOrigin: 'left center', boxShadow: `0 8px 24px ${t.shadow}`,
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
};

// Small corner tag that stays on through a scene ("02 / make it work").
const Corner: React.FC<{ text: string }> = ({ text }) => {
  const f = useCurrentFrame();
  const t = useLook();
  const n = String(useContext(SceneNo)).padStart(2, '0');
  return (
    <div style={{ position: 'absolute', left: 90, top: 70, display: 'flex', alignItems: 'center', gap: 14, opacity: fadeIn(f, 4, 10), fontSize: 24, color: t.muted, fontWeight: 600 }}>
      <span style={{ color: ORANGE }}>{n}</span>
      <span style={{ width: 36, height: 2, background: t.faint }} />
      <span>{text}</span>
    </div>
  );
};

// ---- Scene 1: hello ----
export const Hello: React.FC = () => {
  const f = useCurrentFrame();
  const t = useLook();
  const k = pop(f, 8, { damping: 9, stiffness: 120, mass: 0.8 });
  return (
    <Stage>
      <div style={{ position: 'absolute', left: 120, top: 150 }}>
        <Typed text="Hi, it's me :)" from={2} size={38} />
        <div style={{ marginTop: 28 }}>
          <Rise text="Fran Suan" delay={30} size={150} />
        </div>
        <div style={{ marginTop: 14, display: 'flex', gap: 22, alignItems: 'baseline' }}>
          <Rise text="Designer" delay={48} size={60} weight={500} color={ORANGE} style={{ fontStyle: 'italic' }} />
          <Rise text="/" delay={52} size={60} weight={300} color={t.faint} />
          <Rise text="Developer" delay={56} size={60} weight={700} />
        </div>
        <div style={{ marginTop: 44, maxWidth: 700, fontSize: 30, lineHeight: 1.4, color: t.muted, opacity: fadeIn(f, 80, 16), transform: `translateY(${(1 - glide(f, 80, 22)) * 16}px)` }}>
          I like to make things work, and I like them to look good while doing it.
        </div>
      </div>
      <Img
        src={asset('k.png')}
        style={{ position: 'absolute', left: 120, top: 70, width: 56, transform: `scale(${k}) rotate(${(1 - k) * -120}deg)`, opacity: Math.min(1, k * 2) }}
      />
      <Polaroid src={asset('grad.jpg')} at={40} x={1230} y={120} w={520} h={620} tilt={5} phase={30} pos="center 20%" />
      <Chip text="BS Computer Science" at={62} x={1120} y={700} tilt={-6} />
      <Chip text="University of the Philippines Visayas" at={70} x={1160} y={770} bg={MINT} tilt={3} />
      <Chip text="Class of 2025" at={78} x={1500} y={840} bg={SUN} tilt={-3} />
      <Confetti x={1480} y={420} at={84} count={60} seed="grad" spread={1.3} />
    </Stage>
  );
};

// ---- Scene 2: make it look good ----
const LOOKS: { src: string; label: string; w: number; h: number; x: number; y: number; tilt: number }[] = [
  { src: 'landing-pages.jpg', label: 'landing pages', w: 520, h: 280, x: 130, y: 370, tilt: -3 },
  { src: 'maps.jpg', label: 'map legends', w: 520, h: 280, x: 700, y: 360, tilt: 2 },
  { src: 'listing.jpg', label: 'Amazon listing images', w: 520, h: 280, x: 1270, y: 370, tilt: -2 },
  { src: 'fling.jpg', label: 'brands', w: 480, h: 260, x: 280, y: 730, tilt: 3 },
  { src: 'class-wall.jpg', label: 'a whole class, on a wall', w: 480, h: 260, x: 830, y: 740, tilt: -3 },
  { src: 'vid-egypt.jpg', label: 'video, too', w: 480, h: 260, x: 1380, y: 730, tilt: 2 },
];
export const Looks: React.FC = () => {
  const f = useCurrentFrame();
  const t = useLook();
  return (
    <Stage>
      <Corner text="make it look good" />
      <div style={{ position: 'absolute', left: 90, top: 130 }}>
        <Rise text="First, I make things" delay={6} size={84} />
        <Rise text="look good." delay={16} size={84} color={ORANGE} />
      </div>
      {LOOKS.map((c, i) => (
        <Deal key={c.src} src={asset(c.src)} at={34 + i * 11} x={c.x} y={c.y} w={c.w} h={c.h} tilt={c.tilt} label={c.label} from={i % 2 ? 'right' : 'bottom'} phase={i * 40} />
      ))}
      <div style={{ position: 'absolute', right: 110, top: 150, fontSize: 26, color: t.muted, textAlign: 'right', lineHeight: 1.5, opacity: fadeIn(f, 120, 14) }}>
        dashboards, posters, album art,
        <br />
        anything that needs to look right by Friday
      </div>
    </Stage>
  );
};

// ---- Scene 3: make it work ----
const CODE = [
  'const party = await join(room);',
  'video.addEventListener("pause", () =>',
  '  party.send({ type: "pause", time: video.currentTime })',
  ');',
  '// …and the other side follows.',
];
const WORKS: { src: string; label: string; w: number; h: number; x: number; y: number; tilt: number }[] = [
  { src: 'iskalusugan.jpg', label: 'isKalusugan · UP Visayas health system', w: 440, h: 248, x: 950, y: 330, tilt: -2 },
  { src: 'dashboard.jpg', label: 'dashboards', w: 440, h: 248, x: 1420, y: 300, tilt: 3 },
  { src: 'dswtree.jpg', label: 'DSWTree · plant trees, earn rewards', w: 440, h: 248, x: 960, y: 660, tilt: 2 },
  { src: 'tudlo.jpg', label: 'Tudlo · find a tutor', w: 440, h: 248, x: 1430, y: 640, tilt: -3 },
];
export const Works: React.FC = () => {
  const f = useCurrentFrame();
  const t = useLook();
  const win = glide(f, 30, 26);
  return (
    <Stage>
      <Corner text="make it work" />
      <div style={{ position: 'absolute', left: 90, top: 130 }}>
        <Rise text="Then I make them" delay={6} size={84} />
        <Rise text="work." delay={14} size={84} color={t.mint} />
      </div>
      <div
        style={{
          position: 'absolute', left: 90, top: 400, width: 760, padding: '26px 30px', borderRadius: 18, background: t.codeBg,
          border: `1px solid ${t.edge}`, boxShadow: `0 30px 80px ${t.shadow}`, fontFamily: "'Cascadia Code', 'Consolas', monospace", fontVariantLigatures: 'none',
          fontSize: 26, lineHeight: 1.6, color: t.codeInk, opacity: win, transform: `translateY(${(1 - win) * 40}px)`,
        }}
      >
        <div style={{ display: 'flex', gap: 9, marginBottom: 18 }}>
          {[0, 1, 2].map((i) => <div key={i} style={{ width: 13, height: 13, borderRadius: '50%', background: t.dot }} />)}
        </div>
        {CODE.map((line, i) => (
          <div key={i} style={{ minHeight: 42, color: line.startsWith('//') ? t.faint : undefined }}>
            <Typed text={line} from={44 + i * 20} cps={34} size={26} color={line.startsWith('//') ? t.faint : t.codeInk} caret={i === CODE.length - 1} />
          </div>
        ))}
      </div>
      {WORKS.map((c, i) => (
        <Deal key={c.src} src={asset(c.src)} at={70 + i * 14} x={c.x} y={c.y} w={c.w} h={c.h} tilt={c.tilt} label={c.label} from="right" phase={i * 50} />
      ))}
      <Chip text="React" at={150} x={90} y={760} bg={t.accent} ink={t.accentInk} tilt={-3} size={24} />
      <Chip text="TypeScript" at={156} x={210} y={770} bg={t.accent} ink={t.accentInk} tilt={2} size={24} />
      <Chip text="Django REST" at={162} x={390} y={758} bg={t.accent} ink={t.accentInk} tilt={-2} size={24} />
      <Chip text="Postgres" at={168} x={600} y={772} bg={t.accent} ink={t.accentInk} tilt={4} size={24} />
      <Chip text="Svelte" at={174} x={760} y={760} bg={t.accent} ink={t.accentInk} tilt={-5} size={24} />
    </Stage>
  );
};

// ---- Scene 4: now ----
export const Now: React.FC = () => {
  const f = useCurrentFrame();
  const t = useLook();
  const win = glide(f, 20, 28);
  const swap = ease(f, [140, 160], [0, 1]);
  return (
    <Stage>
      <Corner text="now" />
      <div style={{ position: 'absolute', left: 90, top: 130, width: 780 }}>
        <Rise text="Platform Innovation Lead" delay={6} size={58} />
        <Rise text="at A Whole Family Matter" delay={16} size={58} color={t.pink} />
        <div style={{ marginTop: 34, fontSize: 30, lineHeight: 1.45, color: t.muted, opacity: fadeIn(f, 50, 16), transform: `translateY(${(1 - glide(f, 50, 22)) * 16}px)` }}>
          An app that helps families plan and pay for end-of-life care together. It used to be a stack of paper forms and one person carrying all of it.
        </div>
        <div style={{ marginTop: 30, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {['research', 'design', 'code', 'GDPR from day one'].map((tag, i) => {
            const s = pop(f, 80 + i * 8);
            return (
              <div key={tag} style={{ padding: '10px 20px', borderRadius: 999, background: t.pinkChipBg, color: t.pinkChipInk, fontSize: 24, fontWeight: 600, transform: `scale(${s})`, opacity: Math.min(1, s * 2) }}>
                {tag}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ position: 'absolute', left: 900, top: 150, opacity: win, transform: `translateX(${(1 - win) * 200}px) rotate(-2deg) translateY(${drift(f, 6, 200)}px)` }}>
        <BrowserWindow width={940} height={720} url="awholefamilymatter.org">
          <Img src={asset('awfm-org.jpg')} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', opacity: 1 - swap }} />
          <Img src={asset('awfm-app.jpg')} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', opacity: swap }} />
        </BrowserWindow>
      </div>
    </Stage>
  );
};

// ---- Scene 5: for fun ----
const CHAT: Line[] = [
  { kind: 'msg', who: 'them', text: 'wait is he gonna', time: '9:41', at: 40 },
  { kind: 'emoji', who: 'you', text: '😭', time: '9:41', at: 58 },
  { kind: 'msg', who: 'you', text: '/spin', time: '9:42', at: 110 },
  { kind: 'sys', text: 'Kismet asked Bantay to spin', at: 118 },
];
export const Fun: React.FC = () => {
  const f = useCurrentFrame();
  const t = useLook();
  const side = glide(f, 14, 26);
  const spinT = f - 122;
  const spinning = spinT >= 0 && spinT < 56;
  const spinX = spinning ? Math.cos((spinT / 28) * Math.PI * 2) : 1;
  const spinY = spinning ? -Math.abs(Math.sin((spinT / 28) * Math.PI)) * 30 : 0;
  const bark = spinT >= 6 && spinT < 90 ? pop(f, 128) : 0;
  const shot = glide(f, 6, 26);
  return (
    <Stage>
      <Corner text="for fun" />
      <div style={{ position: 'absolute', left: 90, top: 130, width: 640 }}>
        <Rise text="For fun, I built" delay={6} size={72} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 4 }}>
          <Img src={asset('sinehan-icon.png')} style={{ width: 70, height: 70, transform: `scale(${pop(f, 22)})` }} />
          <Rise text="Sinehan." delay={20} size={72} color={t.accent} />
        </div>
        <div style={{ marginTop: 30, fontSize: 30, lineHeight: 1.45, color: t.muted, opacity: fadeIn(f, 46, 16) }}>
          A movie theater for two. Same episode, same second, from two cities, with a chat and a call beside it.
        </div>
        <div style={{ marginTop: 26, fontSize: 22, color: t.muted, whiteSpace: 'nowrap', opacity: fadeIn(f, 150, 14) }}>
          Chrome extension · WebRTC · a dog who does tricks
        </div>
      </div>
      <div style={{ position: 'absolute', left: 700, top: 210, width: 640, opacity: shot, transform: `translateY(${(1 - shot) * 60}px) rotate(-1.5deg)`, borderRadius: 16, overflow: 'hidden', boxShadow: `0 30px 80px ${t.shadow}` }}>
        <Img src={asset('sinehan-store.png')} style={{ width: '100%', display: 'block' }} />
      </div>
      <div style={{ position: 'absolute', left: 1440, top: 150, opacity: side, transform: `translateX(${(1 - side) * 200}px) rotate(2deg)`, boxShadow: `0 30px 80px ${t.shadow}`, borderRadius: 14 }}>
        <Sidebar p={t.palette} lines={CHAT} chatHeight={300} />
      </div>
      <div style={{ position: 'absolute', left: 1210, top: 690, transform: `translateY(${spinY}px) scaleX(${spinX})`, transformOrigin: '50% 100%' }}>
        <Bantay pose={spinning || bark > 0 ? 'happy' : 'sit'} size={260} />
      </div>
      <div
        style={{
          position: 'absolute', left: 1400, top: 650, padding: '8px 16px', borderRadius: '14px 14px 14px 3px', background: t.accent, color: t.accentInk,
          fontWeight: 800, fontSize: 28, transform: `scale(${bark}) rotate(-6deg)`, opacity: Math.min(1, bark * 2),
        }}
      >
        Wheee!
      </div>
    </Stage>
  );
};

// ---- Scene 6: off the clock ----
export const Life: React.FC = () => {
  const f = useCurrentFrame();
  const t = useLook();
  return (
    <Stage>
      <Corner text="off the clock" />
      <div style={{ position: 'absolute', left: 90, top: 130 }}>
        <Rise text="Off the clock:" delay={6} size={84} />
      </div>
      <Polaroid src={asset('dog.jpg')} at={24} x={120} y={330} w={540} h={400} tilt={-4} caption="pets <3" phase={0} pos="center 30%" />
      <Polaroid src={asset('sunset.jpg')} at={40} x={700} y={260} w={420} h={520} tilt={3} caption="sunsets" phase={60} />
      <Polaroid src={asset('vid-upv.jpg')} at={56} x={1160} y={360} w={560} h={315} tilt={-2} caption="videos for friends" phase={120} />
      <Chip text="Iloilo, Philippines" at={74} x={1180} y={760} bg={SUN} tilt={-3} />
      <Chip text="UPV '25" at={82} x={1500} y={790} bg={MINT} tilt={4} />
      <div style={{ position: 'absolute', left: 1600, top: 110, transform: `scaleX(-1) translateY(${drift(f, 4, 150)}px)` }}>
        <Bantay pose="lying" size={240} />
      </div>
    </Stage>
  );
};

// ---- Scene 7: end card ----
const LINKS = [
  ['website', 'prandesal.framer.website'],
  ['github', 'github.com/kpsuan'],
  ['linkedin', 'linkedin.com/in/kpsuan'],
];
export const End: React.FC = () => {
  const f = useCurrentFrame();
  const t = useLook();
  const k = pop(f, 6, { damping: 9, stiffness: 120, mass: 0.8 });
  const wave = f > 50 ? Math.sin(((f - 50) / 14) * Math.PI * 2) * 6 : 0;
  return (
    <Stage>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Img src={asset('k.png')} style={{ width: 90, transform: `scale(${k}) rotate(${(1 - k) * 180}deg)`, marginBottom: 26 }} />
        <Rise text="Let's build something." delay={14} size={100} style={{ textAlign: 'center' }} />
        <div style={{ marginTop: 20, fontSize: 32, color: t.muted, opacity: fadeIn(f, 40, 16) }}>Fran Suan · designer / developer</div>
        <div style={{ marginTop: 50, display: 'flex', gap: 18 }}>
          {LINKS.map(([k2, v], i) => {
            const s = pop(f, 56 + i * 8);
            return (
              <div key={k2} style={{ padding: '14px 24px', borderRadius: 14, background: t.linkBg, boxShadow: t.light ? `0 8px 24px ${t.shadow}` : undefined, border: `1px solid ${t.edge}`, display: 'flex', gap: 12, alignItems: 'baseline', transform: `scale(${s})`, opacity: Math.min(1, s * 2) }}>
                <span style={{ fontSize: 20, color: ORANGE, fontWeight: 700 }}>{k2}</span>
                <span style={{ fontSize: 26, color: t.text, fontWeight: 500 }}>{v}</span>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
      <div style={{ position: 'absolute', right: 150, bottom: 60, transform: `rotate(${wave}deg)`, transformOrigin: '50% 100%' }}>
        <Bantay pose={f > 50 ? 'paw' : 'sit'} size={240} />
      </div>
    </Stage>
  );
};

// ---- Scene: make it move (one-minute cut only) ----
const CLIPS: { src: string; label: string }[] = [
  { src: 'vid-euro.jpg', label: 'video essays' },
  { src: 'vid-google.jpg', label: 'motion graphics' },
  { src: 'vid-egypt.jpg', label: 'explainers' },
];
const TRACKS: { color: string; clips: [number, number][] }[] = [
  { color: ORANGE, clips: [[0, 0.22], [0.25, 0.5], [0.53, 0.8], [0.83, 1]] },
  { color: SUN, clips: [[0.05, 0.4], [0.45, 0.72], [0.76, 0.95]] },
  { color: MINT, clips: [[0, 0.6], [0.62, 1]] },
];
export const Motion: React.FC = () => {
  const f = useCurrentFrame();
  const t = useLook();
  const player = glide(f, 20, 26);
  const playAt = 56;
  const playing = f >= playAt;
  const head = ease(f, [playAt, playAt + 180], [0, 1]);
  // the player cuts between the three clips as the playhead moves
  const clip = Math.min(CLIPS.length - 1, Math.floor(head * CLIPS.length));
  return (
    <Stage>
      <Corner text="make it move" />
      <div style={{ position: 'absolute', left: 90, top: 130 }}>
        <Rise text="I also make" delay={6} size={84} />
        <Rise text="them move." delay={14} size={84} color={ORANGE} />
      </div>
      <div style={{ position: 'absolute', left: 90, top: 400, width: 540, fontSize: 30, lineHeight: 1.45, color: t.muted, opacity: fadeIn(f, 40, 16) }}>
        Editing, titles and motion, for anyone with a story that needs to land.
      </div>
      {CLIPS.map((c, i) => (
        <Chip key={c.label} text={c.label} at={70 + i * 10} x={90 + i * 30} y={620 + i * 80} bg={[ORANGE, SUN, MINT][i]} tilt={[-3, 2, -2][i]} />
      ))}
      <div style={{ position: 'absolute', left: 720, top: 150, width: 1100, opacity: player, transform: `translateY(${(1 - player) * 60}px) rotate(-1deg)` }}>
        <div style={{ position: 'relative', width: 1100, height: 619, borderRadius: 16, overflow: 'hidden', boxShadow: `0 30px 80px ${t.shadow}`, background: '#111' }}>
          {CLIPS.map((c, i) => (
            <Img key={c.src} src={asset(c.src)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: i === clip ? 1 : 0 }} />
          ))}
          {/* play button: pressed, then fades away */}
          <div style={{ position: 'absolute', left: 500, top: 260, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${press(f, playAt - 4)})`, opacity: fadeOut(f, playAt + 4, 10) }}>
            <div style={{ width: 0, height: 0, borderTop: '20px solid transparent', borderBottom: '20px solid transparent', borderLeft: '32px solid #16131c', marginLeft: 8 }} />
          </div>
          <div style={{ position: 'absolute', left: 0, bottom: 0, height: 8, width: `${head * 100}%`, background: ORANGE }} />
        </div>
        {/* the edit's timeline, with a playhead */}
        <div style={{ position: 'relative', marginTop: 26, padding: '16px 18px', borderRadius: 14, background: t.codeBg, border: `1px solid ${t.edge}`, boxShadow: `0 20px 50px ${t.shadow}` }}>
          {TRACKS.map((tr, k) => (
            <div key={k} style={{ position: 'relative', height: 30, marginBottom: k < TRACKS.length - 1 ? 10 : 0 }}>
              {tr.clips.map(([a, b], j) => {
                const s2 = glide(f, 30 + k * 6 + j * 4, 18);
                return <div key={j} style={{ position: 'absolute', left: `${a * 100}%`, width: `${(b - a) * 100 * s2}%`, top: 0, bottom: 0, borderRadius: 7, background: tr.color, opacity: 0.85 }} />;
              })}
            </div>
          ))}
          <div style={{ position: 'absolute', top: 6, bottom: 6, left: `calc(18px + ${head} * (100% - 36px))`, width: 4, borderRadius: 2, background: t.text, opacity: playing ? 1 : 0.4 }} />
        </div>
      </div>
    </Stage>
  );
};

// ---- The reel ----
// Scenes as [id, component, frames]. The dark cut is the original ~43 s; the light cut runs exactly one minute
// and adds the "make it move" scene.
type Scene = [string, React.FC, number];
const T = 14;
const DARK_SCENES: Scene[] = [
  ['hello', Hello, sec(5.5)],
  ['looks', Looks, sec(6.5)],
  ['works', Works, sec(7.5)],
  ['now', Now, sec(7)],
  ['fun', Fun, sec(8)],
  ['life', Life, sec(5)],
  ['end', End, sec(5.5)],
];
const LIGHT_BODY: Scene[] = [
  ['hello', Hello, sec(7)],
  ['looks', Looks, sec(8.5)],
  ['works', Works, sec(8.5)],
  ['motion', Motion, sec(8.5)],
  ['now', Now, sec(8)],
  ['fun', Fun, sec(8.5)],
  ['life', Life, sec(6.5)],
];
const totalOf = (scenes: Scene[]) => scenes.reduce((n, s) => n + s[2], 0) - (scenes.length - 1) * T;
// the end card takes whatever is left of the 60 seconds
const LIGHT_SCENES: Scene[] = [...LIGHT_BODY, ['end', End, sec(60) - totalOf(LIGHT_BODY) + T]];
const startsOf = (scenes: Scene[]) => scenes.reduce<number[]>((acc, s, i) => [...acc, i === 0 ? 0 : acc[i - 1] + scenes[i - 1][2] - T], []);
export const REEL_DURATION = totalOf(DARK_SCENES);
export const REEL_LIGHT_DURATION = totalOf(LIGHT_SCENES);

// Sound effects: [scene, name, scene-local frame, volume]
const CUES: [string, string, number, number][] = [
  ['hello', 'typing', 2, 0.35], ['hello', 'pop', 8, 0.4], ['hello', 'pop', 40, 0.45], ['hello', 'pop', 62, 0.3], ['hello', 'pop', 70, 0.3], ['hello', 'pop', 78, 0.3], ['hello', 'confetti', 84, 0.5],
  ...LOOKS.map((_, i) => ['looks', 'swipe', 34 + i * 11, 0.35] as [string, string, number, number]),
  ['works', 'typing', 44, 0.3], ['works', 'typing', 84, 0.3], ...WORKS.map((_, i) => ['works', 'swipe', 70 + i * 14, 0.35] as [string, string, number, number]),
  ['works', 'pop', 150, 0.25], ['works', 'pop', 162, 0.25], ['works', 'pop', 174, 0.25],
  ['motion', 'whoosh', 20, 0.3], ['motion', 'click', 52, 0.45], ['motion', 'pop', 70, 0.3], ['motion', 'pop', 80, 0.3], ['motion', 'pop', 90, 0.3],
  ['now', 'whoosh', 20, 0.3], ['now', 'pop', 80, 0.25], ['now', 'pop', 96, 0.25], ['now', 'click', 122, 0.4],
  ['fun', 'pop', 22, 0.4], ['fun', 'pop', 58, 0.3], ['fun', 'typing', 100, 0.3], ['fun', 'bark', 128, 0.55], ['fun', 'sparkle', 130, 0.3],
  ['life', 'pop', 24, 0.4], ['life', 'pop', 40, 0.4], ['life', 'pop', 56, 0.4], ['life', 'pop', 74, 0.3],
  ['end', 'pop', 6, 0.4], ['end', 'sparkle', 56, 0.35], ['end', 'bark', 54, 0.45],
];

const TRANSITIONS = [slide({ direction: 'from-right' }), fade(), slide({ direction: 'from-bottom' }), fade(), slide({ direction: 'from-right' }), fade()];

const Cut: React.FC<{ look: Look; scenes: Scene[]; music: string; musicLevel: number }> = ({ look, scenes, music, musicLevel }) => {
  const total = totalOf(scenes);
  const starts = startsOf(scenes);
  const musicVolume = (f: number) => {
    const up = interpolate(f, [0, 24], [0, 1], { extrapolateRight: 'clamp' });
    const down = interpolate(f, [total - 70, total], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    return musicLevel * up * down;
  };
  return (
    <LookContext.Provider value={look}>
      <AbsoluteFill style={{ fontFamily: FONT }}>
        <TransitionSeries>
          {scenes.flatMap(([id, Scene, duration], i) => {
            const items = [
              <TransitionSeries.Sequence key={id} durationInFrames={duration}>
                <SceneNo.Provider value={i}>
                  <Scene />
                </SceneNo.Provider>
              </TransitionSeries.Sequence>,
            ];
            if (i < scenes.length - 1)
              items.push(
                <TransitionSeries.Transition key={`t${id}`} presentation={TRANSITIONS[i % TRANSITIONS.length]} timing={springTiming({ config: { damping: 200 }, durationInFrames: T })} />,
              );
            return items;
          })}
        </TransitionSeries>
        <Html5Audio src={staticFile(music)} volume={musicVolume} />
        {CUES.filter(([scene]) => scenes.some((s) => s[0] === scene)).map(([scene, name, at, volume], j) => (
          <Sequence key={j} from={starts[scenes.findIndex((s) => s[0] === scene)] + at} layout="none">
            <Html5Audio src={staticFile(`audio/sfx/${name}.mp3`)} volume={volume} />
          </Sequence>
        ))}
        {scenes.slice(1).map((_, i) => (
          <Sequence key={`w${i}`} from={starts[i + 1] - 4} layout="none">
            <Html5Audio src={staticFile('audio/sfx/whoosh.mp3')} volume={0.16} />
          </Sequence>
        ))}
      </AbsoluteFill>
    </LookContext.Provider>
  );
};

export const Reel: React.FC = () => <Cut look={DARK_LOOK} scenes={DARK_SCENES} music="audio/music.mp3" musicLevel={0.42} />;
// The light, one-minute cut, with a happy ukulele track synthesized in code (scripts/synth-happy.mjs).
export const ReelLight: React.FC = () => <Cut look={LIGHT_LOOK} scenes={LIGHT_SCENES} music="audio/happy.wav" musicLevel={0.75} />;
