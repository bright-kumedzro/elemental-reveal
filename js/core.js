/* Elemental Reveal: the shared engine.
   Four chapters (water, air, earth, lightning) each take a pencil wireframe apart and leave the finished design.
   Every chapter paints the same two drawings from one layout (the draft on paper, the final on dark) and uploads
   them as textures. One fixed WebGL2 canvas sits behind the page; each frame, every chapter on screen is drawn into
   its own stage's rectangle with its own fragment shader. A fixed 2D canvas above it carries the particles.
   An element module supplies the shader, a JS mirror of its fuel function (so particles know where the front is),
   and its particles. Modes per chapter: gl (WebGL2) · clip (no WebGL2: CSS wipe) · fade (reduced motion). */

// Safe to import where there is no window (server rendering); the effects only run in the browser.
const mq = (q) => typeof matchMedia === 'function' && matchMedia(q).matches;
export const reduce = mq('(prefers-reduced-motion: reduce)');
export const fine = mq('(hover: hover) and (pointer: fine)');
export const lite = mq('(max-width: 699px)') || (typeof navigator !== 'undefined' && (navigator.hardwareConcurrency || 8) <= 4);
export const OCT = lite ? 3 : 5;          // fbm octaves, shared by the shaders and the JS copies
export const DONE = 0.9;                  // chapter progress at which the draft is fully gone
export const MAX_SEEDS = 6;
const IGNITE = 0.085, IGNITE_MS = 900;
const PAPER = [241 / 255, 233 / 255, 216 / 255];

/* ---------- noise: an integer hash, so the shaders and JS agree exactly ---------- */
const INV = 1 / 4294967295;
export function hh(ix, iy) {
  let x = (ix + 4096) >>> 0, y = (iy + 4096) >>> 0;
  x = Math.imul(x, 1597334673) >>> 0;
  y = Math.imul(y, 3812015801) >>> 0;
  return (Math.imul((x ^ y) >>> 0, 1597334673) >>> 0) * INV;
}
export function vn(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hh(ix, iy), b = hh(ix + 1, iy), c = hh(ix, iy + 1), d = hh(ix + 1, iy + 1);
  const top = a + (b - a) * fx, bot = c + (d - c) * fx;
  return top + (bot - top) * fy;
}
export function fbm(x, y) {
  let s = 0, a = 0.5;
  for (let i = 0; i < OCT; i++) { s += a * vn(x, y); x = x * 2.03 + 17.1; y = y * 2.03 + 9.2; a *= 0.5; }
  return s;
}
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const rand = (a, b) => a + Math.random() * (b - a);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
export const ign = (s, now) => (s.born ? IGNITE * easeOut(Math.min(1, (now - s.born) / IGNITE_MS)) : 0);

export function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Radial fronts from the click seeds (and, for earth, the home seed). Mirrors seedFuel() in GLSL_HEAD. */
export function seedFuel(ch, ax, ay, n, j, k, from, now) {
  let d = -10;
  for (let i = from; i < ch.seeds.length; i++) {
    const s = ch.seeds[i];
    const grow = Math.max(ch.p - s.p0, 0) * ch.K * k + ign(s, now) + (s.off || 0);
    d = Math.max(d, grow - (Math.hypot(ax - s.u * ch.AR, ay - s.v) + (n - 0.5) * j));
  }
  return d;
}

export const GLSL_HEAD = `#version 300 es
precision highp float;
precision highp int;
in vec2 vUv; out vec4 o;
uniform sampler2D uDraft, uFinal;
uniform float uAr, uP, uK, uT, uOct, uPtrOn, uQuake;
uniform vec2 uPtr;
uniform int uN;
uniform vec4 uSeeds[${MAX_SEEDS}];   // xy: position (aspect units) · z: progress when lit · w: ignition + offset

float h(vec2 p) {
  uvec2 q = uvec2(ivec2(floor(p)) + 4096);
  q *= uvec2(1597334673u, 3812015801u);
  uint n = (q.x ^ q.y) * 1597334673u;
  return float(n) * (1. / 4294967295.);
}
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3. - 2. * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0., a = .5;
  for (int i = 0; i < 5; i++) {
    if (float(i) >= uOct) break;
    s += a * vn(p); p = p * 2.03 + vec2(17.1, 9.2); a *= .5;
  }
  return s;
}
float seedFuel(vec2 a, float n, float j, float k, int from) {
  float d = -10.;
  for (int i = 0; i < ${MAX_SEEDS}; i++) {
    if (i >= uN) break;
    if (i < from) continue;
    vec4 s = uSeeds[i];
    d = max(d, max(uP - s.z, 0.) * uK * k + s.w - (distance(a, s.xy) + (n - .5) * j));
  }
  return d;
}
`;

/* ---------- the two drawings ---------- */
let W = 1, H = 1;   // the stage being painted; set by paint()

const CARDS = [
  ['Product design', 'Wireframes to shipped UI'],
  ['Product ownership', 'Roadmaps that hold up'],
  ['Development', 'Built, not just drawn'],
];
const JAK = '"Plus Jakarta Sans", system-ui, sans-serif';
const CAV = 'Caveat, "Segoe Print", cursive';
const hexA = (hex, a) => { const v = parseInt(hex.slice(1), 16); return `rgba(${v >> 16},${(v >> 8) & 255},${v & 255},${a})`; };

function wrap(c, text, maxW, maxLines) {
  const words = text.split(' '), lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (c.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}

/* One layout, used by both drawings so the final lands exactly where the sketch was. */
function layout(c, th) {
  const wide = W >= 820 && W / H > 1.1;
  const pad = Math.max(20, Math.min(64, W * 0.05));
  const bottom = H - 60;                                     // keep clear of the HUD pills
  let S = wide ? Math.min(W * 0.064, H * 0.125, 108) : Math.min(W * 0.12, H * 0.072, 64);
  const L = { wide, pad };
  L.nav = { x: pad, y: Math.max(16, pad * 0.55), w: W - 2 * pad, h: 40 };
  const top = L.nav.y + L.nav.h;
  L.hero = { x: pad, y: wide ? Math.max(top + 56, H * 0.22) : Math.max(top + 44, H * 0.14), w: wide ? W * 0.46 : W - 2 * pad };
  c.font = `800 ${S}px ${JAK}`;
  const widest = Math.max(...th.final.map((t) => c.measureText(t).width));
  if (widest > L.hero.w) S *= L.hero.w / widest;            // long headlines shrink to fit
  L.S = S;
  L.h1 = [L.hero.y + S * 0.92, L.hero.y + S * 1.94];
  L.sub = wide ? Math.max(15, Math.min(19, W * 0.0125)) : 15;
  L.lh = L.sub * 1.6;
  c.font = `400 ${L.sub}px ${JAK}`;
  L.subLines = wrap(c, th.sub, Math.min(L.hero.w, 460), 3);
  L.subY = L.h1[1] + S * 0.28 + L.lh;
  L.btn = { y: L.subY + L.lh * (L.subLines.length - 1) + 30, h: 46, w1: 156, w2: 132 };
  const btnBottom = L.btn.y + L.btn.h;

  const ch = wide ? Math.min(H * 0.18, 150) : Math.min(H * 0.15, 128);
  const cardsY = bottom - ch;
  L.cards = cardsY > btnBottom + 28 && (wide || cardsY > btnBottom + 160)
    ? { y: cardsY, h: ch, n: wide ? 3 : 2, gap: 16 } : null;
  const imgBottom = (L.cards ? L.cards.y : bottom) - 28;
  L.img = wide
    ? { x: W * 0.57, y: L.hero.y - 30, w: W * 0.43 - pad, h: Math.min(H * 0.52, imgBottom - (L.hero.y - 30)) }
    : { x: pad, y: btnBottom + 28, w: W - 2 * pad, h: imgBottom - (btnBottom + 28) };
  if (L.img.h < 90) L.img = null;
  return L;
}

function cardBoxes(L) {
  if (!L.cards) return [];
  const { y, h, n, gap } = L.cards, w = (W - 2 * L.pad - gap * (n - 1)) / n;
  return Array.from({ length: n }, (_, i) => ({ x: L.pad + i * (w + gap), y, w, h }));
}

let grain = null;
function grainPattern(c) {
  if (!grain) {
    grain = document.createElement('canvas');
    grain.width = grain.height = 160;
    const g = grain.getContext('2d'), img = g.createImageData(160, 160), r = rng(3);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = r();
      img.data[i] = 90; img.data[i + 1] = 70; img.data[i + 2] = 45;
      img.data[i + 3] = v > 0.5 ? (v - 0.5) * 46 : 0;
    }
    g.putImageData(img, 0, 0);
  }
  return c.createPattern(grain, 'repeat');
}

function drawDraft(c, L, th) {
  const r = rng(11), j = (k = 1.6) => (r() - 0.5) * 2 * k;
  c.fillStyle = '#f1e9d8'; c.fillRect(0, 0, W, H);
  c.fillStyle = grainPattern(c); c.fillRect(0, 0, W, H);
  const vg = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.62);
  vg.addColorStop(0, 'rgba(120,90,50,0)'); vg.addColorStop(1, 'rgba(120,90,50,.16)');
  c.fillStyle = vg; c.fillRect(0, 0, W, H);
  c.fillStyle = 'rgba(70,55,40,.14)';
  for (let x = 12; x < W; x += 24) for (let y = 12; y < H; y += 24) c.fillRect(x, y, 1.5, 1.5);

  // a coffee ring, because it's a real draft
  const rx = W * (L.wide ? 0.9 : 0.82), ry = H * (L.wide ? 0.13 : 0.11), rr = Math.min(W, H) * 0.07;
  c.strokeStyle = 'rgba(125,80,35,.09)'; c.lineWidth = 7;
  c.beginPath(); c.arc(rx, ry, rr, 0.3, Math.PI * 1.85); c.stroke();
  c.lineWidth = 2; c.beginPath(); c.arc(rx + 3, ry + 2, rr - 7, 0, Math.PI * 2); c.stroke();

  const pencil = 'rgba(42,37,32,.86)', red = '#c0392b';
  c.lineCap = 'round'; c.lineJoin = 'round';
  const line = (x1, y1, x2, y2, k = 1.4) => {
    for (let pass = 0; pass < 2; pass++) {
      c.globalAlpha = pass ? 0.45 : 1;
      c.beginPath(); c.moveTo(x1 + j(k), y1 + j(k));
      c.quadraticCurveTo((x1 + x2) / 2 + j(k * 1.6), (y1 + y2) / 2 + j(k * 1.6), x2 + j(k), y2 + j(k));
      c.stroke();
    }
    c.globalAlpha = 1;
  };
  const box = (x, y, w, h, k) => { line(x, y, x + w, y, k); line(x + w, y, x + w, y + h, k); line(x + w, y + h, x, y + h, k); line(x, y + h, x, y, k); };
  const wave = (x, y, w, amp = 2.2) => {
    c.beginPath(); c.moveTo(x, y);
    for (let t = 0; t <= w; t += 6) c.lineTo(x + t, y + Math.sin(t * 0.21 + r() * 0.8) * amp + j(0.6));
    c.stroke();
  };
  const hand = (txt, x, y, size, color = pencil, weight = 500, align = 'left') => {
    c.font = `${weight} ${size}px ${CAV}`; c.fillStyle = color; c.textAlign = align; c.fillText(txt, x, y); c.textAlign = 'left';
  };
  c.strokeStyle = pencil; c.lineWidth = 1.6;

  // nav
  const nv = L.nav;
  box(nv.x, nv.y, 38, 38); hand('BK', nv.x + 19, nv.y + 27, 22, pencil, 700, 'center');
  const pillW = 112;
  box(nv.x + nv.w - pillW, nv.y + 2, pillW, 36, 1.8);
  hand("let's talk", nv.x + nv.w - pillW / 2, nv.y + 27, 22, pencil, 500, 'center');
  if (L.wide) hand('work      about      playground', nv.x + nv.w - pillW - 28, nv.y + 27, 22, pencil, 500, 'right');
  else { const mx = nv.x + nv.w - pillW - 40; for (let i = 0; i < 3; i++) line(mx, nv.y + 12 + i * 8, mx + 22, nv.y + 12 + i * 8, 1); }

  // headline
  hand(th.draft[0], L.hero.x, L.h1[0], L.S * 1.06, pencil, 700);
  hand(th.draft[1], L.hero.x, L.h1[1], L.S * 1.06, pencil, 700);
  c.font = `700 ${L.S * 1.06}px ${CAV}`;
  const h2w = c.measureText(th.draft[1]).width;
  c.lineWidth = 2.2; wave(L.hero.x, L.h1[1] + L.S * 0.18, h2w, 3); c.lineWidth = 1.6;
  if (L.wide) {
    const w1 = c.measureText(th.draft[0]).width, ax = L.hero.x + w1 + 30, ay = L.h1[0] - L.S * 0.35;
    c.strokeStyle = red; c.lineWidth = 1.8;
    c.beginPath(); c.moveTo(ax + 70, ay - 6); c.quadraticCurveTo(ax + 20, ay - 22, ax, ay); c.stroke();
    line(ax, ay, ax + 10, ay - 9, 0.6); line(ax, ay, ax + 13, ay + 3, 0.6);
    hand(th.aside, ax + 76, ay, 26, red, 600);
    c.strokeStyle = pencil; c.lineWidth = 1.6;
  }

  // body copy as pencil squiggles, one per wrapped line of the real text
  c.font = `400 ${L.sub}px ${JAK}`;
  L.subLines.forEach((t, i) => wave(L.hero.x, L.subY + i * L.lh - L.sub * 0.3, c.measureText(t).width * 0.96));

  // buttons: the primary one is hatched
  const b = L.btn, bx2 = L.hero.x + b.w1 + 12;
  box(L.hero.x, b.y, b.w1, b.h, 1.8);
  c.save(); c.beginPath(); c.rect(L.hero.x, b.y, b.w1, b.h); c.clip();
  c.globalAlpha = 0.14; for (let x = -b.h; x < b.w1; x += 7) line(L.hero.x + x, b.y + b.h, L.hero.x + x + b.h, b.y, 0.5);
  c.restore();
  hand('see the work', L.hero.x + b.w1 / 2, b.y + 31, 23, pencil, 700, 'center');
  box(bx2, b.y, b.w2, b.h, 1.8);
  hand('playground', bx2 + b.w2 / 2, b.y + 31, 23, pencil, 500, 'center');

  // hero visual placeholder
  if (L.img) {
    const im = L.img;
    box(im.x, im.y, im.w, im.h, 2);
    c.globalAlpha = 0.55; line(im.x, im.y, im.x + im.w, im.y + im.h, 2.4); line(im.x + im.w, im.y, im.x, im.y + im.h, 2.4); c.globalAlpha = 1;
    c.fillStyle = '#f1e9d8'; c.fillRect(im.x + im.w / 2 - 78, im.y + im.h / 2 - 22, 156, 36);
    hand('hero visual??', im.x + im.w / 2, im.y + im.h / 2 + 6, 26, pencil, 600, 'center');
  }

  // cards
  cardBoxes(L).forEach((bx, i) => {
    box(bx.x, bx.y, bx.w, bx.h, 1.8);
    c.beginPath(); c.arc(bx.x + 26, bx.y + 26, 9 + j(1), 0, Math.PI * 2); c.stroke();
    hand(CARDS[i][0].toLowerCase(), bx.x + 18, bx.y + 70, L.wide ? 25 : 20, pencil, 600);
    wave(bx.x + 18, bx.y + 92, Math.min(bx.w - 40, 170)); if (bx.h > 118) wave(bx.x + 18, bx.y + 108, Math.min(bx.w - 70, 110));
  });

  // sticky note
  const nw = L.wide ? 176 : 138, nh = L.wide ? 124 : 98;
  const nx = L.wide && L.img ? L.img.x - nw * 0.35 : W - L.pad - nw, ny = L.wide && L.img ? L.img.y - 20 : L.hero.y - 26;
  c.save(); c.translate(nx + nw / 2, ny + nh / 2); c.rotate(-0.07);
  c.shadowColor = 'rgba(60,40,10,.25)'; c.shadowBlur = 14; c.shadowOffsetY = 6;
  c.fillStyle = '#ffe27a'; c.fillRect(-nw / 2, -nh / 2, nw, nh);
  c.shadowColor = 'transparent';
  const fs = L.wide ? 26 : 21;
  hand(th.note[0], -nw / 2 + 14, -nh / 2 + fs + 6, fs, pencil, 700);
  hand(th.note[1], -nw / 2 + 14, -nh / 2 + fs * 2 + 8, fs, pencil, 500);
  hand(th.note[2], -nw / 2 + 14, -nh / 2 + fs * 3 + 10, fs, red, 700);
  c.restore();
}

function drawFinal(c, L, th, mark) {
  c.fillStyle = '#0b0b0c'; c.fillRect(0, 0, W, H);
  const glow = (x, y, rad, col) => { const g = c.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H); };
  glow(W * 0.78, H * 0.3, Math.max(W, H) * 0.5, th.glowA);
  glow(W * 0.2, H * 1.05, Math.max(W, H) * 0.55, th.glowB);

  const rr = (x, y, w, h, rad) => { c.beginPath(); c.moveTo(x + rad, y); c.arcTo(x + w, y, x + w, y + h, rad); c.arcTo(x + w, y + h, x, y + h, rad); c.arcTo(x, y + h, x, y, rad); c.arcTo(x, y, x + w, y, rad); c.closePath(); };
  const txt = (s, x, y, font, col, align = 'left', ls = '0px') => { c.font = font; c.fillStyle = col; c.textAlign = align; if ('letterSpacing' in c) c.letterSpacing = ls; c.fillText(s, x, y); c.textAlign = 'left'; if ('letterSpacing' in c) c.letterSpacing = '0px'; };

  // nav
  const nv = L.nav;
  if (mark) { c.save(); rr(nv.x, nv.y, 38, 38, 10); c.clip(); c.drawImage(mark, nv.x, nv.y, 38, 38); c.restore(); }
  else { rr(nv.x, nv.y, 38, 38, 10); c.fillStyle = '#f1f1ef'; c.fill(); txt('BK', nv.x + 19, nv.y + 25, `800 14px ${JAK}`, '#0b0b0c', 'center'); }
  const pillW = 118, px = nv.x + nv.w - pillW;
  rr(px, nv.y + 2, pillW, 36, 18); c.fillStyle = '#161618'; c.fill(); c.strokeStyle = '#2a2a2e'; c.lineWidth = 1; c.stroke();
  c.fillStyle = '#5cc976'; c.beginPath(); c.arc(px + 20, nv.y + 20, 4, 0, Math.PI * 2); c.fill();
  txt("Let's talk", px + 32, nv.y + 25, `600 14px ${JAK}`, '#f1f1ef');
  if (L.wide) txt('Work        About        Playground', px - 28, nv.y + 25, `500 14px ${JAK}`, '#a1a1aa', 'right');
  else { c.fillStyle = '#a1a1aa'; for (let i = 0; i < 3; i++) c.fillRect(px - 40, nv.y + 13 + i * 6, 18, 1.6); }

  // headline
  txt(th.kicker, L.hero.x, L.hero.y - 4, `600 12px ${JAK}`, th.accent, 'left', '1.5px');
  txt(th.final[0], L.hero.x, L.h1[0], `800 ${L.S}px ${JAK}`, '#f4f4f5', 'left', `${-L.S * 0.035}px`);
  const g = c.createLinearGradient(L.hero.x, 0, L.hero.x + L.S * 5, 0);
  g.addColorStop(0, th.accent); g.addColorStop(1, th.accent2);
  txt(th.final[1], L.hero.x, L.h1[1], `800 ${L.S}px ${JAK}`, g, 'left', `${-L.S * 0.035}px`);
  L.subLines.forEach((t, i) => txt(t, L.hero.x, L.subY + i * L.lh, `400 ${L.sub}px ${JAK}`, '#a1a1aa'));

  // buttons
  const b = L.btn, bx2 = L.hero.x + b.w1 + 12;
  rr(L.hero.x, b.y, b.w1, b.h, b.h / 2); c.fillStyle = th.accent; c.fill();
  txt('See the work  →', L.hero.x + b.w1 / 2, b.y + 28.5, `700 15px ${JAK}`, th.onAccent, 'center');
  rr(bx2, b.y, b.w2, b.h, b.h / 2); c.strokeStyle = '#2e2e33'; c.lineWidth = 1.2; c.stroke();
  txt('Playground', bx2 + b.w2 / 2, b.y + 28.5, `600 15px ${JAK}`, '#e4e4e7', 'center');

  // hero visual: a product panel with a chart that only goes one way
  if (L.img) {
    const im = L.img;
    rr(im.x, im.y, im.w, im.h, 22);
    const pg = c.createLinearGradient(0, im.y, 0, im.y + im.h); pg.addColorStop(0, '#13161b'); pg.addColorStop(1, '#0e0e10');
    c.fillStyle = pg; c.fill();
    c.save(); c.clip();
    glow(im.x + im.w * 0.8, im.y + im.h * 0.15, im.w * 0.7, hexA(th.accent, 0.22));
    glow(im.x + im.w * 0.1, im.y + im.h * 1.1, im.w * 0.6, th.glowB);
    c.restore();
    rr(im.x, im.y, im.w, im.h, 22); c.strokeStyle = '#20252c'; c.lineWidth = 1; c.stroke();
    ['#ff5f57', '#febc2e', '#28c840'].forEach((col, i) => { c.fillStyle = col; c.globalAlpha = 0.85; c.beginPath(); c.arc(im.x + 22 + i * 16, im.y + 22, 4.5, 0, Math.PI * 2); c.fill(); });
    c.globalAlpha = 1;
    const cx = im.x + 26, cw = im.w - 52, cy = im.y + 52, chh = im.h - (im.h > 220 ? 140 : 80);
    if (chh > 40) {
      c.strokeStyle = 'rgba(255,255,255,.05)';
      for (let i = 0; i <= 3; i++) { c.beginPath(); c.moveTo(cx, cy + (chh * i) / 3); c.lineTo(cx + cw, cy + (chh * i) / 3); c.stroke(); }
      const r = rng(th.seed || 5), pts = [];
      for (let i = 0, v = 0.15; i <= 14; i++) { v = Math.min(0.95, v + (r() - 0.32) * 0.12); pts.push([cx + (cw * i) / 14, cy + chh - chh * v]); }
      const fg = c.createLinearGradient(0, cy, 0, cy + chh); fg.addColorStop(0, hexA(th.accent, 0.32)); fg.addColorStop(1, hexA(th.accent, 0));
      c.beginPath(); c.moveTo(pts[0][0], cy + chh); pts.forEach(([x, y]) => c.lineTo(x, y)); c.lineTo(pts[14][0], cy + chh); c.closePath(); c.fillStyle = fg; c.fill();
      c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.strokeStyle = th.accent; c.lineWidth = 2.5; c.stroke();
      c.fillStyle = th.accent2; c.beginPath(); c.arc(pts[14][0], pts[14][1], 5, 0, Math.PI * 2); c.fill();
    }
    if (im.h > 220) {
      const chip = (x, label, val) => {
        rr(x, im.y + im.h - 72, 150, 50, 12); c.fillStyle = 'rgba(255,255,255,.04)'; c.fill(); c.strokeStyle = '#23272e'; c.stroke();
        txt(label, x + 14, im.y + im.h - 52, `500 12px ${JAK}`, '#8b8b93');
        txt(val, x + 14, im.y + im.h - 32, `700 16px ${JAK}`, '#f4f4f5');
      };
      chip(im.x + 26, th.chips[0][0], th.chips[0][1]);
      if (im.w > 380) chip(im.x + 190, th.chips[1][0], th.chips[1][1]);
    }
  }

  // cards
  cardBoxes(L).forEach((bx, i) => {
    rr(bx.x, bx.y, bx.w, bx.h, 18); c.fillStyle = '#121214'; c.fill(); c.strokeStyle = '#222226'; c.lineWidth = 1; c.stroke();
    txt(`0${i + 1}`, bx.x + 20, bx.y + 32, `600 13px ${JAK}`, th.accent);
    txt(CARDS[i][0], bx.x + 20, bx.y + 70, `700 ${L.wide ? 19 : 15}px ${JAK}`, '#f4f4f5');
    c.font = `400 14px ${JAK}`;
    if (bx.h > 100 && c.measureText(CARDS[i][1]).width < bx.w - 36) txt(CARDS[i][1], bx.x + 20, bx.y + 94, `400 14px ${JAK}`, '#8b8b93');
  });
}

/* ---------- engine ---------- */
export function boot(defs) {
  const params = new URLSearchParams(location.search);
  const capture = params.get('capture');
  const root = document.documentElement;
  const tracks = [...document.querySelectorAll('.track[data-el]')];

  const glc = document.createElement('canvas'), fxc = document.createElement('canvas');
  glc.className = 'layer'; fxc.className = 'layer';
  glc.setAttribute('aria-hidden', 'true'); fxc.setAttribute('aria-hidden', 'true');
  document.body.prepend(glc, fxc);
  const fc = fxc.getContext('2d');

  let gl = null, lost = false;
  if (!reduce) gl = glc.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
  if (!gl) root.classList.add('fallback');

  let VW = 1, VH = 1, DPR = 1, sx = 1, sy = 1, fsx = 1, fsy = 1, raf = 0, last = 0, mark = null, frozen = false;
  // If frames run slow for a while, the WebGL canvas renders at a lower resolution (the browser scales it up).
  const SCALES = [1, 0.8, 0.65, 0.5];
  let level = lite ? 1 : 0, slow = 0;   // phones start a notch down

  const VS = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main() { vUv = aPos * .5 + .5; gl_Position = vec4(aPos, 0., 1.); }`;
  let vsObj = null;

  function compile(fsSrc) {
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
      return s;
    };
    vsObj = vsObj || sh(gl.VERTEX_SHADER, VS);
    const fs = sh(gl.FRAGMENT_SHADER, fsSrc);
    if (!vsObj || !fs) return null;
    const prog = gl.createProgram();
    gl.attachShader(prog, vsObj); gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn(gl.getProgramInfoLog(prog)); return null; }
    return prog;
  }

  if (gl) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  }

  const BASE_U = ['uDraft', 'uFinal', 'uAr', 'uP', 'uK', 'uT', 'uOct', 'uPtrOn', 'uQuake', 'uPtr', 'uN', 'uSeeds'];

  function makeChapter(sec, el) {
    sec.style.setProperty('--c', el.theme.accent);
    sec.innerHTML = `<div class="stage">
      <canvas class="c-final" aria-hidden="true"></canvas>
      <canvas class="c-draft" aria-hidden="true"></canvas>
      <p class="pill hint">${el.hint}<span class="extra"> · <span class="fine">click</span><span class="coarse">tap</span> ${el.clickHint}</span></p>
      <div class="hud"><span class="pill chap"><i></i>${el.num} · ${el.label}</span><span class="pill pct">${el.hud} 0%</span></div>
    </div>`;
    const stage = sec.querySelector('.stage');
    const draftC = stage.querySelector('.c-draft'), finalC = stage.querySelector('.c-final');
    const pctEl = stage.querySelector('.pct'), hintEl = stage.querySelector('.hint');

    const ch = {
      el, sec, stage, gl,
      W: 1, H: 1, AR: 1, K: 1, DPR: 1,
      p: 0, pPrev: 0, pTarget: 0, speed: 0, quake: 0,
      seeds: [el.home()], ptr: { u: 0.5, v: 0.5, on: 0, target: 0 }, parts: [], s: {},
      rect: null, visible: false, near: false, dirty: true, tex: null, prog: null, loc: {}, low: null,
      touched: false, pctShown: -1, hintGone: false,
      mode: gl ? 'gl' : reduce ? 'fade' : 'clip',
      seedBuf: new Float32Array(MAX_SEEDS * 4),
    };
    ch.spawn = (o) => { if (ch.parts.length < (lite ? 180 : 420)) ch.parts.push(o); };
    ch.draftColor = (x, y) => {
      const lo = ch.low;
      if (!lo) return '#f1e9d8';
      const i = clamp(Math.floor((x / ch.W) * lo.w), 0, lo.w - 1), j = clamp(Math.floor((y / ch.H) * lo.h), 0, lo.h - 1), k = (j * lo.w + i) * 4;
      return `rgb(${lo.data[k]},${lo.data[k + 1]},${lo.data[k + 2]})`;
    };

    if (gl) {
      ch.prog = compile(GLSL_HEAD + el.fs);
      if (!ch.prog) ch.mode = 'clip';
      else {
        gl.useProgram(ch.prog);
        for (const u of [...BASE_U, ...(el.uniforms || [])]) ch.loc[u] = gl.getUniformLocation(ch.prog, u);
        gl.uniform1i(ch.loc.uDraft, 0);
        gl.uniform1i(ch.loc.uFinal, 1);
        gl.uniform1f(ch.loc.uOct, OCT);
        for (const [name, unit] of Object.entries(el.samplers || {})) gl.uniform1i(gl.getUniformLocation(ch.prog, name), unit);
        el.initGL?.(ch, gl);
      }
    }
    if (ch.mode !== 'gl') stage.classList.add('fallback');

    ch.measure = () => {
      const r = stage.getBoundingClientRect();
      const w = Math.max(1, r.width), h = Math.max(1, r.height);
      const changed = w !== ch.W || h !== ch.H || ch.DPR !== DPR;
      ch.W = w; ch.H = h; ch.AR = w / h; ch.DPR = DPR;
      if (el.reach) ch.K = el.reach(ch.AR) / DONE;
      if (changed) { el.resize?.(ch); ch.dirty = true; }
    };

    ch.paint = () => {
      if (ch.mode === 'gl' && !ch.near) return;
      W = ch.W; H = ch.H;
      const dpr = ch.DPR;
      for (const cv of [draftC, finalC]) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      const dc = draftC.getContext('2d'), fcx = finalC.getContext('2d');
      dc.setTransform(dpr, 0, 0, dpr, 0, 0); fcx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const L = layout(fcx, el.theme);
      drawDraft(dc, L, el.theme);
      drawFinal(fcx, L, el.theme, mark);
      if (el.wantsColor) {
        const lw = Math.max(8, Math.round(W / 6)), lh = Math.max(8, Math.round(H / 6));
        const lc = document.createElement('canvas'); lc.width = lw; lc.height = lh;
        const lx = lc.getContext('2d', { willReadFrequently: true });
        lx.drawImage(draftC, 0, 0, lw, lh);
        ch.low = { w: lw, h: lh, data: lx.getImageData(0, 0, lw, lh).data };
      }
      if (ch.mode === 'gl') {
        if (!ch.tex) ch.tex = [0, 1].map(() => {
          const t = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, t);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          return t;
        });
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        [draftC, finalC].forEach((c, i) => {
          gl.activeTexture(gl.TEXTURE0 + i);
          gl.bindTexture(gl.TEXTURE_2D, ch.tex[i]);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
        });
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        // the GPU has them now; the 2D copies only matter for the fallbacks
        for (const cv of [draftC, finalC]) { cv.width = 1; cv.height = 1; }
      }
      ch.dirty = false;
    };

    ch.release = () => {
      if (ch.tex && gl && !lost) ch.tex.forEach((t) => gl.deleteTexture(t));
      ch.tex = null; ch.dirty = true;
    };

    ch.readScroll = () => {
      const r = sec.getBoundingClientRect();
      ch.pTarget = clamp(-r.top / Math.max(1, r.height - window.innerHeight), 0, 1);
      if (ch.mode !== 'gl') ch.p = ch.pTarget;
    };

    ch.update = (dt, now) => {
      ch.pPrev = ch.p;
      if (ch.mode === 'gl') {
        ch.p += (ch.pTarget - ch.p) * (1 - Math.exp(-dt * 7));
        if (Math.abs(ch.pTarget - ch.p) < 1e-4) ch.p = ch.pTarget;
      } else ch.p = ch.pTarget;
      const sp = Math.abs(ch.p - ch.pPrev) / Math.max(dt, 1e-3);
      ch.speed += (sp - ch.speed) * (1 - Math.exp(-dt * 6));
      ch.quake = ch.p > 0.01 && ch.p < DONE + 0.02 ? Math.min(1, ch.speed * 2.5) : 0;
      ch.seeds = ch.seeds.filter((s) => !s.born || ch.p >= s.p0 - 0.03);   // scroll back past a click and it undoes
      ch.ptr.on += (ch.ptr.target - ch.ptr.on) * (1 - Math.exp(-dt * 8));
      el.onFrame?.(ch, now, dt);
    };

    ch.render = (now) => {
      if (!ch.tex) { if (ch.near) ch.paint(); if (!ch.tex) return; }
      const r = ch.rect;
      const x = Math.round(r.left * sx), y = Math.round(glc.height - r.bottom * sy);
      const w = Math.round(r.width * sx), h = Math.round(r.height * sy);
      const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(glc.width, x + w), y1 = Math.min(glc.height, y + h);
      if (x1 <= x0 || y1 <= y0) return;
      gl.viewport(x, y, w, h);
      gl.scissor(x0, y0, x1 - x0, y1 - y0);
      gl.useProgram(ch.prog);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, ch.tex[0]);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, ch.tex[1]);
      const { loc, seedBuf } = ch;
      seedBuf.fill(0);
      ch.seeds.forEach((s, i) => seedBuf.set([s.u * ch.AR, s.v, s.p0, ign(s, now) + (s.off || 0)], i * 4));
      gl.uniform4fv(loc.uSeeds, seedBuf);
      gl.uniform1i(loc.uN, ch.seeds.length);
      gl.uniform1f(loc.uAr, ch.AR);
      gl.uniform1f(loc.uP, ch.p);
      gl.uniform1f(loc.uK, ch.K);
      gl.uniform1f(loc.uT, (now / 1000) % 1000);
      gl.uniform1f(loc.uPtrOn, ch.ptr.on);
      gl.uniform1f(loc.uQuake, ch.quake);
      gl.uniform2f(loc.uPtr, ch.ptr.u * ch.AR, ch.ptr.v);
      el.setUniforms?.(ch, gl, loc, now);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    ch.fx = (dt, now) => {
      if (ch.mode !== 'gl') { ch.parts.length = 0; return; }
      const burning = (ch.p > 0.002 && ch.p < DONE + 0.03) || ch.seeds.some((s) => s.born);
      if (burning) {
        const act = Math.min(1, 0.3 + ch.speed * 5);
        const tries = lite ? 30 : 64;
        for (let i = 0; i < tries; i++) {
          const u = Math.random(), v = Math.random();
          el.emit(ch, u * ch.W, (1 - v) * ch.H, el.fuel(ch, u, v, now), act, now);
        }
      }
      const r = ch.rect;
      fc.save();
      fc.setTransform(fsx, 0, 0, fsy, r.left * fsx, r.top * fsy);
      fc.beginPath(); fc.rect(0, 0, ch.W, ch.H); fc.clip();
      el.step(ch, fc, dt, now);
      el.overlay?.(ch, fc, dt, now);
      fc.restore();
    };

    ch.drawFallback = () => {
      const k = Math.min(1, ch.p / DONE);
      if (ch.mode === 'fade') { draftC.style.opacity = String(1 - k); draftC.style.clipPath = ''; }
      else draftC.style.clipPath = el.clip((k * 100).toFixed(2));
    };

    ch.hud = () => {
      const pct = Math.round(Math.min(1, ch.p / DONE) * 100);
      if (pct !== ch.pctShown) { pctEl.textContent = `${el.hud} ${pct}%`; ch.pctShown = pct; }
      const gone = ch.p > 0.04 || (ch.touched && ch.p > 0.01);
      if (gone !== ch.hintGone) { hintEl.classList.toggle('gone', gone); ch.hintGone = gone; }
    };

    ch.reset = () => { ch.seeds = [el.home()]; ch.parts.length = 0; el.reset?.(ch); };

    ch.toFallback = () => {
      ch.mode = reduce ? 'fade' : 'clip'; ch.tex = null; ch.parts.length = 0;
      stage.classList.add('fallback');
      ch.paint(); ch.readScroll(); ch.drawFallback(); ch.hud();
    };

    /* input */
    const toUV = (e) => {
      const r = stage.getBoundingClientRect();
      return { u: (e.clientX - r.left) / r.width, v: 1 - (e.clientY - r.top) / r.height, x: e.clientX - r.left, y: e.clientY - r.top };
    };
    stage.addEventListener('pointermove', (e) => {
      if (!fine || ch.mode !== 'gl') return;
      const q = toUV(e); ch.ptr.u = q.u; ch.ptr.v = q.v; ch.ptr.target = 1; wake();
    });
    stage.addEventListener('pointerleave', () => { ch.ptr.target = 0; });
    stage.addEventListener('click', (e) => {
      if (ch.mode !== 'gl' || e.target.closest('a')) return;
      const q = toUV(e), now = performance.now();
      if (el.fuel(ch, q.u, q.v, now) >= 0) return;                 // already gone here
      const lit = ch.seeds.filter((s) => s.born);
      if (lit.length >= (el.maxClicks || MAX_SEEDS - 1)) ch.seeds.splice(ch.seeds.indexOf(lit[0]), 1);
      const seed = { u: q.u, v: q.v, p0: ch.p, born: now };
      ch.seeds.push(seed);
      el.onClick?.(ch, seed, q, now);
      el.burst?.(ch, q.x, q.y, now);
      ch.touched = true; wake();
    });

    return ch;
  }

  const chapters = tracks.map((sec) => makeChapter(sec, defs[sec.dataset.el]));

  function resize() {
    VW = Math.max(1, glc.clientWidth || window.innerWidth);
    VH = Math.max(1, glc.clientHeight || window.innerHeight);
    DPR = Math.min(window.devicePixelRatio || 1, lite ? 1.5 : 2, 3200 / VW);
    const w = Math.round(VW * DPR), h = Math.round(VH * DPR), k = SCALES[level];
    if (fxc.width !== w || fxc.height !== h) { fxc.width = w; fxc.height = h; }
    if (glc.width !== Math.round(w * k) || glc.height !== Math.round(h * k)) { glc.width = Math.round(w * k); glc.height = Math.round(h * k); }
    sx = glc.width / VW; sy = glc.height / VH; fsx = fxc.width / VW; fsy = fxc.height / VH;
    for (const ch of chapters) { ch.measure(); if (ch.dirty) ch.paint(); }
  }

  function drawAll(dt, now) {
    const live = chapters.filter((ch) => ch.visible);
    for (const ch of live) ch.rect = ch.stage.getBoundingClientRect();   // all layout reads before any writes
    if (gl && !lost) {
      gl.disable(gl.SCISSOR_TEST);
      gl.viewport(0, 0, glc.width, glc.height);
      gl.clearColor(PAPER[0], PAPER[1], PAPER[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.SCISSOR_TEST);
    }
    fc.setTransform(1, 0, 0, 1, 0, 0);
    fc.clearRect(0, 0, fxc.width, fxc.height);
    for (const ch of live) {
      ch.update(dt, now);
      if (ch.mode === 'gl') ch.render(now); else ch.drawFallback();
      ch.fx(dt, now);
    }
    for (const ch of live) ch.hud();
    return live;
  }

  function frame(now) {
    raf = 0;
    if (frozen) return;
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    const live = drawAll(dt, now);
    // about a second of frames slower than ~40fps steps the resolution down a notch
    if (dt > 0 && live.some((ch) => ch.mode === 'gl')) {
      slow = dt > 0.025 ? slow + dt : Math.max(0, slow - dt * 0.5);
      if (slow > 1 && level < SCALES.length - 1) { level++; slow = 0; resize(); }
    }
    const busy = live.some((ch) => ch.mode === 'gl' || Math.abs(ch.pTarget - ch.p) > 1e-4);
    if (busy) raf = requestAnimationFrame(frame);
  }
  function wake() { if (!raf && !frozen) { last = 0; raf = requestAnimationFrame(frame); } }

  glc.addEventListener('webglcontextlost', (e) => {
    e.preventDefault(); lost = true;
    root.classList.add('fallback');
    chapters.forEach((ch) => ch.toFallback());
  });

  async function start() {
    const fonts = Promise.all([
      document.fonts.load(`800 64px "Plus Jakarta Sans"`), document.fonts.load(`700 15px "Plus Jakarta Sans"`),
      document.fonts.load(`400 16px "Plus Jakarta Sans"`), document.fonts.load('700 40px Caveat'), document.fonts.load('500 24px Caveat'),
    ]).catch(() => {});
    const img = new Promise((res) => { const im = new Image(); im.onload = () => { mark = im; res(); }; im.onerror = res; im.src = '/bk-mark.png'; });
    await Promise.race([Promise.all([fonts, img]), new Promise((r) => setTimeout(r, 2500))]);

    if (capture) {
      root.classList.add('capture');
      chapters.forEach((ch) => ch.sec.classList.toggle('cap', ch.el.id === capture));
    }

    resize();
    for (const ch of chapters) { ch.readScroll(); ch.p = ch.pTarget; }

    window.addEventListener('scroll', () => { for (const ch of chapters) ch.readScroll(); wake(); }, { passive: true });
    let t = 0;
    const onResize = () => { clearTimeout(t); t = setTimeout(() => { resize(); chapters.forEach((ch) => ch.readScroll()); wake(); }, 120); };
    window.addEventListener('resize', onResize);
    new ResizeObserver(onResize).observe(chapters[0].stage);

    const bySec = new Map(chapters.map((ch) => [ch.sec, ch])), byStage = new Map(chapters.map((ch) => [ch.stage, ch]));
    const vis = new IntersectionObserver((es) => { for (const e of es) byStage.get(e.target).visible = e.isIntersecting; wake(); });
    const near = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) { const ch = bySec.get(e.target); ch.near = true; if (ch.dirty || !ch.tex) ch.paint(); }
    }, { rootMargin: '100% 0px' });
    const far = new IntersectionObserver((es) => {
      for (const e of es) if (!e.isIntersecting) { const ch = bySec.get(e.target); if (ch.mode === 'gl') { ch.near = false; ch.release(); } }
    }, { rootMargin: '250% 0px' });
    for (const ch of chapters) { vis.observe(ch.stage); near.observe(ch.sec); far.observe(ch.sec); }

    document.fonts.addEventListener?.('loadingdone', () => { chapters.forEach((ch) => { ch.dirty = true; ch.paint(); }); wake(); });
    document.querySelector('#again')?.addEventListener('click', () => {
      chapters.forEach((ch) => ch.reset());
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    });
    wake();

    /* ?capture=<chapter>&p=<progress>&t=<ms>: one chapter, full screen, rendered on a virtual clock (for covers). */
    if (capture) {
      const ch = chapters.find((c) => c.el.id === capture) || chapters[0];
      window.__capture = {
        ch,
        /* Let the element set up state it would normally build over time (e.g. the comet having landed). */
        prime(pv, tMs) { ch.el.prime?.(ch, tMs, pv, params); },
        /* Render at progress pv, time tMs. steps > 0 adds a short run-up so particles and strikes exist;
           steps = 0 renders one frame, for frame-by-frame video. */
        frame(pv, tMs, steps = 24) {
          frozen = true; if (raf) cancelAnimationFrame(raf); raf = 0;
          chapters.forEach((c) => { c.visible = c === ch; });
          ch.near = true; if (!ch.tex) ch.paint();
          for (let i = steps; i >= 0; i--) {
            const pt = Math.max(0, pv - i * 0.003);
            ch.pTarget = pt; ch.p = pt;
            drawAll(1 / 30, tMs - i * 33);
          }
        },
        fire(u, v, p0, bornMs) { ch.seeds.push({ u, v, p0, born: bornMs }); },
      };
      if (params.has('p')) {
        const pv = Number(params.get('p')), tMs = Number(params.get('t') || '4000');
        window.__capture.prime(pv, tMs - 800);
        window.__capture.frame(pv, tMs);
        window.__captured = true;
      }
    }
  }

  start();
}
