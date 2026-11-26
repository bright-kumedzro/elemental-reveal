/* Page Curl: the draft is a sheet of paper lying on the finished design, and scrolling turns it like a page.
   The bottom-right corner lifts and the sheet rolls back over itself around a moving cylinder: the part on the roll
   shows its front going under and its back coming over, with a highlight along the spine, and the part that has
   rolled over lies flat on top, back side up, the sketch faintly showing through. The roll casts a soft shadow on
   the design it uncovers. By the end the whole sheet has rolled off the page.
   Move near a corner and it lifts a little toward your hand. Click to peel a small patch back. */
import { clamp, rand, lite, fine, ign, DONE, MAX_SEEDS } from '../core.js';
import { CURL, makeRustle, playFlap, playPeel, tuned } from './sfx-paper.js';

const R0 = 0.075;              // the roll's radius (aspect units)
const DX = -1, DY = 0.62;      // the direction it rolls in: from the bottom-right corner toward the top left
const START = 0.012;           // progress at which the corner starts to lift
const PEEL = 0.06;             // how big a click's peel gets
const IGN = 0.085;             // core.js's ignition size (a click's seed.w grows to this)
const PI = Math.PI;

const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/* The roll's frame in aspect units: the corner it starts from, its direction, and how far it has to go. */
function frame(AR) {
  const n = Math.hypot(DX, DY), dx = DX / n, dy = DY / n, cx = AR, cy = 0;
  let dmax = 0;
  for (const [x, y] of [[0, 0], [AR, 0], [0, 1], [AR, 1]]) dmax = Math.max(dmax, (x - cx) * dx + (y - cy) * dy);
  return { dx, dy, cx, cy, dmax };
}
/* Where the roll's line is, along the direction, at progress p. By DONE the whole sheet has rolled over and off. */
function lineAt(p, F) {
  const t = clamp((p - START) / (DONE - START), 0, 1), k = 0.75 * t + 0.25 * ss(0, 1, t);   // close to steady, eased at the ends
  return -R0 + (F.dmax + PI * R0 * 0.5 + R0 + 0.04) * k;
}
/* What covers a point of the page (aspect units): 0 nothing (the design shows), 1 the sheet lying flat, 2 the
   sheet's front on the roll, 3 its back on the roll, 4 its back lying flat after rolling over. w is the paper
   point's distance along the direction, e across it. Mirrors hit() in the shader. */
function hit(px, py, F, x0, R, AR) {
  const vx = px - F.cx, vy = py - F.cy, d = vx * F.dx + vy * F.dy, e = -vx * F.dy + vy * F.dx;
  const inPage = (w) => { const qx = F.cx + F.dx * w - F.dy * e, qy = F.cy + F.dy * w + F.dx * e; return qx >= -1e-4 && qx <= AR + 1e-4 && qy >= -1e-4 && qy <= 1 + 1e-4; };
  if (d >= x0) {
    const w = 2 * x0 - d - PI * R;
    if (w >= 0 && inPage(w)) return { k: 4, w, e, u: x0 - d };
    return { k: 1, w: d, e, u: x0 - d };
  }
  const u = x0 - d;
  if (u <= R) {
    const t2 = PI - Math.asin(u / R), w2 = x0 - R * t2;
    if (w2 >= 0 && inPage(w2)) return { k: 3, w: w2, e, u };
    const t1 = Math.asin(u / R), w1 = x0 - R * t1;
    if (w1 >= 0 && inPage(w1)) return { k: 2, w: w1, e, u };
  }
  return { k: 0, u };
}

function fuel(ch, u, v, now) {
  const AR = ch.AR, F = frame(AR), x0 = lineAt(ch.p, F), ax = u * AR, ay = v;
  const H = hit(ax, ay, F, x0, R0, AR);
  if (H.k === 0) return Math.max(0.001, H.u - R0);
  if (H.k === 1) {   // a click's peel only goes through the sheet where it still lies flat
    for (let i = 1; i < ch.seeds.length; i++) {
      const s = ch.seeds[i], rp = (ign(s, now) / IGN) * PEEL, r = Math.hypot(ax - s.u * AR, ay - s.v);
      if (r < rp) return rp - r;
    }
  }
  return -0.05;
}

/* ---------- particles: paper fibres and dust lifting off where the sheet leaves the page ---------- */
function mote(ch, x, y) {
  ch.spawn({ k: 0, x, y, vx: rand(-20, 20), vy: rand(-40, -10), age: 0, life: rand(0.8, 1.8), r: rand(0.6, 1.6) });
}
function fibre(ch, x, y, vx, vy) {
  ch.spawn({ k: 1, x, y, vx, vy, age: 0, life: rand(0.5, 1.1), len: rand(3, 9), rot: rand(0, 6.28), vr: rand(-8, 8) });
}

/* ---------- sound ---------- */
function steer(ch) {
  const A = ch.sound;
  if (!A?.ctx || ch.mode !== 'gl') return;
  const X = (ch.s.zz ||= makeRustle(A));
  const moving = ch.p > START && ch.p < DONE + 0.02;
  X.set(tuned('curl', CURL), moving ? 1 : 0, Math.min(1, 0.15 + ch.speed * 7), ss(START, DONE, ch.p));
}
function hush(ch) { ch.s.zz?.silence(); }

const curl = {
  id: 'curl',
  num: '01',
  label: 'Page Curl',
  hud: 'Page turned',
  hint: 'Scroll to turn the page',
  clickHint: 'the paper to peel a patch back',
  // no WebGL2: the page is wiped away from the bottom-right corner along the same diagonal
  clip: (k) => {
    // keep the part of the page with x + y below a line that sweeps from the bottom-right corner (page fractions, y down)
    const t = Math.min(2, (Number(k) / 100) * 2), s = 2 - t, P = (x, y) => `${(x * 100).toFixed(2)}% ${(y * 100).toFixed(2)}%`;
    if (s <= 0) return 'polygon(0% 0%, 0% 0%, 0% 0%)';
    return s >= 1 ? `polygon(${P(0, 0)}, ${P(1, 0)}, ${P(1, s - 1)}, ${P(s - 1, 1)}, ${P(0, 1)})` : `polygon(${P(0, 0)}, ${P(s, 0)}, ${P(0, s)})`;
  },
  wantsColor: true,
  uniforms: ['uX0', 'uR', 'uDir', 'uAge'],
  theme: {
    accent: '#fb7185', accent2: '#ffe0e6', onAccent: '#2a0710', seed: 16,
    glowA: 'rgba(251,113,133,.10)', glowB: 'rgba(255,200,170,.06)',
    kicker: 'Experiment · Turn the page',
    draft: ['Turn the', 'page?'], final: ['Turn the', 'page.'],
    aside: 'next chapter.',
    sub: 'Peel the first draft back and see what was waiting underneath it all along.',
    note: ['v0.2', 'still a draft.', 'turn it.'],
    chips: [['Pages turned', '16'], ['Shipped', '12']],
  },
  home: () => ({ u: 1, v: 0, p0: 0, born: 0, off: -10 }),
  reach: () => 1,
  fuel,

  // fibres and dust come off the page where the roll lifts it
  emit(ch, x, y, d, act) {
    if (d <= 0 || d > 0.02) return;
    if (Math.random() < act * 0.12) mote(ch, x, y);
  },
  onClick(ch, seed) { seed.off = 0; if (ch.sound?.ctx && ch.mode === 'gl') playPeel(ch.sound, tuned('curl', CURL), 0.8); },
  burst(ch, x, y) { for (let i = 0; i < 10; i++) { const a = rand(0, 6.283), sp = rand(30, 110); fibre(ch, x, y, Math.cos(a) * sp, Math.sin(a) * sp - 40); } },
  reset(ch) { hush(ch); ch.s = { zz: ch.s.zz }; },
  quiet: hush,

  onFrame(ch, now) {
    steer(ch);
    // the sheet's last edge leaves the page: it flaps off
    const OFF = DONE - 0.05;
    if (ch.pPrev < OFF && ch.p >= OFF && ch.sound?.ctx && ch.mode === 'gl') playFlap(ch.sound, tuned('curl', CURL));
    if (ch.mode !== 'gl' || lite) return;
    // a few motes drift off the spine of the roll while it moves
    if (ch.p > START && ch.p < DONE && Math.random() < Math.min(0.6, ch.speed * 10)) {
      const F = frame(ch.AR), x0 = lineAt(ch.p, F), e = rand(-1.2, 1.2);
      const x = F.cx + F.dx * (x0 - R0) - F.dy * e, y = F.cy + F.dy * (x0 - R0) + F.dx * e;
      if (x > 0 && x < ch.AR && y > 0 && y < 1) mote(ch, (x / ch.AR) * ch.W, (1 - y) * ch.H);
    }
  },

  setUniforms(ch, gl, loc, now) {
    const F = frame(ch.AR), s = ch.s;
    s.age = s.age || new Float32Array(MAX_SEEDS);
    s.age.fill(0);
    ch.seeds.forEach((sd, i) => { if (i && sd.born) s.age[i] = (ign(sd, now) / IGN) * PEEL; });
    gl.uniform1f(loc.uX0, lineAt(ch.p, F));
    gl.uniform1f(loc.uR, R0);
    gl.uniform2f(loc.uDir, F.dx, F.dy);
    gl.uniform1fv(loc.uAge, s.age);   // here: each click's peel radius
  },

  step(ch, c, dt) {
    const P = ch.parts;
    for (let i = P.length - 1; i >= 0; i--) {
      const s = P[i];
      s.age += dt;
      if (s.age >= s.life) { P.splice(i, 1); continue; }
      const h = 1 - s.age / s.life;
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.k === 0) {                                   // a mote of paper dust, catching the light
        s.vx += Math.sin(s.age * 4 + s.r * 9) * 12 * dt;
        c.fillStyle = `rgba(255,248,235,${(h * 0.55).toFixed(3)})`;
        c.beginPath(); c.arc(s.x, s.y, s.r, 0, 6.283); c.fill();
      } else {                                           // a torn fibre, tumbling
        s.vy += 120 * dt; s.rot += s.vr * dt;
        c.strokeStyle = `rgba(120,105,85,${(h * 0.7).toFixed(3)})`; c.lineWidth = 1;
        c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(s.x + Math.cos(s.rot) * s.len, s.y + Math.sin(s.rot) * s.len); c.stroke();
      }
    }
  },

  fs: `
const float PI = 3.14159265;
uniform float uX0, uR;
uniform vec2 uDir;
uniform float uAge[${MAX_SEEDS}];

vec3 draftAt(vec2 q) { return texture(uDraft, vec2(q.x / uAr, q.y)).rgb; }
// the back of the sheet: plain paper, a shade darker, the sketch faintly showing through (mirrored, by the mapping)
vec3 backAt(vec2 q) { return mix(vec3(.90, .865, .80), draftAt(q), .13) * .97; }

// which layer covers point a, for a roll from corner c along dir; returns kind (0 none, 1 flat front, 2 roll front,
// 3 roll back, 4 flat back) in .x, the paper point's distance along dir in .y, across it in .z, and the distance
// behind the roll's line in .w
vec4 hit(vec2 a, vec2 c, vec2 dir, float x0, float R) {
  vec2 v = a - c;
  float d = dot(v, dir), e = -v.x * dir.y + v.y * dir.x;
  vec2 nrm = vec2(-dir.y, dir.x);
  if (d >= x0) {
    float w = 2. * x0 - d - PI * R;
    vec2 q = c + dir * w + nrm * e;
    if (w >= 0. && q.x >= -1e-4 && q.x <= uAr + 1e-4 && q.y >= -1e-4 && q.y <= 1.0001) return vec4(4., w, e, x0 - d);
    return vec4(1., d, e, x0 - d);
  }
  float u = x0 - d;
  if (u <= R) {
    float w2 = x0 - R * (PI - asin(u / R));
    vec2 q2 = c + dir * w2 + nrm * e;
    if (w2 >= 0. && q2.x >= -1e-4 && q2.x <= uAr + 1e-4 && q2.y >= -1e-4 && q2.y <= 1.0001) return vec4(3., w2, e, u);
    float w1 = x0 - R * asin(u / R);
    vec2 q1 = c + dir * w1 + nrm * e;
    if (w1 >= 0. && q1.x >= -1e-4 && q1.x <= uAr + 1e-4 && q1.y >= -1e-4 && q1.y <= 1.0001) return vec4(2., w1, e, u);
  }
  return vec4(0., 0., 0., u);
}

// what a hit looks like; fin is the design underneath, flt the sheet lying flat at a
vec3 look(vec4 H, vec2 c, vec2 dir, float x0, float R, vec3 fin, vec3 flt) {
  vec2 nrm = vec2(-dir.y, dir.x);
  vec2 q = c + dir * H.y + nrm * H.z;
  float k = H.x, u = H.w;
  if (k < .5) {
    // the design, in the roll's shadow (light from the top left, so the shadow falls toward the corner)
    float sh = .55 * exp(-max(u - R, 0.) / (R * .9)) * step(R * .2, x0);
    return fin * (1. - sh);
  }
  if (k < 1.5) {
    // the sheet lying flat; a soft shadow where the rolled-over part's edge lies on it
    float wb = 2. * x0 - (x0 - u) - PI * R;
    float sh = wb < 0. ? .28 * exp(wb / (R * .35)) * step(0., x0) : 0.;
    return flt * (1. - sh);
  }
  float t = clamp(u / R, -1., 1.);
  if (k < 2.5) {
    // the front going under the roll: it turns away from the light, darker toward the spine
    return draftAt(q) * mix(1., .52, t * t);
  }
  if (k < 3.5) {
    // the back coming over the top of the roll: lit, with a bright highlight along the spine
    float hl = exp(-pow((t - .78) / .16, 2.));
    return backAt(q) * (.74 + .26 * sqrt(max(0., 1. - t * t))) + vec3(1., .98, .94) * hl * .32;
  }
  // the rolled-over part lying flat, back up: brightest where it leaves the roll, its free edge a touch darker
  float lip = exp(-max(-u, 0.) / (R * 1.4));
  return backAt(q) * (.88 + .1 * lip);
}

void main() {
  vec2 uv = vUv + uQuake * vec2(sin(uT * 61.), cos(uT * 53.)) * .002;
  vec2 a = vec2(uv.x * uAr, uv.y);
  vec3 fin = texture(uFinal, uv).rgb;
  vec3 flt = texture(uDraft, uv).rgb;

  // clicks peel small patches back where the sheet still lies flat: a hole with a rolled lip round it
  for (int i = 1; i < ${MAX_SEEDS}; i++) {
    if (i >= uN) break;
    float rp = uAge[i];
    if (rp < 1e-4) continue;
    float r = distance(a, uSeeds[i].xy);
    if (r < rp) flt = fin * (1. - .35 * exp(-(rp - r) / .012));
    else if (r < rp + .018) {
      float t = (r - rp) / .018;
      flt = backAt(uSeeds[i].xy + (a - uSeeds[i].xy) * (rp / r)) * (.72 + .28 * sin(t * PI));
    } else flt *= 1. - .18 * exp(-(r - rp - .018) / .01);
  }

  // the main roll, from the bottom-right corner
  vec2 c0 = vec2(uAr, 0.);
  vec4 H = hit(a, c0, uDir, uX0, uR);
  vec3 col = look(H, c0, uDir, uX0, uR, fin, flt);

  // where the sheet still lies flat, the corner nearest the hand lifts a little toward it
  if (H.x > .5 && H.x < 1.5 && uPtrOn > .01) {
    vec2 cs[4] = vec2[4](vec2(0., 0.), vec2(uAr, 0.), vec2(0., 1.), vec2(uAr, 1.));
    vec2 cc = cs[0]; float best = 1e9;
    for (int i = 0; i < 4; i++) { float dd = distance(uPtr, cs[i]); if (dd < best) { best = dd; cc = cs[i]; } }
    vec2 dir = normalize(vec2(uAr * .5, .5) - cc);
    float x0 = uPtrOn * .07 * exp(-best / .28);
    if (x0 > .002) {
      vec4 Hp = hit(a, cc, dir, x0, .03);
      if (Hp.x < .5 || Hp.x > 1.5) col = look(Hp, cc, dir, x0, .03, fin, flt);
    }
  }
  o = vec4(clamp(col, 0., 1.), 1.);
}`,
};

export default curl;
