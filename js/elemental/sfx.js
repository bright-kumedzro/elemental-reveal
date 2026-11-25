/* Tunable sound recipes, one per element. Every element uses the same two voices with its own numbers:
   - the bed: a continuous sound while the element is at work (filtered noise, a low rumble, spitting crackle and a
     wobble), climbing with how hard you scroll;
   - the hit: a one-shot for the big moments (a sharp crack, a burst of noise falling away, a pitch drop, a room).
   sound-lab.html edits the numbers live; on localhost the effects play whatever the lab last saved. */
import { env, noiseSource } from '../sound.js';

const LAB = 'reveal:elemental:sfx:';
const local = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const cache = {};
if (local && typeof addEventListener === 'function') addEventListener('storage', (e) => { if (e.key?.startsWith(LAB)) delete cache[e.key.slice(LAB.length)]; });

export function tuned(name) {
  const defaults = RECIPES[name];
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

export const SCHEMA = [
  ['level', 'Volume', 0, 1.5, 0.01],
  ['body', 'Bed: noise level', 0, 1.5, 0.01],
  ['bodyLo', 'Bed: noise Hz, calm', 60, 8000, 10],
  ['bodyHi', 'Bed: noise Hz, scrolling hard', 60, 10000, 10],
  ['bodyQ', 'Bed: noise narrowness', 0.2, 12, 0.1],
  ['low', 'Bed: rumble level', 0, 1.5, 0.01],
  ['lowHz', 'Bed: rumble cutoff Hz', 30, 800, 5],
  ['crk', 'Bed: crackle level', 0, 1.5, 0.01],
  ['crkHz', 'Bed: crackle low cut Hz', 100, 8000, 50],
  ['wob', 'Bed: wobble depth', 0, 1, 0.01],
  ['wobRate', 'Bed: wobble speed', 0.1, 30, 0.05],
  ['drive', 'Bed: how much scrolling adds', 0, 2, 0.01],
  ['hit', 'Hit: burst level', 0, 1.5, 0.01],
  ['hitHz', 'Hit: burst starts at Hz', 100, 10000, 10],
  ['hitEnd', 'Hit: burst ends at Hz', 20, 4000, 5],
  ['hitLen', 'Hit: length (s)', 0.05, 4, 0.01],
  ['tone', 'Hit: tone level', 0, 1.5, 0.01],
  ['toneWave', 'Hit: tone wave (0 sine · 1 triangle · 2 square · 3 saw)', 0, 3, 1],
  ['toneHi', 'Hit: tone from Hz', 20, 5000, 5],
  ['toneLo', 'Hit: tone to Hz', 15, 2000, 1],
  ['crack', 'Hit: crack', 0, 1.5, 0.01],
  ['verb', 'Hit: room', 0, 1, 0.01],
];

export const RECIPES = {
  fire: { level: 0.9, body: 0.55, bodyLo: 280, bodyHi: 900, bodyQ: 0.7, low: 0.6, lowHz: 180, crk: 0.9, crkHz: 1500, wob: 0.35, wobRate: 7, drive: 1, hit: 1, hitHz: 2500, hitEnd: 80, hitLen: 1.6, tone: 0.7, toneWave: 0, toneHi: 120, toneLo: 35, crack: 0.5, verb: 0.3 },
  water: { level: 0.85, body: 0.7, bodyLo: 500, bodyHi: 1800, bodyQ: 0.6, low: 0.35, lowHz: 300, crk: 0.25, crkHz: 3000, wob: 0.3, wobRate: 1.3, drive: 1, hit: 0.6, hitHz: 3000, hitEnd: 400, hitLen: 0.4, tone: 0.5, toneWave: 0, toneHi: 700, toneLo: 200, crack: 0.15, verb: 0.25 },
  air: { level: 0.85, body: 0.8, bodyLo: 250, bodyHi: 1400, bodyQ: 1.4, low: 0.3, lowHz: 120, crk: 0.05, crkHz: 3000, wob: 0.6, wobRate: 0.35, drive: 1.2, hit: 0.7, hitHz: 1800, hitEnd: 300, hitLen: 0.9, tone: 0, toneWave: 0, toneHi: 200, toneLo: 100, crack: 0, verb: 0.2 },
  earth: { level: 0.95, body: 0.35, bodyLo: 150, bodyHi: 500, bodyQ: 0.9, low: 0.9, lowHz: 110, crk: 0.8, crkHz: 800, wob: 0.25, wobRate: 11, drive: 1, hit: 1, hitHz: 900, hitEnd: 50, hitLen: 1.8, tone: 0.8, toneWave: 0, toneHi: 70, toneLo: 28, crack: 0.6, verb: 0.2 },
  lightning: { level: 0.9, body: 0.15, bodyLo: 3000, bodyHi: 6000, bodyQ: 2, low: 0.2, lowHz: 100, crk: 0.6, crkHz: 2500, wob: 0.4, wobRate: 18, drive: 0.8, hit: 1, hitHz: 1500, hitEnd: 60, hitLen: 2.4, tone: 0.5, toneWave: 3, toneHi: 2400, toneLo: 80, crack: 1, verb: 0.45 },
};

const WAVES = ['sine', 'triangle', 'square', 'sawtooth'];
const lerp = (a, b, k) => a + (b - a) * k;

/* A small room, shared by everything on one output. */
function room(A) {
  if (A.__room) return A.__room;
  const c = A.ctx, len = Math.floor(c.sampleRate * 1.4), ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  const cv = c.createConvolver();
  cv.buffer = ir; cv.connect(A.out);
  A.__room = cv;
  return cv;
}
/* Sparse snaps of noise, clumped so it spits rather than hisses. Made once per output. */
function crackleBuf(A) {
  if (A.__crk) return A.__crk;
  const c = A.ctx, len = c.sampleRate * 2, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < len;) {
    i += Math.floor(c.sampleRate * (Math.random() < 0.3 ? 0.0005 + Math.random() * 0.003 : 0.004 + Math.random() * 0.02));
    const amp = Math.pow(Math.random(), 1.6), n = 2 + Math.floor(Math.random() * 40);
    for (let k = 0; k < n && i + k < len; k++) d[i + k] = (Math.random() * 2 - 1) * amp * (1 - k / n);
  }
  A.__crk = b;
  return b;
}

/* A running bed. set(P, on, act): on is how present the element is (0 silences it), act how hard you're
   scrolling (0–1). P is read on every call, so edits to it are heard straight away. */
export function makeBed(A) {
  const c = A.ctx, t = c.currentTime;
  const filt = (type, f, q) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const gain = (v) => { const g = c.createGain(); g.gain.value = v; return g; };
  const bus = gain(0); bus.connect(A.out);
  const wobble = gain(1); wobble.connect(bus);
  const n = noiseSource(A, true), bp = filt('bandpass', 600, 0.7), bg = gain(0);
  n.connect(bp).connect(bg).connect(wobble);
  const lp = filt('lowpass', 150, 0.7), lg = gain(0);
  n.connect(lp).connect(lg).connect(bus);
  const cr = c.createBufferSource(); cr.buffer = crackleBuf(A); cr.loop = true;
  const hp = filt('highpass', 1500, 0.7), cg = gain(0);
  cr.connect(hp).connect(cg).connect(wobble);
  const lfo = c.createOscillator(), ld = gain(0);
  lfo.connect(ld).connect(wobble.gain);
  n.start(t, Math.random() * 2); cr.start(t, Math.random() * 2); lfo.start(t);
  return {
    set(P, on, act) {
      const now = c.currentTime, T = (p, v, tc = 0.08) => p.setTargetAtTime(v, now, tc);
      const q = Math.min(1, 0.3 + act * P.drive);
      T(bus.gain, on * P.level * (0.35 + 0.65 * q));
      T(bp.frequency, lerp(P.bodyLo, P.bodyHi, q)); bp.Q.value = P.bodyQ;
      T(bg.gain, P.body); T(lg.gain, P.low); T(lp.frequency, P.lowHz);
      T(cg.gain, P.crk * (0.5 + 0.5 * q)); T(hp.frequency, P.crkHz);
      T(wobble.gain, 1 - P.wob / 2); T(ld.gain, P.wob / 2); T(lfo.frequency, P.wobRate);
    },
    silence() { bus.gain.setTargetAtTime(0, c.currentTime, 0.05); },
    dispose() { bus.gain.setTargetAtTime(0, c.currentTime, 0.03); setTimeout(() => { [n, cr, lfo].forEach((x) => { try { x.stop(); } catch { /* already stopped */ } }); bus.disconnect(); }, 200); },
  };
}

/* The hit: size scales it (1 is the big moment, smaller for a click). */
export function playHit(A, P, size = 1) {
  const c = A.ctx, t = c.currentTime, len = P.hitLen * (0.5 + 0.5 * size);
  const filt = (type, f, q) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const bus = c.createGain();
  bus.gain.value = P.level * Math.min(1, 0.35 + 0.65 * size);
  bus.connect(A.out);
  if (P.verb > 0.001) { const s = c.createGain(); s.gain.value = P.verb; bus.connect(s).connect(room(A)); }
  const end = t + len + 0.3;
  if (P.crack > 0.001) {
    const n = noiseSource(A), hp = filt('highpass', 1800, 0.7), g = c.createGain();
    env(g, t, P.crack, 0.001, 0.12);
    n.connect(hp).connect(g).connect(bus); n.start(t, Math.random()); n.stop(t + 0.25);
  }
  if (P.hit > 0.001) {
    const n = noiseSource(A, true), lp = filt('lowpass', P.hitHz, 0.8), g = c.createGain();
    lp.frequency.setValueAtTime(P.hitHz, t); lp.frequency.exponentialRampToValueAtTime(Math.max(20, P.hitEnd), t + len);
    env(g, t, P.hit, 0.004, len);
    n.connect(lp).connect(g).connect(bus); n.start(t, Math.random()); n.stop(end);
  }
  if (P.tone > 0.001) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = WAVES[Math.round(P.toneWave)] || 'sine';
    o.frequency.setValueAtTime(P.toneHi, t); o.frequency.exponentialRampToValueAtTime(Math.max(15, P.toneLo), t + len * 0.6);
    env(g, t, P.tone, 0.004, len * 0.7);
    o.connect(g).connect(bus); o.start(t); o.stop(end);
  }
  setTimeout(() => bus.disconnect(), (end - t + 1.6) * 1000);
}

/* A rush of air sweeping up over dur seconds, for things in flight (a comet, a fireball, a gust). */
export function playWhoosh(A, P, dur, size = 1) {
  const c = A.ctx, t = c.currentTime;
  const n = noiseSource(A, true), bp = c.createBiquadFilter(), g = c.createGain();
  bp.type = 'bandpass'; bp.Q.value = 1.2;
  bp.frequency.setValueAtTime(Math.max(60, P.bodyLo * 0.6), t); bp.frequency.exponentialRampToValueAtTime(Math.max(120, P.bodyHi * 1.3), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.001, P.level * P.body * size), t + dur * 0.85);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.25);
  n.connect(bp).connect(g).connect(A.out); n.start(t, Math.random()); n.stop(t + dur + 0.3);
}

/* What the elements call. ch.sound is the page's sound (its ctx is null while sound is off). */
const live = (ch) => ch.sound?.ctx && (ch.mode ? ch.mode === 'gl' : !!ch.gl);
export function bed(ch, name, on, act) {
  if (!live(ch)) return;
  ch.bed ||= makeBed(ch.sound);
  ch.bed.set(tuned(name), on, act);
}
export function hush(ch) { ch.bed?.silence(); }
export function hit(ch, name, size = 1) { if (live(ch)) playHit(ch.sound, tuned(name), size); }
export function whoosh(ch, name, dur, size = 1) { if (live(ch)) playWhoosh(ch.sound, tuned(name), dur, size); }
