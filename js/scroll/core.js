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
     from: where the tracked point of the element is (as a share of the viewport height, 0 = top, 1 = bottom)
           when progress is 0
     to:   where that point is when progress is 1
     at:   which point of the element is tracked, as a share of its own height: 0 = its top (default), 0.5 = its
           centre, 1 = its bottom. Tracking the centre keeps tall elements (a paragraph on a phone) from finishing
           only after they have scrolled mostly off screen.
   The defaults run from "top just entering at the bottom" (0.9) to "top a third of the way down" (0.35). */
export function enter(el, fn, { from = 0.9, to = 0.35, at = 0 } = {}) {
  return add(el, fn, (r, vh) => (from * vh - (r.top + at * r.height)) / Math.max(1, (from - to) * vh));
}

/* Raw per-frame measurement for effects that time their own parts: fn(rect, vh) runs once per frame (and once now)
   with the element's bounding rect, sharing the page's single scroll listener. Not called under reduced motion. */
export function track(el, fn) {
  const t = { update: (vh) => fn(el.getBoundingClientRect(), vh) };
  if (reduced) return () => {};
  trackers.add(t);
  listen();
  t.update(window.innerHeight);
  return () => trackers.delete(t);
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

/* Call fn once when an element first comes into view. threshold is a share of the element, but never more than the
   same share of the viewport, so an element taller than the screen still fires (a 3000px block can never show 30% of
   itself on an 800px phone). */
export function onceVisible(el, fn, { threshold = 0.3 } = {}) {
  if (reduced || typeof IntersectionObserver === 'undefined') { fn(); return () => {}; }
  const h = el.getBoundingClientRect().height, vh = window.innerHeight;
  if (h > vh) threshold = Math.min(threshold, (threshold * vh) / h);
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); fn(); } }, { threshold });
  io.observe(el);
  return () => io.disconnect();
}

/* Combine several stop() functions into one. */
export const stopAll = (stops) => () => stops.forEach((s) => s?.());
