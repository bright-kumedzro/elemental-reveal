/* mask(): big text becomes a window onto an image, and the image moves inside the letters as you scroll.

     import { mask } from '@brightkumedzro/reveal/scroll';
     mask('#title', { src: '/photo.jpg' });
     mask('h1.hero', { src: '/photo.jpg', scale: [1.6, 1], pan: [-12, 12], grow: 1.25 });

   Options
     src     required    the image (any format the browser shows as a background, animated GIF/WebP included)
     scale   [1.5, 1]    how zoomed in the image is at the start and at the end (1 = just covers the text box)
     pan     [-10, 10]   where it's panned, in % of its spare width, at the start and at the end
     panY    [0, 0]      the same, up and down
     grow    1           scale the whole text up by this much over the last 30% of the scroll (1 = off)
     start   1           where the tracked point of the element is, as a share of the viewport height, when the motion starts
     end     0.45        where it is when the motion ends
     at      0.5         which point is tracked, as a share of the element's height (0 top, 0.5 centre, 1 bottom). The
                         centre means the motion has finished once the text is a little above the middle of the screen,
                         however tall it is. Passing start or end without at tracks the top, as in v1.4.
   The text stays real, selectable text; until the image has loaded it shows in its normal colour, so it is never
   invisible. Returns { stop() }, which puts the element's style back. With reduced motion the image sits still
   at its end position. (For video, pass a poster frame or an animated image: background-clip can't show <video>.) */
import { resolve, enter, lerp, smooth, clamp, stopAll } from './core.js';

export function mask(target, { src, scale = [1.5, 1], pan = [-10, 10], panY = [0, 0], grow = 1, start, end, at } = {}) {
  at ??= start === undefined && end === undefined ? 0.5 : 0;
  start ??= at ? 1 : 0.95; end ??= at ? 0.45 : 0.1;
  if (!src) throw new Error('mask(): pass { src } with an image to show through the text');
  const stops = [];
  for (const el of resolve(target)) {
    const before = el.getAttribute('style');
    let box = { w: 1, h: 1 }, img = { w: 1, h: 1 }, ready = false, p = 0;
    const s = el.style;

    const paint = () => {
      if (!ready) return;
      const k = smooth(p);
      const cover = Math.max(box.w / img.w, box.h / img.h) * lerp(scale[0], scale[1], k);
      const w = img.w * cover, h = img.h * cover;
      // pan within the spare room the zoom gives (0% = centred)
      const x = (box.w - w) / 2 + ((w - box.w) / 2) * (lerp(pan[0], pan[1], k) / 50);
      const y = (box.h - h) / 2 + ((h - box.h) / 2) * (lerp(panY[0], panY[1], k) / 50);
      s.backgroundSize = `${w.toFixed(1)}px ${h.toFixed(1)}px`;
      s.backgroundPosition = `${x.toFixed(1)}px ${y.toFixed(1)}px`;
      if (grow !== 1) s.transform = `scale(${lerp(1, grow, smooth(clamp((p - 0.7) / 0.3))).toFixed(4)})`;
    };

    // measure without forcing layout on every scroll: only when the element resizes
    const ro = new ResizeObserver(([e]) => { box = { w: e.contentRect.width || 1, h: e.contentRect.height || 1 }; paint(); });
    ro.observe(el);

    const im = new Image();
    im.onload = () => {
      img = { w: im.naturalWidth || 1, h: im.naturalHeight || 1 };
      Object.assign(s, {
        backgroundImage: `url("${src}")`, backgroundRepeat: 'no-repeat',
        webkitBackgroundClip: 'text', backgroundClip: 'text', webkitTextFillColor: 'transparent', color: 'transparent',
        transformOrigin: 'center', willChange: grow !== 1 ? 'transform' : '',
      });
      ready = true;
      paint();
    };
    im.src = src;

    const stop = enter(el, (v) => { p = v; paint(); }, { from: start, to: end, at });
    stops.push(() => {
      stop(); ro.disconnect(); im.onload = null;
      if (before === null) el.removeAttribute('style'); else el.setAttribute('style', before);
    });
  }
  return { stop: stopAll(stops) };
}

export default mask;
