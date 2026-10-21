import React, { useState } from 'react';
import {
  AbsoluteFill,
  Html5Audio,
  Sequence,
  cancelRender,
  continueRender,
  delayRender,
  interpolate,
  staticFile,
} from 'remotion';
import { TransitionSeries, springTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { FPS, sec } from './anim';
import { CUES } from './cues';
import audio from './audio.json';
import { Intro, Join, StartParty } from './scenes/Opening';
import { Holds, Sync } from './scenes/Sync';
import { Reels, Remote, Together } from './scenes/Together';
import { Appearance, Guides, Outro, Privacy } from './scenes/Closing';

const T = 16;
const VO_LEAD = 10;
const VO: Record<string, number> = audio.vo;

// [id (matches narration.json and cues.ts), scene, shortest length]
const BASE: [string, React.FC, number][] = [
  ['intro', Intro, sec(4.5)],
  ['start', StartParty, sec(7)],
  ['join', Join, sec(6.5)],
  ['sync', Sync, sec(9)],
  ['holds', Holds, sec(8.5)],
  ['together', Together, sec(10)],
  ['reels', Reels, sec(7)],
  ['remote', Remote, sec(7.5)],
  ['guides', Guides, sec(8)],
  ['appearance', Appearance, sec(7)],
  ['privacy', Privacy, sec(5.5)],
  ['outro', Outro, sec(8)],
];

// Each scene lasts at least as long as its narration line, plus a breath before the next one.
const SCENES = BASE.map(([id, Scene, min]) => ({
  id,
  Scene,
  duration: Math.max(min, VO_LEAD + Math.ceil(((VO[id] ?? 0) + 0.6) * FPS) + T),
}));

const STARTS = SCENES.reduce<number[]>((acc, s, i) => [...acc, i === 0 ? 0 : acc[i - 1] + SCENES[i - 1].duration - T], []);

export const DURATION = STARTS[STARTS.length - 1] + SCENES[SCENES.length - 1].duration;

const TRANSITIONS = [fade(), slide({ direction: 'from-right' }), fade(), slide({ direction: 'from-bottom' })];

// Narration windows, for ducking the music under the voice.
const VOICE = SCENES.filter((s) => VO[s.id]).map((s, i) => {
  const from = STARTS[SCENES.indexOf(s)] + VO_LEAD;
  return [from, from + Math.ceil(VO[s.id] * FPS), i] as const;
});

const musicVolume = (f: number) => {
  const ducked = VOICE.some(([a, b]) => f >= a - 6 && f <= b + 6);
  const near = Math.min(...VOICE.map(([a, b]) => (f < a ? a - f : f > b ? f - b : 0)));
  const level = ducked ? 0.11 : interpolate(near, [6, 20], [0.11, 0.3], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fadeIn = interpolate(f, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  const fadeOut = interpolate(f, [DURATION - 50, DURATION], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return level * fadeIn * fadeOut;
};

// Inter, the sidebar's font, loaded before the first frame renders.
const useInter = () => {
  const [handle] = useState(() => delayRender('Loading Inter'));
  useState(() => {
    new FontFace('Inter', `url(${staticFile('inter.woff2')}) format('woff2')`, { weight: '100 900' })
      .load()
      .then((face) => {
        document.fonts.add(face);
        continueRender(handle);
      })
      .catch((err) => cancelRender(err));
    return null;
  });
};

const Soundtrack: React.FC = () => (
  <>
    {audio.music > 0 && <Html5Audio src={staticFile('audio/music.mp3')} volume={musicVolume} />}
    {SCENES.map((s, i) => (
      <React.Fragment key={s.id}>
        {VO[s.id] && (
          <Sequence from={STARTS[i] + VO_LEAD} layout="none">
            <Html5Audio src={staticFile(`audio/vo/${s.id}.mp3`)} volume={1} />
          </Sequence>
        )}
        {(CUES[s.id] ?? []).map(([name, at, volume = 0.4], j) => (
          <Sequence key={j} from={STARTS[i] + at} layout="none">
            <Html5Audio src={staticFile(`audio/sfx/${name}.mp3`)} volume={volume} />
          </Sequence>
        ))}
        {i > 0 && (
          <Sequence from={STARTS[i] - 4} layout="none">
            <Html5Audio src={staticFile('audio/sfx/whoosh.mp3')} volume={0.18} />
          </Sequence>
        )}
      </React.Fragment>
    ))}
  </>
);

export const Video: React.FC = () => {
  useInter();
  return (
    <AbsoluteFill>
      <TransitionSeries>
        {SCENES.flatMap(({ id, Scene, duration }, i) => {
          const items = [
            <TransitionSeries.Sequence key={id} durationInFrames={duration}>
              <Scene />
            </TransitionSeries.Sequence>,
          ];
          if (i < SCENES.length - 1)
            items.push(
              <TransitionSeries.Transition
                key={`t${id}`}
                presentation={TRANSITIONS[i % TRANSITIONS.length]}
                timing={springTiming({ config: { damping: 200 }, durationInFrames: T })}
              />,
            );
          return items;
        })}
      </TransitionSeries>
      <Soundtrack />
    </AbsoluteFill>
  );
};
