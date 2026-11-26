// Writes the demo site from the copy in scripts/copy-*.mjs: index.html (both packs), one page per pack
// (elemental.html, shinobi.html: every chapter in a row) and one page per effect (fire.html, … twister.html).
// Run after editing: node scripts/pages.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ELEMENTS } from './copy-elemental.mjs';
import { TECHNIQUES } from './copy-shinobi.mjs';

const SITE = 'https://reveal.brightkumedzro.com';   // the site's address, in one place, for when it moves
const PLAYGROUND = 'https://www.brightkumedzro.com/playground';
const root = fileURLToPath(new URL('..', import.meta.url));

const PACKS = [
  {
    id: 'elemental', title: 'Elemental', color: '#33adff', effects: ELEMENTS, og: 'elemental', count: 'Five', unit: 'element',
    lede: 'Five elements, one pencil sketch. Fire, water, air, earth and lightning each take the same wireframe apart in their own way and leave the finished design behind.',
    how: 'A WebGL2 shader gives each pixel a fuel value and decides, pixel by pixel, which drawing you see. Scrolling pushes the front through the fuel. Each element shapes that fuel differently and does different damage at the edge.',
    eyebrow: 'Elemental pack',
  },
  {
    id: 'shinobi', title: 'Shinobi', color: '#ff8a3d', effects: TECHNIQUES, count: 'Six', unit: 'technique', ink: true,
    lede: 'Six techniques, one pencil sketch. A crowd of clones goes up in smoke one by one, a sand vortex grinds the draft away, a spinning sphere drills straight through it, a lightning blade runs it through, a wall of dust scours it off and a growing twister tears it up. Each leaves the finished design behind.',
    how: 'A WebGL2 shader decides, pixel by pixel, which drawing you see, and your scroll drives the technique.',
    eyebrow: 'Shinobi pack',
    credit: 'Anime-inspired techniques, every effect written from scratch.',
  },
];
const ALL = PACKS.flatMap((p) => p.effects.map((e) => ({ ...e, pack: p })));

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const head = ({ title, description, path, image, script = true, cls = '' }) => `<!doctype html>
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
  <meta property="og:description" content="${esc(description)}">${image ? `
  <meta property="og:image" content="${SITE}/og/${image}.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="${SITE}/og/${image}.png">` : ''}
  <link rel="icon" href="/bk-mark.png" type="image/png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/style.css">${script ? `
  <script type="module" src="/js/main.js"></script>` : ''}
</head>
<body${cls ? ` class="${cls}"` : ''}>
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
const SPEAKER = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor"/><path class="w" d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/><path class="x" d="m16 9 6 6m0-6-6 6"/></svg>';
const SOUND_BTN = `<button class="pill snd" type="button" data-sound-toggle aria-pressed="false">${SPEAKER}<span class="snd-label">Sound off</span></button>`;
const SMALL = 'Raw WebGL2 and canvas, no libraries. Without WebGL2 it falls back to a wipe. With reduced motion on it cross-fades instead, with no flashes. Sound is off until you turn it on, and every sound is synthesised in the browser with Web Audio, so there are no audio files.';
const credit = (p) => (p.credit ? `\n      <p class="small credit">${p.credit}</p>` : '');
const glyph = (p) => (p.ink ? '\n      <p class="glyph" aria-hidden="true">忍</p>' : '');
const titleRow = (p, text) => (p.ink ? `<div class="title-row"><h1>${text}</h1><span class="seal" aria-hidden="true">忍</span></div>` : `<h1>${text}</h1>`);

/* The landing page: both packs, how to use them, no chapters (so no WebGL until you pick one) */
const index = `${head({ title: 'Reveal', description: 'Scroll-driven WebGL reveals that take a pencil wireframe apart and leave the finished design, in two packs: elemental and shinobi. One library, eleven effects.', path: '/', image: 'elemental', script: false })}
    <header class="intro">
      <a class="pill back" href="${PLAYGROUND}">← Playground</a>
      <p class="eyebrow">Playground · Library</p>
      <h1>Reveal</h1>
      <p class="lede">Eleven ways to take a first draft apart and leave the finished design behind, in two packs. Pick a pack to see every effect in a row, or open one on its own.</p>
    </header>
    <section class="after packs">
${PACKS.map((p) => `      <div class="pack" style="--c:${p.color}">
        <p class="eyebrow">${p.eyebrow} · ${p.effects.length} effects</p>
        <h2><a href="/${p.id}">${p.title}</a></h2>
        <p>${p.lede}</p>
        <nav class="chapters" aria-label="${p.title} effects">
          ${p.effects.map((e) => chip(e, `/${e.id}`)).join('\n          ')}
        </nav>
        <div class="actions"><a class="btn primary" href="/${p.id}">See all ${p.count.toLowerCase()} in a row</a></div>
      </div>`).join('\n')}
      <div class="actions">
        <a class="btn primary" href="/use">Use it in your project</a>
        <a class="btn" href="/stats">Who's using it</a>
        <a class="btn" href="${PLAYGROUND}">More on the playground</a>
      </div>
      <p class="small">${SMALL}</p>`;
writeFileSync(`${root}/index.html`, index + foot);

/* One pack: every chapter in a row */
for (const p of PACKS) {
  const other = PACKS.find((o) => o !== p);
  const page = `${head({ title: `${p.title} · Reveal`, description: p.lede, path: `/${p.id}`, image: p.og, cls: p.ink ? 'shinobi' : '' })}
    <header class="intro">${glyph(p)}
      <a class="pill back" href="/">← Reveal</a>
      <p class="eyebrow">Reveal · ${p.eyebrow}</p>
      ${titleRow(p, p.title)}
      <p class="lede">${p.lede}</p>
      <nav class="chapters" aria-label="Chapters">
        ${p.effects.map((e) => chip(e, `#${e.id}`)).join('\n        ')}
      </nav>
      ${SOUND_BTN}
      <p class="cue">Scroll to begin</p>
    </header>

${p.effects.map(track).join('\n')}

    <section class="after">
      <p class="eyebrow">Reveal · ${p.eyebrow}</p>
      <h2>${p.count} ways to lose a draft</h2>
      <p>Every chapter holds the same two drawings: a pencil wireframe on paper and the finished design underneath. ${p.how}</p>
      <dl class="elements">
${p.effects.map((e) => `        <div style="--c:${e.color}">
          <dt><a href="/${e.id}">${e.label} · ${e.name}</a></dt>
          <dd>${e.body.join(' ')} ${e.play}</dd>
        </div>`).join('\n')}
      </dl>
      <p>Scroll back up in any chapter and the draft comes back. Each ${p.unit} also has a page of its own.</p>
      <div class="actions">
        <button id="again" class="btn primary" type="button">Run it again</button>
        <a class="btn" href="/${other.id}">The ${other.title.toLowerCase()} pack</a>
        <a class="btn" href="/use">Use it in your project</a>
      </div>
      <p class="small">${SMALL} One WebGL canvas draws every chapter, each with its own fragment shader.</p>${credit(p)}`;
  writeFileSync(`${root}/${p.id}.html`, page + foot);
}

/* One effect on its own */
for (const e of ALL) {
  const p = e.pack, others = p.effects.filter((o) => o !== e);
  const page = `${head({ title: p.ink ? e.label : e.name, description: e.summary, path: `/${e.id}`, image: p.og ? e.id : null, cls: p.ink ? 'shinobi' : '' })}
${track(e)}

    <section class="after" style="--c:${e.color}">
      <p class="eyebrow">Reveal · ${p.eyebrow}</p>
      <h1>${p.ink ? e.label : e.name}</h1>
${e.body.map((t) => `      <p>${t}</p>`).join('\n')}
      <p>${e.play} Scroll back up and the draft comes back.</p>
      <div class="actions">
        <button id="again" class="btn primary" type="button">Run it again</button>
        <a class="btn" href="/${p.id}">All ${p.count.toLowerCase()} in a row</a>
        <a class="btn" href="/use">Use it in your project</a>
      </div>
      <p class="others-label">The other ${p.unit}s</p>
      <nav class="chapters" aria-label="The other ${p.unit}s">
        ${others.map((o) => chip(o, `/${o.id}`)).join('\n        ')}
      </nav>
      <p class="small">${SMALL}</p>${credit(p)}`;
  writeFileSync(`${root}/${e.id}.html`, page + foot);
}

console.log('wrote index.html,', PACKS.map((p) => `${p.id}.html`).join(', '), 'and', ALL.map((e) => `${e.id}.html`).join(', '));
