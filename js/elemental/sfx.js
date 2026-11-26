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

/* Fire has its own voices: a comet screaming in from space, and a real fire burning (see makeFireBed, playComet). */
export const FIRE_SCHEMA = [
  ['level', 'Volume', 0, 1.5, 0.01],
  ['shriek', 'Comet: shriek level', 0, 1.5, 0.01],
  ['shriekHi', 'Comet: shriek starts at Hz', 300, 6000, 10],
  ['shriekLo', 'Comet: shriek falls to Hz', 40, 2000, 5],
  ['roar', 'Comet: roar of air level', 0, 1.5, 0.01],
  ['roarHz', 'Comet: roar brightness at impact Hz', 200, 6000, 10],
  ['space', 'Comet: distant hiss level', 0, 1.5, 0.01],
  ['trail', 'Comet: crackling trail level', 0, 1.5, 0.01],
  ['flame', 'Burn: flame roar level', 0, 1.5, 0.01],
  ['flameHz', 'Burn: flame warmth Hz', 100, 3000, 10],
  ['flicker', 'Burn: flicker depth', 0, 1, 0.01],
  ['flickerRate', 'Burn: flicker speed', 0.1, 8, 0.05],
  ['crackle', 'Burn: crackle level', 0, 2, 0.01],
  ['crackleHz', 'Burn: crackle brightness Hz', 500, 8000, 50],
  ['pops', 'Burn: big pops level', 0, 2, 0.01],
  ['hiss', 'Burn: hiss level', 0, 1, 0.01],
  ['hissHz', 'Burn: hiss Hz', 1500, 12000, 50],
  ['drive', 'Burn: how much scrolling adds', 0, 2, 0.01],
  ['hit', 'Impact: blast level', 0, 1.5, 0.01],
  ['hitHz', 'Impact: blast starts at Hz', 100, 10000, 10],
  ['hitEnd', 'Impact: blast ends at Hz', 20, 4000, 5],
  ['hitLen', 'Impact: length (s)', 0.05, 4, 0.01],
  ['tone', 'Impact: boom level', 0, 1.5, 0.01],
  ['toneWave', 'Impact: boom wave (0 sine · 1 triangle · 2 square · 3 saw)', 0, 3, 1],
  ['toneHi', 'Impact: boom from Hz', 20, 5000, 5],
  ['toneLo', 'Impact: boom to Hz', 15, 2000, 1],
  ['crack', 'Impact: crack', 0, 1.5, 0.01],
  ['verb', 'Impact: room', 0, 1, 0.01],
];
export const schemaFor = (name) => (name === 'fire' ? FIRE_SCHEMA : SCHEMA);

export const RECIPES = {
  fire: { level: 0.95, shriek: 0.45, shriekHi: 2600, shriekLo: 1695, roar: 1.37, roarHz: 2950, space: 0.19, trail: 0.7, flame: 0.5, flameHz: 600, flicker: 0.5, flickerRate: 1.4, crackle: 1, crackleHz: 2600, pops: 0.8, hiss: 0.12, hissHz: 5500, drive: 1.22, hit: 1.3, hitHz: 340, hitEnd: 3120, hitLen: 2.85, tone: 0.03, toneWave: 2, toneHi: 125, toneLo: 1167, crack: 0.11, verb: 0.07 },   // tuned by ear in the sound lab
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

/* ---------- fire ---------- */
/* What a wood fire is made of: lots of small snaps (sap and fibre bursting) and now and then a big pop (a pocket
   of gas). Two looping buffers, made once per output, so their levels can be set apart. */
function fireBufs(A) {
  if (A.__fire) return A.__fire;
  const c = A.ctx, sr = c.sampleRate, len = sr * 4;
  const snaps = c.createBuffer(1, len, sr), pops = c.createBuffer(1, len, sr);
  const burst = (d, at, amp, ms, lp) => {   // a burst of noise that dies away fast, softened by a one-pole lowpass
    const n = Math.floor((ms / 1000) * sr * 5), tau = (ms / 1000) * sr;
    let y = 0;
    for (let k = 0; k < n && at + k < len; k++) { y += lp * ((Math.random() * 2 - 1) - y); d[at + k] += y * amp * Math.exp(-k / tau); }
  };
  const s = snaps.getChannelData(0);
  for (let at = 0; at < len;) {
    at += Math.floor(sr * (Math.random() < 0.35 ? 0.004 + Math.random() * 0.02 : 0.02 + Math.random() * 0.09));   // snaps come in little clusters
    burst(s, at, Math.pow(Math.random(), 2.2), 0.4 + Math.random() * 2.5, 0.9);
  }
  const p = pops.getChannelData(0);
  for (let at = Math.floor(sr * 0.3); at < len; at += Math.floor(sr * (0.35 + Math.random() * 1.2))) {
    burst(p, at, 0.6 + Math.random() * 0.4, 4 + Math.random() * 14, 0.35);
    if (Math.random() < 0.5) burst(p, at + Math.floor(sr * (0.006 + Math.random() * 0.02)), 0.4 * Math.random(), 2 + Math.random() * 5, 0.5);   // a pop often cracks twice
  }
  A.__fire = { snaps, pops };
  return A.__fire;
}

/* The burn: a warm roar of flame that surges and breathes, wood-fire crackle with the odd big pop, and a faint
   hiss. set(P, on, act) has the same shape as makeBed's, so it steers the same way. */
export function makeFireBed(A) {
  const c = A.ctx, t = c.currentTime, B = fireBufs(A);
  const filt = (type, f, q) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const gain = (v) => { const g = c.createGain(); g.gain.value = v; return g; };
  const loop = (buf) => { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; return s; };
  const bus = gain(0); bus.connect(A.out);
  // flame: noise through two lowpasses (a soft, dark roar), its level breathing with slow random surges
  const n = noiseSource(A, true), lp1 = filt('lowpass', 650, 0.5), lp2 = filt('lowpass', 900, 0.5), fg = gain(0), breathe = gain(1);
  n.connect(lp1).connect(lp2).connect(fg).connect(breathe).connect(bus);
  const surge = noiseSource(A, true), slp = filt('lowpass', 1.4, 0.7), sd = gain(0);   // very slow noise = uneven surges
  surge.playbackRate.value = 0.25;
  surge.connect(slp).connect(sd).connect(breathe.gain);
  const lfo = c.createOscillator(), ld = gain(0);   // and a gentle regular flicker on top
  lfo.connect(ld).connect(breathe.gain);
  // crackle: the snaps through a bandpass, and the pops a little lower and fuller
  const sn = loop(B.snaps), sbp = filt('bandpass', 2600, 0.6), sg = gain(0);
  sn.connect(sbp).connect(sg).connect(bus);
  const po = loop(B.pops), php = filt('highpass', 180, 0.7), pg = gain(0);
  po.connect(php).connect(pg).connect(bus);
  const h = noiseSource(A, true), hhp = filt('highpass', 5500, 0.7), hg = gain(0);
  h.connect(hhp).connect(hg).connect(bus);
  [n, surge, h].forEach((x) => x.start(t, Math.random() * 2));
  sn.start(t, Math.random() * 4); po.start(t, Math.random() * 4); lfo.start(t);
  return {
    set(P, on, act) {
      const now = c.currentTime, T = (p, v, tc = 0.08) => p.setTargetAtTime(v, now, tc);
      const q = Math.min(1, 0.35 + act * P.drive);
      T(bus.gain, on * P.level);
      T(fg.gain, P.flame * (0.55 + 0.45 * q)); T(lp1.frequency, P.flameHz * (0.75 + 0.5 * q)); T(lp2.frequency, P.flameHz * 1.4);
      T(breathe.gain, 1 - P.flicker * 0.45); T(sd.gain, P.flicker * 20);   // slow noise is quiet, so it needs a big boost to be heard as surges T(ld.gain, P.flicker * 0.18); T(lfo.frequency, P.flickerRate);
      T(sg.gain, P.crackle * 3.2 * (0.45 + 0.55 * q));   // the snaps are tiny, so they need lifting to sit on top of the roar T(sbp.frequency, P.crackleHz);
      T(pg.gain, P.pops * 1.8 * (0.4 + 0.6 * q));
      T(hg.gain, P.hiss * q); T(hhp.frequency, P.hissHz);
      sn.playbackRate.value = 0.85 + 0.35 * q;   // hotter fire, faster crackle
    },
    silence() { bus.gain.setTargetAtTime(0, c.currentTime, 0.05); },
    dispose() { bus.gain.setTargetAtTime(0, c.currentTime, 0.03); setTimeout(() => { [n, surge, h, sn, po, lfo].forEach((x) => { try { x.stop(); } catch { /* already stopped */ } }); bus.disconnect(); }, 200); },
  };
}

/* The comet, over dur seconds until it lands: a faint high hiss from far away, a shriek falling in pitch as it
   closes in, a roar of air building underneath, and its burning trail crackling louder. It cuts off as it hits
   (the impact itself is playHit). size scales it down for a thrown fireball. */
export function playComet(A, P, dur, size = 1) {
  const c = A.ctx, t = c.currentTime, end = t + dur, B = fireBufs(A);
  const filt = (type, f, q) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const bus = c.createGain(); bus.gain.value = P.level * size; bus.connect(A.out);
  // from: how loud each layer starts, as a share of its peak
  const swell = (g, peak, from = 0.0005, at = end) => { g.gain.setValueAtTime(Math.max(0.0005, peak * from), t); g.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), at); g.gain.setTargetAtTime(0.0001, end, 0.03); };
  const stopAll = [];
  // far off: a thin hiss, high and narrow, sliding down as it approaches, fading as the roar takes over
  if (P.space > 0.001) {
    const n = noiseSource(A, true), bp = filt('bandpass', 7000, 3), g = c.createGain();
    bp.frequency.setValueAtTime(7000, t); bp.frequency.exponentialRampToValueAtTime(1400, end);
    g.gain.setValueAtTime(0.0005, t); g.gain.exponentialRampToValueAtTime(Math.max(0.001, P.space), t + dur * 0.45); g.gain.exponentialRampToValueAtTime(0.0005, end);
    n.connect(bp).connect(g).connect(bus); n.start(t, Math.random()); stopAll.push(n);
  }
  // the shriek: two detuned saws falling in pitch, faster at the end, with a little wobble
  if (P.shriek > 0.001) {
    const g = c.createGain(), bp = filt('bandpass', P.shriekHi, 1.2);
    bp.frequency.setValueAtTime(P.shriekHi, t); bp.frequency.exponentialRampToValueAtTime(Math.max(60, P.shriekLo * 1.5), end);
    swell(g, P.shriek, 0.06);
    const wob = c.createOscillator(), wd = c.createGain(); wob.frequency.value = 11; wd.gain.value = P.shriekHi * 0.012;
    for (const det of [0, 9]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.detune.value = det;
      o.frequency.setValueAtTime(P.shriekHi, t);
      o.frequency.exponentialRampToValueAtTime(P.shriekHi * 0.85, t + dur * 0.55);   // high while far off, then it drops
      o.frequency.exponentialRampToValueAtTime(Math.max(30, P.shriekLo), end);
      wob.connect(wd).connect(o.frequency);
      o.connect(bp); o.start(t); stopAll.push(o);
    }
    bp.connect(g).connect(bus); wob.start(t); stopAll.push(wob);
  }
  // the roar of air: dark at first, brightening and swelling as it comes down on you
  if (P.roar > 0.001) {
    const n = noiseSource(A, true), lp = filt('lowpass', 250, 0.7), g = c.createGain();
    lp.frequency.setValueAtTime(250, t); lp.frequency.exponentialRampToValueAtTime(P.roarHz, end);
    swell(g, P.roar, 0.05);
    n.connect(lp).connect(g).connect(bus); n.start(t, Math.random()); stopAll.push(n);
  }
  // the trail: the fire crackle, coming closer
  if (P.trail > 0.001) {
    const s = c.createBufferSource(), bp = filt('bandpass', 3000, 0.6), g = c.createGain();
    s.buffer = B.snaps; s.loop = true; s.playbackRate.value = 1.4;
    swell(g, P.trail, 0.04);
    s.connect(bp).connect(g).connect(bus); s.start(t, Math.random() * 4); stopAll.push(s);
  }
  stopAll.forEach((x) => x.stop(end + 0.25));
  setTimeout(() => bus.disconnect(), (dur + 1) * 1000);
}

/* The right voices for an element: fire has its own; the rest share makeBed and playWhoosh. */
export const makeBedFor = (A, name) => (name === 'fire' ? makeFireBed(A) : makeBed(A));
export const playFlight = (A, name, P, dur, size = 1) => (name === 'fire' ? playComet(A, P, dur, size) : playWhoosh(A, P, dur, size));

/* What the elements call. ch.sound is the page's sound (its ctx is null while sound is off). */
const live = (ch) => ch.sound?.ctx && (ch.mode ? ch.mode === 'gl' : !!ch.gl);
export function bed(ch, name, on, act) {
  if (!live(ch)) return;
  ch.bed ||= makeBedFor(ch.sound, name);
  ch.bed.set(tuned(name), on, act);
}
export function hush(ch) { ch.bed?.silence(); }
export function hit(ch, name, size = 1) { if (live(ch)) playHit(ch.sound, tuned(name), size); }
export function whoosh(ch, name, dur, size = 1) { if (live(ch)) playFlight(ch.sound, name, tuned(name), dur, size); }
