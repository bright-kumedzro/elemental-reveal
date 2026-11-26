/* Sound lab: the paper pack's panels (page curl, fold, ink draw). */
import { CURL_SCHEMA, CURL_PRESETS, FOLD_SCHEMA, FOLD_PRESETS, makeRustle, playSnap, playWhoosh, playFlap, playPeel, tuned as tunedPaper, saveTuning as savePaper, clearTuning as clearPaper } from './sfx-paper.js';
import { DRAW_SCHEMA, DRAW_PRESETS, DRAW, makeDraw, playDab, tunedDraw, saveDraw, clearDraw } from './sfx-draw.js';

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
function paperPanel(name, title, blurb, SCHEMA, PRESETS, extraButtons) {
  const root = el('section', { id: name });
  const names = Object.keys(PRESETS);
  let P = { ...tunedPaper(name, PRESETS[names[0]]) }, bed = null, timer = 0, act = 0.4, lift = 0.5;
  const sel = el('select', { 'aria-label': `${title}: start from` });
  [...names, 'Custom'].forEach((n) => sel.append(el('option', { value: n }, n)));
  const json = el('textarea', { readonly: '', rows: '3', 'aria-label': `${title} settings` });
  const sliders = {}, grid = el('div', { class: 'grid' });
  const sync = () => {
    sel.value = names.find((n) => same(P, PRESETS[n])) || 'Custom';
    for (const [k, , , , step] of SCHEMA) { sliders[k].input.value = P[k]; sliders[k].out.textContent = fmt(P[k], step); }
    json.value = JSON.stringify(P);
  };
  const changed = () => { savePaper(name, P); sync(); };
  for (const [k, label, min, max, step] of SCHEMA) {
    const id = `${name}-${k}`, out = el('output', { for: id });
    const input = el('input', { id, type: 'range', min, max, step, on: { input: (e) => { P[k] = Number(e.target.value); changed(); } } });
    sliders[k] = { input, out };
    grid.append(el('div', {}, el('label', { class: 'row', for: id }, el('span', {}, label), out), input));
  }
  sel.addEventListener('change', () => { if (sel.value !== 'Custom') { P = { ...PRESETS[sel.value] }; changed(); } });
  const range = (id, v, set) => el('input', { id, type: 'range', min: 0, max: 1, step: 0.01, value: v, on: { input: (e) => set(Number(e.target.value)) } });
  const start = btn('Start the rustle', () => {
    if (bed) { bed.dispose(); bed = null; clearInterval(timer); start.textContent = 'Start the rustle'; return; }
    bed = makeRustle(audio());
    timer = setInterval(() => bed?.set(P, 1, act, lift), 40);
    start.textContent = 'Stop';
  }, true);
  const copy = btn('Copy settings', async () => {
    json.select();
    try { await navigator.clipboard.writeText(json.value); copy.textContent = 'Copied'; } catch { copy.textContent = 'Selected: copy it'; }
    setTimeout(() => { copy.textContent = 'Copy settings'; }, 1600);
  });
  root.append(
    el('h2', {}, title), el('p', { class: 'blurb' }, blurb),
    el('div', { class: 'bar' }, el('label', { class: 'preset' }, 'Start from ', sel), start, ...extraButtons(() => P)),
    el('div', { class: 'grid live' },
      el('div', {}, el('label', { class: 'row', for: `${name}-act` }, el('span', {}, 'Scrolling (calm → hard)')), range(`${name}-act`, act, (v) => { act = v; })),
      el('div', {}, el('label', { class: 'row', for: `${name}-lift` }, el('span', {}, 'Lift (flat → high)')), range(`${name}-lift`, lift, (v) => { lift = v; }))),
    grid,
    el('div', { class: 'bar' }, copy, btn('Reset', () => { clearPaper(name); P = { ...PRESETS[names[0]] }; changed(); })),
    json,
  );
  sync();
  return root;
}
document.querySelector('#curl')?.replaceWith(paperPanel('curl', 'Page Curl · rustle and flap', 'The rustle runs while the page turns (Scrolling makes it crackle harder; Lift brightens the whoosh). "Flap" is the sheet leaving; "Peel" is a click.', CURL_SCHEMA, CURL_PRESETS,
  (get) => [btn('Flap', () => playFlap(audio(), get())), btn('Peel', () => playPeel(audio(), get()))]));
document.querySelector('#fold')?.replaceWith(paperPanel('fold', 'Fold · rustle, whoosh and snap', 'The rustle runs while a fold is moving. "Fold" is one flap swinging over and landing; "Snap" is a crease pressed; "Fly off" is the packet leaving.', FOLD_SCHEMA, FOLD_PRESETS,
  (get) => [btn('Fold', () => { playWhoosh(audio(), get(), 0.5); setTimeout(() => playSnap(audio(), get()), 480); }), btn('Snap', () => playSnap(audio(), get())), btn('Fly off', () => playFlap(audio(), get()))]));

function drawPanel() {
  const root = el('section', { id: 'draw' });
  const names = Object.keys(DRAW_PRESETS);
  let P = { ...tunedDraw() }, bed = null, timer = 0, drawing = 1, washing = 0, act = 0.3;
  const sel = el('select', { 'aria-label': 'Ink Draw: start from' });
  [...names, 'Custom'].forEach((n) => sel.append(el('option', { value: n }, n)));
  const json = el('textarea', { readonly: '', rows: '3', 'aria-label': 'Ink Draw settings' });
  const sliders = {}, grid = el('div', { class: 'grid' });
  const sync = () => {
    sel.value = names.find((n) => same(P, DRAW_PRESETS[n])) || 'Custom';
    for (const [k, , , , step] of DRAW_SCHEMA) { sliders[k].input.value = P[k]; sliders[k].out.textContent = fmt(P[k], step); }
    json.value = JSON.stringify(P);
  };
  const changed = () => { saveDraw(P); sync(); };
  for (const [k, label, min, max, step] of DRAW_SCHEMA) {
    const id = `draw-${k}`, out = el('output', { for: id });
    const input = el('input', { id, type: 'range', min, max, step, on: { input: (e) => { P[k] = Number(e.target.value); changed(); } } });
    sliders[k] = { input, out };
    grid.append(el('div', {}, el('label', { class: 'row', for: id }, el('span', {}, label), out), input));
  }
  sel.addEventListener('change', () => { if (sel.value !== 'Custom') { P = { ...DRAW_PRESETS[sel.value] }; changed(); } });
  const range = (id, v, set) => el('input', { id, type: 'range', min: 0, max: 1, step: 0.01, value: v, on: { input: (e) => set(Number(e.target.value)) } });
  const start = btn('Start the pen', () => {
    if (bed) { bed.dispose(); bed = null; clearInterval(timer); start.textContent = 'Start the pen'; return; }
    bed = makeDraw(audio());
    timer = setInterval(() => bed?.set(P, drawing, washing, act, 1), 40);
    start.textContent = 'Stop';
  }, true);
  const copy = btn('Copy settings', async () => {
    json.select();
    try { await navigator.clipboard.writeText(json.value); copy.textContent = 'Copied'; } catch { copy.textContent = 'Selected: copy it'; }
    setTimeout(() => { copy.textContent = 'Copy settings'; }, 1600);
  });
  root.append(
    el('h2', {}, 'Ink Draw'),
    el('p', { class: 'blurb' }, 'The bed runs while the pen draws: the nib scratching in strokes, the paper\'s tooth and the odd tap (the Drawing slider), and the watercolour wash swelling in behind it (the Washing slider). "Dab" is a click.'),
    el('div', { class: 'bar' }, el('label', { class: 'preset' }, 'Start from ', sel), start, btn('Dab', () => playDab(audio(), P, 1))),
    el('div', { class: 'grid live' },
      el('div', {}, el('label', { class: 'row', for: 'draw-drawing' }, el('span', {}, 'Drawing (pen up → down)')), range('draw-drawing', drawing, (v) => { drawing = v; })),
      el('div', {}, el('label', { class: 'row', for: 'draw-washing' }, el('span', {}, 'Washing (none → full)')), range('draw-washing', washing, (v) => { washing = v; })),
      el('div', {}, el('label', { class: 'row', for: 'draw-act' }, el('span', {}, 'Scrolling (calm → hard)')), range('draw-act', act, (v) => { act = v; }))),
    grid,
    el('div', { class: 'bar' }, copy, btn('Reset', () => { clearDraw(); P = { ...DRAW }; changed(); })),
    json,
  );
  sync();
  return root;
}
document.querySelector('#paper-panels').append(drawPanel());
