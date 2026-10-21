import React from 'react';
import { AbsoluteFill, Img, interpolateColors, staticFile, useCurrentFrame } from 'remotion';
import { C, DARK, LIGHT, Palette } from '../theme';
import { drift, ease, fadeIn, glide, pop, press } from '../anim';
import { Bantay } from '../components/Bantay';
import { Backdrop, Caption, Confetti, Cursor, Headline, I, Icon } from '../components/ui';
import { Sidebar, Line } from '../components/Sidebar';
import { WatchScreen } from './Together';

// ---- Watch guides ----
const EPISODES = [
  { ep: 'S2 E6 · The Lighthouse', stats: '34 mentions · 5.1k upvotes', quote: 'Perfect television. No notes.' },
  { ep: 'S1 E9 · Low Tide', stats: '21 mentions · 2.8k upvotes', quote: 'That finale had our group chat screaming.' },
  { ep: 'S3 E4 · The Market', stats: '12 mentions · 1.4k upvotes', quote: 'Underrated. The one-take scene…' },
];

export const Guides: React.FC = () => {
  const f = useCurrentFrame();
  const panel = glide(f, 0, 30);
  const query = 'The Lighthouse Keepers';
  const typed = query.slice(0, Math.max(0, Math.floor((f - 14) / 1.4)));
  const askAt = 58;
  const tickAt = 176;
  const X = 980;
  const Y = 170;
  const rowY = (i: number) => Y + 214 + i * 134;
  return (
    <Backdrop>
      <div style={{ position: 'absolute', left: 120, top: 380, width: 720 }}>
        <Headline lines={['Know what', 'to watch.']} sub="Ask Reddit for a show's best episodes, or build a watch guide for one story or a whole saga." size={84} />
      </div>
      <div
        style={{
          position: 'absolute',
          left: X,
          top: Y,
          width: 820,
          padding: 28,
          borderRadius: 24,
          background: C.card,
          border: `1px solid ${C.edge}`,
          boxShadow: '0 40px 120px rgba(0,0,0,.5)',
          transform: `translateY(${(1 - panel) * 800 + drift(f, 5, 220)}px)`,
        }}
      >
        <div style={{ display: 'flex', gap: 8, padding: 5, borderRadius: 12, background: C.btn, width: 'fit-content' }}>
          <div style={{ padding: '10px 20px', borderRadius: 9, background: 'rgba(201,182,242,.16)', fontSize: 20, fontWeight: 600 }}>Best episodes</div>
          <div style={{ padding: '10px 20px', fontSize: 20, color: C.muted }}>Watch guide</div>
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <div style={{ flex: 1, padding: '16px 18px', borderRadius: 12, background: 'rgba(255,255,255,.045)', border: `1px solid ${C.edge}`, fontSize: 22 }}>
            {typed}
            <span style={{ opacity: f < askAt && Math.floor(f / 8) % 2 ? 1 : 0, color: C.accent }}>|</span>
          </div>
          <div
            style={{
              padding: '16px 24px',
              borderRadius: 12,
              background: C.accent,
              color: C.accentInk,
              fontSize: 22,
              fontWeight: 700,
              transform: `scale(${press(f, askAt)})`,
            }}
          >
            Ask Reddit
          </div>
        </div>
        <div style={{ position: 'relative', height: 400, marginTop: 20 }}>
          {EPISODES.map((e, i) => {
            const fillAt = 104 + i * 12;
            const filled = f >= fillAt;
            const s = pop(f, fillAt);
            const ticked = i === 0 && f >= tickAt + 2;
            const tick = pop(f, tickAt + 2, { damping: 7, stiffness: 200, mass: 0.5 });
            const shimmer = 0.35 + 0.25 * Math.sin((f + i * 8) / 5);
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: i * 134,
                  height: 118,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 18,
                  padding: '0 18px',
                  borderRadius: 16,
                  background: 'rgba(255,255,255,.04)',
                  opacity: fadeIn(f, askAt + 6 + i * 4, 8),
                }}
              >
                {filled ? (
                  <>
                    <div
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: 14,
                        display: 'grid',
                        placeItems: 'center',
                        background: i === 0 ? C.accent : 'rgba(255,255,255,.08)',
                        color: i === 0 ? C.accentInk : C.text,
                        fontSize: 24,
                        fontWeight: 800,
                        transform: `scale(${s})`,
                      }}
                    >
                      {i + 1}
                    </div>
                    <div style={{ flex: 1, opacity: Math.min(1, s * 1.5), transform: `translateX(${(1 - s) * 30}px)` }}>
                      <div style={{ fontSize: 23, fontWeight: 600 }}>{e.ep}</div>
                      <div style={{ fontSize: 17, color: C.muted, marginTop: 2 }}>{e.stats}</div>
                      <div style={{ fontSize: 18, color: '#cfc6dc', marginTop: 4, fontStyle: 'italic' }}>"{e.quote}"</div>
                    </div>
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        border: ticked ? 'none' : `2px solid ${C.faint}`,
                        background: ticked ? C.live : 'transparent',
                        display: 'grid',
                        placeItems: 'center',
                        color: '#10301c',
                        transform: ticked ? `scale(${tick})` : undefined,
                      }}
                    >
                      {ticked && <Icon d={I.check} size={24} width={3} />}
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ width: 52, height: 52, borderRadius: 14, background: `rgba(255,255,255,${shimmer * 0.2})` }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ width: '55%', height: 18, borderRadius: 6, background: `rgba(255,255,255,${shimmer * 0.2})` }} />
                      <div style={{ width: '35%', height: 14, borderRadius: 6, marginTop: 12, background: `rgba(255,255,255,${shimmer * 0.15})` }} />
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            marginTop: 4,
            padding: '10px 16px',
            borderRadius: 12,
            background: 'rgba(159,214,176,.12)',
            color: C.live,
            fontSize: 19,
            transform: `scale(${pop(f, 200)})`,
            transformOrigin: '0 50%',
          }}
        >
          <Icon d={I.check} size={20} /> Shared in chat: S2 E6
        </div>
      </div>
      <Confetti x={X + 820 - 28 - 18 - 20} y={rowY(0) + 59} at={tickAt + 2} count={34} spread={0.45} seed="tick" />
      <Cursor
        label="You"
        appear={30}
        path={[
          [30, 1700, 900],
          [52, X + 700, Y + 135],
          [80, X + 700, Y + 135],
          [168, X + 820 - 28 - 18 - 20, rowY(0) + 59],
          [230, X + 600, rowY(1) + 80],
        ]}
        clicks={[askAt, tickAt]}
      />
      <Caption text="Save a guide and it's on their side too, ticks and all." from={18} />
    </Backdrop>
  );
};

// ---- Appearance ----
const mix = (t: number): Palette =>
  Object.fromEntries(Object.keys(DARK).map((k) => [k, interpolateColors(t, [0, 1], [DARK[k as keyof Palette], LIGHT[k as keyof Palette]])])) as Palette;

const COATS = ['white', 'cream', 'tan', 'black'];

const LINES: Line[] = [
  { kind: 'sys', text: 'Jessa joined', at: 0 },
  { kind: 'msg', who: 'them', text: 'okay the dragon scene is coming up', time: '12:11', at: 0 },
  { kind: 'msg', who: 'you', text: "I'm not ready", time: '12:18', at: 0 },
  { kind: 'emoji', who: 'them', text: '😂😂', time: '12:24', at: 0 },
];

export const Appearance: React.FC = () => {
  const f = useCurrentFrame();
  const flipAt = 66;
  const t = glide(f, flipAt + 2, 24);
  const knob = pop(f, flipAt + 2, { damping: 11, stiffness: 180, mass: 0.6 });
  const p = mix(t);
  const coatAt = 120;
  const coatIdx = Math.min(3, Math.max(0, Math.floor((f - coatAt) / 18)));
  const side = glide(f, 0, 30);
  return (
    <Backdrop light={t}>
      <div style={{ position: 'absolute', left: 120, top: 200, width: 720 }}>
        <Headline
          lines={['Make it yours.']}
          sub="Glass, dark or light. And pick Bantay's coat."
          size={84}
          color={interpolateColors(t, [0, 1], [C.text, LIGHT.text])}
          subColor={interpolateColors(t, [0, 1], ['#b9b0c8', '#5b5b66'])}
        />
      </div>
      <div style={{ position: 'absolute', left: 120, top: 470, display: 'flex', alignItems: 'center', gap: 24 }}>
        <div style={{ color: interpolateColors(t, [0, 1], [C.text, LIGHT.faint]) }}>
          <Icon d={I.moon} size={44} />
        </div>
        <div
          style={{
            width: 170,
            height: 88,
            borderRadius: 44,
            padding: 8,
            background: interpolateColors(t, [0, 1], ['#2a2236', '#6c4ef5']),
            transform: `scale(${press(f, flipAt)})`,
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              background: '#fff',
              boxShadow: '0 4px 14px rgba(0,0,0,.3)',
              transform: `translateX(${knob * 82}px)`,
            }}
          />
        </div>
        <div style={{ color: interpolateColors(t, [0, 1], [C.faint, '#f2a93b']) }}>
          <Icon d={I.sun} size={44} />
        </div>
      </div>
      <div style={{ position: 'absolute', left: 120, top: 640, display: 'flex', gap: 20 }}>
        {COATS.map((coat, i) => {
          const on = f >= coatAt && coatIdx === i;
          const s = pop(f, coatAt + i * 18);
          return (
            <div
              key={coat}
              style={{
                width: 150,
                padding: '14px 0 10px',
                borderRadius: 18,
                background: interpolateColors(t, [0, 1], ['#16121c', '#ffffff']),
                boxShadow: on ? `0 0 0 3px ${p.accent}` : '0 6px 20px rgba(0,0,0,.12)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                transform: `scale(${on ? 1 + 0.08 * s : 1})`,
                color: p.muted,
                fontSize: 20,
                opacity: fadeIn(f, 90 + i * 4, 10),
              }}
            >
              <Bantay pose="sit" coat={coat} size={100} />
              {coat[0].toUpperCase() + coat.slice(1)}
            </div>
          );
        })}
      </div>
      <div
        style={{
          position: 'absolute',
          left: 1180,
          top: 70,
          transform: `translateY(${(1 - side) * 900 + drift(f, 6, 220)}px) scale(1.55)`,
          transformOrigin: '0 0',
          borderRadius: 18,
          boxShadow: interpolateColors(t, [0, 1], ['rgba(0,0,0,0.5)', 'rgba(20,20,40,0.12)']) + ' 0 40px 100px',
        }}
      >
        <Sidebar p={p} lines={LINES} chatHeight={300} />
      </div>
      <Cursor
        label="You"
        appear={30}
        path={[
          [30, 600, 900],
          [60, 310, 525],
          [100, 310, 525],
          [130, 300 + 170 * 3, 760],
          [200, 300 + 170 * 3, 760],
        ]}
        clicks={[flipAt]}
      />
      <Caption text="Glass, dark or light. Bantay comes in four coats." from={20} />
    </Backdrop>
  );
};

// ---- Privacy ----
export const Privacy: React.FC = () => {
  const f = useCurrentFrame();
  const b = pop(f, 4, { damping: 9, stiffness: 140, mass: 0.7 });
  const cards = [
    { d: I.user, title: 'No accounts', sub: 'Just a name and a link.' },
    { d: I.lock, title: 'Chats stay with you', sub: 'Saved on your devices, never on a server.' },
    { d: I.video, title: 'Calls go direct', sub: 'Peer to peer, browser to browser.' },
  ];
  return (
    <Backdrop>
      <AbsoluteFill style={{ alignItems: 'center' }}>
        <div style={{ marginTop: 90, transform: `scale(${b})`, transformOrigin: '50% 100%' }}>
          <Bantay pose="guard" size={230} />
        </div>
        <div style={{ marginTop: 10 }}>
          <Headline lines={['Bantay keeps watch.']} align="center" size={84} delay={10} />
        </div>
        <div style={{ marginTop: 26, fontSize: 30, color: '#b9b0c8', opacity: fadeIn(f, 26, 14) }}>
          Bantay means "keep watch". Your party stays just for the two of you.
        </div>
        <div style={{ display: 'flex', gap: 30, marginTop: 70 }}>
          {cards.map((c, i) => {
            const s = pop(f, 40 + i * 10);
            return (
              <div
                key={c.title}
                style={{
                  width: 440,
                  padding: '30px 32px',
                  borderRadius: 22,
                  background: C.card,
                  border: `1px solid ${C.edge}`,
                  transform: `translateY(${(1 - s) * 80 + drift(f, 5, 160, i * 50)}px) scale(${0.6 + 0.4 * s})`,
                  opacity: Math.min(1, s * 1.5),
                }}
              >
                <div style={{ width: 60, height: 60, borderRadius: 16, display: 'grid', placeItems: 'center', background: 'rgba(201,182,242,.12)', color: C.accent }}>
                  <Icon d={c.d} size={30} />
                </div>
                <div style={{ fontSize: 30, fontWeight: 700, marginTop: 18 }}>{c.title}</div>
                <div style={{ fontSize: 22, color: C.muted, marginTop: 6 }}>{c.sub}</div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </Backdrop>
  );
};

// ---- Outro ----
const FULL: Line[] = [
  { kind: 'sys', text: 'Jessa joined', at: 0 },
  { kind: 'msg', who: 'them', text: 'okay the dragon scene is coming up', time: '12:11', at: 0 },
  { kind: 'msg', who: 'you', text: "I'm not ready", time: '12:18', at: 0 },
  { kind: 'msg', who: 'you', text: 'snacks first', time: '12:22', at: 0 },
  { kind: 'emoji', who: 'them', text: '😂😂', time: '12:24', at: 0 },
  { kind: 'sys', text: 'Jessa pressed play at 13:10', at: 0 },
];

export const Outro: React.FC = () => {
  const f = useCurrentFrame();
  const mockOut = ease(f, [96, 124], [0, 1]);
  const words = ['Same show.', 'Same second.', 'From two places.'];
  const end = 120;
  const dog = pop(f, end + 4, { damping: 8, stiffness: 120, mass: 0.7 });
  const logo = pop(f, end + 14);
  const btnAt = end + 40;
  const btn = pop(f, btnAt, { damping: 8, stiffness: 160, mass: 0.6 });
  return (
    <Backdrop>
      {mockOut < 1 && (
        <AbsoluteFill style={{ perspective: 2200, opacity: 1 - mockOut, filter: `blur(${mockOut * 16}px)` }}>
          <div
            style={{
              position: 'absolute',
              left: 660 - f * 0.9,
              top: 150 + drift(f, 10, 200),
              transform: `rotateY(-20deg) rotateX(8deg) rotateZ(1deg) scale(${1 + f / 900})`,
              transformOrigin: '0 50%',
            }}
          >
            <WatchScreen frame={f + 300} lines={FULL} />
          </div>
          <div style={{ position: 'absolute', left: 120, top: 330 }}>
            {words.map((w, i) => {
              const s = glide(f, 6 + i * 16, 22);
              return (
                <div
                  key={w}
                  style={{
                    fontSize: 104,
                    fontWeight: 700,
                    letterSpacing: '-0.04em',
                    lineHeight: 1.1,
                    opacity: s,
                    transform: `translateY(${(1 - s) * 50}px)`,
                    color: i === 2 ? C.accent : C.text,
                    textShadow: '0 6px 40px rgba(0,0,0,.6)',
                  }}
                >
                  {w}
                </div>
              );
            })}
          </div>
        </AbsoluteFill>
      )}
      {f >= end && (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 40, marginTop: -80 }}>
            <div style={{ transform: `scale(${dog})`, transformOrigin: '50% 100%' }}>
              <Bantay pose="happy" size={260} />
            </div>
            <div style={{ paddingBottom: 30 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, transform: `scale(${logo})`, transformOrigin: '0 50%' }}>
                <Img src={staticFile('logo.png')} style={{ width: 96, height: 96 }} />
                <div style={{ fontSize: 140, fontWeight: 700, letterSpacing: '-0.045em', lineHeight: 1 }}>sinehan</div>
              </div>
              <div style={{ fontSize: 40, color: C.accent, marginTop: 12, opacity: fadeIn(f, end + 24, 14) }}>a movie theater for two.</div>
            </div>
          </div>
          <div
            style={{
              marginTop: 60,
              padding: '24px 46px',
              borderRadius: 18,
              background: C.accent,
              color: C.accentInk,
              fontSize: 34,
              fontWeight: 700,
              transform: `scale(${btn})`,
              boxShadow: '0 20px 60px rgba(201,182,242,.35)',
            }}
          >
            Download for Chrome
          </div>
          <div style={{ marginTop: 26, fontSize: 28, color: C.muted, opacity: fadeIn(f, btnAt + 10, 14) }}>
            sinehan.live · Free · Works in Chrome and Edge
          </div>
        </AbsoluteFill>
      )}
      <Confetti x={960} y={720} at={btnAt + 4} count={110} seed="end" />
    </Backdrop>
  );
};
