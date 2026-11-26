/* words(): word light-up. A paragraph or heading starts dim and each word lights up in turn as you scroll through it.

     import { words } from '@brightkumedzro/reveal/scroll';
     words('#manifesto');                                  // defaults: dim to 18%, a soft 2.5-word front
     words('.lede', { from: '#3a3a3a', spread: 4 });       // dim to a colour instead, softer front

   Options
     from    0.18     how dim unlit words are: an opacity (0–1) or any CSS colour
     spread  2.5      softness of each word's fade: 0.5 (crisp) up to 3 or more (a word fades across the whole band)
     start   0.85     where a word is on screen (share of the viewport height, 0 top, 1 bottom) when it starts to light
     end     0.5      where a word is when it is fully lit: the reading band runs from start down to end
   Each word is timed by its own vertical position, so a long paragraph on a phone lights line by line as it crosses the
   band, whatever its height; words on one line light left to right. The offsets are measured once when the words are
   set up and again on resize and when fonts load, never per frame.
   Returns { stop() }, which unwraps the words and puts the text back as it was. The words stay real text, so
   screen readers and copy-paste are unaffected; with reduced motion every word is simply lit. */
import { resolve, track, reduced, smooth, clamp, stopAll } from './core.js';

/* Wrap every word of every text node in a span, keeping the spaces (and any links or emphasis around them). */
function wrap(el) {
  const spans = [], texts = [];
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.nodeValue.trim() && !n.parentElement.closest('script, style, code, pre') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  while (walk.nextNode()) texts.push(walk.currentNode);
  for (const t of texts) {
    const frag = document.createDocumentFragment();
    for (const part of t.nodeValue.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) { frag.append(part); continue; }
      const s = document.createElement('span');
      s.className = 'rv-word';
      s.textContent = part;
      frag.append(s);
      spans.push(s);
    }
    t.replaceWith(frag);
  }
  return spans;
}
function unwrap(el, spans) {
  for (const s of spans) if (s.isConnected) s.replaceWith(document.createTextNode(s.textContent));
  el.normalize();
}

export function words(target, { from = 0.18, spread = 2.5, start = 0.85, end = 0.5 } = {}) {
  const stops = [];
  for (const el of resolve(target)) {
    const spans = wrap(el), n = spans.length;
    if (!n) continue;
    const byColour = typeof from === 'string';
    const lit = byColour ? getComputedStyle(el).color : null;
    const shown = new Float32Array(n).fill(-1);
    const paint = (i, k) => {
      if (Math.abs(shown[i] - k) < 0.004) return;
      shown[i] = k;
      const s = spans[i].style;
      if (byColour) s.color = k >= 1 ? '' : `color-mix(in srgb, ${lit} ${(k * 100).toFixed(1)}%, ${from})`;
      else s.opacity = k >= 1 ? '' : (from + (1 - from) * k).toFixed(3);
    };
    // each word's position, cached: px from the element's top (plus a share of a line for the left-to-right order)
    const key = new Float32Array(n);
    const measure = () => {
      const er = el.getBoundingClientRect(), w = Math.max(1, er.width);
      for (let i = 0; i < n; i++) {
        const r = spans[i].getBoundingClientRect();
        key[i] = r.top - er.top + ((r.left - er.left) / w) * r.height * 0.9;
      }
    };
    if (reduced) { for (let i = 0; i < n; i++) paint(i, 1); stops.push(() => unwrap(el, spans)); continue; }
    measure();
    const frac = clamp(spread / 3, 0.15, 1);   // share of the band one word takes to fade in
    const stop = track(el, (r, vh) => {
      const a = start * vh, ramp = Math.max(1, (start - end) * vh * frac);
      for (let i = 0; i < n; i++) paint(i, smooth(clamp((a - (r.top + key[i])) / ramp)));
    });
    let t = 0;
    const ro = new ResizeObserver(() => { clearTimeout(t); t = setTimeout(measure, 60); });
    ro.observe(el);
    document.fonts?.ready.then(measure);
    stops.push(() => { stop(); ro.disconnect(); clearTimeout(t); unwrap(el, spans); });
  }
  return { stop: stopAll(stops) };
}

export default words;
