/* Ink Draw's sound, tunable like the others (sound-lab.html edits the numbers; on localhost the effect plays
   whatever the lab last saved). Three parts:
   - the bed while the pen draws: a nib scratching over paper (band-passed noise, pulsed into strokes, faster and
     scratchier the harder you scroll), the paper's tooth ticking under it, and now and then the nib tapping down;
   - a soft watercolour wash swelling in as the colour floods the inked shapes;
   - the dab when you click: the nib thudding down and a wet splat of ink. */
import { env, noiseSource } from '../sound.js';

const LAB = 'reveal:paper:sfx:draw';
const local = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
let cached = null;
if (local && typeof addEventListener === 'function') addEventListener('storage', (e) => { if (e.key === LAB) cached = null; });

export const DRAW_SCHEMA = [
  ['level', 'Volume', 0, 1.5, 0.01],
  ['nib', 'Nib: scratch level', 0, 1.5, 0.01],
  ['nibHz', 'Nib: scratch Hz', 600, 9000, 10],
  ['nibQ', 'Nib: scratch narrowness', 0.3, 10, 0.1],
  ['strokes', 'Nib: strokes per second', 1, 20, 0.1],
  ['strokeDepth', 'Nib: how separate the strokes are', 0, 1, 0.01],
  ['grit', 'Paper: tooth ticking level', 0, 1.5, 0.01],
  ['gritHz', 'Paper: tooth low cut Hz', 1000, 10000, 50],
  ['taps', 'Nib: taps level', 0, 1.5, 0.01],
  ['tapRate', 'Nib: taps per second', 0, 12, 0.1],
  ['drive', 'How much scrolling adds', 0, 2, 0.01],
  ['wash', 'Wash: level', 0, 1.5, 0.01],
  ['washHz', 'Wash: softness Hz', 150, 4000, 10],
  ['dab', 'Click: dab level', 0, 1.5, 0.01],
  ['splat', 'Click: wet splat level', 0, 1.5, 0.01],
  ['verb', 'Room', 0, 1, 0.01],
];

export const DRAW_PRESETS = {
  'Fountain pen': { level: 0.9, nib: 0.55, nibHz: 3400, nibQ: 1.6, strokes: 6.5, strokeDepth: 0.7, grit: 0.45, gritHz: 4500, taps: 0.4, tapRate: 2.5, drive: 1, wash: 0.35, washHz: 700, dab: 0.7, splat: 0.6, verb: 0.12 },
  'Dip pen': { level: 0.9, nib: 0.75, nibHz: 5200, nibQ: 2.6, strokes: 8, strokeDepth: 0.85, grit: 0.7, gritHz: 6000, taps: 0.6, tapRate: 4, drive: 1.1, wash: 0.25, washHz: 600, dab: 0.8, splat: 0.7, verb: 0.1 },
  'Felt tip': { level: 0.85, nib: 0.6, nibHz: 1800, nibQ: 0.8, strokes: 5, strokeDepth: 0.6, grit: 0.15, gritHz: 3500, taps: 0.2, tapRate: 1.5, drive: 1, wash: 0.3, washHz: 600, dab: 0.5, splat: 0.4, verb: 0.08 },
  'Brush and ink': { level: 0.9, nib: 0.35, nibHz: 1200, nibQ: 0.7, strokes: 3, strokeDepth: 0.5, grit: 0.25, gritHz: 3000, taps: 0.1, tapRate: 1, drive: 0.9, wash: 0.6, washHz: 900, dab: 0.6, splat: 0.9, verb: 0.15 },
};
export const DRAW = DRAW_PRESETS['Fountain pen'];

export function tunedDraw() {
  if (!local) return DRAW;
  if (!cached) {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(LAB) || 'null'); } catch { /* private mode */ }
    cached = saved ? { ...DRAW, ...saved } : DRAW;
  }
  return cached;
}
export function saveDraw(P) { try { localStorage.setItem(LAB, JSON.stringify(P)); } catch { /* private mode */ } cached = null; }
export function clearDraw() { try { localStorage.removeItem(LAB); } catch { /* private mode */ } cached = null; }

/* A small room, shared by everything this plays on one output. */
function room(A) {
  if (A.__drawRoom) return A.__drawRoom;
  const c = A.ctx, len = Math.floor(c.sampleRate * 0.9), ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
  }
  const cv = c.createConvolver();
  cv.buffer = ir; cv.connect(A.out);
  A.__drawRoom = cv;
  return cv;
}

/* The paper's tooth: dense, tiny ticks as the nib drags over the fibres. Made once per output. */
function toothBuf(A) {
  if (A.__drawTooth) return A.__drawTooth;
  const c = A.ctx, sr = c.sampleRate, len = sr * 2, b = c.createBuffer(1, len, sr), d = b.getChannelData(0);
  for (let at = 0; at < len;) {
    at += Math.floor(sr * (0.0008 + Math.random() * 0.006));
    const n = 2 + Math.floor(Math.random() * 10), amp = Math.pow(Math.random(), 2.4);
    for (let k = 0; k < n && at + k < len; k++) d[at + k] += (Math.random() * 2 - 1) * amp * (1 - k / n);
  }
  A.__drawTooth = b;
  return b;
}

/* One tap of the nib touching down: a tiny click with a little body under it. */
function tap(A, P, dest, t, gain) {
  const c = A.ctx;
  const n = noiseSource(A), bp = c.createBiquadFilter(), g = c.createGain();
  bp.type = 'bandpass'; bp.frequency.value = P.nibHz * (0.6 + Math.random() * 0.5); bp.Q.value = 1.2;
  env(g, t, Math.max(0.001, gain), 0.001, 0.025);
  n.connect(bp).connect(g).connect(dest); n.start(t, Math.random()); n.stop(t + 0.06);
  const o = c.createOscillator(), og = c.createGain();
  o.frequency.setValueAtTime(420 + Math.random() * 200, t); o.frequency.exponentialRampToValueAtTime(160, t + 0.03);
  env(og, t, Math.max(0.001, gain * 0.35), 0.001, 0.04);
  o.connect(og).connect(dest); o.start(t); o.stop(t + 0.06);
}

/* The running bed. set(P, drawing, washing, act, on): drawing is how much the pen is at work (0–1), washing how much
   colour is flooding in (0–1), act how hard you're scrolling (0–1), on 0 silences it. Taps are scheduled from set()
   in proportion to the time since the last call, so they keep their rate whatever the frame rate. */
export function makeDraw(A) {
  const c = A.ctx, t = c.currentTime;
  const filt = (type, f, q) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const gain = (v) => { const g = c.createGain(); g.gain.value = v; return g; };
  const bus = gain(0); bus.connect(A.out);
  const verb = gain(0); bus.connect(verb).connect(room(A));
  // the nib: noise through a bandpass, pulsed into strokes by two LFOs (a steady one and a wandering one)
  const n = noiseSource(A, true), nbp = filt('bandpass', 3400, 1.6), ng = gain(0), stroke = gain(1);
  n.connect(nbp).connect(ng).connect(stroke).connect(bus);
  const l1 = c.createOscillator(), l1d = gain(0), l2 = c.createOscillator(), l2d = gain(0);
  l1.connect(l1d).connect(stroke.gain); l2.connect(l2d).connect(stroke.gain);
  // the paper's tooth
  const tooth = c.createBufferSource(); tooth.buffer = toothBuf(A); tooth.loop = true;
  const thp = filt('highpass', 4500, 0.7), tg = gain(0);
  tooth.connect(thp).connect(tg).connect(stroke);
  // the wash: soft, dark noise swelling slowly
  const w = noiseSource(A, true), wlp = filt('lowpass', 700, 0.5), wlp2 = filt('lowpass', 1100, 0.5), wg = gain(0), swell = gain(1);
  w.connect(wlp).connect(wlp2).connect(wg).connect(swell).connect(bus);
  const wl = c.createOscillator(), wld = gain(0.25); wl.frequency.value = 0.31;
  wl.connect(wld).connect(swell.gain);
  [n, w].forEach((x) => x.start(t, Math.random() * 2)); tooth.start(t, Math.random() * 2);
  [l1, l2, wl].forEach((o) => o.start(t));
  let last = t;
  return {
    set(P, drawing, washing, act, on = 1) {
      const now = c.currentTime, T = (p, v, tc = 0.06) => p.setTargetAtTime(v, now, tc);
      const q = Math.min(1, 0.3 + act * P.drive);
      T(bus.gain, on * P.level); T(verb.gain, P.verb);
      T(ng.gain, P.nib * drawing * (0.55 + 0.45 * q)); T(nbp.frequency, P.nibHz * (0.9 + 0.25 * q)); nbp.Q.value = P.nibQ;
      const rate = P.strokes * (0.6 + 0.8 * q);
      T(l1.frequency, rate); T(l2.frequency, rate * 0.37 + 0.4);
      T(stroke.gain, 1 - P.strokeDepth * 0.5); T(l1d.gain, P.strokeDepth * 0.32); T(l2d.gain, P.strokeDepth * 0.18);
      T(tg.gain, P.grit * drawing * q); T(thp.frequency, P.gritHz);
      T(wg.gain, P.wash * washing); T(wlp.frequency, P.washHz); T(wlp2.frequency, P.washHz * 1.6);
      // taps: the nib lifting and touching down between strokes
      const dt = Math.min(0.25, Math.max(0, now - last)); last = now;
      if (on > 0 && drawing > 0.05 && P.taps > 0.001) {
        let k = P.tapRate * drawing * (0.6 + 0.8 * q) * dt;
        while (k > 0) { if (Math.random() < Math.min(1, k)) tap(A, P, bus, now + Math.random() * dt, P.taps * (0.4 + 0.6 * Math.random())); k -= 1; }
      }
    },
    silence() { bus.gain.setTargetAtTime(0, c.currentTime, 0.05); },
    dispose() {
      bus.gain.setTargetAtTime(0, c.currentTime, 0.03);
      setTimeout(() => { [n, w, tooth, l1, l2, wl].forEach((x) => { try { x.stop(); } catch { /* already stopped */ } }); bus.disconnect(); }, 200);
    },
  };
}

/* A click's dab: the nib thudding down and a wet splat of ink spreading. size scales it. */
export function playDab(A, P, size = 1) {
  const c = A.ctx, t = c.currentTime;
  const bus = c.createGain(); bus.gain.value = P.level * size; bus.connect(A.out);
  if (P.verb > 0.001) { const s = c.createGain(); s.gain.value = P.verb * 1.5; bus.connect(s).connect(room(A)); }
  if (P.dab > 0.001) {
    const n = noiseSource(A), lp = c.createBiquadFilter(), g = c.createGain();
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(140, t + 0.12);
    env(g, t, P.dab, 0.002, 0.14);
    n.connect(lp).connect(g).connect(bus); n.start(t, Math.random()); n.stop(t + 0.2);
    tap(A, P, bus, t, P.dab * 0.6);
  }
  if (P.splat > 0.001) {
    const n = noiseSource(A), bp = c.createBiquadFilter(), g = c.createGain();
    bp.type = 'bandpass'; bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(2600, t + 0.01); bp.frequency.exponentialRampToValueAtTime(900, t + 0.3);
    env(g, t + 0.01, P.splat, 0.006, 0.3);
    n.connect(bp).connect(g).connect(bus); n.start(t, Math.random()); n.stop(t + 0.4);
  }
  setTimeout(() => bus.disconnect(), 1500);
}
