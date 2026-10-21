import React from 'react';
import { AbsoluteFill, interpolate, random, useCurrentFrame } from 'remotion';
import { C } from '../theme';
import { drift, ease, glide, pop, press } from '../anim';
import { Bantay } from '../components/Bantay';
import { Avatar, Backdrop, BrowserWindow, Caption, Cursor, Film, Headline, I, Icon } from '../components/ui';
import { Line, Sidebar } from '../components/Sidebar';

const LINES: Line[] = [
  { kind: 'sys', text: 'Jessa joined', at: 6 },
  { kind: 'sys', text: 'Jessa pressed play at 10:12', at: 14 },
  { kind: 'msg', who: 'them', text: 'okay the dragon scene is coming up', time: '12:11', at: 30 },
  { kind: 'msg', who: 'you', text: "I'm not ready", time: '12:18', at: 58 },
  { kind: 'msg', who: 'you', text: 'snacks first', time: '12:22', at: 78 },
  { kind: 'emoji', who: 'them', text: '😂😂', time: '12:24', at: 104 },
  { kind: 'msg', who: 'you', text: '/spin', time: '12:31', at: 196 },
  { kind: 'sys', text: 'Kismet asked Bantay to spin', at: 204 },
];

// The show plus the sidebar, as in the store screenshots.
export const WatchScreen: React.FC<{ frame: number; lines?: Line[]; glow?: number; pressed?: string; pressScale?: number; children?: React.ReactNode }> = ({
  frame,
  lines = LINES,
  glow,
  pressed,
  pressScale,
  children,
}) => (
  <BrowserWindow width={1120} height={800}>
    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 660, overflow: 'hidden' }}>
      <Film src="film-sintel.webp" frame={frame} />
      {children}
    </div>
    <div style={{ position: 'absolute', right: 0, top: 0, transform: 'scale(1.278)', transformOrigin: '100% 0' }}>
      <Sidebar lines={lines} chatHeight={370} glow={glow} pressed={pressed} pressScale={pressScale} />
    </div>
  </BrowserWindow>
);

// Emoji rising over the video.
const Floaters: React.FC<{ frame: number; at: number; emoji: string[]; seed: string }> = ({ frame, at, emoji, seed }) => (
  <>
    {Array.from({ length: 9 }, (_, i) => {
      const t = frame - at - i * 4;
      if (t < 0 || t > 70) return null;
      const x = 120 + random(`${seed}${i}`) * 420;
      const y = 720 - t * 8.5;
      const s = pop(frame, at + i * 4);
      return (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: x + Math.sin(t / 9 + i) * 20,
            top: y,
            fontSize: 56,
            transform: `scale(${s})`,
            opacity: interpolate(t, [50, 70], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          }}
        >
          {emoji[i % emoji.length]}
        </div>
      );
    })}
  </>
);

// ---- Together ----
export const Together: React.FC = () => {
  const f = useCurrentFrame();
  const enter = glide(f, 0, 30);
  const holdAt = 150;
  const glow = f >= holdAt ? interpolate(f - holdAt, [0, 18, 60, 90], [0, 1, 1, 0], { extrapolateRight: 'clamp' }) : 0;
  const cam = pop(f, 36);
  const msg = f >= 30 && f < 96 ? pop(f, 30) * interpolate(f, [84, 96], [1, 0], { extrapolateLeft: 'clamp' }) : 0;
  const spinT = f - 206;
  const spinning = spinT >= 0 && spinT < 56;
  const spinX = spinning ? Math.cos((spinT / 28) * Math.PI * 2) : 1;
  const spinY = spinning ? -Math.abs(Math.sin((spinT / 28) * Math.PI)) * 30 : 0;
  const bark = spinT >= 6 && spinT < 80 ? pop(f, 212) : 0;
  return (
    <Backdrop>
      <div style={{ position: 'absolute', left: 110, top: 360, width: 600 }}>
        <Headline lines={['Talk while', 'you watch.']} sub="Chat, reactions and a video call, right beside the show." size={84} />
      </div>
      <div
        style={{
          position: 'absolute',
          left: 700,
          top: 120,
          transform: `translateX(${(1 - enter) * 900}px) translateY(${drift(f, 6, 220)}px)`,
        }}
      >
        <WatchScreen frame={f} glow={glow} pressed={f >= holdAt - 2 && f < holdAt + 40 ? 'Hold hand' : undefined} pressScale={press(f, holdAt)}>
          {msg > 0 && (
            <div
              style={{
                position: 'absolute',
                top: 24,
                left: '50%',
                transform: `translateX(-50%) scale(${msg})`,
                padding: '10px 18px',
                borderRadius: 10,
                background: 'rgba(30,26,36,.88)',
                fontSize: 22,
                whiteSpace: 'nowrap',
              }}
            >
              Jessa: okay the dragon scene is coming up
            </div>
          )}
          <div
            style={{
              position: 'absolute',
              right: 24,
              top: 90,
              width: 170,
              height: 220,
              borderRadius: 18,
              overflow: 'hidden',
              background: '#bfe0d0',
              boxShadow: '0 16px 40px rgba(0,0,0,.45)',
              transform: `scale(${cam}) translateY(${drift(f, 5, 90)}px)`,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
            }}
          >
            <Avatar who="them" size={170} ring="transparent" style={{ borderRadius: 0 }} />
            <div style={{ position: 'absolute', left: 10, bottom: 10, display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 8, background: 'rgba(0,0,0,.5)', fontSize: 14 }}>
              <Icon d={I.mic} size={14} /> Jessa
            </div>
          </div>
          <Floaters frame={f} at={104} emoji={['😂', '😂', '🍿']} seed="laugh" />
          <Floaters frame={f} at={holdAt + 4} emoji={['💜', '🤍', '💜']} seed="love" />
          <div
            style={{
              position: 'absolute',
              left: 24,
              bottom: 10,
              transform: `translateY(${spinY}px) scaleX(${spinX})`,
              transformOrigin: '50% 100%',
            }}
          >
            <Bantay pose={spinning || bark > 0 ? 'happy' : 'sit'} size={170} />
          </div>
          {bark > 0 && (
            <div
              style={{
                position: 'absolute',
                left: 170,
                bottom: 150,
                padding: '8px 16px',
                borderRadius: '16px 16px 16px 4px',
                background: '#fff',
                color: '#1b1325',
                fontSize: 24,
                fontWeight: 700,
                transform: `scale(${bark})`,
                transformOrigin: '0 100%',
              }}
            >
              Wheee!
            </div>
          )}
        </WatchScreen>
      </div>
      <Cursor
        label="You"
        appear={120}
        path={[
          [120, 1700, 1000],
          [144, 1528, 343],
          [176, 1528, 343],
          [200, 1600, 860],
          [290, 1560, 900],
        ]}
        clicks={[holdAt]}
      />
      <Caption text="Chat, react and video call without leaving the show." from={10} to={146} />
      {f >= 146 && <Caption text="Hold hands from afar. Ask Bantay for a trick." from={152} />}
    </Backdrop>
  );
};

// ---- Reels ----
const REELS = ['film-bridge.webp', 'film-canal.webp', 'film-laundromat.webp'];

const PhoneFrame: React.FC<{ children: React.ReactNode; width?: number; height?: number; style?: React.CSSProperties }> = ({
  children,
  width = 380,
  height = 780,
  style,
}) => (
  <div
    style={{
      width,
      height,
      borderRadius: 54,
      padding: 12,
      background: '#09070c',
      boxShadow: '0 0 0 2px #2c2533, 0 50px 120px rgba(0,0,0,.6)',
      ...style,
    }}
  >
    <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 42, overflow: 'hidden', background: '#000' }}>
      {children}
      <div style={{ position: 'absolute', top: 12, left: '50%', width: 110, height: 30, marginLeft: -55, borderRadius: 20, background: '#000' }} />
    </div>
  </div>
);

const Feed: React.FC<{ frame: number; offset: number; h: number }> = ({ frame, offset, h }) => (
  <div style={{ position: 'absolute', inset: 0, transform: `translateY(${-offset * h}px)` }}>
    {REELS.map((src, i) => (
      <div key={src} style={{ position: 'absolute', left: 0, right: 0, top: i * h, height: h, overflow: 'hidden' }}>
        <Film src={src} frame={frame} zoom={0.1} />
        <AbsoluteFill style={{ background: 'linear-gradient(transparent 60%, rgba(0,0,0,.75))' }} />
        <div style={{ position: 'absolute', left: 22, bottom: 34, color: '#fff' }}>
          <div style={{ fontWeight: 700, fontSize: 20 }}>@{['blender', 'openmovies', 'cosmos'][i]}</div>
          <div style={{ fontSize: 16, opacity: 0.85, marginTop: 4 }}>{['the bridge scene 🎬', 'canal at night', 'Cosmos Laundromat'][i]}</div>
        </div>
        <div style={{ position: 'absolute', right: 18, bottom: 120, display: 'flex', flexDirection: 'column', gap: 22, color: '#fff', alignItems: 'center', fontSize: 14 }}>
          <Icon d={I.heart} size={32} />
          {['12k', '8.4k', '21k'][i]}
        </div>
      </div>
    ))}
  </div>
);

export const Reels: React.FC = () => {
  const f = useCurrentFrame();
  const swipes = [60, 140];
  const lag = 9;
  const mine = swipes.reduce((o, at) => o + ease(f, [at, at + 16], [0, 1]), 0);
  const theirs = swipes.reduce((o, at) => o + ease(f, [at + lag, at + lag + 16], [0, 1]), 0);
  const H = 756;
  const a = glide(f, 0, 30);
  const b = glide(f, 8, 30);
  const follow = (at: number) => (f >= at + lag && f < at + lag + 50 ? pop(f, at + lag + 4) * interpolate(f, [at + lag + 38, at + lag + 50], [1, 0], { extrapolateLeft: 'clamp' }) : 0);
  const pill = Math.max(follow(swipes[0]), follow(swipes[1]));
  // Finger: presses at the lower screen, drags up, lifts.
  const touch = swipes.find((at) => f >= at - 10 && f < at + 22);
  const tp = touch === undefined ? 0 : f - touch;
  return (
    <Backdrop>
      <div style={{ position: 'absolute', left: 120, top: 380, width: 620 }}>
        <Headline lines={['Scroll Reels', 'together.']} sub="Swipe to the next reel and their phone follows, already in sync." size={84} />
      </div>
      <div style={{ position: 'absolute', left: 860, top: 150, transform: `translateY(${(1 - a) * 900 + drift(f, 6, 200)}px)` }}>
        <PhoneFrame>
          <Feed frame={f} offset={mine} h={H} />
        </PhoneFrame>
        <div style={{ position: 'absolute', top: -56, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 10, alignItems: 'center', fontSize: 22, color: C.muted }}>
          <Avatar who="you" size={34} ring={C.bg} /> You
        </div>
      </div>
      <div style={{ position: 'absolute', left: 1340, top: 150, transform: `translateY(${(1 - b) * 900 + drift(f, 6, 200, 70)}px)` }}>
        <PhoneFrame>
          <Feed frame={f} offset={theirs} h={H} />
          <div
            style={{
              position: 'absolute',
              top: 64,
              left: '50%',
              transform: `translateX(-50%) scale(${pill})`,
              padding: '10px 16px',
              borderRadius: 12,
              background: 'rgba(20,16,27,.88)',
              color: '#fff',
              fontSize: 17,
              whiteSpace: 'nowrap',
            }}
          >
            Following you to the next reel
          </div>
        </PhoneFrame>
        <div style={{ position: 'absolute', top: -56, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 10, alignItems: 'center', fontSize: 22, color: C.muted }}>
          <Avatar who="them" size={34} ring={C.bg} /> Jessa
        </div>
      </div>
      {touch !== undefined && (
        <div
          style={{
            position: 'absolute',
            left: 1050 - 36,
            top: ease(tp, [6, 22], [740, 360]) - 36,
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: 'rgba(255,255,255,.45)',
            border: '3px solid rgba(255,255,255,.85)',
            transform: `scale(${interpolate(tp, [0, 6, 18, 22], [0.4, 1, 1, 0.5], { extrapolateRight: 'clamp' })})`,
            opacity: interpolate(tp, [0, 4, 18, 22], [0, 1, 1, 0], { extrapolateRight: 'clamp' }),
            zIndex: 40,
          }}
        />
      )}
      <Caption text="Not just movies: Facebook Reels and YouTube follow every swipe." from={20} />
    </Backdrop>
  );
};

// ---- Phone remote ----
// The phone slides up and its cards fly out around it, then float.
export const Remote: React.FC = () => {
  const f = useCurrentFrame();
  const up = glide(f, 6, 36);
  const cx = 1340;
  const cy = 560;
  const CARDS: { x: number; y: number; delay: number; rot: number; node: React.ReactNode }[] = [
    {
      x: -430,
      y: -250,
      delay: 40,
      rot: -6,
      node: (
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '.08em', color: C.muted }}>WATCHING</div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>Tears of Steel</div>
          <div style={{ fontSize: 18, color: C.live }}>● Playing · 41:02</div>
        </div>
      ),
    },
    {
      x: 330,
      y: -220,
      delay: 48,
      rot: 7,
      node: <div style={{ fontSize: 46, fontWeight: 800, color: C.accent }}>3·2·1</div>,
    },
    {
      x: -460,
      y: 60,
      delay: 56,
      rot: 4,
      node: (
        <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
          <Icon d={I.back10} size={34} />
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: C.accent, color: C.accentInk, display: 'grid', placeItems: 'center' }}>
            <Icon d={I.pause} size={30} fill={C.accentInk} width={0} />
          </div>
          <Icon d={I.fwd10} size={34} />
        </div>
      ),
    },
    {
      x: 340,
      y: 40,
      delay: 64,
      rot: -5,
      node: (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 22 }}>
          <Avatar who="them" size={40} />
          wait, pause, I need snacks
        </div>
      ),
    },
    {
      x: -340,
      y: 300,
      delay: 72,
      rot: -8,
      node: (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 22 }}>
          <Icon d={I.door} size={28} /> CR break
        </div>
      ),
    },
    { x: 320, y: 290, delay: 80, rot: 9, node: <div style={{ fontSize: 50 }}>😍 🍿 😭</div> },
  ];
  return (
    <Backdrop>
      <div style={{ position: 'absolute', left: 120, top: 380, width: 560 }}>
        <Headline lines={['Your phone is', 'the remote.']} sub="Open the invite on your phone: remote, chat and reactions. Nothing to install." size={84} />
      </div>
      {CARDS.map((c, i) => {
        const s = pop(f, c.delay, { damping: 10, stiffness: 120, mass: 0.7 });
        const x = cx + c.x * s + drift(f, 8, 160 + i * 20, i * 40);
        const y = cy + c.y * s + drift(f, 10, 200 + i * 15, i * 70);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              transform: `translate(-50%, -50%) scale(${s}) rotate(${c.rot * s}deg)`,
              padding: '18px 24px',
              borderRadius: 20,
              background: 'rgba(30,24,40,.92)',
              border: `1px solid ${C.edge}`,
              boxShadow: '0 20px 60px rgba(0,0,0,.45)',
              whiteSpace: 'nowrap',
              zIndex: i % 2 ? 5 : 1,
            }}
          >
            {c.node}
          </div>
        );
      })}
      <div
        style={{
          position: 'absolute',
          left: cx - 190,
          top: 150,
          transform: `translateY(${(1 - up) * 1000 + drift(f, 6, 240)}px)`,
          zIndex: 3,
        }}
      >
        <PhoneFrame>
          <div style={{ position: 'absolute', inset: 0, background: C.bgGlow, padding: '64px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 20, fontWeight: 600 }}>
              <Avatar who="you" size={32} /> sinehan
            </div>
            <div style={{ borderRadius: 16, overflow: 'hidden', height: 170, position: 'relative' }}>
              <Film src="film-action.webp" frame={f} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '.08em', color: C.muted }}>REMOTE</div>
            <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: 14, borderRadius: 16, background: 'rgba(255,255,255,.05)' }}>
              <Icon d={I.back10} size={30} />
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: C.accent, color: C.accentInk, display: 'grid', placeItems: 'center' }}>
                <Icon d={I.pause} size={28} fill={C.accentInk} width={0} />
              </div>
              <Icon d={I.fwd10} size={30} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '.08em', color: C.muted }}>CHAT</div>
            <div style={{ padding: '10px 14px', borderRadius: '14px 14px 14px 4px', background: 'rgba(255,255,255,.07)', fontSize: 17, alignSelf: 'flex-start' }}>
              wait, pause, I need snacks
            </div>
            <div style={{ padding: '10px 14px', borderRadius: '14px 14px 4px 14px', background: C.accent, color: C.accentInk, fontSize: 17, alignSelf: 'flex-end' }}>
              paused 🍿
            </div>
          </div>
        </PhoneFrame>
      </div>
      <Caption text="Play, pause, skip, 3·2·1 and CR break, from the couch." from={24} />
    </Backdrop>
  );
};

