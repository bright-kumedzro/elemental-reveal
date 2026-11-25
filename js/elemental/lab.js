/* Sound lab: tune each element's sound by ear. Every change is saved for this browser, and the effects use it
   when the site runs on localhost. "Copy settings" gives the numbers to bake in as the defaults. */
import { SCHEMA, RECIPES, makeBed, playHit, playWhoosh, tuned, saveTuning, clearTuning } from './sfx.js';

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
  A = { ctx, out, noise };
  return A;
}

const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (k === 'on') Object.entries(v).forEach(([ev, f]) => e.addEventListener(ev, f)); else e.setAttribute(k, v);
  e.append(...kids);
  return e;
};
const btn = (label, f, primary) => el('button', { class: primary ? 'btn primary' : 'btn', type: 'button', on: { click: f } }, label);
const fmt = (v, step) => (step >= 1 ? String(Math.round(v)) : v.toFixed(step < 0.01 ? 3 : 2));
const same = (a, b) => Object.keys(b).every((k) => Math.abs(a[k] - b[k]) < 1e-9);
const NAMES = { fire: 'Fire', water: 'Water', air: 'Air', earth: 'Earth', lightning: 'Lightning' };
const BLURB = {
  fire: 'The bed roars while it burns. The hit is the comet landing (big) and a thrown fireball landing (small); the whoosh is either one in flight.',
  water: 'The bed rushes while it pours. The hit is a spill landing where you click.',
  air: 'The bed is the wind while it strips the page. The whoosh is the gust a click sends.',
  earth: 'The bed grinds while the stone breaks up. The hit is a quake you start with a click.',
  lightning: 'The bed hums and crackles while the storm is on. The hit is the thunder of each strike (big) and of a bolt you call down (small).',
};

function panel(name) {
  const root = el('section', { id: name });
  let P = { ...tuned(name) };
  let bed = null, timer = 0, act = 0.3;
  const sel = el('select', { 'aria-label': `${NAMES[name]}: start from` });
  [...Object.keys(RECIPES).map((n) => [n, `${NAMES[n]} (default)`]), ['custom', 'Custom']].forEach(([v, t]) => sel.append(el('option', { value: v }, t)));
  const json = el('textarea', { readonly: '', rows: '3', 'aria-label': `${NAMES[name]} settings` });
  const sliders = {};
  const grid = el('div', { class: 'grid' });
  const sync = () => {
    sel.value = Object.keys(RECIPES).find((n) => same(P, RECIPES[n])) || 'custom';
    for (const [k, , , , step] of SCHEMA) { sliders[k].input.value = P[k]; sliders[k].out.textContent = fmt(P[k], step); }
    json.value = JSON.stringify(P);
  };
  const changed = () => { saveTuning(name, P); sync(); };
  for (const [k, label, min, max, step] of SCHEMA) {
    const id = `${name}-${k}`, out = el('output', { for: id });
    const input = el('input', { id, type: 'range', min, max, step, on: { input: (e) => { P[k] = Number(e.target.value); changed(); } } });
    sliders[k] = { input, out };
    grid.append(el('div', {}, el('label', { class: 'row', for: id }, el('span', {}, label), out), input));
  }
  sel.addEventListener('change', () => { if (sel.value !== 'custom') { P = { ...RECIPES[sel.value] }; changed(); } });

  const actIn = el('input', { id: `${name}-act`, type: 'range', min: 0, max: 1, step: 0.01, value: act, on: { input: (e) => { act = Number(e.target.value); } } });
  const start = btn('Start the bed', () => {
    if (bed) { bed.dispose(); bed = null; clearInterval(timer); start.textContent = 'Start the bed'; return; }
    bed = makeBed(audio());
    timer = setInterval(() => bed?.set(P, 1, act), 40);
    start.textContent = 'Stop';
  }, true);
  const copy = btn('Copy settings', async () => {
    json.select();
    try { await navigator.clipboard.writeText(json.value); copy.textContent = 'Copied'; } catch { copy.textContent = 'Selected: copy it'; }
    setTimeout(() => { copy.textContent = 'Copy settings'; }, 1600);
  });
  const reset = btn('Reset', () => { clearTuning(name); P = { ...RECIPES[name] }; changed(); });

  root.append(
    el('h2', {}, NAMES[name]), el('p', { class: 'blurb' }, BLURB[name]),
    el('div', { class: 'bar' }, el('label', { class: 'preset' }, 'Start from ', sel), start,
      btn('Hit', () => playHit(audio(), P, 1)), btn('Small hit', () => playHit(audio(), P, 0.4)), btn('Whoosh', () => playWhoosh(audio(), P, 0.8, 1))),
    el('div', { class: 'grid live' }, el('div', {}, el('label', { class: 'row', for: `${name}-act` }, el('span', {}, 'Scrolling (calm → hard)')), actIn)),
    grid,
    el('div', { class: 'bar' }, copy, reset),
    json,
  );
  sync();
  return root;
}

document.querySelector('#panels').append(...Object.keys(RECIPES).map(panel));
