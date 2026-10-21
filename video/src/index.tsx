import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { DURATION, Video, useInter } from './Video';
import { FPS } from './anim';
import { REEL_DURATION, Reel } from './reel/Reel';
import { COMIC_DURATION, Comic } from './reel/Comic';

// The reel uses the same font loading as the product video.
const ReelWithFont: React.FC = () => {
  useInter();
  return <Reel />;
};

const ComicWithFont: React.FC = () => {
  useInter();
  return <Comic />;
};

const Root: React.FC = () => (
  <>
    <Composition id="Sinehan" component={Video} durationInFrames={DURATION} fps={FPS} width={1920} height={1080} />
    <Composition id="Reel" component={ReelWithFont} durationInFrames={REEL_DURATION} fps={FPS} width={1920} height={1080} />
    <Composition id="Comic" component={ComicWithFont} durationInFrames={COMIC_DURATION} fps={FPS} width={1920} height={1080} />
  </>
);

registerRoot(Root);
