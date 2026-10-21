// Matisse cut-outs: paper shapes on a white ground, the photo cut into a torn silhouette, letters that sit
// unevenly like cut paper. Main action: the shapes glide in from the edges and settle. Motif loops: leaves
// drift and turn slowly; a line of beads hops along in sequence.
import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame } from 'remotion';
import { drift, glide, pop } from '../../anim';
import { asset, loop } from './shared';

export const BLUE = '#1f4fb0';
export const CORAL = '#f0603f';
export const YELLOW = '#f5c548';
export const GREEN = '#2e9d6f';
export const BLACK = '#1d1d1d';
export const PAPER = '#f9f6ee';

// Organic leaf/seaweed shapes as SVG paths, drawn in a 200×200 box.
export const LEAF = 'M100 8 C 140 30, 176 80, 168 130 C 160 178, 120 196, 100 192 C 80 196, 40 178, 32 130 C 24 80, 60 30, 100 8 Z';
export const FROND = 'M96 10 C 120 40, 110 70, 130 100 C 150 130, 130 160, 110 190 C 90 170, 70 150, 76 120 C 82 90, 60 60, 96 10 Z';
export const BLOB = 'M60 30 C 110 0, 190 30, 180 90 C 170 150, 120 200, 60 180 C 10 160, 0 100, 20 60 C 30 40, 45 36, 60 30 Z';
export const SILHOUETTE = 'polygon(18% 2%, 60% 0%, 86% 10%, 98% 34%, 94% 60%, 100% 82%, 84% 98%, 46% 100%, 14% 96%, 2% 76%, 6% 48%, 0% 22%)';

export const Shape: React.FC<{ d: string; fill: string; x: number; y: number; size: number; rot: number; at: number; from: 'left' | 'right' | 'top' | 'bottom'; phase?: number }> = ({
  d, fill, x, y, size, rot, at, from, phase = 0,
}) => {
  const f = useCurrentFrame();
  const p = glide(f, at, 30);
  const off = (1 - p) * 700;
  const dx = from === 'left' ? -off : from === 'right' ? off : 0;
  const dy = from === 'top' ? -off : from === 'bottom' ? off : 0;
  const sway = (loop(f, 170, phase) - 0.5) * 10; // leaves turn slowly
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      style={{ position: 'absolute', left: x, top: y, transform: `translate(${dx}px, ${dy + drift(f, 6, 150, phase)}px) rotate(${rot + sway}deg)`, overflow: 'visible' }}
    >
      <path d={d} fill={fill} />
    </svg>
  );
};

// Cut-paper letters: each sits at its own slight tilt and height.
export const CutWord: React.FC<{ text: string; at: number; size: number; color: string; x: number; y: number }> = ({ text, at, size, color, x, y }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ position: 'absolute', left: x, top: y, display: 'flex', fontFamily: "'Inter', sans-serif", fontWeight: 900, fontSize: size, letterSpacing: '-0.02em', color }}>
      {text.split('').map((ch, i) => {
        const p = pop(f, at + i * 3, { damping: 11, stiffness: 180, mass: 0.6 });
        const tilt = ((i * 37) % 11) - 5;
        const lift = ((i * 53) % 9) - 4;
        return (
          <span key={i} style={{ display: 'inline-block', transform: `translateY(${lift + (1 - p) * 60}px) rotate(${tilt}deg) scale(${p})`, opacity: Math.min(1, p * 3), marginRight: ch === ' ' ? '0.3em' : '0.01em' }}>
            {ch}
          </span>
        );
      })}
    </div>
  );
};

export const MatisseHello: React.FC = () => {
  const f = useCurrentFrame();
  const photo = glide(f, 26, 30);
  return (
    <AbsoluteFill style={{ background: PAPER, overflow: 'hidden' }}>
      {/* big ground shapes */}
      <Shape d={BLOB} fill={BLUE} x={-140} y={-160} size={760} rot={12} at={0} from="left" phase={0} />
      <Shape d={LEAF} fill={GREEN} x={1480} y={-90} size={520} rot={-30} at={6} from="top" phase={40} />
      <Shape d={FROND} fill={CORAL} x={1560} y={560} size={520} rot={20} at={10} from="right" phase={80} />
      <Shape d={LEAF} fill={YELLOW} x={520} y={760} size={340} rot={70} at={14} from="bottom" phase={120} />
      <Shape d={FROND} fill={BLUE} x={1120} y={820} size={300} rot={-100} at={18} from="bottom" phase={160} />
      {/* beads hop along in sequence */}
      {Array.from({ length: 9 }, (_, i) => {
        const hop = Math.max(0, Math.sin(((f - i * 5) / 24) * Math.PI)) * 22;
        return <div key={i} style={{ position: 'absolute', left: 120 + i * 54, top: 940 - hop, width: 26, height: 26, borderRadius: '50%', background: i % 3 === 0 ? CORAL : i % 3 === 1 ? BLUE : YELLOW, opacity: pop(f, 30 + i * 3) }} />;
      })}
      {/* the photo, cut into a torn silhouette */}
      <div style={{ position: 'absolute', left: 1150, top: 120, width: 560, height: 700, transform: `translateX(${(1 - photo) * 600}px) rotate(-4deg)`, clipPath: SILHOUETTE }}>
        <Img src={asset('grad-poster.jpg')} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 15%' }} />
      </div>
      {/* name and line */}
      <CutWord text="FRAN" at={30} size={230} color={BLACK} x={110} y={300} />
      <CutWord text="SUAN" at={42} size={230} color={CORAL} x={330} y={520} />
      <div style={{ position: 'absolute', left: 120, top: 790, fontFamily: "'Inter', sans-serif", fontSize: 40, fontWeight: 600, color: BLACK, opacity: glide(f, 64, 20), transform: `translateY(${(1 - glide(f, 64, 20)) * 20}px)` }}>
        designer / developer · BS Computer Science, UP Visayas
      </div>
      <div style={{ position: 'absolute', left: 124, top: 230, fontFamily: "'Inter', sans-serif", fontSize: 34, fontWeight: 500, color: BLUE, opacity: glide(f, 20, 14) }}>
        Hi, it's me :)
      </div>
    </AbsoluteFill>
  );
};
