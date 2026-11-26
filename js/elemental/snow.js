/* Snow: it starts to snow on the draft, the page is buried, then the snowpack slumps and melts away.
   Snowfall: a few flakes drift down at first, then it thickens into a proper snowfall, flakes at every depth (big
   soft ones close up, small sharp ones far off), swaying as they fall. The light goes grey and cold.
   Settling: flakes settle as a speckle that thickens, soft white caps build up on the top edges of the sketch's
   lines and boxes (anything darker than what is above it), and drifts rise from the bottom in dunes, until the
   page is a near-whiteout with only a ghost of the sketch under it.
   Thaw: the snowpack settles with a whumpf and starts to slide down the page. From the top it slumps and melts
   away along a lumpy wet edge, grey slush and a bright rim on the snow side, a film of melt with drips running
   down on the other, until the finished design is clear.
   Move over the paper and the flakes swirl round your hand. Click to send a gust that blows a hole in the snow. */
import { fbm, vn, seedFuel, clamp, rand, lite, fine, DONE } from '../core.js';
import { tunedSnow, makeSnow, playGust, playWhump } from './sfx-snow.js';

const PW = 0.46;               // progress by which the page is buried (near-whiteout)
const PM = 0.5;                // progress at which the snowpack starts to slump and melt from the top
const TOP0 = 1.12, TOP1 = -0.2; // the melt line's height (page fractions, y up) at PM and just before DONE
const TAU = Math.PI * 2;

const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const KM = (TOP0 - TOP1) / (DONE - PM - 0.01);
const slide = (p) => 0.2 * Math.pow(ss(PM - 0.02, DONE, p), 1.3);   // the whole pack slides down as it melts
// how hard it is snowing: a flurry at first, a full snowfall towards the whiteout, easing off through the thaw
const snowing = (p) => ss(0.002, 0.05, p) * (0.3 + 0.7 * ss(0.05, 0.3, p)) * (1 - 0.85 * ss(PM, DONE - 0.02, p));

/* The melt line: page height of the snow's top edge at x (aspect units). Mirrors top() in the shader. */
const topAt = (p, ax) => TOP0 - (p - PM) * KM + (vn(ax * 2.4, 7.3) - 0.5) * 0.14 + (vn(ax * 6.5, 3.1) - 0.5) * 0.05 + (vn(ax * 17, 5.3) - 0.5) * 0.018;

function fuel(ch, u, v, now) {
  const ax = u * ch.AR, ay = v;
  return Math.max(ay - topAt(ch.p, ax), seedFuel(ch, ax, ay, fbm(ax * 3, ay * 3), 0.2, 0.7, 1, now));
}

/* ---------- flakes ---------- */
let SPRITE = null;
function sprite() {   // one soft flake, drawn scaled for every size: white, with a faint grey-blue rim so it shows on paper too
  if (SPRITE || typeof document === 'undefined') return SPRITE;
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const x = c.getContext('2d'), g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(250,252,255,.9)'); g.addColorStop(0.62, 'rgba(150,165,190,.32)'); g.addColorStop(1, 'rgba(150,165,190,0)');
  x.fillStyle = g; x.fillRect(0, 0, 32, 32);
  return (SPRITE = c);
}
const budget = () => (lite ? 110 : 260);
function flake(ch, y, z = Math.pow(Math.random(), 1.25)) {
  const sc = ch.H / 700;
  ch.spawn({
    k: 0, x: rand(-30, ch.W + 30), y: y ?? rand(-40, -6), z,
    vx: 0, vy: 0, vt: (34 + 150 * z * z + rand(-8, 8)) * sc, r: (0.8 + 5.2 * z * z) * Math.max(0.7, sc),
    ph: rand(0, TAU), sw: rand(0.6, 1.6), age: 0, life: 1e9,
  });
}
function sparkle(ch, x, y) { ch.spawn({ k: 1, x, y, vx: rand(-6, 6), vy: rand(-6, 10), age: 0, life: rand(0.5, 1.2), r: rand(0.9, 2), ph: rand(0, 6.28) }); }
function drip(ch, x, y) { ch.spawn({ k: 3, x, y, vx: 0, vy: rand(16, 34), age: 0, life: rand(1.2, 2.4), r: rand(1.2, 2.2) }); }
function clump(ch, x, y) { ch.spawn({ k: 4, x, y, vx: rand(-4, 4), vy: rand(4, 14), age: 0, life: rand(0.8, 1.6), r: rand(2, 5) }); }
const flakeCount = (ch) => { let n = 0; for (const s of ch.parts) if (s.k === 0) n++; return n; };

/* ---------- sound ---------- */
const live = (ch) => ch.sound?.ctx && (ch.mode ? ch.mode === 'gl' : !!ch.gl);
function steer(ch, snow, melt, act, on) {
  if (!live(ch)) return;
  ch.bed ||= makeSnow(ch.sound);
  ch.bed.set(tunedSnow(), snow, melt, act, on);
}

const snow = {
  id: 'snow',
  num: '07',
  label: 'Snow',
  hud: 'Draft snowed under',
  hint: 'Scroll to let it snow',
  clickHint: 'the snow to send a gust',
  // no WebGL2: the draft's top edge sinks down the page in a lumpy line, like the snow melting off it
  clip: (k) => {
    const y = Number(k) * 1.1 - 6, pts = [];
    for (let n = 0; n <= 20; n++) {
      const x = n * 5, w = Math.sin(n * 1.7) * 2.2 + Math.sin(n * 0.6 + 1) * 1.6;
      pts.push(`${x}% ${Math.max(0, y + w).toFixed(2)}%`);
    }
    return `polygon(${pts.join(', ')}, 100% 100%, 0% 100%)`;
  },
  mips: true,          // the snow caps read the sketch blurred, so thin lines still catch snow
  uniforms: ['uKM', 'uSl'],
  theme: {
    accent: '#f6b8cf', accent2: '#ffe3ee', onAccent: '#2a0d18', seed: 23,
    glowA: 'rgba(246,184,207,.12)', glowB: 'rgba(200,215,255,.07)',
    kicker: 'Experiment · Snow the draft',
    draft: ['Clean', 'slate?'], final: ['Clean', 'slate.'],
    aside: 'start fresh.',
    sub: 'Let the first version snow under. When it thaws, the design underneath is clean and ready.',
    note: ['v0.4', 'too busy.', 'cover it.'],
    chips: [['Drafts snowed under', '19'], ['Shipped', '12']],
  },
  home: () => ({ u: 0.5, v: 1, p0: 0, born: 0, off: -10 }),   // only for clicks' growth rate; the thaw has its own timing
  reach: () => 0.5,
  fuel,

  // through the thaw: glints along the wet edge, drips running down below it, the odd clump of slush letting go
  emit(ch, x, y, d, act) {
    if (ch.p < PM - 0.01) return;
    if (d < 0 && d > -0.02 && Math.random() < act * 0.08) sparkle(ch, x, y);
    else if (d > 0 && d < 0.035 && Math.random() < 0.02) drip(ch, x, y);
    else if (d < 0 && d > -0.015 && Math.random() < act * 0.02) clump(ch, x, y);
  },

  onClick(ch, seed) {
    seed.off = 0.01;
    ch.s.gust = { x: seed.u * ch.W, y: (1 - seed.v) * ch.H, t: 0 };
    if (live(ch)) playGust(ch.sound, tunedSnow(), 1);
  },
  burst(ch, x, y) {
    for (let i = 0; i < (lite ? 18 : 36); i++) {   // a flurry thrown out of the hole
      const a = rand(0, TAU), sp = rand(120, 420), z = Math.random();
      ch.spawn({ k: 0, x: x + Math.cos(a) * 6, y: y + Math.sin(a) * 6, z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vt: (34 + 150 * z * z) * (ch.H / 700), r: (0.8 + 4 * z * z), ph: rand(0, TAU), sw: rand(0.6, 1.6), age: 0, life: 1e9 });
    }
    for (let i = 0; i < 6; i++) { const a = rand(0, TAU); ch.spawn({ k: 2, x: x + Math.cos(a) * 10, y: y + Math.sin(a) * 10, vx: Math.cos(a) * rand(30, 90), vy: Math.sin(a) * rand(30, 90) - 20, age: 0, life: rand(0.7, 1.2), r: rand(14, 30) }); }
  },
  reset(ch) { ch.bed?.silence(); ch.s.filled = false; ch.s.carry = 0; ch.s.gust = null; },
  quiet(ch) { ch.bed?.silence(); },
  prime(ch) { ch.parts.length = 0; ch.s.filled = false; ch.s.carry = 0; },   // capture: the snowfall is already under way

  onFrame(ch, now, dt = 1 / 60) {
    const S = ch.s, I = snowing(ch.p);
    // the snowfall: new flakes in at the top, at a rate that keeps the count matching how hard it's snowing
    if (I > 0.01 && ch.mode === 'gl') {
      if (!S.filled) {   // the page opens mid-snowfall: flakes already everywhere, not all arriving from the top
        S.filled = true;
        for (let i = flakeCount(ch), n = Math.round(I * budget()); i < n; i++) flake(ch, rand(-10, ch.H));
      }
      const meanFall = (34 + 150 * 0.3) * (ch.H / 700);
      S.carry = (S.carry || 0) + (I * budget() * meanFall / (ch.H + 40)) * Math.min(dt, 0.1);
      while (S.carry >= 1) { S.carry -= 1; if (flakeCount(ch) < budget()) flake(ch); }
    } else if (I <= 0.01) S.filled = false;
    if (S.gust) S.gust.t += dt;
    // sound: the hush of the snowfall and the wind, then slush and drips through the thaw; the pack settling
    const melt = ss(PM - 0.02, PM + 0.05, ch.p) * (1 - ss(DONE - 0.02, DONE + 0.03, ch.p));
    const on = ch.p > 0.003 && ch.p < DONE + 0.05 ? 1 : 0;
    steer(ch, I, melt, Math.min(1, ch.speed * 6), on);
    if (live(ch) && ch.pPrev < PM && ch.p >= PM) playWhump(ch.sound, tunedSnow(), 1);
    ch.quake = Math.max(ch.quake * 0.5, ch.p > PM && ch.p < PM + 0.04 ? ss(PM, PM + 0.01, ch.p) * (1 - ss(PM + 0.01, PM + 0.04, ch.p)) * 0.6 : 0);
  },

  setUniforms(ch, gl, loc) {
    gl.uniform1f(loc.uKM, KM);
    gl.uniform1f(loc.uSl, slide(ch.p));
  },

  step(ch, c, dt, now) {
    const P = ch.parts, S = ch.s, img = sprite(), t = now / 1000;
    const wind = (Math.sin(t * 0.37) * 0.6 + Math.sin(t * 1.13 + 1) * 0.3 + 0.25) * 34 * (ch.H / 700);
    const px = ch.ptr.u * ch.W, py = (1 - ch.ptr.v) * ch.H, pon = fine ? ch.ptr.on : 0;
    const g = S.gust, gk = g ? Math.exp(-g.t / 0.35) : 0;
    for (let i = P.length - 1; i >= 0; i--) {
      const s = P[i];
      s.age += dt;
      if (s.age >= s.life) { P.splice(i, 1); continue; }
      if (s.k === 0) {                                   // a flake, swaying down
        s.vy += (s.vt - s.vy) * (1 - Math.exp(-dt * 1.6));
        s.vx *= Math.exp(-dt * 1.8);
        if (pon > 0.05) {                               // the hand stirs the flakes near it
          const dx = s.x - px, dy = s.y - py, d2 = dx * dx + dy * dy, R = 110;
          if (d2 < R * R) { const d = Math.sqrt(d2) || 1, f = (1 - d / R) * 900 * pon * dt; s.vx += (dx / d) * f - (dy / d) * f * 0.6; s.vy += (dy / d) * f * 0.5 + (dx / d) * f * 0.6; }
        }
        if (gk > 0.02) {                                // a click's gust throws flakes away from it
          const dx = s.x - g.x, dy = s.y - g.y, d = Math.hypot(dx, dy) || 1;
          if (d < 260) { const f = (1 - d / 260) * 2600 * gk * dt; s.vx += (dx / d) * f; s.vy += (dy / d) * f; }
        }
        s.x += (s.vx + wind * (0.35 + s.z) + Math.sin(s.age * s.sw + s.ph) * 14 * (0.4 + s.z)) * dt;
        s.y += s.vy * dt;
        if (s.y > ch.H + 20 || s.x < -60 || s.x > ch.W + 60) { P.splice(i, 1); continue; }
        const a = Math.min(1, s.age * 3) * (0.55 + 0.35 * (1 - s.z));
        if (s.r < 1.6 || !img) {
          c.fillStyle = `rgba(120,135,160,${(a * 0.35).toFixed(3)})`;
          c.fillRect(s.x - s.r * 0.9, s.y - s.r * 0.9, s.r * 1.8, s.r * 1.8);
          c.fillStyle = `rgba(255,255,255,${(a * 0.95).toFixed(3)})`;
          c.fillRect(s.x - s.r * 0.6, s.y - s.r * 0.6, s.r * 1.2, s.r * 1.2);
        } else {
          const d = s.r * (2.2 + s.z * 1.2);
          c.globalAlpha = a * (s.z > 0.75 ? 0.75 : 1);
          c.drawImage(img, s.x - d / 2, s.y - d / 2, d, d);
          c.globalAlpha = 1;
        }
      } else if (s.k === 1) {                            // a glint in the wet snow
        s.x += s.vx * dt; s.y += s.vy * dt;
        const tw = 0.55 + 0.45 * Math.sin(s.age * 16 + s.ph), a = Math.min(1, (1 - s.age / s.life) * 2) * tw, r = s.r;
        c.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
        c.beginPath(); c.moveTo(s.x, s.y - r * 1.8); c.lineTo(s.x + r * 0.5, s.y); c.lineTo(s.x, s.y + r * 1.8); c.lineTo(s.x - r * 0.5, s.y); c.closePath(); c.fill();
        c.fillRect(s.x - r * 1.6, s.y - 0.4, r * 3.2, 0.8);
      } else if (s.k === 2) {                            // a puff of snow from a gust
        s.vx *= Math.exp(-dt * 3); s.vy = s.vy * Math.exp(-dt * 3) + 20 * dt;
        s.x += s.vx * dt; s.y += s.vy * dt;
        const h = 1 - s.age / s.life, r = s.r * (1 + s.age * 1.4);
        c.globalAlpha = h * 0.45;
        if (img) c.drawImage(img, s.x - r, s.y - r, r * 2, r * 2);
        c.globalAlpha = 1;
      } else if (s.k === 3) {                            // a drop of melt sliding down the design
        s.y += s.vy * dt; s.vy *= 1 - dt * 0.3;
        const a = Math.min(1, (1 - s.age / s.life) * 2) * 0.65;
        c.strokeStyle = `rgba(210,228,250,${(a * 0.35).toFixed(3)})`; c.lineWidth = s.r * 0.9;
        c.beginPath(); c.moveTo(s.x, s.y - 16); c.lineTo(s.x, s.y); c.stroke();
        c.fillStyle = `rgba(232,242,255,${a.toFixed(3)})`;
        c.beginPath(); c.arc(s.x, s.y, s.r, 0, 6.283); c.fill();
      } else {                                           // a clump of slush letting go and sliding
        s.vy += 60 * dt; s.x += s.vx * dt; s.y += s.vy * dt;
        const a = Math.min(1, (1 - s.age / s.life) * 2) * 0.85;
        c.fillStyle = `rgba(236,240,246,${a.toFixed(3)})`;
        c.beginPath(); c.ellipse(s.x, s.y, s.r * 1.2, s.r, 0, 0, 6.283); c.fill();
        c.fillStyle = `rgba(170,182,200,${(a * 0.5).toFixed(3)})`;
        c.beginPath(); c.ellipse(s.x, s.y + s.r * 0.45, s.r, s.r * 0.45, 0, 0, 6.283); c.fill();
      }
    }
    if (g && gk < 0.02) S.gust = null;
  },

  fs: `
const float PW = ${PW.toFixed(3)}, PM = ${PM.toFixed(3)}, TOP0 = ${TOP0.toFixed(3)};
const vec3 SNOW = vec3(.95, .96, .985);
uniform float uKM, uSl;

// the sketch's darkness, read blurred so a thin pencil line still counts
float dk(vec2 uv) { return 1. - dot(textureLod(uDraft, clamp(uv, 0., 1.), 1.4).rgb, vec3(.299, .587, .114)); }
// the same, smeared sideways, so snow lies across a word as one bank instead of a column per letter
float dkw(vec2 uv) {
  vec2 s = vec2(.006 / uAr, 0.);
  vec3 c = textureLod(uDraft, clamp(uv, 0., 1.), 2.2).rgb * .4 + (textureLod(uDraft, clamp(uv - s, 0., 1.), 2.2).rgb + textureLod(uDraft, clamp(uv + s, 0., 1.), 2.2).rgb) * .3;
  return 1. - dot(c, vec3(.299, .587, .114));
}
float ss1(float a, float b, float x) { return smoothstep(a, b, x); }

// snow caps: lying on the top edge of anything darker than the paper above it, lumpy, deeper as it piles up
float caps(vec2 uv, vec2 a, float acc) {
  if (acc <= .001) return 0.;
  float here = dkw(uv);
  float capH = acc * .042 * (.55 + .7 * vn(vec2(a.x * 22., 3.))) + .002;
  float best = 0.;
  for (int k = 1; k <= 12; k++) {
    float off = float(k) * .0046;
    float below = dkw(uv - vec2(0., off));
    float edge = smoothstep(.06, .2, below - here) * (1. - smoothstep(capH * .6, capH, off));
    best = max(best, edge);
  }
  return best * (1. - smoothstep(.2, .36, here));
}

void main() {
  vec2 uv = vUv + uQuake * vec2(sin(uT * 61.), cos(uT * 73.)) * .002;
  vec2 a = vec2(uv.x * uAr, uv.y);

  // the reveal: the melt line sinking down the page, and the holes clicks blow
  float top = TOP0 - (uP - PM) * uKM + (vn(vec2(a.x * 2.4, 7.3)) - .5) * .14 + (vn(vec2(a.x * 6.5, 3.1)) - .5) * .05 + (vn(vec2(a.x * 17., 5.3)) - .5) * .018;
  float sd = seedFuel(a, fbm(a * 3.), .2, .7, 1);
  float d = max(a.y - top, sd);

  float cold = ss1(0., .2, uP) * (1. - ss1(.72, ${DONE.toFixed(2)}, uP));
  float acc = ss1(.03, PW, uP);

  // the snowpack slides down as it melts: everything under the melt line is read from higher up
  vec2 uv2 = uv + vec2(0., uSl), a2 = a + vec2(0., uSl);
  vec3 col = texture(uDraft, uv2).rgb;
  col *= mix(vec3(1.), vec3(.88, .91, .97), cold);                          // grey, cold light

  // settled flakes: a speckle that thickens, two sizes
  float dens = ss1(.01, .42, uP);
  vec2 g1 = floor(a2 * 48.), f1 = fract(a2 * 48.) - .5 - (vec2(h(g1 + 3.), h(g1 + 7.)) - .5) * .5;
  vec2 g2 = floor(a2 * 105.), f2 = fract(a2 * 105.) - .5 - (vec2(h(g2 + 5.), h(g2 + 11.)) - .5) * .5;
  float dots = max(step(h(g1), dens * .55) * smoothstep(.3, .08, length(f1)), step(h(g2), dens * .5) * smoothstep(.3, .1, length(f2)) * .8);
  // drifts rising from the bottom in dunes
  float hb = acc * acc * .6 + (fbm(vec2(a2.x * 2.2, 1.7)) - .5) * .22 * acc + (vn(vec2(a2.x * 7., 4.)) - .5) * .05 * acc - .05;
  float drift = smoothstep(hb + .006, hb - .006, a2.y);
  float cap = caps(uv2, a2, ss1(.02, .34, uP));
  float veil = ss1(.14, PW + .03, uP) * .88 + ss1(PW, PM + .06, uP) * .12;   // a ghost of the sketch at the whiteout, then solid
  float cover = max(max(cap, drift), max(dots * .8, veil));

  // the snow itself: soft lumps, blue in the hollows, a shadow just under a drift's crest, glinting
  float n = fbm(a2 * vec2(5., 7.) + vec2(0., 3.));
  vec3 snow = mix(vec3(.8, .85, .93), SNOW, .55 + .45 * n);
  snow = mix(snow, vec3(1.), drift * smoothstep(.03, 0., hb - a2.y) * .5 * (1. - veil));   // drift crests catch the light
  snow *= 1. - .14 * cap * (1. - cap) * 4. * (1. - veil) * (1. - drift);                                // a soft shaded rim round each cap
  vec2 cell = floor(a2 * 420.);
  float tw = step(.993, h(cell)) * (.5 + .5 * sin(uT * 5. + h(cell + 3.) * 40.));
  col = mix(col, snow, cover);
  col += tw * cover * .3;
  col = mix(col, vec3(.97, .98, 1.), exp(-abs(sd + .012) / .01) * smoothstep(-.06, -.012, sd) * .6);   // snow thrown up round a gust's hole

  // the melting edge on the snow side: a rounded lip catching the light, its underside a touch grey, and right at
  // the line a thin edge of slush you can half see through
  vec3 fin = texture(uFinal, uv).rgb;
  float thaw = step(PM - .01, uP) * step(d, 0.), under = -d;
  col = mix(col, vec3(.995), exp(-under / .018) * thaw * .55);
  col *= 1. - .07 * smoothstep(.012, .045, under) * (1. - smoothstep(.06, .13, under)) * thaw;
  col = mix(col, mix(fin, vec3(.8, .84, .9), .6), smoothstep(-.01, 0., d) * thaw * .5);

  // where it's gone: the finished design under a film of melt, drips running down, cold near the edge
  if (d > 0.) {
    float w = exp(-d / .06);
    vec2 refr = (vec2(vn(a * 40. + vec2(0., uT * .3)), vn(a * 40. + 9.)) - .5) * .006 * w;
    vec3 f = texture(uFinal, uv + vec2(refr.x / uAr, refr.y)).rgb;
    f *= 1. - .16 * w;
    float streak = smoothstep(.72, .95, vn(vec2(a.x * 80., a.y * 3. + uT * .45))) * w;
    f += vec3(.75, .85, 1.) * streak * .1;
    f = mix(f, f * vec3(.92, .95, 1.03), cold * .6);
    col = f;
  }
  o = vec4(clamp(col, 0., 1.), 1.);
}`,
};

export default snow;
