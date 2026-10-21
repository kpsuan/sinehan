import React from 'react';
import { AbsoluteFill, Img, interpolate, random, staticFile, useCurrentFrame } from 'remotion';
import { C, FONT, PEOPLE } from '../theme';
import { ease, fadeIn, glide, pop } from '../anim';

export const Backdrop: React.FC<{ children?: React.ReactNode; light?: number }> = ({ children, light = 0 }) => (
  <AbsoluteFill style={{ background: C.bg, fontFamily: FONT, color: C.text }}>
    <AbsoluteFill style={{ background: C.bgGlow }} />
    <AbsoluteFill style={{ background: '#f4f4f5', opacity: light }} />
    {children}
  </AbsoluteFill>
);

export const Avatar: React.FC<{ who: keyof typeof PEOPLE; size: number; ring?: string; style?: React.CSSProperties }> = ({
  who,
  size,
  ring = C.card,
  style,
}) => {
  const p = PEOPLE[who];
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        background: p.color,
        boxShadow: `0 0 0 ${Math.max(2, size / 16)}px ${ring}`,
        flex: 'none',
        ...style,
      }}
    >
      <Img src={staticFile(`avatars/${p.avatar}.svg`)} style={{ width: '100%', height: '100%' }} />
    </div>
  );
};

// Small logo + wordmark, as on the store screenshots.
export const Brand: React.FC<{ size?: number; color?: string }> = ({ size = 34, color = C.muted }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.4 }}>
    <Img src={staticFile('logo.png')} style={{ width: size, height: size }} />
    <span style={{ fontSize: size * 0.82, fontWeight: 600, color, letterSpacing: '-0.01em' }}>sinehan</span>
  </div>
);

// Big headline that rises in word by word, with an optional line under it.
export const Headline: React.FC<{
  lines: string[];
  sub?: string;
  delay?: number;
  size?: number;
  align?: 'left' | 'center';
  color?: string;
  subColor?: string;
}> = ({ lines, sub, delay = 0, size = 92, align = 'left', color = C.text, subColor = '#b9b0c8' }) => {
  const frame = useCurrentFrame();
  let i = 0;
  return (
    <div style={{ textAlign: align }}>
      {lines.map((line) => (
        <div key={line} style={{ fontSize: size, fontWeight: 700, lineHeight: 1.04, letterSpacing: '-0.035em', color }}>
          {line.split(' ').map((w) => {
            const p = glide(frame, delay + i++ * 3, 22);
            return (
              <span
                key={w + i}
                style={{
                  display: 'inline-block',
                  marginRight: '0.24em',
                  opacity: p,
                  transform: `translateY(${(1 - p) * 40}px)`,
                }}
              >
                {w}
              </span>
            );
          })}
        </div>
      ))}
      {sub && (
        <div
          style={{
            marginTop: size * 0.34,
            fontSize: size * 0.3,
            lineHeight: 1.45,
            color: subColor,
            maxWidth: 640,
            marginInline: align === 'center' ? 'auto' : undefined,
            opacity: fadeIn(frame, delay + i * 3 + 6, 16),
            transform: `translateY(${(1 - glide(frame, delay + i * 3 + 6, 22)) * 16}px)`,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
};

// One-line caption pill along the bottom, like the reference.
export const Caption: React.FC<{ text: string; from?: number; to?: number }> = ({ text, from = 8, to = 9999 }) => {
  const frame = useCurrentFrame();
  const p = glide(frame, from, 18);
  const out = interpolate(frame, [to - 10, to], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 54, pointerEvents: 'none' }}>
      <div
        style={{
          padding: '14px 26px',
          borderRadius: 14,
          background: 'rgba(28, 22, 38, .86)',
          border: `1px solid ${C.edge}`,
          boxShadow: '0 12px 40px rgba(0,0,0,.35)',
          fontSize: 28,
          fontWeight: 500,
          color: C.text,
          opacity: p * out,
          transform: `translateY(${(1 - p) * 24}px)`,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

// A pointer with a name tag; moves through keyframes [frame, x, y] and clicks at the given frames.
export const Cursor: React.FC<{
  path: [number, number, number][];
  clicks?: number[];
  label: string;
  color?: string;
  ink?: string;
  appear?: number;
}> = ({ path, clicks = [], label, color = C.accent, ink = C.accentInk, appear = 0 }) => {
  const frame = useCurrentFrame();
  const t = path.map((p) => p[0]);
  const x = ease(frame, t, path.map((p) => p[1]));
  const y = ease(frame, t, path.map((p) => p[2]));
  const s = pop(frame, appear);
  const click = clicks.find((c) => frame >= c && frame < c + 14);
  const r = click === undefined ? 0 : (frame - click) / 14;
  const dip = clicks.some((c) => frame >= c && frame < c + 5) ? 0.82 : 1;
  return (
    <div style={{ position: 'absolute', left: x, top: y, transform: `scale(${s * dip})`, transformOrigin: '0 0', zIndex: 50 }}>
      {click !== undefined && (
        <div
          style={{
            position: 'absolute',
            left: -30 * r - 4,
            top: -30 * r - 4,
            width: 60 * r + 8,
            height: 60 * r + 8,
            borderRadius: '50%',
            border: `3px solid ${color}`,
            opacity: 1 - r,
          }}
        />
      )}
      <svg width="34" height="38" viewBox="0 0 17 19" style={{ filter: 'drop-shadow(0 3px 6px rgba(0,0,0,.4))' }}>
        <path d="M1 1 L1 15 L5 11.5 L8 18 L10.6 16.8 L7.7 10.5 L13 10.5 Z" fill="#fff" stroke="#111" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
      <div
        style={{
          position: 'absolute',
          left: 26,
          top: 30,
          padding: '5px 12px',
          borderRadius: 999,
          background: color,
          color: ink,
          fontSize: 18,
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </div>
    </div>
  );
};

const CONFETTI = [C.accent, C.vivid, C.orange, C.blue, C.live, '#f2c94c', '#ff8fb1'];

// A burst of confetti from (x, y), deterministic per seed.
export const Confetti: React.FC<{ x: number; y: number; at: number; count?: number; seed?: string; spread?: number }> = ({
  x,
  y,
  at,
  count = 70,
  seed = 'c',
  spread = 1,
}) => {
  const frame = useCurrentFrame();
  const t = (frame - at) / 30;
  if (t < 0 || t > 3) return null;
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const a = random(`${seed}a${i}`) * Math.PI * 2;
        const v = (420 + random(`${seed}v${i}`) * 680) * spread;
        const vx = Math.cos(a) * v;
        const vy = Math.sin(a) * v - 520 * spread;
        const drag = 1 - Math.exp(-2.4 * t);
        const px = x + (vx / 2.4) * drag;
        const py = y + (vy / 2.4) * drag + 520 * t * t;
        const rot = random(`${seed}r${i}`) * 720 * t + i * 30;
        const w = 10 + random(`${seed}w${i}`) * 10;
        const round = random(`${seed}s${i}`) > 0.7;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: px,
              top: py,
              width: w,
              height: round ? w : w * 0.45,
              borderRadius: round ? '50%' : 2,
              background: CONFETTI[i % CONFETTI.length],
              transform: `rotate(${rot}deg) rotateX(${rot * 1.7}deg)`,
              opacity: t > 2.2 ? 1 - (t - 2.2) / 0.8 : 1,
              zIndex: 60,
            }}
          />
        );
      })}
    </>
  );
};

// Browser window with traffic lights and an address bar.
export const BrowserWindow: React.FC<{
  width: number;
  height: number;
  url?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ width, height, url = 'example.com/watch', children, style }) => (
  <div
    style={{
      width,
      height,
      borderRadius: 18,
      overflow: 'hidden',
      background: '#17131d',
      border: `1px solid ${C.edge}`,
      boxShadow: '0 40px 120px rgba(0,0,0,.55), 0 0 0 1px rgba(0,0,0,.4)',
      display: 'flex',
      flexDirection: 'column',
      ...style,
    }}
  >
    <div style={{ height: 50, flex: 'none', display: 'flex', alignItems: 'center', padding: '0 18px', gap: 9, background: '#1c1724' }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ width: 13, height: 13, borderRadius: '50%', background: '#3a3344' }} />
      ))}
      <div
        style={{
          margin: '0 auto',
          padding: '6px 70px',
          borderRadius: 8,
          background: '#120f17',
          color: C.muted,
          fontSize: 17,
        }}
      >
        {url}
      </div>
    </div>
    <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>{children}</div>
  </div>
);

// A film still that slowly pushes in, standing in for the show.
export const Film: React.FC<{ src: string; frame: number; zoom?: number; paused?: boolean; style?: React.CSSProperties }> = ({
  src,
  frame,
  zoom = 0.08,
  style,
}) => (
  <Img
    src={staticFile(src)}
    style={{
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      transform: `scale(${1.04 + zoom * Math.min(1, frame / 600)})`,
      ...style,
    }}
  />
);

// Line icons used across the mock UI (same stroke style as the sidebar).
export const Icon: React.FC<{ d: string; size?: number; color?: string; fill?: string; width?: number }> = ({
  d,
  size = 22,
  color = 'currentColor',
  fill = 'none',
  width = 1.9,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

export const I = {
  link: 'M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
  check: 'M5 12.5l4.5 4.5L19 7',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  door: 'M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M4 21h16M14 12h.01',
  video: 'M3 7a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM16 10l5-3v10l-5-3',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2',
  smile: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01',
  send: 'M5 12h14M13 6l6 6-6 6',
  play: 'M7 4.5v15l12-7.5z',
  pause: 'M7 4h3.5v16H7zM13.5 4H17v16h-3.5z',
  back10: 'M11 5L6 9l5 4M6 9h8a5 5 0 0 1 0 10h-3',
  fwd10: 'M13 5l5 4-5 4M18 9h-8a5 5 0 0 0 0 10h3',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
};
