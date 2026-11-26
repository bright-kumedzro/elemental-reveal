/* Spiral Shuriken: a sphere of compressed wind with four spinning blades of air round it, thrown through the draft.
   Wind-up: it forms low on the left, its blades growing and spinning faster. The paper round it flutters in its
   wind and gets nicked with thin hairline cuts. Throw: it flies across the page on its own clock, leaving a wake of
   cuts. Burst: where it lands it blows up into a huge vortex of cutting wind. The paper inside is sliced into
   ribbons that blow away, and the vortex keeps growing as you scroll, its edge a ring of spinning blades and fine
   serrations. Behind it, the finished design, with faint wind lines settling.
   Move over the paper and thin cuts trail your hand. Click to throw a small shuriken that slices its own patch. */
import { fbm, ign, clamp, rand, lite, fine, DONE, MAX_SEEDS } from '../core.js';
import { tuned } from './sfx.js';
import { SHURIKEN, makeShuriken, playThrow, playBurst, playSlice } from './sfx-shuriken.js';

const SX = 0.14, SY = 0.22;   // where it forms (page fractions; y is up)
const TX = 0.6, TY = 0.52;    // where it lands
const ARC = 0.07;             // how high its flight arcs
const HIT = 0.18;             // progress at which it's thrown
const THROW_MS = 650;         // how long the flight takes
const W0 = 0.02;              // how big the vortex is the moment it bursts
const BL = 0.06;              // how far its four blades reach past the edge
const SER = 0.012;            // the fine serrations on the edge
const TW = 7, SPIN = 4.2;     // how the blades curve, and how fast they turn
const KH = DONE / (DONE - HIT);
const MINT = [170, 245, 232];

const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const r0Of = (AR) => 0.066 * Math.min(1, AR * 1.6);   // the core's size (smaller on a tall phone)
const blades = (th, r, t) => Math.pow(0.5 + 0.5 * Math.cos(4 * th + TW * r - t * SPIN), 5);
const serr = (th, t) => Math.pow(0.5 + 0.5 * Math.cos(56 * th - t * SPIN * 1.7), 12);

/* How far through its flight it is (0 to 1). It's thrown once you scroll past HIT; if the page opens past it, it
   landed long ago. */
const throwK = (ch, now) => (ch.p < HIT ? 0 : ch.s.thrown ? clamp((now - ch.s.thrown) / THROW_MS, 0, 1) : 1);
/* How open the vortex is (0 to 1): nothing until it lands, then it bursts open over a quarter second. */
function openOf(ch, now) {
  if (ch.p < HIT) return 0;
  if (!ch.s.thrown) return 1;
  return ch.s.landed ? ss(0, 1, (now - ch.s.landed) / 250) : 0;
}
/* Where the shuriken is, in aspect units: at the start, along its arcing flight, then at the target. */
function posOf(ch, now) {
  const k = throwK(ch, now), sx = SX * ch.AR, tx = TX * ch.AR;
  return [sx + (tx - sx) * k, SY + (TY - SY) * k + Math.sin(Math.PI * k) * ARC];
}
/* How much shuriken there is to see: it forms with scroll, flies, then bursts and is gone. */
function visOf(ch, now) {
  if (ch.p < HIT) return ss(0, 0.03, ch.p);
  if (!ch.s.thrown) return 0;
  return ch.s.landed ? 1 - ss(0, 450, now - ch.s.landed) : 1;
}
const chargeOf = (ch, now) => (ch.p < HIT ? ss(0, HIT, ch.p) : ch.s.thrown && !ch.s.landed ? 1 : visOf(ch, now));

function fuel(ch, u, v, now) {
  const t = (now / 1000) % 1000, ax = u * ch.AR, ay = v, on = openOf(ch, now);
  const vx = ax - TX * ch.AR, vy = ay - TY, r = Math.hypot(vx, vy), th = Math.atan2(vy, vx), nz = fbm(ax * 4, ay * 4) - 0.5;
  let d = ((ch.p - HIT) * ch.K * KH + W0) * on - r + (BL * blades(th, r, t) + SER * serr(th, t) + nz * 0.03) * on - 0.001 * (1 - on);
  for (let i = 1; i < ch.seeds.length; i++) {
    const s = ch.seeds[i], g = Math.max(ch.p - s.p0, 0) * ch.K * 0.6 + ign(s, now) + (s.off || 0);
    const ex = ax - s.u * ch.AR, ey = ay - s.v, ri = Math.hypot(ex, ey);
    d = Math.max(d, g - ri + BL * 0.5 * blades(Math.atan2(ey, ex), ri * 2, t) * ss(0, 0.02, g));
  }
  return d;
}

/* ---------- particles ---------- */
// a paper ribbon, sliced off and whirled round the vortex
function ribbon(ch, x, y, vx, vy) {
  ch.spawn({ k: 0, x, y, vx, vy, age: 0, life: rand(0.9, 1.8), len: rand(7, 22), w: rand(1.2, 2.6), rot: Math.atan2(vy, vx), vr: rand(-9, 9), fl: rand(0, 6.28), vf: rand(8, 18), col: ch.draftColor(x, y) });
}
// a streak of wind circling a centre (stage pixels)
function streak(ch, cx, cy, rad, life, w = 1.3) { ch.spawn({ k: 1, cx, cy, ang: rand(0, 6.283), rad, age: 0, life, w, len: rand(0.25, 0.8) }); }
// a thin cut flashing across the paper
function slash(ch, x, y, len, ang, life = rand(0.15, 0.35)) { ch.spawn({ k: 2, x, y, dx: Math.cos(ang) * len, dy: Math.sin(ang) * len, age: 0, life }); }

const toPx = (ch, [x, y]) => [(x / ch.AR) * ch.W, (1 - y) * ch.H];

/* The landing: it bursts into the vortex. Ribbons and streaks fly out, and cuts flash all round. */
function burst(ch) {
  const [cx, cy] = toPx(ch, [TX * ch.AR, TY]), R = r0Of(ch.AR) * ch.H;
  for (let i = 0; i < (lite ? 24 : 48); i++) {
    const a = rand(0, 6.283), sp = rand(160, 420), x = cx + Math.cos(a) * R * rand(0.6, 1.6), y = cy + Math.sin(a) * R * rand(0.6, 1.6);
    ribbon(ch, x, y, Math.cos(a) * sp - Math.sin(a) * sp * 0.8, Math.sin(a) * sp + Math.cos(a) * sp * 0.8);
  }
  for (let i = 0; i < (lite ? 10 : 22); i++) streak(ch, cx, cy, R * rand(1.5, 5), rand(0.3, 0.7), rand(1, 2.2));
  for (let i = 0; i < (lite ? 12 : 24); i++) { const a = rand(0, 6.283), rr = R * rand(1, 4); slash(ch, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, rand(14, 40), a + Math.PI / 2 + rand(-0.4, 0.4), rand(0.2, 0.45)); }
  if (ch.sound?.ctx) playBurst(ch.sound, tuned('shuriken', SHURIKEN));
}

/* ---------- sound ---------- */
function steer(ch, now) {
  const A = ch.sound;
  if (!A?.ctx || ch.mode !== 'gl') return;
  const X = (ch.s.zz = ch.s.zz || makeShuriken(A));
  const shred = openOf(ch, now) > 0 && ch.p < DONE + 0.02 ? 0.55 + 0.45 * Math.min(1, ch.speed * 6) : 0;
  X.set(tuned('shuriken', SHURIKEN), chargeOf(ch, now) * (ch.s.landed ? 1 - ss(0, 500, now - ch.s.landed) : 1), shred, Math.min(1, ch.speed * 6));
}
function hush(ch) { ch.s.zz?.silence(); }

const shuriken = {
  id: 'shuriken',
  num: '08',
  label: 'Spiral Shuriken',
  hud: 'Draft shredded',
  hint: 'Scroll to wind up the shuriken',
  clickHint: 'the paper to throw a small one',
  // no WebGL2: a hole that opens from where it lands (evenodd cuts it out of the page)
  clip: (k) => {
    const r = Number(k) * 0.88, cx = TX * 100, cy = (1 - TY) * 100, pts = ['0% 0%', '100% 0%', '100% 100%', '0% 100%', '0% 0%'];
    for (let i = 0; i <= 32; i++) { const a = (i / 32) * 6.2832; pts.push(`${(cx + r * Math.cos(a)).toFixed(2)}% ${(cy + r * Math.sin(a)).toFixed(2)}%`); }
    return `polygon(evenodd, ${pts.join(', ')})`;
  },
  wantsColor: true,
  uniforms: ['uC', 'uR', 'uQ', 'uOn', 'uThrow', 'uLand', 'uAge'],
  theme: {
    accent: '#7fe0d0', accent2: '#dcfaf4', onAccent: '#032420', seed: 33,
    glowA: 'rgba(127,224,208,.12)', glowB: 'rgba(120,200,255,.07)',
    kicker: 'Experiment · Shred the draft',
    draft: ['Cut it', 'to ribbons?'], final: ['Cut it', 'to ribbons.'],
    aside: 'sharper.',
    sub: 'Spin everything into one sharp edge, then throw it straight through the first draft.',
    note: ['v0.6', 'too much padding.', 'shred it.'],
    chips: [['Drafts shredded', '33'], ['Shipped', '12']],
  },
  home: () => ({ u: TX, v: TY, p0: 0, born: 0 }),
  // by DONE the edge has to pass the farthest corner, even between the blades
  reach: (AR) => Math.max(...[[0, 0], [AR, 0], [0, 1], [AR, 1]].map(([x, y]) => Math.hypot(x - TX * AR, y - TY))) + BL + 0.015 + 0.03 - W0,
  fuel,

  // ribbons are sliced off the edge and whirled round; now and then a cut flashes just ahead of it
  emit(ch, x, y, d, act) {
    if (d > 0 && d < 0.03) {
      if (Math.random() < act * 0.5) {
        const cx = TX * ch.W, cy = (1 - TY) * ch.H, dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy) || 1, sp = rand(120, 300);
        ribbon(ch, x, y, (dy / r) * sp + (dx / r) * 60, (-dx / r) * sp + (dy / r) * 60);
      }
    } else if (d < 0 && d > -0.04 && Math.random() < act * 0.05) {
      const cx = TX * ch.W, cy = (1 - TY) * ch.H;
      slash(ch, x, y, rand(10, 26), Math.atan2(y - cy, x - cx) + Math.PI / 2 + rand(-0.5, 0.5));
    }
  },

  onClick(ch, seed) { seed.off = -0.01; if (ch.sound?.ctx) playSlice(ch.sound, tuned('shuriken', SHURIKEN)); },
  burst(ch, x, y) {
    for (let i = 0; i < 10; i++) { const a = rand(0, 6.283); slash(ch, x + Math.cos(a) * rand(4, 30), y + Math.sin(a) * rand(4, 30), rand(10, 28), a + Math.PI / 2, rand(0.15, 0.35)); }
    for (let i = 0; i < 4; i++) streak(ch, x, y, rand(12, 40), rand(0.3, 0.6), 1.2);
  },
  reset(ch) { hush(ch); ch.s = { zz: ch.s.zz }; },
  quiet: hush,
  /* For capture: &throw=<ms> puts it that far into its flight at the captured moment (t + 800). */
  prime(ch, t, pv, params) {
    if (params.has('throw')) { ch.s.thrown = t + 800 - Number(params.get('throw')); ch.s.landed = 0; ch.s.capture = true; }
  },

  onFrame(ch, now, dt) {
    const s = ch.s;
    if (ch.pPrev < HIT && ch.p >= HIT && !s.thrown) { s.thrown = now; s.landed = 0; if (ch.sound?.ctx) playThrow(ch.sound, tuned('shuriken', SHURIKEN), THROW_MS / 1000); }
    if (ch.p < HIT - 0.01 && !s.capture) { s.thrown = 0; s.landed = 0; }
    const k = throwK(ch, now);
    if (s.thrown && k >= 1 && !s.landed) { s.landed = now; burst(ch); }
    steer(ch, now);
    const q = chargeOf(ch, now);
    ch.quake = Math.max(ch.quake * 0.5, q * q * 0.15, s.landed ? Math.exp(-(now - s.landed) / 300) * 0.9 : 0);
    if (ch.mode !== 'gl') return;

    const [cx, cy] = toPx(ch, posOf(ch, now)), R = r0Of(ch.AR) * ch.H;
    // the wind round it: streaks circling it, and the paper nicked with hairline cuts
    if (q > 0.02 && visOf(ch, now) > 0.05) {
      s.acc = (s.acc || 0) + dt * (lite ? 18 : 36) * (0.3 + 0.7 * q);
      while (s.acc >= 1) {
        s.acc--;
        streak(ch, cx, cy, R * rand(1.6, 3.6), rand(0.25, 0.6), rand(0.8, 1.6));
        if (Math.random() < 0.35 * q) { const a = rand(0, 6.283), rr = R * rand(2, 5); slash(ch, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, rand(6, 18), rand(0, 6.283)); }
      }
    }
    // in flight it leaves a wake of cuts behind it
    if (s.thrown && !s.landed) for (let i = 0; i < (lite ? 2 : 4); i++) slash(ch, cx + rand(-R, R), cy + rand(-R, R), rand(10, 26), rand(0, 6.283), rand(0.25, 0.5));
    // the vortex keeps whirling: streaks round its edge
    const on = openOf(ch, now);
    if (on > 0 && ch.p < DONE + 0.03) {
      const [tx, ty] = toPx(ch, [TX * ch.AR, TY]), G = (((ch.p - HIT) * ch.K * KH + W0) * on) * ch.H;
      s.acc2 = (s.acc2 || 0) + dt * (lite ? 10 : 20);
      while (s.acc2 >= 1) { s.acc2--; streak(ch, tx, ty, Math.max(R, G * rand(0.7, 1.05)), rand(0.3, 0.7), rand(0.8, 1.6)); }
    }
    // thin cuts trail the pointer across the paper
    if (fine && ch.ptr.on > 0.5) {
      const px = ch.ptr.u * ch.W, py = (1 - ch.ptr.v) * ch.H, lp = s.lastPtr;
      if (lp && Math.hypot(px - lp[0], py - lp[1]) > 6 && fuel(ch, ch.ptr.u, ch.ptr.v, now) < 0) {
        const a = Math.atan2(py - lp[1], px - lp[0]);
        slash(ch, (px + lp[0]) / 2, (py + lp[1]) / 2, Math.min(30, Math.hypot(px - lp[0], py - lp[1])), a + rand(-0.15, 0.15), rand(0.2, 0.4));
      }
      s.lastPtr = [px, py];
    } else s.lastPtr = null;
  },

  setUniforms(ch, gl, loc, now) {
    const s = ch.s;
    s.age = s.age || new Float32Array(MAX_SEEDS);
    s.age.fill(99);
    ch.seeds.forEach((sd, i) => { if (i && sd.born) s.age[i] = (now - sd.born) / 1000; });
    const [x, y] = posOf(ch, now), vis = visOf(ch, now), grow = ss(0, HIT, ch.p);
    const landAge = s.landed ? (now - s.landed) / 1000 : 99;
    gl.uniform2f(loc.uC, x, y);
    gl.uniform1f(loc.uR, r0Of(ch.AR) * (0.35 + 0.65 * grow) * vis * (s.landed ? 1 + 3 * ss(0, 0.45, landAge) : 1));   // it swells as it bursts
    gl.uniform1f(loc.uQ, chargeOf(ch, now));
    gl.uniform1f(loc.uOn, openOf(ch, now));
    gl.uniform1f(loc.uThrow, throwK(ch, now));
    gl.uniform1f(loc.uLand, landAge);
    gl.uniform1fv(loc.uAge, s.age);
  },

  step(ch, c, dt) {
    const P = ch.parts;
    c.lineCap = 'round';
    for (let i = P.length - 1; i >= 0; i--) {
      const s = P[i];
      s.age += dt;
      if (s.age >= s.life) { P.splice(i, 1); continue; }
      const h = 1 - s.age / s.life;
      if (s.k === 0) {                                   // a ribbon of paper, whirled round and fluttering
        const cx = TX * ch.W, cy = (1 - TY) * ch.H, dx = s.x - cx, dy = s.y - cy, r = Math.hypot(dx, dy) || 1;
        s.vx += (dy / r) * 220 * dt; s.vy += (-dx / r) * 220 * dt;
        s.vx *= 1 - dt * 0.9; s.vy *= 1 - dt * 0.9;
        s.x += s.vx * dt; s.y += s.vy * dt; s.rot += s.vr * dt; s.fl += s.vf * dt;
        c.save();
        c.globalAlpha = Math.min(1, h * 3);
        c.translate(s.x, s.y); c.rotate(s.rot); c.scale(1, Math.cos(s.fl));
        c.fillStyle = 'rgba(20,60,60,.22)'; c.fillRect(-s.len / 2 + 1.5, -s.w / 2 + 2, s.len, s.w);
        c.fillStyle = s.col; c.fillRect(-s.len / 2, -s.w / 2, s.len, s.w);
        c.restore();
      } else if (s.k === 1) {                            // a streak of wind, circling
        s.ang += (3 + 160 / Math.max(s.rad, 8)) * dt * 2.2;
        const a = Math.min(1, s.age * 6) * Math.min(1, h * 2.5) * 0.8;
        c.strokeStyle = `rgba(${MINT},${a.toFixed(3)})`; c.lineWidth = s.w;
        c.beginPath(); c.arc(s.cx, s.cy, s.rad, -s.ang, -s.ang + s.len); c.stroke();
      } else {                                           // a cut: a white slit with a dark shadow, gone in a blink
        const a = Math.min(1, h * 2.2);
        c.strokeStyle = `rgba(10,30,30,${(a * 0.55).toFixed(3)})`; c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(s.x - s.dx / 2 + 0.8, s.y - s.dy / 2 + 1); c.lineTo(s.x + s.dx / 2 + 0.8, s.y + s.dy / 2 + 1); c.stroke();
        c.strokeStyle = `rgba(240,255,252,${a.toFixed(3)})`; c.lineWidth = 1.1;
        c.beginPath(); c.moveTo(s.x - s.dx / 2, s.y - s.dy / 2); c.lineTo(s.x + s.dx / 2, s.y + s.dy / 2); c.stroke();
      }
    }
  },

  fs: `
const float SX = ${SX.toFixed(3)}, SY = ${SY.toFixed(3)}, TX = ${TX.toFixed(3)}, TY = ${TY.toFixed(3)};
const float HIT = ${HIT.toFixed(3)}, W0 = ${W0.toFixed(4)}, BL = ${BL.toFixed(4)}, SER = ${SER.toFixed(4)}, KH = ${KH.toFixed(5)};
const float TW = ${TW.toFixed(2)}, SPIN = ${SPIN.toFixed(2)};
const vec3 MINT = vec3(.55, .93, .86), WIND = vec3(.85, 1., .97);
uniform vec2 uC;
uniform float uR, uQ, uOn, uThrow, uLand;
uniform float uAge[${MAX_SEEDS}];

// pow of a negative base is NaN in GLSL, and .5 + .5 * cos(x) can round just below zero
float pw(float x, float n) { return pow(max(x, 0.), n); }
float blades(float th, float r) { return pw(.5 + .5 * cos(4. * th + TW * r - uT * SPIN), 5.); }
float serr(float th) { return pw(.5 + .5 * cos(56. * th - uT * SPIN * 1.7), 12.); }

// hairline cuts: short straight slits, one in some cells of a grid, each at its own angle and length
float slits(vec2 a, float sc) {
  vec2 g = a * sc, id = floor(g), f = fract(g) - .5;
  if (h(id + 3.1) > .5) return 0.;
  float ang = h(id + 9.7) * 6.2832;
  vec2 dir = vec2(cos(ang), sin(ang));
  float along = dot(f, dir), across = dot(f, vec2(-dir.y, dir.x)), len = .2 + .22 * h(id + 5.3);
  return smoothstep(.045, .0, abs(across)) * step(abs(along), len);
}

// the shuriken: a swirling core of compressed wind, four curved blades of air spinning round it, and a ring of
// whirling air at the blade tips. Premultiplied: rgb to add, a to cover.
vec4 shur(vec2 v, float R, float spin) {
  if (R < 1e-4) return vec4(0.);
  float r = length(v) / R;
  if (r > 2.6) return vec4(0.);
  float th = atan(v.y, v.x);
  vec3 c = vec3(0.); float al = 0.;
  // the core
  float core = smoothstep(.52, .44, r);
  float swirl = .5 + .5 * sin(3. * th + 9. * log(max(r, .01)) - spin * 1.6);
  c += mix(vec3(.6, .92, .95), vec3(1.), .4 + .6 * swirl) * core * (1.1 - .4 * r);
  al = max(al, core * .95);
  float glow = exp(-max(r - .45, 0.) * 5.) * step(.44, r);
  c += WIND * glow * .45;
  // the blades: curved, sharp at the tips, a bright leading edge
  float ph = th - spin - .9 * r;
  float m = mod(ph + .7854, 1.5708) - .7854;               // angle to the nearest blade, -pi/4..pi/4
  float w = .42 * (1. - smoothstep(.5, 2.05, r)) + .02;
  float bl = smoothstep(w, w * .25, abs(m)) * smoothstep(.42, .55, r) * smoothstep(2.15, 1.85, r);
  float lead = smoothstep(w * .5, 0., abs(m - w * .45)) * bl;
  c += mix(MINT, vec3(1.), .45) * bl * .7 + vec3(1.) * lead * .6;
  al = max(al, bl * .6);
  // whirling air: thin arcs round the blades, and a ring at their tips
  float arcs = pw(.5 + .5 * sin(10. * th - spin * 2.6 + r * 7.), 14.) * smoothstep(.5, 1., r) * smoothstep(2.5, 1.8, r);
  float rq = (r - 2.05) / .09;
  float ring = exp(-rq * rq) * (.55 + .45 * sin(th * 6. - spin * 3.));
  c += WIND * (arcs * .45 + ring * .5);
  return vec4(c, al);
}

void main() {
  vec2 uv = vUv + uQuake * vec2(sin(uT * 89.), cos(uT * 97.)) * .0025;
  vec2 a = vec2(uv.x * uAr, uv.y);

  // the front: a circle round where it landed, with four spinning blades and fine serrations, open once it lands
  vec2 T = vec2(TX * uAr, TY), v = a - T;
  float r = length(v), th = atan(v.y, v.x), nz = fbm(a * 4.) - .5;
  float G = ((uP - HIT) * uK * KH + W0) * uOn;
  float d = G - r + (BL * blades(th, r) + SER * serr(th) + nz * .03) * uOn - .001 * (1. - uOn);
  for (int i = 1; i < ${MAX_SEEDS}; i++) {
    if (i >= uN) break;
    vec4 s = uSeeds[i];
    vec2 e = a - s.xy; float ri = length(e);
    float g = max(uP - s.z, 0.) * uK * .6 + s.w;
    d = max(d, g - ri + BL * .5 * blades(atan(e.y, e.x), ri * 2.) * smoothstep(0., .02, g));
  }

  // the paper flutters in the wind round the shuriken, and is dragged round near the vortex's edge
  vec2 vc = a - uC; float rc = length(vc);
  vec2 tang = rc > 1e-4 ? vec2(-vc.y, vc.x) / rc : vec2(0.);
  float fl = uQ * exp(-rc / .22);
  vec2 cell = floor(a * 90.) + floor(uT * 20.);
  vec2 p = a + tang * fl * .01 * sin(uT * 23. + rc * 60.) + (vec2(h(cell), h(cell + 7.)) - .5) * .003 * fl;
  float drag = uOn * exp(min(d, 0.) / .06) * step(d, 0.);
  p += (r > 1e-3 ? vec2(-v.y, v.x) / r : vec2(0.)) * drag * .014;
  vec3 dr = texture(uDraft, vec2(p.x / uAr, p.y)).rgb;

  // hairline cuts: near the shuriken while it spins, along its flight, and just ahead of the vortex
  vec2 S = vec2(SX * uAr, SY), sc = uC - S;
  float t0 = clamp(dot(a - S, sc) / max(dot(sc, sc), 1e-6), 0., 1.);
  float wake = exp(-length(a - S - sc * t0) / .022) * step(.001, uThrow);
  float mask = clamp(uQ * exp(-rc / .11) * 1.6 + wake + exp(min(d, 0.) / .035) * step(d, 0.) * uOn, 0., 1.);
  float cut = max(slits(a, 16.), slits(a + vec2(.37, .11), 27.)) * mask;
  dr = mix(dr, vec3(.06, .12, .12), cut * .75);
  dr = mix(dr, vec3(.97, .99, .98), smoothstep(-.006, 0., d) * step(d, 0.) * .5);   // a frayed, lifted lip

  // behind it: the final, shadowed under the edge, with faint wind lines settling
  float back = max(d, 0.);
  float wq = (r - uLand * 1.5) / .035;
  float wave = exp(-wq * wq) * exp(-uLand * 2.4);
  vec3 fin = texture(uFinal, vec2(uv.x + (r > 1e-3 ? v.x / r : 0.) * wave * .02 / uAr, uv.y + (r > 1e-3 ? v.y / r : 0.) * wave * .02)).rgb;
  fin *= 1. - .45 * exp(-back / .022);
  fin += WIND * pw(.5 + .5 * sin(th * 10. + r * 26. - uT * 4.), 40.) * exp(-back / .12) * .14 * uOn;

  vec3 col = d < 0. ? dr : fin;
  float fs = h(vec2(floor(uT * 24.), floor(th * 8.) + 30.));
  col += mix(MINT, WIND, fs) * exp(-abs(d) * 130.) * (.45 + .6 * fs) * step(.001, uOn + float(uN > 1));   // the cutting edge

  // the vortex: a dome of cutting wind over the hole. Thin slicing arcs on a tight spiral whirl inside it,
  // brightest near the edge, and its four great blades sweep round inside the rim
  float inside = step(0., d) * exp(-back / .09) + step(d, 0.) * exp(min(d, 0.) / .012) * .35;   // min: exp of a large d overflows, and inf * 0 is NaN
  float arcs = pw(.5 + .5 * sin(th * 46. + log(max(r, .001)) * 60. - uT * 26.), 30.) * inside;
  float big = pw(.5 + .5 * cos(4. * th + TW * r - uT * SPIN), 8.) * smoothstep(G - .18, G, r) * step(r, G + .02);
  float haze = exp(-back / .05) * step(0., d);
  col += (WIND * (arcs * .7 + big * .22) + MINT * haze * .12) * uOn;

  // the shuriken, its light on the paper, the landing's flash and shockwave
  col += MINT * .22 * uQ * exp(-rc / .18);
  vec4 sh = shur(vc, uR, uT * 22.);
  col = col * (1. - sh.a) + sh.rgb;
  col += vec3(.88, 1., .97) * exp(-uLand * 9.) * .3;
  col += WIND * wave * .5;

  // the small ones you threw: they spin in, slice, and go
  for (int i = 1; i < ${MAX_SEEDS}; i++) {
    if (i >= uN) break;
    float ag = uAge[i];
    float rs = .028 * smoothstep(0., .15, ag) * (1. - smoothstep(.45, .85, ag));
    if (rs < .001) continue;
    vec4 m = shur(a - uSeeds[i].xy, rs, uT * 30.);
    col = col * (1. - m.a) + m.rgb;
  }
  o = vec4(clamp(col, 0., 1.), 1.);
}`,
};

export default shuriken;
