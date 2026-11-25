/* Sound lab: tune the poof, the whir and the crackle by ear. Every change is saved for this browser, and the main page uses
   it when it runs on localhost. "Copy settings" gives the numbers to bake in as the defaults. */
import { POOF_SCHEMA, POOF_PRESETS, playPoof, WHIR_SCHEMA, WHIR_PRESETS, makeWhir, CRACKLE_SCHEMA, CRACKLE_PRESETS, makeCrackle, playStrike, tuned, saveTuning, clearTuning } from './sfx.js';
import { STORM_SCHEMA, STORM_PRESETS, makeStorm, playGust } from './sfx-storm.js';
import { TWISTER_SCHEMA, TWISTER_PRESETS, makeTwister, playTouchdown, playDevil } from './sfx-twister.js';

let A = null;
function audio() {
  if (A) { A.ctx.resume(); return A; }
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 6; comp.attack.value = 0.004; comp.release.value = 0.2;
  const out = ctx.createGain(); out.gain.value = 0.7;
  out.connect(comp); comp.connect(ctx.destination);
  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return (A = { ctx, out, noise });
}

const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (k === 'on') Object.entries(v).forEach(([ev, f]) => e.addEventListener(ev, f)); else e.setAttribute(k, v);
  e.append(...kids);
  return e;
};
const fmt = (v, step) => (step >= 1 ? String(Math.round(v)) : v.toFixed(step < 0.01 ? 3 : 2));
const same = (a, b) => Object.keys(b).every((k) => Math.abs(a[k] - b[k]) < 1e-9);

function panel(root, { name, title, blurb, schema, presets, controls }) {
  const names = Object.keys(presets);
  let P = { ...tuned(name, presets[names[0]]) };
  const sel = el('select', { 'aria-label': `${title} preset` });
  [...names, 'Custom'].forEach((n) => sel.append(el('option', { value: n }, n)));
  const json = el('textarea', { readonly: '', rows: '4', 'aria-label': `${title} settings` });
  const sliders = {};
  const grid = el('div', { class: 'grid' });

  const sync = () => {
    sel.value = names.find((n) => same(P, presets[n])) || 'Custom';
    for (const [k, , , , step] of schema) { sliders[k].input.value = P[k]; sliders[k].out.textContent = fmt(P[k], step); }
    json.value = JSON.stringify(P);
  };
  const changed = () => { saveTuning(name, P); sync(); controls.live?.(P); };

  for (const [k, label, min, max, step] of schema) {
    const id = `${name}-${k}`;
    const out = el('output', { for: id });
    const input = el('input', { id, type: 'range', min, max, step, on: { input: (e) => { P[k] = Number(e.target.value); changed(); } } });
    sliders[k] = { input, out };
    grid.append(el('div', {}, el('label', { class: 'row', for: id }, el('span', {}, label), out), input));
  }
  sel.addEventListener('change', () => { if (sel.value !== 'Custom') { P = { ...presets[sel.value] }; changed(); controls.preview?.(P); } });

  const copy = el('button', { class: 'btn', type: 'button', on: { click: async () => {
    json.select();
    try { await navigator.clipboard.writeText(json.value); copy.textContent = 'Copied'; } catch { document.execCommand?.('copy'); copy.textContent = 'Selected: copy it'; }
    setTimeout(() => { copy.textContent = 'Copy settings'; }, 1600);
  } } }, 'Copy settings');
  const reset = el('button', { class: 'btn', type: 'button', on: { click: () => { clearTuning(name); P = { ...presets[names[0]] }; changed(); } } }, 'Reset');

  root.append(
    el('h2', {}, title), el('p', { class: 'blurb' }, blurb),
    el('div', { class: 'bar' }, el('label', { class: 'preset' }, 'Start from ', sel), ...controls.buttons(() => P)),
    controls.extra || '',
    grid,
    el('div', { class: 'bar' }, copy, reset),
    json,
  );
  sync();
}

/* the poof */
const btn = (label, f, primary) => el('button', { class: primary ? 'btn primary' : 'btn', type: 'button', on: { click: f } }, label);
panel(document.querySelector('#poof'), {
  name: 'poof',
  title: 'Shadow Clone · poof',
  blurb: 'Plays when a clone vanishes. "Come back" is the same sound swelling in, for when you scroll back up. "Split" is the big one when the draft splits.',
  schema: POOF_SCHEMA,
  presets: POOF_PRESETS,
  controls: {
    preview: (P) => playPoof(audio(), P, 'pop'),
    buttons: (get) => [
      btn('Poof', () => playPoof(audio(), get(), 'pop'), true),
      btn('Come back', () => playPoof(audio(), get(), 'back')),
      btn('Split', () => playPoof(audio(), get(), 'big')),
      btn('Five in a row', () => { for (let i = 0; i < 5; i++) setTimeout(() => playPoof(audio(), get(), 'pop'), i * 140); }),
    ],
  },
});

/* the whir */
let W = null, timer = 0, charge = 0.3, drill = 0, sweep = 0;
const chargeIn = el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: charge, id: 'charge', on: { input: (e) => { charge = Number(e.target.value); } } });
const drillIn = el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: drill, id: 'drill', on: { input: (e) => { drill = Number(e.target.value); } } });
let P_whir = null;
const startBtn = btn('Start', () => {
  if (W) { W.dispose(); W = null; clearInterval(timer); startBtn.textContent = 'Start'; return; }
  W = makeWhir(audio());
  timer = setInterval(() => W?.set(P_whir(), charge, drill, 1), 40);
  startBtn.textContent = 'Stop';
}, true);
panel(document.querySelector('#whir'), {
  name: 'whir',
  title: 'Spiral Sphere · whir',
  blurb: 'Runs while the sphere is on screen. It climbs as the sphere charges (the Charge slider), and the grind comes in while it drills. Start it, then move the sliders: you hear every change live.',
  schema: WHIR_SCHEMA,
  presets: WHIR_PRESETS,
  controls: {
    buttons: (get) => {
      P_whir = get;
      return [
        startBtn,
        btn('Charge it up', () => {
          if (!W) startBtn.click();
          clearInterval(sweep); charge = 0; drill = 0;
          const t0 = performance.now();
          sweep = setInterval(() => {
            const k = (performance.now() - t0) / 3000;
            charge = Math.min(1, k); drill = k > 1.1 ? 0.6 : 0;
            chargeIn.value = charge; drillIn.value = drill;
            if (k > 2) clearInterval(sweep);
          }, 40);
        }),
      ];
    },
    extra: el('div', { class: 'grid live' },
      el('div', {}, el('label', { class: 'row', for: 'charge' }, el('span', {}, 'Charge (sphere forming → full)')), chargeIn),
      el('div', {}, el('label', { class: 'row', for: 'drill' }, el('span', {}, 'Drilling (scroll harder → more)')), drillIn)),
  },
});

/* the crackle */
let X = null, xTimer = 0, xCharge = 0.3, xDrive = 0, xSweep = 0, P_crk = null;
const xChargeIn = el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: xCharge, id: 'x-charge', on: { input: (e) => { xCharge = Number(e.target.value); } } });
const xDriveIn = el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: xDrive, id: 'x-drive', on: { input: (e) => { xDrive = Number(e.target.value); } } });
const xStart = btn('Start', () => {
  if (X) { X.dispose(); X = null; clearInterval(xTimer); xStart.textContent = 'Start'; return; }
  X = makeCrackle(audio());
  xTimer = setInterval(() => X?.set(P_crk(), xCharge, xDrive, 1), 40);
  xStart.textContent = 'Stop';
}, true);
panel(document.querySelector('#crackle'), {
  name: 'crackle',
  title: 'Lightning Blade · crackle and strike',
  blurb: 'The crackle runs while the blade is on screen: the chirps climb as it charges (the Charge slider), and the crackle keeps on while the cut spreads (the Cutting slider). "Strike" is the thunderclap when it cuts; "Bolt" is a click\'s smaller one.',
  schema: CRACKLE_SCHEMA,
  presets: CRACKLE_PRESETS,
  controls: {
    buttons: (get) => {
      P_crk = get;
      return [
        xStart,
        btn('Charge and strike', () => {
          if (!X) xStart.click();
          clearInterval(xSweep); xCharge = 0; xDrive = 0;
          const t0 = performance.now();
          let struck = false;
          xSweep = setInterval(() => {
            const k = (performance.now() - t0) / 3000;
            if (k < 1) { xCharge = k; xDrive = 0; }
            else {
              if (!struck) { struck = true; playStrike(audio(), get()); }
              xCharge = 0; xDrive = k < 1.8 ? 0.7 : 0;
            }
            xChargeIn.value = xCharge; xDriveIn.value = xDrive;
            if (k > 2) clearInterval(xSweep);
          }, 40);
        }),
        btn('Strike', () => playStrike(audio(), get())),
        btn('Bolt', () => playStrike(audio(), get(), true)),
      ];
    },
    extra: el('div', { class: 'grid live' },
      el('div', {}, el('label', { class: 'row', for: 'x-charge' }, el('span', {}, 'Charge (gathering → full)')), xChargeIn),
      el('div', {}, el('label', { class: 'row', for: 'x-drive' }, el('span', {}, 'Cutting (scroll harder → more)')), xDriveIn)),
  },
});

/* the sandstorm */
let SS = null, sTimer = 0, sNear = 0.6, sDrive = 0, sSweep = 0, P_storm = null;
const sNearIn = el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: sNear, id: 's-near', on: { input: (e) => { sNear = Number(e.target.value); } } });
const sDriveIn = el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: sDrive, id: 's-drive', on: { input: (e) => { sDrive = Number(e.target.value); } } });
const sStart = btn('Start', () => {
  if (SS) { SS.dispose(); SS = null; clearInterval(sTimer); sStart.textContent = 'Start'; return; }
  SS = makeStorm(audio());
  sTimer = setInterval(() => SS?.set(P_storm(), sNear, sDrive), 40);
  sStart.textContent = 'Stop';
}, true);
panel(document.querySelector('#storm'), {
  name: 'storm',
  title: 'Sandstorm · wind and dust devil',
  blurb: 'The wind runs while the storm is on screen: it swells as the wall arrives and stays full inside it (the Storm slider), and the hiss and grit get harder the faster you scroll (the Scrolling slider). "Dust devil" is a click\'s gust.',
  schema: STORM_SCHEMA,
  presets: STORM_PRESETS,
  controls: {
    buttons: (get) => {
      P_storm = get;
      return [
        sStart,
        btn('Let it pass', () => {
          if (!SS) sStart.click();
          clearInterval(sSweep);
          const t0 = performance.now();
          sSweep = setInterval(() => {
            const k = (performance.now() - t0) / 6000;
            sNear = k < 0.25 ? k / 0.25 : k < 0.6 ? 1 : Math.max(0, 1 - (k - 0.6) / 0.4);
            sNearIn.value = sNear;
            if (k > 1) clearInterval(sSweep);
          }, 40);
        }),
        btn('Dust devil', () => playGust(audio(), get())),
      ];
    },
    extra: el('div', { class: 'grid live' },
      el('div', {}, el('label', { class: 'row', for: 's-near' }, el('span', {}, 'Storm (far off → inside the wall)')), sNearIn),
      el('div', {}, el('label', { class: 'row', for: 's-drive' }, el('span', {}, 'Scrolling (calm → hard)')), sDriveIn)),
  },
});

/* the tornado */
let TW = null, tTimer = 0, tNear = 1, tAct = 0.3, P_tw = null;
const tNearIn = el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: tNear, id: 't-near', on: { input: (e) => { tNear = Number(e.target.value); } } });
const tActIn = el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: tAct, id: 't-act', on: { input: (e) => { tAct = Number(e.target.value); } } });
const tStart = btn('Start', () => {
  if (TW) { TW.dispose(); TW = null; clearInterval(tTimer); tStart.textContent = 'Start'; return; }
  TW = makeTwister(audio());
  tTimer = setInterval(() => TW?.set(P_tw(), tNear, tAct, 1), 40);
  tStart.textContent = 'Stop';
}, true);
panel(document.querySelector('#twister'), {
  name: 'twister',
  title: 'Sand Tornado · roar',
  blurb: 'The roar runs while the funnel is on the ground (the On the ground slider) and climbs the harder you scroll (the Scrolling slider). "Touchdown" is the thud when it lands; "Dust devil" is a click\'s small one.',
  schema: TWISTER_SCHEMA,
  presets: TWISTER_PRESETS,
  controls: {
    buttons: (get) => {
      P_tw = get;
      return [tStart, btn('Touchdown', () => playTouchdown(audio(), get())), btn('Dust devil', () => playDevil(audio(), get()))];
    },
    extra: el('div', { class: 'grid live' },
      el('div', {}, el('label', { class: 'row', for: 't-near' }, el('span', {}, 'On the ground (lifted → down)')), tNearIn),
      el('div', {}, el('label', { class: 'row', for: 't-act' }, el('span', {}, 'Scrolling (calm → hard)')), tActIn)),
  },
});
