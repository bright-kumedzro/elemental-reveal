/* scrub: scroll plays an image sequence (or a video) forwards and backwards, like a product page.

     <section class="scrub" style="height: 300vh">            ← the track: the taller it is, the slower it plays
       <div data-scrub-stage style="height: 100vh"></div>    ← optional; pinned while you scroll the track. Give your
                                                                own stage a height; a <canvas> inside it is used as is
     </section>

     import { scrub } from '@brightkumedzro/reveal/scroll';
     const fx = scrub('.scrub', { frames: '/frames/%03d.jpg', count: 90, alt: 'The phone turning round' });
     fx.stop();                                               // removes what it added

   Frames: a pattern with %d or %0Nd (`start` is the first number, default 1) plus `count`, or an array of URLs.
   They load nearest-first (the frame you're on, then a coarse pass across the whole run, then the gaps), and
   until a frame has loaded the nearest one that has is drawn, so scrubbing never shows a blank.
   Video: `video: '/clip.mp4'` seeks the video instead. Encode it with a keyframe every few frames
   (e.g. ffmpeg -g 4) or seeking will stutter, and keep it muted.
   With reduced motion on, it shows one still (the last frame, or `poster`) and loads nothing else. */
import { through, enter, resolve, reduced, clamp, stopAll } from './core.js';

const FIT = new Set(['cover', 'contain']);

/**
 * @param {string|Element|Iterable<Element>} target  the track (tall section); with pin: false, the element itself
 * @param {object} o
 * @param {string|string[]} [o.frames]  '/path/%03d.jpg' (with o.count) or an array of URLs
 * @param {number} [o.count]            how many frames the pattern has
 * @param {number} [o.start=1]          the pattern's first number
 * @param {string} [o.video]            a video to seek instead of frames
 * @param {'cover'|'contain'} [o.fit='cover']
 * @param {string} [o.background='#0c0c0c']  behind 'contain'
 * @param {string} [o.alt]              what the sequence shows, for screen readers
 * @param {boolean} [o.pin=true]        pin a stage while the track scrolls past; false: play as the element itself passes
 * @param {number} [o.from] @param {number} [o.to]  with pin: false, where progress starts and ends (see core.enter)
 * @param {number|'first'|'last'} [o.poster='last']  the still shown with reduced motion
 * @param {number} [o.concurrency=6]    frames loading at once
 * @param {(p:number, frame:number)=>void} [o.onProgress]
 */
export function scrub(target, o = {}) {
  return { stop: stopAll(resolve(target).map((el) => one(el, o))) };
}

function urlsOf(o) {
  if (Array.isArray(o.frames)) return o.frames;
  if (typeof o.frames !== 'string' || !(o.count > 0)) return [];
  const start = o.start ?? 1;
  return Array.from({ length: o.count }, (_, i) => o.frames.replace(/%(0?)(\d*)d/, (_m, zero, w) => String(start + i).padStart(zero ? Number(w) : 0, '0')));
}

function one(track, o) {
  const fit = FIT.has(o.fit) ? o.fit : 'cover';
  const pin = o.pin !== false;
  const undo = [];
  const setStyle = (el, props) => {
    const before = el.getAttribute('style');
    Object.assign(el.style, props);
    undo.push(() => (before == null ? el.removeAttribute('style') : el.setAttribute('style', before)));
  };

  // the stage: the author's, or one we add; pinned while the track scrolls past
  let stage = track.querySelector('[data-scrub-stage]');
  if (!stage) {
    stage = document.createElement('div');
    stage.setAttribute('data-scrub-stage', '');
    track.prepend(stage);
    undo.push(() => stage.remove());
    if (pin) { setStyle(stage, { height: '100vh' }); stage.style.height = '100svh'; }   // svh where supported, else vh
    else setStyle(stage, { height: '100%', minHeight: '240px' });
  }
  if (pin && getComputedStyle(stage).position !== 'sticky') setStyle(stage, { position: 'sticky', top: '0' });
  if (getComputedStyle(stage).position === 'static') setStyle(stage, { position: 'relative' });
  setStyle(stage, { overflow: 'hidden', background: stage.style.background || o.background || '#0c0c0c' });

  let media, frameCount = 0, draw = () => {};
  const label = o.alt || 'An image sequence that plays as you scroll';

  if (o.video) {
    // a video: seek it. Only one seek in flight at a time; the latest wanted time wins.
    const v = document.createElement('video');
    Object.assign(v, { src: o.video, muted: true, playsInline: true, preload: reduced ? 'metadata' : 'auto' });
    v.setAttribute('aria-label', label);
    v.setAttribute('role', 'img');
    Object.assign(v.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: fit, display: 'block' });
    stage.append(v);
    media = v;
    undo.push(() => { v.removeAttribute('src'); v.load(); v.remove(); });
    let want = 0, seeking = false;
    const seek = () => {
      if (!v.duration || seeking) return;
      const t = want * Math.max(0, v.duration - 0.05);
      if (Math.abs(v.currentTime - t) < 0.01) return;
      seeking = true; v.currentTime = t;
    };
    v.addEventListener('seeked', () => { seeking = false; seek(); });
    v.addEventListener('loadedmetadata', seek);
    draw = (p) => { want = p; seek(); };
  } else {
    // frames on a canvas
    const urls = urlsOf(o), n = urls.length;
    frameCount = n;
    const canvas = stage.querySelector('canvas') || document.createElement('canvas');
    if (!canvas.parentNode) {
      stage.append(canvas);
      undo.push(() => canvas.remove());
    }
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', label);
    setStyle(canvas, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' });
    const ctx = canvas.getContext('2d', { alpha: false });
    media = canvas;

    const imgs = new Array(n), ready = new Uint8Array(n), queued = new Uint8Array(n);
    let want = 0, shown = -1, size = '', dead = false, inflight = 0;
    const queue = [];
    const conc = Math.max(1, o.concurrency || 6);

    const paint = () => {
      if (!n) return;
      // the nearest frame that has loaded (the exact one if it has)
      let k = -1;
      for (let d = 0; d < n; d++) {
        if (want - d >= 0 && ready[want - d]) { k = want - d; break; }
        if (want + d < n && ready[want + d]) { k = want + d; break; }
      }
      const s = `${canvas.width}x${canvas.height}`;
      if (k < 0 || (k === shown && s === size)) return;
      shown = k; size = s;
      const img = imgs[k], W = canvas.width, H = canvas.height, iw = img.naturalWidth, ih = img.naturalHeight;
      const sc = fit === 'cover' ? Math.max(W / iw, H / ih) : Math.min(W / iw, H / ih);
      ctx.fillStyle = o.background || '#0c0c0c';
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(img, (W - iw * sc) / 2, (H - ih * sc) / 2, iw * sc, ih * sc);
    };
    const pump = () => {
      while (!dead && inflight < conc && queue.length) {
        const i = queue.shift();
        if (ready[i] || imgs[i]) continue;
        const img = new Image();
        img.decoding = 'async';
        imgs[i] = img;
        inflight++;
        const done = (ok) => {
          inflight--;
          if (dead) return;
          if (ok) { ready[i] = 1; if (Math.abs(i - want) <= Math.abs(shown - want) || shown < 0) paint(); }
          else imgs[i] = null;
          pump();
        };
        img.onload = () => (img.decode ? img.decode().then(() => done(true), () => done(true)) : done(true));
        img.onerror = () => done(false);
        img.src = urls[i];
      }
    };
    const push = (i) => { if (i >= 0 && i < n && !queued[i]) { queued[i] = 1; queue.push(i); } };
    // nearest first: the current frame and its neighbours jump the queue
    const prioritise = (c) => {
      const near = [];
      for (let d = 0; d <= 6; d++) { near.push(c + d); if (d) near.push(c - d); }
      for (const i of near.reverse()) if (i >= 0 && i < n && !ready[i] && !imgs[i]) { queued[i] = 1; queue.unshift(i); }
      pump();
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));   // the canvas's own box, wherever it sits
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; paint(); }
    };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    ro?.observe(canvas);
    undo.push(() => { dead = true; ro?.disconnect(); for (const img of imgs) if (img && !img.complete) img.src = ''; });
    resize();

    const posterIndex = o.poster === 'first' ? 0 : typeof o.poster === 'number' ? clamp(o.poster, 0, n - 1) : n - 1;
    if (reduced) {
      want = posterIndex; push(posterIndex); pump();
      o.onProgress?.(1, posterIndex);
    } else {
      // a coarse pass across the whole run (every 16th, then 8th, 4th, 2nd), then everything
      for (const stride of [16, 8, 4, 2, 1]) for (let i = 0; i < n; i += stride) push(i);
      pump();
    }
    draw = (p) => {
      if (reduced) return;
      want = Math.round(p * (n - 1));
      if (!ready[want]) prioritise(want);
      paint();
    };
  }

  const stops = [() => undo.reverse().forEach((f) => f())];
  if (!reduced) {
    const track$ = pin ? through : enter;
    stops.unshift(track$(track, (p) => { draw(p); o.onProgress?.(p, frameCount ? Math.round(p * (frameCount - 1)) : p); }, { from: o.from, to: o.to }));
  } else draw(1);
  return stopAll(stops);
}

export default scrub;
