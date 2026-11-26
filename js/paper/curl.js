/* Page Curl: the draft is a page of a magazine, bound at the left edge, and scrolling turns it.
   The page is simulated, not animated: it's the page turn from the Design Chapter site's flipbook, which follows
   the Gutterlight page turn. Two Verlet strips (the page's top and bottom edges) are pinned at the spine; edge links
   stop them stretching, rungs and soft diagonals tie them into one sheet, skip-one links give paper its stiffness,
   and a floor (z ≥ 0) stands in for the design underneath. A "hand" pulls a point of the free edge toward a target
   on a slightly shortened arc around the spine, so the sheet has to bow to get there, and that bow is the curl.
   It's drawn as a lit ruled surface between the strips that darkens where it bends hardest, its back a shade
   darker with the sketch faintly showing through, casting a soft shadow on the design it uncovers.
   Scroll drives the hand. The pointer's height steers which part of the edge it holds; click to flick the page. */
import { clamp, rand, lite, DONE } from '../core.js';
import { CURL, makeRustle, playFlap, playPeel, tuned } from './sfx-paper.js';

/* ---------- the sheet (ported from design-chapter src/lib/paper.ts) ---------- */
const N = 28;          // segments along each strip
const M = 12;          // rows across the ruled surface
const DAMP = 0.986;
const ITER = 12;
const SLACK = 0.2;     // how much shorter the hand's arc is than the page: more slack, more bow (less on a tall, narrow page, which pleats)
const STEP = 1 / 120;
const PERSP = 3.2;     // the eye's distance, in page widths (as in the flipbook)
const START = 0.02, END = DONE - 0.03;   // the turn runs over this much of the chapter

/* A critically-ish damped spring, solved exactly (no drift at low frame rates). Tokens as in Gutterlight. */
const SPRINGS = { settle: { zeta: 0.95, omega: 9 }, page: { zeta: 0.9, omega: 16.6 } };
class Spring {
  constructor(x = 0, tok = SPRINGS.settle, eps = 1e-3) { this.x = this.target = x; this.v = 0; this.tok = tok; this.eps = eps; this.d0 = this.v0 = this.t = 0; this.rest = true; }
  set(x) { this.x = this.target = x; this.v = this.d0 = this.v0 = this.t = 0; this.rest = true; return this; }
  anchor() { this.d0 = this.x - this.target; this.v0 = this.v; this.t = 0; this.rest = false; }
  to(x) { if (x !== this.target) { this.target = x; this.anchor(); } return this; }
  kick(v) { if (v) { this.v += v; this.anchor(); } return this; }
  tick(dt) {
    if (this.rest) return false;
    const { zeta: z, omega: w } = this.tok;
    this.t += dt;
    const t = this.t, x0 = this.d0, v0 = this.v0;
    let x, v;
    if (Math.abs(z - 1) < 1e-4) { const e = Math.exp(-w * t), b = v0 + w * x0; x = (x0 + b * t) * e; v = (b - w * (x0 + b * t)) * e; }
    else if (z < 1) {
      const wd = w * Math.sqrt(1 - z * z), e = Math.exp(-z * w * t), b = (v0 + z * w * x0) / wd, c = Math.cos(wd * t), s = Math.sin(wd * t);
      x = e * (x0 * c + b * s); v = -z * w * x + e * wd * (b * c - x0 * s);
    } else {
      const r = w * Math.sqrt(z * z - 1), r1 = -z * w + r, r2 = -z * w - r, c2 = (r1 * x0 - v0) / (r1 - r2), c1 = x0 - c2, e1 = Math.exp(r1 * t), e2 = Math.exp(r2 * t);
      x = c1 * e1 + c2 * e2; v = c1 * r1 * e1 + c2 * r2 * e2;
    }
    this.x = this.target + x; this.v = v;
    if (Math.abs(x) < this.eps && Math.abs(v) < this.eps * w) this.set(this.target);
    return !this.rest;
  }
}

const id = (i, r) => r * (N + 1) + i;
function makeSheet() {
  return {
    X: new Float32Array(2 * (N + 1) * 3), PX: new Float32Array(2 * (N + 1) * 3), Wt: new Float32Array(2 * (N + 1)),
    links: [], W: 1, H: 1, acc: 0, a: 0, posed: false,
    cy: new Spring(0.82, SPRINGS.settle, 1e-3),        // where on the free edge the hand holds (0 top, 1 bottom)
    flick: new Spring(0, SPRINGS.page, 1e-4),          // a click's extra lift, springing back
    data: new Float32Array((N + 1) * (M + 1) * 9),
  };
}
/* Sets the page size (here: aspect units, the page is the whole stage) and lays the sheet straight at turn a. */
function resize(S, W, H, a) {
  S.W = W; S.H = H;
  const seg = W / N, dg = Math.hypot(seg, H);
  S.links = [];
  for (let i = 0; i <= N; i++) {
    S.links.push([id(i, 0), id(i, 1), H, 1]);                                                     // rung
    if (i < N) for (let r = 0; r < 2; r++) S.links.push([id(i, r), id(i + 1, r), seg, 1]);        // edge (inextensible)
    if (i < N) { S.links.push([id(i, 0), id(i + 1, 1), dg, 0.22]); S.links.push([id(i, 1), id(i + 1, 0), dg, 0.22]); }   // soft shear
    if (i < N - 1) for (let r = 0; r < 2; r++) S.links.push([id(i, r), id(i + 2, r), 2 * seg, 0.09]);   // bending
  }
  pose(S, a);
}
/* A straight sheet at turn angle πa. */
function pose(S, a) {
  const c = Math.cos(PI * a), s = Math.sin(PI * a);
  for (let r = 0; r < 2; r++) for (let i = 0; i <= N; i++) {
    const k = id(i, r) * 3, u = (i / N) * S.W;
    S.X[k] = S.PX[k] = u * c; S.X[k + 1] = S.PX[k + 1] = r * S.H; S.X[k + 2] = S.PX[k + 2] = u * s;
    S.Wt[id(i, r)] = i === 0 ? 0 : 1;
  }
  S.acc = 0; S.posed = true;
}
const PI = Math.PI;
function step(S, h) {
  const { X, PX, Wt, W, H } = S, NP = Wt.length, g = Math.max(W, 0.85 * H) * 1.7 * h * h;   // gravity scales with the page's larger side, so a narrow page still sags into one bow
  for (let n = 0; n < NP; n++) {
    if (!Wt[n]) continue;
    const k = n * 3;
    for (let d = 0; d < 3; d++) { const x = X[k + d], v = (x - PX[k + d]) * DAMP; PX[k + d] = x; X[k + d] = x + v - (d === 2 ? g : 0); }
  }
  // the hand: a point at height cy on the free edge goes to a target on the shortened arc around the spine
  const p = clamp(S.a + S.flick.x, -0.02, 1.02), ang = PI * p;
  const R = W * (1 - (W < 1 ? 0.13 + 0.07 * clamp((W - 0.6) / 0.4, 0, 1) : SLACK) * Math.sin(Math.max(0, Math.min(PI, ang))));
  const cy = clamp(S.cy.x, 0, 1), tx = R * Math.cos(ang), ty = cy * H, tz = Math.max(0, R * Math.sin(ang));
  const T = id(N, 0) * 3, B = id(N, 1) * 3, wT = 1 - cy, wB = cy, s = 1 / (wT * wT + wB * wB);
  for (let it = 0; it < ITER; it++) {
    for (const [a, b, len, k] of S.links) {
      const ia = a * 3, ib = b * 3, wa = Wt[a], wb = Wt[b], w = wa + wb;
      if (!w) continue;
      const dx = X[ib] - X[ia], dy = X[ib + 1] - X[ia + 1], dz = X[ib + 2] - X[ia + 2], dd = Math.hypot(dx, dy, dz);
      if (!dd) continue;
      const c = ((dd - len) / dd / w) * k;
      X[ia] += dx * c * wa; X[ia + 1] += dy * c * wa; X[ia + 2] += dz * c * wa;
      X[ib] -= dx * c * wb; X[ib + 1] -= dy * c * wb; X[ib + 2] -= dz * c * wb;
    }
    const gx = X[T] * wT + X[B] * wB, gy = X[T + 1] * wT + X[B + 1] * wB, gz = X[T + 2] * wT + X[B + 2] * wB;
    const ex = (tx - gx) * s, ey = (ty - gy) * s, ez = (tz - gz) * s;
    X[T] += ex * wT; X[T + 1] += ey * wT; X[T + 2] += ez * wT;
    X[B] += ex * wB; X[B + 1] += ey * wB; X[B + 2] += ez * wB;
    // the floor (the design underneath), with a little friction
    for (let n = 0; n < NP; n++) if (X[n * 3 + 2] < 0) { X[n * 3 + 2] = 0; PX[n * 3] += (X[n * 3] - PX[n * 3]) * 0.35; }
  }
}
function tick(S, dt) {
  S.cy.tick(dt); S.flick.tick(dt);
  S.acc += Math.min(dt, 0.25);
  while (S.acc >= STEP) { step(S, STEP); S.acc -= STEP; }
}
/* The ruled surface between the strips: vertex (i, m) = lerp(top_i, bottom_i, m/M); normal = ∂u × ∂v; bend k. */
function fill(S) {
  const { X, data } = S;
  const T = (i) => id(clamp(i, 0, N), 0) * 3, Bo = (i) => id(clamp(i, 0, N), 1) * 3;
  let o = 0;
  for (let i = 0; i <= N; i++) {
    const t = T(i), b = Bo(i), tp = T(i - 1), tn = T(i + 1), bp = Bo(i - 1), bn = Bo(i + 1);
    let k = 0;
    if (i > 0 && i < N) for (const [p0, p1, p2] of [[tp, t, tn], [bp, b, bn]]) {
      const ax = X[p1] - X[p0], ay = X[p1 + 1] - X[p0 + 1], az = X[p1 + 2] - X[p0 + 2], bx = X[p2] - X[p1], by = X[p2 + 1] - X[p1 + 1], bz = X[p2 + 2] - X[p1 + 2];
      const cs = (ax * bx + ay * by + az * bz) / (Math.hypot(ax, ay, az) * Math.hypot(bx, by, bz) || 1);
      k = Math.max(k, Math.acos(clamp(cs, -1, 1)));
    }
    k = clamp((k * N) / 9, 0, 1);
    for (let m = 0; m <= M; m++) {
      const v = m / M, l = (a, c, d) => X[a + d] + (X[c + d] - X[a + d]) * v;
      const ux = l(tn, bn, 0) - l(tp, bp, 0), uy = l(tn, bn, 1) - l(tp, bp, 1), uz = l(tn, bn, 2) - l(tp, bp, 2);
      const vx = X[b] - X[t], vy = X[b + 1] - X[t + 1], vz = X[b + 2] - X[t + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, nl = Math.hypot(nx, ny, nz) || 1;
      data[o++] = l(t, b, 0); data[o++] = l(t, b, 1); data[o++] = l(t, b, 2);
      data[o++] = nx / nl; data[o++] = ny / nl; data[o++] = nz / nl;
      data[o++] = i / N; data[o++] = v; data[o++] = k;
    }
  }
}

/* ---------- driving it from scroll ---------- */
/* With the spine at the stage's edge, everything past upright (a = 0.5) is off-screen: so most of the scroll
   goes to the part you can see, and the last stretch swings it the rest of the way over. */
const SEEN = 0.82, UP = 0.6;
const turnAt = (p) => {
  const t = clamp((p - START) / (END - START), 0, 1);
  if (t < SEEN) { const u = t / SEEN; return UP * (0.75 * u + 0.25 * u * u * (3 - 2 * u)); }
  const u = (t - SEEN) / (1 - SEEN);
  return UP + (1 - UP) * u * (2 - u);
};
const GONE = 0.62;   // about where the page has left the stage (the flap)
/* Where a sheet point (page units: x from the spine, y down from the top, z up) lands on the stage (aspect units, y up).
   The eye is above the spine, as in the flipbook. */
function project(S, x, y, z) { const s = (PERSP * S.W) / (PERSP * S.W - z); return [x * s, 1 - (0.5 + (y - 0.5) * s)]; }
/* How far across the stage the sheet reaches at each height (rows of 12), so clicks and particles know where the
   design is uncovered. */
function footprint(S) {
  const F = (S.foot ||= new Float32Array(13));
  F.fill(-1);
  for (let i = 0; i <= N; i++) for (let m = 0; m <= 12; m++) {
    const v = m / 12, t = id(i, 0) * 3, b = id(i, 1) * 3, X = S.X;
    const [sx, sy] = project(S, X[t] + (X[b] - X[t]) * v, X[t + 1] + (X[b + 1] - X[t + 1]) * v, X[t + 2] + (X[b + 2] - X[t + 2]) * v);
    const row = clamp(Math.round((1 - sy) * 12), 0, 12);
    if (sx > F[row]) F[row] = sx;
  }
}
function fuel(ch, u, v) {
  const S = ch.s.sheet;
  if (!S?.foot) return -0.05;
  const r = clamp((1 - v) * 12, 0, 12), r0 = Math.floor(r), r1 = Math.min(12, r0 + 1);
  const reach = S.foot[r0] + (S.foot[r1] - S.foot[r0]) * (r - r0);
  return u * ch.AR - reach;   // ≥ 0 where the design shows
}

/* ---------- particles: dust and fibres shaken off the moving edge ---------- */
function mote(ch, x, y, vx = rand(-20, 20), vy = rand(-40, -10)) { ch.spawn({ k: 0, x, y, vx, vy, age: 0, life: rand(0.8, 1.8), r: rand(0.6, 1.6) }); }

/* ---------- sound ---------- */
function steer(ch) {
  const A = ch.sound;
  if (!A?.ctx || ch.mode !== 'gl') return;
  const X = (ch.s.zz ||= makeRustle(A)), a = ch.s.sheet?.a ?? 0;
  X.set(tuned('curl', CURL), a > 0.004 && a < 0.995 ? 1 : 0, Math.min(1, 0.15 + ch.speed * 7), Math.sin(PI * a));
}
function hush(ch) { ch.s.zz?.silence(); }
const live = (ch) => (ch.mode ? ch.mode === 'gl' : !!ch.gl);

/* ---------- drawing: the sheet as a mesh over the quad (which draws the finished design) ---------- */
const VS = `#version 300 es
in vec3 aP; in vec3 aN; in vec2 aUv; in float aK;
uniform float uW, uD, uShadow; uniform vec2 uLight;
out vec3 vN, vW; out vec2 vUv; out float vK, vA;
void main() {
  vec3 p = aP; vA = 1.;
  if (uShadow > .5) {
    float z = p.z; p.xy += uLight * z; p.z = 0.;
    vA = .45 * smoothstep(0., .03, z) * (1. - .6 * smoothstep(.1, 1., z / (uD * .3)))
       * smoothstep(0., .07, aUv.y) * smoothstep(1., .93, aUv.y) * smoothstep(1., .9, aUv.x);
  }
  float s = uD / (uD - p.z);
  vec2 st = vec2(p.x * s, .5 + (p.y - .5) * s);       // on the stage: x from the spine (left edge), y down
  vec2 ndc = vec2(st.x / uW * 2. - 1., 1. - st.y * 2.);
  float w = 1. / s;
  gl_Position = vec4(ndc * w, -p.z / uD * w, w);
  vN = aN; vW = aP; vUv = aUv; vK = aK;
}`;
const FS = `#version 300 es
precision highp float;
in vec3 vN, vW; in vec2 vUv; in float vK, vA;
uniform sampler2D uDraft; uniform float uShadow, uW, uD;
out vec4 o;
void main() {
  if (uShadow > .5) { o = vec4(0., 0., 0., vA); return; }
  vec3 n = normalize(vN), V = normalize(vec3(0., .5, uD) - vW);
  // the normal is unchanged by the turn, so its z still says which face is up: up at rest is the front
  bool front = dot(n, V) > 0.;
  if (!front) n = -n;
  vec3 Lt = normalize(vec3(-.35, -.55, .76));
  float sh = (.5 + .5 * max(dot(n, Lt), 0.)) / (.5 + .5 * .76);
  float spec = pow(max(dot(n, normalize(Lt + V)), 0.), 36.) * smoothstep(.01, .12, 1. - abs(n.z));
  vec3 page = texture(uDraft, vec2(vUv.x, 1. - vUv.y)).rgb;
  vec2 e = min(vUv, 1. - vUv) * vec2(uW, 1.); float ed = min(e.x, e.y);
  vec3 col;
  if (front) col = page * sh + spec * .16;
  else {
    // the back: plain paper a shade darker, the sketch faintly through it (mirrored, by the turn), a darker rim
    vec3 back = mix(vec3(.88, .85, .79), page, .13);
    col = mix(back * .9, back, smoothstep(.002, .012, ed)) * sh + spec * .07;
  }
  col *= 1. - .3 * vK;
  o = vec4(col, 1.);
}`;

function initGL(ch, gl) {
  const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; } return s; };
  const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) return;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn(gl.getProgramInfoLog(prog)); return; }
  const prevVao = gl.getParameter(gl.VERTEX_ARRAY_BINDING), prevBuf = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, (N + 1) * (M + 1) * 9 * 4, gl.DYNAMIC_DRAW);
  for (const [name, n, off] of [['aP', 3, 0], ['aN', 3, 3], ['aUv', 2, 6], ['aK', 1, 8]]) {
    const l = gl.getAttribLocation(prog, name);
    if (l < 0) continue;
    gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, n, gl.FLOAT, false, 36, off * 4);
  }
  const idx = [];
  for (let i = 0; i < N; i++) for (let m = 0; m < M; m++) { const a = i * (M + 1) + m, b = a + M + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
  gl.bindVertexArray(prevVao); gl.bindBuffer(gl.ARRAY_BUFFER, prevBuf);
  const U = {};
  for (const n of ['uW', 'uD', 'uShadow', 'uLight', 'uDraft']) U[n] = gl.getUniformLocation(prog, n);
  ch.sheetGL = { prog, vao, vbo, nIdx: idx.length, U };
}

function drawGL(ch, gl) {
  const G = ch.sheetGL, S = ch.s.sheet;
  if (!G || !S || !live(ch)) return;
  fill(S);
  const prevVao = gl.getParameter(gl.VERTEX_ARRAY_BINDING), prevBuf = gl.getParameter(gl.ARRAY_BUFFER_BINDING), prevProg = gl.getParameter(gl.CURRENT_PROGRAM);
  gl.useProgram(G.prog);
  gl.bindVertexArray(G.vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, G.vbo);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, S.data);
  const D = PERSP * S.W;
  gl.uniform1f(G.U.uW, S.W); gl.uniform1f(G.U.uD, D); gl.uniform2f(G.U.uLight, 0.42, 0.62); gl.uniform1i(G.U.uDraft, 0);   // the draft is already on unit 0
  // the cast shadow, on the design underneath
  if (S.a + S.flick.x > 0.004) {
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1f(G.U.uShadow, 1);
    gl.drawElements(gl.TRIANGLES, G.nIdx, gl.UNSIGNED_SHORT, 0);
    gl.disable(gl.BLEND);
  }
  // the sheet itself, depth-sorted against itself (the clear only touches this chapter: the scissor is on)
  gl.clear(gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
  gl.uniform1f(G.U.uShadow, 0);
  gl.drawElements(gl.TRIANGLES, G.nIdx, gl.UNSIGNED_SHORT, 0);
  gl.disable(gl.DEPTH_TEST);
  gl.bindVertexArray(prevVao); gl.bindBuffer(gl.ARRAY_BUFFER, prevBuf); gl.useProgram(prevProg);
}

const curl = {
  id: 'curl',
  num: '01',
  label: 'Page Curl',
  hud: 'Page turned',
  hint: 'Scroll to turn the page',
  clickHint: 'the page to flick it',
  // no WebGL2: the page is wiped off toward the spine, from the free edge
  clip: (k) => `inset(0 ${Math.min(100, Number(k)).toFixed(2)}% 0 0)`,
  wantsColor: true,
  uniforms: [],
  theme: {
    accent: '#fb7185', accent2: '#ffe0e6', onAccent: '#2a0710', seed: 16,
    glowA: 'rgba(251,113,133,.10)', glowB: 'rgba(255,200,170,.06)',
    kicker: 'Experiment · Turn the page',
    draft: ['Turn the', 'page?'], final: ['Turn the', 'page.'],
    aside: 'next chapter.',
    sub: 'Turn the first draft over and see what was waiting underneath it all along.',
    note: ['v0.2', 'still a draft.', 'turn it.'],
    chips: [['Pages turned', '16'], ['Shipped', '12']],
  },
  home: () => ({ u: 1, v: 0, p0: 0, born: 0, off: -10 }),
  reach: () => 1,
  fuel,
  initGL,
  drawGL,

  // dust shaken off where the page has just lifted
  emit(ch, x, y, d, act) { if (d > 0 && d < 0.015 && Math.random() < act * 0.1) mote(ch, x, y); },
  // a click flicks the page: the hand gives it a quick tug and it springs back
  onClick(ch) {
    ch.s.sheet?.flick.kick(0.9);
    if (ch.sound?.ctx && live(ch)) playPeel(ch.sound, tuned('curl', CURL), 0.7);
  },
  reset(ch) { hush(ch); ch.s = { zz: ch.s.zz, sheet: ch.s.sheet }; if (ch.s.sheet) ch.s.sheet.posed = false; },
  quiet: hush,
  prime(ch) { if (ch.s.sheet) ch.s.sheet.posed = false; },   // capture: lay the sheet straight at the captured progress first

  onFrame(ch, now, dt) {
    const S = (ch.s.sheet ||= makeSheet()), a = turnAt(ch.p);
    if (S.W !== ch.AR || !S.links.length) resize(S, ch.AR, 1, a);
    // a big jump (the page opening mid-chapter, a capture) lays the sheet straight where it should be
    if (!S.posed || Math.abs(a - S.a) > 0.2) pose(S, a);
    const prev = S.a;
    S.a = a;
    // the hand holds the free edge where the pointer is (near the bottom corner otherwise); at rest, the corner
    // nearest the hand lifts a little
    const fineP = ch.ptr.on > 0.5;
    S.cy.to(fineP ? clamp(1 - ch.ptr.v, 0.06, 0.94) : 0.82);
    if (fineP && a < 0.02 && S.flick.rest) S.flick.to(0.035 * ch.ptr.on * clamp((ch.ptr.u - 0.55) / 0.45, 0, 1));
    else if (S.flick.target > 0 && S.flick.target < 0.05) S.flick.to(0);
    tick(S, dt || 1 / 60);
    footprint(S);
    steer(ch);
    if (prev < GONE && a >= GONE && ch.sound?.ctx && live(ch)) playFlap(ch.sound, tuned('curl', CURL));
    // dust off the free edge while it moves
    if (live(ch) && !lite && Math.abs(a - prev) > 1e-4 && Math.random() < 0.5) {
      const m = Math.random(), T = id(N, 0) * 3, B = id(N, 1) * 3, X = S.X;
      const [sx, sy] = project(S, X[T] + (X[B] - X[T]) * m, X[T + 1] + (X[B + 1] - X[T + 1]) * m, X[T + 2] + (X[B + 2] - X[T + 2]) * m);
      if (sx > 0 && sx < ch.AR) mote(ch, (sx / ch.AR) * ch.W, (1 - sy) * ch.H, rand(-30, 30), rand(-30, 10));
    }
  },

  step(ch, c, dt) {
    const P = ch.parts;
    for (let i = P.length - 1; i >= 0; i--) {
      const s = P[i];
      s.age += dt;
      if (s.age >= s.life) { P.splice(i, 1); continue; }
      const h = 1 - s.age / s.life;
      s.vx += Math.sin(s.age * 4 + s.r * 9) * 12 * dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      c.fillStyle = `rgba(255,248,235,${(h * 0.55).toFixed(3)})`;
      c.beginPath(); c.arc(s.x, s.y, s.r, 0, 6.283); c.fill();
    }
  },

  // the quad draws the finished design; the sheet is drawn over it by drawGL
  fs: `
void main() {
  vec2 uv = vUv + uQuake * vec2(sin(uT * 61.), cos(uT * 53.)) * .0015;
  o = vec4(texture(uFinal, uv).rgb, 1.);
}`,
};

export default curl;
