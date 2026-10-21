// 8-bit pixel art: a game title screen. Night sky with blinking pixel stars, scrolling pixel clouds, a
// brick ground, the photo pixelated in a sprite frame. Main action: the title drops in and "PRESS START"
// blinks. Motif loops: the question block pops out a coin on the beat; clouds scroll; stars blink in turn.
import React from 'react';
import { AbsoluteFill, Img, random, useCurrentFrame } from 'remotion';
import { pop } from '../../anim';
import { asset, beat } from './shared';

const SKY = '#1a1140';
const SKY2 = '#2b1d6b';
const BRICK = '#b5542b';
const BRICK2 = '#7a3418';
const GOLD = '#ffd23f';
const WHITE = '#f4f0ff';
const PIX = "'Press Start 2P', monospace";
const U = 12; // one "pixel"

const Cloud: React.FC<{ x: number; y: number; w: number }> = ({ x, y, w }) => (
  <div style={{ position: 'absolute', left: x, top: y }}>
    <div style={{ width: w, height: U * 3, background: WHITE }} />
    <div style={{ width: w - U * 4, height: U * 2, background: WHITE, marginLeft: U * 2, marginTop: -U * 5 }} />
    <div style={{ width: w - U * 8, height: U, background: WHITE, marginLeft: U * 4, marginTop: -U * 6 }} />
  </div>
);

const Block: React.FC<{ x: number; y: number; hit: boolean }> = ({ x, y, hit }) => (
  <div style={{ position: 'absolute', left: x, top: y - (hit ? U : 0), width: U * 6, height: U * 6, background: GOLD, boxShadow: `inset -${U}px -${U}px 0 #c78f12, inset ${U}px ${U}px 0 #ffe88a`, display: 'grid', placeItems: 'center', fontFamily: PIX, fontSize: 30, color: BRICK2 }}>
    ?
  </div>
);

export const PixelHello: React.FC = () => {
  const f = useCurrentFrame();
  const b = beat(f);
  const hit = b.index % 2 === 1 && b.t < 0.25; // the block bumps on every other beat
  const coin = b.index % 2 === 1 ? Math.min(1, b.t * 1.6) : 1;
  const title = pop(f, 18, { damping: 12, stiffness: 160, mass: 0.8 });
  const blink = Math.floor(f / 15) % 2 === 0;
  const photo = pop(f, 34, { damping: 14, stiffness: 160, mass: 0.8 });
  return (
    <AbsoluteFill style={{ background: `linear-gradient(${SKY}, ${SKY2})`, overflow: 'hidden', imageRendering: 'pixelated' }}>
      {/* stars blink in turn */}
      {Array.from({ length: 40 }, (_, i) => {
        const on = Math.floor((f + i * 7) / 20) % 3 !== 0;
        return <div key={i} style={{ position: 'absolute', left: random(`sx${i}`) * 1920, top: random(`sy${i}`) * 600, width: U, height: U, background: WHITE, opacity: on ? 0.9 : 0.25 }} />;
      })}
      {/* clouds scroll */}
      <Cloud x={((f * 1.2 + 200) % 2300) - 300} y={150} w={U * 16} />
      <Cloud x={((f * 0.8 + 1300) % 2300) - 300} y={300} w={U * 12} />
      {/* ground */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: U * 8, backgroundImage: `linear-gradient(${BRICK2} 2px, transparent 2px), linear-gradient(90deg, ${BRICK2} 2px, transparent 2px)`, backgroundSize: `${U * 4}px ${U * 2}px`, backgroundColor: BRICK }} />
      {/* question block and its coin, on the beat */}
      <Block x={1500} y={560} hit={hit} />
      {b.index % 2 === 1 && (
        <div style={{ position: 'absolute', left: 1500 + U * 2, top: 560 - U * 2 - coin * 120, width: U * 2, height: U * 3, background: GOLD, opacity: 1 - coin, transform: `scaleX(${Math.cos(coin * Math.PI * 2)})` }} />
      )}
      {/* sprite frame with the pixel photo */}
      <div style={{ position: 'absolute', left: 1180, top: 120, width: 300, height: 380, background: '#0d0a26', border: `${U}px solid ${WHITE}`, boxShadow: `${U}px ${U}px 0 #0d0a26`, transform: `scale(${photo})`, overflow: 'hidden' }}>
        <Img src={asset('grad-pixel.png')} style={{ width: '100%', height: '100%', objectFit: 'cover', imageRendering: 'pixelated' }} />
      </div>
      <div style={{ position: 'absolute', left: 1180, top: 520, fontFamily: PIX, fontSize: 18, color: GOLD, opacity: photo }}>PLAYER 1</div>
      {/* title */}
      <div style={{ position: 'absolute', left: 120, top: 150 + (1 - title) * -300, fontFamily: PIX, fontSize: 108, lineHeight: 1.25, color: WHITE, textShadow: `${U / 2}px ${U / 2}px 0 ${BRICK2}, ${U}px ${U}px 0 #000` }}>
        FRAN
        <br />
        <span style={{ color: GOLD }}>SUAN</span>
      </div>
      <div style={{ position: 'absolute', left: 124, top: 480, fontFamily: PIX, fontSize: 24, lineHeight: 1.8, color: WHITE, opacity: pop(f, 50) }}>
        DESIGNER / DEVELOPER
        <br />
        <span style={{ color: '#8ef0c4' }}>LV.25 · BS COMPUTER SCIENCE</span>
        <br />
        <span style={{ color: '#8ef0c4' }}>UP VISAYAS</span>
      </div>
      <div style={{ position: 'absolute', left: 124, top: 760, fontFamily: PIX, fontSize: 30, color: GOLD, opacity: f > 70 && blink ? 1 : 0 }}>▶ PRESS START</div>
      <div style={{ position: 'absolute', right: 120, top: 40, fontFamily: PIX, fontSize: 20, color: WHITE }}>SCORE 002025</div>
    </AbsoluteFill>
  );
};
