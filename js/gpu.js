/* The GPU budget shared by every reveal and chrome() heading on the page.

   Browsers allow only so many live WebGL contexts at once (about 16 in Chrome, fewer on some phones), and when a
   page asks for more, the oldest ones silently go blank. So each effect only holds a context while it is on or
   near the screen, and all of them together hold at most `gpu.budget`. When a new one needs a context and the
   budget is full, the one that was on screen longest ago gives its context back first. An effect that can't get
   one (every context is in use on screen at once) shows its plain fallback until one frees up.

     import { gpu } from '@brightkumedzro/reveal';
     gpu.budget = 6;          // hold fewer contexts (default 8)
     gpu.live;                // how many are held right now

   Safe to import during server rendering. */

const holders = new Set();
const waiting = new Set();
let queued = false;

export const gpu = {
  /** The most WebGL contexts the library holds at once, across every effect on the page. */
  budget: 8,
  /** How many it holds right now. */
  get live() { let n = 0; for (const h of holders) if (h.live) n++; return n; },
  /** Every effect that can hold a context, for debugging: { live, visible, kind }. */
  get holders() { return [...holders]; },
};

/* Let the effects that are waiting for a context try again, once the current call has finished. */
function retryWaiting() {
  if (queued || !waiting.size) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    for (const h of [...waiting]) { waiting.delete(h); if (!h.dead) h.retry(); }
  });
}

/**
 * Register an effect that wants a context while it's near the screen.
 * @param {{ kind: string, release: () => void, retry: () => void }} hooks
 *   release: give the context back (lose it and drop GL resources); the effect falls back until it gets another
 *   retry:   called when a context may have freed up, if an earlier claim() failed
 */
export function holder({ kind, release, retry }) {
  const h = {
    kind, live: false, visible: false, seen: 0, dead: false, retry,
    /** Ask for a context. True: go ahead and create it. False: the budget is full of on-screen effects. */
    claim() {
      if (h.dead) return false;
      if (h.live) return true;
      let n = gpu.live;
      while (n >= gpu.budget) {
        let pick = null;
        for (const x of holders) if (x !== h && x.live && !x.visible && (!pick || x.seen < pick.seen)) pick = x;
        if (!pick) { waiting.add(h); return false; }
        pick.free(); n--;
      }
      h.live = true; waiting.delete(h);
      return true;
    },
    /** Give the context back (the effect's release() does the work). */
    free() {
      if (!h.live) return;
      h.live = false;
      release();
      retryWaiting();
    },
    /** The effect has lost its context without being asked (the browser took it): just update the count. */
    forget() { if (h.live) { h.live = false; retryWaiting(); } },
    /** On screen or not: the least recently seen is released first. */
    see(v) {
      h.visible = v;
      h.seen = performance.now();
      if (!v) retryWaiting();
    },
    /** Remove for good (destroy/stop). */
    drop() { h.dead = true; waiting.delete(h); if (h.live) { h.live = false; retryWaiting(); } holders.delete(h); },
  };
  holders.add(h);
  return h;
}
