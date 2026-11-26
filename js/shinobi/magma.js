/* Magma Sphere: a churning ball of molten rock gathers over the draft, sinks into it and melts it away.
   Wind-up: the sphere gathers in the middle of the page, black crust split by glowing cracks that slowly churn,
   with heat haze around it. The page warms to orange, and molten drips fall off it and scorch the paper where they
   land. Sink: it drops into the page with a hiss, a thud and a burst of embers. Melt: the page melts outward
   from it. The front is a glowing molten lip, white-orange where it bites, cooling through dark red to a black
   crust just behind; ahead of it the paper browns, chars and shimmers in the heat, with embers and smoke rising
   off it. Behind the crust the finished design shows, with the last glowing cracks cooling across it.
   Move over the paper and the air shimmers under your hand. Click to drop a blob of molten rock that melts its own
   hole. */
import { fbm, vn, ign, clamp, rand, lite, DONE, MAX_SEEDS } from '../core.js';
import { MAGMA, makeMagma, playSink, playBlob } from './sfx-magma.js';
import { tuned } from './sfx.js';

const CX = 0.5, CY = 0.52;   // where the sphere forms (page fractions; y is up)
const HIT = 0.2;             // progress at which it sinks in
const SINK_MS = 650;         // how long the sinking takes
const NZ = 0.05;             // fine lumpiness of the molten front
const LOBE = 0.19;           // and the big slow lobes lava pushes out in
const CRUST = 0.15;          // how far behind the front the crust lasts
const KH = DONE / (DONE - HIT);
const DRIPS = 8;

const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const r0Of = (AR) => 0.11 * Math.min(1, AR * 1.6);   // the sphere's size (smaller on a tall phone)
// how far it has sunk (0–1): on its own clock once it passes HIT; if the page opens past it, it has already sunk
const sinkOf = (ch, now) => (ch.p < HIT ? 0 : ch.s.hit ? ss(0, 1, (now - ch.s.hit) / SINK_MS) : 1);
const orbR = (ch, now) => r0Of(ch.AR) * ss(0.004, HIT, ch.p) * (1 - sinkOf(ch, now));

function fuel(ch, u, v, now) {
  const t = (now / 1000) % 1000, ax = u * ch.AR, ay = v;
  const r = Math.hypot(ax - CX * ch.AR, ay - CY), nz = fbm(ax * 3, ay * 3 + t * 0.05) - 0.5, lobe = fbm(ax * 1.6 + t * 0.03, ay * 1.6) - 0.5;
  let d = (ch.p - HIT) * ch.K * KH + r0Of(ch.AR) * 0.6 * ss(HIT, HIT + 0.03, ch.p) - r + nz * NZ + lobe * LOBE * ss(HIT, HIT + 0.08, ch.p);
  for (let i = 1; i < ch.seeds.length; i++) {
    const s = ch.seeds[i], g = Math.max(ch.p - s.p0, 0) * ch.K * 0.6 + ign(s, now) + (s.off || 0);
    d = Math.max(d, g - Math.hypot(ax - s.u * ch.AR, ay - s.v) + nz * 0.04 * ss(0, 0.02, g));
  }
  return d;
}

/* ---------- particles ---------- */
// k 0: a molten drip falling off the sphere · 1: an ember rising · 2: a wisp of smoke
function ember(ch, x, y, vx, vy, big = 1) { ch.spawn({ k: 1, x, y, vx, vy, age: 0, life: rand(0.8, 2) * big, r: rand(0.8, 2.2) * big, ph: rand(0, 6.28) }); }
function smoke(ch, x, y) { ch.spawn({ k: 2, x, y, vx: rand(-12, 12), vy: rand(-40, -18), age: 0, life: rand(1.4, 2.8), r: rand(6, 14) }); }

/* A drip lands: it scorches the paper there (the shader draws that from s.drips) and spits a few embers. */
function land(ch, s, now) {
  const D = (ch.s.drips ||= []);
  D.push({ x: (s.x / ch.W) * ch.AR, y: 1 - s.y / ch.H, born: now });
  if (D.length > DRIPS) D.shift();
  for (let i = 0; i < 6; i++) ember(ch, s.x, s.y, rand(-70, 70), rand(-140, -40), 0.7);
}

/* ---------- sound ---------- */
function steer(ch, now) {
  const A = ch.sound;
  if (!A?.ctx || ch.mode !== 'gl') return;
  const X = (ch.s.lava ||= makeMagma(A));
  const sink = sinkOf(ch, now), q = ss(0, HIT, ch.p) * (1 - sink);
  const melt = ch.p >= HIT && ch.p < DONE + 0.02 ? Math.max(sink, 0.4) : 0;
  X.set(tuned('magma', MAGMA), q, melt, Math.min(1, ch.speed * 6));
}
function hush(ch) { ch.s.lava?.silence(); }

const magma = {
  id: 'magma',
  num: '07',
  label: 'Magma Sphere',
  hud: 'Draft melted',
  hint: 'Scroll to heat the sphere',
  clickHint: 'the paper to drop molten rock',
  // no WebGL2: a hole that opens from the middle (evenodd cuts it out of the page)
  clip: (k) => {
    const r = Number(k) * 0.75, pts = ['0% 0%', '100% 0%', '100% 100%', '0% 100%', '0% 0%'];
    for (let i = 0; i <= 32; i++) { const a = (i / 32) * 6.2832; pts.push(`${(50 + r * Math.cos(a)).toFixed(2)}% ${(48 - r * Math.sin(a)).toFixed(2)}%`); }
    return `polygon(evenodd, ${pts.join(', ')})`;
  },
  wantsColor: true,
  uniforms: ['uR0', 'uHit', 'uSink', 'uDrip', 'uAge'],
  theme: {
    accent: '#ff5a1f', accent2: '#ffc27a', onAccent: '#1f0700', seed: 7,
    glowA: 'rgba(255,90,31,.13)', glowB: 'rgba(255,170,60,.07)',
    kicker: 'Experiment · Melt the draft',
    draft: ['Melt it', 'down?'], final: ['Melt it', 'down.'],
    aside: 'too cold.',
    sub: 'Turn up the heat until the first draft gives way, then pour what is left into something solid.',
    note: ['v0.3', 'too rigid.', 'melt it.'],
    chips: [['Drafts melted', '18'], ['Shipped', '12']],
  },
  home: () => ({ u: CX, v: CY, p0: 0, born: 0 }),
  // by DONE the front has to pass the farthest corner, lumps, crust and all
  reach: (AR) => Math.hypot(AR * Math.max(CX, 1 - CX), Math.max(CY, 1 - CY)) + NZ / 2 + LOBE / 2 + CRUST + 0.05 - r0Of(AR) * 0.6,
  fuel,

  // embers rise off the molten lip, and smoke off the charring paper just ahead of it
  emit(ch, x, y, d, act) {
    if (d > 0 && d < 0.03 && Math.random() < act * 0.35) ember(ch, x, y, rand(-30, 30), rand(-120, -40));
    else if (d < 0 && d > -0.03 && Math.random() < act * 0.06) smoke(ch, x, y);
  },

  onClick(ch, seed) { seed.off = -0.02; if (ch.sound?.ctx) playBlob(ch.sound, tuned('magma', MAGMA)); },
  burst(ch, x, y) {
    for (let i = 0; i < 22; i++) { const a = rand(0, 6.283), sp = rand(60, 220); ember(ch, x, y, Math.cos(a) * sp, Math.sin(a) * sp - 80); }
    for (let i = 0; i < 4; i++) smoke(ch, x + rand(-10, 10), y + rand(-10, 10));
  },
  reset(ch) { hush(ch); ch.s = { lava: ch.s.lava }; },
  quiet: hush,
  /* For capture: &sink=<ms> puts the sphere that far into sinking at the captured moment (t + 800). */
  prime(ch, t, pv, params) {
    if (params.has('sink')) { ch.s.hit = t + 800 - Number(params.get('sink')); ch.s.capture = true; }
    if (params.has('drips')) {
      const n = Number(params.get('drips'));
      ch.s.drips = Array.from({ length: n }, (_, i) => ({ x: (CX + Math.cos(i * 2.4) * 0.12 * (1 + i * 0.25)) * ch.AR, y: CY - 0.16 - (i % 3) * 0.07, born: t - 400 * i }));
    }
  },

  onFrame(ch, now, dt) {
    const s = ch.s;
    // it sinks in, once per pass: a hiss and a thud, embers bursting out round it, and the ground shakes
    if (ch.pPrev < HIT && ch.p >= HIT && !s.hit) {
      s.hit = now;
      const R = r0Of(ch.AR) * ch.H, cx = CX * ch.W, cy = (1 - CY) * ch.H;
      for (let i = 0; i < (lite ? 40 : 80); i++) { const a = rand(0, 6.283), sp = rand(80, 360); ember(ch, cx + Math.cos(a) * R * 0.8, cy + Math.sin(a) * R * 0.8, Math.cos(a) * sp, Math.sin(a) * sp - 120, 1.2); }
      for (let i = 0; i < (lite ? 6 : 12); i++) smoke(ch, cx + rand(-R, R), cy + rand(-R, R) * 0.5);
      if (ch.sound?.ctx) playSink(ch.sound, tuned('magma', MAGMA));
    }
    if (ch.p < HIT - 0.01 && !s.capture) s.hit = 0;
    if (ch.p < 0.01 && !s.capture) s.drips = [];
    steer(ch, now);
    const sink = sinkOf(ch, now);
    ch.quake = Math.max(ch.quake * 0.5, s.hit ? Math.exp(-(now - s.hit) / 350) * 0.8 : 0, ss(0, HIT, ch.p) * (1 - sink) * 0.08);
    if (ch.mode !== 'gl') return;

    // while it hangs there, molten drips fall off its underside, and embers and smoke rise off its top
    const R = orbR(ch, now) * ch.H;
    if (R > 3) {
      const q = ss(0, HIT, ch.p), cx = CX * ch.W, cy = (1 - CY) * ch.H;
      s.dripAcc = (s.dripAcc || 0) + dt * 1.6 * q * (1 - sink);
      while (s.dripAcc >= 1) {
        s.dripAcc--;
        const a = rand(0.35, 2.8);   // off the lower half
        ch.spawn({ k: 0, x: cx + Math.cos(a) * R * 0.85, y: cy + Math.sin(a) * R * 0.85, vx: rand(-15, 15), vy: rand(10, 40), ty: cy + R * rand(1.3, 3.6) + rand(0, ch.H * 0.12), age: 0, life: 6, r: rand(2.5, 5) });
      }
      s.acc = (s.acc || 0) + dt * (lite ? 10 : 20) * q;
      while (s.acc >= 1) {
        s.acc--;
        const a = rand(3.4, 6.0);    // off the upper half
        if (Math.random() < 0.75) ember(ch, cx + Math.cos(a) * R, cy + Math.sin(a) * R, rand(-20, 20), rand(-90, -30));
        else smoke(ch, cx + Math.cos(a) * R * 0.9, cy + Math.sin(a) * R * 0.9);
      }
    }
  },

  setUniforms(ch, gl, loc, now) {
    const s = ch.s;
    s.age = s.age || new Float32Array(MAX_SEEDS);
    s.age.fill(99);
    ch.seeds.forEach((sd, i) => { if (i && sd.born) s.age[i] = (now - sd.born) / 1000; });
    s.dripBuf = s.dripBuf || new Float32Array(DRIPS * 3);
    s.dripBuf.fill(-1);
    (s.drips || []).forEach((d, i) => s.dripBuf.set([d.x, d.y, (now - d.born) / 1000], i * 3));
    gl.uniform1f(loc.uR0, r0Of(ch.AR));
    gl.uniform1f(loc.uHit, s.hit ? (now - s.hit) / 1000 : 99);
    gl.uniform1f(loc.uSink, sinkOf(ch, now));
    gl.uniform3fv(loc.uDrip, s.dripBuf);
    gl.uniform1fv(loc.uAge, s.age);
  },

  step(ch, c, dt) {
    const P = ch.parts, now = performance.now();
    for (let i = P.length - 1; i >= 0; i--) {
      const s = P[i];
      s.age += dt;
      if (s.age >= s.life) { P.splice(i, 1); continue; }
      const h = 1 - s.age / s.life;
      if (s.k === 0) {                                   // a molten drip, stretching as it falls
        s.vy += 700 * dt; s.x += s.vx * dt; s.y += s.vy * dt;
        if (s.y >= s.ty) { land(ch, s, now); P.splice(i, 1); continue; }
        const st = Math.min(3, 1 + s.vy / 300);
        c.save(); c.translate(s.x, s.y); c.scale(1, st);
        const g = c.createRadialGradient(0, 0, 0, 0, 0, s.r * 1.8);
        g.addColorStop(0, 'rgba(255,240,170,1)'); g.addColorStop(0.45, 'rgba(255,130,30,.95)'); g.addColorStop(1, 'rgba(160,30,0,0)');
        c.fillStyle = g; c.beginPath(); c.arc(0, 0, s.r * 1.8, 0, 6.283); c.fill();
        c.restore();
      } else if (s.k === 1) {                            // an ember: rises, wavers, cools from yellow to red
        s.vy -= 50 * dt; s.vx += Math.sin(s.age * 5 + s.ph) * 40 * dt;
        s.vx *= 1 - dt * 0.8; s.vy *= 1 - dt * 0.6;
        s.x += s.vx * dt; s.y += s.vy * dt;
        const a = Math.min(1, h * 2) * (0.7 + 0.3 * Math.sin(s.age * 30 + s.ph));
        c.fillStyle = `rgba(255,${Math.round(90 + 150 * h)},${Math.round(40 * h)},${a.toFixed(3)})`;
        c.beginPath(); c.arc(s.x, s.y, s.r * (0.6 + 0.4 * h), 0, 6.283); c.fill();
      } else {                                           // smoke: grey, swelling and thinning as it rises
        s.x += s.vx * dt; s.y += s.vy * dt; s.r += dt * 10;
        const g = c.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
        g.addColorStop(0, `rgba(70,62,58,${(0.16 * h * Math.min(1, s.age * 3)).toFixed(3)})`); g.addColorStop(1, 'rgba(70,62,58,0)');
        c.fillStyle = g; c.beginPath(); c.arc(s.x, s.y, s.r, 0, 6.283); c.fill();
      }
    }
  },

  fs: `
const float CX = ${CX.toFixed(3)}, CY = ${CY.toFixed(3)}, HIT = ${HIT.toFixed(3)}, KH = ${KH.toFixed(5)};
const float NZ = ${NZ.toFixed(3)}, LOBE = ${LOBE.toFixed(3)}, CRUST = ${CRUST.toFixed(3)};
uniform float uR0, uHit, uSink;
uniform vec3 uDrip[${DRIPS}];
uniform float uAge[${MAX_SEEDS}];

float ridge(vec2 p) { return 1. - abs(2. * vn(p) - 1.); }
// molten rock: a black crust split by glowing cracks, the cracks warped and slowly churning
float lava(vec2 p, float t) {
  vec2 w = p + vec2(fbm(p * 1.3 + vec2(t * .08, 0.)), fbm(p * 1.3 + vec2(5.2, -t * .07))) * .9;
  return clamp(pow(ridge(w * 2.2), 7.) * .8 + pow(ridge(w * 5. + 3.1), 12.) * .5, 0., 1.);
}
// heat as colour: black, dark red, orange, yellow, nearly white
vec3 heat(float k) {
  k = clamp(k, 0., 1.2);
  return vec3(smoothstep(.04, .5, k), smoothstep(.32, .85, k) * .82, smoothstep(.75, 1.1, k) * .75) * (.35 + .9 * k);
}
// the sphere: lit from the top left, a cooling crust over churning melt, glowing at the rim. rgb to add, a to cover.
vec4 orb(vec2 v, float R, float t) {
  if (R < 1e-4) return vec4(0.);
  float rr = length(v) / R;
  vec3 c = vec3(0.); float al = 0.;
  if (rr < 1.) {
    float z = sqrt(1. - rr * rr);
    vec3 P = vec3(v / R, z);
    vec2 sp = vec2(atan(P.x, P.z) * 1.1 + t * .06, P.y * 1.7 - t * .03);
    float k = lava(sp * 1.6, t) * (.55 + .45 * z) + .2 * pow(1. - z, 3.);
    float lit = .35 + .65 * max(0., dot(normalize(P), normalize(vec3(-.5, .6, .7))));
    c = vec3(.07, .045, .035) * lit + heat(k * 1.15) + heat(.5) * pow(rr, 6.) * .6;
    al = smoothstep(1., .96, rr);
  }
  float halo = exp(-max(rr - 1., 0.) * 4.) * step(1., rr);
  c += vec3(1., .42, .1) * halo * .35;
  return vec4(c, al);
}

void main() {
  vec2 uv = vUv + uQuake * vec2(sin(uT * 71.), cos(uT * 89.)) * .002;
  vec2 a = vec2(uv.x * uAr, uv.y), c0 = vec2(CX * uAr, CY), v0 = a - c0;
  float r0 = length(v0);

  // the front: a lumpy circle melting outward from where it sank, and from every blob you dropped
  float G = (uP - HIT) * uK * KH + uR0 * .6 * smoothstep(HIT, HIT + .03, uP);
  float nz = fbm(a * 3. + vec2(0., uT * .05)) - .5, lobe = fbm(a * 1.6 + vec2(uT * .03, 0.)) - .5;
  float d = G - r0 + nz * NZ + lobe * LOBE * smoothstep(HIT, HIT + .08, uP);
  for (int i = 1; i < ${MAX_SEEDS}; i++) {
    if (i >= uN) break;
    vec4 s = uSeeds[i];
    float g = max(uP - s.z, 0.) * uK * .6 + s.w;
    d = max(d, g - distance(a, s.xy) + nz * .04 * smoothstep(0., .02, g));
  }

  float q = smoothstep(0., HIT, uP), fade = 1. - smoothstep(.8, .95, uP);
  float Rb = uR0 * smoothstep(.004, HIT, uP) * (1. - uSink);
  float nearB = exp(-max(r0 - Rb, 0.) / .14) * q * (1. - uSink);
  float nearF = exp(min(d, 0.) / .05) * step(d, 0.) * step(HIT, uP);
  vec2 pv = a - uPtr;
  float shim = nearF * .9 + nearB * .8 + uPtrOn * exp(-dot(pv, pv) / .006) * .8;

  // ahead: the paper shimmers in the heat, browns, chars at the lip, and is scorched where drips landed
  vec2 wob = vec2(sin(a.y * 70. + uT * 8.), cos(a.x * 63. - uT * 7.)) * .0022 * shim;
  vec3 dr = texture(uDraft, vec2(uv.x + wob.x / uAr, uv.y + wob.y)).rgb;
  for (int i = 0; i < ${DRIPS}; i++) {
    vec3 dp = uDrip[i];
    if (dp.z < 0.) continue;
    float dd = distance(a, dp.xy) * (1. + (vn(a * 90. + dp.xy * 31.) - .5) * .7), sz = .016 * min(1., .4 + dp.z * 4.);   // ragged, not round
    dr = mix(dr, vec3(.14, .08, .05), smoothstep(sz * 1.7, sz * .4, dd) * .85);
    dr = mix(dr, dr * vec3(.75, .58, .42), smoothstep(sz * 3.2, sz, dd) * .6);
    dr += heat(.75) * smoothstep(sz * .9, 0., dd) * exp(-dp.z * .7);
  }
  float brown = exp(min(d, 0.) / .06) * step(d, 0.) * step(HIT, uP);
  dr = mix(dr, dr * vec3(.76, .58, .4), brown * .75);
  dr = mix(dr, vec3(.07, .045, .035), smoothstep(-.012, 0., d) * step(d, 0.));
  dr *= mix(vec3(1.), vec3(1., .84, .68), q * .45 * fade);           // the page warms as it charges
  dr += vec3(1., .45, .1) * (nearB * .28 + nearF * .12) * fade;      // and glows near the heat

  // behind: the molten lip, cooling to a black crust, then the finished design with the last cracks cooling
  float back = max(d, 0.);
  vec3 fin = texture(uFinal, uv).rgb;
  float cr = lava(a * 3., uT);
  float hot = exp(-back / .02);
  float crust = 1. - smoothstep(CRUST * .55, CRUST, back);
  // plates of black crust split by glowing cracks, the cracks fading as the crust cools away from the front
  vec3 rock = vec3(.07, .045, .035) * (.7 + .5 * vn(a * 40.)) + heat(hot * 1.05 + cr * (.8 + .4 * hot) * (.45 + .55 * exp(-back / .1)));
  vec3 behind = mix(fin, rock, crust);
  behind += heat(.62) * cr * exp(-back / .15) * .45 * (1. - crust);
  vec3 col = d < 0. ? dr : behind;
  col += heat(1.) * exp(-abs(d) * 170.) * .6 * step(HIT, uP);       // the molten lip

  // the sphere, and the flash of heat as it sinks
  vec4 ob = orb(v0, Rb * (1. + .015 * sin(uT * 3.)), uT);
  col = col * (1. - ob.a) + ob.rgb;
  col += vec3(1., .55, .2) * exp(-uHit * 3.5) * .4 * exp(-max(r0 - uR0, 0.) / .25);

  // the blobs you dropped: they land, glow and sink in
  for (int i = 1; i < ${MAX_SEEDS}; i++) {
    if (i >= uN) break;
    float ag = uAge[i];
    float rs = .03 * smoothstep(0., .15, ag) * (1. - smoothstep(.7, 1.3, ag));
    if (rs < .001) continue;
    vec4 m = orb(a - uSeeds[i].xy, rs, uT + float(i) * 3.);
    col = col * (1. - m.a) + m.rgb;
  }
  o = vec4(clamp(col, 0., 1.), 1.);
}`,
};

export default magma;
