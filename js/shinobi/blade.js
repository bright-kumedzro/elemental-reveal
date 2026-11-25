/* Lightning Blade: lightning gathered in one hand, a charge across the page, and a thrust straight through it.
   Charge: the page dims and a dense ball of blue-white lightning gathers low on the left, like a hand held down
   by the ground. It shrieks like a flock of birds, arcs spray off it and crawl across the paper, which scorches
   under it. Run: it charges across the page, dragged along the paper, gouging a burning trench behind it with
   sparks spraying off the back. Pierce: at the end it thrusts through the page, with a flash, a shake and a burst
   of arcs, and punches a hole. From there the trench widens as you scroll. Its edge is white-hot and flickers,
   cracks of light run ahead of it through the paper, and the paper chars at the lip. Behind it, arcs still crawl
   over the finished design. Move over the paper and static gathers under your hand. Click to call down a bolt. */
import { vn, fbm, ign, clamp, rand, lite, fine, DONE, MAX_SEEDS } from '../core.js';
import { CRACKLE, makeCrackle, playStrike, tuned } from './sfx.js';

const AX = 0.1, AY = 0.2, BX = 0.82, BY = 0.6;   // it charges at A, low on the left, and runs to B, where it pierces (y is up)
const HIT = 0.2;          // progress at which it sets off
const LUNGE_MS = 650;     // how long the run takes
const W0 = 0.009;         // the width of the trench it gouges
const PR = 0.055;         // the hole it punches at the end
const CR = 0.05;          // how far the cracks run ahead of the front
const KH = DONE / (DONE - HIT);
const BLUE = [80, 150, 255];

const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const r0Of = (AR) => 0.05 * Math.min(1, AR * 1.6);   // the charge's size (smaller on a tall phone)
// the trench's wobble along its length, pinned at both ends: a dragged hand, so steadier than a bolt
const jag = (t) => ((vn(t * 7, 3.1) - 0.5) * 0.05 + (vn(t * 19, 7.7) - 0.5) * 0.02) * Math.min(1, t * 4) * Math.min(1, (1 - t) * 4);
const ridge = (x, y) => 1 - Math.abs(2 * vn(x, y) - 1);
const cracks = (x, y) => Math.pow(ridge(x * 9, y * 9), 8) * 0.6 + Math.pow(ridge(x * 23 + 5.3, y * 23 + 1.7), 12) * 0.4;

/* How far along its run the charge has got (0 to 1). It sets off once you scroll past HIT and runs on its own
   clock; if the page opens past it, it has already pierced. */
const lunge = (ch, now) => (ch.p < HIT ? 0 : ch.s.hit ? Math.min(1, (now - ch.s.hit) / LUNGE_MS) ** 1.6 : 1);
const holeOf = (cut) => ss(0.9, 1, cut);   // the pierce hole opens as it arrives

/* The line in aspect units: start, direction, normal, length. */
function line(AR) {
  const ax = AX * AR, bx = BX * AR, lx = bx - ax, ly = BY - AY, len = Math.hypot(lx, ly);
  return { ax, ay: AY, dx: lx / len, dy: ly / len, nx: -ly / len, ny: lx / len, len };
}
/* Where the charge is, in stage pixels: it rides the cut to its end. */
function tip(ch, cut) {
  const L = line(ch.AR), x = L.ax + L.dx * L.len * cut, y = L.ay + L.dy * L.len * cut;
  return [(x / ch.AR) * ch.W, (1 - y) * ch.H];
}
/* The cut as a path of stage pixels, on the same wobble the shader cuts along. */
function cutPath(ch, n = 18) {
  const L = line(ch.AR), pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, j = jag(t), x = L.ax + L.dx * L.len * t + L.nx * j, y = L.ay + L.dy * L.len * t + L.ny * j;
    pts.push([(x / ch.AR) * ch.W, (1 - y) * ch.H]);
  }
  return pts;
}
function segDist(px, py, L) {
  const vx = px - L.ax, vy = py - L.ay, t = clamp((vx * L.dx + vy * L.dy) / L.len, 0, 1);
  return Math.hypot(vx - L.dx * L.len * t, vy - L.dy * L.len * t);
}

function fuel(ch, u, v, now) {
  const ax = u * ch.AR, ay = v, L = line(ch.AR), cut = lunge(ch, now);
  const vx = ax - L.ax, vy = ay - L.ay, t = (vx * L.dx + vy * L.dy) / L.len, tc = clamp(t, 0, cut);
  const trench = Math.hypot(vx * L.nx + vy * L.ny - jag(tc), (t - tc) * L.len);
  const on = holeOf(cut);   // no hole until it arrives
  const dist = Math.min(trench, Math.hypot(ax - (L.ax + L.dx * L.len), ay - (L.ay + L.dy * L.len)) - PR * on + (1 - on) * 10);
  const cr = cracks(ax, ay), nz = fbm(ax * 4, ay * 4) - 0.5;
  let d = (ch.p - HIT) * ch.K * KH + W0 * cut - dist + (CR * cr + nz * 0.03) * cut;
  for (let i = 1; i < ch.seeds.length; i++) {
    const s = ch.seeds[i], g = Math.max(ch.p - s.p0, 0) * ch.K * 0.6 + ign(s, now) + (s.off || 0);
    d = Math.max(d, g - Math.hypot(ax - s.u * ch.AR, ay - s.v) + (CR * 0.6 * cr + nz * 0.02) * ss(0, 0.02, g));
  }
  return d;
}

/* ---------- particles ---------- */
/* A jagged line between two points: split each stretch in two and push the middle sideways, a few times over. */
function zig(a, b, rough, depth) {
  let pts = [a, b], amp = Math.hypot(b[0] - a[0], b[1] - a[1]) * rough;
  for (let k = 0; k < depth; k++) {
    const nx = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, o = (Math.random() * 2 - 1) * amp;
      nx.push(pts[i], [(x0 + x1) / 2 - (dy / l) * o, (y0 + y1) / 2 + (dx / l) * o]);
    }
    nx.push(pts[pts.length - 1]); pts = nx; amp *= 0.55;
  }
  return pts;
}
function trace(base, rough, depth) {
  const out = [base[0]];
  for (let i = 0; i < base.length - 1; i++) { const s = zig(base[i], base[i + 1], rough, depth); for (let k = 1; k < s.length; k++) out.push(s[k]); }
  return out;
}
// a bolt along base (stage pixels); it re-forks every few frames, so it crackles
function bolt(ch, base, life, w, rough = 0.3, depth = 3, glow = 1) { ch.spawn({ k: 0, base, pts: null, re: 0, age: 0, life, w, rough, depth, glow }); }
function spark(ch, x, y, vx, vy) { ch.spawn({ k: 2, x, y, vx, vy, age: 0, life: rand(0.25, 0.6) }); }
function ash(ch, x, y, vx, vy) {
  ch.spawn({ k: 1, x, y, vx, vy, age: 0, life: rand(0.8, 1.6), w: rand(2, 5.5), h: rand(1.5, 3.5), rot: rand(0, 6.28), vr: rand(-6, 6), col: ch.draftColor(x, y) });
}

/* Setting off: it kicks off the ground with a spray of sparks and arcs. */
function setOff(ch) {
  const [x, y] = tip(ch, 0);
  for (let i = 0; i < (lite ? 14 : 26); i++) spark(ch, x, y, rand(-380, -60), rand(-300, 60));
  for (let i = 0; i < 5; i++) { const a = rand(1.8, 4.2), l = rand(30, 90); bolt(ch, [[x, y], [x + Math.cos(a) * l, y + Math.sin(a) * l]], rand(0.08, 0.16), 1.1, 0.35, 3); }
}
/* The pierce: it thrusts through the page. A fan of arcs bursts out of the hole, the trench it dragged flashes
   along its length, and sparks and burnt paper fly. */
function pierce(ch) {
  const path = cutPath(ch), [x, y] = path[path.length - 1], R = r0Of(ch.AR) * ch.H;
  for (let i = 0; i < (lite ? 7 : 12); i++) {
    const a = rand(0, 6.283), l = R * rand(1.6, 4.5);
    bolt(ch, [[x, y], [x + Math.cos(a) * l, y + Math.sin(a) * l]], rand(0.15, 0.35), rand(0.9, 1.5), 0.32, 4, 1.1);
  }
  bolt(ch, path, 0.3, 1.2, 0.14, 2, 1.1);
  for (let i = 0; i < (lite ? 30 : 60); i++) { const a = rand(0, 6.283), sp = rand(200, 620); spark(ch, x, y, Math.cos(a) * sp, Math.sin(a) * sp - 100); }
  for (let i = 0; i < (lite ? 4 : 8); i++) { const a = rand(0, 6.283), sp = rand(120, 320); ash(ch, x + Math.cos(a) * R, y + Math.sin(a) * R, Math.cos(a) * sp, Math.sin(a) * sp - 60); }
  if (ch.sound?.ctx) playStrike(ch.sound, tuned('crackle', CRACKLE));
}

/* ---------- sound ---------- */
/* The shriek (its recipe and numbers live in sfx.js), built once and steered every frame: the chirps climb as
   it charges and stay at full pitch through the run, then the crackle keeps on while the trench spreads, harder
   the faster you scroll. */
function steer(ch, now) {
  const A = ch.sound;
  if (!A?.ctx || ch.mode !== 'gl') return;
  const X = (ch.s.zz = ch.s.zz || makeCrackle(A));
  const q = ss(0, HIT, ch.p) * (1 - ss(0.97, 1, lunge(ch, now)));
  const drive = ch.p >= HIT && ch.p < DONE + 0.02 ? 0.25 + Math.min(1, ch.speed * 8) : 0;
  X.set(tuned('crackle', CRACKLE), q, drive, 1);
}
function hush(ch) { ch.s.zz?.silence(); }

const blade = {
  id: 'blade',
  num: '04',
  label: 'Lightning Blade',
  hud: 'Draft cut',
  hint: 'Scroll to charge the blade',
  clickHint: 'the paper to call down a bolt',
  // no WebGL2: a band along the cut that widens (evenodd cuts it out of the page)
  clip: (k) => {
    const w = Number(k) * 0.9, ax = AX * 100, ay = (1 - AY) * 100, bx = BX * 100, by = (1 - BY) * 100;
    const lx = bx - ax, ly = by - ay, l = Math.hypot(lx, ly), dx = (lx / l) * w, dy = (ly / l) * w;
    const P = (x, y) => `${x.toFixed(2)}% ${y.toFixed(2)}%`;
    const band = [P(ax - dx - dy, ay - dy + dx), P(bx + dx - dy, by + dy + dx), P(bx + dx + dy, by + dy - dx), P(ax - dx + dy, ay - dy - dx), P(ax - dx - dy, ay - dy + dx)];
    return `polygon(evenodd, 0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${band.join(', ')})`;
  },
  wantsColor: true,
  uniforms: ['uR0', 'uCut', 'uHit', 'uAge'],
  theme: {
    accent: '#3d8bff', accent2: '#cfe4ff', onAccent: '#020c1c', seed: 31,
    glowA: 'rgba(61,139,255,.13)', glowB: 'rgba(120,200,255,.07)',
    kicker: 'Experiment · Cut the draft',
    draft: ['Cut through', 'the noise?'], final: ['Cut through', 'the noise.'],
    aside: 'one clean cut.',
    sub: 'Gather everything into one strike, then cut straight through the first draft.',
    note: ['v0.9', 'too much noise.', 'cut it.'],
    chips: [['Drafts cut', '31'], ['Shipped', '12']],
  },
  home: () => ({ u: AX, v: AY, p0: 0, born: 0 }),
  // by DONE the front has to pass the farthest corner, wobble, noise and all
  reach: (AR) => {
    const L = line(AR);
    return Math.max(...[[0, 0], [AR, 0], [0, 1], [AR, 1]].map(([x, y]) => segDist(x, y, L))) + 0.06 + 0.02 + 0.03 - W0;
  },
  fuel,

  // burnt paper lifts off the lip, short arcs jump along it, and sparks spit off it
  emit(ch, x, y, d, act) {
    if (d <= 0 || d > 0.03) return;
    const r = Math.random();
    if (r < act * 0.22) ash(ch, x, y, rand(-40, 40), rand(-120, -30));
    else if (r < act * 0.3) bolt(ch, [[x, y], [x + rand(-40, 40), y + rand(-40, 40)]], rand(0.05, 0.12), rand(0.6, 1.1), 0.4, 3);
    else if (r < act * 0.38) spark(ch, x, y, rand(-200, 200), rand(-260, 0));
  },

  onClick(ch, seed) { seed.off = -0.01; if (ch.sound?.ctx) playStrike(ch.sound, tuned('crackle', CRACKLE), true); },
  // the bolt comes down from the top of the page
  burst(ch, x, y) {
    const x0 = x + rand(-90, 90);
    bolt(ch, [[x0, -10], [x, y]], 0.32, 2, 0.26, 5, 2);
    for (let i = 0; i < 2; i++) { const a = rand(-2.6, -0.5), l = rand(30, 80); bolt(ch, [[x, y], [x + Math.cos(a) * l, y + Math.sin(a) * l]], rand(0.12, 0.25), 1, 0.35, 3); }
    for (let i = 0; i < 18; i++) { const a = rand(0, 6.283), sp = rand(120, 360); spark(ch, x, y, Math.cos(a) * sp, Math.sin(a) * sp - 120); }
  },
  reset(ch) { hush(ch); ch.s = { zz: ch.s.zz }; },
  /* For capture: &run=<ms> puts the charge that far into its run at the captured moment (t + 800). */
  prime(ch, t, pv, params) {
    if (params.has('run')) { ch.s.hit = t + 800 - Number(params.get('run')); ch.s.pierced = 0; ch.s.capture = true; }
  },
  quiet: hush,

  onFrame(ch, now, dt) {
    const s = ch.s;
    if (ch.pPrev < HIT && ch.p >= HIT && !s.hit) { s.hit = now; s.pierced = 0; setOff(ch); }
    if (ch.p < HIT - 0.01 && !s.capture) { s.hit = 0; s.pierced = 0; }
    const cut = lunge(ch, now);
    if (s.hit && cut >= 1 && !s.pierced) { s.pierced = now; pierce(ch); }
    steer(ch, now);
    const qc = ss(0, HIT, ch.p) * (1 - ss(0.97, 1, cut));
    // it trembles as it charges, and the pierce shakes the page
    ch.quake = Math.max(ch.quake * 0.5, qc * qc * 0.35, s.pierced ? Math.exp(-(now - s.pierced) / 300) : 0);
    if (ch.mode !== 'gl') return;

    // the charge: dense, crackling arcs round the hand, some spraying out and crawling over the paper
    const qo = qc, running = s.hit && cut > 0 && cut < 1;
    if (qo > 0.02) {
      const [cx, cy] = tip(ch, cut), R = r0Of(ch.AR) * qo * ch.H;
      s.acc = (s.acc || 0) + dt * (lite ? 30 : 60) * (0.25 + 0.75 * qo);
      while (s.acc >= 1) {
        s.acc--;
        const a = rand(0, 6.283), far = Math.random() < 0.35 * qo, ca = Math.cos(a), sa = Math.sin(a);
        const r = R * (far ? rand(2.2, 5.5) : rand(1.05, 2.2)), x = cx + ca * r, y = cy + sa * r;
        bolt(ch, [[cx + ca * R * 0.4, cy + sa * R * 0.4], [x, y]], far ? rand(0.06, 0.14) : rand(0.03, 0.08), far ? rand(1, 1.8) : rand(0.7, 1.3), 0.38, far ? 4 : 3, far ? 1 : 1.4);
        if (far) for (let i = 0; i < 2; i++) spark(ch, x, y, rand(-160, 160), rand(-220, 40));
      }
      // while it runs, sparks spray off the back and the trench it drags behind crackles
      if (running) {
        const back = tip(ch, Math.max(0, cut - 0.04));
        for (let i = 0; i < (lite ? 3 : 6); i++) spark(ch, cx + rand(-R, R) * 0.5, cy + rand(-R, R) * 0.5, (back[0] - cx) * rand(4, 9) + rand(-80, 80), (back[1] - cy) * rand(4, 9) - rand(40, 220));
        if (Math.random() < 0.6) { const b = tip(ch, Math.max(0, cut - rand(0.05, 0.25))); bolt(ch, [b, [b[0] + rand(-30, 30), b[1] + rand(-30, 30)]], rand(0.05, 0.1), 0.9, 0.4, 3); }
      }
    }
    // static snaps round the pointer while it's over the paper
    if (fine && ch.ptr.on > 0.5 && Math.random() < dt * 10 && fuel(ch, ch.ptr.u, ch.ptr.v, now) < 0) {
      const px = ch.ptr.u * ch.W, py = (1 - ch.ptr.v) * ch.H, a = rand(0, 6.283), l = rand(10, 24);
      bolt(ch, [[px + Math.cos(a) * 4, py + Math.sin(a) * 4], [px + Math.cos(a) * l, py + Math.sin(a) * l]], rand(0.04, 0.09), 0.8, 0.4, 2);
    }
  },

  setUniforms(ch, gl, loc, now) {
    const s = ch.s;
    s.age = s.age || new Float32Array(MAX_SEEDS);
    s.age.fill(99);
    ch.seeds.forEach((sd, i) => { if (i && sd.born) s.age[i] = (now - sd.born) / 1000; });
    gl.uniform1f(loc.uR0, r0Of(ch.AR));
    gl.uniform1f(loc.uCut, lunge(ch, now));
    gl.uniform1f(loc.uHit, s.pierced ? (now - s.pierced) / 1000 : 99);   // seconds since it pierced
    gl.uniform1fv(loc.uAge, s.age);
  },

  step(ch, c, dt) {
    const P = ch.parts;
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (let i = P.length - 1; i >= 0; i--) {
      const s = P[i];
      s.age += dt;
      if (s.age >= s.life) { P.splice(i, 1); continue; }
      const h = 1 - s.age / s.life;
      if (s.k === 0) {                                   // a bolt: a blue glow, a pale body, a white core
        s.re -= dt;
        if (!s.pts || s.re <= 0) { s.pts = trace(s.base, s.rough, s.depth); s.re = rand(0.02, 0.045); }
        const a = h * (0.45 + 0.55 * Math.random());
        c.beginPath();
        s.pts.forEach(([x, y], k) => (k ? c.lineTo(x, y) : c.moveTo(x, y)));
        c.strokeStyle = `rgba(${BLUE},${(a * 0.25 * s.glow).toFixed(3)})`; c.lineWidth = s.w * (3 + 2 * s.glow); c.stroke();
        c.strokeStyle = `rgba(190,222,255,${(a * 0.65).toFixed(3)})`; c.lineWidth = s.w * 1.8; c.stroke();
        c.strokeStyle = `rgba(250,250,255,${a.toFixed(3)})`; c.lineWidth = s.w * 0.7; c.stroke();
      } else if (s.k === 1) {                            // burnt paper, lifting on the heat
        s.vy -= 40 * dt; s.vx *= 1 - dt * 1.2; s.vy *= 1 - dt * 1.2;
        s.x += s.vx * dt; s.y += s.vy * dt; s.rot += s.vr * dt;
        c.save();
        c.globalAlpha = Math.min(1, h * 2.5);
        c.translate(s.x, s.y); c.rotate(s.rot);
        c.fillStyle = '#1c1714'; c.fillRect(-s.w / 2 - 1, -s.h / 2 - 1, s.w + 2, s.h + 2);
        c.fillStyle = s.col; c.fillRect(-s.w / 2 + 0.5, -s.h / 2 + 0.5, s.w - 1.5, s.h - 1.5);
        c.restore();
      } else {                                           // a spark, falling
        s.vy += 520 * dt; s.vx *= 1 - dt * 2; s.vy *= 1 - dt * 1;
        s.x += s.vx * dt; s.y += s.vy * dt;
        c.strokeStyle = `rgba(215,236,255,${h.toFixed(3)})`; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(s.x - s.vx * 0.025, s.y - s.vy * 0.025); c.stroke();
      }
    }
  },

  fs: `
const float AX = ${AX.toFixed(3)}, AY = ${AY.toFixed(3)}, BX = ${BX.toFixed(3)}, BY = ${BY.toFixed(3)};
const float HIT = ${HIT.toFixed(3)}, W0 = ${W0.toFixed(4)}, PR = ${PR.toFixed(4)}, CR = ${CR.toFixed(3)}, KH = ${KH.toFixed(5)};
const vec3 BOLT = vec3(.78, .9, 1.), VIO = vec3(.3, .55, 1.);
uniform float uR0, uCut, uHit;
uniform float uAge[${MAX_SEEDS}];

float jag(float t) { return ((vn(vec2(t * 7., 3.1)) - .5) * .05 + (vn(vec2(t * 19., 7.7)) - .5) * .02) * min(1., t * 4.) * min(1., (1. - t) * 4.); }
float ridge(vec2 p) { return 1. - abs(2. * vn(p) - 1.); }

void main() {
  vec2 uv = vUv + uQuake * vec2(sin(uT * 91.), cos(uT * 79.)) * .003;
  vec2 a = vec2(uv.x * uAr, uv.y);

  // the front: the trench it dragged from A, as far as it has run, plus the hole it punched at B; widening as you
  // scroll, reaching out along cracks
  vec2 A = vec2(AX * uAr, AY), L = vec2(BX * uAr, BY) - A;
  float len = length(L); vec2 dl = L / len, nl = vec2(-dl.y, dl.x);
  vec2 v = a - A;
  float t = dot(v, dl) / len, tc = clamp(t, 0., uCut);
  float trench = length(vec2(dot(v, nl) - jag(tc), (t - tc) * len));
  float on = smoothstep(.9, 1., uCut);   // no hole until it arrives
  float dist = min(trench, length(a - A - L) - PR * on + (1. - on) * 10.);
  float r1 = ridge(a * 9.);
  float cr = pow(r1, 8.) * .6 + pow(ridge(a * 23. + vec2(5.3, 1.7)), 12.) * .4, nz = fbm(a * 4.) - .5;
  float d = (uP - HIT) * uK * KH + W0 * uCut - dist + (CR * cr + nz * .03) * uCut;
  for (int i = 1; i < ${MAX_SEEDS}; i++) {
    if (i >= uN) break;
    vec4 s = uSeeds[i];
    float g = max(uP - s.z, 0.) * uK * .6 + s.w;
    d = max(d, g - distance(a, s.xy) + (CR * .6 * cr + nz * .02) * smoothstep(0., .02, g));
  }

  float fl = h(vec2(floor(uT * 30.), 3.));                     // a flicker for the whole frame
  float fs = h(vec2(floor(uT * 30.), floor(t * 14.) + 40.));   // and one per stretch of the cut

  // ahead: the paper buzzes near the front, scorches, chars at the lip, and its cracks light up
  float near = exp(min(d, 0.) / .02) * step(d, 0.);
  vec2 cell = floor(a * 120.) + floor(uT * 30.);
  vec2 jit = (vec2(h(cell), h(cell + 17.)) - .5) * .004 * near;
  vec3 dr = texture(uDraft, vec2(uv.x + jit.x / uAr, uv.y + jit.y)).rgb;
  dr = mix(dr, vec3(.2, .15, .11), exp(min(d, 0.) / .035) * step(d, 0.) * .5);
  dr = mix(dr, vec3(.04, .035, .05), smoothstep(-.007, 0., d) * step(d, 0.) * .9);
  float live = h(vec2(floor(uT * 15.), floor(a.x * 7.) + floor(a.y * 7.) * 9.));   // which patches are live this frame
  dr += BOLT * pow(r1, 60.) * exp(min(d, 0.) / .022) * step(d, 0.) * step(.45, live) * (.3 + .7 * fl) * .7;

  // behind: the final, shadowed under the torn edge, with arcs still crawling over it near the cut
  float back = max(d, 0.);
  vec3 fin = texture(uFinal, uv).rgb;
  fin *= 1. - .5 * exp(-back / .02);
  float res = pow(ridge(a * 14. + vec2(uT * 2.3, -uT * 1.7)), 80.) * exp(-back / .035);
  fin += mix(VIO, BOLT, fl) * res * .5 * step(.7, live);

  vec3 col = d < 0. ? dr : fin;
  float qo = smoothstep(0., HIT, uP) * (1. - smoothstep(.97, 1., uCut));
  col *= mix(vec3(1.), vec3(.66, .72, .88), qo);                       // the light drains as it charges
  col += mix(VIO, BOLT, fs) * exp(-abs(d) * 120.) * (.45 + .8 * fs);  // the trench's edge, white-hot and flickering

  // while it runs, the trench it drags burns blue-white behind it, brightest near the hand
  float running = step(.001, uCut) * (1. - step(1., uCut));
  col += BOLT * running * exp(-trench / .007) * exp(-max(uCut - t, 0.) * 3.) * step(t, uCut) * (.6 + .5 * fs);

  // the charge in the hand: a white-hot core in a crackling blue halo, lighting the paper round it; it runs
  // with the hand to the end of the trench
  float R = uR0 * qo * (.85 + .3 * fl);
  if (R > 1e-4) {
    float rc = length(a - (A + L * uCut));
    float ang = atan(a.y - A.y - L.y * uCut, a.x - A.x - L.x * uCut);
    float spikes = pow(vn(vec2(ang * 5. + 20., floor(uT * 40.))), 3.);   // ragged arcs bristling off it
    col += VIO * .45 * qo * exp(-rc / .18);
    col += BOLT * .9 * qo * exp(-max(rc - R * (1. + .8 * spikes), 0.) / (R * .5));
    col = mix(col, vec3(1.), exp(-pow(rc / R, 2.) * 2.2));
  }

  // the pierce: a flash, and the trench it dragged burns white for a moment
  col += vec3(.82, .9, 1.) * exp(-uHit * 9.) * .6;
  col += BOLT * exp(-dist / .006) * exp(-uHit * 2.5) * 1.2;

  // a click's bolt lands with a flash
  for (int i = 1; i < ${MAX_SEEDS}; i++) {
    if (i >= uN) break;
    col += BOLT * exp(-uAge[i] * 6.) * exp(-distance(a, uSeeds[i].xy) / .03) * 1.4;
  }
  // static gathers under the pointer
  vec2 pv = a - uPtr;
  col += VIO * .22 * uPtrOn * exp(-dot(pv, pv) / .003) * step(d, 0.) * (.5 + .5 * fl);
  o = vec4(clamp(col, 0., 1.), 1.);
}`,
};

export default blade;
