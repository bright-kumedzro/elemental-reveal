/* The shared core of @brightkumedzro/reveal/scroll: scroll progress for elements, one listener for the whole page.
   Every scroll effect is built on these, so they behave the same way: progress runs 0 → 1 as you scroll, it is
   recomputed once per animation frame (never inside the scroll event), reduced motion jumps straight to the end
   state, and everything returns a stop() that removes what it added.

   Safe to import during server rendering: nothing touches the DOM until an effect is called. */

const hasWindow = typeof window !== 'undefined';
export const reduced = hasWindow && typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const easeOut = (t) => 1 - (1 - t) ** 3;

/* Anything an effect accepts as a target: a selector, an element, a NodeList or an array. */
export function resolve(target, root = hasWindow ? document : null) {
  if (!target || !root) return [];
  if (typeof target === 'string') return [...root.querySelectorAll(target)];
  if (target instanceof Element) return [target];
  return [...target].filter((x) => x instanceof Element);
}

/* One scroll/resize listener and one animation frame for every tracker on the page. */
const trackers = new Set();
let raf = 0, listening = false;
function frame() {
  raf = 0;
  const vh = window.innerHeight;
  for (const t of trackers) t.update(vh);
}
const schedule = () => { if (!raf) raf = requestAnimationFrame(frame); };
function listen() {
  if (listening || !hasWindow) return;
  listening = true;
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule);
}

/* Progress as an element passes through the viewport.
     from: where the element's top is (as a share of the viewport height, 0 = top, 1 = bottom) when progress is 0
     to:   where its top is when progress is 1
   The defaults run from "top just entering at the bottom" (0.9) to "top a third of the way down" (0.35). */
export function enter(el, fn, { from = 0.9, to = 0.35 } = {}) {
  return add(el, fn, (r, vh) => (from * vh - r.top) / Math.max(1, (from - to) * vh));
}

/* Progress through a tall section whose content is pinned (position: sticky) while you scroll past it:
   0 when the section's top reaches the top of the viewport, 1 when its bottom reaches the bottom. */
export function through(el, fn) {
  return add(el, fn, (r, vh) => -r.top / Math.max(1, r.height - vh));
}

function add(el, fn, measure) {
  let last = -1;
  const t = {
    update(vh) {
      const p = reduced ? 1 : clamp(measure(el.getBoundingClientRect(), vh));
      if (p !== last) { last = p; fn(p); }
    },
  };
  trackers.add(t);
  listen();
  t.update(window.innerHeight);
  return () => trackers.delete(t);
}

/* Call fn once when an element first comes into view (threshold: how much of it must show). */
export function onceVisible(el, fn, { threshold = 0.3 } = {}) {
  if (reduced || typeof IntersectionObserver === 'undefined') { fn(); return () => {}; }
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); fn(); } }, { threshold });
  io.observe(el);
  return () => io.disconnect();
}

/* Combine several stop() functions into one. */
export const stopAll = (stops) => () => stops.forEach((s) => s?.());
