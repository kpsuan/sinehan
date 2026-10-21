// Shared bits for the styled reels: font loading and a loop helper.
import { useState } from 'react';
import { cancelRender, continueRender, delayRender, staticFile } from 'remotion';

export const asset = (name: string) => staticFile(`reel/${name}`);

// Loads a font file from public/reel before the first frame renders.
export const useFont = (family: string, file: string) => {
  const [handle] = useState(() => delayRender(`Loading ${family}`));
  useState(() => {
    new FontFace(family, `url(${asset(file)}) format('truetype')`)
      .load()
      .then((face) => {
        document.fonts.add(face);
        continueRender(handle);
      })
      .catch((err) => cancelRender(err));
    return null;
  });
};

// A value that cycles 0 → 1 → 0 every `period` frames (a motif loop), offset by `phase`.
export const loop = (frame: number, period: number, phase = 0) => (Math.sin(((frame + phase) / period) * Math.PI * 2) + 1) / 2;

// Beat grid: which beat we're on and how far into it, for motion that lands on the music.
export const BPM = 120;
export const beat = (frame: number, fps = 30) => {
  const b = (frame / fps) * (BPM / 60);
  return { index: Math.floor(b), t: b - Math.floor(b) };
};
