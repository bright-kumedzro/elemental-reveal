/* Air: wind comes in from the left. The paper flutters before the gust arrives, then it is stripped off in
   streaks, smeared downwind before it lets go. Paper flecks keep the colour of the bit of sketch they tore from.
   Click to send a gust: it blows a hole outward from where you clicked. */
import { fbm, seedFuel, rand, DONE } from '../core.js';
import { bed, whoosh } from './sfx.js';

const LEAD = 0.45;   // the wind front starts this far left of the page

function fleck(ch, x, y, vx, vy) {
  ch.spawn({
    k: 0, x, y, vx, vy, age: 0, life: rand(1.2, 2.6),
    w: rand(2.5, 7), h: rand(1.5, 4.5), rot: rand(0, 6.28), vr: rand(-6, 6), fl: rand(0, 6.28), vf: rand(5, 13), ph: rand(0, 6.28),
    col: ch.draftColor(x, y),
  });
}

const air = {
  id: 'air',
  num: '03',
  label: 'Air',
  hud: 'Draft blown away',
  hint: 'Scroll to blow the draft away',
  clickHint: 'the paper to send a gust',
  clip: (k) => `inset(0 0 0 ${k}%)`,
  wantsColor: true,
  theme: {
    accent: '#a5b4fc', accent2: '#eef2ff', onAccent: '#0e1236', seed: 9,
    glowA: 'rgba(165,180,252,.11)', glowB: 'rgba(200,220,255,.06)',
    kicker: 'Experiment · Scatter the draft',
    draft: ['Lose the', 'dead weight?'], final: ['Lose the', 'dead weight.'],
    aside: 'lighter!',
    sub: 'Most of a draft is weight. Let the wind carry off the loose parts and see what stays put.',
    note: ['v0.5', 'too heavy.', 'blow it away.'],
    chips: [['Drafts scattered', '19'], ['Shipped', '12']],
  },
  home: () => ({ u: -0.3, v: 0.5, p0: 0, born: 0 }),
  reach: (AR) => AR + LEAD + 0.125 + 0.28 + 0.06 + 0.3,

  fuel(ch, u, v, now) {
    const ax = u * ch.AR, n = fbm(ax * 3, v * 3), st = fbm(ax * 1.3, v * 7);
    const d = ch.p * ch.K - LEAD - (ax + (0.5 - v) * 0.25) - (st - 0.5) * 0.55 - (n - 0.5) * 0.12;
    return Math.max(d, seedFuel(ch, ax, v, n, 0.3, 0.55, 1, now));
  },

  emit(ch, x, y, d, act) {
    if (d > 0 && d < 0.06) { if (Math.random() < act * 0.55) fleck(ch, x, y, rand(40, 110), rand(-50, 10)); }
    else if (d > 0.15 && Math.random() < 0.012) ch.spawn({ k: 1, x, y, vx: rand(500, 900), len: rand(40, 140), age: 0, life: rand(0.3, 0.7) });
  },

  onClick(ch) { whoosh(ch, 'air', 0.7, 1); },
  // the wind blows while it strips the page, harder the harder you scroll
  onFrame(ch, now) {
    const blowing = (ch.p > 0.004 && ch.p < DONE + 0.02) || ch.seeds.some((s) => s.born && now - s.born < 1500);
    bed(ch, 'air', blowing ? 1 : 0, Math.min(1, ch.speed * 6));
  },

  burst(ch, x, y) {
    for (let i = 0; i < 30; i++) { const a = rand(0, 6.283), s = rand(120, 260); fleck(ch, x, y, Math.cos(a) * s, Math.sin(a) * s); }
  },

  step(ch, c, dt, now) {
    const P = ch.parts;
    for (let i = P.length - 1; i >= 0; i--) {
      const s = P[i];
      s.age += dt;
      if (s.age >= s.life) { P.splice(i, 1); continue; }
      const h = 1 - s.age / s.life;
      if (s.k === 0) {                                   // a paper fleck, tumbling downwind
        const wind = 240 + 120 * Math.sin(now * 0.0013 + s.ph);
        s.vx += (wind - s.vx) * Math.min(1, dt * 1.4);
        s.vy += (Math.sin(s.age * 3 + s.ph) * 60 - 20) * dt;
        s.vy *= 1 - dt * 0.8;
        s.rot += s.vr * dt; s.fl += s.vf * dt;
        s.x += s.vx * dt; s.y += s.vy * dt;
        c.save();
        c.globalAlpha = Math.min(1, h * 4);
        c.translate(s.x, s.y); c.rotate(s.rot); c.scale(1, Math.cos(s.fl));
        c.fillStyle = 'rgba(60,45,30,.22)'; c.fillRect(-s.w / 2 + 1.5, -s.h / 2 + 2, s.w, s.h);   // lifted off the page
        c.fillStyle = s.col; c.fillRect(-s.w / 2, -s.h / 2, s.w, s.h);
        c.restore();
      } else {                                           // a wind line
        s.x += s.vx * dt;
        c.strokeStyle = `rgba(220,230,255,${(Math.sin(h * Math.PI) * 0.16).toFixed(3)})`; c.lineWidth = 1;
        c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(s.x - s.len, s.y); c.stroke();
      }
    }
  },

  fs: `
void main() {
  vec2 a = vec2(vUv.x * uAr, vUv.y);
  float n = fbm(a * 3.);
  float st = fbm(vec2(a.x * 1.3, a.y * 7.));                     // streaky noise, stretched along the wind
  float d = max(uP * uK - ${LEAD.toFixed(3)} - (a.x + (.5 - a.y) * .25) - (st - .5) * .55 - (n - .5) * .12, seedFuel(a, n, .3, .55, 1));
  float torch = uPtrOn * smoothstep(.17, 0., distance(a, uPtr));

  // ahead of the wind: the paper lifts and flutters
  float fl = smoothstep(-.2, 0., d);
  fl = max(fl * fl, torch * .7);
  float wave = sin(a.x * 38. - uT * 14. + a.y * 9. + n * 6.);
  vec2 off = vec2(.0006 * wave, .0024 * wave + .0012 * sin(a.x * 11. - uT * 6.)) * fl;
  vec3 dr = texture(uDraft, vUv + off).rgb;
  dr *= 1. - .06 * fl * (.5 + .5 * wave);

  // behind: stripped off in streaks, carried downwind before it lets go
  float ld = max(d, 0.);
  float strand = vn(vec2(a.x * 2.5 - uT * 1.2, a.y * 48.));
  float hold = .03 + .14 * strand * strand + .05 * st;            // how long each streak clings
  float peel = smoothstep(0., hold, ld);
  vec3 sm = texture(uDraft, vUv + off - vec2(ld * .6 / uAr, ld * .05)).rgb;
  vec3 fin = texture(uFinal, vUv).rgb;
  float wl = smoothstep(.8, 1., vn(vec2(a.x * 1.4 - uT * 2.2, a.y * 64.))) * exp(-ld * 2.5);
  fin += vec3(.78, .84, 1.) * wl * .09;                           // wind lines over the final

  vec3 col = d < 0. ? dr : mix(sm, fin, peel);
  col += vec3(.85, .9, 1.) * exp(-abs(d) * 110.) * .1;
  o = vec4(col, 1.);
}`,
};

export default air;
