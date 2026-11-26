/* chrome(): liquid chrome type. A heading starts as dark metal; as you scroll, warm light flows into the letters from
   the left and cool light from the right like reflections sliding over polished metal, a bright glint sweeps along
   the baseline, and the type settles into silver-blue chrome with a slow shimmer.

     import { chrome } from '@brightkumedzro/reveal/scroll';
     chrome('#title');                                         // defaults: amber from the left, blue from the right
     chrome('.big', { warm: '#ff5a1f', cool: '#2f7bff' });     // your own two lights

   Options
     warm     '#ff8a3d'   the light flowing in from the left (any CSS colour)
     cool     '#3d7bff'   the light from the right, and the tint the type settles into
     start    0.85        the element's top, as a share of the viewport height, when the light starts flowing
     end      0.3         where its top is when the type has settled
     shimmer  1           strength of the idle glint once settled (0 turns it off)
     glow     1           strength of the bloom around the glints
   Returns { stop() }, which removes the canvas and gives the text back its own colour. The text stays real text, so
   screen readers, selection and copy-paste are unaffected. It is drawn in the element's own font, size, weight and
   letter-spacing, and redrawn when the element resizes or web fonts load. With reduced motion the type is shown
   settled and still; without WebGL2 it falls back to a chrome gradient clipped to the text. */
import { resolve, enter, reduced, clamp, stopAll } from './core.js';

const VS = `#version 300 es
layout(location = 0) in vec2 p; out vec2 uv;
void main() { uv = vec2(p.x * .5 + .5, .5 - p.y * .5); gl_Position = vec4(p, 0., 1.); }`;

const FS = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D M;           // r: letters, g: bevel height, b: bloom, a: height within the line (0 cap top .. 0.8 baseline)
uniform vec2 tx;               // one texel
uniform float P, T, SH, GL, BV;
uniform vec3 W, C;
float h21(vec2 q) { q = fract(q * vec2(123.34, 456.21)); q += dot(q, q + 45.32); return fract(q.x * q.y); }
float vn(vec2 q) { vec2 i = floor(q), f = fract(q); f = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 q) { float s = 0., a = .5; for (int i = 0; i < 4; i++) { s += a * vn(q); q *= 2.03; a *= .5; } return s; }
float bell(float x, float a, float b) { return smoothstep(a, mix(a, b, .35), x) * (1. - smoothstep(mix(a, b, .65), b, x)); }
// the environment the metal reflects: a cool sky over a bright horizon over warm-dark ground; warm on the left, cool on the right
vec3 env(vec2 c, float warmth, float settle) {
  float d = c.y - mix(.55, .62, settle);
  vec3 tint = mix(W, C, smoothstep(.1, .9, c.x));
  tint = mix(tint, mix(C, vec3(.75, .8, .9), .35), settle);
  vec3 sky = mix(vec3(.93, .95, 1.), vec3(.30, .35, .45) + C * .12, smoothstep(0., -.55, d));
  sky = mix(sky, sky * mix(vec3(1), tint * 1.4 + .2, .35), 1. - settle * .6);
  vec3 ground = tint * (.1 + 1.1 * exp(-d * 4.5)) * (.6 + .6 * warmth * (1. - settle)) + vec3(.6, .66, .78) * settle * exp(-d * 2.5) * .6;
  vec3 col = d < 0. ? sky : ground;
  col += vec3(1., .97, .92) * exp(-abs(d) * 38.) * .8;          // the horizon line
  return col;
}
void main() {
  vec4 m = texture(M, uv);
  float a = m.r;
  float hx = texture(M, uv + vec2(tx.x, 0)).g - texture(M, uv - vec2(tx.x, 0)).g;
  float hy = texture(M, uv + vec2(0, tx.y)).g - texture(M, uv - vec2(0, tx.y)).g;
  vec3 n = normalize(vec3(-hx * BV, -hy * BV, 1.));
  float ly = m.a * 1.25;                                         // 0 at the cap height, 1 at the baseline

  float settle = smoothstep(.72, 1., P);
  float flow = bell(P, .08, 1.02) * (1. - settle * .85);
  // two fronts: warm light from the left, cool light from the right
  float f = P * 1.55 - .12;
  float wL = smoothstep(uv.x - .32, uv.x + .04, f);
  float cL = smoothstep((1. - uv.x) - .32, (1. - uv.x) + .04, f * .92);
  float lit = max(wL, cL);
  float warmth = clamp(wL - cL * .6, 0., 1.);
  // the reflections slide and ripple while the light flows
  vec2 q = vec2(uv.x * 3. - T * .25 - P * 3., ly * 2.2 + T * .05);
  vec2 wob = (vec2(fbm(q), fbm(q + 7.3)) - .5) * flow * vec2(.5, .55);
  vec2 c = vec2(uv.x + n.x * .55 + wob.x + (1. - P) * .25, ly + n.y * .95 + wob.y);
  vec3 metal = env(c, warmth, settle);
  metal *= .75 + .35 * n.z;
  vec3 dark = vec3(.035, .04, .05) + vec3(.12, .13, .16) * (1. - n.z) * 1.5;

  // glints: one sweep along the baseline as it settles, then a slow idle shimmer
  float sx = mix(-.15, 1.15, smoothstep(.42, .9, P));
  float gs = bell(P, .4, .95);
  float ix = fract(T / 7.) * 1.7 - .35;
  float idle = settle * SH * .7;
  float sx2 = sx - .22;
  float band = gs * (exp(-pow((uv.x - sx) / .045, 2.)) + .6 * exp(-pow((uv.x - sx2) / .035, 2.))) + idle * exp(-pow((uv.x - ix - (ly - .5) * .08) / .05, 2.));
  float base = exp(-pow((ly - .9) / .14, 2.));
  float edge = 1. - n.z;
  vec3 glint = vec3(1., .98, .95) * band * (base * 3.2 + edge * 3. * (.3 + base));

  vec3 col = mix(dark, metal, lit) + glint * lit;
  float halo = m.b * (gs * (exp(-pow((uv.x - sx) / .08, 2.)) + .5 * exp(-pow((uv.x - sx2) / .06, 2.))) * (.35 + .65 * smoothstep(.4, 1., ly)) * 1.5 + idle * .35 * exp(-pow((uv.x - ix) / .1, 2.))) * GL;
  vec3 hc = mix(vec3(1., .85, .7), vec3(.75, .85, 1.), smoothstep(.2, .8, uv.x));
  vec3 rgb = col * a + hc * halo * (1. - a);
  o = vec4(rgb, clamp(a + halo * (1. - a), 0., 1.));
}`;

/* Separable box blur on a single channel, run twice: close enough to a gaussian, and needs no canvas filter support. */
function blur(src, w, h, r) {
  r = Math.max(1, Math.round(r));
  const tmp = new Float32Array(w * h), out = new Float32Array(src);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) {                 // horizontal: out -> tmp
      let s = 0; const row = y * w;
      for (let x = -r; x <= r; x++) s += out[row + clamp(x, 0, w - 1)];
      for (let x = 0; x < w; x++) {
        tmp[row + x] = s / (2 * r + 1);
        s += out[row + Math.min(w - 1, x + r + 1)] - out[row + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {                 // vertical: tmp -> out
      let s = 0;
      for (let y = -r; y <= r; y++) s += tmp[clamp(y, 0, h - 1) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = s / (2 * r + 1);
        s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
  }
  return out;
}

/* Draw the element's text, word by word where the browser laid it out, into an alpha mask and a "height within
   the line" map. Returns the packed RGBA pixels for the shader. */
function rasterise(el, pad, dpr, w, h) {
  const box = el.getBoundingClientRect();
  const mask = document.createElement('canvas'), line = document.createElement('canvas');
  mask.width = line.width = w; mask.height = line.height = h;
  const mc = mask.getContext('2d', { willReadFrequently: true }), lc = line.getContext('2d', { willReadFrequently: true });
  mc.scale(dpr, dpr); lc.scale(dpr, dpr);
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
      // height within the line: 0 at the cap height, 0.8 at the baseline (stored /1.25 so descenders fit)
      const g = lc.createLinearGradient(0, base - cap, 0, base + cap * 0.25);
      g.addColorStop(0, 'rgb(0,0,0)'); g.addColorStop(1, 'rgb(255,0,0)');
      lc.fillStyle = g;
      lc.fillRect(x - fs * 0.2, base - cap * 1.4, r.width + fs * 0.4, cap * 1.9);
    }
  }
  const md = mc.getImageData(0, 0, w, h).data, ld = lc.getImageData(0, 0, w, h).data;
  const n = w * h, alpha = new Float32Array(n);
  for (let i = 0; i < n; i++) alpha[i] = md[i * 4 + 3] / 255;
  const bevel = blur(alpha, w, h, size * dpr * 0.03);
  const bloom = blur(alpha, w, h, size * dpr * 0.11);
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    out[i * 4] = md[i * 4 + 3];
    out[i * 4 + 1] = Math.min(255, bevel[i] * 255);
    out[i * 4 + 2] = Math.min(255, bloom[i] * 255);
    const ly = ld[i * 4] / 255;
    out[i * 4 + 3] = (ld[i * 4 + 3] ? Math.min(1, ly * 0.8) : 0.8) * 255;
  }
  return { pixels: out, size };
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

function one(el, { warm = '#ff8a3d', cool = '#3d7bff', start = 0.85, end = 0.3, shimmer = 1, glow = 1 } = {}) {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false });
  if (!gl) return fallback(el, warm, cool, start, end);

  const compile = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const prog = gl.createProgram();
  try {
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) { console.warn('chrome: falling back', e); return fallback(el, warm, cool, start, end); }
  gl.useProgram(prog);
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const U = {}; for (const k of ['M', 'tx', 'P', 'T', 'SH', 'GL', 'BV', 'W', 'C']) U[k] = gl.getUniformLocation(prog, k);
  gl.uniform1i(U.M, 0); gl.uniform3fv(U.W, hex(warm)); gl.uniform3fv(U.C, hex(cool));
  gl.uniform1f(U.SH, reduced ? 0 : shimmer); gl.uniform1f(U.GL, glow);

  // the canvas sits over the element, a little larger so the bloom has room
  const s = el.style, keep = { pos: s.position, color: s.color, fill: s.webkitTextFillColor };
  if (getComputedStyle(el).position === 'static') s.position = 'relative';
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'absolute', pointerEvents: 'none', display: 'block' });
  el.append(canvas);

  let ready = false, target = reduced ? 1 : 0, p = target, raf = 0, visible = false, last = 0, dead = false;
  const draw = (now) => {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform1f(U.P, p); gl.uniform1f(U.T, reduced ? 0 : now / 1000);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
  const build = () => {
    if (dead) return;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const fs = parseFloat(getComputedStyle(el).fontSize) || 16;
    const pad = Math.ceil(fs * 0.3), dpr = Math.min(2, window.devicePixelRatio || 1);
    // the element's border box, relative to its padding box (where absolute children are placed)
    const bl = el.clientLeft, bt = el.clientTop;
    Object.assign(canvas.style, { left: `${-pad - bl}px`, top: `${-pad - bt}px`, width: `${rect.width + pad * 2}px`, height: `${rect.height + pad * 2}px` });
    const w = Math.round((rect.width + pad * 2) * dpr), h = Math.round((rect.height + pad * 2) * dpr);
    canvas.width = w; canvas.height = h;
    const { pixels, size } = rasterise(el, pad, dpr, w, h);
    s.color = 'transparent'; s.webkitTextFillColor = 'transparent';
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.uniform2f(U.tx, 1.5 / w, 1.5 / h);
    gl.uniform1f(U.BV, Math.max(6, size * dpr * 0.03) * 1.6);
    ready = true;
    draw(performance.now());
  };
  const loop = (now) => {
    raf = 0;
    if (!ready || !visible) return;
    const dt = Math.min(0.5, (now - (last || now)) / 1000); last = now;
    p += (target - p) * (1 - Math.exp(-dt * 5));
    if (Math.abs(target - p) < 0.0005) p = target;
    draw(now);
    raf = requestAnimationFrame(loop);
  };
  const kick = () => { if (!reduced && visible && !raf) { last = 0; raf = requestAnimationFrame(loop); } };

  const stopScroll = reduced ? () => {} : enter(el, (v) => { target = v; kick(); }, { from: start, to: end });
  const io = new IntersectionObserver((es) => { visible = es.some((e) => e.isIntersecting); if (visible) kick(); }, { rootMargin: '100px' });
  io.observe(el);
  let rz = 0;
  const ro = new ResizeObserver(() => { cancelAnimationFrame(rz); rz = requestAnimationFrame(build); });
  ro.observe(el);
  (document.fonts?.ready ?? Promise.resolve()).then(build);
  const lost = (e) => { e.preventDefault(); ready = false; };
  canvas.addEventListener('webglcontextlost', lost);

  return () => {
    dead = true; stopScroll(); io.disconnect(); ro.disconnect(); cancelAnimationFrame(raf); cancelAnimationFrame(rz);
    canvas.removeEventListener('webglcontextlost', lost);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    canvas.remove();
    s.position = keep.pos; s.color = keep.color; s.webkitTextFillColor = keep.fill;
  };
}

export function chrome(target, opts = {}) {
  return { stop: stopAll(resolve(target).map((el) => one(el, opts))) };
}

export default chrome;
