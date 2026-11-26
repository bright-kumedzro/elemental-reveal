/* Ink Draw: a pen draws the finished design onto the paper, then colour washes in.
   As you scroll, a pen works its way across the page from the top left. Wherever it has been, the finished design's
   outlines appear as ink lines (its edges, found in the shader), piece by piece like separate strokes, wet and
   glossy blue where they're fresh, drying to a dark blue-black. Under the ink the pencil sketch fades away. A little
   behind the pen, the finished design's colour floods into the inked shapes like watercolour, in blooms with darker
   edges where the pigment pools and a grainy texture, until the finished design is all that's left.
   Move over the paper and a little ink follows your hand. Click and the pen dabs: a splatter of ink and a burst of
   quick strokes, and the drawing starts there too. */
import { vn, fbm, ign, clamp, rand, lite, fine, DONE, MAX_SEEDS } from '../core.js';
import { makeDraw, playDab, tunedDraw } from './sfx-draw.js';

// the pen sweeps from the top left (aspect units, y up) towards the bottom right
const DX = 0.82, DY = -0.57;          // the direction it works in
const NX = 0.57, NY = 0.82;           // across its front
const START = 0.2;                    // nothing drawn until a little scroll
const FULL = 0.62;                    // how far behind the pen the finished design is complete
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/* The drawing order: how far along the pen's way a point is. A wobbly sweep (so the front is hand-drawn), plus
   finer noise so neighbouring bits of line come in at slightly different moments, like separate strokes. Mirrors
   order() in the shader. */
const order = (ax, ay) => ax * DX + (ay - 1) * DY + (fbm(ax * 2.3, ay * 2.3) - 0.5) * 0.3 + (vn(ax * 6, ay * 6) - 0.5) * 0.08 + START;
const maxOrder = (AR) => AR * DX - DY + 0.15 + 0.04 + START;

function fuel(ch, u, v, now) {
  const ax = u * ch.AR, ay = v;
  let d = ch.p * ch.K - order(ax, ay);
  for (let i = 1; i < ch.seeds.length; i++) {
    const s = ch.seeds[i], g = Math.max(ch.p - s.p0, 0) * ch.K * 0.5 + ign(s, now) * 2 + (s.off || 0);
    d = Math.max(d, g - Math.hypot(ax - s.u * ch.AR, ay - s.v) + (vn(ax * 9, ay * 9) - 0.5) * 0.04);
  }
  return d;
}

/* Where the pen is: it works back and forth across its front, like someone inking a drawing. Returns stage pixels,
   or null when the front isn't on the page. */
function penAt(ch, now) {
  const target = ch.p * ch.K, AR = ch.AR;
  // the stretch of the front that's on the page, found by walking across it
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const c = -1.6 + (i / 24) * 3.2;
    let s = target - START;
    for (let k = 0; k < 4; k++) {   // slide along the pen's direction until the order matches (it's nearly 1:1)
      const ax = s * DX + c * NX, ay = 1 + s * DY + c * NY;
      s += target - order(ax, ay);
    }
    const ax = s * DX + c * NX, ay = 1 + s * DY + c * NY;
    if (ax >= 0 && ax <= AR && ay >= 0 && ay <= 1) pts.push([ax, ay]);
  }
  if (pts.length < 2) return null;
  const k = 0.5 + 0.5 * Math.sin(now * 0.0021) * Math.cos(now * 0.0007 + 1.3);   // sweeping, with a wander
  const f = k * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), r = f - i;
  const ax = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * r, ay = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * r;
  return [(ax / AR) * ch.W, (1 - ay) * ch.H];
}

/* ---------- particles ---------- */
const INK = [24, 34, 78];
function drop(ch, x, y, vx, vy, r) { ch.spawn({ k: 0, x, y, vx, vy, r, age: 0, life: rand(1.6, 2.8), landed: false, fly: rand(0.08, 0.22) }); }
function dot(ch, x, y, r) { ch.spawn({ k: 1, x, y, r, age: 0, life: rand(0.9, 1.6) }); }
function stroke(ch, x, y, a, len) {
  const bend = rand(-0.9, 0.9);
  ch.spawn({ k: 2, x, y, a, len, bend, w: rand(1.2, 2.6), age: 0, life: rand(1.2, 2) });
}

/* ---------- sound ---------- */
function steer(ch, now, drawing) {
  const A = ch.sound;
  if (!A?.ctx || ch.mode !== 'gl') return;
  const X = (ch.s.snd = ch.s.snd || makeDraw(A));
  const washing = ss(0.16, 0.34, ch.p) * (1 - ss(0.8, DONE, ch.p));
  X.set(tunedDraw(), drawing ? 1 : 0, washing, Math.min(1, ch.speed * 6), 1);
}
function hush(ch) { ch.s.snd?.silence(); }

const draw = {
  id: 'draw',
  num: '03',
  label: 'Ink Draw',
  hud: 'Draft inked',
  hint: 'Scroll to ink the draft',
  clickHint: 'the paper to drop some ink',
  // no WebGL2: the draft is wiped away diagonally from the top left
  clip: (k) => {
    const t = (Number(k) * 2.1).toFixed(2);
    return `polygon(evenodd, 0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, 0% 0%, ${t}% 0%, 0% ${t}%, 0% 0%)`;
  },
  wantsColor: true,
  mips: true,
  uniforms: ['uAge'],
  theme: {
    accent: '#4a6cf7', accent2: '#dce3ff', onAccent: '#050b24', seed: 22,
    glowA: 'rgba(74,108,247,.12)', glowB: 'rgba(120,150,255,.07)',
    kicker: 'Experiment · Ink the draft',
    draft: ['Ink it', 'in?'], final: ['Ink it', 'in.'],
    aside: 'commit to it.',
    sub: 'Trace over the pencil, commit to the lines, then let the colour come.',
    note: ['v0.8', 'still pencil.', 'ink it.'],
    chips: [['Drafts inked', '22'], ['Shipped', '12']],
  },
  home: () => ({ u: 0, v: 1, p0: 0, born: 0, off: -10 }),   // only for clicks' growth rate; the pen has its own path
  reach: (AR) => maxOrder(AR) + FULL + 0.03,
  fuel,

  // tiny flecks of ink thrown off the drawing front
  emit(ch, x, y, d, act) {
    if (d > 0 && d < 0.02 && Math.random() < act * 0.04) dot(ch, x + rand(-3, 3), y + rand(-3, 3), rand(0.6, 1.4));
  },

  onClick(ch, seed) { seed.off = 0.01; if (ch.sound?.ctx) playDab(ch.sound, tunedDraw(), 1); },
  // the dab: ink splatter and a burst of quick strokes
  burst(ch, x, y) {
    for (let i = 0; i < (lite ? 10 : 18); i++) { const a = rand(0, 6.283), sp = rand(60, 260); drop(ch, x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(1.2, 4.2)); }
    for (let i = 0; i < 5; i++) stroke(ch, x, y, rand(0, 6.283), rand(24, 70));
    dot(ch, x, y, rand(6, 9));
  },
  reset(ch) { hush(ch); ch.s = { snd: ch.s.snd }; },
  quiet: hush,

  onFrame(ch, now, dt) {
    const s = ch.s;
    const pen = ch.p > 0.003 && ch.p < DONE ? penAt(ch, now) : null;
    s.pen = pen;
    steer(ch, now, !!pen || ch.seeds.some((sd) => sd.born && now - sd.born < 800));
    if (ch.mode !== 'gl') return;
    // wet ink left under the moving nib
    if (pen) {
      s.acc = (s.acc || 0) + dt * (lite ? 30 : 60);
      while (s.acc >= 1) { s.acc--; dot(ch, pen[0] + rand(-2, 2), pen[1] + rand(-2, 2), rand(0.8, 1.8)); }
    }
    // a little ink follows the hand
    if (fine && ch.ptr.on > 0.5) {
      const px = ch.ptr.u * ch.W, py = (1 - ch.ptr.v) * ch.H;
      if (s.lastPtr && Math.hypot(px - s.lastPtr[0], py - s.lastPtr[1]) > 6) dot(ch, px + rand(-2, 2), py + rand(-2, 2), rand(0.7, 1.6));
      s.lastPtr = [px, py];
    }
  },

  setUniforms(ch, gl, loc, now) {
    const s = ch.s;
    s.age = s.age || new Float32Array(MAX_SEEDS);
    s.age.fill(99);
    ch.seeds.forEach((sd, i) => { if (i && sd.born) s.age[i] = (now - sd.born) / 1000; });
    gl.uniform1fv(loc.uAge, s.age);
  },

  step(ch, c, dt) {
    const P = ch.parts;
    for (let i = P.length - 1; i >= 0; i--) {
      const q = P[i];
      q.age += dt;
      if (q.age >= q.life) { P.splice(i, 1); continue; }
      const h = 1 - q.age / q.life, wet = Math.max(0, 1 - q.age / 0.5);
      if (q.k === 0) {                                   // a drop of ink: flies, lands, spreads a little and dries
        if (q.age < q.fly) { q.x += q.vx * dt; q.y += q.vy * dt; } else if (!q.landed) { q.landed = true; q.r *= 1.35; }
        c.fillStyle = `rgba(${INK},${(0.85 * Math.min(1, h * 3)).toFixed(3)})`;
        c.beginPath(); c.arc(q.x, q.y, q.r, 0, 6.283); c.fill();
        if (wet > 0) { c.fillStyle = `rgba(150,175,255,${(0.35 * wet).toFixed(3)})`; c.beginPath(); c.arc(q.x - q.r * 0.3, q.y - q.r * 0.3, q.r * 0.35, 0, 6.283); c.fill(); }
      } else if (q.k === 1) {                            // a wet dot of ink, drying
        c.fillStyle = `rgba(${INK},${(0.8 * Math.min(1, h * 2.5)).toFixed(3)})`;
        c.beginPath(); c.arc(q.x, q.y, q.r, 0, 6.283); c.fill();
      } else {                                           // a quick stroke, drawn out over a fifth of a second
        const g = Math.min(1, q.age / 0.2), n = 10;
        c.strokeStyle = `rgba(${INK},${(0.9 * Math.min(1, h * 2.5)).toFixed(3)})`; c.lineWidth = q.w; c.lineCap = 'round';
        c.beginPath();
        for (let j = 0; j <= n * g; j++) {
          const t = j / n, a = q.a + q.bend * t;
          const x = q.x + Math.cos(q.a) * q.len * t + Math.cos(a + 1.57) * q.bend * 10 * t * t, y = q.y + Math.sin(q.a) * q.len * t + Math.sin(a + 1.57) * q.bend * 10 * t * t;
          if (j) c.lineTo(x, y); else c.moveTo(x, y);
        }
        c.stroke();
      }
    }
  },

  // the pen itself, drawn over everything at the drawing front
  overlay(ch, c) {
    const pen = ch.s.pen;
    if (!pen) return;
    const [x, y] = pen, L = Math.min(110, ch.H * 0.16);
    c.save();
    c.translate(x, y); c.rotate(-0.72);                  // held at an angle, pointing down and left
    // shadow on the paper
    c.fillStyle = 'rgba(30,25,20,.18)';
    c.beginPath(); c.ellipse(L * 0.55 + 6, 10, L * 0.55, 5, 0, 0, 6.283); c.fill();
    // barrel
    const g = c.createLinearGradient(0, -6, 0, 6);
    g.addColorStop(0, '#2a3566'); g.addColorStop(0.45, '#151b3a'); g.addColorStop(1, '#0a0d1f');
    c.fillStyle = g;
    c.beginPath(); c.roundRect(L * 0.28, -6, L, 12, 6); c.fill();
    c.fillStyle = '#c9a45c'; c.fillRect(L * 0.28 + 4, -6, 3, 12);   // a gold band
    // nib
    const ng = c.createLinearGradient(0, -5, 0, 5);
    ng.addColorStop(0, '#f2e1b0'); ng.addColorStop(0.5, '#c99d4d'); ng.addColorStop(1, '#8b6a2f');
    c.fillStyle = ng;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(L * 0.3, -5.5); c.lineTo(L * 0.3, 5.5); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(60,40,10,.6)'; c.lineWidth = 0.8;
    c.beginPath(); c.moveTo(1, 0); c.lineTo(L * 0.22, 0); c.stroke();   // the slit
    c.fillStyle = 'rgba(30,40,90,.9)'; c.beginPath(); c.arc(1, 0, 1.6, 0, 6.283); c.fill();   // a bead of ink at the tip
    c.restore();
  },

  fs: `
const float DX = ${DX.toFixed(3)}, DY = ${DY.toFixed(3)}, START = ${START.toFixed(3)}, FULL = ${FULL.toFixed(3)};
const vec3 INK = vec3(.09, .12, .26), WET = vec3(.16, .25, .62), PAPER = vec3(.945, .913, .847);
uniform float uAge[${MAX_SEEDS}];

float order(vec2 a) { return a.x * DX + (a.y - 1.) * DY + (fbm(a * 2.3) - .5) * .3 + (vn(a * 6.) - .5) * .08 + START; }
float lum(vec2 q) { return dot(texture(uFinal, q).rgb, vec3(.299, .587, .114)); }

void main() {
  vec2 uv = vUv, a = vec2(uv.x * uAr, uv.y);
  float d = uP * uK - order(a);
  for (int i = 1; i < ${MAX_SEEDS}; i++) {
    if (i >= uN) break;
    vec4 s = uSeeds[i];
    float g = max(uP - s.z, 0.) * uK * .5 + s.w * 2.;
    d = max(d, g - distance(a, s.xy) + (vn(a * 9.) - .5) * .04);
  }

  // the finished design's outlines, found with a Sobel filter on its brightness
  vec2 px = 1. / vec2(textureSize(uFinal, 0));
  float tl = lum(uv + vec2(-px.x, px.y)), tc = lum(uv + vec2(0., px.y)), tr = lum(uv + px);
  float ml = lum(uv - vec2(px.x, 0.)), mr = lum(uv + vec2(px.x, 0.));
  float bl = lum(uv - px), bc = lum(uv - vec2(0., px.y)), br = lum(uv + vec2(px.x, -px.y));
  float gx = (tr + 2. * mr + br) - (tl + 2. * ml + bl), gy = (tl + 2. * tc + tr) - (bl + 2. * bc + br);
  float line = smoothstep(.16, .42, length(vec2(gx, gy)));
  line *= .72 + .28 * vn(a * 34.);                      // the pen's pressure varies

  // the paper: the pencil fading out under the ink
  vec3 dr = texture(uDraft, uv).rgb;
  dr = mix(dr, max(dr, PAPER * .985), smoothstep(.02, .16, d));

  // the watercolour: a little behind the pen, pigment blooms over the paper, tinted from the finished design. Its
  // dark areas wash in a blue-grey, its colours bloom in their own colour, and its whites are left as bare paper.
  vec3 fin = texture(uFinal, uv).rgb;
  float lf = dot(fin, vec3(.299, .587, .114)), chroma = length(fin - lf);
  vec3 tint = mix(vec3(.7, .74, .88), min(vec3(1.), fin * 1.25 + .25), smoothstep(.06, .5, lf + chroma * 1.6));
  float w = smoothstep(0., .07, d - .17 + (fbm(a * 4.5 + 3.) - .5) * .18 + (vn(a * 14.) - .5) * .05);
  float dens = .5 + .5 * fbm(a * 6. + 11.);              // uneven pigment: some passes heavier than others
  vec3 col = mix(dr, dr * tint, w * dens);
  float pool = w * (1. - w) * 4.;                        // pigment pools at the edge of each bloom
  col *= 1. - .24 * pool * (.5 + vn(a * 22.));
  col *= 1. - .07 * w + .1 * (vn(a * 170.) - .5) * w;   // granulation

  // the ink, on top: wet and glossy where it's fresh, drying dark
  float inked = smoothstep(0., .006, d);
  float wet = exp(-max(d, 0.) / .035);
  vec3 ink = mix(INK, WET, wet) + vec3(.35, .4, .55) * wet * smoothstep(.75, 1., vn(a * 80. + uT * .5)) * .5;
  col = mix(col, ink, line * inked * (1. - smoothstep(FULL * .85, FULL * 1.05, d)) * .95);

  // a soft shadow of the hand and pen just ahead of the front
  col *= 1. - .06 * exp(-abs(d + .02) / .025) * step(d, 0.) * smoothstep(0., .02, uP);

  // the finished design, complete
  col = mix(col, fin, smoothstep(0., .07, d - FULL * .8 + (fbm(a * 3. + 7.) - .5) * .12));   // the design itself, arriving in blooms too

  // a click's ink bloom spreading out
  for (int i = 1; i < ${MAX_SEEDS}; i++) {
    if (i >= uN) break;
    float r = distance(a, uSeeds[i].xy), ag = uAge[i];
    col = mix(col, WET * .8, exp(-pow((r - ag * .12) / .012, 2.)) * exp(-ag * 2.5) * .6);
  }
  // a little ink under the hand
  vec2 pv = a - uPtr;
  col = mix(col, INK, uPtrOn * exp(-dot(pv, pv) / .0004) * .25 * step(d, 0.));
  o = vec4(clamp(col, 0., 1.), 1.);
}`,
};

export default draw;
