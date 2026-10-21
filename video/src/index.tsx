import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { DURATION, Video } from './Video';
import { FPS } from './anim';

const Root: React.FC = () => (
  <Composition id="Sinehan" component={Video} durationInFrames={DURATION} fps={FPS} width={1920} height={1080} />
);

registerRoot(Root);
