/* Fold: the draft is a sheet of paper folded away like origami. Scrolling folds it in half along a crease, the
   moving half swinging over in 3D (lit as it turns, its underside showing once it passes upright, a shadow under
   it), then in half again across the other way, and again, four times, each fold uncovering more of the finished
   design underneath. Then the little folded packet lifts and tumbles off the page.
   The paper keeps its thickness at the edges, and every crease shows. Click to snap a crease into the paper. */
import { clamp, rand, lite, DONE } from '../core.js';
import { FOLD, makeRustle, playSnap, playWhoosh, playFlap, tuned } from './sfx-paper.js';

const N = 4;                                   // how many folds
const A0 = 0.03, STEP = 0.18, LEN = 0.155;     // fold i runs over progress [A0 + i·STEP, … + LEN]
const FLY0 = 0.745, FLY1 = 0.885;              // then the packet flies off
const SIGNS = [1, 1, -1, -1];                  // which half moves on each fold
const PI = Math.PI;

const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/* The folds for a page of aspect AR: each halves the packet along its longer side. rects[i] is the packet before
   fold i (rects[N] is the finished packet); folds[i] is { ax (0: crease is vertical, x = c; 1: horizontal, y = c),
   c, sg (+1: the half beyond c moves) }. */
function plan(AR) {
  let r = [0, 0, AR, 1];
  const folds = [], rects = [r.slice()];
  for (let i = 0; i < N; i++) {
    const ax = r[2] - r[0] >= r[3] - r[1] ? 0 : 1, sg = SIGNS[i];
    const c = ax === 0 ? (r[0] + r[2]) / 2 : (r[1] + r[3]) / 2;
    folds.push({ ax, c, sg });
    if (ax === 0) r = sg > 0 ? [r[0], r[1], c, r[3]] : [c, r[1], r[2], r[3]];
    else r = sg > 0 ? [r[0], r[1], r[2], c] : [r[0], c, r[2], r[3]];
    rects.push(r.slice());
  }
  return { folds, rects };
}
/* Where the sequence is at progress p: m folds finished, the angle of the one in progress (or -1), and the flight. */
function state(p, AR) {
  let m = 0, phi = -1;
  for (let i = 0; i < N; i++) {
    const a = A0 + i * STEP;
    if (p >= a + LEN) m = i + 1;
    else if (p > a) { phi = PI * ss(a, a + LEN, p); break; } else break;
  }
  const t = ss(FLY0, FLY1, p), R = plan(AR).rects[N];
  const cx = (R[0] + R[2]) / 2, cy = (R[1] + R[3]) / 2;
  // it lifts, spins and sails off to the top right, shrinking as it goes
  return { m, phi, fly: { t, cx, cy, ox: t * t * AR * 0.75, oy: Math.pow(t, 1.6) * 1.05 + Math.sin(t * PI) * 0.05, ang: t * 2.4, sc: 1 + 0.12 * Math.sin(t * PI) - 0.25 * t } };
}
const inRect = (x, y, r, pad = 0) => x >= r[0] - pad && x <= r[2] + pad && y >= r[1] - pad && y <= r[3] + pad;

/* What's on top at a point of the page (aspect units). Mirrors cover() in the shader. */
function cover(px, py, AR, S) {
  const { folds, rects } = plan(AR);
  let x = px, y = py;
  if (S.m === N && S.fly.t > 0) {
    const F = S.fly, c = Math.cos(-F.ang), s = Math.sin(-F.ang), dx = (x - F.cx - F.ox) / F.sc, dy = (y - F.cy - F.oy) / F.sc;
    x = F.cx + c * dx - s * dy; y = F.cy + s * dx + c * dy;
  }
  const R = rects[S.m];
  if (S.m < N && S.phi >= 0) {
    const f = folds[S.m], co = Math.cos(S.phi), si = Math.sin(S.phi), crd = f.ax === 0 ? x : y, q = f.sg * (crd - f.c);
    const h = f.ax === 0 ? (f.sg > 0 ? R[2] - f.c : f.c - R[0]) : (f.sg > 0 ? R[3] - f.c : f.c - R[1]);
    if (flapAt(q, f.ax === 0 ? y : x, co, si, h, f.ax === 0 ? [R[1], R[3]] : [R[0], R[2]], f.ax === 0 ? 0.5 : AR / 2)) return true;
    return inRect(x, y, R) && q < 0;   // the half that stays put
  }
  return inRect(x, y, R);
}
const PERSP = 0.42;   // how strongly the swinging flap grows toward the viewer as it rises
/* Is a point (q from the crease toward the moving half, e along the crease) on the swinging flap? Mirrors the shader. */
function flapAt(q, e, co, si, h, span, mid) {
  const den = co + q * PERSP * si;
  if (Math.abs(den) < 1e-5) return false;
  const s = q / den;
  if (s < 0 || s > h) return false;
  const k = 1 / (1 - PERSP * s * si), e0 = mid + (e - mid) / k;
  return e0 >= span[0] && e0 <= span[1];
}

function fuel(ch, u, v) { return cover(u * ch.AR, v, ch.AR, state(ch.p, ch.AR)) ? -0.05 : 0.01; }

/* ---------- particles: paper dust puffed out of a crease when it's pressed, and a click's crease flash ---------- */
function dust(ch, x, y, vx, vy) { ch.spawn({ k: 0, x, y, vx, vy, age: 0, life: rand(0.5, 1.1), r: rand(0.6, 1.5) }); }
function crease(ch, x, y) { ch.spawn({ k: 1, x, y, ang: rand(0, PI), len: rand(60, 130), age: 0, life: 0.9 }); }
/* dust along fold i's crease line, in stage pixels */
function puff(ch, i) {
  const { folds, rects } = plan(ch.AR), f = folds[i], R = rects[i + 1];
  for (let k = 0; k < (lite ? 10 : 22); k++) {
    const t = Math.random(), ax = f.ax === 0 ? f.c : R[0] + (R[2] - R[0]) * t, ay = f.ax === 0 ? R[1] + (R[3] - R[1]) * t : f.c;
    const nx = f.ax === 0 ? -f.sg : 0, ny = f.ax === 0 ? 0 : f.sg;   // out of the crease, away from where the flap landed
    dust(ch, (ax / ch.AR) * ch.W, (1 - ay) * ch.H, nx * rand(20, 70) + rand(-15, 15), -ny * rand(20, 70) + rand(-15, 15));
  }
}

/* ---------- sound ---------- */
function steer(ch) {
  const A = ch.sound;
  if (!A?.ctx || ch.mode !== 'gl') return;
  const X = (ch.s.zz ||= makeRustle(A));
  const S = state(ch.p, ch.AR), moving = S.phi >= 0;
  X.set(tuned('fold', FOLD), moving ? 1 : 0.25 * (ch.p > A0 && ch.p < FLY1 ? 1 : 0), Math.min(1, 0.2 + ch.speed * 7), moving ? Math.sin(S.phi) : 0);
}
function hush(ch) { ch.s.zz?.silence(); }

const fold = {
  id: 'fold',
  num: '02',
  label: 'Fold',
  hud: 'Draft folded',
  hint: 'Scroll to fold the page',
  clickHint: 'the paper to snap a crease',
  // no WebGL2: the page halves away, the same folds as straight cuts
  clip: (k) => {
    const p = (Number(k) / 100) * DONE, S = state(p, 1.6), r = plan(1.6).rects[Math.min(N, S.m + (S.phi > PI / 2 ? 1 : 0))];
    const X = (x) => `${((x / 1.6) * 100).toFixed(2)}%`, Y = (y) => `${((1 - y) * 100).toFixed(2)}%`;
    if (S.fly.t > 0.6) return 'polygon(0% 0%, 0% 0%, 0% 0%)';
    return `polygon(${X(r[0])} ${Y(r[3])}, ${X(r[2])} ${Y(r[3])}, ${X(r[2])} ${Y(r[1])}, ${X(r[0])} ${Y(r[1])})`;
  },
  uniforms: ['uFold', 'uRect', 'uM', 'uPhi', 'uFly', 'uFly2'],
  theme: {
    accent: '#a3e635', accent2: '#ecfccb', onAccent: '#132004', seed: 24,
    glowA: 'rgba(163,230,53,.09)', glowB: 'rgba(120,200,160,.06)',
    kicker: 'Experiment · Fold the draft',
    draft: ['Fold it', 'down?'], final: ['Fold it', 'down.'],
    aside: 'smaller.',
    sub: 'Fold the first draft away, crease by crease, until only the finished design is left.',
    note: ['v0.5', 'too much.', 'fold it.'],
    chips: [['Drafts folded', '24'], ['Shipped', '12']],
  },
  home: () => ({ u: 0.5, v: 0.5, p0: 0, born: 0, off: -10 }),
  reach: () => 1,
  fuel,
  emit() {},

  onClick(ch) { if (ch.sound?.ctx && ch.mode === 'gl') playSnap(ch.sound, tuned('fold', FOLD), 0.5); },
  burst(ch, x, y) { crease(ch, x, y); for (let i = 0; i < 8; i++) dust(ch, x, y, rand(-50, 50), rand(-60, 20)); },
  reset(ch) { hush(ch); ch.s = { zz: ch.s.zz }; },
  quiet: hush,

  onFrame(ch) {
    steer(ch);
    const A = ch.sound?.ctx && ch.mode === 'gl' ? ch.sound : null, P = A && tuned('fold', FOLD);
    for (let i = 0; i < N; i++) {
      const a = A0 + i * STEP;
      if (ch.pPrev < a && ch.p >= a && A) playWhoosh(A, P, Math.max(0.25, Math.min(0.7, LEN * 3)), 0.8);   // a flap swings
      if (ch.pPrev < a + LEN && ch.p >= a + LEN) {                                                       // and is pressed flat
        if (A) playSnap(A, P, 1 - i * 0.12);
        if (ch.mode === 'gl') puff(ch, i);
        ch.s.press = performance.now();
      }
    }
    if (ch.pPrev < FLY0 && ch.p >= FLY0 && A) playFlap(A, P);
    ch.quake = Math.max(ch.quake * 0.5, ch.s.press ? 0.35 * Math.exp(-(performance.now() - ch.s.press) / 90) : 0);
  },

  setUniforms(ch, gl, loc) {
    const { folds, rects } = plan(ch.AR), S = state(ch.p, ch.AR), F = S.fly;
    ch.s.fb ||= new Float32Array(N * 4); ch.s.rb ||= new Float32Array((N + 1) * 4);
    folds.forEach((f, i) => ch.s.fb.set([f.ax, f.c, f.sg, 0], i * 4));
    rects.forEach((r, i) => ch.s.rb.set(r, i * 4));
    gl.uniform4fv(loc.uFold, ch.s.fb);
    gl.uniform4fv(loc.uRect, ch.s.rb);
    gl.uniform1f(loc.uM, S.m);
    gl.uniform1f(loc.uPhi, S.phi);
    gl.uniform4f(loc.uFly, F.t, F.ox, F.oy, F.ang);
    gl.uniform4f(loc.uFly2, F.sc, F.cx, F.cy, 0);
  },

  step(ch, c, dt) {
    const P = ch.parts;
    for (let i = P.length - 1; i >= 0; i--) {
      const s = P[i];
      s.age += dt;
      if (s.age >= s.life) { P.splice(i, 1); continue; }
      const h = 1 - s.age / s.life;
      if (s.k === 0) {                                   // paper dust
        s.vx *= 1 - dt * 2; s.vy = s.vy * (1 - dt * 2) + 25 * dt;
        s.x += s.vx * dt; s.y += s.vy * dt;
        c.fillStyle = `rgba(250,244,230,${(h * 0.6).toFixed(3)})`;
        c.beginPath(); c.arc(s.x, s.y, s.r, 0, 6.283); c.fill();
      } else {                                           // a crease snapped in by a click: a dark fold line with a lit ridge beside it
        const dx = Math.cos(s.ang) * s.len / 2, dy = Math.sin(s.ang) * s.len / 2, nx = -Math.sin(s.ang), ny = Math.cos(s.ang);
        const grow = Math.min(1, s.age / 0.08);
        c.lineCap = 'round';
        c.strokeStyle = `rgba(70,58,42,${(h * 0.55).toFixed(3)})`; c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(s.x - dx * grow, s.y - dy * grow); c.lineTo(s.x + dx * grow, s.y + dy * grow); c.stroke();
        c.strokeStyle = `rgba(255,252,245,${(h * 0.5).toFixed(3)})`; c.lineWidth = 1;
        c.beginPath(); c.moveTo(s.x - dx * grow + nx * 1.5, s.y - dy * grow + ny * 1.5); c.lineTo(s.x + dx * grow + nx * 1.5, s.y + dy * grow + ny * 1.5); c.stroke();
      }
    }
  },

  fs: `
const float PI = 3.14159265, PERSP = ${PERSP.toFixed(3)};
uniform vec4 uFold[${N}];     // ax, c, sg
uniform vec4 uRect[${N + 1}]; // x0, y0, x1, y1
uniform float uM, uPhi;
uniform vec4 uFly, uFly2;     // t, ox, oy, angle · scale, cx, cy

vec3 draftAt(vec2 q) { return texture(uDraft, vec2(q.x / uAr, q.y)).rgb; }
vec3 backAt(vec2 q) { return mix(vec3(.91, .875, .81), draftAt(q), .12) * .97; }
float inR(vec2 p, vec4 r) { return step(r.x, p.x) * step(p.x, r.z) * step(r.y, p.y) * step(p.y, r.w); }
// distance from p to the rectangle r (0 inside)
float dR(vec2 p, vec4 r) { vec2 d = max(vec2(r.x, r.y) - p, p - vec2(r.z, r.w)); return length(max(d, 0.)); }
// distance from p to the rectangle's edge, from inside
float dIn(vec2 p, vec4 r) { return min(min(p.x - r.x, r.z - p.x), min(p.y - r.y, r.w - p.y)); }
vec2 unfly(vec2 p) {
  if (uFly.x <= 0.) return p;
  float c = cos(-uFly.w), s = sin(-uFly.w);
  vec2 d = (p - uFly2.yz - uFly.yz) / uFly2.x;
  return uFly2.yz + vec2(c * d.x - s * d.y, s * d.x + c * d.y);
}

void main() {
  vec2 uv = vUv + uQuake * vec2(sin(uT * 71.), cos(uT * 67.)) * .0015;
  vec2 a = vec2(uv.x * uAr, uv.y);
  vec3 fin = texture(uFinal, uv).rgb;
  int m = int(uM + .5);

  vec2 p = a;
  if (m == ${N}) p = unfly(a);
  vec4 R = uRect[0];
  for (int i = 0; i <= ${N}; i++) if (i == m) R = uRect[i];

  // the finished design, under the packet's soft shadow (light from the top left, the packet higher as it flies)
  float lift = .006 + .05 * uFly.x;
  vec2 ps = (m == ${N}) ? unfly(a + vec2(-lift, lift) * .8) : a + vec2(-.005, .007);
  float shadow = .38 * exp(-dR(ps, R) / (.01 + .05 * uFly.x)) * (1. - .6 * uFly.x);

  bool on = inR(p, R) > .5, under = false;
  float light = 1., creaseD = 1e9;

  // the fold in progress: its moving half swings over the crease, in perspective (it grows toward you as it rises)
  if (m < ${N} && uPhi >= 0.) {
    vec4 F = uFold[0];
    for (int i = 0; i < ${N}; i++) if (i == m) F = uFold[i];
    float co = cos(uPhi), si = sin(uPhi);
    float crd = F.x < .5 ? p.x : p.y, q = F.z * (crd - F.y);
    float e = F.x < .5 ? p.y : p.x, mid = F.x < .5 ? .5 : uAr * .5;
    vec2 span = F.x < .5 ? vec2(R.y, R.w) : vec2(R.x, R.z);
    float h = F.x < .5 ? (F.z > 0. ? R.z - F.y : F.y - R.x) : (F.z > 0. ? R.w - F.y : F.y - R.y);
    float den = co + q * PERSP * si, s = abs(den) > 1e-5 ? q / den : -1.;
    float k = 1. / (1. - PERSP * max(s, 0.) * si), e0 = mid + (e - mid) / k;
    bool flap = s >= 0. && s <= h && e0 >= span.x && e0 <= span.y;
    if (flap) {
      on = true;
      creaseD = s;
      // the flap's own point, back on the page before it swung
      if (F.x < .5) { p.x = F.y + F.z * s; p.y = e0; } else { p.y = F.y + F.z * s; p.x = e0; }
      if (co >= 0.) light = .52 + .48 * co - .14 * si * (s / h);      // its face, turning away from the light
      else { under = true; light = .6 + .4 * (-co) + .12 * si * (1. - s / h); }   // its underside, coming into the light
    } else if (on && q < 0.) {
      creaseD = -q;
      // the half that stays put, in the flap's shadow while it hangs over it
      float edge = co < 0. ? h * co / (1. - PERSP * h * si) : 0.;
      light = 1. - .36 * si * step(co, 0.) * exp(-max(edge - q, 0.) / (.2 * h * si + .004));
    } else {
      on = false;
      // the uncovered design, shaded by the flap above it
      shadow = max(shadow, .3 * si * exp(-max(q, 0.) / (.3 * h * si + .004)) * step(0., q));
    }
  }

  vec3 col;
  if (!on) {
    col = fin * (1. - shadow);
  } else {
    // the edge of the packet: the paper's thickness
    float edge = dIn(m == ${N} ? unfly(a) : a, R);
    // unfold the finished folds: the top layer is each flap, laid over and showing its back
    float side = under ? 1. : 0.;
    if (!under) {
      for (int j = ${N - 1}; j >= 0; j--) {
        if (j >= m) continue;
        vec4 F = uFold[j];
        if (F.x < .5) { creaseD = min(creaseD, abs(p.x - F.y)); p.x = 2. * F.y - p.x; }
        else { creaseD = min(creaseD, abs(p.y - F.y)); p.y = 2. * F.y - p.y; }
        side = 1. - side;
      }
    }
    col = (side > .5 ? backAt(p) : draftAt(p)) * light;
    // creases and the paper's edge: a dark line at the fold, a lit ridge just inside, a thin band of thickness
    col *= 1. - .22 * exp(-creaseD / .0018);
    col += vec3(.06) * exp(-abs(creaseD - .005) / .002);
    col *= mix(.8, 1., smoothstep(0., .0035, edge));
    col += vec3(.07) * exp(-abs(edge - .0045) / .0015);
  }
  o = vec4(clamp(col, 0., 1.), 1.);
}`,
};

export default fold;
