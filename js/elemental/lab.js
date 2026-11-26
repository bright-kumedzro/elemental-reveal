/* Sound lab: tune each element's sound by ear. Every change is saved for this browser, and the effects use it
   when the site runs on localhost. "Copy settings" gives the numbers to bake in as the defaults. */
import { schemaFor, RECIPES, makeBedFor, playHit, playFlight, tuned, saveTuning, clearTuning } from './sfx.js';
import { FROST_SCHEMA, FROST_PRESETS, FROST, makeFrost, playCrack, playShards, tunedFrost, saveFrost, clearFrost } from './sfx-frost.js';
import { SNOW_SCHEMA, SNOW_PRESETS, SNOW, makeSnow, playGust, playWhump, tunedSnow, saveSnow, clearSnow } from './sfx-snow.js';

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
  fire: 'Fire has its own sounds. "Comet" is the comet screaming in from space for the second before it lands; "Impact" is it landing ("Small impact" is a thrown fireball). Start the burn to hear the fire itself: the flame roar breathing, the crackle and pops, the hiss. The Scrolling slider makes it burn harder.',
  water: 'The bed rushes while it pours. The hit is a spill landing where you click.',
  air: 'The bed is the wind while it strips the page. The whoosh is the gust a click sends.',
  earth: 'The bed grinds while the stone breaks up. The hit is a quake you start with a click.',
  lightning: 'The bed hums and crackles while the storm is on. The hit is the thunder of each strike (big) and of a bolt you call down (small).',
};

function panel(name) {
  const root = el('section', { id: name });
  let P = { ...tuned(name) };
  let bed = null, timer = 0, act = 0.3;
  const SCHEMA = schemaFor(name), isFire = name === 'fire';
  const starts = Object.keys(RECIPES).filter((n) => schemaFor(n) === SCHEMA);   // only recipes with the same sliders
  const sel = el('select', { 'aria-label': `${NAMES[name]}: start from` });
  [...starts.map((n) => [n, `${NAMES[n]} (default)`]), ['custom', 'Custom']].forEach(([v, t]) => sel.append(el('option', { value: v }, t)));
  const json = el('textarea', { readonly: '', rows: '3', 'aria-label': `${NAMES[name]} settings` });
  const sliders = {};
  const grid = el('div', { class: 'grid' });
  const sync = () => {
    sel.value = starts.find((n) => same(P, RECIPES[n])) || 'custom';
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
  const startLabel = isFire ? 'Start the burn' : 'Start the bed';
  const start = btn(startLabel, () => {
    if (bed) { bed.dispose(); bed = null; clearInterval(timer); start.textContent = startLabel; return; }
    bed = makeBedFor(audio(), name);
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
      ...(isFire
        ? [btn('Comet and impact', () => { playFlight(audio(), name, P, 1.15, 1); setTimeout(() => playHit(audio(), P, 1), 1150); }), btn('Comet', () => playFlight(audio(), name, P, 1.15, 1)), btn('Impact', () => playHit(audio(), P, 1)), btn('Small impact', () => playHit(audio(), P, 0.4))]
        : [btn('Hit', () => playHit(audio(), P, 1)), btn('Small hit', () => playHit(audio(), P, 0.4)), btn('Whoosh', () => playFlight(audio(), name, P, 0.8, 1))])),
    el('div', { class: 'grid live' }, el('div', {}, el('label', { class: 'row', for: `${name}-act` }, el('span', {}, 'Scrolling (calm → hard)')), actIn)),
    grid,
    el('div', { class: 'bar' }, copy, reset),
    json,
  );
  sync();
  return root;
}

document.querySelector('#elemental-panels').append(...Object.keys(RECIPES).map(panel));

/* Frost: its own sliders and voices */
function frostPanel() {
  const root = el('section', { id: 'frost' });
  const names = Object.keys(FROST_PRESETS);
  let P = { ...tunedFrost() }, bed = null, timer = 0, freeze = 0.8, act = 0.3;
  const sel = el('select', { 'aria-label': 'Frost: start from' });
  [...names, 'Custom'].forEach((n) => sel.append(el('option', { value: n }, n)));
  const json = el('textarea', { readonly: '', rows: '3', 'aria-label': 'Frost settings' });
  const sliders = {}, grid = el('div', { class: 'grid' });
  const sync = () => {
    sel.value = names.find((n) => same(P, FROST_PRESETS[n])) || 'Custom';
    for (const [k, , , , step] of FROST_SCHEMA) { sliders[k].input.value = P[k]; sliders[k].out.textContent = fmt(P[k], step); }
    json.value = JSON.stringify(P);
  };
  const changed = () => { saveFrost(P); sync(); };
  for (const [k, label, min, max, step] of FROST_SCHEMA) {
    const id = `frost-${k}`, out = el('output', { for: id });
    const input = el('input', { id, type: 'range', min, max, step, on: { input: (e) => { P[k] = Number(e.target.value); changed(); } } });
    sliders[k] = { input, out };
    grid.append(el('div', {}, el('label', { class: 'row', for: id }, el('span', {}, label), out), input));
  }
  sel.addEventListener('change', () => { if (sel.value !== 'Custom') { P = { ...FROST_PRESETS[sel.value] }; changed(); } });
  const range = (id, v, set) => el('input', { id, type: 'range', min: 0, max: 1, step: 0.01, value: v, on: { input: (e) => set(Number(e.target.value)) } });
  const start = btn('Start the freeze', () => {
    if (bed) { bed.dispose(); bed = null; clearInterval(timer); start.textContent = 'Start the freeze'; return; }
    bed = makeFrost(audio());
    timer = setInterval(() => bed?.set(P, freeze, act, 1), 40);
    start.textContent = 'Stop';
  }, true);
  const copy = btn('Copy settings', async () => {
    json.select();
    try { await navigator.clipboard.writeText(json.value); copy.textContent = 'Copied'; } catch { copy.textContent = 'Selected: copy it'; }
    setTimeout(() => { copy.textContent = 'Copy settings'; }, 1600);
  });
  root.append(
    el('h2', {}, 'Frost'),
    el('p', { class: 'blurb' }, 'The bed runs while the frost grows: cold wind, the ice creaking and tinkling (more with the Freezing slider). "Crack" is the sheet giving way; "Small crack" is a click\'s patch; "Shards" is a few pieces falling.'),
    el('div', { class: 'bar' }, el('label', { class: 'preset' }, 'Start from ', sel), start,
      btn('Crack', () => playCrack(audio(), P, 1)), btn('Small crack', () => playCrack(audio(), P, 0.45)), btn('Shards', () => playShards(audio(), P, 4))),
    el('div', { class: 'grid live' },
      el('div', {}, el('label', { class: 'row', for: 'frost-freeze' }, el('span', {}, 'Freezing (still → growing fast)')), range('frost-freeze', freeze, (v) => { freeze = v; })),
      el('div', {}, el('label', { class: 'row', for: 'frost-act' }, el('span', {}, 'Scrolling (calm → hard)')), range('frost-act', act, (v) => { act = v; }))),
    grid,
    el('div', { class: 'bar' }, copy, btn('Reset', () => { clearFrost(); P = { ...FROST }; changed(); })),
    json,
  );
  sync();
  return root;
}
document.querySelector('#elemental-panels').append(frostPanel());

/* Snow: its own sliders and voices */
function snowPanel() {
  const root = el('section', { id: 'snow' });
  const names = Object.keys(SNOW_PRESETS);
  let P = { ...tunedSnow() }, bed = null, timer = 0, snow = 0.8, melt = 0, act = 0.3;
  const sel = el('select', { 'aria-label': 'Snow: start from' });
  [...names, 'Custom'].forEach((n) => sel.append(el('option', { value: n }, n)));
  const json = el('textarea', { readonly: '', rows: '3', 'aria-label': 'Snow settings' });
  const sliders = {}, grid = el('div', { class: 'grid' });
  const sync = () => {
    sel.value = names.find((n) => same(P, SNOW_PRESETS[n])) || 'Custom';
    for (const [k, , , , step] of SNOW_SCHEMA) { sliders[k].input.value = P[k]; sliders[k].out.textContent = fmt(P[k], step); }
    json.value = JSON.stringify(P);
  };
  const changed = () => { saveSnow(P); sync(); };
  for (const [k, label, min, max, step] of SNOW_SCHEMA) {
    const id = `snow-${k}`, out = el('output', { for: id });
    const input = el('input', { id, type: 'range', min, max, step, on: { input: (e) => { P[k] = Number(e.target.value); changed(); } } });
    sliders[k] = { input, out };
    grid.append(el('div', {}, el('label', { class: 'row', for: id }, el('span', {}, label), out), input));
  }
  sel.addEventListener('change', () => { if (sel.value !== 'Custom') { P = { ...SNOW_PRESETS[sel.value] }; changed(); } });
  const range = (id, v, set) => el('input', { id, type: 'range', min: 0, max: 1, step: 0.01, value: v, on: { input: (e) => set(Number(e.target.value)) } });
  const start = btn('Start the snowfall', () => {
    if (bed) { bed.dispose(); bed = null; clearInterval(timer); start.textContent = 'Start the snowfall'; return; }
    bed = makeSnow(audio());
    timer = setInterval(() => bed?.set(P, snow, melt, act, 1), 40);
    start.textContent = 'Stop';
  }, true);
  const copy = btn('Copy settings', async () => {
    json.select();
    try { await navigator.clipboard.writeText(json.value); copy.textContent = 'Copied'; } catch { copy.textContent = 'Selected: copy it'; }
    setTimeout(() => { copy.textContent = 'Copy settings'; }, 1600);
  });
  root.append(
    el('h2', {}, 'Snow'),
    el('p', { class: 'blurb' }, 'The bed runs while it snows: the hush of the snowfall and a low, gusting wind (the Snowing slider), then slush and drips as it thaws (the Melting slider). "Whumpf" is the snowpack settling as the thaw starts; "Gust" is a click.'),
    el('div', { class: 'bar' }, el('label', { class: 'preset' }, 'Start from ', sel), start,
      btn('Whumpf', () => playWhump(audio(), P, 1)), btn('Gust', () => playGust(audio(), P, 1))),
    el('div', { class: 'grid live' },
      el('div', {}, el('label', { class: 'row', for: 'snow-snow' }, el('span', {}, 'Snowing (none → heavy)')), range('snow-snow', snow, (v) => { snow = v; })),
      el('div', {}, el('label', { class: 'row', for: 'snow-melt' }, el('span', {}, 'Melting (frozen → thawing)')), range('snow-melt', melt, (v) => { melt = v; })),
      el('div', {}, el('label', { class: 'row', for: 'snow-act' }, el('span', {}, 'Scrolling (calm → hard)')), range('snow-act', act, (v) => { act = v; }))),
    grid,
    el('div', { class: 'bar' }, copy, btn('Reset', () => { clearSnow(); P = { ...SNOW }; changed(); })),
    json,
  );
  sync();
  return root;
}
document.querySelector('#elemental-panels').append(snowPanel());
