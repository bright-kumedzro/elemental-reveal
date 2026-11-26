/* count(): numbers count up when they come into view, keeping the format they're written in.

     import { count } from '@brightkumedzro/reveal/scroll';
     count('.stat b');                          // "1,000+", "£2.3m", "98%", "4.8" all count up from 0
     count('#score', { scroll: true });         // follows the scroll instead of playing once

   Options
     from      0          the number to count from
     duration  1600       ms, when it plays once on coming into view
     ease      easeOut    a function from 0–1 to 0–1
     scroll    false      true: the count follows scroll progress through the element instead of a timer
     start     0.9        scroll mode: where the tracked point of the element is, as a share of the viewport height, at the first number
     end       0.45       scroll mode: where it is at the final number
     at        0.5        scroll mode: which point is tracked, as a share of the element's height (0.5 = centre). Passing
                          start or end without at tracks the top, as in v1.4 (0.9 and 0.4).
     locale    'en'       how the number is written while counting (grouping and decimal marks)
   Playing once starts when 30% of the element shows (30% of the viewport for an element taller than the screen).
   The number is read from the element's text: a prefix ("£", "~"), the number with its grouping and decimals,
   then a suffix ("+", "%", "m", " scholars"). Screen readers get the final text throughout; the counting digits
   are visual only. Returns { stop() }, which puts the original text back. With reduced motion it shows the final
   number straight away. */
import { resolve, enter, onceVisible, reduced, clamp, easeOut, stopAll } from './core.js';

const SR = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0';

/* "£2,300.50m+" → { prefix: '£', value: 2300.5, decimals: 2, grouped: true, suffix: 'm+' }; null if there's no number. */
export function parseNumber(text) {
  const m = /^([^\d-]*?)(-?\d[\d,]*(?:\.\d+)?)(.*)$/s.exec(text.trim());
  if (!m) return null;
  const num = m[2];
  return { prefix: m[1], value: Number(num.replace(/,/g, '')), decimals: (num.split('.')[1] || '').length, grouped: num.includes(','), suffix: m[3] };
}

export function count(target, { from = 0, duration = 1600, ease = easeOut, scroll = false, start, end, at, locale = 'en' } = {}) {
  at ??= start === undefined && end === undefined ? 0.5 : 0;
  start ??= 0.9; end ??= at ? 0.45 : 0.4;
  const stops = [];
  for (const el of resolve(target)) {
    const info = parseNumber(el.textContent);
    if (!info) continue;
    const kept = [...el.childNodes], text = el.textContent;
    const fmt = new Intl.NumberFormat(locale, { minimumFractionDigits: info.decimals, maximumFractionDigits: info.decimals, useGrouping: info.grouped });
    // the real text for screen readers, and a visual copy that counts
    const sr = document.createElement('span'), vis = document.createElement('span');
    sr.style.cssText = SR; sr.textContent = text;
    vis.setAttribute('aria-hidden', 'true');
    vis.style.fontVariantNumeric = 'tabular-nums';
    el.replaceChildren(sr, vis);
    let last = '';
    const show = (k) => {
      const s = info.prefix + fmt.format(from + (info.value - from) * k) + info.suffix;
      if (s !== last) { last = s; vis.textContent = s; }
    };
    let stop;
    if (scroll) stop = enter(el, (p) => show(ease(p)), { from: start, to: end, at });
    else if (reduced) { show(1); stop = () => {}; }
    else {
      show(0);
      let raf = 0;
      const cancelSeen = onceVisible(el, () => {
        const t0 = performance.now();
        const tick = (now) => { const t = clamp((now - t0) / duration); show(ease(t)); raf = t < 1 ? requestAnimationFrame(tick) : 0; };
        raf = requestAnimationFrame(tick);
      });
      stop = () => { cancelSeen(); cancelAnimationFrame(raf); };
    }
    stops.push(() => { stop(); el.replaceChildren(...kept); });
  }
  return { stop: stopAll(stops) };
}

export default count;
