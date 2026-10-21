import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { DURATION, Video, useInter } from './Video';
import { FPS } from './anim';
import { REEL_DURATION, Reel } from './reel/Reel';
import { COMIC_DURATION, Comic } from './reel/Comic';
import { MatisseHello } from './reel/styles/Matisse';
import { BauhausHello } from './reel/styles/Bauhaus';
import { PixelHello } from './reel/styles/Pixel';
import { useFont } from './reel/styles/shared';
import { MATISSE_DURATION, MatisseReel } from './reel/styles/MatisseReel';
import { VANGOGH_DURATION, VanGoghReel } from './reel/styles/VanGoghReel';

// The reel uses the same font loading as the product video.
const ReelWithFont: React.FC = () => {
  useInter();
  return <Reel />;
};

const ComicWithFont: React.FC = () => {
  useInter();
  return <Comic />;
};

// Style tryouts: one opening scene each, to pick from.
const Styled = (Scene: React.FC, font?: [string, string]): React.FC => () => {
  useInter();
  if (font) useFont(font[0], font[1]);
  return <Scene />;
};
const StyleMatisse = Styled(MatisseHello);
const MatisseFilm = Styled(MatisseReel);
const VanGoghFilm = Styled(VanGoghReel, ['Caveat Brush', 'CaveatBrush.ttf']);
const StyleBauhaus = Styled(BauhausHello);
const StylePixel = Styled(PixelHello, ['Press Start 2P', 'PressStart2P.ttf']);

const Root: React.FC = () => (
  <>
    <Composition id="Sinehan" component={Video} durationInFrames={DURATION} fps={FPS} width={1920} height={1080} />
    <Composition id="Reel" component={ReelWithFont} durationInFrames={REEL_DURATION} fps={FPS} width={1920} height={1080} />
    <Composition id="Comic" component={ComicWithFont} durationInFrames={COMIC_DURATION} fps={FPS} width={1920} height={1080} />
    <Composition id="Matisse" component={MatisseFilm} durationInFrames={MATISSE_DURATION} fps={FPS} width={1920} height={1080} />
    <Composition id="VanGogh" component={VanGoghFilm} durationInFrames={VANGOGH_DURATION} fps={FPS} width={1920} height={1080} />
    <Composition id="StyleMatisse" component={StyleMatisse} durationInFrames={150} fps={FPS} width={1920} height={1080} />
    <Composition id="StyleBauhaus" component={StyleBauhaus} durationInFrames={150} fps={FPS} width={1920} height={1080} />
    <Composition id="StylePixel" component={StylePixel} durationInFrames={150} fps={FPS} width={1920} height={1080} />
  </>
);

registerRoot(Root);
