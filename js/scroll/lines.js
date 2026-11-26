/* lines: SVG that draws itself as you scroll.

     import { lines } from '@brightkumedzro/reveal/scroll';
     const fx = lines('#journey', { order: 'sequence', fill: true, pen: true });
     fx.stop();   // puts every stroke back as it was

   target   an <svg>, a shape inside one, or a selector/list of either. Every path, line, polyline, polygon,
            circle, ellipse and rect inside it draws along its own length (stroke-dashoffset).
   options
     order       'sequence' (default): one after another in document order, each taking a share of the scroll
                 proportional to its length, like one pen drawing everything · 'together': all at once
     fill        true: each shape's fill fades in once its stroke is done (default false: fills untouched)
     pen         true or a colour: a small dot rides the drawing tip (default false)
     penSize     the dot's radius in the SVG's own units (default 4)
     pinned      false (default): progress runs as the SVG passes through the viewport (enter()) ·
                 true: progress runs through a tall pinned section (through()); see `track`
     track       pinned only: the tall section to measure (default: the nearest [data-lines-track], else the
                 SVG's parent)
     from, to    enter() only: where the tracked point of the SVG is (share of the viewport height) at progress 0 and 1
                 (defaults 1 and 0.5 with the centre tracked: fully drawn when the SVG's centre reaches mid-screen)
     at          enter() only: which point of the SVG is tracked, as a share of its height (0 top, 0.5 centre, 1 bottom).
                 Default 0.5; passing from or to without at tracks the top, as in v1.4 (0.9 and 0.35).
     ease        a function of 0–1 (default smoothstep)
     onProgress  called with progress 0–1 every time it changes (to fade in labels, say)

   With reduced motion on, everything is drawn straight away. Strokes need a stroke colour to be seen; shapes with
   a pathLength attribute are handled. */
import { enter, through, resolve, clamp, smooth, stopAll } from './core.js';

const SHAPES = 'path, line, polyline, polygon, circle, ellipse, rect';
const SVGNS = 'http://www.w3.org/2000/svg';

export function lines(target, o = {}) {
  const { order = 'sequence', fill = false, pen = false, penSize = 4, pinned = false, from, to, at: anchor, ease = smooth, onProgress } = o;
  const stops = [];
  for (const el of resolve(target)) {
    const svg = el instanceof SVGSVGElement ? el : el.ownerSVGElement;
    if (!svg) continue;
    const shapes = (el.matches(SHAPES) ? [el] : [...el.querySelectorAll(SHAPES)]).filter((s) => typeof s.getTotalLength === 'function');
    // measure once: real length (for the pen), dash length (pathLength may rescale the dash units), and the shape's
    // transform into the svg's coordinates (so the pen lands on the line even inside transformed groups)
    let at = 0;
    const svgCTM = svg.getCTM?.();
    const items = shapes.map((s) => {
      let len = 0;
      try { len = s.getTotalLength(); } catch { /* not rendered yet */ }
      const dash = Number(s.getAttribute('pathLength')) || len;
      let toSvg = null;
      try { const m = s.getCTM(); if (m && svgCTM) toSvg = svgCTM.inverse().multiply(m); } catch { /* detached */ }
      const item = { s, len, dash, start: at, toSvg, saved: { da: s.style.strokeDasharray, dof: s.style.strokeDashoffset, fo: s.style.fillOpacity } };
      at += len;
      return item;
    }).filter((it) => it.len > 0);
    const total = at || 1;
    for (const it of items) {
      it.s.style.strokeDasharray = `${it.dash} ${it.dash}`;
      it.s.style.strokeDashoffset = String(it.dash);
      if (fill) it.s.style.fillOpacity = '0';
    }

    let dot = null;
    if (pen && items.length) {
      dot = document.createElementNS(SVGNS, 'circle');
      dot.setAttribute('r', String(penSize));
      dot.setAttribute('aria-hidden', 'true');
      dot.style.fill = typeof pen === 'string' ? pen : getComputedStyle(items[0].s).stroke || 'currentColor';
      dot.style.opacity = '0';
      dot.style.pointerEvents = 'none';
      svg.appendChild(dot);
    }

    const apply = (p) => {
      const q = ease(clamp(p));
      const drawn = q * total;
      let tip = null;
      for (const it of items) {
        const local = order === 'together' ? q : clamp((drawn - it.start) / it.len);
        it.s.style.strokeDashoffset = String(it.dash * (1 - local));
        if (fill) {
          // the fill follows its stroke: a short fade once the stroke is complete
          const done = order === 'together' ? clamp((q - 0.85) / 0.15) : clamp((drawn - it.start - it.len) / (total * 0.06));
          it.s.style.fillOpacity = String(done);
        }
        if (local > 0 && local < 1 && (order !== 'together' || !tip)) tip = { it, local };
      }
      if (dot) {
        if (tip) {
          let pt = tip.it.s.getPointAtLength(tip.it.len * tip.local);
          if (tip.it.toSvg) pt = new DOMPoint(pt.x, pt.y).matrixTransform(tip.it.toSvg);
          dot.setAttribute('cx', String(pt.x));
          dot.setAttribute('cy', String(pt.y));
          dot.style.opacity = '1';
        } else dot.style.opacity = '0';
      }
      onProgress?.(p);
    };

    const centred = anchor !== undefined ? anchor > 0 : from === undefined && to === undefined;
    const trackEl = pinned ? (resolve(o.track)[0] || svg.closest('[data-lines-track]') || svg.parentElement) : svg;
    stops.push(pinned ? through(trackEl, apply) : enter(trackEl, apply, centred ? { from: from ?? 1, to: to ?? 0.5, at: anchor ?? 0.5 } : { from, to, at: anchor ?? 0 }));
    stops.push(() => {
      for (const it of items) {
        it.s.style.strokeDasharray = it.saved.da;
        it.s.style.strokeDashoffset = it.saved.dof;
        if (fill) it.s.style.fillOpacity = it.saved.fo;
      }
      dot?.remove();
    });
  }
  return { stop: stopAll(stops) };
}

export default lines;
