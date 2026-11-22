/* Water: it pours in from the top and runs down the page under gravity. Each column has its own speed, so it
   comes down in rivulets that meander. Each rivulet swells to a rounded head, then widens until neighbours merge
   into a sheet.
   Ahead of the water the paper wicks it up, greys, the pencil runs, and a tide line forms at the wet edge.
   In the water a flowing texture carries ripples downward, refracting the design underneath; the leading bead
   bulges and catches the light, and the sketch's pigment is dragged down and dissolved just behind the front.
   Click to spill some: it pools where it lands, then runs down. */
import { fbm, vn, ign, rand, lite, DONE, MAX_SEEDS } from './core.js';

const SRC = 0.12;    // the water enters this far above the page
const W0 = 0.038;    // half-width of a rivulet's blunt head
const HB = 0.1;      // how long the head takes to swell to that width
const GROW = 0.06;   // how much every rivulet thickens as more water comes (per unit of progress·K)
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const TAPS = lite ? 4 : 7;   // neighbouring columns checked on each side (fewer on phones, same reach)
const REACH = 0.18;

const speed = (x) => { const n = vn(x * 4.3, 3.7) * 0.62 + vn(x * 10.1, 9.1) * 0.38; return 0.3 + 1.15 * n * n; };

/* [distance inside the water (negative ahead of it), how long the water has been here]. Every column runs down
   at its own speed and ends in a blunt rounded head; every rivulet thickens as more water comes, so a pixel is
   wet if some nearby column's rivulet is wide enough to reach it. Mirrors flow() in the shader. */
/* The flow field is sampled through a lumpy warp, so edges wander into lobes and bays instead of clean curves. */
function warp(ax, ay) {
  return [
    ax + (vn(ax * 5, ay * 5) - 0.5) * 0.08 + (vn(ax * 13 + 7, ay * 13 + 3) - 0.5) * 0.03,
    ay + (vn(ax * 5 + 31, ay * 5 + 17) - 0.5) * 0.08 + (vn(ax * 13 + 2, ay * 13 + 23) - 0.5) * 0.03,
  ];
}
function flow(ax, ay, pk) {
  const t = 1 - ay + SRC;
  const x = ax + (vn(ax * 1.6, t * 2.8) - 0.5) * 0.2 + (vn(ax * 4.1 + 9, t * 7.3) - 0.5) * 0.05;   // rivulets meander
  let best = -1e3, age = 0;
  for (let i = -TAPS; i <= TAPS; i++) {
    const o = Math.sign(i) * Math.pow(Math.abs(i) / TAPS, 1.6) * REACH;
    const s = speed(x + o), ag = pk - t / s, wt = W0 + GROW * pk, hb = HB * wt / W0;
    const w = ag <= 0 ? ag * s : wt * Math.sqrt(Math.min(ag / hb, 1)) + 0.08 * Math.max(ag - hb, 0);
    if (w - Math.abs(o) > best) { best = w - Math.abs(o); age = ag; }
  }
  return [best, age];
}

/* Spills from clicks: a pool where it lands that runs downhill. Mirrors spill() in the shader. */
function spill(ch, ax, ay, n, now) {
  let d = -10;
  for (let i = 1; i < ch.seeds.length; i++) {
    const s = ch.seeds[i];
    if (!s.born) continue;
    const sx = s.u * ch.AR, down = s.v - ay;
    const wob = (vn(sx * 7, ay * 5) - 0.5) * 0.06 * Math.min(Math.max(down, 0) * 6, 1);
    const cost = (down >= 0 ? down / 0.9 : -down * 5) + Math.abs(ax - sx + wob) * 2.4;
    d = Math.max(d, Math.max(ch.p - s.p0, 0) * ch.K * 0.3 + ign(s, now) + (s.off || 0) - cost + (n - 0.5) * 0.03);
  }
  return d;
}

function splash(ch, x, y, b) {
  ch.spawn({ k: 1, x, y, vx: (Math.random() - 0.5) * 90 * b, vy: -rand(40, 130) * b, age: 0, life: rand(0.4, 0.8), r: rand(0.8, 1.8) });
}

const water = {
  id: 'water',
  num: '02',
  label: 'Water',
  hud: 'Draft washed',
  hint: 'Scroll to let the water run',
  clickHint: 'the paper to spill some',
  clip: (k) => `inset(${k}% 0 0 0)`,
  theme: {
    accent: '#2dd4bf', accent2: '#a7f3f0', onAccent: '#032320', seed: 6,
    glowA: 'rgba(45,212,191,.10)', glowB: 'rgba(56,140,255,.08)',
    kicker: 'Experiment · Wash the draft',
    draft: ['Wash out', 'the noise?'], final: ['Wash out', 'the noise.'],
    aside: 'clearer?',
    sub: "Ideas run like ink. Let the water take whatever doesn't hold, and keep what does.",
    note: ['v0.4', 'too muddy.', 'wash it.'],
    chips: [['Drafts washed', '24'], ['Shipped', '12']],
  },
  home: () => ({ u: 0.5, v: 2, p0: 0, born: 0 }),       // unused: the water comes from above

  resize(ch) {
    // fast enough that the whole bottom edge is under water by 85% of DONE, leaving time to drain to a sheen
    const wet = (pk) => { for (let x = 0; x <= ch.AR; x += 0.004) if (flow(...warp(x, 0), pk)[0] < 0.03) return false; return true; };
    let lo = 0, hi = 40;
    for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (wet(mid)) hi = mid; else lo = mid; }
    ch.K = hi / (DONE * 0.85);
  },

  fuel(ch, u, v, now) {
    const ax = u * ch.AR, n = fbm(ax * 7, v * 7);
    return Math.max(flow(...warp(ax, v), ch.p * ch.K)[0] - 0.004 + (n - 0.5) * 0.035, spill(ch, ax, v, n, now));
  },

  onFrame(ch, now) {
    for (const s of ch.seeds) if (s.born) s.off = 0.45 * easeOut(Math.min(1, (now - s.born) / 2600));   // a spill keeps running
  },

  emit(ch, x, y, d, act) {
    // beads break off the leading edge and slide ahead of it
    if (d > -0.002 && d < 0.006 && Math.random() < act * 0.3) {
      ch.spawn({ k: 0, x, y, vx: rand(-6, 6), vy: rand(30, 110), age: 0, life: rand(0.4, 1.1), r: rand(1.1, 2.4) });
    }
  },

  onClick(ch, seed, q, now) { (ch.s.rings ||= []).push({ x: q.x, y: q.y, t: now }); },
  burst(ch, x, y) { for (let i = 0; i < 18; i++) splash(ch, x, y, 1); },
  reset(ch) { ch.s.rings = []; },

  step(ch, c, dt) {
    const P = ch.parts;
    for (let i = P.length - 1; i >= 0; i--) {
      const s = P[i];
      s.age += dt;
      if (s.age >= s.life) { P.splice(i, 1); continue; }
      const h = 1 - s.age / s.life, a = Math.min(1, h * 3);
      if (s.k === 0) {                                   // a bead sliding down, slowing as it sheds water
        s.vy *= 1 - dt * 1.2; s.x += s.vx * dt; s.y += s.vy * dt;
        c.fillStyle = `rgba(40,70,80,${(0.28 * a).toFixed(3)})`;
        c.beginPath(); c.arc(s.x, s.y + s.r * 0.35, s.r, 0, 6.283); c.fill();
        c.fillStyle = `rgba(205,240,248,${(0.55 * a).toFixed(3)})`;
        c.beginPath(); c.arc(s.x, s.y, s.r, 0, 6.283); c.fill();
        c.fillStyle = `rgba(255,255,255,${(0.9 * a).toFixed(3)})`;
        c.beginPath(); c.arc(s.x - s.r * 0.35, s.y - s.r * 0.35, s.r * 0.35, 0, 6.283); c.fill();
      } else {                                           // splash from a spill
        s.vy += 520 * dt; s.x += s.vx * dt; s.y += s.vy * dt;
        c.fillStyle = `rgba(150,215,235,${(0.85 * a).toFixed(3)})`;
        c.beginPath(); c.arc(s.x, s.y, s.r, 0, 6.283); c.fill();
      }
    }
  },

  overlay(ch, c, dt, now) {
    const R = ch.s.rings;
    if (!R) return;
    for (let i = R.length - 1; i >= 0; i--) {
      const age = (now - R[i].t) / 1000;
      if (age > 0.9) { R.splice(i, 1); continue; }
      c.lineWidth = 1.2;
      for (let k = 0; k < 2; k++) {
        const a = age - k * 0.15;
        if (a <= 0) continue;
        c.strokeStyle = `rgba(225,248,255,${((1 - age / 0.9) * 0.6).toFixed(3)})`;
        c.beginPath(); c.arc(R[i].x, R[i].y, a * 90, 0, 6.283); c.stroke();
      }
    }
  },

  fs: `
const float SRC = ${SRC.toFixed(2)};
const float W0 = ${W0.toFixed(3)};
const float HB = ${HB.toFixed(2)};
const float GROW = ${GROW.toFixed(3)};

float speed(float x) {
  float n = vn(vec2(x * 4.3, 3.7)) * .62 + vn(vec2(x * 10.1, 9.1)) * .38;
  return .3 + 1.15 * n * n;
}
// x: distance inside the water (negative ahead of it) · y: how long the water has been here
vec2 warp(vec2 a) {
  return a + (vec2(vn(a * 5.), vn(a * 5. + vec2(31., 17.))) - .5) * .08
           + (vec2(vn(a * 13. + vec2(7., 3.)), vn(a * 13. + vec2(2., 23.))) - .5) * .03;
}
vec2 flow(vec2 a) {
  float t = 1. - a.y + SRC, pk = uP * uK;
  float x = a.x + (vn(vec2(a.x * 1.6, t * 2.8)) - .5) * .2 + (vn(vec2(a.x * 4.1 + 9., t * 7.3)) - .5) * .05;
  float wt = W0 + GROW * pk, hb = HB * wt / W0;
  float best = -1e3, age = 0.;
  for (int i = -${TAPS}; i <= ${TAPS}; i++) {
    float fi = float(i), o = sign(fi) * pow(abs(fi) / ${TAPS}., 1.6) * ${REACH};
    float s = speed(x + o), ag = pk - t / s;
    float w = ag <= 0. ? ag * s : wt * sqrt(min(ag / hb, 1.)) + .08 * max(ag - hb, 0.);
    if (w - abs(o) > best) { best = w - abs(o); age = ag; }
  }
  return vec2(best, age);
}
// clicks: a pool where it lands that runs downhill
float spill(vec2 a, float n) {
  float d = -10.;
  for (int i = 1; i < ${MAX_SEEDS}; i++) {
    if (i >= uN) break;
    vec4 s = uSeeds[i];
    float down = s.y - a.y;
    float wob = (vn(vec2(s.x * 7., a.y * 5.)) - .5) * .06 * min(max(down, 0.) * 6., 1.);
    float cost = (down >= 0. ? down / .9 : -down * 5.) + abs(a.x - s.x + wob) * 2.4;
    d = max(d, max(uP - s.z, 0.) * uK * .3 + s.w - cost + (n - .5) * .03);
  }
  return d;
}

void main() {
  vec2 a = vec2(vUv.x * uAr, vUv.y);
  float n = fbm(a * 7.);
  vec2 fw = flow(warp(a));
  float ds = spill(a, n);
  float d = max(fw.x - .004 + (n - .5) * .035, ds);
  float age = ds > fw.x ? max(ds, 0.) * 3. : max(fw.y, 0.);
  float torch = uPtrOn * smoothstep(.12, 0., distance(a, uPtr) + (n - .5) * .06);
  vec2 px = 1. / vec2(textureSize(uDraft, 0));

  // ahead of the water: the paper wicks it up along ragged fibres, greys, and the pencil runs downhill
  float wick = d + (vn(a * 60.) - .5) * .02;
  float damp = smoothstep(-.09, 0., wick);
  damp = max(damp * damp, torch * .7);
  float r = 1. + damp * 4.;
  vec3 dr = texture(uDraft, vUv).rgb;
  vec3 ink = min(min(texture(uDraft, vUv + vec2(r, 0.) * px).rgb, texture(uDraft, vUv - vec2(r, 0.) * px).rgb),
                 min(texture(uDraft, vUv + vec2(0., r * 2.5) * px).rgb, texture(uDraft, vUv + vec2(0., r * 5.) * px).rgb));
  dr = mix(dr, mix(dr, ink, .6), damp);
  dr *= mix(vec3(1.), vec3(.79, .83, .87), damp);
  dr *= 1. - vec3(.08, .14, .22) * exp(-abs(wick + .088) * 140.);           // a tide line at the wet edge
  dr *= 1. - .16 * exp(-abs(d + .004) * 260.) * step(d, 0.);               // the water's shadow on the paper

  // the water: a thick rounded head and edges, thinning to a film as it drains
  float bead = smoothstep(0., .008, d) * (exp(-age * 5.) + (1. - smoothstep(.006, .02, d)) * .5);
  float film = exp(-age * 1.8);
  float th = min(1., film * .6 + bead * .6);

  // ripples carried downward by the flow; their slope bends the light
  vec2 fp = vec2(a.x * 34., (1. - a.y) * 9. - uT * 2.2), fq = vec2(a.x * 13. + 4., (1. - a.y) * 4. - uT * 1.3);
  float w0 = vn(fp) * .6 + vn(fq) * .4;
  float pxA = max(abs(dFdy(a.y)), 1e-5);                                     // page units per pixel
  vec2 nrm = vec2(dFdx(w0), -dFdy(w0)) / pxA * .05;
  vec2 g = vec2(dFdx(th), dFdy(th));                                         // the bead's edge is a lens too
  vec2 refr = nrm * .006 * th + g * 60. * px;
  vec3 fin = texture(uFinal, vUv + refr).rgb;

  // just behind the front, the sketch's pigment is dragged downhill and dissolves
  float wash = 1. - smoothstep(0., .1 + .1 * vn(a * vec2(22., 3.)), age);
  vec3 smear = texture(uDraft, vUv + vec2(0., age * .12) + refr).rgb;
  vec3 under = mix(fin, smear * vec3(.84, .89, .93), wash * .85);
  under = mix(under, under * vec3(.7, .87, .95) + vec3(.02, .07, .085), th * .7);
  float streak = smoothstep(.72, 1., vn(vec2(a.x * 70., (1. - a.y) * 2.5 - uT * 2.6))) * th;
  under += vec3(.7, .92, 1.) * streak * .22;                                 // streaks racing downhill

  vec3 L = normalize(vec3(-.4, .6, .7));
  float spec = pow(clamp(dot(normalize(vec3(nrm, 1.)), L), 0., 1.), 14.) * th;
  under += vec3(.85, .97, 1.) * spec * .4;                                    // glints running down with the flow
  float crest = pow(clamp(dot(normalize(vec3(-g * 40., 1.)), L), 0., 1.), 10.) * bead;
  under += vec3(.9, .98, 1.) * crest * .35;                                   // light on the rounded bead

  vec3 col = mix(dr, under, smoothstep(0., .003, d));
  float rv = vn(a * 18. + vec2(0., -uT * .6));                               // the rim swells and thins along its length
  float rimW = mix(110., 260., rv);
  col = mix(col, vec3(.9, .97, 1.), exp(-abs(d - .003) * rimW) * (.4 + .35 * rv));   // the meniscus
  col *= 1. - .3 * exp(-abs(d - .012 - .01 * rv) * mix(90., 200., rv)) * step(0., d); // the shadowed lip just inside it
  o = vec4(col, 1.);
}`,
};

export default water;
