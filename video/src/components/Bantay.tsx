import React from 'react';
import { useCurrentFrame } from 'remotion';
import { FPS } from '../anim';
import '../../../extension/bantay.js';

type BantayApi = { svg: (pose: string, opts?: { coat?: string }) => string };
const api = (globalThis as unknown as { Bantay: BantayApi }).Bantay;

// Bantay's own CSS animations (tail wag, blink, ear twitch) run on the wall clock; pin them to the
// video's frame so every render is identical.
const PIN = '.bz *{animation-play-state:paused!important;animation-delay:var(--bd)!important}';

export const Bantay: React.FC<{
  pose?: string;
  coat?: string;
  size: number;
  style?: React.CSSProperties;
}> = ({ pose = 'sit', coat, size, style }) => {
  const frame = useCurrentFrame();
  const markup = api.svg(pose, { coat }).replace('<svg ', `<svg width="${size}" height="${size}" `);
  return (
    <div
      className="bz"
      style={{ width: size, height: size, ['--bd' as string]: `-${frame / FPS}s`, ...style }}
    >
      <style>{PIN}</style>
      <div dangerouslySetInnerHTML={{ __html: markup }} />
    </div>
  );
};
