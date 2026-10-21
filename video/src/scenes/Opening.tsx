import React from 'react';
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { C, DARK } from '../theme';
import { drift, fadeIn, glide, pop, press } from '../anim';
import { Bantay } from '../components/Bantay';
import { Avatar, Backdrop, Caption, Confetti, Cursor, Headline, Brand, I, Icon } from '../components/ui';
import { Card, Header } from '../components/Sidebar';

// ---- Intro ----
// Bantay pops in, the wordmark bounces in letter by letter.
export const Intro: React.FC = () => {
  const f = useCurrentFrame();
  const b = pop(f, 6, { damping: 8, stiffness: 120, mass: 0.7 });
  const hop = f > 62 && f < 86 ? Math.sin(((f - 62) / 24) * Math.PI) * 26 : 0;
  const squash = f > 84 && f < 92 ? 1 - Math.sin(((f - 84) / 8) * Math.PI) * 0.08 : 1;
  const word = 'sinehan';
  const logo = pop(f, 30);
  return (
    <Backdrop>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            transform: `translateY(${-90 - hop}px) scale(${b}, ${b * squash})`,
            transformOrigin: '50% 100%',
          }}
        >
          <Bantay pose={f > 70 ? 'happy' : 'sit'} size={300} />
        </div>
        <div style={{ position: 'absolute', top: 640, display: 'flex', alignItems: 'center', gap: 22 }}>
          <Img
            src={staticFile('logo.png')}
            style={{ width: 92, height: 92, transform: `scale(${logo}) rotate(${(1 - logo) * -180}deg)` }}
          />
          <div style={{ display: 'flex', fontSize: 132, fontWeight: 700, letterSpacing: '-0.045em' }}>
            {word.split('').map((ch, i) => {
              const s = pop(f, 34 + i * 3);
              return (
                <span key={i} style={{ display: 'inline-block', transform: `translateY(${(1 - s) * 60}px) scale(${s})`, opacity: Math.min(1, s * 2) }}>
                  {ch}
                </span>
              );
            })}
          </div>
        </div>
        <div style={{ position: 'absolute', top: 820, fontSize: 40, color: C.accent, fontWeight: 500, opacity: fadeIn(f, 66, 16) }}>
          a movie theater for two.
        </div>
      </AbsoluteFill>
    </Backdrop>
  );
};

// ---- Start a party ----
export const StartParty: React.FC = () => {
  const f = useCurrentFrame();
  const up = glide(f, 4, 34);
  const clickAt = 112;
  const copied = f >= clickAt + 10;
  const linkPop = pop(f, clickAt + 10);
  const flyP = glide(f, clickAt + 30, 40);
  return (
    <Backdrop>
      <div style={{ position: 'absolute', left: 150, top: 330 }}>
        <Brand />
        <div style={{ height: 30 }} />
        <Headline lines={['No accounts.', 'Just a link.']} sub="Pick a name, start a party, send the link." delay={6} />
      </div>
      <div
        style={{
          position: 'absolute',
          left: 1080,
          top: 70,
          transform: `translateY(${(1 - up) * 700 + drift(f, 6)}px) scale(1.55)`,
          transformOrigin: '0 0',
        }}
      >
        <div style={{ width: 380, display: 'flex', flexDirection: 'column', gap: 8, padding: 8, background: C.bg, borderRadius: 14, border: `1px solid ${C.edge}`, boxShadow: '0 40px 100px rgba(0,0,0,.5)' }}>
          <Header p={DARK} together={false} linkCopied={copied} linkScale={copied ? 0.7 + 0.3 * linkPop : 1} />
          <Card style={{ padding: '18px 16px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Bantay pose="sit" size={120} />
            <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.04em', marginTop: 4 }}>Sinehan</div>
            <div style={{ fontSize: 12.5, color: C.muted, textAlign: 'center', marginTop: 6, lineHeight: 1.45 }}>
              A movie theater for two. Same show, same second, from two places.
            </div>
            <div style={{ alignSelf: 'stretch', marginTop: 16, fontSize: 10.5, fontWeight: 600, letterSpacing: '.08em', color: C.muted }}>YOU</div>
            <div style={{ alignSelf: 'stretch', display: 'flex', gap: 10, alignItems: 'center', marginTop: 8 }}>
              <Avatar who="you" size={34} />
              <div style={{ flex: 1, padding: '8px 10px', borderRadius: 7, background: 'rgba(255,255,255,.045)', border: `1px solid ${C.edge}`, fontSize: 13 }}>
                Kismet
              </div>
            </div>
            <div style={{ alignSelf: 'stretch', marginTop: 16, fontSize: 10.5, fontWeight: 600, letterSpacing: '.08em', color: C.muted }}>
              START WATCHING
            </div>
            <div
              style={{
                alignSelf: 'stretch',
                marginTop: 8,
                padding: '11px 0',
                borderRadius: 8,
                background: C.accent,
                color: C.accentInk,
                fontWeight: 600,
                fontSize: 14,
                textAlign: 'center',
                transform: `scale(${press(f, clickAt)})`,
              }}
            >
              Start a party
            </div>
          </Card>
        </div>
        {copied && (
          <div
            style={{
              position: 'absolute',
              right: 50,
              top: 54,
              padding: '3px 8px',
              borderRadius: 6,
              background: '#1d1825',
              border: `1px solid ${C.edge}`,
              fontSize: 11,
              transform: `scale(${linkPop})`,
              opacity: 1 - flyP,
            }}
          >
            Copied
          </div>
        )}
      </div>
      {copied && (
        <div
          style={{
            position: 'absolute',
            left: interpolate(flyP, [0, 1], [1150, 700]),
            top: interpolate(flyP, [0, 1], [150, 760]),
            transform: `scale(${linkPop}) rotate(${interpolate(flyP, [0, 1], [8, -3])}deg)`,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '16px 22px',
            borderRadius: 16,
            background: '#221b2c',
            border: `1px solid rgba(201,182,242,.35)`,
            boxShadow: '0 20px 60px rgba(0,0,0,.5)',
            color: C.accent,
            fontSize: 26,
            fontWeight: 500,
          }}
        >
          <Icon d={I.link} size={26} />
          sinehan.live/join#k7Qm2xR9aT4vLp8nWc3e
        </div>
      )}
      <Cursor
        label="You"
        appear={40}
        path={[
          [40, 1500, 900],
          [100, 1350, 735],
          [150, 1350, 735],
          [190, 1400, 960],
        ]}
        clicks={[clickAt]}
      />
      <Caption text="Start a party. The invite link is already copied." from={20} />
    </Backdrop>
  );
};

// ---- Join from the invite ----
export const Join: React.FC = () => {
  const f = useCurrentFrame();
  const card = pop(f, 6, { damping: 12, stiffness: 120, mass: 0.8 });
  const clickAt = 92;
  const joined = glide(f, clickAt + 26, 24);
  return (
    <Backdrop>
      <AbsoluteFill>
        <Img
          src={staticFile('film-laundromat.webp')}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: 'blur(28px) brightness(.35) saturate(1.2)',
            transform: `scale(${1.15 + f / 2000})`,
          }}
        />
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            width: 640,
            padding: 40,
            borderRadius: 28,
            background: 'rgba(20,16,27,.82)',
            border: `1px solid ${C.edge}`,
            boxShadow: '0 40px 120px rgba(0,0,0,.55)',
            transform: `translateY(${-40 * joined + drift(f, 5)}px) scale(${card})`,
            textAlign: 'center',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, fontSize: 24, color: C.muted }}>
            <Avatar who="you" size={44} /> <span><b style={{ color: C.text }}>Kismet</b> invited you to watch</span>
          </div>
          <div style={{ marginTop: 26, borderRadius: 16, overflow: 'hidden', height: 300, position: 'relative' }}>
            <Img src={staticFile('film-laundromat.webp')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <div style={{ marginTop: 22, fontSize: 38, fontWeight: 700, letterSpacing: '-0.03em' }}>Cosmos Laundromat</div>
          <div style={{ fontSize: 20, color: C.muted, marginTop: 4 }}>youtube.com</div>
          <div
            style={{
              marginTop: 26,
              padding: '18px 0',
              borderRadius: 14,
              background: C.accent,
              color: C.accentInk,
              fontSize: 24,
              fontWeight: 700,
              transform: `scale(${press(f, clickAt)})`,
            }}
          >
            Join the party
          </div>
        </div>
      </AbsoluteFill>
      {f > clickAt + 20 && (
        <div
          style={{
            position: 'absolute',
            left: 960 - 230,
            top: -120 + 170 * joined,
            width: 460,
            opacity: joined,
            transform: 'scale(1.25)',
          }}
        >
          <Header p={DARK} together />
        </div>
      )}
      <Confetti x={960} y={830} at={clickAt + 2} seed="join" />
      <Cursor
        label="Jessa"
        color={C.live}
        appear={30}
        path={[
          [30, 1400, 1000],
          [84, 1010, 845],
          [130, 1010, 845],
          [170, 1250, 1000],
        ]}
        clicks={[clickAt]}
      />
      <Caption text="They land on the same show, at the same spot." from={14} to={110} />
      {f > 110 && <Caption text="No sign-up. They're in." from={120} />}
    </Backdrop>
  );
};
