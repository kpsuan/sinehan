#!/bin/sh
# Render frames as small stills for review: sh shots.sh 20 260 560 ...
npx remotion bundle src/index.tsx --out-dir out/bundle >/dev/null 2>&1 || exit 1
for n in "$@"; do
  npx remotion still out/bundle Sinehan "out/shots/$n.png" --frame="$n" --scale=0.5 >/dev/null 2>&1 &
  while [ "$(jobs -r | wc -l)" -ge 4 ]; do sleep 0.2; done
done
wait
