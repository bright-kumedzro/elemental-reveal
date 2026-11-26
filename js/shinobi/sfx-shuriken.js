/* The spiral shuriken's sound, tunable in the sound lab like the others (sfx.js keeps the lab plumbing).
   The bed: while it forms, a high screaming wind with a fast whirr and a whistle that climb as it spins up; once
   it lands, a roaring, tearing wind while the vortex shreds the page, harder the faster you scroll.
   One-shots: the throw (a whoosh that drops in pitch as it flies off), the landing (a tearing burst with a boom
   under it), and a click's small slice. */
import { env, noiseSource } from '../sound.js';

export const SHURIKEN_SCHEMA = [
  ['level', 'Volume', 0, 1.5, 0.01],
  ['scream', 'Scream: level', 0, 1.5, 0.01],
  ['screamLo', 'Scream: Hz while forming', 300, 6000, 10],
  ['screamHi', 'Scream: Hz at full spin', 300, 9000, 10],
  ['screamQ', 'Scream: narrowness', 0.5, 30, 0.1],
  ['whirr', 'Whirr: depth', 0, 1, 0.01],
  ['whirrLo', 'Whirr: speed while forming', 2, 80, 0.5],
  ['whirrHi', 'Whirr: speed at full spin', 2, 160, 0.5],
  ['whistle', 'Whistle: level', 0, 1, 0.01],
  ['whistleLo', 'Whistle: Hz while forming', 100, 3000, 5],
  ['whistleHi', 'Whistle: Hz at full spin', 100, 6000, 5],
  ['roar', 'Shredding: roar level', 0, 1.5, 0.01],
  ['roarHz', 'Shredding: roar cutoff Hz', 100, 4000, 10],
  ['rip', 'Shredding: tearing level', 0, 1.5, 0.01],
  ['drive', 'Scroll harder: more shredding', 0, 1.5, 0.01],
  ['throw', 'Throw: whoosh level', 0, 1.5, 0.01],
  ['burst', 'Landing: tearing burst level', 0, 1.5, 0.01],
  ['boom', 'Landing: boom level', 0, 1.5, 0.01],
  ['slice', 'Click: slice level', 0, 1.5, 0.01],
];

export const SHURIKEN_PRESETS = {
  'Wind blades': { level: 0.9, scream: 0.55, screamLo: 1500, screamHi: 4200, screamQ: 9, whirr: 0.65, whirrLo: 14, whirrHi: 58, whistle: 0.18, whistleLo: 700, whistleHi: 2300, roar: 0.75, roarHz: 900, rip: 0.8, drive: 0.7, throw: 0.85, burst: 0.9, boom: 0.6, slice: 0.6 },
  'Howling gale': { level: 0.9, scream: 0.4, screamLo: 800, screamHi: 2400, screamQ: 5, whirr: 0.45, whirrLo: 8, whirrHi: 30, whistle: 0.3, whistleLo: 400, whistleHi: 1400, roar: 1, roarHz: 600, rip: 0.5, drive: 0.6, throw: 0.9, burst: 0.8, boom: 0.8, slice: 0.5 },
  'Razor whine': { level: 0.85, scream: 0.7, screamLo: 2600, screamHi: 6500, screamQ: 16, whirr: 0.8, whirrLo: 30, whirrHi: 110, whistle: 0.12, whistleLo: 1200, whistleHi: 3800, roar: 0.5, roarHz: 1400, rip: 1, drive: 0.9, throw: 0.7, burst: 1, boom: 0.4, slice: 0.8 },
};
export const SHURIKEN = SHURIKEN_PRESETS['Wind blades'];

const lerp = (a, b, k) => a + (b - a) * k;

/* Paper tearing: dense runs of tiny snaps (a rip) with short gaps between them. Made once per output. */
function ripBuf(A) {
  if (A.__rip) return A.__rip;
  const c = A.ctx, sr = c.sampleRate, len = sr * 3, b = c.createBuffer(1, len, sr), d = b.getChannelData(0);
  for (let i = 0; i < len;) {
    const run = Math.floor(sr * (0.03 + Math.random() * 0.12)), loud = 0.4 + Math.random() * 0.6;
    for (let j = i; j < Math.min(len, i + run);) {
      j += Math.floor(sr * (0.0004 + Math.random() * 0.002));
      const amp = loud * Math.pow(Math.random(), 1.5), n = 2 + Math.floor(Math.random() * 10);
      for (let k = 0; k < n && j + k < len; k++) d[j + k] += (Math.random() * 2 - 1) * amp * (1 - k / n);
    }
    i += run + Math.floor(sr * (0.01 + Math.random() * 0.08));
  }
  A.__rip = b;
  return b;
}

/* A running shuriken. set(P, q, shred, drive): q is how spun up it is (0 not there · 1 full spin, which is
   also the throw), shred how much the landed vortex is tearing (0–1), drive how hard you're scrolling (0–1). */
export function makeShuriken(A) {
  const c = A.ctx, t = c.currentTime;
  const filt = (type, f, q) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const gain = (v) => { const g = c.createGain(); g.gain.value = v; return g; };
  const bus = gain(0); bus.connect(A.out);
  const whirring = gain(1); whirring.connect(bus);
  const n = noiseSource(A, true), scr = filt('bandpass', 2000, 9), sg = gain(0);
  n.connect(scr).connect(sg).connect(whirring);
  const wh = c.createOscillator(), wg = gain(0), vib = c.createOscillator(), vd = gain(0);
  vib.frequency.value = 7; vib.connect(vd).connect(wh.frequency);
  wh.connect(wg).connect(whirring);
  const tr = c.createOscillator(), td = gain(0);   // the whirr: the blades chopping the air
  tr.type = 'triangle'; tr.connect(td).connect(whirring.gain);
  const n2 = noiseSource(A, true), lp = filt('lowpass', 900, 0.7), rg = gain(0);
  n2.connect(lp).connect(rg).connect(bus);
  const rp = c.createBufferSource(); rp.buffer = ripBuf(A); rp.loop = true;
  const rhp = filt('highpass', 1400, 0.7), rpg = gain(0);
  rp.connect(rhp).connect(rpg).connect(bus);
  n.start(t, Math.random() * 2); n2.start(t, Math.random() * 2); rp.start(t, Math.random() * 3);
  [wh, vib, tr].forEach((o) => o.start(t));
  return {
    set(P, q, shred, drive) {
      const now = c.currentTime, T = (p, v, tc = 0.06) => p.setTargetAtTime(v, now, tc);
      T(bus.gain, P.level);
      T(scr.frequency, lerp(P.screamLo, P.screamHi, q)); scr.Q.value = P.screamQ; T(sg.gain, P.scream * q);
      T(whirring.gain, 1 - P.whirr / 2); T(td.gain, (P.whirr / 2) * (q > 0.01 ? 1 : 0)); T(tr.frequency, lerp(P.whirrLo, P.whirrHi, q));
      T(wh.frequency, lerp(P.whistleLo, P.whistleHi, q)); T(vd.gain, lerp(P.whistleLo, P.whistleHi, q) * 0.02); T(wg.gain, P.whistle * q);
      T(lp.frequency, P.roarHz * (0.8 + 0.6 * drive)); T(rg.gain, P.roar * shred * (0.6 + 0.4 * drive));
      T(rpg.gain, P.rip * shred * (0.35 + P.drive * drive));
    },
    silence() { bus.gain.setTargetAtTime(0, c.currentTime, 0.05); },
    dispose() { bus.gain.setTargetAtTime(0, c.currentTime, 0.03); setTimeout(() => { [n, n2, rp, wh, vib, tr].forEach((x) => { try { x.stop(); } catch { /* already stopped */ } }); bus.disconnect(); }, 200); },
  };
}

/* The throw: a whoosh sweeping down in pitch as it flies away from where it was thrown, with the whistle
   dropping under it (a doppler fall). dur is the flight, in seconds. */
export function playThrow(A, P, dur) {
  const c = A.ctx, t = c.currentTime, end = t + dur;
  const bus = c.createGain(); bus.gain.value = P.level * P.throw; bus.connect(A.out);
  const n = noiseSource(A, true), bp = c.createBiquadFilter(), g = c.createGain();
  bp.type = 'bandpass'; bp.Q.value = 3;
  bp.frequency.setValueAtTime(P.screamHi, t); bp.frequency.exponentialRampToValueAtTime(Math.max(200, P.screamLo * 0.45), end);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9, t + dur * 0.2); g.gain.exponentialRampToValueAtTime(0.25, end); g.gain.exponentialRampToValueAtTime(0.0001, end + 0.15);
  n.connect(bp).connect(g).connect(bus); n.start(t, Math.random()); n.stop(end + 0.2);
  const o = c.createOscillator(), og = c.createGain();
  o.frequency.setValueAtTime(P.whistleHi, t); o.frequency.exponentialRampToValueAtTime(Math.max(60, P.whistleLo * 0.5), end);
  og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(Math.max(0.001, P.whistle * 1.5), t + dur * 0.15); og.gain.exponentialRampToValueAtTime(0.0001, end);
  o.connect(og).connect(bus); o.start(t); o.stop(end + 0.05);
  setTimeout(() => bus.disconnect(), (dur + 1) * 1000);
}

/* The landing: the shuriken bursts into the vortex. A blast of wind falling away, a big rip of paper, and a boom. */
export function playBurst(A, P) {
  const c = A.ctx, t = c.currentTime;
  const bus = c.createGain(); bus.gain.value = P.level; bus.connect(A.out);
  if (P.burst > 0.001) {
    const n = noiseSource(A, true), lp = c.createBiquadFilter(), g = c.createGain();
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(7000, t); lp.frequency.exponentialRampToValueAtTime(350, t + 1.1);
    env(g, t, P.burst, 0.004, 1.2);
    n.connect(lp).connect(g).connect(bus); n.start(t, Math.random()); n.stop(t + 1.4);
    const r = c.createBufferSource(), hp = c.createBiquadFilter(), rg = c.createGain();
    r.buffer = ripBuf(A); hp.type = 'highpass'; hp.frequency.value = 1200;
    env(rg, t, P.burst * 1.3, 0.01, 0.9);
    r.connect(hp).connect(rg).connect(bus); r.start(t, Math.random() * 2); r.stop(t + 1.1);
  }
  if (P.boom > 0.001) {
    const o = c.createOscillator(), og = c.createGain();
    o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(34, t + 0.7);
    env(og, t, P.boom, 0.005, 0.8);
    o.connect(og).connect(bus); o.start(t); o.stop(t + 0.9);
  }
  setTimeout(() => bus.disconnect(), 2500);
}

/* A click's small shuriken: a short whoosh up, a slice, and a little rip. */
export function playSlice(A, P) {
  const c = A.ctx, t = c.currentTime;
  const bus = c.createGain(); bus.gain.value = P.level * P.slice; bus.connect(A.out);
  const n = noiseSource(A, true), bp = c.createBiquadFilter(), g = c.createGain();
  bp.type = 'bandpass'; bp.Q.value = 4;
  bp.frequency.setValueAtTime(900, t); bp.frequency.exponentialRampToValueAtTime(5000, t + 0.16);
  env(g, t, 0.8, 0.04, 0.16);
  n.connect(bp).connect(g).connect(bus); n.start(t, Math.random()); n.stop(t + 0.3);
  const s = noiseSource(A), hp = c.createBiquadFilter(), sg = c.createGain();
  hp.type = 'highpass'; hp.frequency.value = 4500;
  env(sg, t + 0.16, 0.9, 0.001, 0.05);
  s.connect(hp).connect(sg).connect(bus); s.start(t + 0.16, Math.random()); s.stop(t + 0.3);
  const r = c.createBufferSource(), rh = c.createBiquadFilter(), rg = c.createGain();
  r.buffer = ripBuf(A); rh.type = 'highpass'; rh.frequency.value = 1500;
  env(rg, t + 0.17, 0.6, 0.005, 0.25);
  r.connect(rh).connect(rg).connect(bus); r.start(t + 0.17, Math.random() * 2); r.stop(t + 0.5);
  setTimeout(() => bus.disconnect(), 1200);
}
