/* The magma sphere's sound, tunable in sound-lab.html like the others (sfx.js keeps the lab plumbing).
   The bed: while it charges, a deep rumble with lava bubbling and gurgling in it, swelling as the sphere grows;
   once it has sunk in, the sizzle and spit of molten rock eating through paper, harder the faster you scroll.
   The sink: a heavy hiss and a thud as it drops into the page. The blob: a click's plop and hiss. */
import { env, noiseSource } from '../sound.js';

export const MAGMA_SCHEMA = [
  ['level', 'Volume', 0, 1.5, 0.01],
  ['rumble', 'Rumble: level', 0, 1.5, 0.01],
  ['rumbleHz', 'Rumble: cutoff Hz', 30, 600, 5],
  ['bubbles', 'Bubbles: level', 0, 2, 0.01],
  ['bubbleHz', 'Bubbles: pitch Hz', 40, 400, 1],
  ['gurgle', 'Gurgle: level', 0, 1.5, 0.01],
  ['sizzle', 'Sizzle: level', 0, 1.5, 0.01],
  ['sizzleHz', 'Sizzle: low cut Hz', 1000, 10000, 50],
  ['spit', 'Spitting crackle: level', 0, 2, 0.01],
  ['drive', 'Scroll harder: more sizzle', 0, 1.5, 0.01],
  ['sink', 'Sink: hiss level', 0, 1.5, 0.01],
  ['thud', 'Sink: thud level', 0, 1.5, 0.01],
  ['sinkLen', 'Sink: length (s)', 0.3, 4, 0.05],
  ['blob', 'Click blob: level', 0, 1.5, 0.01],
];

export const MAGMA_PRESETS = {
  'Lava sphere': { level: 0.95, rumble: 0.85, rumbleHz: 140, bubbles: 0.9, bubbleHz: 140, gurgle: 0.4, sizzle: 0.35, sizzleHz: 3800, spit: 0.8, drive: 0.7, sink: 0.8, thud: 0.9, sinkLen: 1.6, blob: 0.7 },
  'Volcano': { level: 0.95, rumble: 1.2, rumbleHz: 90, bubbles: 0.6, bubbleHz: 90, gurgle: 0.6, sizzle: 0.3, sizzleHz: 3000, spit: 1, drive: 0.8, sink: 0.9, thud: 1.2, sinkLen: 2.2, blob: 0.7 },
  'Boiling pot': { level: 0.9, rumble: 0.45, rumbleHz: 200, bubbles: 1.3, bubbleHz: 210, gurgle: 0.3, sizzle: 0.25, sizzleHz: 4500, spit: 0.5, drive: 0.6, sink: 0.6, thud: 0.6, sinkLen: 1.2, blob: 0.8 },
  'Branding iron': { level: 0.9, rumble: 0.4, rumbleHz: 120, bubbles: 0.4, bubbleHz: 120, gurgle: 0.2, sizzle: 0.8, sizzleHz: 2500, spit: 1.2, drive: 0.9, sink: 1.1, thud: 0.6, sinkLen: 2, blob: 0.6 },
};
export const MAGMA = MAGMA_PRESETS['Lava sphere'];

/* Lava bubbles: each one a short sine whose pitch rises as it closes up (the "bloop"), at uneven intervals,
   a few big and slow, most small. Made once per output; playback rate sets the pitch. */
function bubbleBuf(A) {
  if (A.__bubbles) return A.__bubbles;
  const c = A.ctx, sr = c.sampleRate, len = sr * 4, b = c.createBuffer(1, len, sr), d = b.getChannelData(0);
  for (let at = 0; at < len;) {
    at += Math.floor(sr * (0.05 + Math.random() * 0.32));
    const big = Math.random() < 0.25, f0 = 140 * (big ? 0.55 + Math.random() * 0.3 : 0.8 + Math.random() * 0.9);
    const dur = (big ? 0.09 : 0.035) + Math.random() * 0.05, n = Math.floor(dur * sr), amp = (big ? 0.9 : 0.35 + Math.random() * 0.4);
    let ph = 0;
    for (let k = 0; k < n && at + k < len; k++) {
      const u = k / n, f = f0 * (1 + 1.8 * u * u);          // rising pitch as the bubble closes
      ph += (2 * Math.PI * f) / sr;
      d[at + k] += Math.sin(ph) * amp * Math.sin(Math.PI * Math.min(1, u * 4)) * Math.exp(-u * 3.5);
    }
  }
  A.__bubbles = b;
  return b;
}
/* Spitting: tiny sharp snaps, clumped, like fat in a hot pan. */
function spitBuf(A) {
  if (A.__spit) return A.__spit;
  const c = A.ctx, sr = c.sampleRate, len = sr * 3, b = c.createBuffer(1, len, sr), d = b.getChannelData(0);
  for (let at = 0; at < len;) {
    at += Math.floor(sr * (Math.random() < 0.4 ? 0.002 + Math.random() * 0.01 : 0.015 + Math.random() * 0.07));
    const amp = Math.pow(Math.random(), 1.8), n = 2 + Math.floor(Math.random() * 30);
    for (let k = 0; k < n && at + k < len; k++) d[at + k] += (Math.random() * 2 - 1) * amp * Math.exp(-k / (n * 0.3));
  }
  A.__spit = b;
  return b;
}

/* A running magma sound. set(P, q, melt, drive): q how charged the sphere is (0–1, the rumble and bubbles),
   melt how much is melting (0–1, the sizzle and spitting), drive how hard you're scrolling (0–1). */
export function makeMagma(A) {
  const c = A.ctx, t = c.currentTime;
  const filt = (type, f, q) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const gain = (v) => { const g = c.createGain(); g.gain.value = v; return g; };
  const loop = (buf) => { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; return s; };
  const bus = gain(0); bus.connect(A.out);
  const n = noiseSource(A, true), lp = filt('lowpass', 140, 0.7), rg = gain(0);
  n.connect(lp).connect(rg).connect(bus);
  // the gurgle: the rumble through a wandering resonance, like something thick moving
  const gb = filt('bandpass', 220, 4), gg = gain(0), gl = c.createOscillator(), gd = gain(90);
  gl.frequency.value = 0.7; gl.connect(gd).connect(gb.frequency);
  n.connect(gb).connect(gg).connect(bus);
  const bu = loop(bubbleBuf(A)), blp = filt('lowpass', 900, 0.7), bg = gain(0);
  bu.connect(blp).connect(bg).connect(bus);
  const h = noiseSource(A, true), hp = filt('highpass', 3800, 0.7), sg = gain(0);
  h.connect(hp).connect(sg).connect(bus);
  const sp = loop(spitBuf(A)), shp = filt('highpass', 1800, 0.7), pg = gain(0);
  sp.connect(shp).connect(pg).connect(bus);
  n.start(t, Math.random() * 2); h.start(t, Math.random() * 2); bu.start(t, Math.random() * 4); sp.start(t, Math.random() * 3); gl.start(t);
  return {
    set(P, q, melt, drive) {
      const now = c.currentTime, T = (p, v, tc = 0.1) => p.setTargetAtTime(v, now, tc);
      T(bus.gain, P.level * Math.max(q, melt * 0.85));
      T(lp.frequency, P.rumbleHz * (0.8 + 0.4 * q)); T(rg.gain, P.rumble * (0.4 + 0.6 * q));
      T(gg.gain, P.gurgle * q); T(gb.frequency, P.rumbleHz * 1.6);
      T(bg.gain, P.bubbles * (0.3 + 0.7 * q)); bu.playbackRate.value = (P.bubbleHz / 140) * (0.85 + 0.3 * q);
      T(hp.frequency, P.sizzleHz); T(sg.gain, P.sizzle * melt + P.drive * drive * 0.4 * melt);
      T(pg.gain, P.spit * melt * (0.5 + 0.5 * Math.min(1, drive * P.drive + 0.3)));
    },
    silence() { bus.gain.setTargetAtTime(0, c.currentTime, 0.06); },
    dispose() { bus.gain.setTargetAtTime(0, c.currentTime, 0.03); setTimeout(() => { [n, h, bu, sp, gl].forEach((x) => { try { x.stop(); } catch { /* already stopped */ } }); bus.disconnect(); }, 200); },
  };
}

/* The sink: a heavy, long hiss as molten rock meets paper, a low thud under it, and a burst of spitting. */
export function playSink(A, P) {
  const c = A.ctx, t = c.currentTime, L = P.sinkLen;
  const bus = c.createGain(); bus.gain.value = P.level; bus.connect(A.out);
  const n = noiseSource(A, true), hp = c.createBiquadFilter(), g = c.createGain();
  hp.type = 'highpass'; hp.frequency.setValueAtTime(1800, t); hp.frequency.exponentialRampToValueAtTime(4200, t + L);
  env(g, t, Math.max(0.001, P.sink), 0.02, L);
  n.connect(hp).connect(g).connect(bus); n.start(t, Math.random()); n.stop(t + L + 0.2);
  const o = c.createOscillator(), og = c.createGain();
  o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(32, t + 0.6);
  env(og, t, Math.max(0.001, P.thud), 0.008, 0.7);
  o.connect(og).connect(bus); o.start(t); o.stop(t + 0.8);
  const w = noiseSource(A), lp = c.createBiquadFilter(), wg = c.createGain();
  lp.type = 'lowpass'; lp.frequency.setValueAtTime(700, t); lp.frequency.exponentialRampToValueAtTime(80, t + 0.5);
  env(wg, t, Math.max(0.001, P.thud * 0.7), 0.005, 0.6);
  w.connect(lp).connect(wg).connect(bus); w.start(t, Math.random()); w.stop(t + 0.7);
  const s = c.createBufferSource(), shp = c.createBiquadFilter(), sgain = c.createGain();
  s.buffer = spitBuf(A); shp.type = 'highpass'; shp.frequency.value = 1800;
  env(sgain, t + 0.05, Math.max(0.001, P.spit * 0.9), 0.05, L * 0.8);
  s.connect(shp).connect(sgain).connect(bus); s.start(t, Math.random() * 2); s.stop(t + L + 0.2);
  setTimeout(() => bus.disconnect(), (L + 1.5) * 1000);
}

/* A click's blob: a fat plop as it lands, then a short hiss. */
export function playBlob(A, P) {
  const c = A.ctx, t = c.currentTime;
  const bus = c.createGain(); bus.gain.value = P.level * P.blob; bus.connect(A.out);
  const o = c.createOscillator(), og = c.createGain();
  o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(520, t + 0.07);
  env(og, t, 0.8, 0.004, 0.12);
  o.connect(og).connect(bus); o.start(t); o.stop(t + 0.2);
  const n = noiseSource(A), hp = c.createBiquadFilter(), g = c.createGain();
  hp.type = 'highpass'; hp.frequency.value = 3000;
  env(g, t + 0.05, 0.4, 0.03, 0.6);
  n.connect(hp).connect(g).connect(bus); n.start(t, Math.random()); n.stop(t + 0.8);
  setTimeout(() => bus.disconnect(), 1800);
}
