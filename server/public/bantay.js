// Bantay, Sinehan's mascot: a cream-white aspin, drawn for the sidebar, the show's tab and the website
// (copied to server/public by build-zip.py). Bantay.svg(pose) gives inline SVG, recoloured via the
// --b-* variables; Bantay.dataUri(pose) gives an image URL for CSS.
(function (root) {
  const coat = 'var(--b-coat, #f7f0e7)';
  const shade = 'var(--b-shade, #e0d0bd)';
  const warm = 'var(--b-warm, #ecd6bb)';
  const light = 'var(--b-light, #fffaf4)';
  const earIn = 'var(--b-ear, #e8b0a2)';
  const eye = 'var(--b-eye, #3b2620)';
  const nose = 'var(--b-nose, #3a2b2b)';
  const collar = 'var(--b-collar, #2c2631)';
  const tag = 'var(--b-tag, #c9b6f2)';

  const FACE =
    `<path d="M70 58 C 70 41, 130 41, 130 58 C 131 76, 117 98, 100 101 C 83 98, 69 76, 70 58 Z" fill="${coat}"/>` +
    `<path d="M100 50 C 94 60, 93 72, 96 80 L 104 80 C 107 72, 106 60, 100 50 Z" fill="${warm}" opacity=".7"/>` +
    `<ellipse cx="100" cy="89" rx="13" ry="10" fill="${light}"/>` +
    `<ellipse cx="100" cy="84" rx="7.5" ry="5.8" fill="${nose}"/>` +
    '<ellipse cx="97.8" cy="82.4" rx="2.2" ry="1.2" fill="#fff" opacity=".4"/>';
  const MOUTH = `<path d="M100 90 L100 93 M100 93 C 98.5 96, 95.5 96.5, 93.5 95 M100 93 C 101.5 96, 104.5 96.5, 106.5 95" fill="none" stroke="${nose}" stroke-width="1.8" stroke-linecap="round"/>`;

  // Two big ears straight up.
  const EARS =
    '<g class="snb-ear-l">' +
    `<path d="M71 64 C 60 46, 58 22, 64 8 C 79 16, 93 32, 97 50 Z" fill="${shade}"/>` +
    `<path d="M73 61 C 63 45, 62 25, 67 13 C 80 21, 91 35, 95 50 Z" fill="${coat}"/>` +
    `<path d="M76 55 C 69 43, 68 29, 71 20 C 80 27, 87 37, 90 48 Z" fill="${earIn}"/>` +
    '</g><g class="snb-ear-r">' +
    `<path d="M129 64 C 140 46, 142 22, 136 8 C 121 16, 107 32, 103 50 Z" fill="${shade}"/>` +
    `<path d="M127 61 C 137 45, 138 25, 133 13 C 120 21, 109 35, 105 50 Z" fill="${coat}"/>` +
    `<path d="M124 55 C 131 43, 132 29, 129 20 C 120 27, 113 37, 110 48 Z" fill="${earIn}"/>` +
    '</g>';

  // Ears laid back, for sleeping.
  const EARS_BACK =
    `<path d="M74 56 C 58 50, 46 40, 42 30 C 58 30, 72 38, 82 48 Z" fill="${shade}"/>` +
    `<path d="M75 53 C 61 48, 51 40, 47 33 C 60 33, 71 40, 80 48 Z" fill="${coat}"/>` +
    `<path d="M126 56 C 142 50, 154 40, 158 30 C 142 30, 128 38, 118 48 Z" fill="${shade}"/>` +
    `<path d="M125 53 C 139 48, 149 40, 153 33 C 140 33, 129 40, 120 48 Z" fill="${coat}"/>`;
  const EYES =
    '<g class="snb-blink">' +
    `<circle cx="86.5" cy="65" r="5.3" fill="${eye}"/><circle cx="88.2" cy="63.2" r="1.7" fill="#fff"/>` +
    `<circle cx="113.5" cy="65" r="5.3" fill="${eye}"/><circle cx="115.2" cy="63.2" r="1.7" fill="#fff"/>` +
    '</g>';
  const EYES_UP =
    '<g class="snb-blink">' +
    `<circle cx="86.5" cy="63" r="5.3" fill="${eye}"/><circle cx="87.6" cy="60.4" r="1.8" fill="#fff"/>` +
    `<circle cx="113.5" cy="63" r="5.3" fill="${eye}"/><circle cx="114.6" cy="60.4" r="1.8" fill="#fff"/>` +
    '</g>' +
    `<path d="M80 55 C 83 52, 89 51, 92 53 M108 53 C 111 51, 117 52, 120 55" fill="none" stroke="${shade}" stroke-width="2.2" stroke-linecap="round"/>`;
  const EYES_HAPPY = `<path d="M80 66 C 82 60, 90 60, 92 66 M108 66 C 110 60, 118 60, 120 66" fill="none" stroke="${eye}" stroke-width="3" stroke-linecap="round"/>`;
  const EYES_SHUT = `<path d="M80 66 C 83 70, 89 70, 92 66 M108 66 C 111 70, 117 70, 120 66" fill="none" stroke="${eye}" stroke-width="2.6" stroke-linecap="round"/>`;
  const EYES_SIDE =
    `<circle cx="90" cy="66" r="5.3" fill="${eye}"/><circle cx="92" cy="64.4" r="1.7" fill="#fff"/>` +
    `<circle cx="117" cy="66" r="5.3" fill="${eye}"/><circle cx="119" cy="64.4" r="1.7" fill="#fff"/>` +
    `<path d="M80 54 C 84 50, 91 50, 95 53 M106 59 C 110 58, 116 58, 120 59.5" fill="none" stroke="${shade}" stroke-width="2.8" stroke-linecap="round"/>`;
  const TONGUE = `<path d="M92 95 C 94 104, 106 104, 108 95 Z" fill="${nose}"/><path d="M95.5 98 C 95.5 108, 104.5 108, 104.5 98 Z" fill="#e8768a"/>`;
  const HEAD = EARS + FACE;
  const BODY =
    '<ellipse cx="102" cy="194" rx="46" ry="6" fill="#000" opacity=".3"/>' +
    `<g class="snb-tail"><path d="M138 182 C 160 178, 166 156, 156 146 C 152 142, 146 146, 150 150 C 156 156, 150 170, 136 172 Z" fill="${shade}"/></g>` +
    `<ellipse cx="124" cy="174" rx="25" ry="20" fill="${shade}"/>` +
    `<path d="M86 94 C 84 108, 80 120, 78 134 C 74 158, 76 178, 84 190 L 118 190 C 126 178, 127 156, 122 134 C 120 120, 116 108, 114 94 Z" fill="${coat}"/>` +
    `<path d="M90 130 C 92 140, 108 140, 110 130 C 110 150, 108 168, 100 176 C 92 168, 90 150, 90 130 Z" fill="${light}" opacity=".8"/>` +
    `<path d="M89 146 C 88 162, 88 176, 89 189 M111 146 C 112 162, 112 176, 111 189 M100 168 L 100 189" fill="none" stroke="${shade}" stroke-width="2.2" stroke-linecap="round"/>` +
    `<ellipse cx="91" cy="191" rx="9" ry="5" fill="${coat}"/><ellipse cx="109" cy="191" rx="9" ry="5" fill="${coat}"/>` +
    `<path d="M84 108 C 94 115, 106 115, 116 108 L 117 116 C 106 123, 94 123, 83 116 Z" fill="${collar}"/>` +
    `<circle cx="100" cy="125" r="5.5" fill="${tag}"/><circle cx="100" cy="125" r="2" fill="#1b1325" opacity=".5"/>`;
  const LYING_BODY =
    '<ellipse cx="112" cy="188" rx="88" ry="6" fill="#000" opacity=".3"/>' +
    `<g class="snb-tail"><path d="M176 168 C 198 166, 204 144, 194 134 C 190 130, 184 134, 188 138 C 194 144, 188 158, 174 160 Z" fill="${shade}"/></g>` +
    `<ellipse cx="160" cy="170" rx="26" ry="17" fill="${shade}"/>` +
    `<path d="M66 156 C 78 138, 150 134, 176 156 C 186 172, 176 186, 150 186 L 82 186 C 64 184, 58 168, 66 156 Z" fill="${coat}"/>` +
    `<rect x="24" y="174" width="66" height="12" rx="6" fill="${shade}"/><rect x="25" y="173" width="64" height="11" rx="5.5" fill="${coat}"/>` +
    `<rect x="30" y="163" width="62" height="12" rx="6" fill="${shade}"/><rect x="31" y="162" width="60" height="11" rx="5.5" fill="${coat}"/>`;

  const POSES = {
    sit: {
      box: '40 0 130 200',
      label: 'Bantay sitting up',
      art: BODY + `<g class="snb-look">${HEAD + MOUTH + EYES}</g>`,
    },
    happy: { box: '40 0 130 200', label: 'Bantay, happy', art: BODY + HEAD + EYES_HAPPY + TONGUE },
    tilt: {
      box: '40 0 130 200',
      label: 'Bantay tilting his head',
      art: BODY + `<g transform="rotate(-14 100 100)">${HEAD + MOUTH + EYES}</g>`,
    },
    guard: { box: '40 0 130 200', label: 'Bantay keeping watch', art: BODY + HEAD + MOUTH + EYES_SIDE },
    lying: {
      box: '12 60 196 136',
      label: 'Bantay lying down, waiting',
      art: LYING_BODY + `<g transform="translate(-40 61)">${HEAD + MOUTH + EYES_UP}</g>`,
    },
    asleep: {
      box: '12 60 196 136',
      label: 'Bantay asleep',
      art:
        '<ellipse cx="112" cy="188" rx="80" ry="6" fill="#000" opacity=".3"/><g class="snb-breathe">' +
        `<ellipse cx="124" cy="166" rx="60" ry="24" fill="${shade}"/><ellipse cx="120" cy="163" rx="57" ry="22" fill="${coat}"/>` +
        `<g transform="translate(-28 72) rotate(-10 100 72)">${EARS_BACK + FACE + EYES_SHUT}</g>` +
        `<path d="M172 170 C 168 186, 124 192, 84 184 C 78 183, 79 176, 85 177 C 120 182, 156 178, 162 162 Z" fill="${shade}"/></g>`,
    },

    // Just the head, for small places (a status chip, an icon).
    head: { box: '56 4 88 98', label: 'Bantay', art: HEAD + MOUTH + EYES },
    'head-tilt': {
      box: '50 2 100 104',
      label: 'Bantay, puzzled',
      art: `<g transform="rotate(-14 100 60)">${HEAD + MOUTH + EYES}</g>`,
    },
    'head-asleep': { box: '38 18 124 88', label: 'Bantay, asleep', art: EARS_BACK + FACE + EYES_SHUT },
  };

  // Small, occasional movements (tail wag, ear twitch, blink, look around, breathing while asleep);
  // off under prefers-reduced-motion.
  const MOTION =
    '<style>' +
    '.snb-tail{transform-box:fill-box;transform-origin:0% 100%;animation:snb-wag 3.4s ease-in-out infinite}' +
    '@keyframes snb-wag{0%,58%,100%{transform:rotate(0)}64%{transform:rotate(-16deg)}70%{transform:rotate(12deg)}76%{transform:rotate(-12deg)}82%{transform:rotate(7deg)}88%{transform:rotate(0)}}' +
    '.snb-ear-r{transform-box:fill-box;transform-origin:20% 100%;animation:snb-twitch-r 7s ease-in-out infinite}' +
    '.snb-ear-l{transform-box:fill-box;transform-origin:80% 100%;animation:snb-twitch-l 11s ease-in-out infinite}' +
    '@keyframes snb-twitch-r{0%,88%,100%{transform:rotate(0)}90%{transform:rotate(9deg)}92%{transform:rotate(0)}94%{transform:rotate(6deg)}96%{transform:rotate(0)}}' +
    '@keyframes snb-twitch-l{0%,70%,100%{transform:rotate(0)}73%{transform:rotate(-8deg)}76%{transform:rotate(0)}}' +
    '.snb-blink{transform-box:fill-box;transform-origin:50% 50%;animation:snb-blink 5s infinite}' +
    '@keyframes snb-blink{0%,94%,100%{transform:scaleY(1)}96%{transform:scaleY(.1)}}' +
    '.snb-look{transform-box:view-box;transform-origin:100px 100px;animation:snb-look 10s ease-in-out infinite}' +
    '@keyframes snb-look{0%,30%,100%{transform:rotate(0)}38%,52%{transform:rotate(-7deg)}60%{transform:rotate(0)}}' +
    '.snb-breathe{transform-box:fill-box;transform-origin:50% 100%;animation:snb-breathe 3.6s ease-in-out infinite}' +
    '@keyframes snb-breathe{50%{transform:scaleY(1.04)}}' +
    '@media (prefers-reduced-motion:reduce){.snb-tail,.snb-ear-r,.snb-ear-l,.snb-blink,.snb-look,.snb-breathe{animation:none}}' +
    '</style>';

  // Coats picked in Settings; each overrides the --b-* colours the drawing reads.
  const COATS = {
    white: { name: 'White' },
    cream: { name: 'Cream', coat: '#f1dfc6', shade: '#d6bd9b', warm: '#e6c49c', light: '#fbf0e1' },
    tan: { name: 'Tan', coat: '#d9a56b', shade: '#b07d47', warm: '#c98f52', light: '#f2dcc0', ear: '#e7a587' },
    black: {
      name: 'Black',
      coat: '#3d3338',
      shade: '#271f24',
      warm: '#55474d',
      light: '#d6b08a',
      ear: '#8c5d55',
      eye: '#140e10',
      nose: '#0f0a0b',
      collar: '#c9443d',
    },
  };
  const coatStyle = (coat) =>
    Object.entries(COATS[coat] || {})
      .filter(([k]) => k !== 'name')
      .map(([k, v]) => `--b-${k}:${v}`)
      .join(';');

  function svg(pose = 'sit', { size, className = 'bantay', label, coat } = {}) {
    const p = POSES[pose] || POSES.sit;
    const dims = size ? ` width="${Number(size)}" height="${Number(size)}"` : '';
    const name = String(label ?? p.label).replace(/[<>&"]/g, '');

    // stroke:none stops page or app icon styles from outlining him.
    const style = `stroke:none;${coatStyle(coat)}`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${p.box}"${dims} class="${className}" style="${style}" role="img" aria-label="${name}" overflow="visible">${MOTION}${p.art}</svg>`;
  }

  // As an image URL (for CSS backgrounds), in a given coat.
  function dataUri(pose, coat) {
    const c = COATS[coat] || {};
    const markup = svg(pose).replace(/var\(--b-([\w-]+), (#[0-9a-f]+)\)/gi, (m, k, d) => c[k] || d);
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  }

  root.Bantay = {
    svg,
    dataUri,
    poses: Object.keys(POSES),
    coats: Object.fromEntries(Object.entries(COATS).map(([k, v]) => [k, v.name])),
  };
})(typeof self !== 'undefined' ? self : this);
