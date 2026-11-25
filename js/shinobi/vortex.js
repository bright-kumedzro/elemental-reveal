/* Sand Vortex: a sandstorm grinds the draft away from the outside in, then packs itself into a ball and bursts.
   Stir: sand drifts in from the corners and grains lift off the pencil strokes. Erosion: a storm swirls round the
   page and wears the sketch away grain by grain along spiral arms, darkest strokes first. Ahead of it the paper
   gathers sand and its lines go grainy; behind it the finished design shows through the swirling haze. Climax:
   the storm closes into a ball of sand in the middle, which bursts. The sand rains off the page and the air clears.
   Move over the paper and the sand eddies round your hand. Click to stir up a whirl that wears its own hole. */
import { fbm, hh, ign, clamp, rand, lite, MAX_SEEDS } from '../core.js';
import { env, noiseSource } from '../sound.js';

const CY = 0.5;              // the eye of the storm (page fraction; y is up), centred across
const GS = 0.0035;           // one grain, in page heights
const P0 = 0.05, P1 = 0.72;  // the erosion runs between these
const ARMS = 3, TWIST = 7, AMP = 0.05;
const BALL0 = 0.62, BALL1 = 0.78, BURST = 0.8;
const SAND = ['#c9a06a', '#dcb680', '#b8895a', '#e8cc98', '#a77a4b'];

const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const rOf = (AR) => Math.hypot(AR * 0.5, 0.5) + 0.12;        // erosion starts just beyond the corners
const ballOf = (AR) => 0.13 * Math.min(1, AR * 1.6);

/* Everything the shader and the particles share for this frame. */
function phase(ch, now) {
  const s = ch.s, R = rOf(ch.AR);
  s.cx = 0.5 * ch.AR;
  s.Re = R - clamp((ch.p - P0) / (P1 - P0), 0, 1) * (R + 0.13);
  s.ph = -10 * ch.p;
  const age = s.burst ? (now - s.burst) / 1000 : 0;
  s.storm = ss(0.01, 0.12, ch.p) * (1 - ss(0.8, 0.9, ch.p)) * (s.burst ? Math.exp(-age * 2.2) : 1);
  s.ball = s.burst ? 0 : ballOf(ch.AR) * ss(BALL0, BALL1, ch.p) * (1 - ss(BURST, BURST + 0.015, ch.p));
  return s;
}

function lumAt(ch, x, y) {
  const lo = ch.low;
  if (!lo) return 1;
  const i = clamp(Math.floor((x / ch.W) * lo.w), 0, lo.w - 1), j = clamp(Math.floor((y / ch.H) * lo.h), 0, lo.h - 1), k = (j * lo.w + i) * 4;
  return (lo.data[k] * 0.3 + lo.data[k + 1] * 0.59 + lo.data[k + 2] * 0.11) / 255;
}
const sandCol = () => SAND[(Math.random() * SAND.length) | 0];
function grain(ch, x, y, vx, vy, col) {
  ch.spawn({ k: 0, x, y, vx, vy, age: 0, life: rand(0.8, 1.8), z: rand(1.1, 2.6), col: col || sandCol() });
}

/* ---------- sound ---------- */
/* The storm: a low roar that gusts, and a dry hiss of grains on top that gets louder as you scroll harder. */
function storm(ch) {
  if (ch.s.snd) return ch.s.snd;
  const A = ch.sound, c = A.ctx, t = c.currentTime;
  const bus = c.createGain(); bus.gain.value = 0; bus.connect(A.out);
  const n = noiseSource(A, true), lp = c.createBiquadFilter(), rg = c.createGain();
  lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 0.7; rg.gain.value = 0.7;
  n.connect(lp).connect(rg).connect(bus);
  const gust = c.createOscillator(), gd = c.createGain();
  gust.frequency.value = 0.35; gd.gain.value = 0.35;
  gust.connect(gd).connect(rg.gain);
  const n2 = noiseSource(A, true), bp = c.createBiquadFilter(), hg = c.createGain();
  bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 0.8; hg.gain.value = 0;
  n2.connect(bp).connect(hg).connect(bus);
  n.start(t, Math.random()); n2.start(t, Math.random()); gust.start(t);
  return (ch.s.snd = { c, bus, lp, hg, bp });
}
function steerStorm(ch) {
  const A = ch.sound;
  if (!A?.ctx || ch.mode !== 'gl') return;
  const S = storm(ch), t = S.c.currentTime, s = ch.s;
  const level = Math.max(s.storm, (s.ball / ballOf(ch.AR)) * 0.8);
  S.bus.gain.setTargetAtTime(level * 0.75, t, 0.12);
  S.lp.frequency.setTargetAtTime(380 + 500 * s.storm + 600 * (s.ball / ballOf(ch.AR)), t, 0.2);
  S.hg.gain.setTargetAtTime(0.12 + Math.min(0.5, ch.speed * 4), t, 0.1);
}
function hushStorm(ch) { const S = ch.s.snd; if (S) S.bus.gain.setTargetAtTime(0, S.c.currentTime, 0.06); }
/* The burst: a heavy whump, then a long hiss of sand raining down. */
function burstSound(ch) {
  const A = ch.sound, c = A?.ctx;
  if (!c) return;
  const t = c.currentTime;
  const o = c.createOscillator(), og = c.createGain();
  o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(32, t + 0.5);
  env(og, t, 0.9, 0.006, 0.6);
  o.connect(og).connect(A.out); o.start(t); o.stop(t + 0.7);
  const n = noiseSource(A), lp = c.createBiquadFilter(), g = c.createGain();
  lp.type = 'lowpass'; lp.frequency.setValueAtTime(1400, t); lp.frequency.exponentialRampToValueAtTime(200, t + 0.6);
  env(g, t, 0.8, 0.005, 0.7);
  n.connect(lp).connect(g).connect(A.out); n.start(t, Math.random()); n.stop(t + 0.8);
  const r = noiseSource(A), bp = c.createBiquadFilter(), rg = c.createGain();
  bp.type = 'bandpass'; bp.Q.value = 0.6; bp.frequency.setValueAtTime(4200, t); bp.frequency.exponentialRampToValueAtTime(1800, t + 2);
  rg.gain.setValueAtTime(0.0001, t); rg.gain.exponentialRampToValueAtTime(0.32, t + 0.15); rg.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
  r.connect(bp).connect(rg).connect(A.out); r.start(t, Math.random()); r.stop(t + 2.3);
}
/* A click's whirl: a short gust that swells and dies. */
function whirlSound(ch) {
  const A = ch.sound, c = A?.ctx;
  if (!c) return;
  const t = c.currentTime, n = noiseSource(A), bp = c.createBiquadFilter(), g = c.createGain();
  bp.type = 'bandpass'; bp.Q.value = 1.4; bp.frequency.setValueAtTime(700, t); bp.frequency.exponentialRampToValueAtTime(2600, t + 0.35); bp.frequency.exponentialRampToValueAtTime(900, t + 1.1);
  env(g, t, 0.45, 0.25, 0.9);
  n.connect(bp).connect(g).connect(A.out); n.start(t, Math.random()); n.stop(t + 1.25);
}

const sand = {
  id: 'vortex',
  num: '02',
  label: 'Sand Vortex',
  hud: 'Draft eroded',
  hint: 'Scroll to raise the storm',
  clickHint: 'the paper to stir up a whirl',
  clip: (k) => `circle(${((100 - Number(k)) * 0.75).toFixed(2)}% at 50% 50%)`,
  wantsColor: true,
  uniforms: ['uRe', 'uPh', 'uC', 'uStorm', 'uBall', 'uBurst', 'uAge'],
  theme: {
    accent: '#e6b35c', accent2: '#f6e2b3', onAccent: '#2a1a04', seed: 33,
    glowA: 'rgba(230,179,92,.11)', glowB: 'rgba(200,150,90,.08)',
    kicker: 'Experiment · Weather the draft',
    draft: ['Let it', 'settle?'], final: ['Let it', 'settle.'],
    aside: 'stir it up.',
    sub: 'Every rough draft is sand. Stir it up, let the storm pass, and keep what holds its shape.',
    note: ['v0.7', 'too loose.', 'grind it down.'],
    chips: [['Drafts weathered', '18'], ['Shipped', '12']],
  },
  home: () => ({ u: 0.5, v: CY, p0: 0, born: 0 }),
  reach: (AR) => rOf(AR) + 0.13,

  fuel(ch, u, v, now) {
    const s = ch.s.Re === undefined ? phase(ch, now) : ch.s;
    const ax = u * ch.AR, ay = v, dx = ax - s.cx, dy = ay - CY, r = Math.hypot(dx, dy);
    let d = r - s.Re + AMP * Math.cos(ARMS * Math.atan2(dy, dx) + TWIST * r + s.ph) * Math.min(1, r / 0.1)
      + (fbm(ax * 4, ay * 4) - 0.5) * 0.06 + (hh(Math.floor(ax / GS), Math.floor(ay / GS)) - 0.5) * 0.05;
    for (let i = 1; i < ch.seeds.length; i++) {
      const sd = ch.seeds[i], ri = Math.hypot(ax - sd.u * ch.AR, ay - sd.v);
      d = Math.max(d, Math.max(ch.p - sd.p0, 0) * ch.K * 0.35 + ign(sd, now) + (sd.off || 0) - ri + (hh(Math.floor(ax / GS), Math.floor(ay / GS)) - 0.5) * 0.05);
    }
    return d;
  },

  // grains torn off the front are swept round the storm; early on, grains lift off the darkest strokes
  emit(ch, x, y, d, act) {
    const cx = 0.5 * ch.W, cy = (1 - CY) * ch.H, dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy) || 1;
    const tx = dy / r, ty = -dx / r;
    if (d > 0 && d < 0.03) {
      if (Math.random() < act * 0.7) { const sp = rand(140, 320); grain(ch, x, y, tx * sp - (dx / r) * 30, ty * sp - (dy / r) * 30, Math.random() < 0.4 ? ch.draftColor(x, y) : null); }
    } else if (d < 0 && ch.p < 0.3 && Math.random() < 0.35 * ss(0.005, 0.08, ch.p) && lumAt(ch, x, y) < 0.55) {
      grain(ch, x, y, tx * rand(20, 60), rand(-50, -15), ch.draftColor(x, y));
    }
  },

  onClick(ch, seed) { seed.off = -0.02; whirlSound(ch); },
  burst(ch, x, y) {
    for (let i = 0; i < 26; i++) { const a = rand(0, 6.283), sp = rand(60, 200); grain(ch, x, y, -Math.sin(a) * sp, Math.cos(a) * sp); }
  },
  reset(ch) { hushStorm(ch); ch.s = { snd: ch.s.snd }; },
  quiet: hushStorm,

  onFrame(ch, now, dt) {
    const s = phase(ch, now);
    // the ball bursts once per pass: the sand flies out and rains off the page, and the ground shakes
    if (ch.pPrev < BURST && ch.p >= BURST && !s.burst) {
      s.burst = now; phase(ch, now);
      const cx = 0.5 * ch.W, cy = (1 - CY) * ch.H, R = ballOf(ch.AR) * ch.H;
      for (let i = 0; i < (lite ? 140 : 300); i++) {
        const a = rand(0, 6.283), k = Math.sqrt(Math.random()), sp = rand(150, 750) * (0.4 + k);
        ch.spawn({ k: 1, x: cx + Math.cos(a) * R * k, y: cy + Math.sin(a) * R * k, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - rand(80, 260), age: 0, life: rand(1.4, 2.6), z: rand(1.2, 3), col: sandCol() });
      }
      for (let i = 0; i < 16; i++) { const a = rand(0, 6.283), sp = rand(60, 200); ch.spawn({ k: 2, x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, age: 0, life: rand(1.2, 2), r: rand(20, 40), gr: rand(30, 70) }); }
      burstSound(ch);
    }
    if (ch.p < BURST - 0.01) s.burst = 0;
    ch.quake = Math.max(ch.quake * 0.4, s.burst ? Math.exp(-(now - s.burst) / 300) * 0.9 : 0, (s.ball / ballOf(ch.AR)) * 0.15);

    // while the ball packs together, sand streams into it from all round
    if (s.ball > 0.002 && s.ball < ballOf(ch.AR) * 0.999 && ch.mode === 'gl') {
      s.acc = (s.acc || 0) + dt * (lite ? 50 : 110);
      const cx = 0.5 * ch.W, cy = (1 - CY) * ch.H;
      while (s.acc >= 1) {
        s.acc--;
        const a = rand(0, 6.283), r = ch.H * rand(0.3, 0.55), x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        grain(ch, x, y, Math.sin(a) * 260 - Math.cos(a) * 120, -Math.cos(a) * 260 - Math.sin(a) * 120);
      }
    }
    steerStorm(ch);
  },

  setUniforms(ch, gl, loc, now) {
    const s = ch.s;
    s.age = s.age || new Float32Array(MAX_SEEDS);
    s.age.fill(99);
    ch.seeds.forEach((sd, i) => { if (i && sd.born) s.age[i] = (now - sd.born) / 1000; });
    gl.uniform1f(loc.uRe, s.Re);
    gl.uniform1f(loc.uPh, s.ph);
    gl.uniform2f(loc.uC, s.cx, CY);
    gl.uniform1f(loc.uStorm, s.storm);
    gl.uniform1f(loc.uBall, s.ball);
    gl.uniform1f(loc.uBurst, s.burst ? (now - s.burst) / 1000 : 99);
    gl.uniform1fv(loc.uAge, s.age);
  },

  step(ch, c, dt) {
    const P = ch.parts, cx = 0.5 * ch.W, cy = (1 - CY) * ch.H, br = ch.s.ball * ch.H;
    for (let i = P.length - 1; i >= 0; i--) {
      const s = P[i];
      s.age += dt;
      if (s.age >= s.life) { P.splice(i, 1); continue; }
      const h = 1 - s.age / s.life;
      if (s.k === 0) {                                   // a grain, swept round the storm and drawn in
        const dx = s.x - cx, dy = s.y - cy, r = Math.hypot(dx, dy) || 1;
        s.vx += ((dy / r) * 240 - (dx / r) * 70) * dt; s.vy += ((-dx / r) * 240 - (dy / r) * 70) * dt;
        s.vx *= 1 - dt * 1.3; s.vy *= 1 - dt * 1.3;
        s.x += s.vx * dt; s.y += s.vy * dt;
        if (br > 2 && r < br * 0.95) { P.splice(i, 1); continue; }
        c.globalAlpha = Math.min(1, h * 3);
        c.fillStyle = s.col; c.fillRect(s.x - s.z / 2, s.y - s.z / 2, s.z, s.z);
      } else if (s.k === 1) {                            // a grain from the burst, falling
        s.vy += 900 * dt; s.vx *= 1 - dt * 0.6;
        s.x += s.vx * dt; s.y += s.vy * dt;
        c.globalAlpha = Math.min(1, h * 2.5);
        c.fillStyle = s.col; c.fillRect(s.x - s.z / 2, s.y - s.z / 2, s.z, s.z * 1.6);
      } else {                                           // a dust cloud, spreading and settling
        s.vx *= 1 - dt * 2; s.vy = s.vy * (1 - dt * 2) + 20 * dt; s.r += s.gr * dt;
        s.x += s.vx * dt; s.y += s.vy * dt;
        c.globalAlpha = 1;
        const g = c.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
        g.addColorStop(0, `rgba(205,170,120,${(h * 0.3).toFixed(3)})`); g.addColorStop(1, 'rgba(205,170,120,0)');
        c.fillStyle = g; c.beginPath(); c.arc(s.x, s.y, s.r, 0, 6.283); c.fill();
      }
    }
    c.globalAlpha = 1;
  },

  fs: `
const float GS = ${GS.toFixed(4)}, AMP = ${AMP.toFixed(3)}, ARMS = ${ARMS.toFixed(1)}, TWIST = ${TWIST.toFixed(1)};
const vec3 SAND = vec3(.85, .69, .46);
uniform float uRe, uPh, uStorm, uBall, uBurst;
uniform vec2 uC;
uniform float uAge[${MAX_SEEDS}];

vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }

// the storm's streaks: noise laid out round the eye, stretched along the wind, turning at speed w.
// Angle wraps at 2π, so the last stretch blends into the first and there's no seam.
float streak(vec2 v, float r, float w, float rf, float o) {
  float tp = mod(atan(v.y, v.x) - uT * w + o, 6.2832);
  float n = fbm(vec2(tp * 1.3, r * rf));
  if (tp > 5.) n = mix(n, fbm(vec2((tp - 6.2832) * 1.3, r * rf)), smoothstep(5., 6.2832, tp));
  return n;
}

void main() {
  vec2 uv = vUv + uQuake * vec2(sin(uT * 77.), cos(uT * 91.)) * .0025;
  vec2 a = vec2(uv.x * uAr, uv.y);
  vec2 v = a - uC;
  float r = length(v);
  vec2 tang = r > 1e-4 ? vec2(-v.y, v.x) / r : vec2(0.);
  float gr = h(a / GS);

  // the front: a shrinking circle with spiral arms, ragged at the grain; dark strokes go a little early
  vec3 dr0 = texture(uDraft, uv).rgb;
  float lum = dot(dr0, vec3(.3, .59, .11));
  float d = r - uRe + AMP * cos(ARMS * atan(v.y, v.x) + TWIST * r + uPh) * min(1., r / .1)
    + (fbm(a * 4.) - .5) * .06 + (gr - .5) * .05;
  d += (1. - smoothstep(.25, .75, lum)) * .035;
  for (int i = 1; i < ${MAX_SEEDS}; i++) {
    if (i >= uN) break;
    vec4 s = uSeeds[i];
    d = max(d, max(uP - s.z, 0.) * uK * .35 + s.w - distance(a, s.xy) + (gr - .5) * .05);
  }

  // the paper: sand settles on it ahead of the storm, its lines go grainy, and right at the front the grains
  // lift and slide away with the wind
  float sandy = smoothstep(-.13, 0., d);
  vec2 gj = vec2(h(a / GS + 17.), h(a / GS + 41.)) - .5;
  vec2 lift = tang * .025 * smoothstep(-.035, 0., d) * (.5 + gr);
  vec3 dr = texture(uDraft, uv + (gj * .006 * sandy + lift) * vec2(1. / uAr, 1.)).rgb;
  vec3 sc = SAND * mix(.62, 1., h(a / GS + 5.));
  dr = mix(dr, dr * vec3(.97, .88, .72), sandy * .45);
  dr = mix(dr, sc, step(1. - sandy * .6, gr) * .85);

  vec3 col = d < 0. ? dr : texture(uFinal, uv).rgb;
  // grains in flight just behind the front, glinting
  col = mix(col, sc, step(0., d) * smoothstep(.03, 0., d) * step(.55, h(a / GS + floor(uT * 14.))) * .8);

  // the storm: two layers of streaks turning at different speeds, thick against the wall it's eating
  if (uStorm > .001) {
    float n = .6 * streak(v, r, 1.1, 26., 0.) + .4 * streak(v, r, 2.1, 13., 2.);
    float wall = exp(-max(d, 0.) / .1);
    float dens = smoothstep(.38, .72, n) * (.12 + .88 * wall) * smoothstep(-.03, .01, d);
    vec2 pv = a - uPtr;
    dens += uPtrOn * .5 * exp(-dot(pv, pv) / .012) * smoothstep(.35, .7, streak(pv, length(pv), 3., 40., 1.));
    for (int i = 1; i < ${MAX_SEEDS}; i++) {
      if (i >= uN) break;
      vec2 sv = a - uSeeds[i].xy;
      float sr = length(sv), live = 1. - smoothstep(1., 2.6, uAge[i]);
      dens += live * exp(-pow((sr - .06) / .04, 2.)) * smoothstep(.35, .7, streak(sv, sr, 4., 50., 3.));
    }
    dens *= uStorm;
    vec3 stc = mix(vec3(.66, .5, .31), vec3(.98, .87, .66), smoothstep(.45, .85, n));
    col = mix(col, stc, clamp(dens, 0., .88));
    col += vec3(1., .9, .7) * step(.992, h(a * 700. + floor(uT * 24.))) * clamp(dens, 0., 1.) * .5;
  }

  // the ball: packed sand, lit from the top left, turning, with a ragged rim and a shadow round it
  if (uBall > .001) {
    float rr = r / uBall;
    if (rr < 1.4) {
      vec3 N = vec3(v / uBall, sqrt(max(0., 1. - rr * rr)));
      vec3 P = rotY(N, uT * 1.6);
      float sn = fbm(P.xy * 5. + P.z * 3.);
      float diff = max(dot(N, normalize(vec3(-.5, .6, .65))), 0.);
      vec3 bc = mix(vec3(.5, .36, .21), vec3(.93, .79, .55), sn) * (.35 + .8 * diff);
      bc *= .85 + .3 * step(.5, h(a / GS + 9.));
      float inside = smoothstep(1., .96, rr + (sn - .5) * .12);
      col *= 1. - .45 * smoothstep(1.35, 1., rr) * (1. - inside);
      col = mix(col, bc, inside);
    }
  }

  // the burst: a ring of dust running out from where the ball was
  if (uBurst < 2.5) {
    float R = uBurst * 1.3, w = .05 + uBurst * .12;
    float ring = exp(-pow((r - R) / w, 2.)) * exp(-uBurst * 1.6) * smoothstep(.3, .7, fbm(a * 9.));
    col = mix(col, SAND, ring * .7);
  }
  o = vec4(col, 1.);
}`,
};

export default sand;
