/* Lightning: four bolts are grown as branching random walks from above the page to a target. Each bolt gets a
   distance field (a chamfer distance transform on a coarse grid), packed one bolt per channel into a float
   texture. When scroll progress crosses a bolt's moment it strikes: the bolt flashes and the reveal spreads
   outward from the channel it burned. Click to call down your own (up to four, in a second texture).
   Flashes are brief, small, and rate-limited; with reduced motion on, this chapter cross-fades like the rest. */
import { fbm, rng, ign, rand, lite, fine, DONE } from './core.js';

const STRIKES = [
  { u: 0.36, v: 0.48, p: 0.03, seed: 21 },
  { u: 0.8, v: 0.3, p: 0.16, seed: 37 },
  { u: 0.14, v: 0.2, p: 0.29, seed: 52 },
  { u: 0.62, v: 0.07, p: 0.42, seed: 68 },
];
const JIT = 0.3;     // fbm roughness of the reveal edge
const OPEN = 0.012;  // how wide the channel is the instant it strikes

/* A bolt: a jagged walk toward the target that throws off branches. Points are in aspect units, origin bottom-left. */
function walk(r, x, y, tx, ty, steps, w, out, depth) {
  const pts = [[x, y]];
  for (let i = 0; i < steps; i++) {
    const dist = Math.hypot(tx - x, ty - y), L = dist / (steps - i);
    const ang = Math.atan2(ty - y, tx - x) + (r() - 0.5) * 1.5;
    x += Math.cos(ang) * L * (0.8 + r() * 0.5); y += Math.sin(ang) * L * (0.8 + r() * 0.5);
    if (i === steps - 1) { x = tx; y = ty; }
    pts.push([x, y]);
    if (depth < 2 && i > 1 && i < steps - 2 && r() < (depth ? 0.12 : 0.22)) {
      const bang = Math.atan2(ty - y, tx - x) + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.7);
      const bl = dist * (0.25 + r() * 0.35);
      walk(r, x, y, x + Math.cos(bang) * bl, y + Math.sin(bang) * bl, 4 + ((r() * 6) | 0), w * 0.55, out, depth + 1);
    }
  }
  out.push({ pts, w });
}
function bolt(r, tx, ty) {
  const out = [];
  walk(r, tx + (r() - 0.5) * 0.6, 1.05, tx, ty, 18 + ((r() * 8) | 0), 1, out, 0);
  return out;
}

/* Distance from every grid cell to the bolt, written into one channel of arr (aspect units). */
function field(S, arr, chn, polys, AR) {
  const { gw, gh } = S, d = new Float32Array(gw * gh).fill(1e6);
  for (const { pts } of polys) for (let k = 1; k < pts.length; k++) {
    const i1 = (pts[k - 1][0] / AR) * gw - 0.5, j1 = pts[k - 1][1] * gh - 0.5;
    const i2 = (pts[k][0] / AR) * gw - 0.5, j2 = pts[k][1] * gh - 0.5;
    const n = Math.ceil(Math.max(Math.abs(i2 - i1), Math.abs(j2 - j1)) * 2) + 1;
    for (let s = 0; s <= n; s++) {
      const i = Math.round(i1 + ((i2 - i1) * s) / n), j = Math.round(j1 + ((j2 - j1) * s) / n);
      if (i >= 0 && j >= 0 && i < gw && j < gh) d[j * gw + i] = 0;
    }
  }
  const D = Math.SQRT2;
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const k = j * gw + i;
    let v = d[k];
    if (i > 0) v = Math.min(v, d[k - 1] + 1);
    if (j > 0) {
      v = Math.min(v, d[k - gw] + 1);
      if (i > 0) v = Math.min(v, d[k - gw - 1] + D);
      if (i < gw - 1) v = Math.min(v, d[k - gw + 1] + D);
    }
    d[k] = v;
  }
  for (let j = gh - 1; j >= 0; j--) for (let i = gw - 1; i >= 0; i--) {
    const k = j * gw + i;
    let v = d[k];
    if (i < gw - 1) v = Math.min(v, d[k + 1] + 1);
    if (j < gh - 1) {
      v = Math.min(v, d[k + gw] + 1);
      if (i < gw - 1) v = Math.min(v, d[k + gw + 1] + D);
      if (i > 0) v = Math.min(v, d[k + gw - 1] + D);
    }
    d[k] = v;
  }
  const sc = 1 / gh;
  for (let k = 0; k < d.length; k++) arr[k * 4 + chn] = Math.min(d[k] * sc, 4);
}

function upload(ch, which) {
  const gl = ch.gl, S = ch.s;
  if (!gl || !S.tex || !S[which]) return;
  gl.activeTexture(which === 'A' ? gl.TEXTURE2 : gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, S.tex[which]);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, S.gw, S.gh, 0, gl.RGBA, gl.FLOAT, S[which]);
}

function spark(ch, x, y, b) {
  const a = rand(0, 6.283), s = rand(80, 320) * b;
  ch.spawn({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60 * b, age: 0, life: rand(0.25, 0.7), w: rand(0.6, 1.5) });
}

/* Brightness of a bolt: a hard hit that restrikes twice, then a faint flickering residue that fades with scroll. */
function glow(t, dp, now, i) {
  const flick = 0.75 + 0.25 * Math.sin(now * 0.031 + i * 1.7) * Math.sin(now * 0.017 + i);
  const rest = 0.2 * flick * Math.exp(-Math.max(0, dp) * 7);
  const hit = t >= 0 && t < 1400 ? Math.exp(-t / 260) * (t < 280 && ((t / 70) | 0) % 2 ? 0.45 : 1) : 0;
  return Math.min(1.2, rest + hit);
}

function strike(ch, now, polys, which, i) {
  const S = ch.s;
  S['strike' + which][i] = now;
  if (now - S.flashAt > 420) S.flashAt = now;          // never more than ~2 flashes a second
  const pts = polys.flatMap((p) => p.pts), end = polys[polys.length - 1].pts.at(-1);
  for (let k = 0; k < 18; k++) spark(ch, end[0] * ch.H, (1 - end[1]) * ch.H, 1.6);
  for (let k = 0; k < 20; k++) { const [x, y] = pts[(Math.random() * pts.length) | 0]; spark(ch, x * ch.H, (1 - y) * ch.H, 0.8); }
}

function sample(S, arr, u, v, c) {
  const i = Math.min(S.gw - 1, Math.max(0, Math.floor(u * S.gw))), j = Math.min(S.gh - 1, Math.max(0, Math.floor(v * S.gh)));
  return arr[(j * S.gw + i) * 4 + c];
}

const lightning = {
  id: 'lightning',
  num: '04',
  label: 'Lightning',
  hud: 'Draft struck',
  hint: 'Scroll to strike the draft',
  clickHint: 'the paper to call down a bolt',
  clip: (k) => `inset(${k}% 0 0 0)`,
  maxClicks: 4,
  uniforms: ['uPA', 'uPB', 'uIgnB', 'uGA', 'uGB', 'uFlash'],
  samplers: { uBoltA: 2, uBoltB: 3 },
  theme: {
    accent: '#a78bfa', accent2: '#e9ddff', onAccent: '#160b33', seed: 15,
    glowA: 'rgba(167,139,250,.12)', glowB: 'rgba(250,236,140,.05)',
    kicker: 'Experiment · Strike the draft',
    draft: ['Strike while', "it's hot?"], final: ['Strike while', "it's hot."],
    aside: 'faster!',
    sub: 'One clear idea beats a page of maybes. Wait for it, then let it hit.',
    note: ['v0.7', 'too slow.', 'strike it.'],
    chips: [['Drafts struck', '42'], ['Shipped', '12']],
  },
  home: () => ({ u: 0.5, v: 2, p0: 0, born: 0 }),     // unused: the bolts are the sources

  initGL(ch, gl) {
    const mk = () => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    ch.s.tex = { A: mk(), B: mk() };
  },

  resize(ch) {
    const S = ch.s, G = lite ? 6 : 4;
    S.gw = Math.max(8, Math.ceil(ch.W / G)); S.gh = Math.max(8, Math.ceil(ch.H / G));
    S.A = new Float32Array(S.gw * S.gh * 4);
    S.B = new Float32Array(S.gw * S.gh * 4).fill(4);
    S.clicks ||= [null, null, null, null];
    S.lit ||= [false, false, false, false];
    S.strikeA ||= [-1e9, -1e9, -1e9, -1e9];
    S.strikeB ||= [-1e9, -1e9, -1e9, -1e9];
    S.gA = [0, 0, 0, 0]; S.gB = [0, 0, 0, 0];
    S.flashAt ??= -1e9; S.flash = 0; S.arcs = []; S.arcT = 0;
    S.bolts = STRIKES.map((b) => bolt(rng(b.seed), b.u * ch.AR, b.v));
    S.bolts.forEach((polys, i) => field(S, S.A, i, polys, ch.AR));
    S.clicks.forEach((polys, i) => polys && field(S, S.B, i, polys, ch.AR));
    // fast enough that every cell has been reached by DONE, whichever bolt gets there first
    let K = 0;
    for (let k = 0; k < S.gw * S.gh; k++) {
      let best = Infinity;
      for (let i = 0; i < 4; i++) best = Math.min(best, (S.A[k * 4 + i] + JIT * 0.55 - OPEN) / (DONE - STRIKES[i].p));
      if (best > K) K = best;
    }
    ch.K = K * 1.04;
    upload(ch, 'A'); upload(ch, 'B');
  },

  fuel(ch, u, v, now) {
    const S = ch.s;
    if (!S.A) return -10;
    const n = fbm(u * ch.AR * 3, v * 3), j = (n - 0.5) * JIT;
    let d = -10;
    STRIKES.forEach((b, c) => {
      if (ch.p < b.p) return;
      const dA = sample(S, S.A, u, v, c);
      d = Math.max(d, (ch.p - b.p) * ch.K + OPEN - (dA + j * Math.min(dA * 20, 1)));
    });
    for (const s of ch.seeds) {
      if (!s.born || s.ch == null) continue;
      const dB = sample(S, S.B, u, v, s.ch);
      d = Math.max(d, Math.max(ch.p - s.p0, 0) * ch.K + ign(s, now) + OPEN - (dB + j * Math.min(dB * 20, 1)));
    }
    return d;
  },

  onFrame(ch, now) {
    const S = ch.s;
    if (!S.A) return;
    STRIKES.forEach((b, i) => {
      const on = ch.p >= b.p;
      if (on && !S.lit[i]) { S.lit[i] = true; if (S.armed) strike(ch, now, S.bolts[i], 'A', i); }
      else if (!on && ch.p < b.p - 0.004) S.lit[i] = false;
      S.gA[i] = on ? glow(now - S.strikeA[i], ch.p - b.p, now, i) : 0;
    });
    for (let c = 0; c < 4; c++) {
      const seed = ch.seeds.find((s) => s.born && s.ch === c);
      S.gB[c] = seed ? glow(now - S.strikeB[c], ch.p - seed.p0, now, c + 4) : 0;
    }
    S.armed = true;                                      // bolts already passed on load don't all strike at once
    S.flash = Math.exp(-Math.max(0, now - S.flashAt) / 110);
  },

  onClick(ch, seed, q, now) {
    const S = ch.s;
    const used = new Set(ch.seeds.filter((s) => s !== seed && s.ch != null).map((s) => s.ch));
    seed.ch = [0, 1, 2, 3].find((c) => !used.has(c)) ?? 0;
    S.clicks[seed.ch] = bolt(rng((now * 1000) | 0), q.u * ch.AR, q.v);
    field(S, S.B, seed.ch, S.clicks[seed.ch], ch.AR);
    upload(ch, 'B');
    strike(ch, now, S.clicks[seed.ch], 'B', seed.ch);
  },

  reset(ch) { const S = ch.s; S.lit = [false, false, false, false]; S.armed = false; },

  setUniforms(ch, gl, loc, now) {
    const S = ch.s;
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, S.tex.A);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, S.tex.B);
    const pb = [-1, -1, -1, -1], ib = [0, 0, 0, 0];
    for (const s of ch.seeds) if (s.born && s.ch != null) { pb[s.ch] = s.p0; ib[s.ch] = ign(s, now); }
    gl.uniform4f(loc.uPA, STRIKES[0].p, STRIKES[1].p, STRIKES[2].p, STRIKES[3].p);
    gl.uniform4fv(loc.uPB, pb);
    gl.uniform4fv(loc.uIgnB, ib);
    gl.uniform4fv(loc.uGA, S.gA);
    gl.uniform4fv(loc.uGB, S.gB);
    gl.uniform1f(loc.uFlash, S.flash);
  },

  emit(ch, x, y, d, act) {
    if (d > -0.003 && d < 0.012 && Math.random() < act * 0.3) spark(ch, x, y, 0.6);
  },

  step(ch, c, dt) {
    const P = ch.parts;
    c.globalCompositeOperation = 'lighter';
    c.lineCap = 'round';
    for (let i = P.length - 1; i >= 0; i--) {
      const s = P[i];
      s.age += dt;
      if (s.age >= s.life) { P.splice(i, 1); continue; }
      const h = 1 - s.age / s.life;
      s.vy += 650 * dt; s.vx *= 1 - 1.5 * dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      c.strokeStyle = `rgba(${(200 + 55 * h) | 0},${(185 + 70 * h) | 0},255,${h.toFixed(3)})`; c.lineWidth = s.w;
      c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(s.x - s.vx * 0.025, s.y - s.vy * 0.025); c.stroke();
    }
  },

  overlay(ch, c, dt, now) {
    const S = ch.s;
    if (!S.bolts) return;
    c.globalCompositeOperation = 'lighter';
    c.lineCap = 'round'; c.lineJoin = 'round';
    const H = ch.H;
    const draw = (polys, g) => {
      if (!polys || g < 0.03) return;
      for (const { pts, w } of polys) {
        c.beginPath();
        pts.forEach(([x, y], i) => (i ? c.lineTo(x * H, (1 - y) * H) : c.moveTo(x * H, (1 - y) * H)));
        c.strokeStyle = `rgba(150,120,255,${(0.22 * g).toFixed(3)})`; c.lineWidth = 8 * w; c.stroke();
        c.strokeStyle = `rgba(205,190,255,${(0.6 * g).toFixed(3)})`; c.lineWidth = 2.8 * w; c.stroke();
        c.strokeStyle = `rgba(255,255,255,${Math.min(1, g).toFixed(3)})`; c.lineWidth = 1.1 * w + 0.3; c.stroke();
      }
    };
    S.bolts.forEach((polys, i) => draw(polys, S.gA[i]));
    S.clicks.forEach((polys, i) => draw(polys, S.gB[i]));

    // static: little arcs jump off the cursor while it's over unstruck paper
    if (fine && ch.ptr.on > 0.3) {
      if (now - S.arcT > 70) {
        S.arcT = now; S.arcs = [];
        const px = ch.ptr.u * ch.W, py = (1 - ch.ptr.v) * ch.H;
        if (lightning.fuel(ch, ch.ptr.u, ch.ptr.v, now) < 0) for (let a = 0; a < 2; a++) {
          const ang = rand(0, 6.283), len = rand(12, 34), pts = [[px, py]];
          for (let k = 1; k <= 5; k++) pts.push([px + Math.cos(ang) * len * (k / 5) + rand(-4, 4), py + Math.sin(ang) * len * (k / 5) + rand(-4, 4)]);
          S.arcs.push(pts);
        }
      }
      c.strokeStyle = `rgba(215,200,255,${(0.75 * ch.ptr.on).toFixed(3)})`; c.lineWidth = 1;
      for (const pts of S.arcs) { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke(); }
    }
  },

  fs: `
uniform sampler2D uBoltA, uBoltB;           // distance to each bolt, one bolt per channel
uniform vec4 uPA, uPB, uIgnB, uGA, uGB;     // progress at strike · click ignition · bolt glow
uniform float uFlash;

void main() {
  vec2 a = vec2(vUv.x * uAr, vUv.y);
  float n = fbm(a * 3.), j = (n - .5) * ${JIT.toFixed(2)};
  vec4 dA = texture(uBoltA, vUv), dB = texture(uBoltB, vUv);
  // a bolt's channel opens the instant it strikes (no noise right at the core), then the reveal spreads
  vec4 fa = mix(vec4(-10.), (uP - uPA) * uK + ${OPEN} - (dA + j * min(dA * 20., vec4(1.))), step(uPA, vec4(uP)));
  vec4 fb = mix(vec4(-10.), max(uP - uPB, 0.) * uK + uIgnB + ${OPEN} - (dB + j * min(dB * 20., vec4(1.))), step(vec4(-.5), uPB));
  vec4 fm = max(fa, fb);
  float d = max(max(fm.x, fm.y), max(fm.z, fm.w));
  float torch = uPtrOn * smoothstep(.12, 0., distance(a, uPtr));

  // ahead: the paper takes an electric scorch, then chars
  vec3 dr = texture(uDraft, vUv).rgb;
  float sc = smoothstep(-.1, 0., d);
  dr = mix(dr, dr * vec3(.62, .58, .7), sc * sc);
  dr = mix(dr, vec3(.06, .05, .1), smoothstep(-.022, 0., d));

  // behind: the final, split into colour fringes near the edge, with a violet afterglow
  float e = d > 0. ? exp(-d * 28.) : 0.;
  vec2 ca = vec2(.005, 0.) * e;
  vec3 fin = vec3(texture(uFinal, vUv + ca).r, texture(uFinal, vUv).g, texture(uFinal, vUv - ca).b);
  fin += vec3(.32, .22, .62) * e * .3;

  vec3 col = mix(dr, fin, smoothstep(0., .004, d));

  // the edge crackles: violet into white
  float fl = .55 + .45 * vn(a * 46. + vec2(uT * 9., -uT * 13.));
  float k = clamp(exp(-abs(d) * 210.) * fl * 1.3, 0., 1.);
  col += vec3(.55, .42, 1.) * k * .85 + vec3(1.) * k * k * k * .9;

  // bloom around the bolts while they strike, static under the cursor, and a brief flash
  vec4 gA = uGA * exp(-dA * 70.), gB = uGB * exp(-dB * 70.);
  col += vec3(.5, .42, 1.) * (gA.x + gA.y + gA.z + gA.w + gB.x + gB.y + gB.z + gB.w) * .4;
  col += vec3(.45, .4, .7) * torch * .12 * step(d, 0.);
  col += vec3(.8, .8, 1.) * uFlash * .22;
  o = vec4(col, 1.);
}`,
};

export default lightning;
