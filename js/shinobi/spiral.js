/* Spiral Sphere: a ball of spinning light forms over the draft and drills straight through it.
   Wind-up: the sphere gathers in the middle of the page. Light streams spiral into it, and the paper around it is
   dragged round into the spin. Impact: a flash, a shockwave, and the sphere grinds into the page. From there the
   hole spreads as you scroll. Its edge is a set of spinning spiral arms, so the front saws round as it goes.
   Ahead of it the paper twists and is scored by the spin. Behind it the finished design is still twisted near the
   edge and settles as the front moves on, with rings of light running out from the sphere.
   Move over the paper and it twists under your hand. Click to drop a small sphere that drills its own hole. */
import { fbm, ign, clamp, rand, lite, DONE, MAX_SEEDS } from '../core.js';
import { env, noiseSource } from '../sound.js';
import { WHIR, makeWhir, tuned } from './sfx.js';

const CX = 0.5, CY = 0.5;   // where the sphere forms (page fractions; y is up)
const HIT = 0.2;            // progress at which it hits the page
const ARMS = 3, TW = 12;    // spiral arms on the front, and how tightly they wind
const AMP = 0.045;          // how far the arms reach ahead of the front
const SPIN = 5;             // how fast the front saws round
const KH = DONE / (DONE - HIT);
const CYAN = [150, 225, 255];

const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const r0Of = (AR) => 0.1 * Math.min(1, AR * 1.6);          // the sphere's size (smaller on a tall phone)
const grow = (ch) => (ch.p - HIT) * ch.K * KH + r0Of(ch.AR) * ss(HIT, HIT + 0.03, ch.p);
const orbR = (ch) => r0Of(ch.AR) * ss(0.004, HIT, ch.p) * (1 - ss(0.8, 0.95, ch.p));
const arm = (x, y, r, tw, t) => (r < 1e-4 ? 0 : Math.cos(ARMS * Math.atan2(y, x) + tw * r - t * SPIN));

function shred(ch, x, y, vx, vy) {
  ch.spawn({
    k: 1, x, y, vx, vy, age: 0, life: rand(0.7, 1.4),
    w: rand(2.5, 6.5), h: rand(1.5, 4), rot: rand(0, 6.28), vr: rand(-10, 10), fl: rand(0, 6.28), vf: rand(6, 14),
    col: ch.draftColor(x, y),
  });
}
function spark(ch, x, y, vx, vy) { ch.spawn({ k: 2, x, y, vx, vy, age: 0, life: rand(0.25, 0.55) }); }

/* ---------- sound ---------- */
/* The whir of the sphere (the recipe and its numbers live in sfx.js), built once and steered every frame:
   it climbs in pitch, speed and volume as it charges, and grinds while it drills, harder the faster you scroll. */
function steerHum(ch) {
  const A = ch.sound;
  if (!A?.ctx || ch.mode !== 'gl') return;
  const H = (ch.s.hum = ch.s.hum || makeWhir(A));
  const drill = ch.p >= HIT ? 0.3 + Math.min(1, ch.speed * 8) : 0;
  H.set(tuned('whir', WHIR), ss(0, HIT, ch.p), drill, orbR(ch) / r0Of(ch.AR));
}
function hush(ch) { ch.s.hum?.silence(); }

/* The impact: a low boom falling away, a pitch drop under it, and a crack on top. */
function boom(ch) {
  const A = ch.sound, c = A?.ctx;
  if (!c) return;
  const t = c.currentTime;
  const n = noiseSource(A), lp = c.createBiquadFilter(), g = c.createGain();
  lp.type = 'lowpass'; lp.frequency.setValueAtTime(1800, t); lp.frequency.exponentialRampToValueAtTime(110, t + 1);
  env(g, t, 0.9, 0.005, 1.1);
  n.connect(lp).connect(g).connect(A.out); n.start(t, Math.random()); n.stop(t + 1.2);
  const o = c.createOscillator(), og = c.createGain();
  o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(34, t + 0.7);
  env(og, t, 0.8, 0.005, 0.8);
  o.connect(og).connect(A.out); o.start(t); o.stop(t + 0.9);
  const cr = noiseSource(A), hp = c.createBiquadFilter(), cg = c.createGain();
  hp.type = 'highpass'; hp.frequency.value = 2500;
  env(cg, t, 0.45, 0.002, 0.08);
  cr.connect(hp).connect(cg).connect(A.out); cr.start(t, Math.random()); cr.stop(t + 0.15);
}

/* A small sphere: a short whir that winds up, fluttering, then drills down. */
function whir(ch) {
  const A = ch.sound, c = A?.ctx;
  if (!c) return;
  const t = c.currentTime;
  const n = noiseSource(A), b = c.createBiquadFilter(), g = c.createGain(), tr = c.createGain();
  b.type = 'bandpass'; b.Q.value = 5;
  b.frequency.setValueAtTime(1200, t); b.frequency.exponentialRampToValueAtTime(2400, t + 0.25); b.frequency.exponentialRampToValueAtTime(500, t + 1.2);
  env(g, t, 0.5, 0.15, 1.05);
  tr.gain.value = 0.55;
  const l = c.createOscillator(), ld = c.createGain();
  l.frequency.value = 16; ld.gain.value = 0.4;
  l.connect(ld).connect(tr.gain);
  n.connect(b).connect(g).connect(tr).connect(A.out);
  n.start(t, Math.random()); n.stop(t + 1.3); l.start(t); l.stop(t + 1.3);
}

const spiral = {
  id: 'spiral',
  num: '03',
  label: 'Spiral Sphere',
  hud: 'Draft drilled',
  hint: 'Scroll to charge the sphere',
  clickHint: 'the paper to drop a small one',
  // no WebGL2: a hole that opens from the middle (evenodd cuts it out of the page)
  clip: (k) => {
    const r = Number(k) * 0.75, pts = ['0% 0%', '100% 0%', '100% 100%', '0% 100%', '0% 0%'];
    for (let i = 0; i <= 32; i++) { const a = (i / 32) * 6.2832; pts.push(`${(50 + r * Math.cos(a)).toFixed(2)}% ${(50 + r * Math.sin(a)).toFixed(2)}%`); }
    return `polygon(evenodd, ${pts.join(', ')})`;
  },
  wantsColor: true,
  uniforms: ['uR0', 'uHit', 'uAge'],
  theme: {
    accent: '#5ad1ff', accent2: '#d8f4ff', onAccent: '#03131c', seed: 27,
    glowA: 'rgba(90,209,255,.11)', glowB: 'rgba(120,170,255,.07)',
    kicker: 'Experiment · Drill the draft',
    draft: ['Focus the', 'pressure?'], final: ['Focus the', 'pressure.'],
    aside: 'spin it.',
    sub: 'Pull everything into one point, then put it straight through the first draft.',
    note: ['v0.8', 'too scattered.', 'compress it.'],
    chips: [['Drafts drilled', '27'], ['Shipped', '12']],
  },
  home: () => ({ u: CX, v: CY, p0: 0, born: 0 }),
  // by DONE the front has to pass the farthest corner, arms, noise and all
  reach: (AR) => Math.hypot(AR * 0.5, 0.5) + AMP + 0.03 + 0.06 - r0Of(AR),

  fuel(ch, u, v, now) {
    const t = (now / 1000) % 1000, ax = u * ch.AR, ay = v;
    const dx = ax - CX * ch.AR, dy = ay - CY, r = Math.hypot(dx, dy);
    let d = grow(ch) - r + AMP * arm(dx, dy, r, TW, t) * Math.min(1, r / 0.15) + (fbm(ax * 3, ay * 3) - 0.5) * 0.06;
    for (let i = 1; i < ch.seeds.length; i++) {
      const s = ch.seeds[i], ex = ax - s.u * ch.AR, ey = ay - s.v, ri = Math.hypot(ex, ey);
      d = Math.max(d, Math.max(ch.p - s.p0, 0) * ch.K * 0.6 + ign(s, now) + (s.off || 0) - ri + AMP * 0.5 * arm(ex, ey, ri, TW * 1.6, t) * Math.min(1, ri / 0.06));
    }
    return d;
  },

  // paper torn off the front is flung round with the spin; sparks fly off the grinding edge
  emit(ch, x, y, d, act) {
    if (d <= 0 || d > 0.035) return;
    const cx = CX * ch.W, cy = (1 - CY) * ch.H, dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy) || 1;
    const tx = dy / r, ty = -dx / r, ox = dx / r, oy = dy / r;   // anticlockwise on screen, and outward
    if (Math.random() < act * 0.45) { const sp = rand(120, 280), out = rand(20, 90); shred(ch, x, y, tx * sp + ox * out, ty * sp + oy * out); }
    else if (Math.random() < act * 0.12) { const sp = rand(300, 600); spark(ch, x, y, tx * sp + ox * 60, ty * sp + oy * 60); }
  },

  onClick(ch, seed) { seed.off = -0.03; whir(ch); },   // the small sphere forms first, then drills
  burst(ch, x, y) {
    for (let i = 0; i < 16; i++) { const a = rand(0, 6.283), sp = rand(150, 380); spark(ch, x, y, Math.cos(a) * sp, Math.sin(a) * sp); }
  },
  reset(ch) { hush(ch); ch.s = { hum: ch.s.hum }; },
  quiet: hush,

  onFrame(ch, now, dt) {
    const s = ch.s;
    // the impact, once per pass: a flash, a shockwave, a burst of paper, and the ground shakes
    if (ch.pPrev < HIT && ch.p >= HIT && !s.hit) {
      s.hit = now;
      const R = r0Of(ch.AR) * ch.H, cx = CX * ch.W, cy = (1 - CY) * ch.H;
      for (let i = 0; i < (lite ? 30 : 56); i++) {
        const a = rand(0, 6.283), ox = Math.cos(a), oy = Math.sin(a), x = cx + ox * R * 1.1, y = cy + oy * R * 1.1;
        const sp = rand(200, 520);
        if (i % 2) shred(ch, x, y, ox * sp + oy * 150, oy * sp - ox * 150);
        else spark(ch, x, y, ox * sp * 1.4, oy * sp * 1.4);
      }
    }
    if (s.hit === now) boom(ch);
    if (ch.p < HIT - 0.01) s.hit = 0;
    steerHum(ch);
    ch.quake = Math.max(ch.quake * 0.5, s.hit ? Math.exp(-(now - s.hit) / 320) : 0);

    // light streams spiralling into the sphere while it's there
    const R = orbR(ch);
    if (R > 0.004 && ch.mode === 'gl') {
      const q = ss(0, HIT, ch.p);
      s.acc = (s.acc || 0) + dt * (lite ? 30 : 60) * (0.35 + 0.65 * q);
      while (s.acc >= 1) { s.acc--; ch.spawn({ k: 0, ang: rand(0, 6.283), rad: R * ch.H * rand(1.8, 4.2), age: 0, life: rand(0.8, 1.6), w: rand(1, 2.2) }); }
    }
  },

  setUniforms(ch, gl, loc, now) {
    const s = ch.s;
    s.age = s.age || new Float32Array(MAX_SEEDS);
    s.age.fill(99);
    ch.seeds.forEach((sd, i) => { if (i && sd.born) s.age[i] = (now - sd.born) / 1000; });
    gl.uniform1f(loc.uR0, r0Of(ch.AR));
    gl.uniform1f(loc.uHit, s.hit ? (now - s.hit) / 1000 : 99);
    gl.uniform1fv(loc.uAge, s.age);
  },

  step(ch, c, dt) {
    const P = ch.parts, cx = CX * ch.W, cy = (1 - CY) * ch.H, R = orbR(ch) * ch.H;
    c.lineCap = 'round';
    for (let i = P.length - 1; i >= 0; i--) {
      const s = P[i];
      s.age += dt;
      if (s.age >= s.life) { P.splice(i, 1); continue; }
      const h = 1 - s.age / s.life;
      if (s.k === 0) {                                   // a light stream, spiralling in
        s.rad -= (s.rad - R * 0.8) * dt * 2.4;
        s.ang += (1.2 + (7 * R) / Math.max(s.rad, 1)) * dt * 1.6;
        if (R < 2 || s.rad < R * 1.03) { P.splice(i, 1); continue; }
        const a = Math.min(1, s.age * 4) * Math.min(1, h * 2.5) * 0.75;
        c.strokeStyle = `rgba(${CYAN},${a.toFixed(3)})`; c.lineWidth = s.w;
        c.beginPath(); c.arc(cx, cy, s.rad, -s.ang, -s.ang + 0.25 + (0.4 * R) / s.rad); c.stroke();
      } else if (s.k === 1) {                            // a paper shred, flung round with the spin
        const dx = s.x - cx, dy = s.y - cy, r = Math.hypot(dx, dy) || 1;
        s.vx += (dy / r) * 160 * dt; s.vy += (-dx / r) * 160 * dt;
        s.vx *= 1 - dt * 1.1; s.vy *= 1 - dt * 1.1;
        s.x += s.vx * dt; s.y += s.vy * dt; s.rot += s.vr * dt; s.fl += s.vf * dt;
        c.save();
        c.globalAlpha = Math.min(1, h * 3);
        c.translate(s.x, s.y); c.rotate(s.rot); c.scale(1, Math.cos(s.fl));
        c.fillStyle = 'rgba(30,60,90,.25)'; c.fillRect(-s.w / 2 + 1.5, -s.h / 2 + 2, s.w, s.h);
        c.fillStyle = s.col; c.fillRect(-s.w / 2, -s.h / 2, s.w, s.h);
        c.restore();
      } else {                                           // a spark
        s.vx *= 1 - dt * 3; s.vy *= 1 - dt * 3;
        s.x += s.vx * dt; s.y += s.vy * dt;
        c.strokeStyle = `rgba(215,245,255,${h.toFixed(3)})`; c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(s.x - s.vx * 0.03, s.y - s.vy * 0.03); c.stroke();
      }
    }
  },

  fs: `
const float CX = ${CX.toFixed(3)}, CY = ${CY.toFixed(3)}, HIT = ${HIT.toFixed(3)};
const float ARMS = ${ARMS.toFixed(1)}, TW = ${TW.toFixed(1)}, AMP = ${AMP.toFixed(3)}, SPIN = ${SPIN.toFixed(1)};
const float KH = ${KH.toFixed(5)};
const vec3 CYAN = vec3(.45, .82, 1.);
uniform float uR0, uHit;
uniform float uAge[${MAX_SEEDS}];

float arm(vec2 v, float tw) { float r = length(v); return r < 1e-4 ? 0. : cos(ARMS * atan(v.y, v.x) + tw * r - uT * SPIN); }
// rotate p about c (and push it out by pinch): sampling there drags the picture round and in
vec2 spin(vec2 p, vec2 c, float ang, float pinch) {
  vec2 v = p - c; float cs = cos(ang), sn = sin(ang);
  return c + vec2(cs * v.x - sn * v.y, sn * v.x + cs * v.y) * (1. + pinch);
}
vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }

// the sphere: a shell of light with bands wrapping it on three tumbling axes, a white-hot core, and the wind
// it drags round with it. Premultiplied: rgb to add, a to cover.
vec4 orb(vec2 v, float R) {
  if (R < 1e-4) return vec4(0.);
  float rr = length(v) / R;
  if (rr > 3.) return vec4(0.);
  vec3 c = vec3(0.); float al = 0.;
  if (rr < 1.) {
    float z = sqrt(1. - rr * rr);
    vec3 P = vec3(v / R, z);
    float st = 0.;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      vec3 Q = rotY(rotX(P, uT * (2.3 + fi * 1.9) + fi * 2.1), uT * (3.7 - fi * 1.1) + fi * 1.3);
      st += pow(.5 + .5 * sin(2. * atan(Q.y, Q.x) + 4. * Q.z + fi * 1.7), 20.);
    }
    float rim = pow(rr, 4.), core = exp(-rr * rr * 5.), edge = smoothstep(1., .95, rr);
    c = (mix(vec3(.16, .5, 1.), vec3(.7, .92, 1.), rim) * (.5 + .6 * rim) + vec3(.9, .98, 1.) * st * (.4 + .6 * z) * 1.1 + vec3(core * 1.15)) * edge;
    al = clamp(.6 + .4 * rim + core + st * .3, 0., 1.) * edge;
  }
  float th = atan(v.y, v.x);
  float shell = pow(.5 + .5 * sin(3. * th + 10. * log(max(rr, .01)) - uT * 18.), 12.) * smoothstep(.92, 1.02, rr) * exp(-(rr - 1.) * 4.);
  float halo = exp(-max(rr - 1., 0.) * 3.5) * step(1., rr);
  c += vec3(.6, .88, 1.) * (shell * .8 + halo * .25);
  return vec4(c, al);
}

void main() {
  vec2 uv = vUv + uQuake * vec2(sin(uT * 83.), cos(uT * 97.)) * .0025;
  vec2 a = vec2(uv.x * uAr, uv.y);
  vec2 c0 = vec2(CX * uAr, CY), v0 = a - c0;
  float r0 = length(v0);
  vec2 dir = r0 > 1e-4 ? v0 / r0 : vec2(0.);

  // the front: a circle with spinning spiral arms, from the sphere and from every small one you dropped
  float G = (uP - HIT) * uK * KH + uR0 * smoothstep(HIT, HIT + .03, uP);
  float d = G - r0 + AMP * arm(v0, TW) * min(1., r0 / .15) + (fbm(a * 3.) - .5) * .06;
  vec2 cen = c0;
  for (int i = 1; i < ${MAX_SEEDS}; i++) {
    if (i >= uN) break;
    vec4 s = uSeeds[i];
    vec2 vi = a - s.xy; float ri = length(vi);
    float di = max(uP - s.z, 0.) * uK * .6 + s.w - ri + AMP * .5 * arm(vi, TW * 1.6) * min(1., ri / .06);
    if (di > d) { d = di; cen = s.xy; }
  }

  // the impact's shockwave bends what it crosses
  float wave = exp(-pow((r0 - uHit * 1.5) / .04, 2.)) * exp(-uHit * 2.2);
  vec2 as = a + dir * wave * .03;

  float fade = 1. - smoothstep(.8, .95, uP);
  float Rb = uR0 * smoothstep(.004, HIT, uP) * fade;
  float q = smoothstep(0., HIT, uP) * fade;

  // ahead of the front: the paper is dragged round into the spin, harder the closer it is
  float suck = q * 1.3 * exp(-max(r0 - Rb, 0.) / .12);
  float tw = d < 0. ? 1.4 * exp(d / .045) : 0.;
  vec2 p = spin(as, c0, -suck, .18 * suck);
  p = spin(p, cen, -tw, .1 * tw);
  vec2 pv = a - uPtr;
  p = spin(p, uPtr, -uPtrOn * .8 * exp(-dot(pv, pv) / .01), 0.);
  vec3 dr = texture(uDraft, vec2(p.x / uAr, p.y)).rgb;
  float score = smoothstep(.86, 1., arm(a - cen, TW * 3.5)) * exp(min(d, 0.) / .025) * step(d, 0.);
  dr *= 1. - .22 * score;                                         // scored by the spin
  dr = mix(dr, vec3(.98, .97, .94), smoothstep(-.012, -.002, d) * step(d, 0.) * .55);   // a torn, lifted lip

  // behind it: the final, still twisted near the edge and settling; rings of light run out from the sphere
  float back = max(d, 0.);
  vec2 f = spin(as, cen, -.55 * exp(-back / .05), 0.);
  float rings = 0.;
  if (G > 0.) for (int k = 0; k < 3; k++) {
    float ph = fract(uT * .5 + float(k) / 3.);
    rings += exp(-pow((r0 - ph * G) / .012, 2.)) * (1. - ph);
  }
  f += dir * rings * .012 * fade;
  vec3 fin = texture(uFinal, vec2(f.x / uAr, f.y)).rgb;
  fin *= 1. - .45 * exp(-back / .025);                            // in shadow under the paper's edge
  fin += CYAN * rings * .22 * fade;

  vec3 col = d < 0. ? dr : fin;
  col += CYAN * exp(-abs(d) * 80.) * .55 * smoothstep(-.02, .0, G);   // the grinding edge glows
  col += CYAN * q * .3 * exp(-max(r0 - Rb, 0.) / .1);                // the sphere lights the paper
  col += vec3(.75, .92, 1.) * exp(-uHit * 6.) * .6;                   // the flash on impact

  vec4 ob = orb(v0, Rb * (1. + .04 * sin(uT * 37.)));
  col = col * (1. - ob.a) + ob.rgb;

  // the small spheres you dropped: they form, sink in, and go
  for (int i = 1; i < ${MAX_SEEDS}; i++) {
    if (i >= uN) break;
    float ag = uAge[i];
    float rs = .045 * smoothstep(0., .25, ag) * (1. - smoothstep(.8, 1.3, ag));
    if (rs < .001) continue;
    vec2 vs = a - uSeeds[i].xy;
    col += CYAN * .3 * exp(-max(length(vs) - rs, 0.) / .06) * (rs / .045);
    vec4 m = orb(vs, rs);
    col = col * (1. - m.a) + m.rgb;
  }
  o = vec4(clamp(col, 0., 1.), 1.);
}`,
};

export default spiral;
