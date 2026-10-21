// Bauhaus: circle, triangle and square in red, yellow and blue on a warm grey ground, a strict grid, wide
// geometric capitals. Main action: the shapes slide along the grid into place. Motif loops: the red circle
// rolls back and forth along its rule; the stripe block scrolls.
import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame } from 'remotion';
import { glide, pop } from '../../anim';
import { asset, loop } from './shared';

const GROUND = '#e9e4da';
const RED = '#d8322a';
const YELLOW = '#f2c330';
const BLUE = '#24489c';
const INK = '#1b1b1b';
const G = 60; // grid unit

export const BauhausHello: React.FC = () => {
  const f = useCurrentFrame();
  const slideX = (at: number, from: number) => (1 - glide(f, at, 28)) * from;
  const roll = (loop(f, 180) - 0.5) * 2; // −1 → 1
  const circleX = 1340 + roll * 150;
  const photo = glide(f, 30, 30);
  const stripes = (f * 1.5) % (G / 2);
  return (
    <AbsoluteFill style={{ background: GROUND, overflow: 'hidden', fontFamily: "'Inter', sans-serif" }}>
      {/* grid */}
      <AbsoluteFill style={{ backgroundImage: `linear-gradient(${INK}14 1px, transparent 1px), linear-gradient(90deg, ${INK}14 1px, transparent 1px)`, backgroundSize: `${G}px ${G}px` }} />
      {/* rules */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 13 * G, height: 6, background: INK, transform: `scaleX(${glide(f, 4, 24)})`, transformOrigin: 'left' }} />
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: 17 * G, width: 6, background: INK, transform: `scaleY(${glide(f, 8, 24)})`, transformOrigin: 'top' }} />
      {/* yellow triangle */}
      <svg style={{ position: 'absolute', left: 2 * G, top: 2 * G, transform: `translateY(${slideX(10, -500)}px)` }} width={9 * G} height={9 * G}>
        <polygon points={`0,${9 * G} ${4.5 * G},0 ${9 * G},${9 * G}`} fill={YELLOW} />
      </svg>
      {/* blue square */}
      <div style={{ position: 'absolute', left: 19 * G, top: 15 * G, width: 5 * G, height: 5 * G, background: BLUE, transform: `translateX(${slideX(14, 600)}px) rotate(${(1 - glide(f, 14, 28)) * 90}deg)` }} />
      {/* stripe block, scrolling */}
      <div style={{ position: 'absolute', left: 25 * G, top: 15 * G, width: 5 * G, height: 5 * G, overflow: 'hidden', transform: `translateX(${slideX(18, 600)}px)` }}>
        <div style={{ position: 'absolute', inset: -G, backgroundImage: `repeating-linear-gradient(0deg, ${INK} 0 ${G / 6}px, transparent ${G / 6}px ${G / 2}px)`, transform: `translateY(${stripes}px)` }} />
      </div>
      {/* red circle rolling on the rule */}
      <div style={{ position: 'absolute', left: circleX, top: 13 * G - 6 * G, width: 6 * G, height: 6 * G, borderRadius: '50%', background: RED, transform: `scale(${pop(f, 20)}) rotate(${roll * 180}deg)`, transformOrigin: '50% 100%' }}>
        <div style={{ position: 'absolute', left: '50%', top: 10, width: 10, height: 10, borderRadius: '50%', background: GROUND, transform: 'translateX(-50%)' }} />
      </div>
      {/* photo in a circle, with a black diagonal bar through the composition */}
      <div style={{ position: 'absolute', left: 19 * G, top: 2 * G, width: 9 * G, height: 9 * G, borderRadius: '50%', overflow: 'hidden', transform: `scale(${photo})`, background: INK }}>
        <Img src={asset('grad.jpg')} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 12%', filter: 'grayscale(1) contrast(1.15)' }} />
      </div>
      <div style={{ position: 'absolute', left: 17 * G, top: -2 * G, width: 10, height: 1500, background: INK, transform: `rotate(35deg) scaleY(${glide(f, 24, 26)})`, transformOrigin: 'top', opacity: 0.9 }} />
      {/* type */}
      <div style={{ position: 'absolute', left: 2 * G, top: 14.2 * G, lineHeight: 1, display: 'flex', gap: 40 }}>
        {['FRAN', 'SUAN'].map((w, i) => {
          const p = glide(f, 30 + i * 8, 24);
          return (
            <div key={w} style={{ fontSize: 124, fontWeight: 900, letterSpacing: '0.12em', color: i ? RED : INK, transform: `translateX(${(1 - p) * -200}px)`, opacity: p }}>
              {w}
            </div>
          );
        })}
      </div>
      <div style={{ position: 'absolute', left: 2 * G, top: 11.2 * G, fontSize: 30, fontWeight: 600, letterSpacing: '0.3em', color: INK, opacity: glide(f, 50, 20) }}>
        DESIGNER · DEVELOPER
      </div>
      <div style={{ position: 'absolute', left: 19 * G, top: 11.7 * G, fontSize: 24, fontWeight: 500, letterSpacing: '0.2em', color: INK, opacity: glide(f, 58, 20) }}>
        BS COMPUTER SCIENCE · UP VISAYAS · 2025
      </div>
    </AbsoluteFill>
  );
};
