/* steps: the pinned explainer. A visual stays put while step texts scroll past it; the step crossing the middle of
   the screen is the active one, and the visual changes with it.

     <section data-steps>
       <div data-steps-visual>                       sticky; its [data-step] children are its states
         <div data-step="0">…</div> <div data-step="1">…</div>
       </div>
       <ol>
         <li data-step>Discover…</li>                  the steps, in order
         <li data-step>Define…</li>
       </ol>
     </section>

     import { steps } from '@brightkumedzro/reveal/scroll';
     const fx = steps('[data-steps]', { onStep: (i, el) => console.log('now on', i) });
     fx.stop();

   What changes
     · the active step gets class `is-active` and aria-current="step"; steps before it get `is-done`
     · the visual's [data-step] children whose value is the active index (or the active step's own data-step
       value, if it has one) get `is-active`, so CSS can crossfade them
     · the container gets data-steps-active="<index>"
     · onStep(index, stepEl) when the active step changes; onProgress(index, progress 0–1 within that step)
   Steps are told apart from the visual's states by where they sit: [data-step] inside [data-steps-visual] are states.

   options
     line        where the "middle" is, as a share of the viewport height (default 0.5)
     onStep, onProgress
     layout      true (default): adds a small stylesheet once, all in :where() so your CSS wins: two columns with
                 the visual sticky beside the steps, inactive steps dimmed, states crossfading; below 760px wide the
                 visual sticks to the top with the steps scrolling under it. false: style it yourself.

   With reduced motion on, steps still switch (that's content, not motion) but nothing animates. */
import { through, resolve, reduced, clamp, stopAll } from './core.js';

const CSS = `
:where([data-steps]){display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:clamp(24px,5vw,72px);align-items:start}
:where([data-steps]) > :where([data-steps-visual]){position:sticky;top:max(16px,calc(50vh - var(--steps-visual-h,420px)/2));display:grid}
:where([data-steps-visual]) > :where([data-step]){grid-area:1/1;opacity:0;transition:opacity .5s ease,transform .5s ease;transform:translateY(8px)}
:where([data-steps-visual]) > :where([data-step].is-active){opacity:1;transform:none}
:where([data-steps]) :where([data-step]):not(:where([data-steps-visual] *)){min-height:70vh;display:flex;flex-direction:column;justify-content:center;opacity:.32;transition:opacity .4s ease}
:where([data-steps]) :where([data-step].is-active):not(:where([data-steps-visual] *)){opacity:1}
@media (max-width:760px){
  :where([data-steps]){grid-template-columns:1fr;gap:0}
  :where([data-steps]) > :where([data-steps-visual]){top:0;z-index:1;padding:12px 0;background:var(--steps-bg,inherit)}
  :where([data-steps]) :where([data-step]):not(:where([data-steps-visual] *)){min-height:60vh}
}
@media (prefers-reduced-motion:reduce){
  :where([data-steps]) :where([data-step]){transition:none!important;transform:none!important}
}`;
let styled = false;
function addStyles() {
  if (styled || typeof document === 'undefined') return;
  styled = true;
  const s = document.createElement('style');
  s.dataset.revealSteps = '';
  s.textContent = CSS;
  document.head.prepend(s);   // first, so the page's own CSS comes after it
}

export function steps(target = '[data-steps]', o = {}) {
  const { line = 0.5, onStep, onProgress, layout = true } = o;
  if (layout) addStyles();
  const stops = [];
  for (const root of resolve(target)) {
    const visual = root.querySelector('[data-steps-visual]');
    const items = [...root.querySelectorAll('[data-step]')].filter((el) => !visual?.contains(el));
    if (!items.length) continue;
    const states = visual ? [...visual.querySelectorAll('[data-step]')] : [];
    let active = -1;

    const set = (i) => {
      if (i === active) return;
      active = i;
      items.forEach((el, k) => {
        el.classList.toggle('is-active', k === i);
        el.classList.toggle('is-done', k < i);
        if (k === i) el.setAttribute('aria-current', 'step'); else el.removeAttribute('aria-current');
      });
      const name = items[i].dataset.step;
      states.forEach((s) => s.classList.toggle('is-active', s.dataset.step === String(i) || (name !== '' && s.dataset.step === name)));
      root.dataset.stepsActive = String(i);
      onStep?.(i, items[i]);
    };

    // which step is active: the last one whose top has crossed the line (works with reduced motion too, since
    // it's an IntersectionObserver on a line, not a scroll animation)
    const pick = () => {
      const y = innerHeight * line;
      let i = 0;
      items.forEach((el, k) => { if (el.getBoundingClientRect().top <= y) i = k; });
      set(i);
    };
    let io = null;
    if (typeof IntersectionObserver !== 'undefined') {
      const m = `${-Math.round(line * 100)}% 0px ${-Math.round((1 - line) * 100)}% 0px`;
      io = new IntersectionObserver(pick, { rootMargin: m, threshold: 0 });
      items.forEach((el) => io.observe(el));
    }
    pick();
    set(Math.max(0, active));

    // progress within the active step, for fine control (skipped with reduced motion: nothing to animate)
    if (onProgress && !reduced) {
      stops.push(through(root, () => {
        const r = items[active].getBoundingClientRect(), y = innerHeight * line;
        onProgress(active, clamp((y - r.top) / Math.max(1, r.height)));
      }));
    }
    // the tracker above only runs while the section scrolls; a resize can move the line, so re-pick then too
    addEventListener('resize', pick);

    stops.push(() => {
      io?.disconnect();
      removeEventListener('resize', pick);
      items.forEach((el) => { el.classList.remove('is-active', 'is-done'); el.removeAttribute('aria-current'); });
      states.forEach((s) => s.classList.remove('is-active'));
      delete root.dataset.stepsActive;
    });
  }
  return { stop: stopAll(stops) };
}

export default steps;
