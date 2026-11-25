/* Tunable sound recipes: the clone poof and the sphere's whir. Each is a set of numbers (a preset) and a function
   that plays it. The techniques use the default preset. sound-lab.html edits the numbers live; when the site runs
   on localhost, whatever the lab last saved is used instead, so you can hear the tuning in context. */
import { env, noiseSource } from '../sound.js';

const LAB = 'reveal:shinobi:sfx:';
const local = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const cache = {};
if (local && typeof addEventListener === 'function') addEventListener('storage', (e) => { if (e.key?.startsWith(LAB)) delete cache[e.key.slice(LAB.length)]; });

/* The numbers to play with: the default preset, or the lab's on localhost. */
export function tuned(name, defaults) {
  if (!local) return defaults;
  if (!(name in cache)) {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(LAB + name) || 'null'); } catch {}
    cache[name] = saved ? { ...defaults, ...saved } : defaults;
  }
  return cache[name];
}
export function saveTuning(name, P) {
  try { localStorage.setItem(LAB + name, JSON.stringify(P)); } catch {}
  delete cache[name];
}
export function clearTuning(name) {
  try { localStorage.removeItem(LAB + name); } catch {}
  delete cache[name];
}

/* A small room, shared by everything played through one output. */
function room(A) {
  if (A.__room) return A.__room;
  const c = A.ctx, len = Math.floor(c.sampleRate * 1.1), ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
  }
  const cv = c.createConvolver();
  cv.buffer = ir; cv.connect(A.out);
  return (A.__room = cv);
}
const lerp = (a, b, k) => a + (b - a) * k;

/* ---------- the poof ---------- */
export const POOF_SCHEMA = [
  ['level', 'Volume', 0, 1.5, 0.01],
  ['dur', 'Length (s)', 0.1, 1.2, 0.01],
  ['atk', 'Attack (s)', 0.001, 0.08, 0.001],
  ['rnd', 'Random pitch', 0, 0.4, 0.01],
  ['body', 'Body: level', 0, 1.5, 0.01],
  ['f0', 'Body: start Hz', 200, 6000, 10],
  ['f1', 'Body: end Hz', 60, 2000, 5],
  ['sweep', 'Body: sweep time', 0.05, 1, 0.01],
  ['rf', 'Hollow: Hz', 100, 2000, 5],
  ['rq', 'Hollow: sharpness', 0.3, 12, 0.1],
  ['rg', 'Hollow: boost dB', 0, 20, 0.5],
  ['pop', 'Pop: level', 0, 1.5, 0.01],
  ['p0', 'Pop: start Hz', 60, 1200, 5],
  ['p1', 'Pop: end Hz', 30, 600, 5],
  ['popT', 'Pop: drop time', 0.02, 0.5, 0.005],
  ['popD', 'Pop: decay', 0.03, 0.8, 0.005],
  ['popWave', 'Pop: wave (0 sine · 1 triangle · 2 square · 3 saw)', 0, 3, 1],
  ['air', 'Air: level', 0, 1, 0.01],
  ['airHz', 'Air: cutoff Hz', 500, 8000, 50],
  ['click', 'Click: level', 0, 1, 0.01],
  ['verb', 'Room', 0, 1, 0.01],
  ['bigPitch', 'Big poof: pitch', 0.3, 1.2, 0.01],
  ['bigLen', 'Big poof: length', 1, 3, 0.05],
];
const WAVES = ['sine', 'triangle', 'square', 'sawtooth'];

export const POOF_PRESETS = {
  'Shadow clone': { level: 1.11, dur: 0.84, atk: 0.042, rnd: 0.32, body: 0.92, f0: 1760, f1: 885, sweep: 0.19, rf: 1335, rq: 9.8, rg: 8, pop: 0.57, p0: 1040, p1: 30, popT: 0.02, popD: 0.095, popWave: 1, air: 0.79, airHz: 5400, click: 0.12, verb: 0.59, bigPitch: 0.74, bigLen: 1.65 },
  'Hollow pomf': { level: 0.9, dur: 0.34, atk: 0.004, rnd: 0.12, body: 0.75, f0: 2400, f1: 300, sweep: 0.7, rf: 380, rq: 2.2, rg: 9, pop: 0.5, p0: 280, p1: 85, popT: 0.12, popD: 0.14, popWave: 0, air: 0.14, airHz: 1800, click: 0.5, verb: 0, bigPitch: 0.7, bigLen: 1.8 },
  'Cartoon puff': { level: 0.9, dur: 0.3, atk: 0.003, rnd: 0.1, body: 0.7, f0: 1800, f1: 250, sweep: 0.5, rf: 620, rq: 4, rg: 11, pop: 0.75, p0: 440, p1: 120, popT: 0.16, popD: 0.2, popWave: 1, air: 0.1, airHz: 2500, click: 0.35, verb: 0.28, bigPitch: 0.65, bigLen: 1.7 },
  'Smoke whoosh': { level: 0.9, dur: 0.6, atk: 0.02, rnd: 0.1, body: 0.55, f0: 3200, f1: 700, sweep: 0.9, rf: 900, rq: 1, rg: 4, pop: 0.18, p0: 220, p1: 90, popT: 0.1, popD: 0.12, popWave: 0, air: 0.55, airHz: 1500, click: 0.15, verb: 0.2, bigPitch: 0.7, bigLen: 1.6 },
  'Deep thud': { level: 1, dur: 0.45, atk: 0.003, rnd: 0.08, body: 0.8, f0: 900, f1: 110, sweep: 0.6, rf: 180, rq: 2, rg: 8, pop: 0.9, p0: 170, p1: 45, popT: 0.14, popD: 0.3, popWave: 0, air: 0.08, airHz: 2500, click: 0.25, verb: 0.15, bigPitch: 0.75, bigLen: 1.6 },
};
export const POOF = POOF_PRESETS['Shadow clone'];

/* kind: 'pop' (a clone goes) · 'back' (one comes back: it swells in) · 'big' (the split) */
export function playPoof(A, P, kind = 'pop') {
  const c = A.ctx, t = c.currentTime;
  const big = kind === 'big', back = kind === 'back';
  const k = (big ? P.bigPitch : 1) * (1 + (Math.random() * 2 - 1) * P.rnd);
  const dur = P.dur * (big ? P.bigLen : 1), atk = back ? Math.max(0.07, P.atk) : P.atk;
  const filt = (type, f, q) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const bus = c.createGain();
  bus.gain.value = P.level * (big ? 1.15 : 1);
  bus.connect(A.out);
  if (P.verb > 0.001) { const s = c.createGain(); s.gain.value = P.verb; bus.connect(s).connect(room(A)); }
  const end = t + Math.max(dur, P.popD + atk) + 0.15;

  if (P.body > 0.001) {
    const n = noiseSource(A), lp = filt('lowpass', P.f0 * k, 0.9), res = filt('peaking', P.rf * k, P.rq), g = c.createGain();
    res.gain.value = P.rg;
    lp.frequency.setValueAtTime((back ? P.f1 : P.f0) * k, t);
    lp.frequency.exponentialRampToValueAtTime((back ? P.f0 : P.f1) * k, t + dur * P.sweep);
    env(g, t, P.body, atk, dur);
    n.connect(lp).connect(res).connect(g).connect(bus);
    n.start(t, Math.random() * 1.2); n.stop(end);
  }
  if (P.pop > 0.001) {
    const o = c.createOscillator(), og = c.createGain();
    o.type = WAVES[Math.round(P.popWave)] || 'sine';
    o.frequency.setValueAtTime(P.p0 * k, t + atk * 0.5);
    o.frequency.exponentialRampToValueAtTime(P.p1 * k, t + atk + P.popT);
    env(og, t, P.pop, atk, P.popD * (big ? 1.4 : 1));
    o.connect(og).connect(bus); o.start(t); o.stop(end);
  }
  if (P.air > 0.001) {
    const a = noiseSource(A), hp = filt('highpass', P.airHz, 0.7), ag = c.createGain();
    env(ag, t, P.air, atk + 0.01, dur * 0.8);
    a.connect(hp).connect(ag).connect(bus); a.start(t, Math.random()); a.stop(end);
  }
  if (!back && P.click > 0.001) {
    const cl = noiseSource(A), bp = filt('bandpass', 1400, 1), cg = c.createGain();
    env(cg, t, P.click, 0.001, 0.025);
    cl.connect(bp).connect(cg).connect(bus); cl.start(t, Math.random()); cl.stop(t + 0.06);
  }
  setTimeout(() => bus.disconnect(), (end - t + 1.5) * 1000);
}

/* ---------- the sphere's whir ---------- */
export const WHIR_SCHEMA = [
  ['level', 'Volume', 0, 1.5, 0.01],
  ['roar', 'Roar: level', 0, 1.5, 0.01],
  ['roarLo', 'Roar: Hz uncharged', 100, 5000, 10],
  ['roarHi', 'Roar: Hz charged', 100, 8000, 10],
  ['roarQ', 'Roar: narrowness', 0.2, 10, 0.1],
  ['trem', 'Whir: depth', 0, 1, 0.01],
  ['tremLo', 'Whir: speed uncharged', 1, 80, 0.5],
  ['tremHi', 'Whir: speed charged', 1, 120, 0.5],
  ['whis', 'Whistle: level', 0, 1.5, 0.01],
  ['whisLo', 'Whistle: Hz uncharged', 300, 8000, 10],
  ['whisHi', 'Whistle: Hz charged', 300, 12000, 10],
  ['whisQ', 'Whistle: narrowness', 1, 40, 0.5],
  ['wobRate', 'Whistle: swirl speed', 0.1, 20, 0.1],
  ['wobDepth', 'Whistle: swirl depth Hz', 0, 1500, 10],
  ['tone', 'Tone: level', 0, 1, 0.01],
  ['toneWave', 'Tone: wave (0 sine · 1 triangle · 2 square · 3 saw)', 0, 3, 1],
  ['toneLo', 'Tone: Hz uncharged', 30, 3000, 5],
  ['toneHi', 'Tone: Hz charged', 30, 5000, 5],
  ['toneVib', 'Tone: vibrato Hz', 0, 200, 1],
  ['toneVibRate', 'Tone: vibrato speed', 0.1, 30, 0.1],
  ['toneCut', 'Tone: brightness Hz', 200, 12000, 50],
  ['body', 'Low wind: level', 0, 1.5, 0.01],
  ['bodyHz', 'Low wind: cutoff Hz', 60, 1500, 10],
  ['grind', 'Drilling grind: level', 0, 1.5, 0.01],
];

export const WHIR_PRESETS = {
  'Spiral sphere': { level: 0.95, roar: 0.68, roarLo: 580, roarHi: 1400, roarQ: 0.7, trem: 0.19, tremLo: 11.5, tremHi: 15.5, whis: 0.38, whisLo: 2550, whisHi: 5040, whisQ: 12, wobRate: 14.1, wobDepth: 300, tone: 0, toneWave: 0, toneLo: 165, toneHi: 1485, toneVib: 88, toneVibRate: 5, toneCut: 1600, body: 0.7, bodyHz: 1090, grind: 0.5 },
  'Wind turbine': { level: 0.9, roar: 0.6, roarLo: 1100, roarHi: 3000, roarQ: 1.1, trem: 0.63, tremLo: 16, tremHi: 38, whis: 0.32, whisLo: 2400, whisHi: 4600, whisQ: 14, wobRate: 3.2, wobDepth: 260, tone: 0, toneWave: 3, toneLo: 200, toneHi: 400, toneVib: 0, toneVibRate: 5, toneCut: 2000, body: 0.4, bodyHz: 320, grind: 0.5 },
  'High scream': { level: 0.85, roar: 0.45, roarLo: 1500, roarHi: 3500, roarQ: 0.9, trem: 0.5, tremLo: 30, tremHi: 55, whis: 0.45, whisLo: 3000, whisHi: 6000, whisQ: 18, wobRate: 5, wobDepth: 400, tone: 0.16, toneWave: 3, toneLo: 700, toneHi: 1600, toneVib: 25, toneVibRate: 6, toneCut: 4000, body: 0.25, bodyHz: 300, grind: 0.45 },
  'Buzzsaw': { level: 0.8, roar: 0.35, roarLo: 900, roarHi: 2200, roarQ: 1, trem: 0.8, tremLo: 35, tremHi: 70, whis: 0.1, whisLo: 2000, whisHi: 3500, whisQ: 10, wobRate: 2, wobDepth: 150, tone: 0.3, toneWave: 3, toneLo: 90, toneHi: 240, toneVib: 4, toneVibRate: 5, toneCut: 1800, body: 0.3, bodyHz: 300, grind: 0.6 },
  'Tornado': { level: 0.95, roar: 0.8, roarLo: 500, roarHi: 1400, roarQ: 0.7, trem: 0.4, tremLo: 8, tremHi: 16, whis: 0.2, whisLo: 1800, whisHi: 3000, whisQ: 8, wobRate: 1.5, wobDepth: 300, tone: 0, toneWave: 0, toneLo: 100, toneHi: 200, toneVib: 0, toneVibRate: 5, toneCut: 1500, body: 0.7, bodyHz: 250, grind: 0.5 },
};
export const WHIR = WHIR_PRESETS['Spiral sphere'];

/* A running whir. set(P, q, drill, here) steers it with the numbers P: q is how charged (0–1), drill how hard
   it's grinding (0–1, more for harder scrolling), here how present the sphere is (0 silences it). P is read on
   every call, so edits to it are heard straight away. */
export function makeWhir(A) {
  const c = A.ctx, t = c.currentTime;
  const filt = (type, f, q) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const gain = (v) => { const g = c.createGain(); g.gain.value = v; return g; };
  const osc = (f) => { const o = c.createOscillator(); o.frequency.value = f; return o; };

  const bus = gain(0); bus.connect(A.out);
  const n = noiseSource(A, true), n2 = noiseSource(A, true), gn = noiseSource(A, true);
  const roar = filt('bandpass', 1800, 1), rg = gain(0);
  n.connect(roar).connect(rg).connect(bus);
  const whis = filt('bandpass', 3200, 14), wg = gain(0);
  n2.connect(whis).connect(wg).connect(bus);
  const body = filt('lowpass', 320, 0.8), bg = gain(0);
  n.connect(body).connect(bg).connect(bus);
  const to = c.createOscillator(), tl = filt('lowpass', 2000, 0.7), tg = gain(0);
  to.connect(tl).connect(tg).connect(bus);
  const gb = filt('bandpass', 380, 1.3), gg = gain(0);
  gn.connect(gb).connect(gg).connect(bus);
  // one fast tremolo makes the whir, on the roar and the tone
  const trem = osc(24), td = gain(0), td2 = gain(0);
  trem.connect(td).connect(rg.gain); trem.connect(td2).connect(tg.gain);
  const wob = osc(3), wd = gain(0);
  wob.connect(wd).connect(whis.frequency);
  const vib = osc(5), vd = gain(0);
  vib.connect(vd).connect(to.frequency);
  n.start(t, Math.random()); n2.start(t, Math.random()); gn.start(t, Math.random());
  [to, trem, wob, vib].forEach((o) => o.start(t));

  const nodes = [n, n2, gn, to, trem, wob, vib];
  return {
    set(P, q, drill, here) {
      const now = c.currentTime, k = 0.08, T = (p, v, tc = k) => p.setTargetAtTime(v, now, tc);
      T(bus.gain, here * P.level * (0.45 + 0.55 * q));
      T(roar.frequency, lerp(P.roarLo, P.roarHi, q)); roar.Q.value = P.roarQ;
      T(rg.gain, P.roar * (1 - P.trem / 2)); T(td.gain, (P.roar * P.trem) / 2);
      T(trem.frequency, lerp(P.tremLo, P.tremHi, q));
      T(whis.frequency, lerp(P.whisLo, P.whisHi, q)); whis.Q.value = P.whisQ;
      T(wg.gain, P.whis); T(wob.frequency, P.wobRate); T(wd.gain, P.wobDepth);
      to.type = WAVES[Math.round(P.toneWave)] || 'sawtooth';
      T(to.frequency, lerp(P.toneLo, P.toneHi, q)); T(tl.frequency, P.toneCut);
      T(tg.gain, P.tone * (1 - P.trem / 2)); T(td2.gain, (P.tone * P.trem) / 2);
      T(vib.frequency, P.toneVibRate); T(vd.gain, P.toneVib);
      T(bg.gain, P.body); T(body.frequency, P.bodyHz);
      T(gg.gain, P.grind * drill, 0.1);
    },
    silence() { bus.gain.setTargetAtTime(0, c.currentTime, 0.05); },
    dispose() { bus.gain.setTargetAtTime(0, c.currentTime, 0.03); setTimeout(() => { nodes.forEach((x) => { try { x.stop(); } catch {} }); bus.disconnect(); }, 200); },
  };
}

/* ---------- the blade's crackle ---------- */
/* While the blade charges: a flock of chirps (six voices sweeping up over and over, each fading as it rises),
   spitting crackle, a hiss and an electric hum, all climbing with the charge. While the cut spreads, the crackle
   keeps going, harder the faster you scroll. The strike and a click's bolt are one-shots (playStrike). */
export const CRACKLE_SCHEMA = [
  ['level', 'Volume', 0, 1.5, 0.01],
  ['chirp', 'Chirps: level', 0, 1.5, 0.01],
  ['chirpWave', 'Chirps: wave (0 sine · 1 triangle · 2 square · 3 saw)', 0, 3, 1],
  ['chirpLo', 'Chirps: Hz uncharged', 200, 6000, 10],
  ['chirpHi', 'Chirps: Hz charged', 200, 8000, 10],
  ['chirpRate', 'Chirps: per second', 2, 60, 0.5],
  ['chirpDepth', 'Chirps: sweep Hz', 0, 5000, 10],
  ['chirpSpread', 'Chirps: how unlike the voices are', 0, 1, 0.01],
  ['chirpCut', 'Chirps: low cut Hz', 100, 5000, 10],
  ['crk', 'Crackle: level', 0, 1.5, 0.01],
  ['crkHz', 'Crackle: low cut Hz', 200, 8000, 50],
  ['siz', 'Hiss: level', 0, 1, 0.01],
  ['sizHz', 'Hiss: Hz', 1000, 12000, 50],
  ['sizQ', 'Hiss: narrowness', 0.3, 12, 0.1],
  ['hum', 'Hum: level', 0, 1, 0.01],
  ['humHz', 'Hum: Hz', 30, 400, 1],
  ['drive', 'Crackle while cutting', 0, 1.5, 0.01],
  ['thunder', 'Strike: volume', 0, 1.5, 0.01],
  ['crack', 'Strike: crack', 0, 1.5, 0.01],
  ['zap', 'Strike: zap', 0, 1.5, 0.01],
  ['zapHi', 'Strike: zap from Hz', 300, 8000, 10],
  ['zapLo', 'Strike: zap to Hz', 20, 1000, 5],
  ['rumble', 'Strike: rumble length (s)', 0, 4, 0.05],
];

export const CRACKLE_PRESETS = {
  'Thousand birds': { level: 0.95, chirp: 0.9, chirpWave: 3, chirpLo: 2400, chirpHi: 4000, chirpRate: 30, chirpDepth: 2200, chirpSpread: 0.7, chirpCut: 1800, crk: 0.9, crkHz: 2400, siz: 0.3, sizHz: 7000, sizQ: 1, hum: 0.04, humHz: 120, drive: 0.6, thunder: 1, crack: 0.9, zap: 0.5, zapHi: 3200, zapLo: 90, rumble: 1.4 },
  'Static storm': { level: 0.9, chirp: 0.18, chirpWave: 3, chirpLo: 2600, chirpHi: 4200, chirpRate: 12, chirpDepth: 900, chirpSpread: 0.6, chirpCut: 1800, crk: 1.1, crkHz: 1500, siz: 0.4, sizHz: 5000, sizQ: 0.8, hum: 0.08, humHz: 100, drive: 0.9, thunder: 1, crack: 0.9, zap: 0.3, zapHi: 2000, zapLo: 50, rumble: 2.4 },
  'Neon buzz': { level: 0.85, chirp: 0.3, chirpWave: 2, chirpLo: 1500, chirpHi: 2600, chirpRate: 26, chirpDepth: 700, chirpSpread: 0.25, chirpCut: 1000, crk: 0.45, crkHz: 3000, siz: 0.12, sizHz: 8000, sizQ: 2, hum: 0.45, humHz: 120, drive: 0.5, thunder: 0.8, crack: 0.5, zap: 0.6, zapHi: 3000, zapLo: 120, rumble: 1 },
  'Tesla coil': { level: 0.85, chirp: 0.4, chirpWave: 2, chirpLo: 900, chirpHi: 1700, chirpRate: 42, chirpDepth: 300, chirpSpread: 0.15, chirpCut: 600, crk: 0.9, crkHz: 2500, siz: 0.2, sizHz: 7000, sizQ: 3, hum: 0.3, humHz: 60, drive: 0.7, thunder: 0.9, crack: 0.8, zap: 0.7, zapHi: 4000, zapLo: 90, rumble: 1.2 },
};
export const CRACKLE = CRACKLE_PRESETS['Thousand birds'];

/* Sparse snaps of noise, clumped so it spits rather than hisses. Made once per output. */
function crackleBuf(A) {
  if (A.__crk) return A.__crk;
  const c = A.ctx, len = c.sampleRate * 2, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < len;) {
    i += Math.floor(c.sampleRate * (Math.random() < 0.3 ? 0.0005 + Math.random() * 0.003 : 0.004 + Math.random() * 0.02));
    const amp = Math.pow(Math.random(), 1.6), n = 2 + Math.floor(Math.random() * 40);
    for (let k = 0; k < n && i + k < len; k++) d[i + k] = (Math.random() * 2 - 1) * amp * (1 - k / n);
  }
  return (A.__crk = b);
}

/* A running crackle. set(P, q, drive, here): q is how charged (0–1; the chirps and hum follow it), drive how hard
   the cut is going (0–1+, more crackle), here 0 silences it. P is read on every call, so edits are heard at once. */
export function makeCrackle(A) {
  const c = A.ctx, t = c.currentTime;
  const filt = (type, f, q) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const gain = (v) => { const g = c.createGain(); g.gain.value = v; return g; };

  const bus = gain(0); bus.connect(A.out);
  const chirpHp = filt('highpass', 1400, 0.7), chirpG = gain(0);
  chirpHp.connect(chirpG).connect(bus);
  // each voice: a sawtooth LFO sweeps the pitch up and pulls the level down, so every cycle is one chirp
  const voices = [0, 1, 2, 3, 4, 5].map(() => {
    const o = c.createOscillator(), g = gain(0.5), lfo = c.createOscillator(), fd = gain(0), ad = gain(-0.5);
    lfo.type = 'sawtooth';
    lfo.connect(fd).connect(o.frequency); lfo.connect(ad).connect(g.gain);
    o.connect(g).connect(chirpHp);
    return { o, lfo, fd };
  });
  const crk = c.createBufferSource(); crk.buffer = crackleBuf(A); crk.loop = true;
  const crkHp = filt('highpass', 2200, 0.7), crkG = gain(0);
  crk.connect(crkHp).connect(crkG).connect(bus);
  const n = noiseSource(A, true), sz = filt('bandpass', 6500, 1.2), szG = gain(0);
  n.connect(sz).connect(szG).connect(bus);
  const hum = c.createOscillator(), humLp = filt('lowpass', 900, 0.7), humG = gain(0);
  hum.type = 'sawtooth';
  hum.connect(humLp).connect(humG).connect(bus);

  const oscs = [...voices.flatMap((v) => [v.o, v.lfo]), hum];
  oscs.forEach((o) => o.start(t));
  crk.start(t, Math.random() * 2); n.start(t, Math.random());

  return {
    set(P, q, drive, here) {
      const now = c.currentTime, T = (p, v, tc = 0.06) => p.setTargetAtTime(v, now, tc);
      T(bus.gain, here * P.level);
      T(chirpG.gain, (P.chirp * q * 1.5) / voices.length); T(chirpHp.frequency, P.chirpCut);
      voices.forEach((v, i) => {
        const m = (i / (voices.length - 1)) * 2 - 1;   // -1 … 1 across the flock
        const k = 1 + m * P.chirpSpread * 0.35;
        v.o.type = WAVES[Math.round(P.chirpWave)] || 'sawtooth';
        T(v.o.frequency, lerp(P.chirpLo, P.chirpHi, q) * k);
        T(v.lfo.frequency, P.chirpRate * (0.6 + 0.4 * q) * (1 + m * P.chirpSpread * 0.43 + (i % 2 ? 0.07 : 0)));
        T(v.fd.gain, P.chirpDepth);
      });
      T(crkG.gain, P.crk * q + P.drive * drive); T(crkHp.frequency, P.crkHz);
      T(szG.gain, P.siz * Math.max(q, drive * 0.5)); T(sz.frequency, P.sizHz); sz.Q.value = P.sizQ;
      T(hum.frequency, P.humHz * (0.8 + 0.4 * q)); T(humG.gain, P.hum * q);
    },
    silence() { bus.gain.setTargetAtTime(0, c.currentTime, 0.05); },
    dispose() { bus.gain.setTargetAtTime(0, c.currentTime, 0.03); setTimeout(() => { [...oscs, crk, n].forEach((x) => { try { x.stop(); } catch {} }); bus.disconnect(); }, 200); },
  };
}

/* The strike: a hard crack, a zap diving down, spitting crackle and a rumble rolling away. small: a click's bolt. */
export function playStrike(A, P, small = false) {
  const c = A.ctx, t = c.currentTime, k = small ? 0.55 : 1;
  const filt = (type, f, q) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const bus = c.createGain();
  bus.gain.value = P.level * P.thunder * (small ? 0.7 : 1);
  bus.connect(A.out);
  const send = c.createGain(); send.gain.value = 0.35; bus.connect(send).connect(room(A));
  const rum = small ? P.rumble * 0.35 : P.rumble, end = t + Math.max(0.6, rum) + 0.2;

  if (P.crack > 0.001) {
    const nn = noiseSource(A), hp = filt('highpass', 1800, 0.7), g = c.createGain();
    env(g, t, P.crack, 0.001, 0.14 * k);
    nn.connect(hp).connect(g).connect(bus); nn.start(t, Math.random()); nn.stop(t + 0.3);
    const cr = c.createBufferSource(), bp = filt('bandpass', 3000, 0.8), cg = c.createGain();
    cr.buffer = crackleBuf(A);
    env(cg, t, P.crack * 1.2, 0.002, 0.45 * k);
    cr.connect(bp).connect(cg).connect(bus); cr.start(t, Math.random()); cr.stop(t + 0.6);
  }
  if (P.zap > 0.001) {
    const o = c.createOscillator(), lp = filt('lowpass', 3200, 0.7), g = c.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(P.zapHi, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, P.zapLo), t + 0.35 * k);
    env(g, t, P.zap, 0.002, 0.4 * k);
    o.connect(lp).connect(g).connect(bus); o.start(t); o.stop(t + 0.5);
  }
  if (rum > 0.05) {
    const nn = noiseSource(A, true), lp = filt('lowpass', 500, 0.8), g = c.createGain();
    lp.frequency.setValueAtTime(500, t); lp.frequency.exponentialRampToValueAtTime(60, t + rum);
    env(g, t, small ? 0.3 : 0.85, 0.02, rum);
    nn.connect(lp).connect(g).connect(bus); nn.start(t, Math.random()); nn.stop(end);
  }
  setTimeout(() => bus.disconnect(), (end - t + 1.5) * 1000);
}
