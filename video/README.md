# Sinehan product video

An ~83-second product video made with [Remotion](https://www.remotion.dev), 1920×1080 at 30 fps. Bantay is drawn by
the extension's own `extension/bantay.js`, so he always matches the product.

```sh
npm install
npm run studio     # preview and scrub in the browser
npm run render     # writes out/sinehan.mp4
```

To check frames without a full render: `sh shots.sh 120 480 900` renders those frames to `out/shots/`, and
`python sheet.py out/sheet.png out/shots/*.png` tiles them into one image.

## Scenes

| Scene        | What it shows                                              |
| ------------ | ---------------------------------------------------------- |
| Intro        | Bantay pops in, the wordmark bounces in                    |
| StartParty   | Start a party; the invite link is copied and flies out     |
| Join         | The invite page, "Join the party", confetti               |
| Sync         | Pause and skip on one laptop, the other follows            |
| Holds        | An ad holds the other side, then a 3·2·1 countdown         |
| Together     | Chat, emoji, floating camera, hold hand, Bantay's /spin    |
| Reels        | A swipe on one phone, the other follows                    |
| Remote       | The phone slides up with remote and chat cards around it   |
| Guides       | Ask Reddit for best episodes, tick one off                 |
| Appearance   | Dark to light toggle, Bantay's coats                       |
| Privacy      | No accounts, chats stay with you, calls go direct          |
| Outro        | Slow mockup drift, end card with download button           |

Scene lengths and transitions are in `src/Video.tsx`; colors in `src/theme.ts` come from the sidebar's CSS.
Film stills are from the Blender open movies (CC BY), copied from `server/public/`.
