// Writes index.html (all five chapters) and one page per element (fire.html, water.html, …) from the copy below.
// Run after editing: node scripts/pages.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SITE = 'https://weather-the-draft.vercel.app';
const PLAYGROUND = 'https://www.brightkumedzro.com/playground';
const root = fileURLToPath(new URL('..', import.meta.url));

const ELEMENTS = [
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

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

const head = ({ title, description, path, image }) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${esc(title)} · Bright Kumedzro</title>
  <meta name="description" content="${esc(description)}">
  <meta name="theme-color" content="#0b0b0c">
  <link rel="canonical" href="${SITE}${path}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${SITE}${path}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:image" content="${SITE}/og/${image}.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="${SITE}/og/${image}.png">
  <link rel="icon" href="/bk-mark.png" type="image/png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/style.css">
  <script type="module" src="/js/main.js"></script>
</head>
<body>
  <main>`;

const foot = `
      <p class="small foot">© 2026 Bright Kumedzro</p>
    </section>
  </main>
</body>
</html>
`;

const track = (e) => `    <section id="${e.id}" class="track" data-el="${e.id}" aria-label="${esc(e.aria)}"></section>`;
const chip = (e, href) => `<a href="${href}" style="--c:${e.color}"><span>${e.num}</span>${e.label}</a>`;

const smallPrint = 'Raw WebGL2 and canvas, no libraries. Without WebGL2 it falls back to a wipe. With reduced motion on it cross-fades instead, with no flashes.';

/* All five, one after another */
const index = `${head({ title: 'Weather the draft', description: 'Five scroll-driven WebGL reveals. Fire, water, air, earth and lightning each take a pencil wireframe apart and leave the finished design.', path: '/', image: 'weather' })}
    <header class="intro">
      <a class="pill back" href="${PLAYGROUND}">← Playground</a>
      <p class="eyebrow">Playground · Experiment</p>
      <h1>Weather the draft</h1>
      <p class="lede">Five elements, one pencil sketch. Fire, water, air, earth and lightning each take the same wireframe apart in their own way and leave the finished design behind.</p>
      <nav class="chapters" aria-label="Chapters">
        ${ELEMENTS.map((e) => chip(e, `#${e.id}`)).join('\n        ')}
      </nav>
      <p class="cue">Scroll to begin</p>
    </header>

${ELEMENTS.map(track).join('\n')}

    <section class="after">
      <p class="eyebrow">Playground · Experiment</p>
      <h2>Five ways to lose a draft</h2>
      <p>Every chapter holds the same two drawings: a pencil wireframe on paper and the finished design underneath. A WebGL2 shader gives each pixel a fuel value and decides, pixel by pixel, which drawing you see. Scrolling pushes the front through the fuel. Each element shapes that fuel differently and does different damage at the edge.</p>
      <dl class="elements">
${ELEMENTS.map((e) => `        <div style="--c:${e.color}">
          <dt><a href="/${e.id}">${e.label} · ${e.name}</a></dt>
          <dd>${e.body.join(' ')} ${e.play}</dd>
        </div>`).join('\n')}
      </dl>
      <p>Scroll back up in any chapter and the draft comes back. Each element also has a page of its own.</p>
      <div class="actions">
        <button id="again" class="btn primary" type="button">Run it again</button>
        <a class="btn" href="/use">Use it in your project</a>
        <a class="btn" href="${PLAYGROUND}">More on the playground</a>
      </div>
      <p class="small">${smallPrint} One WebGL canvas draws all five chapters, each with its own fragment shader.</p>`;

writeFileSync(`${root}/index.html`, index + foot);

/* One element on its own */
for (const e of ELEMENTS) {
  const others = ELEMENTS.filter((o) => o !== e);
  const page = `${head({ title: e.name, description: e.summary, path: `/${e.id}`, image: e.id })}
${track(e)}

    <section class="after" style="--c:${e.color}">
      <p class="eyebrow">Playground · Weather the draft</p>
      <h1>${e.name}</h1>
${e.body.map((p) => `      <p>${p}</p>`).join('\n')}
      <p>${e.play} Scroll back up and the draft comes back.</p>
      <div class="actions">
        <button id="again" class="btn primary" type="button">Run it again</button>
        <a class="btn" href="/">All five in a row</a>
        <a class="btn" href="/use">Use it in your project</a>
        <a class="btn" href="${PLAYGROUND}">More on the playground</a>
      </div>
      <p class="others-label">The other elements</p>
      <nav class="chapters" aria-label="The other elements">
        ${others.map((o) => chip(o, `/${o.id}`)).join('\n        ')}
      </nav>
      <p class="small">${smallPrint}</p>`;
  writeFileSync(`${root}/${e.id}.html`, page + foot);
}

console.log('wrote index.html and', ELEMENTS.map((e) => `${e.id}.html`).join(', '));
