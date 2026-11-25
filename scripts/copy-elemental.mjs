// The elemental pack's copy: one entry per chapter, in order. scripts/pages.mjs builds the pages from it.
export const ELEMENTS = [
  {
    id: 'fire', num: '01', label: 'Fire', name: 'Burn the draft', color: '#ff7a1a',
    aria: 'Fire. Scroll to call down a comet and burn the wireframe away to reveal the finished design. Contains a brief flash.',
    summary: 'Call down a comet and burn a pencil wireframe away to reveal the finished design. Throw fire at the paper, or scroll back up and call the comet again.',
    body: [
      'The first scroll calls down a comet. It streaks in trailing fire, lights up the page as it comes, and hits: a flash, a shockwave that bends everything it crosses, and a blast crater that catches. From there the fire spreads as you scroll.',
      'Ahead of the fire the paper browns and chars. Flames rise off the burning edge, torn into tongues by heat rising through them. Embers lift away, and the finished design wavers in the heat behind it.',
    ],
    play: 'Move over the paper and fire follows your hand. Click and a fireball arcs up from below and starts a new fire where it lands.',
  },
  {
    id: 'water', num: '02', label: 'Water', name: 'Wash the draft', color: '#2dd4bf',
    aria: 'Water. Scroll to let water run down the wireframe and wash it away to reveal the finished design.',
    summary: 'Water pours down a pencil wireframe in rivulets that merge into a sheet, washing the sketch away to reveal the finished design. Click to spill some more.',
    body: [
      'Water pours in from the top and runs down the page. Each rivulet swells to a rounded head and widens until it merges with its neighbours.',
      'The paper ahead wicks the water up and greys, and the pencil runs. In the water, ripples flow downhill and bend the finished design underneath. The sketch’s pigment washes out just behind the front.',
    ],
    play: 'Click the paper to spill some: it pools where it lands, then runs down.',
  },
  {
    id: 'air', num: '03', label: 'Air', name: 'Scatter the draft', color: '#a5b4fc',
    aria: 'Air. Scroll to blow the wireframe away and reveal the finished design.',
    summary: 'Wind strips a pencil wireframe off the page in streaks and carries it away, leaving the finished design. Click to send a gust.',
    body: [
      'Wind comes in from the left. The paper flutters before the gust arrives. Then the wind strips it off in streaks and carries it away.',
      'Each paper fleck keeps the colour of the bit of sketch it tore from.',
    ],
    play: 'Click the paper to send a gust: it blows a hole outward from where you clicked.',
  },
  {
    id: 'earth', num: '04', label: 'Earth', name: 'Break the draft', color: '#e9a85a',
    aria: 'Earth. Scroll to break the wireframe apart and reveal the finished design.',
    summary: 'A pencil wireframe cracks along jagged fault lines and falls apart chunk by chunk, revealing the finished design underneath. Click to start a quake.',
    body: [
      'Cracks race out from the epicentre along jagged fault lines, with hairlines branching off them. Each chunk works loose and rattles, then breaks away and falls down the page, turning as it drops.',
      'Behind each one is a shadowed hole with the finished design at the bottom. Scroll fast and the ground shakes.',
    ],
    play: 'Click the paper to start a new quake.',
  },
  {
    id: 'lightning', num: '05', label: 'Lightning', name: 'Strike the draft', color: '#a78bfa',
    aria: 'Lightning. Scroll to strike the wireframe and reveal the finished design. Contains brief flashes.',
    summary: 'Lightning strikes a pencil wireframe and the finished design spreads out from every bolt. Click to call down your own.',
    body: [
      'Four bolts grow as branching random walks, and each one gets its own distance field. When your scroll reaches a bolt, it strikes.',
      'The bolt flashes, and the reveal spreads out from the channel it burned.',
    ],
    play: 'Click the paper to call down your own bolt.',
  },
];
