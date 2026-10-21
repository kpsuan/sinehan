// Sinehan's palette, from the sidebar's CSS (extension/sidepanel.html).
export const C = {
  bg: '#0c0a10',
  bgGlow: 'radial-gradient(120% 80% at 50% -10%, #2a2038 0%, #14101a 50%, #0c0a10 80%)',
  card: '#16121c',
  cardGlass: 'rgba(22, 18, 30, 0.78)',
  edge: 'rgba(255, 255, 255, 0.08)',
  btn: 'rgba(255, 255, 255, 0.05)',
  them: 'rgba(255, 255, 255, 0.07)',
  text: '#efeaf6',
  muted: '#9a90aa',
  faint: '#6d6479',
  accent: '#c9b6f2',
  accentInk: '#1b1325',
  vivid: '#6c4ef5',
  live: '#9fd6b0',
  danger: '#d64550',
  orange: '#f08a3c',
  blue: '#6f8df7',
};

export const LIGHT = {
  bg: '#f4f4f5',
  card: '#ffffff',
  edge: 'rgba(255, 255, 255, 0)',
  btn: '#f4f4f5',
  them: '#f2f2f4',
  text: '#111114',
  muted: '#85858f',
  faint: '#b2b2ba',
  accent: '#6c4ef5',
  accentInk: '#ffffff',
  live: '#22a55a',
};

export type Palette = typeof LIGHT;
export const DARK: Palette = {
  bg: C.bg,
  card: C.card,
  edge: C.edge,
  btn: C.btn,
  them: C.them,
  text: C.text,
  muted: C.muted,
  faint: C.faint,
  accent: C.accent,
  accentInk: C.accentInk,
  live: C.live,
};

export const FONT = "'Inter', system-ui, sans-serif";

export const PEOPLE = {
  you: { name: 'Kismet', avatar: 4, color: '#c6d4ec' },
  them: { name: 'Jessa', avatar: 3, color: '#bfe0d0' },
};
