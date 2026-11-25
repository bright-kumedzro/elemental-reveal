/* Shadow Clone: the draft splits into copies of itself, and every copy goes up in smoke.
   Wind-up: the sketch trembles and its lines double, a shadow of itself pulling away. At the split a puff of
   smoke covers the page and nine clones fly out of it, each a whole copy of the draft at half size, stacked and
   overlapping so together they still cover everything. Then, one scroll step at a time, the clone on top
   goes up in a puff of smoke and shows whatever is under it, until only the finished design is left.
   Each clone is a rotated rectangle sampled from the draft texture; the shader walks the stack top-down, so each
   card also casts a soft shadow on the ones below. Click a clone to dispel it early. Scroll back and they return. */
import { hh, clamp, rand, lite, DONE } from '../core.js';
import { POOF, playPoof, tuned } from './sfx.js';

const SPLIT = 0.12;                        // progress at which the draft splits
const N = 9;                               // clones, on a jittered 3 × 3 grid
const S = 0.5;                             // a clone's size, as a fraction of the page
const FIRST = SPLIT + 0.1, LAST = DONE - 0.02;   // when the first and the last clone go up in smoke
const SWAP = 0.12;                         // seconds into a puff when the clone under it comes or goes
const PUFF = 1.1;                          // how long a puff lasts (s)

/* The stack, top first: which grid slot each clone flies to. The top one pops first. */
const ORDER = [4, 0, 8, 2, 6, 1, 7, 3, 5];
const SLOTS = ORDER.map((slot, j) => ({
  gx: ((slot % 3) + 0.5) / 3 + (hh(slot, 3) - 0.5) * 0.05,
  gy: (Math.floor(slot / 3) + 0.5) / 3 + (hh(slot, 7) - 0.5) * 0.05,
  rot: (hh(slot, 11) - 0.5) * 0.16,
  lag: hh(slot, 5) * 0.14,
  thr: FIRST + (j * (LAST - FIRST)) / (N - 1),
}));

function st(ch) {
  if (!ch.s.cards) {
    ch.s.many = false; ch.s.tm = -1e9; ch.s.jolt = -1e9;
    ch.s.k = new Float32Array(N);
    ch.s.popped = new Array(N).fill(false);
    ch.s.forced = new Array(N).fill(false);
    ch.s.tc = new Array(N).fill(-1e9);
    ch.s.cards = SLOTS.map(() => ({ x: 0, y: 0, s: 1, r: 0, vis: true }));
    ch.s.buf = { card: new Float32Array(N * 4), vis: new Float32Array(N), puff: new Float32Array(N) };
  }
  return ch.s;
}

/* Is (ax, ay) on a clone that's still there? Returns the clone's stack index, or -1. Mirrors the shader. */
function under(ch, ax, ay) {
  const cards = st(ch).cards, hx = ch.AR * 0.5;
  for (let j = 0; j < N; j++) {
    const C = cards[j];
    if (!C.vis) continue;
    const dx = ax - C.x, dy = ay - C.y, cs = Math.cos(-C.r), sn = Math.sin(-C.r);
    const lx = (cs * dx - sn * dy) / C.s, ly = (sn * dx + cs * dy) / C.s;
    if (Math.abs(lx) < hx && Math.abs(ly) < 0.5) return j;
  }
  return -1;
}

/* A puff's worth of smoke on the particle layer: soft billows and the quick lines that fly out of a poof. */
function poof(ch, x, y, rx, ry, n) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, 6.283), k = rand(0.35, 1), sp = rand(30, 120);
    ch.spawn({
      k: 0, x: x + Math.cos(a) * rx * k * 0.8, y: y + Math.sin(a) * ry * k * 0.8,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20, age: 0, life: rand(0.6, 1.2),
      r: rand(8, 20) * Math.max(0.6, Math.min(2.2, rx / 140)), gr: rand(18, 40),
    });
  }
  for (let i = 0; i < Math.ceil(n / 2); i++) {
    const a = rand(0, 6.283), sp = rand(380, 700);
    ch.spawn({ k: 1, x: x + Math.cos(a) * rx * 0.7, y: y + Math.sin(a) * ry * 0.7, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, len: rand(14, 34), age: 0, life: rand(0.18, 0.32) });
  }
}

/* The sound of a poof (the recipe and its numbers live in sfx.js). Pops that land on top of each other are
   thinned out, so a fast scroll stays a flurry. */
function poofSound(ch, kind) {
  const A = ch.sound, c = A?.ctx;
  if (!c) return;
  const t = c.currentTime;
  if (kind !== 'big' && t - (ch.s.lastPoof || 0) < 0.06) return;
  ch.s.lastPoof = t;
  playPoof(A, tuned('poof', POOF), kind);
}

const clone = {
  id: 'clone',
  num: '01',
  label: 'Shadow Clone',
  hud: 'Clones dispelled',
  hint: 'Scroll to split the draft',
  clickHint: 'a clone to dispel it',
  clip: (k) => `inset(0 0 ${k}% 0)`,
  mips: true,
  uniforms: ['uCard', 'uVis', 'uPuff', 'uSplit', 'uGhost'],
  theme: {
    accent: '#ff8a3d', accent2: '#ffd2a8', onAccent: '#2a1204', seed: 21,
    glowA: 'rgba(255,138,61,.10)', glowB: 'rgba(255,190,130,.07)',
    kicker: 'Experiment · Multiply the draft',
    draft: ['One idea,', 'many tries?'], final: ['One idea,', 'many tries.'],
    aside: 'multiply!',
    sub: 'Make a dozen copies, try every one of them, and keep the one that holds up.',
    note: ['v0.9', 'which one?', 'try them all.'],
    chips: [['Clones dispelled', '9'], ['Shipped', '12']],
  },
  home: () => ({ u: 0.5, v: 0.5, p0: 0, born: 0 }),
  reach: () => 1,

  fuel(ch, u, v) { return under(ch, u * ch.AR, v) >= 0 ? -1 : 1; },
  emit() {},

  onFrame(ch, now, dt) {
    const s = st(ch), AR = ch.AR, t = now / 1000;
    const many = ch.p >= SPLIT;
    if (many !== s.many) {
      s.many = many; s.tm = now;
      if (!many) s.forced.fill(false);
      poof(ch, ch.W / 2, ch.H / 2, ch.W * 0.45, ch.H * 0.45, lite ? 26 : 44);
      poofSound(ch, 'big');
    }
    const age = (now - s.tm) / 1000;
    SLOTS.forEach((o, j) => {
      // fly out to its place once the smoke is thick, or straight back in when they merge
      const target = many && age > 0.1 + o.lag ? 1 : 0;
      s.k[j] += (target - s.k[j]) * (1 - Math.exp(-dt * (target ? 7 : 11)));
      const k = s.k[j], C = s.cards[j];
      C.x = AR * (0.5 + (o.gx - 0.5) * k);
      C.y = 0.5 + (o.gy - 0.5) * k + Math.sin(t * 1.7 + j * 2.1) * 0.004 * k;        // clones breathe
      C.s = 1 + (S - 1) * k;
      C.r = o.rot * k + Math.sin(t * 1.3 + j) * 0.012 * k;
      const popped = many && (ch.p >= o.thr || s.forced[j]);
      if (popped !== s.popped[j]) {
        s.popped[j] = popped; s.tc[j] = now;
        poof(ch, (C.x / AR) * ch.W, (1 - C.y) * ch.H, C.s * ch.W * 0.5, C.s * ch.H * 0.5, lite ? 12 : 20);
        if (many) poofSound(ch, popped ? 'pop' : 'back');
      }
      const ac = (now - s.tc[j]) / 1000;
      C.vis = popped ? ac < SWAP : ac >= SWAP;
    });
    // the wind-up: the sketch trembles harder the closer it gets to splitting; a click jolts it
    const g = many ? 0 : clamp((ch.p - 0.01) / (SPLIT - 0.01), 0, 1);
    s.ghost = Math.max(g * g * (3 - 2 * g), Math.exp(-(now - s.jolt) / 260) * 0.7);
    ch.quake = Math.max(s.ghost * s.ghost * 0.9, many ? Math.exp(-age / 0.25) * 0.6 : 0);
  },

  onClick(ch, seed, q, now) {
    const s = st(ch);
    if (!s.many) { s.jolt = now; return; }
    const j = under(ch, q.u * ch.AR, q.v);
    if (j >= 0) s.forced[j] = true;
  },
  burst(ch, x, y) { if (!st(ch).many) poof(ch, x, y, 30, 30, 6); },
  reset(ch) { ch.s = {}; },

  setUniforms(ch, gl, loc, now) {
    const s = st(ch), b = s.buf;
    s.cards.forEach((C, j) => {
      b.card.set([C.x, C.y, C.s, C.r], j * 4);
      b.vis[j] = C.vis ? 1 : 0;
      b.puff[j] = Math.min(99, (now - s.tc[j]) / 1000);
    });
    gl.uniform4fv(loc.uCard, b.card);
    gl.uniform1fv(loc.uVis, b.vis);
    gl.uniform1fv(loc.uPuff, b.puff);
    gl.uniform1f(loc.uSplit, Math.min(99, (now - s.tm) / 1000));
    gl.uniform1f(loc.uGhost, s.ghost || 0);
  },

  step(ch, c, dt) {
    const P = ch.parts;
    for (let i = P.length - 1; i >= 0; i--) {
      const s = P[i];
      s.age += dt;
      if (s.age >= s.life) { P.splice(i, 1); continue; }
      const h = 1 - s.age / s.life;
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.k === 0) {                                   // a billow of smoke, slowing and spreading
        s.vx *= 1 - dt * 2.5; s.vy = s.vy * (1 - dt * 2.5) - 12 * dt; s.r += s.gr * dt;
        const g = c.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
        g.addColorStop(0, `rgba(250,248,245,${(h * h * 0.5).toFixed(3)})`);
        g.addColorStop(0.6, `rgba(235,232,228,${(h * h * 0.25).toFixed(3)})`);
        g.addColorStop(1, 'rgba(235,232,228,0)');
        c.fillStyle = g;
        c.beginPath(); c.arc(s.x, s.y, s.r, 0, 6.283); c.fill();
      } else {                                           // a poof line, flying out and gone
        s.vx *= 1 - dt * 6; s.vy *= 1 - dt * 6;
        const sp = Math.hypot(s.vx, s.vy) || 1;
        c.strokeStyle = `rgba(255,255,255,${(h * 0.7).toFixed(3)})`; c.lineWidth = 2; c.lineCap = 'round';
        c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(s.x - (s.vx / sp) * s.len * h, s.y - (s.vy / sp) * s.len * h); c.stroke();
      }
    }
  },

  fs: `
const int NC = ${N};
const float PUFF = ${PUFF.toFixed(2)};
uniform vec4 uCard[NC];    // xy: centre (aspect units) · z: scale · w: rotation. Top of the stack first.
uniform float uVis[NC];    // still there?
uniform float uPuff[NC];   // seconds since it came or went
uniform float uSplit;      // seconds since the draft split (or merged back)
uniform float uGhost;      // the wind-up

vec2 rotv(vec2 v, float r) { float c = cos(r), s = sin(r); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
float sm(vec2 p) { return vn(p) * .5 + vn(p * 2.1 + 3.7) * .3 + vn(p * 4.3 + 1.3) * .2; }

// one copy of the draft. During the wind-up its lines double: a burnt-orange shadow pulling away from them.
// The mip level is set by hand: inside the stack walk the GPU can't work it out.
vec3 card(vec2 lp, float sd, float lod) {
  vec2 suv = vec2(lp.x / uAr + .5, lp.y + .5);
  vec3 c = textureLod(uDraft, suv, lod).rgb;
  if (uGhost > .001) {
    vec2 off = vec2(.013, .004) * uGhost * (1. + .35 * sin(uT * 9.));
    float i1 = clamp(1. - dot(textureLod(uDraft, suv + off, lod).rgb, vec3(.333)) / .88, 0., 1.);
    float i2 = clamp(1. - dot(textureLod(uDraft, suv - off * vec2(1.3, -1.), lod).rgb, vec3(.333)) / .88, 0., 1.);
    c = mix(c, vec3(.62, .36, .2), i1 * .6 * uGhost);
    c = mix(c, vec3(.45, .3, .22), i2 * .35 * uGhost);
  }
  return c * mix(.76, 1., smoothstep(0., .0035, -sd));     // a pencil-thin edge on every copy
}

// a puff of smoke: swells fast, rolls upward, then thins out and breaks into holes. x: density · y: light
vec2 puff(vec2 a, vec2 c, vec2 rad, float t, float seed) {
  vec2 q = (a - c) / rad;
  if (dot(q, q) > 4.) return vec2(0.);
  float g = .55 + .7 * (1. - exp(-t * 7.));
  vec2 o = vec2(seed * 7.1, seed * 3.3) + vec2(0., -t * .7);
  float n1 = sm(q * 2.4 + o), n2 = sm(q * 2.4 + o + vec2(-.08, .08));
  float dn = length(q) / g + (n1 - .5) * .9;
  float thr = 1. - .75 * smoothstep(.2, PUFF * .85, t);
  float dens = smoothstep(thr, thr - .3, dn) * smoothstep(0., .06, t) * (1. - smoothstep(.7, PUFF, t));
  float lit = clamp(.84 + (n2 - n1) * 4. + q.y * .1, .58, 1.04);
  return vec2(dens, lit);
}

void main() {
  vec2 uv = vUv + uQuake * vec2(sin(uT * 71.), cos(uT * 89.)) * .0022;
  vec2 a = vec2(uv.x * uAr, uv.y);
  vec2 hs = vec2(uAr * .5, .5);
  float pw = abs(dFdy(a.y)) * 1.2;          // a pixel, in page units: edges are antialiased across it
  vec3 col = vec3(0.);
  float cov = 0., sh = 0.;

  // walk the stack from the top, front to back: each clone covers what's under it (with soft edges), and casts
  // a soft shadow down and to the right on everything below
  for (int i = 0; i < NC; i++) {
    if (uVis[i] < .5) continue;
    vec4 C = uCard[i];
    vec2 lp = rotv(a - C.xy, -C.w) / C.z;
    vec2 e = abs(lp) - hs;
    float sd = max(e.x, e.y) * C.z;
    float k = clamp(.5 - sd / pw, 0., 1.);
    if (k > 0.) {
      col += (1. - cov) * k * card(lp, sd, max(0., -log2(C.z))) * (1. - sh);
      cov += (1. - cov) * k;
      if (cov > .999) break;
    }
    vec2 ls = rotv(a - C.xy - vec2(.006, -.014) * C.z, -C.w) / C.z;
    float sds = length(max(abs(ls) - hs, 0.)) * C.z;
    sh = max(sh, .38 * (1. - smoothstep(0., .04, sds)));
  }
  if (cov < .999) col += (1. - cov) * textureLod(uFinal, uv, 0.).rgb * (1. - sh);

  // the smoke: one big puff when the draft splits (or merges back), one for each clone that comes or goes
  vec3 smoke = vec3(.97, .96, .95);
  if (uSplit < PUFF) {
    vec2 pf = puff(a, hs, hs * 1.3, uSplit, 0.);
    col = mix(col, smoke * pf.y, pf.x * .97);
  }
  for (int i = 0; i < NC; i++) {
    if (uPuff[i] >= PUFF) continue;
    vec4 C = uCard[i];
    vec2 pf = puff(a, C.xy, hs * C.z * 1.15, uPuff[i], float(i) + 1.);
    col = mix(col, smoke * pf.y, pf.x * .96);
  }
  o = vec4(col, 1.);
}`,
};

export default clone;
