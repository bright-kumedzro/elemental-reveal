/* The paper pack's sounds, tunable like the others (sound-lab.html edits the numbers; on localhost the effects play
   whatever the lab last saved). Paper is all texture: a crinkly rustle while a sheet moves, a soft whoosh of air as
   it turns, a crisp snap when a crease is pressed, a peel for a lifted corner, and a flap as the sheet flies off. */
import { env, noiseSource } from '../sound.js';

const LAB = 'reveal:paper:sfx:';
const local = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const cache = {};
if (local && typeof addEventListener === 'function') addEventListener('storage', (e) => { if (e.key?.startsWith(LAB)) delete cache[e.key.slice(LAB.length)]; });

/* The numbers to play with: the default preset, or the lab's on localhost. */
export function tuned(name, defaults) {
  if (!local) return defaults;
  if (!(name in cache)) {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(LAB + name) || 'null'); } catch { /* private mode */ }
    cache[name] = saved ? { ...defaults, ...saved } : defaults;
  }
  return cache[name];
}
export function saveTuning(name, P) { try { localStorage.setItem(LAB + name, JSON.stringify(P)); } catch { /* private mode */ } delete cache[name]; }
export function clearTuning(name) { try { localStorage.removeItem(LAB + name); } catch { /* private mode */ } delete cache[name]; }

const BED = [
  ['level', 'Volume', 0, 1.5, 0.01],
  ['rustle', 'Rustle: level', 0, 1.5, 0.01],
  ['rustleHz', 'Rustle: brightness Hz', 800, 9000, 50],
  ['crinkle', 'Rustle: crinkle (how crackly)', 0, 1.5, 0.01],
  ['whoosh', 'Whoosh: level', 0, 1.5, 0.01],
  ['whooshHz', 'Whoosh: Hz', 150, 4000, 10],
  ['drive', 'How much scrolling adds', 0, 2, 0.01],
  ['flap', 'Fly-off: flap level', 0, 1.5, 0.01],
  ['flapHz', 'Fly-off: flap Hz', 200, 4000, 10],
];
export const CURL_SCHEMA = [...BED, ['peel', 'Click: peel level', 0, 1.5, 0.01], ['verb', 'Room', 0, 1, 0.01]];
export const FOLD_SCHEMA = [...BED, ['snap', 'Crease: snap level', 0, 1.5, 0.01], ['snapHz', 'Crease: snap brightness Hz', 1000, 9000, 50], ['thock', 'Crease: thud level', 0, 1.5, 0.01], ['verb', 'Room', 0, 1, 0.01]];

export const CURL_PRESETS = {
  'Book page': { level: 0.9, rustle: 0.55, rustleHz: 3800, crinkle: 0.55, whoosh: 0.45, whooshHz: 700, drive: 1, flap: 0.7, flapHz: 900, peel: 0.7, verb: 0.15 },
  'Thick card': { level: 0.9, rustle: 0.35, rustleHz: 2400, crinkle: 0.3, whoosh: 0.6, whooshHz: 450, drive: 1, flap: 0.9, flapHz: 550, peel: 0.6, verb: 0.12 },
  'Tissue paper': { level: 0.85, rustle: 0.8, rustleHz: 6000, crinkle: 0.95, whoosh: 0.25, whooshHz: 1100, drive: 1.2, flap: 0.45, flapHz: 1500, peel: 0.8, verb: 0.1 },
};
export const CURL = CURL_PRESETS['Book page'];
export const FOLD_PRESETS = {
  'Printer paper': { level: 0.9, rustle: 0.5, rustleHz: 3600, crinkle: 0.6, whoosh: 0.4, whooshHz: 650, drive: 1, flap: 0.75, flapHz: 850, snap: 0.9, snapHz: 4200, thock: 0.45, verb: 0.15 },
  'Origami paper': { level: 0.9, rustle: 0.65, rustleHz: 5200, crinkle: 0.8, whoosh: 0.3, whooshHz: 900, drive: 1.1, flap: 0.6, flapHz: 1200, snap: 1.1, snapHz: 5600, thock: 0.25, verb: 0.12 },
  'Card stock': { level: 0.95, rustle: 0.35, rustleHz: 2400, crinkle: 0.35, whoosh: 0.55, whooshHz: 450, drive: 1, flap: 0.9, flapHz: 600, snap: 1, snapHz: 3000, thock: 0.8, verb: 0.18 },
};
export const FOLD = FOLD_PRESETS['Printer paper'];

const lerp = (a, b, k) => a + (b - a) * k;
const filt = (c, type, f, q) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };

/* Paper texture: a dense mat of tiny crinkles (fibres flexing), each a few samples of noise dying away, in clusters. */
function crinkleBuf(A) {
  if (A.__paper) return A.__paper;
  const c = A.ctx, sr = c.sampleRate, len = sr * 3, b = c.createBuffer(1, len, sr), d = b.getChannelData(0);
  for (let at = 0; at < len;) {
    at += Math.floor(sr * (Math.random() < 0.6 ? 0.0004 + Math.random() * 0.002 : 0.004 + Math.random() * 0.03));
    const amp = Math.pow(Math.random(), 1.8), n = 4 + Math.floor(Math.random() * 60), tau = n / 3;
    for (let k = 0; k < n && at + k < len; k++) d[at + k] += (Math.random() * 2 - 1) * amp * Math.exp(-k / tau);
  }
  A.__paper = b;
  return b;
}
function room(A) {
  if (A.__paperRoom) return A.__paperRoom;
  const c = A.ctx, len = Math.floor(c.sampleRate * 0.9), ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4); }
  const cv = c.createConvolver(); cv.buffer = ir; cv.connect(A.out);
  A.__paperRoom = cv;
  return cv;
}
function bus(A, P, size = 1) {
  const g = A.ctx.createGain(); g.gain.value = P.level * size; g.connect(A.out);
  if (P.verb > 0.001) { const s = A.ctx.createGain(); s.gain.value = P.verb; g.connect(s).connect(room(A)); }
  return g;
}

/* A running rustle. set(P, on, act, lift): on 0 silences it, act is how hard you're scrolling (0–1+), lift how far
   the sheet is off the page (0–1, brightens and swells the whoosh). P is read on every call. */
export function makeRustle(A) {
  const c = A.ctx, t = c.currentTime, out = c.createGain();
  out.gain.value = 0; out.connect(A.out);
  const cr = c.createBufferSource(); cr.buffer = crinkleBuf(A); cr.loop = true;
  const hp = filt(c, 'highpass', 1500, 0.6), bp = filt(c, 'peaking', 3800, 0.8), cg = c.createGain(); cg.gain.value = 0;
  bp.gain.value = 6;
  cr.connect(hp).connect(bp).connect(cg).connect(out);
  const n = noiseSource(A, true), nb = filt(c, 'bandpass', 3800, 0.7), ng = c.createGain(); ng.gain.value = 0;   // the smooth part of a rustle
  n.connect(nb).connect(ng).connect(out);
  const w = noiseSource(A, true), wb = filt(c, 'bandpass', 700, 1.1), wg = c.createGain(); wg.gain.value = 0;   // air moving
  w.connect(wb).connect(wg).connect(out);
  cr.start(t, Math.random() * 3); n.start(t, Math.random()); w.start(t, Math.random());
  return {
    set(P, on, act, lift = 0) {
      const now = c.currentTime, T = (p, v, tc = 0.05) => p.setTargetAtTime(v, now, tc);
      const q = Math.min(1, act * P.drive);
      T(out.gain, on * P.level);
      T(cg.gain, P.rustle * P.crinkle * 1.6 * q); T(bp.frequency, P.rustleHz); T(hp.frequency, P.rustleHz * 0.4);
      T(ng.gain, P.rustle * (1 - P.crinkle * 0.6) * 0.35 * q); T(nb.frequency, P.rustleHz);
      T(wg.gain, P.whoosh * (0.25 + 0.75 * q) * (0.3 + 0.7 * lift)); T(wb.frequency, P.whooshHz * (0.8 + 0.5 * lift));
      cr.playbackRate.value = 0.8 + 0.5 * q;
    },
    silence() { out.gain.setTargetAtTime(0, c.currentTime, 0.05); },
    dispose() { out.gain.setTargetAtTime(0, c.currentTime, 0.03); setTimeout(() => { [cr, n, w].forEach((x) => { try { x.stop(); } catch { /* stopped */ } }); out.disconnect(); }, 200); },
  };
}

/* A crease pressed flat: a crisp snap, a short crinkle and a soft thud. size scales it (a click's is smaller). */
export function playSnap(A, P, size = 1) {
  const c = A.ctx, t = c.currentTime, g = bus(A, P, size);
  const n = noiseSource(A), hp = filt(c, 'highpass', P.snapHz, 0.8), ng = c.createGain();
  env(ng, t, P.snap, 0.0008, 0.035);
  n.connect(hp).connect(ng).connect(g); n.start(t, Math.random()); n.stop(t + 0.1);
  const cr = c.createBufferSource(), bp = filt(c, 'bandpass', P.rustleHz, 0.8), cg = c.createGain();
  cr.buffer = crinkleBuf(A); env(cg, t + 0.005, P.snap * 0.9 * P.crinkle + 0.05, 0.004, 0.14);
  cr.connect(bp).connect(cg).connect(g); cr.start(t, Math.random() * 3); cr.stop(t + 0.25);
  if (P.thock > 0.001) {
    const o = c.createOscillator(), og = c.createGain();
    o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.08);
    env(og, t, P.thock, 0.002, 0.09);
    o.connect(og).connect(g); o.start(t); o.stop(t + 0.15);
  }
  setTimeout(() => g.disconnect(), 1500);
}

/* A whoosh of air as a flap swings over, dur seconds long. */
export function playWhoosh(A, P, dur = 0.5, size = 1) {
  const c = A.ctx, t = c.currentTime, g = bus(A, P, size);
  const n = noiseSource(A, true), bp = filt(c, 'bandpass', P.whooshHz * 0.6, 1.2), ng = c.createGain();
  bp.frequency.setValueAtTime(P.whooshHz * 0.6, t); bp.frequency.exponentialRampToValueAtTime(P.whooshHz * 1.6, t + dur * 0.6); bp.frequency.exponentialRampToValueAtTime(P.whooshHz * 0.8, t + dur);
  ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(Math.max(0.001, P.whoosh), t + dur * 0.55); ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(bp).connect(ng).connect(g); n.start(t, Math.random()); n.stop(t + dur + 0.05);
  const cr = c.createBufferSource(), cb = filt(c, 'bandpass', P.rustleHz, 0.7), cg = c.createGain();
  cr.buffer = crinkleBuf(A); env(cg, t, P.rustle * P.crinkle + 0.02, dur * 0.4, dur * 0.6);
  cr.connect(cb).connect(cg).connect(g); cr.start(t, Math.random() * 3); cr.stop(t + dur + 0.05);
  setTimeout(() => g.disconnect(), (dur + 1.2) * 1000);
}

/* The sheet flies off: a quick thwip of air rising, and a last flutter. */
export function playFlap(A, P, size = 1) {
  const c = A.ctx, t = c.currentTime, g = bus(A, P, size);
  const n = noiseSource(A, true), bp = filt(c, 'bandpass', P.flapHz * 0.5, 1.6), ng = c.createGain();
  bp.frequency.setValueAtTime(P.flapHz * 0.5, t); bp.frequency.exponentialRampToValueAtTime(P.flapHz * 2.2, t + 0.16);
  env(ng, t, P.flap, 0.02, 0.22);
  n.connect(bp).connect(ng).connect(g); n.start(t, Math.random()); n.stop(t + 0.4);
  // flutter: the air chopped a few times as the edge beats
  const f = noiseSource(A, true), fb = filt(c, 'bandpass', P.flapHz, 1), fg = c.createGain(), lfo = c.createOscillator(), ld = c.createGain();
  lfo.frequency.value = 22; ld.gain.value = 0.5; fg.gain.value = 0;
  lfo.connect(ld).connect(fg.gain);
  const fe = c.createGain(); env(fe, t + 0.05, P.flap * 0.6, 0.03, 0.4);
  f.connect(fb).connect(fg).connect(fe).connect(g); f.start(t, Math.random()); lfo.start(t); f.stop(t + 0.6); lfo.stop(t + 0.6);
  setTimeout(() => g.disconnect(), 1800);
}

/* A corner lifted off the page: a short sticky peel, rising. */
export function playPeel(A, P, size = 1) {
  const c = A.ctx, t = c.currentTime, g = bus(A, P, size);
  const cr = c.createBufferSource(), bp = filt(c, 'bandpass', P.rustleHz * 0.7, 1.2), cg = c.createGain();
  cr.buffer = crinkleBuf(A); cr.playbackRate.setValueAtTime(0.6, t); cr.playbackRate.linearRampToValueAtTime(1.6, t + 0.25);
  bp.frequency.setValueAtTime(P.rustleHz * 0.5, t); bp.frequency.exponentialRampToValueAtTime(P.rustleHz * 1.3, t + 0.25);
  env(cg, t, P.peel * 1.4, 0.03, 0.28);
  cr.connect(bp).connect(cg).connect(g); cr.start(t, Math.random() * 3); cr.stop(t + 0.4);
  setTimeout(() => g.disconnect(), 1400);
}

export { lerp };
