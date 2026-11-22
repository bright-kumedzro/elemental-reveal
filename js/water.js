/* Water: a tide rises from the bottom of the page. Ahead of it the paper soaks, greys, and the pencil bleeds;
   under it the finished design wavers through moving water with caustic light drifting across it.
   Click to drop a stone: a ripple spreads and floods outward from where it lands. */
import { fbm, seedFuel, rand } from './core.js';

const TIDE = 0.15;   // the waterline starts this far below the page
const swell = (ax, n, t) => 0.028 * Math.sin(ax * 7 + t * 1.4) + 0.016 * Math.sin(ax * 15.3 - t * 2.1) + (n - 0.5) * 0.07;

function drop(ch, x, y, b) {
  ch.spawn({ k: 0, x, y, vx: (Math.random() - 0.5) * 80 * b, vy: -rand(50, 150) * b, age: 0, life: rand(0.5, 1.1), size: rand(0.8, 2.1) });
}

const water = {
  id: 'water',
  num: '01',
  label: 'Water',
  hud: 'Draft washed',
  hint: 'Scroll to flood the draft',
  clickHint: 'the paper to drop a stone',
  clip: (k) => `inset(0 0 ${k}% 0)`,
  theme: {
    accent: '#2dd4bf', accent2: '#a7f3f0', onAccent: '#032320', seed: 6,
    glowA: 'rgba(45,212,191,.10)', glowB: 'rgba(56,140,255,.08)',
    kicker: 'Experiment · Wash the draft',
    draft: ['Wash out', 'the noise?'], final: ['Wash out', 'the noise.'],
    aside: 'clearer?',
    sub: "Ideas run like ink. Let the water take whatever doesn't hold, and keep what does.",
    note: ['v0.4', 'too muddy.', 'wash it.'],
    chips: [['Drafts washed', '24'], ['Shipped', '12']],
  },
  home: () => ({ u: 0.5, v: -0.3, p0: 0, born: 0 }),
  reach: () => 1 + TIDE + 0.08 + 0.22,    // past the top, with a margin so the water has cleared by 100%

  fuel(ch, u, v, now) {
    const ax = u * ch.AR, n = fbm(ax * 3, v * 3), t = (now / 1000) % 1000;
    return Math.max(ch.p * ch.K - TIDE - v - swell(ax, n, t), seedFuel(ch, ax, v, n, 0.18, 0.6, 1, now));
  },

  emit(ch, x, y, d, act) {
    if (d > -0.004 && d < 0.012) { if (Math.random() < act * 0.6) drop(ch, x, y, 1); }
    else if (d > 0.04 && d < 0.3 && Math.random() < 0.05) {
      ch.spawn({ k: 1, x, y, vy: -rand(14, 40), age: 0, life: rand(1, 2.4), size: rand(1.2, 3.6), ph: rand(0, 6.28) });
    }
  },

  onClick(ch, seed, q, now) { (ch.s.rings ||= []).push({ x: q.x, y: q.y, t: now }); },
  burst(ch, x, y) { for (let i = 0; i < 28; i++) drop(ch, x, y, 1.7); },
  reset(ch) { ch.s.rings = []; },

  step(ch, c, dt, now) {
    const P = ch.parts;
    for (let i = P.length - 1; i >= 0; i--) {
      const s = P[i];
      s.age += dt;
      if (s.age >= s.life) { P.splice(i, 1); continue; }
      const h = 1 - s.age / s.life;
      if (s.k === 0) {                                   // spray: thrown up, falls back
        s.vy += 480 * dt; s.x += s.vx * dt; s.y += s.vy * dt;
        c.fillStyle = `rgba(120,200,225,${(h * 0.9).toFixed(3)})`;
        c.beginPath(); c.arc(s.x, s.y, s.size, 0, 6.283); c.fill();
        c.fillStyle = `rgba(235,252,255,${(h * 0.9).toFixed(3)})`;
        c.beginPath(); c.arc(s.x - s.size * 0.3, s.y - s.size * 0.3, s.size * 0.4, 0, 6.283); c.fill();
      } else {                                           // bubbles: rise and wobble, pop at the surface
        s.vy -= 18 * dt; s.x += Math.sin(s.age * 4 + s.ph) * 14 * dt; s.y += s.vy * dt;
        if (water.fuel(ch, s.x / ch.W, 1 - s.y / ch.H, now) < 0.01) { P.splice(i, 1); continue; }
        c.strokeStyle = `rgba(190,240,250,${(h * 0.55).toFixed(3)})`; c.lineWidth = 0.9;
        c.beginPath(); c.arc(s.x, s.y, s.size, 0, 6.283); c.stroke();
      }
    }
  },

  overlay(ch, c, dt, now) {
    const R = ch.s.rings;
    if (!R) return;
    for (let i = R.length - 1; i >= 0; i--) {
      const age = (now - R[i].t) / 1000;
      if (age > 1.6) { R.splice(i, 1); continue; }
      c.lineWidth = 1.5;
      for (let k = 0; k < 3; k++) {
        const a = age - k * 0.18;
        if (a <= 0) continue;
        c.strokeStyle = `rgba(225,248,255,${((1 - age / 1.6) * 0.55).toFixed(3)})`;
        c.beginPath(); c.arc(R[i].x, R[i].y, a * 190, 0, 6.283); c.stroke();
      }
    }
  },

  fs: `
void main() {
  vec2 a = vec2(vUv.x * uAr, vUv.y);
  float n = fbm(a * 3.);
  float sw = .028 * sin(a.x * 7. + uT * 1.4) + .016 * sin(a.x * 15.3 - uT * 2.1) + (n - .5) * .07;
  float d = max(uP * uK - ${TIDE.toFixed(3)} - a.y - sw, seedFuel(a, n, .18, .6, 1));
  float torch = uPtrOn * smoothstep(.14, 0., distance(a, uPtr) + (n - .5) * .08);

  // ahead of the water: the paper soaks it up, greys, and the pencil bleeds (darkest neighbour wins)
  float damp = smoothstep(-.16, 0., d);
  damp = max(damp * damp, torch * .7);
  vec2 px = 1. / vec2(textureSize(uDraft, 0));
  float r = 1. + damp * 4.;
  vec3 dr = texture(uDraft, vUv).rgb;
  vec3 ink = min(min(texture(uDraft, vUv + vec2(r, 0.) * px).rgb, texture(uDraft, vUv - vec2(r, 0.) * px).rgb),
                 min(texture(uDraft, vUv + vec2(0., r * 2.) * px).rgb, texture(uDraft, vUv - vec2(0., r) * px).rgb));
  dr = mix(dr, mix(dr, ink, .6), damp);
  dr *= mix(vec3(1.), vec3(.8, .84, .88), damp);
  dr *= 1. - vec3(.1, .16, .24) * exp(-abs(d + .03) * 70.) * step(d, 0.);     // a brown tide mark just ahead

  // under it: the final, refracted by moving water, with caustics; the effect fades as the level passes
  float depth = max(d, 0.);
  float wet = exp(-depth * 9.);
  vec2 wv = vec2(vn(a * 9. + vec2(uT * .7, uT * .4)), vn(a * 9. + vec2(17. - uT * .5, 3. + uT * .6))) - .5;
  vec3 fin = texture(uFinal, vUv + wv * .016 * wet).rgb;
  float c1 = vn(a * 10. + vec2(uT * .5, -uT * .3)), c2 = vn(a * vec2(12., 13.) + vec2(7. - uT * .4, 3. + uT * .45));
  float caus = pow(1. - abs(c1 - c2), 14.);
  fin = mix(fin, fin * vec3(.5, .78, .92) + vec3(0., .05, .08), wet * .7);
  fin += vec3(.3, .75, .85) * caus * wet * .4;

  vec3 col = mix(dr, fin, smoothstep(0., .004, d));

  // the waterline: a bright moving meniscus, a soft shadow above it, light just under it
  float fl = .65 + .35 * vn(vec2(a.x * 26. - uT * 3., uT * .5));
  col *= 1. - .22 * exp(-abs(d + .01) * 160.) * step(d, 0.);
  col = mix(col, vec3(.9, .98, 1.), clamp(exp(-abs(d) * 260.) * fl * 1.1, 0., .85));
  col += vec3(.2, .55, .65) * exp(-depth * 45.) * step(0., d) * .3;
  o = vec4(col, 1.);
}`,
};

export default water;
