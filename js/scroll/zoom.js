/* zoom: the camera dives into a detail of one scene and comes out in the next, as you scroll.

     <section class="zoom" style="height: 400vh">            ← the track: about 100vh per scene feels right
       <div data-zoom-scene>                                  ← a scene: anything (images, text, markup)
         …<div data-zoom-to></div>…                           ← where the camera dives in (optional)
       </div>
       <div data-zoom-scene data-zoom-x="0.3" data-zoom-y="0.6">…</div>   ← or a focal point as fractions
       <div data-zoom-scene>…</div>
     </section>

     import { zoom } from '@brightkumedzro/reveal/scroll';
     const fx = zoom('.zoom');
     fx.stop();                                               // puts the scenes back as they were

   The scenes are stacked in a pinned viewport. Scrolling scales the current scene up about its focal point. When
   it has a [data-zoom-to] element, the next scene starts out filling that element and grows with it, so you appear
   to go through it; a vignette, a blur and a cross-fade cover the hand-off. With reduced motion on, it shows the
   last scene (or `reducedScene`) and doesn't move. */
import { through, resolve, reduced, clamp, lerp, smooth, stopAll } from './core.js';

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * @param {string|Element|Iterable<Element>} target  the track (tall section) holding the scenes
 * @param {object} o
 * @param {string} [o.scenes='[data-zoom-scene]']  which children are scenes (falls back to all element children)
 * @param {Array<[number, number]>} [o.focus]  per-scene focal points as [x, y] fractions, if a scene has no
 *        [data-zoom-to] or data-zoom-x/y
 * @param {number} [o.maxScale]  how far to dive: with a [data-zoom-to], enough to fill the view (capped at 16);
 *        without one, 4
 * @param {number} [o.hold=0.18]  share of each step spent still before the dive starts
 * @param {(t:number)=>number} [o.ease]  easing for the dive (default ease in-out)
 * @param {number} [o.blur=6]  px of blur at the hand-off (0 for none)
 * @param {boolean} [o.vignette=true]
 * @param {number} [o.reducedScene]  the scene shown with reduced motion (default: the last)
 * @param {string} [o.label]  aria-label for the pinned viewport
 * @param {(p:number, scene:number)=>void} [o.onProgress]
 */
export function zoom(target, o = {}) {
  return { stop: stopAll(resolve(target).map((el) => one(el, o))) };
}

function one(track, o) {
  let scenes = [...track.querySelectorAll(o.scenes || '[data-zoom-scene]')];
  if (!scenes.length) scenes = [...track.children];
  const N = scenes.length;
  if (!N) return () => {};
  const ease = typeof o.ease === 'function' ? o.ease : easeInOut;
  const hold = clamp(o.hold ?? 0.18, 0, 0.9), blurPx = o.blur ?? 6;

  // a pinned viewport the scenes move into; markers remember where each scene came from
  const view = document.createElement('div');
  view.setAttribute('data-zoom-view', '');
  if (o.label) { view.setAttribute('role', 'region'); view.setAttribute('aria-label', o.label); }
  Object.assign(view.style, { position: 'sticky', top: '0', height: '100vh', overflow: 'hidden', isolation: 'isolate' });
  view.style.height = '100svh';
  const vig = document.createElement('div');
  vig.setAttribute('aria-hidden', 'true');
  Object.assign(vig.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: String(N + 2), opacity: '0',
    background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 35%, rgba(0,0,0,.75) 100%)' });
  const saved = scenes.map((s) => {
    const marker = document.createComment('zoom-scene');
    s.before(marker);
    return { s, marker, style: s.getAttribute('style'), hidden: s.getAttribute('aria-hidden'), inert: s.hasAttribute('inert') };
  });
  track.prepend(view);
  for (const s of scenes) {
    view.append(s);
    Object.assign(s.style, { position: 'absolute', inset: '0', margin: '0', willChange: 'transform, opacity', transformOrigin: '50% 50%' });
  }
  if (o.vignette !== false) view.append(vig);

  // where each scene dives in, and how far: measured with the scenes untransformed
  let geo = [];
  const measure = () => {
    const W = view.clientWidth || 1, H = view.clientHeight || 1;
    geo = scenes.map((s, i) => {
      const prev = s.style.transform;
      s.style.transform = 'none';
      const box = s.getBoundingClientRect(), to = s.querySelector('[data-zoom-to]');
      let fx = 0.5, fy = 0.5, k0 = 0, max = o.maxScale || 4;
      if (to) {
        const r = to.getBoundingClientRect();
        fx = (r.left + r.width / 2 - box.left) / (box.width || 1);
        fy = (r.top + r.height / 2 - box.top) / (box.height || 1);
        const fill = Math.max(W / Math.max(1, r.width), H / Math.max(1, r.height));
        max = o.maxScale || Math.min(16, fill * 1.15);
        k0 = Math.max(r.width / W, r.height / H);   // the next scene starts out covering this element
      } else if (s.dataset.zoomX || s.dataset.zoomY) {
        fx = Number(s.dataset.zoomX ?? 0.5); fy = Number(s.dataset.zoomY ?? 0.5);
      } else if (o.focus?.[i]) [fx, fy] = o.focus[i];
      s.style.transform = prev;
      return { fx, fy, max, k0: k0 || 1 / max };
    });
  };

  let last = -1;
  const show = (p) => {
    if (!geo.length) measure();
    const x = clamp(p) * Math.max(1, N - 1);
    const step = Math.min(N - 2, Math.floor(x)), t = N > 1 ? ease(clamp((x - Math.max(0, step) - hold) / (1 - hold))) : 0;
    const cur = Math.max(0, step), nxt = cur + 1;
    let vig$ = 0;
    scenes.forEach((s, i) => {
      let scale = 1, op = 0, blur = 0, z = 0, ox = '50%', oy = '50%';
      if (N === 1) op = 1;
      else if (i === cur) {
        const g = geo[i];
        scale = lerp(1, g.max, t);
        op = 1 - smooth(clamp((t - 0.62) / 0.33));
        blur = blurPx * smooth(clamp((t - 0.45) / 0.5));
        ox = `${g.fx * 100}%`; oy = `${g.fy * 100}%`; z = 1;
      } else if (i === nxt) {
        const g = geo[cur];
        // grows from the size of the element being dived into, in step with the dive, to full size
        scale = Math.min(1, g.k0 * lerp(1, g.max, t));
        op = smooth(clamp((t - 0.25) / 0.45));
        blur = blurPx * (1 - smooth(clamp((t - 0.5) / 0.45)));
        ox = `${g.fx * 100}%`; oy = `${g.fy * 100}%`; z = 2;
        vig$ = Math.sin(Math.PI * clamp(t)) * 0.9;
      }
      const st = s.style;
      st.transformOrigin = `${ox} ${oy}`;
      st.transform = scale === 1 ? 'none' : `scale(${scale.toFixed(4)})`;
      st.opacity = op.toFixed(3);
      st.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : '';
      st.zIndex = String(z);
      st.visibility = op > 0.001 ? 'visible' : 'hidden';
      const active = op >= 0.5;
      if (active) { s.removeAttribute('aria-hidden'); s.removeAttribute('inert'); } else { s.setAttribute('aria-hidden', 'true'); s.setAttribute('inert', ''); }
    });
    vig.style.opacity = vig$.toFixed(3);
    const scene = t > 0.5 ? nxt : cur;
    if (scene !== last || o.onProgress) { last = scene; o.onProgress?.(p, scene); }
  };

  const ro = !reduced && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { measure(); show(lastP); }) : null;
  let lastP = reduced ? 1 : 0;
  ro?.observe(view);
  measure();

  let stopTrack = () => {};
  if (reduced) {
    const keep = clamp(o.reducedScene ?? N - 1, 0, N - 1);
    scenes.forEach((s, i) => {
      Object.assign(s.style, { opacity: i === keep ? '1' : '0', visibility: i === keep ? 'visible' : 'hidden', transform: 'none' });
      if (i !== keep) { s.setAttribute('aria-hidden', 'true'); s.setAttribute('inert', ''); }
    });
    o.onProgress?.(1, keep);
  } else {
    stopTrack = through(track, (p) => { lastP = p; show(p); });
  }

  return () => {
    stopTrack();
    ro?.disconnect();
    for (const { s, marker, style, hidden, inert } of saved) {
      marker.replaceWith(s);
      if (style == null) s.removeAttribute('style'); else s.setAttribute('style', style);
      if (hidden == null) s.removeAttribute('aria-hidden'); else s.setAttribute('aria-hidden', hidden);
      if (inert) s.setAttribute('inert', ''); else s.removeAttribute('inert');
    }
    view.remove();
  };
}

export default zoom;
