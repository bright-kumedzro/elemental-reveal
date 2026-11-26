/* Snow's sound, tunable like the others (sound-lab.html edits the numbers; on localhost the effect plays whatever
   the lab last saved). Snow deadens sound, so everything here is soft and close:
   - the bed while it snows: the hush of the snowfall (a soft, dark hiss) and a low wind that gusts now and then;
   - the thaw: wet slush shifting and drips of melt plinking, as the snowpack slides off;
   - the whumpf when the snowpack settles all at once, as the thaw starts;
   - a click's gust: a whoosh of wind, a muffled whump and the crunch of snow thrown about. */
import { env, noiseSource } from '../sound.js';

const LAB = 'reveal:elemental:sfx:snow';
const local = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
let cached = null;
if (local && typeof addEventListener === 'function') addEventListener('storage', (e) => { if (e.key === LAB) cached = null; });

export const SNOW_SCHEMA = [
  ['level', 'Volume', 0, 1.5, 0.01],
  ['hush', 'Bed: snowfall hush level', 0, 1.5, 0.01],
  ['hushHz', 'Bed: hush brightness Hz', 200, 6000, 10],
  ['wind', 'Bed: wind level', 0, 1.5, 0.01],
  ['windHz', 'Bed: wind Hz', 100, 2000, 10],
  ['gusts', 'Bed: how much the wind gusts', 0, 1, 0.01],
  ['drive', 'Bed: how much scrolling adds', 0, 2, 0.01],
  ['slush', 'Thaw: slush level', 0, 1.5, 0.01],
  ['slushHz', 'Thaw: slush Hz', 100, 3000, 10],
  ['drip', 'Thaw: drips level', 0, 1.5, 0.01],
  ['dripRate', 'Thaw: drips per second', 0, 20, 0.5],
  ['dripHz', 'Thaw: drip pitch Hz', 400, 4000, 10],
  ['whump', 'Whumpf / click: thump level', 0, 1.5, 0.01],
  ['whumpHz', 'Whumpf / click: thump Hz', 30, 200, 1],
  ['crunch', 'Click: crunch level', 0, 1.5, 0.01],
  ['crunchHz', 'Click: crunch brightness Hz', 400, 6000, 10],
  ['gust', 'Click: gust whoosh level', 0, 1.5, 0.01],
  ['verb', 'Room', 0, 1, 0.01],
];

export const SNOW_PRESETS = {
  'Quiet snowfall': { level: 0.9, hush: 0.45, hushHz: 1400, wind: 0.3, windHz: 320, gusts: 0.35, drive: 1, slush: 0.5, slushHz: 700, drip: 0.35, dripRate: 5, dripHz: 1500, whump: 0.8, whumpHz: 70, crunch: 0.55, crunchHz: 2200, gust: 0.7, verb: 0.15 },
  'Blizzard': { level: 0.95, hush: 0.7, hushHz: 2600, wind: 0.75, windHz: 520, gusts: 0.7, drive: 1.2, slush: 0.4, slushHz: 600, drip: 0.2, dripRate: 3, dripHz: 1300, whump: 1, whumpHz: 60, crunch: 0.7, crunchHz: 2600, gust: 1, verb: 0.2 },
  'Spring thaw': { level: 0.9, hush: 0.3, hushHz: 1100, wind: 0.18, windHz: 260, gusts: 0.25, drive: 0.9, slush: 0.75, slushHz: 900, drip: 0.6, dripRate: 10, dripHz: 1800, whump: 0.7, whumpHz: 80, crunch: 0.4, crunchHz: 1800, gust: 0.55, verb: 0.25 },
};
export const SNOW = SNOW_PRESETS['Quiet snowfall'];

export function tunedSnow() {
  if (!local) return SNOW;
  if (!cached) {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(LAB) || 'null'); } catch { /* private mode */ }
    cached = saved ? { ...SNOW, ...saved } : SNOW;
  }
  return cached;
}
export function saveSnow(P) { try { localStorage.setItem(LAB, JSON.stringify(P)); } catch { /* private mode */ } cached = null; }
export function clearSnow() { try { localStorage.removeItem(LAB); } catch { /* private mode */ } cached = null; }

/* A small, muffled room (snow soaks up the reflections), shared by everything snow plays on one output. */
function room(A) {
  if (A.__snowRoom) return A.__snowRoom;
  const c = A.ctx, len = Math.floor(c.sampleRate * 0.9), ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) { lp += ((Math.random() * 2 - 1) - lp) * 0.25; d[i] = lp * Math.pow(1 - i / len, 4); }
  }
  const cv = c.createConvolver();
  cv.buffer = ir; cv.connect(A.out);
  A.__snowRoom = cv;
  return cv;
}

/* One drip of melt: a short sine that drops in pitch as it lands. */
function plink(A, P, dest, t, gain) {
  const c = A.ctx, o = c.createOscillator(), g = c.createGain(), f = P.dripHz * (0.75 + Math.random() * 0.6);
  o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.55, t + 0.07);
  env(g, t, Math.max(0.001, gain), 0.002, 0.11);
  o.connect(g).connect(dest); o.start(t); o.stop(t + 0.16);
}

/* Snow crunching: a run of short, dull grains of noise. */
function crunch(A, P, dest, t, level, n = 8) {
  const c = A.ctx;
  let at = t;
  for (let i = 0; i < n; i++) {
    at += 0.012 + Math.random() * 0.035;
    const nn = noiseSource(A), lp = c.createBiquadFilter(), g = c.createGain();
    lp.type = 'lowpass'; lp.frequency.value = P.crunchHz * (0.7 + Math.random() * 0.6); lp.Q.value = 0.9;
    env(g, at, Math.max(0.001, level * (0.4 + 0.6 * Math.random())), 0.002, 0.03 + Math.random() * 0.04);
    nn.connect(lp).connect(g).connect(dest); nn.start(at, Math.random() * 1.5); nn.stop(at + 0.1);
  }
}

/* A low, padded thump: a falling sine and a puff of dark noise. */
function thump(A, P, dest, t, level, len = 0.35) {
  const c = A.ctx;
  const o = c.createOscillator(), g = c.createGain();
  o.frequency.setValueAtTime(P.whumpHz * 1.6, t); o.frequency.exponentialRampToValueAtTime(P.whumpHz * 0.6, t + len * 0.7);
  env(g, t, Math.max(0.001, level), 0.012, len);
  o.connect(g).connect(dest); o.start(t); o.stop(t + len + 0.1);
  const nn = noiseSource(A), lp = c.createBiquadFilter(), ng = c.createGain();
  lp.type = 'lowpass'; lp.frequency.value = 260; lp.Q.value = 0.7;
  env(ng, t, Math.max(0.001, level * 0.8), 0.02, len * 0.9);
  nn.connect(lp).connect(ng).connect(dest); nn.start(t, Math.random()); nn.stop(t + len + 0.1);
}

/* The running bed. set(P, snow, melt, act, on): snow is how hard it's snowing (0–1), melt how much is thawing
   (0–1), act how hard you're scrolling (0–1), on 0 silences it. Drips are scheduled from set() itself, in
   proportion to the time since the last call, so they keep coming at the right rate whatever the frame rate. */
export function makeSnow(A) {
  const c = A.ctx, t = c.currentTime;
  const filt = (type, f, q) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const gain = (v) => { const g = c.createGain(); g.gain.value = v; return g; };
  const bus = gain(0); bus.connect(A.out);
  const verb = gain(0); bus.connect(verb).connect(room(A));
  // the hush: soft, dark hiss
  const n1 = noiseSource(A, true), hlp = filt('lowpass', 1400, 0.4), hhp = filt('highpass', 180, 0.5), hg = gain(0);
  n1.connect(hhp).connect(hlp).connect(hg).connect(bus);
  // the wind: low band of noise, gusting
  const n2 = noiseSource(A, true), wbp = filt('bandpass', 320, 0.7), wg = gain(0), gust = gain(1);
  n2.connect(wbp).connect(wg).connect(gust).connect(bus);
  const lfo = c.createOscillator(), lfod = gain(0.35); lfo.frequency.value = 0.13;
  lfo.connect(lfod).connect(gust.gain);
  const lfo2 = c.createOscillator(), lfo2d = gain(60); lfo2.frequency.value = 0.07;
  lfo2.connect(lfo2d).connect(wbp.frequency);
  // the slush: wet, shifting, low
  const n3 = noiseSource(A, true), slp = filt('lowpass', 700, 1.2), sg = gain(0), sw = gain(1);
  n3.connect(slp).connect(sg).connect(sw).connect(bus);
  const lfo3 = c.createOscillator(), lfo3d = gain(0.45); lfo3.frequency.value = 0.9;
  lfo3.connect(lfo3d).connect(sw.gain);
  const drips = gain(1); drips.connect(bus);
  [n1, n2, n3].forEach((x) => x.start(t, Math.random() * 2)); [lfo, lfo2, lfo3].forEach((x) => x.start(t));
  let last = t, P0 = null, s0 = 0, m0 = 0;
  return {
    set(P, snow, melt, act, on) {
      const now = c.currentTime, T = (p, v, tc = 0.12) => p.setTargetAtTime(v, now, tc);
      const q = Math.min(1, 0.3 + act * P.drive);
      T(bus.gain, on * P.level); T(verb.gain, P.verb * 0.5);
      T(hg.gain, P.hush * snow * (0.6 + 0.4 * q)); T(hlp.frequency, P.hushHz * (0.8 + 0.4 * q));
      T(wg.gain, P.wind * (0.25 + 0.75 * snow) * (0.6 + 0.4 * q)); T(wbp.frequency, P.windHz * (0.85 + 0.3 * q));
      T(lfod.gain, 0.6 * P.gusts);
      T(sg.gain, P.slush * melt * (0.4 + 0.6 * q)); T(slp.frequency, P.slushHz);
      const dt = Math.min(0.25, now - last); last = now;
      if (on > 0.01 && melt > 0.01 && P.drip > 0.001) {
        let k = P.dripRate * melt * (0.5 + 0.5 * q) * dt;
        while (k > 0) {
          if (Math.random() < Math.min(1, k)) plink(A, P, drips, now + Math.random() * dt, P.drip * (0.12 + 0.3 * Math.random()));
          k -= 1;
        }
      }
      P0 = P; s0 = snow; m0 = melt;
    },
    silence() { bus.gain.setTargetAtTime(0, c.currentTime, 0.05); },
    dispose() { bus.gain.setTargetAtTime(0, c.currentTime, 0.03); setTimeout(() => { [n1, n2, n3, lfo, lfo2, lfo3].forEach((x) => { try { x.stop(); } catch { /* already stopped */ } }); bus.disconnect(); }, 200); },
    get state() { return { P: P0, snow: s0, melt: m0 }; },
  };
}

/* The snowpack settling all at once: a deep, padded whumpf and a soft crunch spreading out. */
export function playWhump(A, P, size = 1) {
  const c = A.ctx, t = c.currentTime;
  const bus = c.createGain(); bus.gain.value = P.level; bus.connect(A.out);
  const send = c.createGain(); send.gain.value = P.verb; bus.connect(send).connect(room(A));
  if (P.whump > 0.001) thump(A, P, bus, t, P.whump * size, 0.6);
  if (P.crunch > 0.001) crunch(A, P, bus, t + 0.05, P.crunch * 0.45 * size, 10);
  setTimeout(() => bus.disconnect(), 2200);
}

/* A click's gust: wind rushing in, a muffled whump and snow crunching as it's thrown about. */
export function playGust(A, P, size = 1) {
  const c = A.ctx, t = c.currentTime;
  const bus = c.createGain(); bus.gain.value = P.level; bus.connect(A.out);
  const send = c.createGain(); send.gain.value = P.verb; bus.connect(send).connect(room(A));
  if (P.gust > 0.001) {
    const nn = noiseSource(A), bp = c.createBiquadFilter(), g = c.createGain();
    bp.type = 'bandpass'; bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(260, t); bp.frequency.exponentialRampToValueAtTime(1500, t + 0.18); bp.frequency.exponentialRampToValueAtTime(380, t + 0.75);
    env(g, t, P.gust * size, 0.07, 0.7);
    nn.connect(bp).connect(g).connect(bus); nn.start(t, Math.random()); nn.stop(t + 0.9);
  }
  if (P.whump > 0.001) thump(A, P, bus, t + 0.03, P.whump * 0.7 * size, 0.3);
  if (P.crunch > 0.001) crunch(A, P, bus, t + 0.04, P.crunch * size, 7);
  setTimeout(() => bus.disconnect(), 1800);
}
