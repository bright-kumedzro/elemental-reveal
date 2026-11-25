/* Sound: every sound is synthesised with Web Audio, so there are no files to load.
   It stays off until the visitor turns it on (browsers only allow audio after a click or key press anyway).
   Techniques read `ch.sound.ctx`: it's null while sound is off, so they skip their audio work entirely.

   boot(defs, { sound }) picks the mode:
     'toggle' (default)  sound controls shown, starts off (or as the visitor last left it)
     'on'                sound controls shown, starts on at the visitor's first click or key press
     'off'               no sound and no controls */
const KEY = 'elemental-reveal:sound';
const LEVEL = 0.7;

export function createSound(mode = 'toggle') {
  let ctx = null, out = null, noise = null, on = false, pending = false;
  const subs = new Set();
  const enabled = mode !== 'off';

  function ensure() {
    if (ctx) return true;
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return false;
    ctx = new AC();
    // a gentle compressor on the way out, so a strike on top of a roar doesn't clip
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 6; comp.attack.value = 0.004; comp.release.value = 0.2;
    out = ctx.createGain(); out.gain.value = 0;
    out.connect(comp); comp.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) ctx.suspend(); else if (on) ctx.resume();
    });
    return true;
  }

  const api = {
    enabled,
    get on() { return on; },
    /* the AudioContext while sound is on, else null */
    get ctx() { return on ? ctx : null; },
    get out() { return out; },
    get noise() { return noise; },
    set(v) {
      if (!enabled) return;
      v = !!v;
      if (v && !ensure()) v = false;
      if (v === on) return;
      on = v; pending = false;
      if (on) { ctx.resume(); out.gain.setTargetAtTime(LEVEL, ctx.currentTime, 0.05); }
      else if (ctx) { out.gain.setTargetAtTime(0, ctx.currentTime, 0.04); setTimeout(() => { if (!on) ctx.suspend(); }, 300); }
      try { localStorage.setItem(KEY, on ? '1' : '0'); } catch {}
      subs.forEach((f) => f(on));
    },
    toggle() { api.set(!on); },
    onChange(f) { subs.add(f); f(on); return () => subs.delete(f); },
  };

  if (enabled) {
    let saved = null;
    try { saved = localStorage.getItem(KEY); } catch {}
    // wanted on: wait for the first gesture, since audio can't start before one
    if (saved === '1' || (saved === null && mode === 'on')) {
      pending = true;
      const go = (e) => {
        if (e.target?.closest?.('[data-sound-toggle], [data-reveal-sound]')) return;   // those buttons handle themselves
        if (pending) api.set(true);
        removeEventListener('pointerdown', go, true); removeEventListener('keydown', go, true);
      };
      addEventListener('pointerdown', go, true); addEventListener('keydown', go, true);
    }
  }
  return api;
}

/* Small helpers for the techniques. */
export function env(g, t, peak, attack, decay) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}
export function noiseSource(A, loop = false) {
  const n = A.ctx.createBufferSource();
  n.buffer = A.noise; n.loop = loop;
  return n;
}
