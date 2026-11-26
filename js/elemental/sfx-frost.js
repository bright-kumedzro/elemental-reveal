/* Frost's sound, tunable like the others (sound-lab.html edits the numbers; on localhost the effect plays whatever
   the lab last saved). Three parts:
   - the bed while the frost grows: a cold, whistling wind, the ice creaking (sparse glassy micro-cracks) and
     random tinkles, like ice crystals settling;
   - the crack when the sheet gives way: a sharp report and a low thump;
   - the shatter: a shower of glassy pings, from the crack and from every shard that falls. */
import { env, noiseSource } from '../sound.js';

const LAB = 'reveal:elemental:sfx:frost';
const local = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
let cached = null;
if (local && typeof addEventListener === 'function') addEventListener('storage', (e) => { if (e.key === LAB) cached = null; });

export const FROST_SCHEMA = [
  ['level', 'Volume', 0, 1.5, 0.01],
  ['wind', 'Bed: cold wind level', 0, 1.5, 0.01],
  ['windHz', 'Bed: wind Hz', 150, 4000, 10],
  ['whistle', 'Bed: wind whistle level', 0, 1, 0.01],
  ['whistleHz', 'Bed: whistle Hz', 400, 6000, 10],
  ['creak', 'Bed: ice creak level', 0, 2, 0.01],
  ['creakHz', 'Bed: creak brightness Hz', 800, 10000, 50],
  ['tinkle', 'Bed: tinkles level', 0, 1.5, 0.01],
  ['tinkleRate', 'Bed: tinkles per second', 0, 30, 0.5],
  ['pingLo', 'Pings: lowest Hz', 800, 8000, 10],
  ['pingHi', 'Pings: highest Hz', 1500, 14000, 10],
  ['ring', 'Pings: ring time (s)', 0.02, 1.2, 0.01],
  ['drive', 'Bed: how much scrolling adds', 0, 2, 0.01],
  ['crack', 'Crack: report level', 0, 1.5, 0.01],
  ['thump', 'Crack: thump level', 0, 1.5, 0.01],
  ['shatter', 'Shatter: shower level', 0, 1.5, 0.01],
  ['shatterLen', 'Shatter: length (s)', 0.1, 3, 0.05],
  ['shards', 'Shatter: falling shards level', 0, 1.5, 0.01],
  ['verb', 'Room', 0, 1, 0.01],
];

export const FROST_PRESETS = {
  'Window frost': { level: 0.9, wind: 0.35, windHz: 700, whistle: 0.12, whistleHz: 1900, creak: 0.8, creakHz: 4200, tinkle: 0.35, tinkleRate: 7, pingLo: 2400, pingHi: 8200, ring: 0.35, drive: 1, crack: 0.9, thump: 0.5, shatter: 0.8, shatterLen: 1.2, shards: 0.45, verb: 0.35 },
  'Frozen lake': { level: 0.95, wind: 0.5, windHz: 450, whistle: 0.05, whistleHz: 1200, creak: 1.2, creakHz: 2200, tinkle: 0.15, tinkleRate: 3, pingLo: 1200, pingHi: 4200, ring: 0.6, drive: 1, crack: 1.1, thump: 0.9, shatter: 0.5, shatterLen: 1.6, shards: 0.35, verb: 0.5 },
  'Icicles': { level: 0.85, wind: 0.2, windHz: 900, whistle: 0.2, whistleHz: 2600, creak: 0.5, creakHz: 6000, tinkle: 0.6, tinkleRate: 14, pingLo: 3500, pingHi: 11000, ring: 0.5, drive: 1.1, crack: 0.7, thump: 0.25, shatter: 1.1, shatterLen: 1.4, shards: 0.6, verb: 0.4 },
};
export const FROST = FROST_PRESETS['Window frost'];

export function tunedFrost() {
  if (!local) return FROST;
  if (!cached) {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(LAB) || 'null'); } catch { /* private mode */ }
    cached = saved ? { ...FROST, ...saved } : FROST;
  }
  return cached;
}
export function saveFrost(P) { try { localStorage.setItem(LAB, JSON.stringify(P)); } catch { /* private mode */ } cached = null; }
export function clearFrost() { try { localStorage.removeItem(LAB); } catch { /* private mode */ } cached = null; }

const lerp = (a, b, k) => a + (b - a) * k;

/* A small cold room, shared by everything frost plays on one output. */
function room(A) {
  if (A.__frostRoom) return A.__frostRoom;
  const c = A.ctx, len = Math.floor(c.sampleRate * 1.6), ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.6);
  }
  const cv = c.createConvolver();
  cv.buffer = ir; cv.connect(A.out);
  A.__frostRoom = cv;
  return cv;
}

/* Ice creaking: sparse micro-cracks, each a few samples of noise ringing down, some in little runs. Made once. */
function creakBuf(A) {
  if (A.__frostCreak) return A.__frostCreak;
  const c = A.ctx, sr = c.sampleRate, len = sr * 3, b = c.createBuffer(1, len, sr), d = b.getChannelData(0);
  for (let at = 0; at < len;) {
    at += Math.floor(sr * (Math.random() < 0.4 ? 0.002 + Math.random() * 0.008 : 0.03 + Math.random() * 0.15));
    const n = Math.floor(sr * (0.0004 + Math.random() * 0.0025)), amp = Math.pow(Math.random(), 1.8);
    for (let k = 0; k < n && at + k < len; k++) d[at + k] += (Math.random() * 2 - 1) * amp * Math.exp(-k / (n * 0.3));
  }
  A.__frostCreak = b;
  return b;
}

/* One glassy ping: a high sine with an inharmonic partial (×2.76, like a struck glass), ringing down. */
function ping(A, P, dest, t, gain, f) {
  const c = A.ctx, g = c.createGain(), ring = P.ring * (0.5 + Math.random());
  env(g, t, Math.max(0.001, gain), 0.001, ring);
  for (const [mul, share] of [[1, 1], [2.76, 0.35]]) {
    const o = c.createOscillator(), og = c.createGain();
    o.frequency.value = f * mul; og.gain.value = share;
    o.connect(og).connect(g); o.start(t); o.stop(t + ring + 0.05);
  }
  g.connect(dest);
}
const pingHz = (P) => Math.exp(lerp(Math.log(P.pingLo), Math.log(Math.max(P.pingLo + 1, P.pingHi)), Math.random()));

/* The running bed. set(P, freeze, act, on): freeze is how much frost is growing (0–1), act how hard you're
   scrolling (0–1), on 0 silences it. Tinkles are scheduled from set() itself, in proportion to the time since the
   last call, so they keep coming at the right rate whatever the frame rate. */
export function makeFrost(A) {
  const c = A.ctx, t = c.currentTime;
  const filt = (type, f, q) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const gain = (v) => { const g = c.createGain(); g.gain.value = v; return g; };
  const bus = gain(0); bus.connect(A.out);
  const verb = gain(0); bus.connect(verb).connect(room(A));
  const n = noiseSource(A, true), wbp = filt('bandpass', 700, 0.8), wg = gain(0), gust = gain(1);
  n.connect(wbp).connect(wg).connect(gust).connect(bus);
  const wl = c.createOscillator(), wld = gain(0.3); wl.frequency.value = 0.23;   // slow gusts
  wl.connect(wld).connect(gust.gain);
  const n2 = noiseSource(A, true), whp = filt('bandpass', 1900, 14), whg = gain(0);
  n2.connect(whp).connect(whg).connect(bus);
  const wob = c.createOscillator(), wobd = gain(120); wob.frequency.value = 0.4;   // the whistle wanders in pitch
  wob.connect(wobd).connect(whp.frequency);
  const cr = c.createBufferSource(); cr.buffer = creakBuf(A); cr.loop = true;
  const crp = filt('bandpass', 4200, 1.4), crg = gain(0);
  cr.connect(crp).connect(crg).connect(bus);
  const tinkles = gain(1); tinkles.connect(bus);
  [n, n2].forEach((x) => x.start(t, Math.random() * 2)); cr.start(t, Math.random() * 3); wl.start(t); wob.start(t);
  let last = t, P0 = null, f0 = 0;
  return {
    set(P, freeze, act, on) {
      const now = c.currentTime, T = (p, v, tc = 0.1) => p.setTargetAtTime(v, now, tc);
      const q = Math.min(1, 0.3 + act * P.drive);
      T(bus.gain, on * P.level); T(verb.gain, P.verb * 0.5);
      T(wg.gain, P.wind * (0.6 + 0.4 * q)); T(wbp.frequency, P.windHz * (0.85 + 0.3 * q));
      T(whg.gain, P.whistle * (0.4 + 0.6 * q)); T(whp.frequency, P.whistleHz);
      T(crg.gain, P.creak * freeze * (0.5 + 0.5 * q)); T(crp.frequency, P.creakHz);
      cr.playbackRate.value = 0.8 + 0.5 * q;
      // tinkles: ice crystals settling, more while it's growing fast
      const dt = Math.min(0.25, now - last); last = now;
      if (on > 0.01 && freeze > 0.01 && P.tinkle > 0.001) {
        let k = P.tinkleRate * freeze * (0.4 + 0.6 * q) * dt;
        while (k > 0) {
          if (Math.random() < Math.min(1, k)) ping(A, P, tinkles, now + Math.random() * dt, P.tinkle * (0.15 + 0.35 * Math.random()), pingHz(P));
          k -= 1;
        }
      }
      P0 = P; f0 = freeze;
    },
    silence() { bus.gain.setTargetAtTime(0, c.currentTime, 0.05); },
    dispose() { bus.gain.setTargetAtTime(0, c.currentTime, 0.03); setTimeout(() => { [n, n2, cr, wl, wob].forEach((x) => { try { x.stop(); } catch { /* already stopped */ } }); bus.disconnect(); }, 200); },
    get state() { return { P: P0, freeze: f0 }; },
  };
}

/* The sheet giving way: a sharp report and a low thump, then a shower of glassy pings. size scales it (1 for the
   sheet, smaller for a click's patch). */
export function playCrack(A, P, size = 1) {
  const c = A.ctx, t = c.currentTime;
  const filt = (type, f, q) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const bus = c.createGain(); bus.gain.value = P.level * (0.45 + 0.55 * size); bus.connect(A.out);
  const send = c.createGain(); send.gain.value = P.verb; bus.connect(send).connect(room(A));
  const end = t + P.shatterLen * (0.5 + 0.5 * size) + 0.6;
  if (P.crack > 0.001) {   // the report: bright noise, two quick cracks
    for (const [dt, k] of [[0, 1], [0.018 + Math.random() * 0.03, 0.55]]) {
      const nn = noiseSource(A), hp = filt('highpass', 2200, 0.7), g = c.createGain();
      env(g, t + dt, P.crack * k, 0.0008, 0.06);
      nn.connect(hp).connect(g).connect(bus); nn.start(t + dt, Math.random()); nn.stop(t + dt + 0.15);
    }
  }
  if (P.thump > 0.001) {   // the sheet flexing: a low, short thump
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.2);
    env(g, t, P.thump, 0.003, 0.25);
    o.connect(g).connect(bus); o.start(t); o.stop(t + 0.35);
  }
  if (P.shatter > 0.001) {   // the shower: dense at first, thinning out
    const len = P.shatterLen * (0.5 + 0.5 * size), count = Math.round(14 + 34 * size);
    for (let i = 0; i < count; i++) {
      const at = t + 0.01 + len * Math.pow(Math.random(), 2.2);
      ping(A, P, bus, at, P.shatter * (0.1 + 0.5 * Math.random()) * (1 - (at - t) / (len + 0.2)), pingHz(P));
    }
  }
  setTimeout(() => bus.disconnect(), (end - t + 1.8) * 1000);
}

/* A few shards hitting and skittering away: n is how many fell this frame. */
export function playShards(A, P, n = 1) {
  if (P.shards <= 0.001) return;
  const c = A.ctx, t = c.currentTime;
  const bus = c.createGain(); bus.gain.value = P.level; bus.connect(A.out);
  const send = c.createGain(); send.gain.value = P.verb * 0.6; bus.connect(send).connect(room(A));
  const count = Math.min(10, 1 + Math.round(n * 1.5));
  for (let i = 0; i < count; i++) ping(A, P, bus, t + Math.random() * 0.25, P.shards * (0.12 + 0.3 * Math.random()), pingHz(P) * 0.85);
  setTimeout(() => bus.disconnect(), 2200);
}
