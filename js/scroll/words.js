/* words(): word light-up. A paragraph or heading starts dim and each word lights up in turn as you scroll through it.

     import { words } from '@brightkumedzro/reveal/scroll';
     words('#manifesto');                                  // defaults: dim to 18%, a soft 2.5-word front
     words('.lede', { from: '#3a3a3a', spread: 4 });       // dim to a colour instead, softer front

   Options
     from    0.18     how dim unlit words are: an opacity (0–1) or any CSS colour
     spread  2.5      how many words the soft front between dim and lit spans
     start   0.85     the element's top, as a share of the viewport height, when the first word starts lighting
     end     0.2      where its top is when the last word is lit
   Returns { stop() }, which unwraps the words and puts the text back as it was. The words stay real text, so
   screen readers and copy-paste are unaffected; with reduced motion every word is simply lit. */
import { resolve, enter, smooth, clamp, stopAll } from './core.js';

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

export function words(target, { from = 0.18, spread = 2.5, start = 0.85, end = 0.2 } = {}) {
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
    const sp = Math.max(0.5, spread);
    const stop = enter(el, (p) => {
      const head = p * (n + sp);   // how far along the words the front has got
      for (let i = 0; i < n; i++) paint(i, smooth(clamp((head - i) / sp)));
    }, { from: start, to: end });
    stops.push(() => { stop(); unwrap(el, spans); });
  }
  return { stop: stopAll(stops) };
}

export default words;
