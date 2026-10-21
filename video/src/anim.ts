import { Easing, interpolate, spring } from 'remotion';

export const FPS = 30;
export const sec = (s: number) => Math.round(s * FPS);

// Bouncy pop: 0 → 1 with overshoot, starting at `delay` frames.
export const pop = (frame: number, delay = 0, config = { damping: 9, stiffness: 160, mass: 0.6 }) =>
  spring({ frame: frame - delay, fps: FPS, config });

// Settled spring with no overshoot, for slides and moves.
export const glide = (frame: number, delay = 0, durationInFrames?: number) =>
  spring({ frame: frame - delay, fps: FPS, config: { damping: 200 }, durationInFrames });

export const fadeIn = (frame: number, start: number, len = 12) =>
  interpolate(frame, [start, start + len], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

export const fadeOut = (frame: number, start: number, len = 12) =>
  interpolate(frame, [start, start + len], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

// Eased value along keyframes, clamped at both ends.
export const ease = (frame: number, input: number[], output: number[], easing = Easing.inOut(Easing.cubic)) =>
  interpolate(frame, input, output, { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing });

// Pressing a button: dips to 0.92 and springs back.
export const press = (frame: number, at: number) => {
  if (frame < at) return 1;
  const down = interpolate(frame, [at, at + 3], [1, 0.92], { extrapolateRight: 'clamp' });
  const up = spring({ frame: frame - at - 3, fps: FPS, config: { damping: 8, stiffness: 220 } });
  return down + (1 - down) * up;
};

// Slow drift for mockups: a gentle sine float.
export const drift = (frame: number, amp = 8, period = 180, phase = 0) =>
  Math.sin(((frame + phase) / period) * Math.PI * 2) * amp;
