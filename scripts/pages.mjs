// Writes the demo site from the copy in scripts/copy-*.mjs: index.html (both packs), one page per pack
// (elemental.html, shinobi.html: every chapter in a row) and one page per effect (fire.html, … twister.html).
// Run after editing: node scripts/pages.mjs
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ELEMENTS } from './copy-elemental.mjs';
import { TECHNIQUES } from './copy-shinobi.mjs';

const SITE = 'https://reveal.brightkumedzro.com';   // the site's address, in one place, for when it moves
const HOME = 'https://www.brightkumedzro.com';
const PLAYGROUND = `${HOME}/playground`;
const root = fileURLToPath(new URL('..', import.meta.url));

const PACKS = [
  {
    id: 'elemental', title: 'Elemental', color: '#33adff', effects: ELEMENTS, og: 'elemental', count: 'Six', unit: 'element',
    lede: 'Six elements, one pencil sketch. Fire, water, air, earth, lightning and frost each take the same wireframe apart in their own way and leave the finished design behind.',
    how: 'A WebGL2 shader gives each pixel a fuel value and decides, pixel by pixel, which drawing you see. Scrolling pushes the front through the fuel. Each element shapes that fuel differently and does different damage at the edge.',
    eyebrow: 'Elemental pack',
    tagline: 'Six elements take the same pencil sketch apart, each in its own way, and leave the finished design behind.',
    short: 'Fire, water, air, earth, lightning and frost each take the same wireframe apart in their own way.',
  },
  {
    id: 'shinobi', title: 'Shinobi', color: '#ff8a3d', effects: TECHNIQUES, count: 'Eight', unit: 'technique', ink: true,
    lede: 'Eight techniques, one pencil sketch. A crowd of clones goes up in smoke one by one, a sand vortex grinds the draft away, a spinning sphere drills straight through it, a lightning blade runs it through, a wall of dust scours it off, a growing twister tears it up, a molten sphere melts it and a shuriken of wind shreds it. Each leaves the finished design behind.',
    how: 'A WebGL2 shader decides, pixel by pixel, which drawing you see, and your scroll drives the technique.',
    eyebrow: 'Shinobi pack', og: 'shinobi',
    tagline: 'Eight anime-inspired techniques take the same pencil sketch apart and leave the finished design behind.',
    short: 'Clones, sand, spinning spheres, molten rock, a lightning blade and a shuriken of wind: anime-inspired techniques, every effect written from scratch.',
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
  <meta name="theme-color" content="#0c0c0c">
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
/* The footer on every page: who made it, and the way back to the portfolio (same order and labels as its nav). */
export const FOOTER = `
    <footer class="site-foot">
      <a class="me" href="${HOME}"><img src="/bk-mark.png" alt="" width="34" height="34"><span><b>Bright Kumedzro</b><span>Product designer &amp; manager</span></span></a>
      <nav aria-label="Bright Kumedzro's site">
        <a href="${HOME}">Work</a>
        <a href="${HOME}/about">About</a>
        <a href="${PLAYGROUND}">Playground</a>
        <a class="talk" href="${HOME}/contact"><i></i>Let's talk</a>
      </nav>
      <p class="where">Accra, Ghana · 2026</p>
    </footer>`;
const foot = `
    </section>${FOOTER}
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
const index = `${head({ title: 'Reveal', description: 'Scroll-driven WebGL reveals that take a pencil wireframe apart and leave the finished design, in two packs: elemental and shinobi. One library, fourteen effects.', path: '/', image: 'reveal', script: false, cls: 'home' })}
    <header class="intro">
      <a class="pill back" href="${PLAYGROUND}">← Playground</a>
      <p class="eyebrow">Playground · Library</p>
      <h1>Reveal. <span class="rest">Fourteen ways to take a first draft apart and leave the finished design behind, between any two images.</span></h1>
      <div class="actions">
        <a class="btn primary" href="/use">Use it in your project</a>
        <a class="btn" href="/stats">Who's using it</a>
      </div>
      <p class="install"><span>$</span> npm i @brightkumedzro/reveal</p>
    </header>
    <section class="after packs">
      <div class="grid">
${PACKS.map((p) => `        <article class="pack" style="--c:${p.color}">
          <a class="shot" href="/${p.id}" tabindex="-1" aria-hidden="true"><img src="/og/${p.og}.png" alt="" width="1200" height="630" loading="lazy"></a>
          <div class="txt">
            <p class="eyebrow">${p.eyebrow} · ${p.effects.length} effects</p>
            <h2><a href="/${p.id}">${p.title}</a></h2>
            <p>${p.short}</p>
            <nav class="chapters" aria-label="${p.title} effects">
              ${p.effects.map((e) => chip(e, `/${e.id}`)).join('\n              ')}
            </nav>
            <div class="actions"><a class="btn primary" href="/${p.id}">See all ${p.count.toLowerCase()} in a row</a></div>
          </div>
        </article>`).join('\n')}
      </div>
      <div class="more">
        <p class="small">${SMALL}</p>
      </div>`;
writeFileSync(`${root}/index.html`, index + foot);

/* One pack: every chapter in a row */
for (const p of PACKS) {
  const other = PACKS.find((o) => o !== p);
  const page = `${head({ title: `${p.title} · Reveal`, description: p.lede, path: `/${p.id}`, image: p.og, cls: p.ink ? 'shinobi' : '' })}
    <header class="intro pack-intro" style="--c:${p.color}">${glyph(p)}
      <a class="pill back" href="/">← Reveal</a>
      <p class="eyebrow">Reveal · ${p.eyebrow} · ${p.effects.length} effects</p>
      <h1>${p.title}.${p.ink ? ' <span class="seal" aria-hidden="true">忍</span>' : ''} <span class="rest">${p.tagline}</span></h1>
      <a class="banner" href="#${p.effects[0].id}" aria-label="Start with ${p.effects[0].label}"><img src="/og/${p.og}.png" alt="" width="1200" height="630"></a>
      <nav class="chapters" aria-label="Chapters">
        ${p.effects.map((e) => chip(e, `#${e.id}`)).join('\n        ')}
      </nav>
      <div class="go">${SOUND_BTN}<span class="cue">Scroll to begin <span aria-hidden="true">↓</span></span></div>
    </header>

${p.effects.map(track).join('\n')}

    <section class="after">
      <p class="eyebrow">Reveal · ${p.eyebrow}</p>
      <h2>${p.count} ways to lose a draft. <span class="rest">Same sketch, same design, a different way through.</span></h2>
      <p>Every chapter holds the same two drawings: a pencil wireframe on paper and the finished design underneath. ${p.how}</p>
      <div class="fx-cards">
${p.effects.map((e) => `        <a class="fx" href="/${e.id}" style="--c:${e.color}">
          <span class="fx-top"><span class="num">${e.num}</span><b>${e.label}</b><span class="name">${e.name}</span></span>
          <span class="fx-body">${e.summary}</span>
          <span class="fx-go">Open on its own →</span>
        </a>`).join('\n')}
      </div>
      <p>Scroll back up in any chapter and the draft comes back. Each ${p.unit} also has a page of its own.</p>
      <div class="actions">
        <button id="again" class="btn primary" type="button">Run it again</button>
        <a class="btn" href="/${other.id}">The ${other.title.toLowerCase()} pack</a>
        <a class="btn" href="/use">Use it in your project</a>
      </div>
      <p class="small">${SMALL} One WebGL canvas draws every chapter, each with its own fragment shader.</p>${credit(p)}`;
  writeFileSync(`${root}/${p.id}.html`, page + foot);
}

/* One effect on its own (its own share image if it has one, else its pack's) */
for (const e of ALL) {
  const p = e.pack, others = p.effects.filter((o) => o.id !== e.id);
  const page = `${head({ title: p.ink ? e.label : e.name, description: e.summary, path: `/${e.id}`, image: existsSync(`${root}/og/${e.id}.png`) ? e.id : p.og, cls: p.ink ? 'shinobi' : '' })}
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
