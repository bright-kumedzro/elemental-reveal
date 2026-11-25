/* The tornado's sound, tunable in the sound lab like the others (see sfx.js for how tuning is saved).
   The roar: a deep rumble that chugs like a freight train, a broad roar that climbs as you scroll harder, a
   whistle swirling round on top and a hiss of grit. It's steered every frame by how much funnel is on the
   ground. The one-shots: the touchdown (a thud and a burst of dust) and a click's dust devil (a short swirl). */
import { env, noiseSource } from '../sound.js';

export const TWISTER_SCHEMA = [
  ['level', 'Volume', 0, 1.5, 0.01],
  ['rumble', 'Rumble: level', 0, 1.5, 0.01],
  ['rumbleHz', 'Rumble: cutoff Hz', 40, 600, 5],
  ['chug', 'Rumble: chug depth (freight train)', 0, 1, 0.01],
  ['chugRate', 'Rumble: chug speed', 0.2, 12, 0.05],
  ['roar', 'Roar: level', 0, 1.5, 0.01],
  ['roarLo', 'Roar: Hz calm', 100, 3000, 10],
  ['roarHi', 'Roar: Hz scrolling hard', 100, 5000, 10],
  ['roarQ', 'Roar: narrowness', 0.2, 8, 0.1],
  ['whistle', 'Whistle: level', 0, 1, 0.01],
  ['whisHz', 'Whistle: Hz', 300, 6000, 10],
  ['whisQ', 'Whistle: narrowness', 1, 30, 0.5],
  ['swirl', 'Whistle: swirl depth Hz', 0, 2000, 10],
  ['swirlRate', 'Whistle: swirl speed', 0.05, 8, 0.05],
  ['grit', 'Grit: level (scrolling)', 0, 1.5, 0.01],
  ['gritHz', 'Grit: Hz', 1000, 10000, 50],
  ['thud', 'Touchdown: thud', 0, 1.5, 0.01],
  ['thudHz', 'Touchdown: thud Hz', 25, 200, 1],
  ['dust', 'Touchdown: dust burst', 0, 1.5, 0.01],
  ['devil', 'Dust devil: level', 0, 1.5, 0.01],
];

export const TWISTER_PRESETS = {
  'Freight train': { level: 0.9, rumble: 0.9, rumbleHz: 140, chug: 0.35, chugRate: 3.2, roar: 0.55, roarLo: 350, roarHi: 900, roarQ: 0.8, whistle: 0.22, whisHz: 1600, whisQ: 9, swirl: 500, swirlRate: 0.45, grit: 0.35, gritHz: 3800, thud: 0.9, thudHz: 75, dust: 0.7, devil: 0.5 },
  'Howling': { level: 0.85, rumble: 0.55, rumbleHz: 180, chug: 0.15, chugRate: 1.5, roar: 0.45, roarLo: 500, roarHi: 1400, roarQ: 1.2, whistle: 0.5, whisHz: 2200, whisQ: 14, swirl: 900, swirlRate: 0.7, grit: 0.3, gritHz: 4500, thud: 0.7, thudHz: 70, dust: 0.6, devil: 0.6 },
  'Deep rumble': { level: 1, rumble: 1.2, rumbleHz: 110, chug: 0.5, chugRate: 2.4, roar: 0.35, roarLo: 220, roarHi: 600, roarQ: 0.7, whistle: 0.08, whisHz: 1200, whisQ: 8, swirl: 300, swirlRate: 0.3, grit: 0.25, gritHz: 3000, thud: 1.1, thudHz: 55, dust: 0.8, devil: 0.45 },
  'Dust devil': { level: 0.8, rumble: 0.35, rumbleHz: 220, chug: 0.1, chugRate: 4, roar: 0.6, roarLo: 700, roarHi: 2000, roarQ: 1, whistle: 0.35, whisHz: 2800, whisQ: 10, swirl: 1200, swirlRate: 1.6, grit: 0.6, gritHz: 5000, thud: 0.5, thudHz: 90, dust: 0.7, devil: 0.7 },
};
export const TWISTER = TWISTER_PRESETS['Freight train'];

const lerp = (a, b, k) => a + (b - a) * k;

/* A running roar. set(P, near, act, here): near is how much funnel is on the ground (0–1), act how hard you're
   scrolling (0–1+), here 0 silences it. P is read on every call, so edits to it are heard straight away. */
export function makeTwister(A) {
  const c = A.ctx, t = c.currentTime;
  const filt = (type, f, q) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const gain = (v) => { const g = c.createGain(); g.gain.value = v; return g; };
  const osc = (f) => { const o = c.createOscillator(); o.frequency.value = f; return o; };

  const bus = gain(0); bus.connect(A.out);
  const n = noiseSource(A, true), n2 = noiseSource(A, true), n3 = noiseSource(A, true);
  const rl = filt('lowpass', 140, 0.9), rg = gain(0);
  n.connect(rl).connect(rg).connect(bus);
  const ro = filt('bandpass', 500, 0.8), og = gain(0);
  n2.connect(ro).connect(og).connect(bus);
  const wh = filt('bandpass', 1600, 9), wg = gain(0);
  n3.connect(wh).connect(wg).connect(bus);
  const gr = filt('bandpass', 3800, 0.9), gg = gain(0);
  n2.connect(gr).connect(gg).connect(bus);
  const chug = osc(3), cd = gain(0);
  chug.connect(cd).connect(rg.gain);
  const sw = osc(0.45), sd = gain(0);
  sw.connect(sd).connect(wh.frequency);
  n.start(t, Math.random()); n2.start(t, Math.random()); n3.start(t, Math.random());
  chug.start(t); sw.start(t);
  const nodes = [n, n2, n3, chug, sw];
  return {
    set(P, near, act, here) {
      const now = c.currentTime, T = (p, v, tc = 0.1) => p.setTargetAtTime(v, now, tc);
      const q = Math.min(1, 0.3 + act);
      T(bus.gain, here * P.level * near * (0.6 + 0.4 * q));
      T(rl.frequency, P.rumbleHz * (0.8 + 0.4 * q));
      T(rg.gain, P.rumble * (1 - P.chug / 2)); T(cd.gain, (P.rumble * P.chug) / 2); T(chug.frequency, P.chugRate * (0.8 + 0.4 * q));
      T(ro.frequency, lerp(P.roarLo, P.roarHi, q)); ro.Q.value = P.roarQ; T(og.gain, P.roar);
      T(wh.frequency, P.whisHz * (0.85 + 0.3 * q)); wh.Q.value = P.whisQ; T(wg.gain, P.whistle);
      T(sw.frequency, P.swirlRate); T(sd.gain, P.swirl);
      T(gr.frequency, P.gritHz); T(gg.gain, P.grit * Math.min(1, act));
    },
    silence() { bus.gain.setTargetAtTime(0, c.currentTime, 0.06); },
    dispose() { bus.gain.setTargetAtTime(0, c.currentTime, 0.03); setTimeout(() => { nodes.forEach((x) => { try { x.stop(); } catch { /* already stopped */ } }); bus.disconnect(); }, 200); },
  };
}

/* The touchdown: a heavy thud, a burst of dust falling away, and grit spraying out. size scales it. */
export function playTouchdown(A, P, size = 1) {
  const c = A.ctx, t = c.currentTime;
  const bus = c.createGain(); bus.gain.value = P.level * size; bus.connect(A.out);
  if (P.thud > 0.001) {
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(P.thudHz, t); o.frequency.exponentialRampToValueAtTime(P.thudHz * 0.4, t + 0.6);
    env(g, t, P.thud, 0.008, 0.7);
    o.connect(g).connect(bus); o.start(t); o.stop(t + 0.8);
  }
  if (P.dust > 0.001) {
    const nn = noiseSource(A), lp = c.createBiquadFilter(), g = c.createGain();
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(1600, t); lp.frequency.exponentialRampToValueAtTime(150, t + 0.9);
    env(g, t, P.dust, 0.01, 1);
    nn.connect(lp).connect(g).connect(bus); nn.start(t, Math.random()); nn.stop(t + 1.1);
    const sp = noiseSource(A), bp = c.createBiquadFilter(), sg = c.createGain();
    bp.type = 'bandpass'; bp.Q.value = 0.8; bp.frequency.setValueAtTime(P.gritHz, t); bp.frequency.exponentialRampToValueAtTime(P.gritHz * 0.5, t + 1.3);
    sg.gain.setValueAtTime(0.0001, t); sg.gain.exponentialRampToValueAtTime(P.dust * 0.35, t + 0.08); sg.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    sp.connect(bp).connect(sg).connect(bus); sp.start(t, Math.random()); sp.stop(t + 1.5);
  }
  setTimeout(() => bus.disconnect(), 3000);
}

/* A click's dust devil: a whoosh that spins up, flutters and dies away. */
export function playDevil(A, P) {
  const c = A.ctx, t = c.currentTime;
  const nn = noiseSource(A), bp = c.createBiquadFilter(), g = c.createGain(), tr = c.createGain();
  bp.type = 'bandpass'; bp.Q.value = 1.6;
  bp.frequency.setValueAtTime(600, t); bp.frequency.exponentialRampToValueAtTime(2400, t + 0.4); bp.frequency.exponentialRampToValueAtTime(800, t + 1.6);
  env(g, t, P.level * P.devil, 0.3, 1.3);
  tr.gain.value = 0.6;
  const l = c.createOscillator(), ld = c.createGain();
  l.frequency.setValueAtTime(5, t); l.frequency.linearRampToValueAtTime(14, t + 0.6); ld.gain.value = 0.4;
  l.connect(ld).connect(tr.gain);
  nn.connect(bp).connect(g).connect(tr).connect(A.out);
  nn.start(t, Math.random()); nn.stop(t + 1.8); l.start(t); l.stop(t + 1.8);
}
