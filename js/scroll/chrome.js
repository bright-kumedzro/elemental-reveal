/* chrome(): liquid chrome type. A heading starts as dark metal; as you scroll, warm light flows into the letters from
   the left and cool light from the right like reflections sliding over polished metal, a soft sheen and a few crisp
   glints sweep along the baseline, and the type settles into silver-blue chrome that keeps drifting, very slowly,
   like liquid, for as long as it is on screen.

     import { chrome } from '@brightkumedzro/reveal/scroll';
     chrome('#title');                                         // defaults: amber from the left, blue from the right
     chrome('.big', { warm: '#ff5a1f', cool: '#2f7bff' });     // your own two lights

   Options
     warm     '#ff8a3d'   the light flowing in from the left (any CSS colour)
     cool     '#3d7bff'   the light from the right, and the tint the type settles into
     start    0.85        the element's top, as a share of the viewport height, when the light starts flowing
     end      0.3         where its top is when the type has settled
     shimmer  1           strength of the idle sheen once settled (0 turns it off)
     glow     1           strength of the bloom around the glints
   Returns { stop() }, which removes the canvas and gives the text back its own colour. The text stays real text, so
   screen readers, selection and copy-paste are unaffected. It is drawn in the element's own font, size, weight and
   letter-spacing, and redrawn when the element resizes or web fonts load. Scroll sets the arc (dark, flow, glint,
   settled) through a critically damped spring, so a jump in scroll never pops; the reflections themselves drift
   continuously in time. With reduced motion the type is shown settled and still; without WebGL2 it falls back to a
   chrome gradient clipped to the text.
   How it is built: the text is rasterised once (on resize or font load) into an anti-aliased mask, an exact signed
   distance field (Felzenszwalb) gives a round bevel with smooth normals, and a soft blur gives the bloom. After that
   the CPU only sets a few uniforms per frame.
   Like the reveals, a heading only holds a WebGL context while it is on or near the screen, within the page-wide
   budget in ../gpu.js, and only animates while visible. */
import { resolve, enter, reduced, clamp, stopAll } from './core.js';
import { holder } from '../gpu.js';

const VS = `#version 300 es
layout(location = 0) in vec2 p; out vec2 uv;
void main() { uv = vec2(p.x * .5 + .5, .5 - p.y * .5); gl_Position = vec4(p, 0., 1.); }`;

const FS = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D M;           // full res. r: letters (anti-aliased), g: height within the line
uniform sampler2D N;           // half res.  rg: bevel normal xy, b: bloom
uniform float P, T, SH, GL;    // progress (already eased), time, idle strength, glow
uniform vec3 W, C;
float hash(vec2 q) { return fract(sin(dot(q, vec2(12.9898, 78.233))) * 43758.5453); }
float bell(float x, float a, float b) { return smoothstep(a, mix(a, b, .35), x) * (1. - smoothstep(mix(a, b, .65), b, x)); }
float gau(float x, float w) { x /= w; return exp(-x * x); }

// the environment the metal reflects: bright sky, a soft horizon, a dark band, then bounce light; warm on the left, cool on the right
vec3 env(vec2 r, float tintAmt, float settle) {
  float d = r.y - mix(.5, .56, settle);
  vec3 tint = mix(W, C, smoothstep(.1, .9, r.x));
  vec3 silver = mix(vec3(.74, .80, .95), C * .6 + .5, .5);
  vec3 sky = mix(vec3(.20, .23, .31), vec3(.96, .98, 1.), smoothstep(.02, -.5, d));
  sky = mix(sky, sky * (tint * 1.25 + .3), tintAmt * .6);
  vec3 low = mix(tint * 1.15 + .05, silver * .8, settle);
  vec3 ground = mix(vec3(.05, .055, .07), low, exp(-max(d, 0.) * 3.2) * .85 + .1 * smoothstep(.2, .7, d));
  ground = mix(ground, ground * (.35 + tint), tintAmt * .6);
  vec3 col = mix(sky, ground, smoothstep(-.03, .05, d));
  col += vec3(1., .97, .93) * gau(d, .028) * .55;                // the horizon, soft
  return col;
}

void main() {
  vec2 ma = texture(M, uv).rg;
  float a = ma.r;
  vec4 nb = texture(N, uv);
  vec2 nxy = (nb.rg - .5) * 2.;
  vec3 n = vec3(nxy, sqrt(max(1. - dot(nxy, nxy), .03)));
  float e = ma.g * 1.65 - .15;                                     // 0 at the cap height, 1 at the baseline, 1.5 below it
  float t = T;

  float settle = smoothstep(.7, 1., P);
  float flow = bell(P, .04, 1.05) * (1. - settle * .8);

  // two soft fronts of light: warm from the left, cool from the right; their edges ripple
  float f = P * 1.7 - .45, rip = sin(e * 3. + t * .4) * .03 + sin(uv.x * 5. - t * .3) * .015;
  float wL = smoothstep(uv.x - .4 + rip, uv.x + .06 + rip, f);
  float cL = smoothstep((1. - uv.x) - .4 - rip, (1. - uv.x) + .06 - rip, f * .92);
  float lit = max(wL, cL);
  float tintAmt = clamp(flow * 1.6, 0., 1.) * .85 + .15;

  // the environment is warped by a slow, smooth field that evolves in time, so the reflections flow like liquid
  vec2 wp = vec2(uv.x * 2.6, e * 1.5);
  vec2 warp = vec2(sin(wp.y * 2.1 + t * .42 + sin(wp.x * 1.3 - t * .26) * 1.4),
                   sin(wp.x * 1.7 - t * .27 + sin(wp.y * 2.3 + t * .23) * 1.2));
  float amp = mix(.085, .12, flow);
  vec2 r = vec2(uv.x * .85 + nxy.x * .9 + (.5 - P) * .35 + t * .012, e * .72 + nxy.y * .95) + warp * amp;
  vec3 metal = env(r, tintAmt, settle);
  metal *= .8 + .3 * n.z;

  float edge = 1. - n.z, fres = edge * edge * (.6 + .4 * edge);
  vec3 rim = mix(vec3(.78, .85, 1.), mix(W, C, uv.x) * 1.1 + .35, .3 * flow);
  vec3 dark = vec3(.03, .034, .044) + rim * fres * .22;
  vec3 col = mix(dark, metal, lit) + rim * fres * .32 * lit;

  // light: one soft sheen and a few crisp glints sweep along the baseline as it settles, then a slow idle drift
  float sx = mix(-.25, 1.25, smoothstep(.38, .94, P));
  float gs = bell(P, .34, .97);
  float ix = fract(t * .075) * 1.7 - .35, idle = settle * SH;
  float base = .35 + .65 * gau(e - .95, .3);
  float sb = pow(max(dot(n, normalize(vec3(0., -.45, .9))), 0.), 4.5);
  float env1 = gs * gau(uv.x - sx, .2) + idle * .3 * gau(uv.x - ix, .26);
  vec3 lt = vec3(1., .97, .93);
  col += lt * sb * env1 * base * .8 * lit;
  float c1 = pow(max(dot(n, normalize(vec3(-.3, -.5, .8))), 0.), 40.);
  float c2 = pow(max(dot(n, normalize(vec3(.25, .55, .8))), 0.), 40.);
  float env2 = gs * gau(uv.x - sx + .04, .075) + idle * .5 * gau(uv.x - ix, .09);
  col += lt * (c1 * .8 + c2 * (.5 + base)) * env2 * 2.2 * lit;

  // bloom: soft and even, only where the light is
  float hl = gs * gau(uv.x - sx, .17) * (.4 + .6 * base) + idle * .22 * gau(uv.x - ix, .2) + settle * .02 + flow * lit * .05;
  vec3 hc = mix(vec3(1., .88, .74), vec3(.76, .85, 1.), smoothstep(.2, .8, uv.x));
  float halo = nb.b * hl * GL * .85;

  col = (1. - exp(-col * 1.55)) * 1.06;                            // soft shoulder: no clipping, no harsh whites
  col = mix(col, vec3(dot(col, vec3(.3, .59, .11))), .1);
  halo = 1. - exp(-halo * 1.4);
  vec3 rgb = col * a + hc * halo * (1. - a);
  float al = clamp(a + halo * (1. - a), 0., 1.);
  rgb += (hash(gl_FragCoord.xy) - .5) / 255. * step(.004, al) * al;
  o = vec4(rgb, al);
}`;

/* Separable box blur on a single channel; two or three passes make it close to a gaussian. */
function blur(src, w, h, r, passes = 2) {
  r = Math.max(1, Math.round(r));
  const tmp = new Float32Array(w * h), out = new Float32Array(src), k = 1 / (2 * r + 1);
  for (let pass = 0; pass < passes; pass++) {
    for (let y = 0; y < h; y++) {                 // horizontal: out -> tmp
      let s = 0; const row = y * w;
      for (let x = -r; x <= r; x++) s += out[row + clamp(x, 0, w - 1)];
      for (let x = 0; x < w; x++) {
        tmp[row + x] = s * k;
        s += out[row + Math.min(w - 1, x + r + 1)] - out[row + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {                 // vertical: tmp -> out
      let s = 0;
      for (let y = -r; y <= r; y++) s += tmp[clamp(y, 0, h - 1) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = s * k;
        s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
  }
  return out;
}

/* Exact squared Euclidean distance to the nearest "feature" pixel (Felzenszwalb & Huttenlocher), two 1-D passes. */
function edt(feat, w, h) {
  const INF = 1e9, out = new Float32Array(w * h), n = Math.max(w, h);
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  const run = (len) => {
    let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
    for (let q = 1; q < len; q++) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
  };
  for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) f[y] = feat[y * w + x] ? 0 : INF; run(h); for (let y = 0; y < h; y++) out[y * w + x] = d[y]; }
  for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) f[x] = out[y * w + x]; run(w); for (let x = 0; x < w; x++) out[y * w + x] = d[x]; }
  return out;
}

/* Draw the element's text, word by word where the browser laid it out, at `rs` pixels per CSS pixel. Returns
     full: anti-aliased letters + height within the line, at full resolution (RG8)
     half: bevel normal (from a smoothed signed distance field) + bloom, at half resolution (RGB8). */
function rasterise(el, pad, rs, w, h) {
  const box = el.getBoundingClientRect();
  const mask = document.createElement('canvas'), line = document.createElement('canvas');
  mask.width = line.width = w; mask.height = line.height = h;
  const mc = mask.getContext('2d', { willReadFrequently: true }), lc = line.getContext('2d', { willReadFrequently: true });
  mc.scale(rs, rs); lc.scale(rs, rs);
  mc.fillStyle = '#fff';
  let size = 0;
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  while (walk.nextNode()) {
    const t = walk.currentNode, cs = getComputedStyle(t.parentElement);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    mc.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    if ('letterSpacing' in mc) mc.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
    const fs = parseFloat(cs.fontSize); size = Math.max(size, fs);
    const capM = mc.measureText('H'), cap = capM.actualBoundingBoxAscent;
    for (const word of t.nodeValue.matchAll(/\S+/g)) {
      range.setStart(t, word.index); range.setEnd(t, word.index + word[0].length);
      const rects = range.getClientRects();
      if (!rects.length) continue;
      const r = rects[0], m = mc.measureText(word[0]);
      const x = r.left - box.left + pad, top = r.top - box.top + pad;
      const base = top + (m.fontBoundingBoxAscent ?? fs * 0.8) + (r.height - ((m.fontBoundingBoxAscent ?? fs * .8) + (m.fontBoundingBoxDescent ?? fs * .2))) / 2;
      mc.fillText(word[0], x, base);
      // height within the line: a smooth ramp from just above the cap height to below the baseline (shader: e = a * 1.65 - .15)
      const g = lc.createLinearGradient(0, base - cap * 1.15, 0, base + cap * 0.5);
      g.addColorStop(0, 'rgb(0,0,0)'); g.addColorStop(1, 'rgb(255,0,0)');
      lc.fillStyle = g;
      lc.fillRect(x - fs * 0.2, base - cap * 1.2, r.width + fs * 0.4, cap * 1.75);
    }
  }
  const md = mc.getImageData(0, 0, w, h).data, ld = lc.getImageData(0, 0, w, h).data;
  const n = w * h, full = new Uint8Array(n * 2);
  for (let i = 0; i < n; i++) { full[i * 2] = md[i * 4 + 3]; full[i * 2 + 1] = ld[i * 4 + 3] ? ld[i * 4] : 0; }

  // half resolution: the bevel and bloom are smooth, so they don't need more
  const hw = Math.ceil(w / 2), hh = Math.ceil(h / 2), hn = hw * hh, al = new Float32Array(hn), inside = new Uint8Array(hn), outside = new Uint8Array(hn);
  for (let y = 0; y < hh; y++) for (let x = 0; x < hw; x++) {
    const x1 = Math.min(w - 1, x * 2 + 1), y1 = Math.min(h - 1, y * 2 + 1);
    const v = (md[(y * 2 * w + x * 2) * 4 + 3] + md[(y * 2 * w + x1) * 4 + 3] + md[(y1 * w + x * 2) * 4 + 3] + md[(y1 * w + x1) * 4 + 3]) / 1020;
    al[y * hw + x] = v; inside[y * hw + x] = v > 0.5 ? 1 : 0; outside[y * hw + x] = v > 0.5 ? 0 : 1;
  }
  const hs = size * rs / 2;                          // font size in half-res pixels
  const Rb = Math.max(3, hs * 0.085);                // bevel width
  const din = edt(outside, hw, hh), dout = edt(inside, hw, hh), sd = new Float32Array(hn);
  for (let i = 0; i < hn; i++) sd[i] = clamp(inside[i] ? Math.sqrt(din[i]) - 0.5 : 0.5 - Math.sqrt(dout[i]), -Rb * 2, Rb * 3);
  const sm = blur(sd, hw, hh, Rb * 0.3, 2);          // smoothing the field removes the lumps and creases of the raw distance
  const bloom = blur(al, hw, hh, hs * 0.075, 3);
  const half = new Uint8Array(hn * 3), maxTilt = 1.2;
  for (let y = 0; y < hh; y++) for (let x = 0; x < hw; x++) {
    const i = y * hw + x;
    const gx = (sm[y * hw + Math.min(hw - 1, x + 1)] - sm[y * hw + Math.max(0, x - 1)]) * 0.5;
    const gy = (sm[Math.min(hh - 1, y + 1) * hw + x] - sm[Math.max(0, y - 1) * hw + x]) * 0.5;
    const tt = clamp(sm[i] / Rb), tilt = maxTilt * (1 - tt) ** 1.7, s = Math.sin(tilt);
    // the field grows inward, so the surface leans the other way
    half[i * 3] = clamp(0.5 - gx * s * 0.5) * 255 + 0.5;
    half[i * 3 + 1] = clamp(0.5 - gy * s * 0.5) * 255 + 0.5;
    half[i * 3 + 2] = Math.min(255, bloom[i] * 255 * 1.5);
  }
  return { full, half, hw, hh, size };
}

function hex(c) {
  const k = document.createElement('canvas').getContext('2d');
  k.fillStyle = c; k.fillRect(0, 0, 1, 1);
  const [r, g, b] = k.getImageData(0, 0, 1, 1).data;
  return [r / 255, g / 255, b / 255];
}

function fallback(el, warm, cool, start, end) {
  const s = el.style, keep = { bg: s.backgroundImage, clip: s.webkitBackgroundClip, bclip: s.backgroundClip, color: s.color, size: s.backgroundSize, pos: s.backgroundPosition };
  s.backgroundImage = `linear-gradient(100deg, ${warm} 0%, #f4f6fa 22%, #6b7385 38%, #f4f6fa 50%, ${cool} 62%, #e8ecf5 78%, #5a6273 90%, ${cool} 100%)`;
  s.backgroundSize = '300% 100%';
  s.webkitBackgroundClip = 'text'; s.backgroundClip = 'text'; s.color = 'transparent';
  const stop = enter(el, (p) => { s.backgroundPosition = `${(1 - p) * 100}% 50%`; }, { from: start, to: end });
  return () => { stop(); Object.assign(s, { backgroundImage: keep.bg, webkitBackgroundClip: keep.clip, backgroundClip: keep.bclip, color: keep.color, backgroundSize: keep.size, backgroundPosition: keep.pos }); };
}

const SETTLED_T = 7.3;     // the moment of the drift shown for reduced motion

function one(el, { warm = '#ff8a3d', cool = '#3d7bff', start = 0.85, end = 0.3, shimmer = 1, glow = 1 } = {}) {
  const s = el.style, keep = { pos: s.position, color: s.color, fill: s.webkitTextFillColor };
  let canvas = null, gl = null, U = null, texM = null, texN = null, noGL = false, fb = null, losses = [];
  let raster = null;       // the rasterised text, kept while the context comes and goes
  // scroll sets the target; p follows it through a critically damped spring (v is its velocity)
  let target = reduced ? 1 : 0, p = target, v = 0, raf = 0, visible = false, near = false, last = 0, dead = false, fonts = false, ready = false;
  const t0 = performance.now();

  // the plain chrome gradient, only while a context is wanted but can't be had (no WebGL2, the budget is full, lost)
  const fallbackOn = () => { if (!fb && !dead) fb = fallback(el, warm, cool, start, end); };
  const fallbackOff = () => { if (fb) { fb(); fb = null; } };

  /* ---------- the WebGL context: held only while the heading is on or near the screen (see ../gpu.js) ---------- */
  const h = holder({ kind: 'chrome', release: () => drop(true), retry: () => acquire() });

  function create() {
    const c = document.createElement('canvas');
    const g = c.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false });
    if (!g) return false;
    const compile = (type, src) => { const sh = g.createShader(type); g.shaderSource(sh, src); g.compileShader(sh); if (!g.getShaderParameter(sh, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(sh)); return sh; };
    const prog = g.createProgram();
    try {
      g.attachShader(prog, compile(g.VERTEX_SHADER, VS)); g.attachShader(prog, compile(g.FRAGMENT_SHADER, FS));
      g.linkProgram(prog);
      if (!g.getProgramParameter(prog, g.LINK_STATUS)) throw new Error(g.getProgramInfoLog(prog));
    } catch (e) { console.warn('chrome: falling back', e); g.getExtension('WEBGL_lose_context')?.loseContext(); return false; }
    g.useProgram(prog);
    const vao = g.createVertexArray(); g.bindVertexArray(vao);
    const buf = g.createBuffer(); g.bindBuffer(g.ARRAY_BUFFER, buf);
    g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), g.STATIC_DRAW);
    g.enableVertexAttribArray(0); g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0);
    const mk = (unit) => {
      g.activeTexture(g.TEXTURE0 + unit);
      const t = g.createTexture(); g.bindTexture(g.TEXTURE_2D, t);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
      return t;
    };
    texM = mk(0); texN = mk(1);
    U = {}; for (const k of ['M', 'N', 'P', 'T', 'SH', 'GL', 'W', 'C']) U[k] = g.getUniformLocation(prog, k);
    g.uniform1i(U.M, 0); g.uniform1i(U.N, 1); g.uniform3fv(U.W, hex(warm)); g.uniform3fv(U.C, hex(cool));
    g.uniform1f(U.SH, reduced ? 0 : shimmer); g.uniform1f(U.GL, glow);
    canvas = c; gl = g;
    // the canvas sits over the element, a little larger so the bloom has room
    if (getComputedStyle(el).position === 'static') s.position = 'relative';
    c.setAttribute('aria-hidden', 'true');
    Object.assign(c.style, { position: 'absolute', pointerEvents: 'none', display: 'block' });
    c.addEventListener('webglcontextlost', onLost);
    fallbackOff();
    el.append(c);
    build();
    return true;
  }

  /* Give the context back: the text shows in its own colour (it's off screen) or the fallback (lost while on screen). */
  function drop(lose) {
    if (!gl) return;
    const c = canvas, g = gl;
    canvas = gl = U = texM = texN = null; ready = false;
    c.removeEventListener('webglcontextlost', onLost);
    if (lose) g.getExtension('WEBGL_lose_context')?.loseContext();
    c.remove();
    cancelAnimationFrame(raf); raf = 0;
    s.color = keep.color; s.webkitTextFillColor = keep.fill;
  }
  function onLost(e) {
    e.preventDefault();
    const t = performance.now();
    losses = losses.filter((x) => t - x < 30000); losses.push(t);
    drop(false); h.forget(); fallbackOn();
    if (losses.length < 3) setTimeout(acquire, 300);
  }
  function acquire() {
    if (dead || noGL || gl || !near || !fonts) return;
    if (losses.length >= 3 && performance.now() - losses[0] < 30000) return;
    if (!h.claim()) { if (visible) fallbackOn(); return; }   // retried when a context frees up
    if (!create()) { noGL = true; h.forget(); fallbackOn(); }
  }

  const draw = (now) => {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform1f(U.P, p); gl.uniform1f(U.T, reduced ? SETTLED_T : SETTLED_T + (now - t0) / 1000);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
  function build() {
    if (dead || !gl) return;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const fs = parseFloat(getComputedStyle(el).fontSize) || 16;
    const pad = Math.ceil(fs * 0.3), dpr = Math.min(2, window.devicePixelRatio || 1);
    // the element's border box, relative to its padding box (where absolute children are placed)
    const bl = el.clientLeft, bt = el.clientTop;
    const cw = rect.width + pad * 2, ch = rect.height + pad * 2;
    Object.assign(canvas.style, { left: `${-pad - bl}px`, top: `${-pad - bt}px`, width: `${cw}px`, height: `${ch}px` });
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    // the text is drawn at up to 2x so the edges are supersampled when the screen is 1x, within a pixel budget
    const rs = Math.max(dpr, Math.min(2, Math.sqrt(4.5e6 / (cw * ch)))), w = Math.round(cw * rs), hh = Math.round(ch * rs);
    if (!raster || raster.w !== w || raster.h !== hh) raster = { w, h: hh, ...rasterise(el, pad, rs, w, hh) };
    s.color = 'transparent'; s.webkitTextFillColor = 'transparent';
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texM);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, w, hh, 0, gl.RG, gl.UNSIGNED_BYTE, raster.full);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texN);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, raster.hw, raster.hh, 0, gl.RGB, gl.UNSIGNED_BYTE, raster.half);
    ready = true;
    draw(performance.now());
    kick();
  }
  /* One frame: ease progress with a critically damped spring, then draw. It keeps running while the heading is visible
     because the reflections drift in time; it stops the moment it is off screen. */
  const W0 = 5.5;
  const loop = (now) => {
    raf = 0;
    if (!ready || !visible || !gl) return;
    const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    for (let i = 0, n = Math.ceil(dt / 0.016); i < n; i++) {
      const d = dt / n;
      v += (W0 * W0 * (target - p) - 2 * W0 * v) * d; p += v * d;
    }
    if (Math.abs(target - p) < 0.0003 && Math.abs(v) < 0.0006) { p = target; v = 0; }
    draw(now);
    raf = requestAnimationFrame(loop);
  };
  const kick = () => { if (!reduced && visible && ready && !raf) { last = 0; raf = requestAnimationFrame(loop); } };

  const stopScroll = reduced ? () => {} : enter(el, (x) => { target = x; kick(); }, { from: start, to: end });
  const io = new IntersectionObserver((es) => {
    visible = es.some((e) => e.isIntersecting);
    h.see(visible);
    if (visible) { acquire(); kick(); }
  }, { rootMargin: '100px' });
  // within a screen of the viewport: get a context ready; more than two and a half screens away: give it back
  const nearIO = new IntersectionObserver((es) => { near = es.some((e) => e.isIntersecting); if (near) acquire(); }, { rootMargin: '100%' });
  const farIO = new IntersectionObserver((es) => { if (!es.some((e) => e.isIntersecting)) h.free(); }, { rootMargin: '250%' });
  io.observe(el); nearIO.observe(el); farIO.observe(el);
  let rz = 0;
  const ro = new ResizeObserver(() => { clearTimeout(rz); rz = setTimeout(() => { raster = null; build(); }, 90); });
  ro.observe(el);
  (document.fonts?.ready ?? Promise.resolve()).then(() => { fonts = true; raster = null; if (gl) build(); else acquire(); });

  return {
    stop() {
      dead = true; stopScroll(); io.disconnect(); nearIO.disconnect(); farIO.disconnect(); ro.disconnect(); cancelAnimationFrame(raf); clearTimeout(rz);
      h.drop(); drop(true); fallbackOff();
      s.position = keep.pos; s.color = keep.color; s.webkitTextFillColor = keep.fill;
    },
    stats: () => ({ effect: 'chrome', mode: gl ? 'gl' : fb ? 'fallback' : 'text', dpr: canvas ? canvas.width / Math.max(1, parseFloat(canvas.style.width)) : 0, visible, hasContext: !!gl }),
  };
}

/** Returns { stop() } (and stats() for debugging: one entry per element). */
export function chrome(target, opts = {}) {
  const all = resolve(target).map((el) => one(el, opts));
  return { stop: stopAll(all.map((x) => x.stop)), stats: () => all.map((x) => x.stats()) };
}

export default chrome;
