/* Reveal, the library. makeReveal(effects) gives you a reveal() for a set of effects; the package's entries bind it:
   js/lib.js to every effect, js/elemental/index.js and js/shinobi/index.js to one pack each.

   reveal(target, { effect, from, to, … }) turns any element into a reveal: `from` (an image, canvas or video) is
   taken apart by the effect to show `to` underneath. Progress can follow scroll, play on its own when the element
   comes into view, or be set by you.

     import { reveal } from '@brightkumedzro/reveal';
     const fx = reveal('#hero', { effect: 'storm', from: '/sketch.png', to: '/final.png' });

   Each call gets its own canvases inside the target. No dependencies, no build step.

   Performance: a reveal only animates while it is on screen, only holds a WebGL context while it is on or near the
   screen (with a page-wide cap, see gpu.js), and lowers its resolution while frames run slow. */
import { GLSL_HEAD, MAX_SEEDS, OCT, DONE, ign, clamp, reduce, fine, lite } from './core.js';
import { createSound } from './sound.js';
import { holder, gpu } from './gpu.js';

export { gpu };

export const VERSION = '1.5.0';

/* Sound is off unless you ask for it, and every reveal on the page shares one audio output. Any button on the
   page with a data-reveal-sound attribute turns it on and off (and gets aria-pressed to match). */
let pageSound = null;
function soundFor(mode) {
  if (!mode || mode === 'off') return null;
  if (!pageSound) {
    pageSound = createSound(mode === 'on' ? 'on' : 'toggle');
    const wire = () => {
      const buttons = [...document.querySelectorAll('[data-reveal-sound]')];
      buttons.forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); pageSound.toggle(); }));
      pageSound.onChange((on) => buttons.forEach((b) => b.setAttribute('aria-pressed', String(on))));
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire, { once: true }); else wire();
  }
  return pageSound;
}

/* The library makes no network requests of its own: it only loads the images you give it. (Before 1.1 it could
   send an opt-in adoption ping; that's gone, and the `telemetry` and `showcase` options are now ignored.) */
let credited = false;
function credit() {
  if (credited || typeof console === 'undefined') return;
  credited = true;
  console.info(`%c@brightkumedzro/reveal ${VERSION}%c by Bright Kumedzro`, 'font-weight:600', 'color:#888');
}

const VS = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main() { vUv = aPos * .5 + .5; gl_Position = vec4(aPos, 0., 1.); }`;
const BASE_U = ['uDraft', 'uFinal', 'uAr', 'uP', 'uK', 'uT', 'uOct', 'uPtrOn', 'uQuake', 'uPtr', 'uN', 'uSeeds'];

function load(src) {
  if (typeof src === 'string') {
    return new Promise((res, rej) => {
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = () => res(im); im.onerror = () => rej(new Error(`elemental-reveal: could not load ${src}`));
      im.src = src;
    });
  }
  if (src instanceof HTMLImageElement && !src.complete) return new Promise((res) => { src.addEventListener('load', () => res(src), { once: true }); });
  return Promise.resolve(src);
}
const sizeOf = (s) => [s.naturalWidth || s.videoWidth || s.width, s.naturalHeight || s.videoHeight || s.height];

/* Draw a source into a w×h canvas the way CSS object-fit would. */
function fitInto(c, src, w, h, fit, bg) {
  const [sw, sh] = sizeOf(src);
  c.fillStyle = bg; c.fillRect(0, 0, w, h);
  if (!sw || !sh) return;
  if (fit === 'fill') { c.drawImage(src, 0, 0, w, h); return; }
  const k = fit === 'contain' ? Math.min(w / sw, h / sh) : Math.max(w / sw, h / sh);
  c.drawImage(src, (w - sw * k) / 2, (h - sh * k) / 2, sw * k, sh * k);
}

/**
 * @param {string|HTMLElement} target   the element to turn into a reveal (it gets position: relative if static)
 * @param {object} o
 * @param {'fire'|'water'|'air'|'earth'|'lightning'} [o.effect='fire']
 * @param {string|CanvasImageSource} o.from   what gets taken away
 * @param {string|CanvasImageSource} o.to     what's revealed underneath
 * @param {'scroll'|'auto'|'manual'} [o.progress='scroll']
 *        scroll: follows the page as the target moves up through the viewport (or through `track`, see below)
 *        auto:   plays once over `duration` when the target comes into view
 *        manual: you drive it with fx.progress(p)
 * @param {HTMLElement|string} [o.track]  scroll mode only: a tall wrapper the target is pinned inside
 *        (position: sticky). Progress then runs from the wrapper's top reaching the top of the viewport to
 *        its bottom reaching the bottom, like the chapters on the demo site.
 * @param {number} [o.duration=3500]  auto mode: how long it takes, ms
 * @param {boolean} [o.interactive=true]  hover and click effects (throw fire, spill water, gusts, quakes, bolts)
 * @param {'cover'|'contain'|'fill'} [o.fit='cover']  how the images fill the target
 * @param {string} [o.background='#0b0b0c']  shown behind images that don't fill the target
 * @param {(p:number)=>void} [o.onProgress]  called every frame with progress (0 to 1; the draft is gone by about 0.9)
 * @param {'off'|'on'|'toggle'} [o.sound='off']  synthesised sound for the effect (no audio files)
 *        off:    silent
 *        on:     starts at the visitor's first click, tap or key press (browsers block sound before one)
 *        toggle: ready, but silent until fx.sound(true) or a [data-reveal-sound] button turns it on
 *        (sends the ping too; the listing appears once the author approves it)
 * @param {boolean} [o.credit=true]  print one line crediting the library in the browser console
 *
 * Anything inside the target stays on top of the effect, so it works as a background behind your own content.
 */
export function makeReveal(effects) {
  const first = Object.keys(effects)[0];
  return function reveal(target, o = {}) {
  const name = o.effect || first;
  const host = typeof target === 'string' ? document.querySelector(target) : target;
  if (!host) throw new Error(`elemental-reveal: no element matches ${target}`);
  const el = effects[name];
  if (!el) throw new Error(`reveal: unknown effect "${o.effect}". Use one of ${Object.keys(effects).join(', ')}.`);
  let mode = o.progress || 'scroll';
  const fit = o.fit || 'cover', bg = o.background || '#0b0b0c';
  const interactive = o.interactive !== false;
  const track = typeof o.track === 'string' ? document.querySelector(o.track) : o.track;

  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
  host.style.isolation = 'isolate';                 // the canvases sit behind whatever is inside the target
  const wrap = document.createElement('div');
  wrap.setAttribute('aria-hidden', 'true');
  wrap.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:-1;';
  const CSS = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
  const mk = () => { const c = document.createElement('canvas'); c.style.cssText = CSS; wrap.appendChild(c); return c; };
  const finalC = mk(), draftC = mk(), fxc = mk();   // the WebGL canvas goes between draftC and fxc while it exists
  host.prepend(wrap);
  const fc = fxc.getContext('2d');

  const ch = {
    el, gl: null, W: 1, H: 1, AR: 1, K: 1, DPR: 1, p: 0, pPrev: 0, pTarget: 0, speed: 0, quake: 0,
    seeds: [el.home()], ptr: { u: 0.5, v: 0.5, on: 0, target: 0 }, parts: [], s: {}, low: null, sound: soundFor(o.sound === true ? 'toggle' : o.sound),
    seedBuf: new Float32Array(MAX_SEEDS * 4), mode: reduce ? 'fade' : 'clip',
  };
  ch.spawn = (q) => { if (ch.parts.length < (lite ? 180 : 420)) ch.parts.push(q); };
  ch.draftColor = (x, y) => {
    const lo = ch.low;
    if (!lo) return '#f1e9d8';
    const i = clamp(Math.floor((x / ch.W) * lo.w), 0, lo.w - 1), j = clamp(Math.floor((y / ch.H) * lo.h), 0, lo.h - 1), k = (j * lo.w + i) * 4;
    return `rgb(${lo.data[k]},${lo.data[k + 1]},${lo.data[k + 2]})`;
  };

  let srcs = null, dead = false, raf = 0, last = 0, visible = false, near = false, autoStart = 0;
  const live = () => srcs && srcs.some((s) => s instanceof HTMLVideoElement);

  /* ---------- the WebGL context: held only while the reveal is on or near the screen (see gpu.js) ---------- */
  let gl = null, glc = null, prog = null, glMode = false, noGL = reduce, losses = [];
  const loc = {};
  const gpuH = holder({ kind: `reveal:${name}`, release: () => dropGL(true), retry: () => acquire() });

  /* Which picture is showing: the shader (gl), or the plain images with a wipe (clip) or cross-fade (fade). */
  function setMode() {
    glMode = !!gl;
    ch.gl = gl;
    ch.mode = glMode ? 'gl' : reduce ? 'fade' : 'clip';   // some effects check this before making sound
    draftC.style.visibility = finalC.style.visibility = glMode ? 'hidden' : 'visible';
    if (glMode) { draftC.style.clipPath = ''; draftC.style.opacity = ''; }
    else { fc.setTransform(1, 0, 0, 1, 0, 0); fc.clearRect(0, 0, fxc.width, fxc.height); ch.parts.length = 0; }
  }

  function createGL() {
    const c = document.createElement('canvas');
    c.style.cssText = CSS;
    const g = c.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false });
    if (!g) return false;
    const sh = (type, src) => { const s = g.createShader(type); g.shaderSource(s, src); g.compileShader(s); return g.getShaderParameter(s, g.COMPILE_STATUS) ? s : (console.warn(g.getShaderInfoLog(s)), null); };
    const vs = sh(g.VERTEX_SHADER, VS), fs = sh(g.FRAGMENT_SHADER, GLSL_HEAD + el.fs);
    let p = null;
    if (vs && fs) {
      p = g.createProgram();
      g.attachShader(p, vs); g.attachShader(p, fs);
      g.bindAttribLocation(p, 0, 'aPos');
      g.linkProgram(p);
      if (!g.getProgramParameter(p, g.LINK_STATUS)) p = null;
    }
    if (!p) { g.getExtension('WEBGL_lose_context')?.loseContext(); return false; }
    gl = g; prog = p; glc = c;
    gl.useProgram(prog);
    gl.bindVertexArray(gl.createVertexArray());
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    for (const k of Object.keys(loc)) delete loc[k];
    for (const u of [...BASE_U, ...(el.uniforms || [])]) loc[u] = gl.getUniformLocation(prog, u);
    gl.uniform1i(loc.uDraft, 0); gl.uniform1i(loc.uFinal, 1); gl.uniform1f(loc.uOct, OCT);
    for (const [n, unit] of Object.entries(el.samplers || {})) gl.uniform1i(gl.getUniformLocation(prog, n), unit);
    ch.tex = [0, 1].map((unit) => {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
      return t;
    });
    ch.gl = gl;
    el.initGL?.(ch, gl);
    c.addEventListener('webglcontextlost', onLost);
    wrap.insertBefore(c, fxc);
    setMode();
    if (srcs) resize();   // sizes the canvas, lets the effect rebuild its own GL data, uploads the images
    return true;
  }

  /* Give the context back: the effect shows its fallback until it gets another one. */
  function dropGL(lose) {
    if (!gl) return;
    el.releaseGL?.(ch);
    const c = glc, g = gl;
    gl = null; prog = null; glc = null; ch.tex = null;
    c.removeEventListener('webglcontextlost', onLost);
    if (lose) g.getExtension('WEBGL_lose_context')?.loseContext();
    c.remove();
    ch.bed?.silence(); el.quiet?.(ch);
    setMode();
    wake();
  }

  /* The browser took the context (too many on the page, a GPU reset, a driver update): fall back at once, then
     ask for a fresh one on a new canvas. Three losses in half a minute and it stays on the fallback. */
  function onLost(e) {
    e.preventDefault();
    const t = performance.now();
    losses = losses.filter((x) => t - x < 30000); losses.push(t);
    dropGL(false); gpuH.forget();
    if (losses.length < 3) setTimeout(acquire, 300);
  }

  function acquire() {
    if (dead || noGL || gl || !near || !srcs) return;
    if (losses.length >= 3 && performance.now() - losses[0] < 30000) return;
    if (!gpuH.claim()) return;                 // the budget is full of on-screen reveals: retried when one frees up
    if (!createGL()) { noGL = true; gpuH.forget(); }   // no WebGL2 here: the wipe it is
    wake();
  }

  /* ---------- resolution: lowered while frames run slow, raised again when there's room ---------- */
  const STEPS = [1, 0.87, 0.75, 0.62, 0.5, 0.4], FLOOR = 0.75;
  const TOP = lite ? 1 : 0;                  // phones and low-core machines start (and stay) a step down
  let level = TOP, nextLevel = TOP, ema = 16, slowFor = 0, fastFor = 0;
  const failedAt = new Array(STEPS.length).fill(-1e9), fails = new Array(STEPS.length).fill(0);
  function sizeGL() {
    if (!glc) return;
    glc.width = Math.max(1, Math.round(ch.W * ch.DPR * STEPS[level]));
    glc.height = Math.max(1, Math.round(ch.H * ch.DPR * STEPS[level]));
  }
  function pace(ms, now) {
    if (ms > 1000) return;                   // a background tab or a one-off stall, not the effect
    ms = Math.min(ms, 100);                  // a very slow frame counts, but can't swamp the average
    ema += (ms - ema) * 0.1;
    const dt = ms / 1000;
    if (ema > 22) { slowFor += dt; fastFor = 0; } else if (ema < 18) {   // under 18 ms: keeping up with a 60 Hz screen (or faster)
      fastFor += dt; slowFor = 0; } else { slowFor = Math.max(0, slowFor - dt); fastFor = 0; }
    const down = level + 1 < STEPS.length && ch.DPR * STEPS[level + 1] >= Math.min(ch.DPR, FLOOR) - 1e-6;
    if (slowFor > 1 && down) { failedAt[level] = now; fails[level]++; nextLevel = level + 1; slowFor = 0; ema = 16; }
    else if (fastFor > 3 && level > TOP && now - failedAt[level - 1] > 10000 * 2 ** Math.max(0, fails[level - 1] - 1))   // waits longer each time that level proved too slow
      { nextLevel = level - 1; fastFor = 0; }
  }

  function paint() {
    if (!srcs) return;
    for (const [cv, src] of [[draftC, srcs[0]], [finalC, srcs[1]]]) {
      cv.width = Math.round(ch.W * ch.DPR); cv.height = Math.round(ch.H * ch.DPR);
      fitInto(cv.getContext('2d'), src, cv.width, cv.height, fit, bg);
    }
    if (el.wantsColor) {
      const lw = Math.max(8, Math.round(ch.W / 6)), lh = Math.max(8, Math.round(ch.H / 6));
      const lc = document.createElement('canvas'); lc.width = lw; lc.height = lh;
      const lx = lc.getContext('2d', { willReadFrequently: true });
      lx.drawImage(draftC, 0, 0, lw, lh);
      try { ch.low = { w: lw, h: lh, data: lx.getImageData(0, 0, lw, lh).data }; } catch { ch.low = null; }   // cross-origin images without CORS
    }
    upload();
  }
  function upload() {
    if (!glMode) return;
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    [draftC, finalC].forEach((c, i) => {
      gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, ch.tex[i]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
      // an effect that draws the images smaller than the element asks for mipmaps, so they don't shimmer
      if (el.mips) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); }
    });
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }

  function resize() {
    const r = host.getBoundingClientRect();
    ch.W = Math.max(1, r.width); ch.H = Math.max(1, r.height); ch.AR = ch.W / ch.H;
    ch.DPR = Math.min(window.devicePixelRatio || 1, lite ? 1.5 : 2, 3200 / ch.W);
    fxc.width = Math.round(ch.W * ch.DPR); fxc.height = Math.round(ch.H * ch.DPR);
    sizeGL();
    if (el.reach) ch.K = el.reach(ch.AR) / DONE;
    el.resize?.(ch);
    paint();
  }

  function readScroll() {
    if (mode !== 'scroll') return;
    const vh = window.innerHeight;
    if (track) {
      const r = track.getBoundingClientRect();
      ch.pTarget = clamp(-r.top / Math.max(1, r.height - vh), 0, 1);
    } else {
      const r = host.getBoundingClientRect();
      ch.pTarget = clamp((vh * 0.85 - r.top) / (vh * 0.75), 0, 1);   // done once its top has risen 75% of the screen
    }
    wake();
  }

  function frame(now) {
    raf = 0;
    // nothing to draw until both images have loaded (progress() before then only sets the target; ready wakes it)
    if (dead || !srcs) return;
    const ms = last ? now - last : 0;
    const dt = Math.min(0.05, ms / 1000); last = now;
    if (mode === 'auto' && autoStart) ch.pTarget = clamp((now - autoStart) / (o.duration || 3500), 0, 1);
    ch.pPrev = ch.p;
    if (glMode) { ch.p += (ch.pTarget - ch.p) * (1 - Math.exp(-dt * 7)); if (Math.abs(ch.pTarget - ch.p) < 1e-4) ch.p = ch.pTarget; } else ch.p = ch.pTarget;
    ch.speed += (Math.abs(ch.p - ch.pPrev) / Math.max(dt, 1e-3) - ch.speed) * (1 - Math.exp(-dt * 6));
    ch.quake = ch.p > 0.01 && ch.p < DONE + 0.02 ? Math.min(1, ch.speed * 2.5) : 0;
    ch.seeds = ch.seeds.filter((s) => !s.born || ch.p >= s.p0 - 0.03);
    ch.ptr.on += (ch.ptr.target - ch.ptr.on) * (1 - Math.exp(-dt * 8));
    el.onFrame?.(ch, now, dt);

    if (glMode) {
      // a resolution change is applied just before drawing, so the resized (cleared) canvas is never shown empty
      if (nextLevel !== level) { level = nextLevel; sizeGL(); }
      if (live()) { for (const [cv, src] of [[draftC, srcs[0]], [finalC, srcs[1]]]) fitInto(cv.getContext('2d'), src, cv.width, cv.height, fit, bg); upload(); }
      gl.viewport(0, 0, glc.width, glc.height);
      gl.useProgram(prog);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, ch.tex[0]);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, ch.tex[1]);
      ch.seedBuf.fill(0);
      ch.seeds.forEach((s, i) => ch.seedBuf.set([s.u * ch.AR, s.v, s.p0, ign(s, now) + (s.off || 0)], i * 4));
      gl.uniform4fv(loc.uSeeds, ch.seedBuf); gl.uniform1i(loc.uN, ch.seeds.length);
      gl.uniform1f(loc.uAr, ch.AR); gl.uniform1f(loc.uP, ch.p); gl.uniform1f(loc.uK, ch.K);
      gl.uniform1f(loc.uT, (now / 1000) % 1000); gl.uniform1f(loc.uPtrOn, ch.ptr.on); gl.uniform1f(loc.uQuake, ch.quake);
      gl.uniform2f(loc.uPtr, ch.ptr.u * ch.AR, ch.ptr.v);
      el.setUniforms?.(ch, gl, loc, now);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      el.drawGL?.(ch, gl, now);   // an effect can draw its own geometry over the quad (Page Curl's sheet); it restores GL state

      fc.setTransform(ch.DPR, 0, 0, ch.DPR, 0, 0);
      fc.clearRect(0, 0, ch.W, ch.H);
      if ((ch.p > 0.002 && ch.p < DONE + 0.03) || ch.seeds.some((s) => s.born)) {
        const act = Math.min(1, 0.3 + ch.speed * 5);
        for (let i = 0; i < (lite ? 30 : 64); i++) { const u = Math.random(), v = Math.random(); el.emit(ch, u * ch.W, (1 - v) * ch.H, el.fuel(ch, u, v, now), act, now); }
      }
      fc.save(); el.step(ch, fc, dt, now); el.overlay?.(ch, fc, dt, now); fc.restore();
      if (ms) pace(ms, now);
    } else {
      const k = Math.min(1, ch.p / DONE);
      if (reduce) { draftC.style.opacity = String(1 - k); } else draftC.style.clipPath = el.clip((k * 100).toFixed(2));
    }
    o.onProgress?.(ch.p);
    const busy = glMode || Math.abs(ch.pTarget - ch.p) > 1e-4 || (mode === 'auto' && autoStart && ch.pTarget < 1);
    if (visible && busy) raf = requestAnimationFrame(frame);
  }
  function wake() { if (!raf && visible && !dead) { last = 0; raf = requestAnimationFrame(frame); } }

  /* input */
  const toUV = (e) => { const r = host.getBoundingClientRect(); return { u: (e.clientX - r.left) / r.width, v: 1 - (e.clientY - r.top) / r.height, x: e.clientX - r.left, y: e.clientY - r.top }; };
  const onMove = (e) => { if (!fine || !glMode) return; const q = toUV(e); ch.ptr.u = q.u; ch.ptr.v = q.v; ch.ptr.target = 1; wake(); };
  const onLeave = () => { ch.ptr.target = 0; };
  const onClick = (e) => {
    if (!glMode || e.target.closest('a, button, input, textarea, select')) return;
    const q = toUV(e), now = performance.now();
    if (el.fuel(ch, q.u, q.v, now) >= 0) return;
    const lit = ch.seeds.filter((s) => s.born);
    if (lit.length >= (el.maxClicks || MAX_SEEDS - 1)) ch.seeds.splice(ch.seeds.indexOf(lit[0]), 1);
    const seed = { u: q.u, v: q.v, p0: ch.p, born: now };
    ch.seeds.push(seed);
    el.onClick?.(ch, seed, q, now);
    el.burst?.(ch, q.x, q.y, now);
    wake();
  };
  if (interactive) { host.addEventListener('pointermove', onMove); host.addEventListener('pointerleave', onLeave); host.addEventListener('click', onClick); }

  const ro = new ResizeObserver(() => { if (srcs) { resize(); wake(); } });
  const io = new IntersectionObserver(([en]) => {
    visible = en.isIntersecting;
    gpuH.see(visible);
    if (!visible) { ch.bed?.silence(); el.quiet?.(ch); }   // out of sight, out of earshot
    if (visible && mode === 'auto' && !autoStart && srcs) autoStart = performance.now();
    if (visible) { acquire(); wake(); }
  });
  // within a screen of the viewport: get a context ready; more than two and a half screens away: give it back
  const nearIO = new IntersectionObserver(([en]) => { near = en.isIntersecting; if (near) acquire(); }, { rootMargin: '100%' });
  const farIO = new IntersectionObserver(([en]) => { if (!en.isIntersecting) gpuH.free(); }, { rootMargin: '250%' });
  window.addEventListener('scroll', readScroll, { passive: true });
  setMode();

  const ready = Promise.all([load(o.from), load(o.to)]).then((s) => {
    if (dead) return;
    srcs = s;
    if (o.credit !== false) credit();
    resize();
    readScroll(); ch.p = ch.pTarget;
    ro.observe(host); io.observe(host); nearIO.observe(host); farIO.observe(host);
    wake();
  });

  return {
    /** Resolves once both images have loaded and the first frame can draw. */
    ready,
    /** Read progress, or set it yourself (0: untouched, 1: fully revealed; the draft is gone by about 0.9).
        Setting it switches off scroll or auto tracking. */
    progress(p) { if (p === undefined) return ch.p; mode = 'manual'; ch.pTarget = clamp(p, 0, 1); wake(); return this; },
    /** Auto mode: play from the start. */
    play() { mode = 'auto'; ch.p = ch.pTarget = 0; this.reset(); autoStart = performance.now(); wake(); return this; },
    /** Put the draft back and clear clicks. */
    reset() { ch.seeds = [el.home()]; ch.parts.length = 0; ch.bed?.silence(); el.reset?.(ch); wake(); return this; },
    /** Read whether sound is on, or turn it on or off for every reveal on the page. Needs the sound option. */
    sound(on) { if (on === undefined) return !!ch.sound?.on; ch.sound?.set(on); wake(); return this; },
    /** For debugging: what's drawing ('gl', 'clip' or 'fade'), the resolution the effect renders at (device
        pixels per CSS pixel, lowered while frames run slow), and the recent frame time in ms. */
    stats() { return { effect: name, mode: ch.mode, dpr: glc ? glc.width / ch.W : ch.DPR, frameMs: ema, visible, hasContext: !!gl }; },
    /** Remove the canvases and listeners. */
    destroy() {
      dead = true; if (raf) cancelAnimationFrame(raf);
      ch.bed?.dispose(); ch.bed = null;
      el.quiet?.(ch);
      for (const v of Object.values(ch.s)) if (typeof v?.dispose === 'function') v.dispose();   // an effect's own running sounds
      ro.disconnect(); io.disconnect(); nearIO.disconnect(); farIO.disconnect(); window.removeEventListener('scroll', readScroll);
      host.removeEventListener('pointermove', onMove); host.removeEventListener('pointerleave', onLeave); host.removeEventListener('click', onClick);
      gpuH.drop(); dropGL(true);
      wrap.remove();
    },
  };
  };
}
