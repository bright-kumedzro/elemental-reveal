/* The sandstorm's sound, tunable in sound-lab.html like the others (sfx.js keeps the lab plumbing).
   The bed: a low roar under a howling wind that gusts, with a dry hiss and the grit of grains on top. It swells as
   the wall arrives and while you're inside it, and the hiss gets harder the faster you scroll.
   The gust: a click's dust devil, a swirl of wind that swells and dies with a soft whump under it. */
import { env, noiseSource } from '../sound.js';

export const STORM_SCHEMA = [
  ['level', 'Volume', 0, 1.5, 0.01],
  ['roar', 'Roar: level', 0, 1.5, 0.01],
  ['roarHz', 'Roar: cutoff Hz', 60, 1200, 10],
  ['howl', 'Howl: level', 0, 1.5, 0.01],
  ['howlLo', 'Howl: Hz far off', 100, 2000, 10],
  ['howlHi', 'Howl: Hz inside the wall', 100, 3000, 10],
  ['howlQ', 'Howl: narrowness', 0.5, 20, 0.1],
  ['gust', 'Gusts: depth', 0, 1, 0.01],
  ['gustRate', 'Gusts: per second', 0.05, 3, 0.01],
  ['hiss', 'Hiss: level', 0, 1.5, 0.01],
  ['hissHz', 'Hiss: low cut Hz', 500, 10000, 50],
  ['grit', 'Grit: level', 0, 1.5, 0.01],
  ['gritHz', 'Grit: low cut Hz', 200, 8000, 50],
  ['drive', 'Scroll harder: more hiss', 0, 1.5, 0.01],
  ['devil', 'Click gust: level', 0, 1.5, 0.01],
  ['devilLen', 'Click gust: length (s)', 0.3, 3, 0.05],
];

export const STORM_PRESETS = {
  'Dust wall': { level: 0.95, roar: 0.8, roarHz: 260, howl: 0.5, howlLo: 380, howlHi: 720, howlQ: 5, gust: 0.6, gustRate: 0.45, hiss: 0.3, hissHz: 3600, grit: 0.35, gritHz: 2400, drive: 0.6, devil: 0.6, devilLen: 1.2 },
  'Desert howl': { level: 0.9, roar: 0.5, roarHz: 200, howl: 0.8, howlLo: 300, howlHi: 900, howlQ: 9, gust: 0.6, gustRate: 0.22, hiss: 0.25, hissHz: 4200, grit: 0.2, gritHz: 3000, drive: 0.5, devil: 0.6, devilLen: 1.4 },
  'Sandblaster': { level: 0.9, roar: 0.55, roarHz: 340, howl: 0.2, howlLo: 500, howlHi: 800, howlQ: 3, gust: 0.25, gustRate: 0.5, hiss: 0.7, hissHz: 2600, grit: 0.8, gritHz: 1800, drive: 0.9, devil: 0.5, devilLen: 0.9 },
  'Distant rumble': { level: 0.9, roar: 1.1, roarHz: 150, howl: 0.25, howlLo: 250, howlHi: 420, howlQ: 4, gust: 0.35, gustRate: 0.15, hiss: 0.12, hissHz: 5000, grit: 0.1, gritHz: 3000, drive: 0.4, devil: 0.55, devilLen: 1.6 },
};
export const STORM = STORM_PRESETS['Dust wall'];

const lerp = (a, b, k) => a + (b - a) * k;

/* Sparse ticks of sand on paper, clumped so it rattles rather than hisses. Made once per output. */
function gritBuf(A) {
  if (A.__grit) return A.__grit;
  const c = A.ctx, len = c.sampleRate * 2, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < len;) {
    i += Math.floor(c.sampleRate * (Math.random() < 0.5 ? 0.0003 + Math.random() * 0.0015 : 0.002 + Math.random() * 0.008));
    const amp = Math.pow(Math.random(), 2.2), n = 1 + Math.floor(Math.random() * 6);
    for (let k = 0; k < n && i + k < len; k++) d[i + k] = (Math.random() * 2 - 1) * amp;
  }
  A.__grit = b;
  return b;
}

/* A running storm. set(P, q, drive): q is how much of the storm is on you (0 far off · 1 inside the wall),
   drive how hard you're scrolling (0–1). P is read on every call, so lab edits are heard straight away. */
export function makeStorm(A) {
  const c = A.ctx, t = c.currentTime;
  const filt = (type, f, q) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const gain = (v) => { const g = c.createGain(); g.gain.value = v; return g; };
  const bus = gain(0); bus.connect(A.out);
  const gusting = gain(1); gusting.connect(bus);
  const n = noiseSource(A, true), n2 = noiseSource(A, true);
  const lp = filt('lowpass', 260, 0.7), rg = gain(0);
  n.connect(lp).connect(rg).connect(gusting);
  const howl = filt('bandpass', 500, 5), hg = gain(0);
  n2.connect(howl).connect(hg).connect(gusting);
  const hp = filt('highpass', 3600, 0.7), sg = gain(0);
  n2.connect(hp).connect(sg).connect(bus);
  const gr = c.createBufferSource(); gr.buffer = gritBuf(A); gr.loop = true;
  const ghp = filt('highpass', 2400, 0.7), gg = gain(0);
  gr.connect(ghp).connect(gg).connect(bus);
  // one slow LFO swells the wind and bends the howl's pitch with it, so each gust rises and falls
  const lfo = c.createOscillator(), ld = gain(0), lp2 = gain(0);
  lfo.connect(ld).connect(gusting.gain); lfo.connect(lp2).connect(howl.frequency);
  n.start(t, Math.random() * 2); n2.start(t, Math.random() * 2); gr.start(t, Math.random() * 2); lfo.start(t);
  return {
    set(P, q, drive) {
      const now = c.currentTime, T = (p, v, tc = 0.12) => p.setTargetAtTime(v, now, tc);
      T(bus.gain, P.level * q);
      T(lp.frequency, P.roarHz * (0.7 + 0.5 * q)); T(rg.gain, P.roar);
      T(howl.frequency, lerp(P.howlLo, P.howlHi, q)); howl.Q.value = P.howlQ; T(hg.gain, P.howl);
      T(gusting.gain, 1 - P.gust / 2); T(ld.gain, P.gust / 2); T(lfo.frequency, P.gustRate); T(lp2.gain, lerp(P.howlLo, P.howlHi, q) * 0.25 * P.gust);
      T(hp.frequency, P.hissHz); T(sg.gain, P.hiss * (0.4 + 0.6 * q) + P.drive * drive * 0.5);
      T(ghp.frequency, P.gritHz); T(gg.gain, P.grit * q + P.drive * drive * 0.4);
    },
    silence() { bus.gain.setTargetAtTime(0, c.currentTime, 0.06); },
    dispose() { bus.gain.setTargetAtTime(0, c.currentTime, 0.03); setTimeout(() => { [n, n2, gr, lfo].forEach((x) => { try { x.stop(); } catch { /* already stopped */ } }); bus.disconnect(); }, 200); },
  };
}

/* A click's dust devil: a swirl of wind sweeping up and back down, a rattle of grit, and a soft whump. */
export function playGust(A, P) {
  const c = A.ctx, t = c.currentTime, L = P.devilLen;
  const bus = c.createGain(); bus.gain.value = P.level * P.devil; bus.connect(A.out);
  const n = noiseSource(A, true), bp = c.createBiquadFilter(), g = c.createGain();
  bp.type = 'bandpass'; bp.Q.value = 2.2;
  bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(1600, t + L * 0.35); bp.frequency.exponentialRampToValueAtTime(500, t + L);
  env(g, t, 0.9, L * 0.25, L * 0.75);
  n.connect(bp).connect(g).connect(bus); n.start(t, Math.random()); n.stop(t + L + 0.1);
  const gr = c.createBufferSource(), hp = c.createBiquadFilter(), gg = c.createGain();
  gr.buffer = gritBuf(A); hp.type = 'highpass'; hp.frequency.value = 2000;
  env(gg, t + 0.05, 0.7, L * 0.2, L * 0.6);
  gr.connect(hp).connect(gg).connect(bus); gr.start(t, Math.random()); gr.stop(t + L + 0.1);
  const o = c.createOscillator(), og = c.createGain();
  o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.4);
  env(og, t, 0.5, 0.01, 0.45);
  o.connect(og).connect(bus); o.start(t); o.stop(t + 0.5);
  setTimeout(() => bus.disconnect(), (L + 1.5) * 1000);
}
