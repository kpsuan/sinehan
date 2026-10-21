import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { C } from '../theme';
import { drift, fadeIn, glide, pop } from '../anim';
import { Bantay } from '../components/Bantay';
import { Avatar, Backdrop, BrowserWindow, Caption, Cursor, Film, Headline, I, Icon } from '../components/ui';

const W = 860;
const H = 530;
const LEFT = 80;
const RIGHT = 980;
const TOP = 330;
const DURATION = 2650;

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// A video player inside a browser window.
const Player: React.FC<{
  src: string;
  frame: number;
  time: number;
  paused: boolean;
  flashAt?: number;
  dim?: number;
  children?: React.ReactNode;
}> = ({ src, frame, time, paused, flashAt = -99, dim = 0, children }) => {
  const flash = frame - flashAt;
  const fs = flash >= 0 && flash < 30 ? pop(frame, flashAt) : 0;
  const fo = flash >= 0 ? interpolate(flash, [16, 30], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 0;
  return (
    <BrowserWindow width={W} height={H} url="youtube.com/watch">
      <Film src={src} frame={frame} />
      <AbsoluteFill style={{ background: '#000', opacity: dim }} />
      <AbsoluteFill style={{ background: 'linear-gradient(transparent 70%, rgba(0,0,0,.7))' }} />
      <div style={{ position: 'absolute', left: 22, right: 22, bottom: 18, display: 'flex', alignItems: 'center', gap: 14, color: '#fff' }}>
        <Icon d={paused ? I.play : I.pause} size={22} fill="#fff" width={0} />
        <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'rgba(255,255,255,.3)' }}>
          <div style={{ width: `${(time / DURATION) * 100}%`, height: '100%', borderRadius: 3, background: C.danger, position: 'relative' }}>
            <div style={{ position: 'absolute', right: -7, top: -5, width: 15, height: 15, borderRadius: '50%', background: C.danger }} />
          </div>
        </div>
        <div style={{ fontSize: 17, fontVariantNumeric: 'tabular-nums' }}>
          {clock(time)} / {clock(DURATION)}
        </div>
      </div>
      {fs > 0 && (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div
            style={{
              width: 120,
              height: 120,
              borderRadius: '50%',
              background: 'rgba(0,0,0,.55)',
              display: 'grid',
              placeItems: 'center',
              transform: `scale(${fs})`,
              opacity: fo,
            }}
          >
            <Icon d={paused ? I.pause : I.play} size={54} fill="#fff" width={0} />
          </div>
        </AbsoluteFill>
      )}
      {children}
    </BrowserWindow>
  );
};

const Label: React.FC<{ who: 'you' | 'them'; text: string; x: number; frame: number; delay: number }> = ({ who, text, x, frame, delay }) => (
  <div
    style={{
      position: 'absolute',
      left: x,
      top: TOP - 62,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      fontSize: 24,
      color: C.muted,
      opacity: fadeIn(frame, delay, 14),
    }}
  >
    <Avatar who={who} size={38} ring={C.bg} />
    {text}
  </div>
);

const Windows: React.FC<{ frame: number; left: React.ReactNode; right: React.ReactNode; rise?: boolean }> = ({ frame, left, right, rise }) => {
  const a = rise ? glide(frame, 4, 30) : 1;
  const b = rise ? glide(frame, 10, 30) : 1;
  return (
    <>
      <Label who="you" text="Kismet, at home" x={LEFT} frame={frame} delay={rise ? 20 : 0} />
      <Label who="them" text="Jessa, 300 km away" x={RIGHT} frame={frame} delay={rise ? 26 : 0} />
      <div style={{ position: 'absolute', left: LEFT, top: TOP, transform: `translateY(${(1 - a) * 600 + drift(frame, 4, 200)}px)` }}>{left}</div>
      <div style={{ position: 'absolute', left: RIGHT, top: TOP, transform: `translateY(${(1 - b) * 600 + drift(frame, 4, 200, 60)}px)` }}>{right}</div>
    </>
  );
};

// Kismet's playback: plays, pauses at 80, skips at 175, plays again at 215.
const timeline = (f: number) => {
  const start = 740;
  if (f < 80) return { time: start + Math.max(0, f) / 30, paused: false };
  if (f < 175) return { time: start + 80 / 30, paused: true };
  if (f < 215) return { time: 1450, paused: true };
  return { time: 1450 + (f - 215) / 30, paused: false };
};

// ---- Sync ----
export const Sync: React.FC = () => {
  const f = useCurrentFrame();
  const me = timeline(f);
  const them = timeline(f - 8);
  const dragging = f >= 140 && f < 175;
  const dragTime = interpolate(f, [140, 172], [me.time, 1450], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const shownMe = dragging ? dragTime : me.time;
  const barX = (t: number) => LEFT + 22 + 36 + ((W - 44 - 36 - 150) * t) / DURATION;
  const toast = pop(f, 186);
  return (
    <Backdrop>
      <div style={{ position: 'absolute', top: 80, width: '100%' }}>
        <Headline lines={['Press play together.']} align="center" size={76} delay={0} />
      </div>
      <Windows
        frame={f}
        rise
        left={<Player src="film-sintel.webp" frame={f} time={shownMe} paused={me.paused} flashAt={[80, 215].filter((x) => f >= x).pop()} />}
        right={
          <Player src="film-sintel.webp" frame={f} time={them.time} paused={them.paused} flashAt={[88, 223].filter((x) => f >= x).pop()}>
            {f > 186 && f < 250 && (
              <div
                style={{
                  position: 'absolute',
                  top: 24,
                  left: '50%',
                  transform: `translateX(-50%) scale(${toast})`,
                  padding: '10px 18px',
                  borderRadius: 10,
                  background: 'rgba(20,16,27,.85)',
                  color: C.text,
                  fontSize: 20,
                  whiteSpace: 'nowrap',
                  opacity: interpolate(f, [236, 250], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
                }}
              >
                Kismet skipped to 24:10
              </div>
            )}
          </Player>
        }
      />
      <Cursor
        label="You"
        appear={36}
        path={[
          [36, 700, 1000],
          [72, 520, 580],
          [120, 520, 580],
          [138, barX(742), TOP + 50 + H - 50 - 30],
          [172, barX(1450), TOP + 50 + H - 50 - 30],
          [200, 520, 580],
          [260, 560, 640],
        ]}
        clicks={[80, 140, 215]}
      />
      <Caption text="Play, pause or skip on either side, and the other follows." from={30} />
    </Backdrop>
  );
};

// ---- Holds and 3·2·1 ----
export const Holds: React.FC = () => {
  const f = useCurrentFrame();
  const adOn = f < 140;
  const hold = pop(f, 24);
  const holdOut = interpolate(f, [136, 148], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const playing = f >= 222;
  const t = 1460 + (playing ? (f - 222) / 30 : 0);
  const adLeft = Math.max(0, 15 - Math.floor(f / 9));
  const count = [
    { at: 150, text: '3' },
    { at: 174, text: '2' },
    { at: 198, text: '1' },
  ];
  return (
    <Backdrop>
      <div style={{ position: 'absolute', top: 80, width: '100%' }}>
        <Headline lines={['Wait for each other.']} align="center" size={76} />
      </div>
      <Windows
        frame={f}
        left={
          <Player src="film-action.webp" frame={f} time={t} paused={!playing} dim={adOn ? 0.45 * hold * holdOut : 0} flashAt={playing ? 222 : undefined}>
            {f < 150 && (
              <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: '12px 22px 12px 12px',
                    borderRadius: 16,
                    background: 'rgba(20,16,27,.9)',
                    fontSize: 22,
                    transform: `scale(${hold * holdOut})`,
                  }}
                >
                  <Bantay pose="guard" size={64} />
                  <div>
                    <b>Jessa is watching an ad.</b>
                    <div style={{ color: C.muted, fontSize: 18 }}>Paused until it's over.</div>
                  </div>
                </div>
              </AbsoluteFill>
            )}
          </Player>
        }
        right={
          <Player src="film-action.webp" frame={f} time={t} paused={!playing} flashAt={playing ? 224 : undefined}>
            {adOn && (
              <AbsoluteFill
                style={{
                  background: 'linear-gradient(135deg, #f2994a, #f2c94c 60%, #ffe8a3)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#4a2a0a',
                  opacity: interpolate(f, [128, 140], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
                }}
              >
                <div style={{ fontSize: 58, fontWeight: 800, letterSpacing: '-0.03em' }}>☕ Morning Brew</div>
                <div style={{ fontSize: 24, marginTop: 6 }}>Coffee that waits for you.</div>
                <div
                  style={{
                    position: 'absolute',
                    left: 22,
                    bottom: 56,
                    padding: '6px 12px',
                    borderRadius: 6,
                    background: 'rgba(0,0,0,.65)',
                    color: '#f2c94c',
                    fontSize: 18,
                    fontWeight: 600,
                  }}
                >
                  Ad · 0:{String(adLeft).padStart(2, '0')}
                </div>
              </AbsoluteFill>
            )}
          </Player>
        }
      />
      {count.map(({ at, text }) => {
        if (f < at || f > at + 26) return null;
        const s = pop(f, at, { damping: 7, stiffness: 180, mass: 0.6 });
        const o = interpolate(f, [at + 16, at + 26], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        return (
          <AbsoluteFill key={text} style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 140 }}>
            <div
              style={{
                width: 260,
                height: 260,
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                background: C.accent,
                color: C.accentInk,
                fontSize: 170,
                fontWeight: 800,
                boxShadow: '0 30px 90px rgba(201,182,242,.45)',
                transform: `scale(${s})`,
                opacity: o,
              }}
            >
              {text}
            </div>
          </AbsoluteFill>
        );
      })}
      <Caption text="An ad or slow Wi-Fi pauses you both." from={12} to={150} />
      {f >= 150 && <Caption text="Then a 3·2·1 starts you at the same moment." from={156} />}
    </Backdrop>
  );
};
