#!/bin/sh
# Review stills of the reel: sh shots-reel.sh 60 200 ...
npx remotion bundle src/index.tsx --out-dir out/bundle >/dev/null 2>&1 || exit 1
mkdir -p out/reel-shots
for n in "$@"; do
  npx remotion still out/bundle Reel "out/reel-shots/$n.png" --frame="$n" --scale=0.5 >/dev/null 2>&1 &
  while [ "$(jobs -r | wc -l)" -ge 4 ]; do sleep 0.2; done
done
wait
