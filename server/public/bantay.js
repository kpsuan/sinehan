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
  const SHADOW = '<ellipse cx="102" cy="194" rx="46" ry="6" fill="#000" opacity=".3"/>';
  const TORSO =
    `<g class="snb-tail"><path d="M138 182 C 160 178, 166 156, 156 146 C 152 142, 146 146, 150 150 C 156 156, 150 170, 136 172 Z" fill="${shade}"/></g>` +
    `<ellipse cx="124" cy="174" rx="25" ry="20" fill="${shade}"/>` +
    `<path d="M86 94 C 84 108, 80 120, 78 134 C 74 158, 76 178, 84 190 L 118 190 C 126 178, 127 156, 122 134 C 120 120, 116 108, 114 94 Z" fill="${coat}"/>` +
    `<path d="M90 130 C 92 140, 108 140, 110 130 C 110 150, 108 168, 100 176 C 92 168, 90 150, 90 130 Z" fill="${light}" opacity=".8"/>`;
  const FRONT_LEGS =
    `<path d="M89 146 C 88 162, 88 176, 89 189 M111 146 C 112 162, 112 176, 111 189 M100 168 L 100 189" fill="none" stroke="${shade}" stroke-width="2.2" stroke-linecap="round"/>` +
    `<ellipse cx="91" cy="191" rx="9" ry="5" fill="${coat}"/><ellipse cx="109" cy="191" rx="9" ry="5" fill="${coat}"/>`;
  const COLLAR =
    `<path d="M84 108 C 94 115, 106 115, 116 108 L 117 116 C 106 123, 94 123, 83 116 Z" fill="${collar}"/>` +
    `<circle cx="100" cy="125" r="5.5" fill="${tag}"/><circle cx="100" cy="125" r="2" fill="#1b1325" opacity=".5"/>`;
  const BODY = SHADOW + TORSO + FRONT_LEGS + COLLAR;

  // ---- Tricks ----
  // A front leg lifted from the shoulder (x1,y1) to the paw (x2,y2), in a group that can move.
  const leg = (x1, y1, x2, y2, cls = '') =>
    `<g class="${cls}"><path d="M${x1} ${y1} L${x2} ${y2}" fill="none" stroke="${shade}" stroke-width="15" stroke-linecap="round"/>` +
    `<path d="M${x1} ${y1} L${x2} ${y2}" fill="none" stroke="${coat}" stroke-width="11.5" stroke-linecap="round"/>` +
    `<ellipse cx="${x2}" cy="${y2}" rx="7.5" ry="6.5" fill="${coat}"/></g>`;
  // Sitting with the front paws off the ground: the back feet show instead.
  const HIND_FEET =
    `<ellipse cx="86" cy="191" rx="9" ry="5" fill="${coat}"/><ellipse cx="114" cy="191" rx="9" ry="5" fill="${coat}"/>`;
  const SIT_UP = SHADOW + TORSO + HIND_FEET + COLLAR;
  const ONE_FRONT_LEG =
    `<path d="M89 146 C 88 162, 88 176, 89 189" fill="none" stroke="${shade}" stroke-width="2.2" stroke-linecap="round"/>` +
    `<ellipse cx="91" cy="191" rx="9" ry="5" fill="${coat}"/>`;
  const EYES_WIDE =
    `<circle cx="86.5" cy="64" r="7" fill="${eye}"/><circle cx="88.5" cy="61.5" r="2.2" fill="#fff"/>` +
    `<circle cx="113.5" cy="64" r="7" fill="${eye}"/><circle cx="115.5" cy="61.5" r="2.2" fill="#fff"/>`;
  const EYES_X = `<path d="M81 60 L92 70 M92 60 L81 70 M108 60 L119 70 M119 60 L108 70" fill="none" stroke="${eye}" stroke-width="3" stroke-linecap="round"/>`;
  const DUST =
    `<g class="snb-dust"><circle cx="66" cy="188" r="6" fill="${shade}" opacity=".7"/><circle cx="56" cy="182" r="4" fill="${shade}" opacity=".5"/>` +
    `<circle cx="140" cy="188" r="6" fill="${shade}" opacity=".7"/><circle cx="150" cy="182" r="4" fill="${shade}" opacity=".5"/></g>`;

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
    // Reactions (when you both react to the same moment).
    laugh: {
      box: '40 -6 130 206',
      label: 'Bantay laughing',
      art: BODY + `<g class="snb-laugh"><g transform="rotate(-8 100 100)">${HEAD + EYES_HAPPY + TONGUE}</g></g>`
        + `<path d="M58 40 l8 4 M54 54 l9 1 M142 40 l-8 4 M146 54 l-9 1" stroke="${tag}" stroke-width="3" stroke-linecap="round"/>`,
    },
    cry: {
      box: '40 0 130 200',
      label: 'Bantay crying',
      art: BODY + HEAD + EYES_SHUT
        + `<path d="M93 97 C 96 93, 104 93, 107 97" fill="none" stroke="${nose}" stroke-width="1.8" stroke-linecap="round"/>`
        + '<path class="snb-tear" d="M84 72 C 81 79, 80 83, 84 85 C 88 83, 87 79, 84 72 Z" fill="#8ec5f2"/>'
        + '<path class="snb-tear snb-tear2" d="M116 72 C 113 79, 112 83, 116 85 C 120 83, 119 79, 116 72 Z" fill="#8ec5f2"/>',
    },
    love: {
      box: '40 -14 130 214',
      label: 'Bantay in love',
      art: BODY + HEAD + EYES_HAPPY + MOUTH
        + '<g class="snb-hearts"><path d="M60 22 c-4-6-13-2-10 5 3 6 10 9 10 9 s7-3 10-9 c3-7-6-11-10-5z" fill="#ef6f8f"/>'
        + '<path d="M138 4 c-3-5-10-2-8 4 2 5 8 7 8 7 s6-2 8-7 c2-6-5-9-8-4z" fill="#f49ab0"/>'
        + '<path d="M150 34 c-2-3-7-1-6 3 2 4 6 5 6 5 s4-1 6-5 c1-4-4-6-6-3z" fill="#ef6f8f"/></g>',
    },
    shock: {
      box: '40 0 130 200',
      label: 'Bantay, shocked',
      art: BODY + EARS_BACK + FACE
        + `<circle cx="86.5" cy="64" r="7" fill="${eye}"/><circle cx="88.5" cy="61.5" r="2.2" fill="#fff"/>`
        + `<circle cx="113.5" cy="64" r="7" fill="${eye}"/><circle cx="115.5" cy="61.5" r="2.2" fill="#fff"/>`
        + `<ellipse cx="100" cy="97" rx="4.5" ry="5.5" fill="${nose}"/>`,
    },
    party: {
      box: '40 -22 130 222',
      label: 'Bantay celebrating',
      art: BODY + HEAD + EYES_HAPPY + TONGUE
        + `<g transform="rotate(-10 100 40)"><path d="M86 46 L100 4 L114 46 Z" fill="${tag}"/><path d="M90 34 L110 34 M94 22 L106 22" stroke="#fff" stroke-width="3" opacity=".6"/>`
        + '<circle cx="100" cy="4" r="5" fill="#f2c94c"/></g>',
    },
    head: { box: '56 4 88 98', label: 'Bantay', art: HEAD + MOUTH + EYES },

    // Tricks (chat commands like /spin, or a tap on him).
    spin: {
      box: '30 -10 150 210',
      label: 'Bantay spinning',
      art: DUST + `<g class="snb-spin">${BODY + HEAD + EYES_HAPPY + TONGUE}</g>`,
    },
    beg: {
      box: '40 0 130 200',
      label: 'Bantay begging',
      art: SIT_UP + leg(87, 136, 84, 117) + leg(113, 136, 116, 117) + HEAD + EYES_UP + MOUTH,
    },
    stand: {
      box: '36 -16 138 216',
      label: 'Bantay standing up',
      art: SHADOW +
        `<rect x="80" y="166" width="13" height="24" rx="6" fill="${coat}"/><rect x="107" y="166" width="13" height="24" rx="6" fill="${coat}"/>` +
        HIND_FEET +
        `<g class="snb-wobble"><g transform="translate(0 -16)">${TORSO + COLLAR + leg(86, 128, 68, 104) + leg(114, 128, 132, 104) + HEAD + EYES_HAPPY + TONGUE}</g></g>`,
    },
    paw: {
      box: '40 0 140 200',
      label: 'Bantay giving his paw',
      art: SHADOW + TORSO + ONE_FRONT_LEG + COLLAR + leg(110, 140, 134, 126, 'snb-wave') + HEAD + EYES + MOUTH,
    },
    playdead: {
      box: '0 70 214 130',
      label: 'Bantay playing dead',
      art: '<ellipse cx="116" cy="188" rx="90" ry="6" fill="#000" opacity=".3"/>' +
        leg(116, 160, 110, 130) + leg(130, 158, 128, 126) + leg(152, 158, 158, 128) + leg(166, 162, 176, 136) +
        `<path d="M176 172 C 192 176, 204 170, 206 160 C 207 156, 202 155, 201 159 C 199 166, 190 168, 178 166 Z" fill="${shade}"/>` +
        `<ellipse cx="128" cy="172" rx="58" ry="20" fill="${shade}"/><ellipse cx="126" cy="170" rx="56" ry="18" fill="${coat}"/>` +
        `<ellipse cx="130" cy="164" rx="36" ry="8" fill="${light}"/>` +
        `<g transform="translate(4 98) scale(.8) rotate(-28 100 60)">${HEAD + EYES_X + TONGUE}</g>`,
    },
    dance67: {
      box: '40 -10 130 210',
      label: 'Bantay doing the 6 7',
      art: SIT_UP + leg(87, 134, 74, 112, 'snb-67l') + leg(113, 134, 126, 112, 'snb-67r') +
        `<g class="snb-bob">${HEAD + EYES_HAPPY + TONGUE}</g>`,
    },
    scuba: {
      box: '40 -4 140 204',
      label: 'Bantay doing the scuba dance',
      art: SHADOW + `<g class="snb-knees">${HIND_FEET}</g>` +
        `<g class="snb-dip">${TORSO + COLLAR + HEAD + EYES_HAPPY + leg(113, 134, 140, 110, 'snb-scuba') + leg(87, 136, 99, 89)}</g>`,
    },
    gasp: {
      box: '40 0 130 200',
      label: 'Bantay with a paw over his mouth',
      art: `<g class="snb-shake">${SHADOW + TORSO + ONE_FRONT_LEG + COLLAR + HEAD + EYES_WIDE + leg(114, 136, 101, 96)}</g>` +
        `<path d="M58 44 l8 4 M54 58 l9 1 M142 44 l-8 4 M146 58 l-9 1" stroke="${tag}" stroke-width="3" stroke-linecap="round"/>`,
    },
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
    '.snb-laugh{transform-box:view-box;transform-origin:100px 110px;animation:snb-laugh .5s ease-in-out infinite alternate}' +
    '@keyframes snb-laugh{from{transform:translateY(0)}to{transform:translateY(-3px) rotate(-3deg)}}' +
    '.snb-tear{transform-box:fill-box;animation:snb-tear 1.2s ease-in infinite}.snb-tear2{animation-delay:.6s}' +
    '@keyframes snb-tear{0%{transform:translateY(0);opacity:1}100%{transform:translateY(16px);opacity:0}}' +
    '.snb-hearts{transform-box:fill-box;transform-origin:50% 100%;animation:snb-hearts 1.6s ease-in-out infinite}' +
    '@keyframes snb-hearts{0%{transform:translateY(6px) scale(.85);opacity:.4}50%{opacity:1}100%{transform:translateY(-6px) scale(1.05);opacity:.9}}' +
    // Tricks
    '.snb-spin{transform-box:view-box;transform-origin:100px 120px;animation:snb-spin .9s ease-in-out 2}' +
    '@keyframes snb-spin{0%{transform:scaleX(1)}25%{transform:translateY(-10px) scaleX(0)}50%{transform:scaleX(-1)}75%{transform:translateY(-10px) scaleX(0)}100%{transform:scaleX(1)}}' +
    '.snb-dust{animation:snb-dust .9s ease-out 2}@keyframes snb-dust{0%{opacity:0;transform:translateY(4px)}30%{opacity:1}100%{opacity:0;transform:translateY(-6px)}}' +
    '.snb-67l{animation:snb-67 .42s ease-in-out infinite alternate}.snb-67r{animation:snb-67 .42s ease-in-out infinite alternate-reverse}' +
    '@keyframes snb-67{from{transform:translateY(-16px)}to{transform:translateY(8px)}}' +
    '.snb-bob{transform-box:view-box;transform-origin:100px 100px;animation:snb-bob .42s ease-in-out infinite alternate}' +
    '@keyframes snb-bob{from{transform:rotate(-5deg)}to{transform:translateY(3px) rotate(5deg)}}' +
    '.snb-shake{animation:snb-shake .16s linear infinite alternate}@keyframes snb-shake{from{transform:translateX(-1.6px)}to{transform:translateX(1.6px)}}' +
    '.snb-wave{transform-box:view-box;transform-origin:110px 140px;animation:snb-wave .5s ease-in-out infinite alternate}' +
    '@keyframes snb-wave{from{transform:rotate(-14deg)}to{transform:rotate(6deg)}}' +
    '.snb-wobble{transform-box:view-box;transform-origin:100px 190px;animation:snb-wobble .8s ease-in-out infinite alternate}' +
    '@keyframes snb-wobble{from{transform:rotate(-3deg)}to{transform:rotate(3deg)}}' +
    '.snb-scuba{transform-box:view-box;transform-origin:113px 134px;animation:snb-scuba .48s ease-in-out infinite alternate}' +
    '@keyframes snb-scuba{from{transform:rotate(-18deg)}to{transform:rotate(14deg)}}' +
    '.snb-knees{transform-box:view-box;transform-origin:100px 191px;animation:snb-knees .48s ease-in-out infinite alternate}' +
    '@keyframes snb-knees{from{transform:scaleX(.8)}to{transform:scaleX(1.2)}}' +
    '.snb-dip{animation:snb-dip .48s ease-in-out infinite alternate}@keyframes snb-dip{to{transform:translateY(3px)}}' +
    '@media (prefers-reduced-motion:reduce){.snb-tail,.snb-ear-r,.snb-ear-l,.snb-blink,.snb-look,.snb-breathe,.snb-laugh,.snb-tear,.snb-hearts,.snb-spin,.snb-dust,.snb-67l,.snb-67r,.snb-bob,.snb-shake,.snb-wave,.snb-wobble,.snb-scuba,.snb-knees,.snb-dip{animation:none}}' +
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

  // Tricks you can ask for in chat (/spin, /paw…): the pose, how it reads ("asked Bantay to …"), how long
  // it plays, and what he barks.
  const TRICKS = {
    sit: { pose: 'sit', name: 'sit', ms: 2200, bark: '(•ᴥ•)' },
    stand: { pose: 'stand', name: 'stand up', ms: 2800, bark: 'U・ᴥ・U' },
    spin: { pose: 'spin', name: 'spin', ms: 2000, bark: 'Wheee!' },
    down: { pose: 'lying', name: 'lie down', ms: 2600, bark: '(ᵕᴥᵕ)' },
    playdead: { pose: 'playdead', name: 'play dead', ms: 3000, bark: 'x_x' },
    paw: { pose: 'paw', name: 'give paw', ms: 2600, bark: 'ฅ(•ᴥ•)' },
    beg: { pose: 'beg', name: 'beg', ms: 2600, bark: '(◕ᴥ◕)' },
    speak: { pose: 'happy', name: 'speak', ms: 2200, bark: 'Arf! Arf!' },
    dance: { pose: 'dance67', name: 'do the 6 7', ms: 3200, bark: '6 7!' },
    gasp: { pose: 'gasp', name: 'gasp', ms: 2600, bark: '(⊙ᴥ⊙)' },
    scuba: { pose: 'scuba', name: 'do the scuba', ms: 3400, bark: 'Scuba! (˘ᴥ˘)' },
  };
  const ALIASES = {
    67: 'dance', '6-7': 'dance', dead: 'playdead', 'play-dead': 'playdead', shake: 'paw', lie: 'down', liedown: 'down',
    bark: 'speak', omg: 'gasp', 'scuba-dance': 'scuba', nick: 'scuba', handovermouth: 'gasp', up: 'stand',
  };
  // "/spin" → 'spin'; anything else → ''.
  const trickFor = (text) => {
    const m = String(text || '').trim().toLowerCase().match(/^\/([a-z0-9-]+)$/);
    if (!m) return '';
    const k = ALIASES[m[1]] || m[1];
    return Object.hasOwn(TRICKS, k) ? k : '';
  };

  root.Bantay = {
    tricks: TRICKS,
    trickFor,
    svg,
    dataUri,
    poses: Object.keys(POSES),
    coats: Object.fromEntries(Object.entries(COATS).map(([k, v]) => [k, v.name])),
  };
})(typeof self !== 'undefined' ? self : this);
