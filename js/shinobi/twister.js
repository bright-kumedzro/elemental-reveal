/* Sand Tornado: a twister touches down in the middle of the draft and grows until it takes the whole page.
   Forming: the light goes grey, a dust cloud hangs off the top of the page, and a thin rope of sand reaches down
   from it. Touchdown: it lands in the middle with a thud and a ring of dust. Then it grows as you scroll, wider,
   taller and nearer, its bands and its debris getting bigger as it comes. Its foot widens with it and tears the
   paper away from the middle outward along a turning, toothed edge; the paper spirals up the column and a skirt of
   dust whirls round the foot. Ahead of it the paper is dragged round towards it. At the end it fills the screen
   and blows through, and the dust clears off the finished design.
   Move over the paper and it swirls under your hand. Click to spin up a dust devil that tears its own patch. */
import { fbm, ign, clamp, rand, lite, DONE, MAX_SEEDS } from '../core.js';
import { tuned } from './sfx.js';
import { TWISTER, makeTwister, playTouchdown, playDevil } from './sfx-twister.js';

const CX = 0.5, CY = 0.4;   // where it touches down (page fractions; y is up): the middle, a little low
const P0 = 0.08;            // progress at which it touches down
const PASS0 = 0.76, PASS1 = 0.92;   // it blows through between these
const W0 = 0.03;            // the hole its foot tears at touchdown
const ARMS = 3, TW = 9, AMP = 0.035, SPIN = 1.5;   // the torn edge: turning teeth
const G1 = 0.22;            // how fast a dust devil's patch widens (per unit of progress)
const GS = 0.004;           // one grain, in page heights
const LEAN = -0.06;
const KH = DONE / (DONE - P0);
const SAND = ['#c2a47a', '#d8bf94', '#a98a62', '#e6d4b0', '#8f7454'];

const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const tooth = (dx, dy, r, now) => (r < 1e-4 ? 0 : Math.cos(ARMS * Math.atan2(dy, dx) + TW * r - ((now / 1000) % 1000) * SPIN));
/* The hole the foot has torn so far (aspect units). */
const holeOf = (ch) => (ch.p - P0) * ch.K * KH + W0 * ss(P0, P0 + 0.02, ch.p);

/* Everything the shader, the particles and the sound share this frame. */
function phase(ch) {
  const s = ch.s, p = ch.p, sc = Math.min(1, ch.AR * 1.4);
  s.bx = CX * ch.AR; s.by = CY;
  s.g = ss(P0, PASS0, p);                                // how grown it is
  s.pass = ss(PASS0, PASS1, p);                          // and how far it has blown through
  s.form = ss(0.005, P0, p);                             // the rope reaching down to the ground
  s.pres = ss(0, 0.02, p) * (1 - s.pass);
  s.touch = ss(P0, P0 + 0.02, p) * (1 - s.pass);
  const hole = Math.max(holeOf(ch), 0);
  s.foot = clamp(hole * 0.8, 0.012, 0.03 + 0.22 * s.g * sc);   // its foot widens with the hole it tears, up to a point
  s.r1 = s.foot * 1.5 + (0.07 + 0.9 * s.g) * sc;               // and its top flares out until it spans the page
  const sky = 1.05 - CY;
  s.bot = sky * (1 - s.form);                            // where the visible funnel starts, up from its foot
  return s;
}

/* The funnel's centre line and width at height hy above its foot (aspect units). Mirrors funnel() in the shader. */
function column(now, bx, hy, H, r0, r1, lean) {
  const T = (now / 1000) % 1000, k = clamp(hy / H, 0, 1);
  const x0 = bx + lean * hy + H * (0.05 * Math.sin(k * 5.5 - T * 1.7) * ss(0, 0.35, k) + 0.012 * Math.sin(k * 17 + T * 3.3));
  const R = r0 + (r1 - r0) * Math.pow(k, 1.6) + H * 0.006 * Math.sin(k * 30 - T * 9);
  return [x0, Math.max(R, 0.004)];
}

function fuel(ch, u, v, now) {
  const ax = u * ch.AR, ay = v, dx = ax - CX * ch.AR, dy = ay - CY, r = Math.hypot(dx, dy);
  const on = ss(P0, P0 + 0.02, ch.p);
  let d = holeOf(ch) - r + (AMP * tooth(dx, dy, r, now) * Math.min(1, r / 0.08) + (fbm(ax * 5, ay * 5) - 0.5) * 0.05 + (fbm(ax * 24 + 3, ay * 24) - 0.5) * 0.014) * on;
  for (let i = 1; i < ch.seeds.length; i++) {
    const sd = ch.seeds[i], g = Math.max(ch.p - sd.p0, 0) * G1 + ign(sd, now) + (sd.off || 0);
    d = Math.max(d, g - Math.hypot(ax - sd.u * ch.AR, ay - sd.v) + (fbm(ax * 5, ay * 5) - 0.5) * 0.04 * ss(0, 0.02, g));
  }
  return d;
}

/* ---------- particles ---------- */
const sandCol = () => SAND[(Math.random() * SAND.length) | 0];
// a scrap of paper caught at the foot, spiralling up the column (or up a dust devil's, if it has a base of its own)
function scrap(ch, col, dev, big = 1) {
  ch.spawn({ k: 0, phi: rand(0, 6.283), hy: rand(0, 0.025), vh: rand(0.05, 0.14) * big, age: 0, life: rand(1.6, 2.8), w: rand(2.5, 6.5) * big, h: rand(1.5, 4) * big, rot: rand(0, 6.28), vr: rand(-9, 9), col, dev });
}
// a grain whirling round the foot in the dust skirt
function skirt(ch, dev, foot = 0.05) { ch.spawn({ k: 1, ang: rand(0, 6.283), rad: dev ? rand(0.01, 0.04) : foot * rand(0.8, 1.6) + 0.01, wv: rand(4, 8), rise: 0, age: 0, life: rand(0.5, 1.2), z: rand(1, 2.2) * (dev ? 1 : 1 + foot * 3), col: sandCol(), dev }); }
function grain(ch, x, y, vx, vy) { ch.spawn({ k: 3, x, y, vx, vy, age: 0, life: rand(0.8, 1.6), z: rand(1.1, 2.6), col: sandCol() }); }
function puff(ch, x, y, vx, vy, r) { ch.spawn({ k: 2, x, y, vx, vy, age: 0, life: rand(1.1, 1.9), r, gr: rand(25, 60) }); }

/* ---------- sound ---------- */
/* Louder and heavier the bigger and nearer it is, and the harder you scroll. */
function steer(ch) {
  const A = ch.sound;
  if (!A?.ctx || ch.mode !== 'gl') return;
  const X = (ch.s.snd = ch.s.snd || makeTwister(A)), s = ch.s;
  const devils = ch.seeds.some((sd) => sd.born && performance.now() - sd.born < 2000) ? 0.35 : 0;
  X.set(tuned('twister', TWISTER), Math.max(s.touch * (0.35 + 0.65 * s.g), s.pres * 0.3, devils), Math.min(1, ch.speed * 8), 1);
}
function hush(ch) { ch.s.snd?.silence(); }

const twister = {
  id: 'twister',
  num: '06',
  label: 'Sand Tornado',
  hud: 'Draft uprooted',
  hint: 'Scroll to bring the twister down',
  clickHint: 'the paper to spin up a dust devil',
  // no WebGL2: a hole that opens from where it touches down (evenodd cuts it out of the page)
  clip: (k) => {
    const r = Number(k) * 0.85, pts = ['0% 0%', '100% 0%', '100% 100%', '0% 100%', '0% 0%'];
    for (let i = 0; i <= 32; i++) { const a = (i / 32) * 6.2832; pts.push(`${(CX * 100 + r * Math.cos(a)).toFixed(2)}% ${((1 - CY) * 100 + r * Math.sin(a)).toFixed(2)}%`); }
    return `polygon(evenodd, ${pts.join(', ')})`;
  },
  wantsColor: true,
  uniforms: ['uB', 'uBot', 'uPres', 'uTouch', 'uFoot', 'uR1', 'uG', 'uPass', 'uDown', 'uAge'],
  theme: {
    accent: '#c4ad84', accent2: '#efe4cc', onAccent: '#1d150a', seed: 24,
    glowA: 'rgba(196,173,132,.11)', glowB: 'rgba(150,130,100,.08)',
    kicker: 'Experiment · Uproot the draft',
    draft: ['Clear the', 'ground?'], final: ['Clear the', 'ground.'],
    aside: 'tear it up.',
    sub: 'Start small in the middle of the first draft, and let it grow until nothing of it is left standing.',
    note: ['v0.4', 'too cluttered.', 'rip it up.'],
    chips: [['Drafts uprooted', '24'], ['Shipped', '12']],
  },
  home: () => ({ u: CX, v: CY, p0: 0, born: 0 }),
  // by DONE the hole has to pass the farthest corner, teeth, noise and all
  reach: (AR) => Math.hypot(AR * CX, Math.max(CY, 1 - CY)) + AMP + 0.025 + 0.007 + 0.04 - W0,
  fuel,

  // paper torn off the edge goes up the column; now and then a grain flies off it
  emit(ch, x, y, d, act) {
    if (d <= 0 || d > 0.03) return;
    const s = ch.s;
    if (s.touch > 0.2 && Math.random() < act * 0.5) scrap(ch, ch.draftColor(x, y), null, 1 + 1.6 * s.g);
    else if (Math.random() < act * 0.06) {
      const fx = CX * ch.W, fy = (1 - CY) * ch.H;
      grain(ch, x, y, (y - fy) * 0.5 + rand(-30, 30), -(x - fx) * 0.5 - rand(10, 50));
    }
  },

  onClick(ch, seed) { seed.off = -0.02; if (ch.sound?.ctx) playDevil(ch.sound, tuned('twister', TWISTER)); },
  burst(ch, x, y) {
    for (let i = 0; i < 5; i++) { const a = rand(0, 6.283), sp = rand(30, 90); puff(ch, x, y, Math.cos(a) * sp, Math.sin(a) * sp * 0.4, rand(10, 22)); }
    for (let i = 0; i < 24; i++) { const a = rand(0, 6.283), sp = rand(80, 220); grain(ch, x, y, -Math.sin(a) * sp, Math.cos(a) * sp * 0.5 - 60); }
  },
  reset(ch) { hush(ch); ch.s = { snd: ch.s.snd }; },
  quiet: hush,

  onFrame(ch, now, dt) {
    const s = phase(ch);
    const fx = CX * ch.W, fy = (1 - CY) * ch.H;
    // touchdown, once per pass: a thud, a ring of dust and a spray of sand
    if (ch.pPrev < P0 && ch.p >= P0 && !s.down) {
      s.down = now;
      for (let i = 0; i < 16; i++) { const a = rand(0, 6.283), sp = rand(60, 220); puff(ch, fx, fy, Math.cos(a) * sp, Math.sin(a) * sp * 0.35 - 20, rand(18, 40)); }
      for (let i = 0; i < (lite ? 50 : 110); i++) { const a = rand(-3.1, 0), sp = rand(120, 420); grain(ch, fx, fy, Math.cos(a) * sp, Math.sin(a) * sp); }
      if (ch.sound?.ctx) playTouchdown(ch.sound, tuned('twister', TWISTER));
    }
    if (ch.p < P0 - 0.01) s.down = 0;
    // the ground shakes harder the bigger it gets
    ch.quake = Math.max(ch.quake * 0.5, s.down ? Math.exp(-(now - s.down) / 300) * 0.8 : 0, s.touch * (0.08 + 0.4 * s.g));
    steer(ch);
    if (ch.mode !== 'gl') return;

    // while it's on the ground, paper keeps going up the column and the skirt keeps turning, more as it grows
    if (s.touch > 0.05) {
      const big = 1 + 1.6 * s.g;
      s.acc = (s.acc || 0) + dt * (lite ? 18 : 36) * s.touch * (0.6 + s.g);
      while (s.acc >= 1) {
        s.acc--;
        const a = rand(0, 6.283), rr = s.foot * ch.H;
        scrap(ch, ch.draftColor(fx + Math.cos(a) * rr, fy + Math.sin(a) * rr * 0.4), null, big);
      }
      s.acc2 = (s.acc2 || 0) + dt * (lite ? 40 : 90) * s.touch;
      while (s.acc2 >= 1) { s.acc2--; skirt(ch, null, s.foot); }
    }
    // each dust devil you started does the same, smaller, while it lasts
    for (let i = 1; i < ch.seeds.length; i++) {
      const sd = ch.seeds[i], ag = (now - sd.born) / 1000;
      if (!sd.born || ag > 1.8) continue;
      const dev = { bx: sd.u * ch.AR, by: sd.v };
      if (Math.random() < dt * 14) scrap(ch, ch.draftColor(sd.u * ch.W, (1 - sd.v) * ch.H), dev);
      if (Math.random() < dt * 30) skirt(ch, dev);
    }
  },

  setUniforms(ch, gl, loc, now) {
    const s = ch.s;
    s.age = s.age || new Float32Array(MAX_SEEDS);
    s.age.fill(99);
    ch.seeds.forEach((sd, i) => { if (i && sd.born) s.age[i] = (now - sd.born) / 1000; });
    gl.uniform2f(loc.uB, s.bx, s.by);
    gl.uniform1f(loc.uBot, s.bot);
    gl.uniform1f(loc.uPres, s.pres);
    gl.uniform1f(loc.uTouch, s.touch);
    gl.uniform1f(loc.uFoot, s.foot);
    gl.uniform1f(loc.uR1, s.r1);
    gl.uniform1f(loc.uG, s.g);
    gl.uniform1f(loc.uPass, s.pass);
    gl.uniform1f(loc.uDown, s.down ? (now - s.down) / 1000 : 99);
    gl.uniform1fv(loc.uAge, s.age);
  },

  step(ch, c, dt, now) {
    const P = ch.parts, S = ch.s, AR = ch.AR, W = ch.W, H = ch.H;
    const Hmain = 1.15 - CY;
    for (let i = P.length - 1; i >= 0; i--) {
      const s = P[i];
      s.age += dt;
      if (s.age >= s.life) { P.splice(i, 1); continue; }
      const h = 1 - s.age / s.life;
      if (s.k === 0) {                                   // a scrap of paper, spiralling up the column
        const dev = s.dev, bx = dev ? dev.bx : S.bx, by = dev ? dev.by : S.by;
        const Hc = dev ? 0.17 : Hmain, top = dev ? 0.17 : 1.2 - by;
        if (!dev && S.touch < 0.05) s.life = Math.min(s.life, s.age + 0.3);      // the funnel's gone: let go
        s.vh += (dev ? 0.12 : 0.3) * dt; s.hy += s.vh * dt;
        if (s.hy > top) { P.splice(i, 1); continue; }
        const [x0, R] = dev ? column(now, bx, s.hy, Hc, 0.008, 0.05, -0.03) : column(now, bx, s.hy, Hc, S.foot, S.r1, LEAN);
        s.phi += dt * Math.min(10, 1.6 + 0.1 / R); s.rot += s.vr * dt;
        const z = Math.cos(s.phi), x = ((x0 + R * Math.sin(s.phi)) / AR) * W, y = (1 - (by + s.hy)) * H, sc = 0.65 + 0.35 * (z * 0.5 + 0.5);
        c.save();
        c.globalAlpha = Math.min(1, h * 3, s.age * 6) * (0.35 + 0.65 * (z * 0.5 + 0.5));
        c.translate(x, y); c.rotate(s.rot); c.scale(sc, sc * Math.cos(s.rot * 1.7));
        c.fillStyle = s.col; c.fillRect(-s.w / 2, -s.h / 2, s.w, s.h);
        c.restore();
      } else if (s.k === 1) {                            // a grain in the dust skirt, whirling round the foot
        const dev = s.dev, bx = dev ? dev.bx : S.bx, by = dev ? dev.by : S.by;
        s.ang += s.wv * dt; s.rad += 0.02 * dt; s.rise += (dev ? 0.03 : 0.06) * dt;
        const x = ((bx + Math.cos(s.ang) * s.rad) / AR) * W, y = (1 - (by + s.rise + Math.sin(s.ang) * s.rad * 0.3)) * H;
        c.globalAlpha = Math.min(1, h * 2.5) * (0.5 + 0.5 * Math.max(0, -Math.sin(s.ang)));
        c.fillStyle = s.col; c.fillRect(x - s.z / 2, y - s.z / 2, s.z, s.z);
      } else if (s.k === 2) {                            // a dust cloud, spreading and settling
        s.vx *= 1 - dt * 2; s.vy = s.vy * (1 - dt * 2) + 10 * dt; s.r += s.gr * dt;
        s.x += s.vx * dt; s.y += s.vy * dt;
        c.globalAlpha = 1;
        const g = c.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
        g.addColorStop(0, `rgba(190,165,125,${(h * 0.32).toFixed(3)})`); g.addColorStop(1, 'rgba(190,165,125,0)');
        c.fillStyle = g; c.beginPath(); c.arc(s.x, s.y, s.r, 0, 6.283); c.fill();
      } else {                                           // a grain in flight, falling
        s.vy += 700 * dt; s.vx *= 1 - dt * 0.8;
        s.x += s.vx * dt; s.y += s.vy * dt;
        c.globalAlpha = Math.min(1, h * 2.5);
        c.fillStyle = s.col; c.fillRect(s.x - s.z / 2, s.y - s.z / 2, s.z, s.z * 1.5);
      }
    }
    c.globalAlpha = 1;
  },

  fs: `
const float CX = ${CX.toFixed(3)}, CY = ${CY.toFixed(3)}, P0 = ${P0.toFixed(3)}, W0 = ${W0.toFixed(4)}, G1 = ${G1.toFixed(3)}, GS = ${GS.toFixed(4)}, LEAN = ${LEAN.toFixed(3)};
const float ARMS = ${ARMS.toFixed(1)}, TW = ${TW.toFixed(1)}, AMP = ${AMP.toFixed(3)}, SPIN = ${SPIN.toFixed(2)}, KH = ${KH.toFixed(5)};
const vec3 SAND = vec3(.78, .66, .48);
uniform vec2 uB;
uniform float uBot, uPres, uTouch, uFoot, uR1, uG, uPass, uDown;
uniform float uAge[${MAX_SEEDS}];

vec2 rot(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }

// a column of turning sand standing on B: visible from bot to top above its foot, r0 wide at the foot and r1 at
// height H, leaning by lean per unit of height. sc scales its bands (bigger as it comes nearer).
// rgb is its colour, a how thick it is.
vec4 funnel(vec2 a, vec2 B, float bot, float top, float H, float r0, float r1, float lean, float spin, float sc) {
  float hy = a.y - B.y;
  if (hy < bot - .01 || hy > top) return vec4(0.);
  float k = clamp(hy / H, 0., 1.);
  float x0 = B.x + lean * hy + H * (.05 * sin(k * 5.5 - uT * 1.7) * smoothstep(0., .35, k) + .012 * sin(k * 17. + uT * 3.3));
  float R = max(r0 + (r1 - r0) * pow(k, 1.6) + H * .006 * sin(k * 30. - uT * 9.), .004);
  float u = (a.x - x0) / R;
  if (abs(u) > 1.25) return vec4(0.);
  float z = sqrt(max(0., 1. - u * u));
  float c = asin(clamp(u, -1., 1.)) / 3.1416 + uT * spin * (1.4 - k);   // round the column, turning, faster low down
  float n = fbm(vec2(c * 5. + hy * 6. / sc, hy * 22. / sc));
  float bands = smoothstep(.35, .75, n);
  float helix = pow(.5 + .5 * sin(c * 18.85 + hy * 40. / sc), 6.);
  float dens = smoothstep(1.2, .65, abs(u)) * smoothstep(bot, bot + .05 * H, hy) * smoothstep(top, top - .3 * H, hy) * (.68 + .3 * bands + .2 * helix);
  float shade = clamp(.55 - .35 * u + .25 * z, 0., 1.);
  vec3 col = mix(vec3(.3, .23, .15), vec3(.84, .72, .52), shade) * (.78 + .36 * n);
  col = mix(col, vec3(.96, .9, .76), helix * .22);
  return vec4(col, clamp(dens, 0., .94));
}

void main() {
  vec2 uv = vUv + uQuake * vec2(sin(uT * 71.), cos(uT * 83.)) * .0025;
  vec2 a = vec2(uv.x * uAr, uv.y);
  float gr = h(a / GS), nz = fbm(a * 5.);
  vec2 c0 = vec2(CX * uAr, CY), v0 = a - c0;
  float r0 = length(v0);

  // the front: the hole its foot tears, widening from the middle out, its edge torn into turning teeth
  float on = smoothstep(P0, P0 + .02, uP);
  float tooth = r0 < 1e-4 ? 0. : cos(ARMS * atan(v0.y, v0.x) + TW * r0 - uT * SPIN);
  float d = (uP - P0) * uK * KH + W0 * on - r0 + (AMP * tooth * min(1., r0 / .08) + (nz - .5) * .05 + (fbm(a * 24. + vec2(3., 0.)) - .5) * .014) * on;
  for (int i = 1; i < ${MAX_SEEDS}; i++) {
    if (i >= uN) break;
    vec4 s = uSeeds[i];
    float g = max(uP - s.z, 0.) * G1 + s.w;
    d = max(d, g - distance(a, s.xy) + (nz - .5) * .04 * smoothstep(0., .02, g));
  }

  // ahead: the paper is dragged round towards the foot, flutters at the torn edge, and swirls under your hand
  vec2 vb = a - uB;
  float db = length(vb), pull = uTouch * exp(-max(db - uFoot, 0.) / ((.085 + .12 * uG) * min(1., uAr * 1.3)));
  vec2 p = uB + rot(vb, -pull * .8) * (1. + .1 * pull);
  vec2 fj = vec2(fbm(a * 30. + uT * 5.), fbm(a * 30. + 7. - uT * 5.)) - .5;
  p += fj * .012 * exp(min(d, 0.) / .025) * step(d, 0.);
  vec2 pv = p - uPtr;
  p = uPtr + rot(pv, -uPtrOn * .7 * exp(-dot(pv, pv) / .01));
  vec3 dr = texture(uDraft, vec2(p.x / uAr, p.y)).rgb;
  dr = mix(dr, dr * vec3(.95, .88, .76), exp(min(d, 0.) / .06) * step(d, 0.) * .45);    // dusted ahead of the edge
  dr = mix(dr, vec3(.98, .96, .91), smoothstep(-.012, -.002, d) * step(d, 0.) * .55);   // a torn, lifted lip

  // behind: the finished design, in shadow under the torn edge, dusted with sand near it
  float back = max(d, 0.);
  vec3 fin = texture(uFinal, uv).rgb;
  fin *= 1. - .45 * exp(-back / .02);
  fin = mix(fin, SAND * .5, exp(-back / .03) * .22);
  fin = mix(fin, SAND * (.6 + .4 * h(a / GS + 3.)), step(.93, gr) * exp(-back / .03) * .45);

  vec3 col = d < 0. ? dr : fin;

  // the storm: the light goes grey, a dust cloud hangs off the top of the page, and a shadow lies round the foot
  col *= mix(vec3(1.), vec3(.84, .81, .76), uPres * (.7 + .3 * uG));
  col *= 1. - .3 * uTouch * exp(-max(db - uFoot, 0.) / .1);
  float cloud = uPres * smoothstep(.76 - .2 * uG, 1.02, a.y + (fbm(vec2(a.x * 3. - uT * .3, a.y * 4.)) - .5) * .16);
  col = mix(col, vec3(.5, .42, .32) * (.8 + .3 * fbm(vec2(a.x * 6. + uT * .5, a.y * 9.))), cloud * .8);

  // the dust skirt, turning round the foot and widening with it
  float sw = uFoot * 1.6 + .06;
  vec2 sk = vec2(vb.x / sw, (vb.y - .012) / (sw * .38));
  float er = length(sk);
  float sn = fbm(rot(sk, uT * 3.) * 1.8 + vec2(er * 2., 0.));
  col = mix(col, vec3(.74, .62, .45) * (.85 + .3 * sn), uTouch * smoothstep(1.15, .3, er) * (.35 + .55 * sn) * (1. - .4 * uG));

  // the funnel: thicker, bigger-banded and a little thinner to see through as it comes near, then it blows through
  float sc = 1. + 2.5 * uG;
  vec4 F = funnel(a, uB, uBot, 1.25 - uB.y, 1.15 - uB.y, uFoot, uR1, LEAN, 1.1, sc);
  col = mix(col, F.rgb, F.a * uPres * (1. - .45 * uG));
  col = mix(col, vec3(.95, .88, .72), step(.994, h(a * 520. + floor(uT * 20.))) * F.a * uPres);   // grains glinting in it
  // as it passes over, a blast of dust that thins away
  float blast = sin(3.1416 * uPass);
  col = mix(col, vec3(.72, .62, .47) * (.8 + .35 * fbm(vec2(a.x * 4. - uT * 2., a.y * 6. + uT))), blast * .75);

  // the touchdown: a ring of dust running out along the ground
  if (uDown < 2.) {
    float R = uDown * .5, ring = exp(-pow((length(vec2(vb.x, vb.y * 2.5)) - R) / (.03 + uDown * .06), 2.)) * exp(-uDown * 2.);
    col = mix(col, SAND, ring * .6 * smoothstep(.3, .7, fbm(a * 8.)));
  }

  // the dust devils you started: they spin up, tear their patch, and die away
  for (int i = 1; i < ${MAX_SEEDS}; i++) {
    if (i >= uN) break;
    float ag = uAge[i], live = smoothstep(0., .25, ag) * (1. - smoothstep(1.4, 2.2, ag));
    if (live < .001) continue;
    vec2 sb = uSeeds[i].xy;
    vec4 m = funnel(a, sb, 0., .17, .17, .008, .05, -.03, 2., 1.);
    vec2 sv = a - sb;
    float se = length(vec2(sv.x / .05, (sv.y - .006) / .02));
    col = mix(col, vec3(.74, .62, .45), live * smoothstep(1.1, .3, se) * .6);
    col = mix(col, m.rgb, m.a * live * .9);
  }
  o = vec4(clamp(col, 0., 1.), 1.);
}`,
};

export default twister;
