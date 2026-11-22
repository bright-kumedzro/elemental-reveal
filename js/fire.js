/* Fire: a comet. The first scroll calls it down. It streaks in from the top-right trailing fire, lights the page
   as it comes, and hits: a flash, a shockwave that bends everything it passes, and a blast crater ignites. From there the fire spreads with scroll. Ahead of it the paper browns and chars; at the front a
   rim glows red to white; flames rise off the burning band, torn into tongues by turbulence streaming upward;
   embers glow in the burnt edge and lift away. Behind it the finished design wavers in the heat.
   Bend it: move over the paper and fire follows your hand; click and a fireball flies up from below and lights
   a new fire where it lands. Scroll back to the top and the comet can come again. */
import { fbm, seedFuel, rand, fine, lite } from './core.js';

const IMPACT = [0.4, 0.42];                // where the comet lands (uv)
const START = [1.28, 1.32], CTRL = [0.98, 0.84];
const FLIGHT = 1150;                       // ms from first scroll to impact
const P0 = 0.02;                           // progress the spread is measured from
const BALL = 300;                          // fireball flight time, ms
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

function cometAt(t) {                      // accelerates in along a curve, uv
  const e = Math.pow(Math.min(1, Math.max(0, t)), 1.7), a = (1 - e) * (1 - e), b = 2 * e * (1 - e), c = e * e;
  return [a * START[0] + b * CTRL[0] + c * IMPACT[0], a * START[1] + b * CTRL[1] + c * IMPACT[1]];
}

function ember(ch, x, y, b = 1) {
  ch.spawn({ k: 0, x, y, vx: (Math.random() - 0.5) * 50 * b, vy: -rand(30, 140) * b, age: 0, life: rand(0.7, 2.1), size: rand(0.8, 2.6), ph: rand(0, 6.28) });
}
function spark(ch, x, y, b = 1) {
  const a = rand(0, 6.283), s = rand(120, 420) * b;
  ch.spawn({ k: 1, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80 * b, age: 0, life: rand(0.25, 0.7), w: rand(0.7, 1.7) });
}
function puff(ch, x, y, vx, vy, size) {   // a ball of flame: white-hot, cooling to red as it drifts and shrinks
  ch.spawn({ k: 2, x, y, vx, vy, age: 0, life: rand(0.25, 0.6), size });
}

function impact(ch, now) {
  const S = ch.s, x = IMPACT[0] * ch.W, y = (1 - IMPACT[1]) * ch.H;
  S.impact = now;
  for (let i = 0; i < (lite ? 50 : 110); i++) ember(ch, x, y, rand(1.5, 3.2));
  for (let i = 0; i < (lite ? 24 : 50); i++) spark(ch, x, y, 1.4);
  for (let i = 0; i < 14; i++) { const a = rand(0, 6.283), s = rand(80, 260); puff(ch, x, y, Math.cos(a) * s, Math.sin(a) * s, rand(14, 30)); }
}

const fire = {
  id: 'fire',
  num: '01',
  label: 'Fire',
  hud: 'Draft burned',
  hint: 'Scroll to call down the comet',
  clickHint: 'the paper to throw fire',
  clip: (k) => `inset(${k}% 0 0 0)`,
  uniforms: ['uComet', 'uImpact', 'uFlash'],
  theme: {
    accent: '#ff7a1a', accent2: '#ffd27a', onAccent: '#2a0c00', seed: 5,
    glowA: 'rgba(255,122,26,.12)', glowB: 'rgba(255,60,20,.08)',
    kicker: 'Experiment · Burn the draft',
    draft: ['Ship the', 'real thing?'], final: ['Ship the', 'real thing.'],
    aside: 'bigger. bolder.',
    sub: 'Every draft is fuel. Burn through the safe version and keep what survives.',
    note: ['v0.3', 'still too safe.', 'burn it.'],
    chips: [['Drafts burned', '37'], ['Shipped', '12']],
  },
  home: () => ({ u: IMPACT[0], v: IMPACT[1], p0: P0, born: 0, off: -10 }),   // dormant until the comet lands
  reach: (AR) => {
    const [u, v] = IMPACT;
    return Math.max(Math.hypot(u * AR, v), Math.hypot((1 - u) * AR, v), Math.hypot(u * AR, 1 - v), Math.hypot((1 - u) * AR, 1 - v)) + 0.34;
  },

  fuel(ch, u, v, now) {
    const ax = u * ch.AR, n = fbm(ax * 3, v * 3);
    return seedFuel(ch, ax, v, n, 0.45, 1, 0, now);
  },

  onFrame(ch, now) {
    const S = ch.s, home = ch.seeds[0];
    if (ch.p < 0.004) { S.launched = 0; S.impact = 0; home.off = -10; }   // back at the top: it can come again
    else if (!S.launched) S.launched = now;
    if (S.launched && !S.impact && now - S.launched >= FLIGHT) impact(ch, now);
    if (S.impact) {
      // the spread catches up with your scroll over a second or so, so a fast scroller still sees it run
      const g = easeOut(Math.min(1, (now - S.impact) / 1400));
      home.p0 = ch.p - Math.max(ch.p - P0, 0) * g;
      home.off = 0.1 * easeOut(Math.min(1, (now - S.impact) / 700)) - 0.02;   // the blast crater
    }
    for (const s of ch.seeds) if (s.hitAt) s.off = now < s.hitAt ? -10 : 0;   // thrown fire lights on landing
  },

  onClick(ch, seed, q, now) {
    seed.hitAt = now + BALL; seed.born = now + BALL; seed.off = -10;
    (ch.s.balls ||= []).push({ x0: ch.W * 0.5 + rand(-60, 60), y0: ch.H + 30, x1: q.x, y1: q.y, t0: now, done: false });
  },

  reset(ch) { Object.assign(ch.s, { launched: 0, impact: 0, balls: [], trail: [], path: [] }); },

  /* For capture: put the comet at a given point in its flight, or long since landed. */
  prime(ch, t, pv, params) {
    const S = ch.s;
    if (params.has('comet')) { S.launched = t - Number(params.get('comet')); S.impact = 0; }
    else if (pv > 0.004) { S.impact = t - 5000; S.launched = S.impact - FLIGHT; }
  },

  setUniforms(ch, gl, loc, now) {
    const S = ch.s;
    let cx = 0, cy = 0, ci = 0;
    if (S.launched && !S.impact) {
      const t = (now - S.launched) / FLIGHT, [u, v] = cometAt(t);
      cx = u * ch.AR; cy = v; ci = 0.35 + 0.65 * Math.min(1, t);
    }
    gl.uniform4f(loc.uComet, cx, cy, ci, 0);
    const age = S.impact ? (now - S.impact) / 1000 : 9;
    gl.uniform4f(loc.uImpact, IMPACT[0] * ch.AR, IMPACT[1], age * 1.5, age < 0.9 ? 1 - age / 0.9 : 0);
    gl.uniform1f(loc.uFlash, S.impact ? Math.exp(-(now - S.impact) / 150) : 0);
  },

  emit(ch, x, y, d, act) {
    if (d > -0.004 && d < 0.02) {
      if (Math.random() < act) ember(ch, x, y);
      if (Math.random() < act * 0.08) puff(ch, x, y, rand(-10, 10), -rand(40, 90), rand(6, 12));
    }
  },

  step(ch, c, dt) {
    const P = ch.parts;
    c.globalCompositeOperation = 'lighter';
    c.lineCap = 'round';
    for (let i = P.length - 1; i >= 0; i--) {
      const s = P[i];
      s.age += dt;
      if (s.age >= s.life) { P.splice(i, 1); continue; }
      const h = 1 - s.age / s.life;
      if (s.k === 0) {                                   // embers: heat lifts them and they wander
        s.vy -= 40 * dt; s.vx += Math.sin(s.age * 5 + s.ph) * 60 * dt; s.vx *= 1 - dt * 0.6;
        s.x += s.vx * dt; s.y += s.vy * dt;
        const rad = s.size * (0.5 + 0.5 * h);
        c.fillStyle = `rgba(255,110,40,${(h * 0.13).toFixed(3)})`;
        c.beginPath(); c.arc(s.x, s.y, rad * 3.4, 0, 6.283); c.fill();
        c.fillStyle = `rgba(255,${(90 + 160 * h * h) | 0},${(30 + 170 * h ** 4) | 0},${(h * 0.95).toFixed(3)})`;
        c.beginPath(); c.arc(s.x, s.y, rad, 0, 6.283); c.fill();
      } else if (s.k === 1) {                            // sparks: fast streaks that fall
        s.vy += 600 * dt; s.vx *= 1 - dt * 1.2;
        s.x += s.vx * dt; s.y += s.vy * dt;
        c.strokeStyle = `rgba(255,${(170 + 80 * h) | 0},${(80 + 120 * h) | 0},${h.toFixed(3)})`; c.lineWidth = s.w;
        c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(s.x - s.vx * 0.03, s.y - s.vy * 0.03); c.stroke();
      } else {                                           // flame puffs: cool from white to red as they go
        s.vx *= 1 - dt * 3; s.vy = s.vy * (1 - dt * 3) - 60 * dt;
        s.x += s.vx * dt; s.y += s.vy * dt;
        const r = s.size * (0.6 + 0.6 * (1 - h)), g = c.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
        g.addColorStop(0, `rgba(255,${(150 + 100 * h) | 0},${(60 + 160 * h * h) | 0},${(0.55 * h).toFixed(3)})`);
        g.addColorStop(0.5, `rgba(255,${(70 + 80 * h) | 0},20,${(0.28 * h).toFixed(3)})`);
        g.addColorStop(1, 'rgba(200,30,0,0)');
        c.fillStyle = g; c.beginPath(); c.arc(s.x, s.y, r, 0, 6.283); c.fill();
      }
    }
  },

  overlay(ch, c, dt, now) {
    const S = ch.s;
    c.globalCompositeOperation = 'lighter';
    c.lineCap = 'round'; c.lineJoin = 'round';

    // the comet: a white-hot head, a fire trail streaming off it
    if (S.launched && !S.impact) {
      const t = (now - S.launched) / FLIGHT, [u, v] = cometAt(t), [pu, pv] = cometAt(t - 0.05);
      const x = u * ch.W, y = (1 - v) * ch.H, px = pu * ch.W, py = (1 - pv) * ch.H;
      const dx = x - px, dy = y - py, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
      // fill the whole stretch it covered since last frame, so the tail is one continuous blaze
      const lh = S.lastHead && now - S.lastHead.t < 100 ? S.lastHead : { x: px, y: py };
      const span = Math.hypot(x - lh.x, y - lh.y), n = Math.min(lite ? 10 : 22, 4 + span / 6);
      for (let i = 0; i < n; i++) {
        const k = Math.random(), sx = x + (lh.x - x) * k, sy = y + (lh.y - y) * k, sp = rand(30, 170);
        puff(ch, sx + rand(-6, 6), sy + rand(-6, 6), -ux * sp + rand(-40, 40), -uy * sp + rand(-40, 40), rand(16, 34) * (0.7 + t * 0.6));
      }
      S.lastHead = { x, y, t: now };
      if (Math.random() < 0.8) ember(ch, x, y, 1.6);
      if (Math.random() < 0.5) spark(ch, x, y, 0.8);
      const L = len * 9;
      for (const [w, a0] of [[46 + 30 * t, 0.22], [18 + 12 * t, 0.6], [6 + 4 * t, 0.9]]) {
        const tail = c.createLinearGradient(x, y, x - ux * L, y - uy * L);
        tail.addColorStop(0, `rgba(255,${a0 > 0.8 ? 245 : 200},${a0 > 0.8 ? 210 : 130},${a0})`); tail.addColorStop(0.4, `rgba(255,120,30,${a0 * 0.5})`); tail.addColorStop(1, 'rgba(255,60,10,0)');
        c.strokeStyle = tail; c.lineWidth = w;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x - ux * L, y - uy * L); c.stroke();
      }
      const glow = (r, a, col) => { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col.replace('A', a)); g.addColorStop(1, col.replace('A', 0)); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 6.283); c.fill(); };
      glow(170 + 110 * t, 0.32, 'rgba(255,100,25,A)');
      glow(56 + 24 * t, 0.85, 'rgba(255,200,120,A)');
      glow(18 + 8 * t, 1, 'rgba(255,255,240,A)');
    }

    // thrown fire: a fireball arcs up from below and lands
    const B = S.balls || [];
    for (let i = B.length - 1; i >= 0; i--) {
      const b = B[i], t = (now - b.t0) / BALL;
      if (t >= 1) {
        for (let k = 0; k < 30; k++) ember(ch, b.x1, b.y1, rand(1.2, 2.4));
        for (let k = 0; k < 18; k++) spark(ch, b.x1, b.y1);
        for (let k = 0; k < 6; k++) { const a = rand(0, 6.283); puff(ch, b.x1, b.y1, Math.cos(a) * 120, Math.sin(a) * 120, rand(12, 22)); }
        B.splice(i, 1); continue;
      }
      const e = t * t, cxm = (b.x0 + b.x1) / 2, cym = Math.min(b.y0, b.y1) - 120;
      const x = (1 - e) * (1 - e) * b.x0 + 2 * e * (1 - e) * cxm + e * e * b.x1, y = (1 - e) * (1 - e) * b.y0 + 2 * e * (1 - e) * cym + e * e * b.y1;
      for (let k = 0; k < 4; k++) puff(ch, x + rand(-4, 4), y + rand(-4, 4), rand(-30, 30), rand(10, 60), rand(8, 16));
      const g = c.createRadialGradient(x, y, 0, x, y, 26);
      g.addColorStop(0, 'rgba(255,250,230,1)'); g.addColorStop(0.35, 'rgba(255,170,70,.8)'); g.addColorStop(1, 'rgba(255,60,10,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, 26, 0, 6.283); c.fill();
    }

    // bending: fire follows your hand across the paper
    if (fine) {
      const T = (S.trail ||= []);
      if (ch.ptr.on > 0.5) {
        const x = ch.ptr.u * ch.W, y = (1 - ch.ptr.v) * ch.H, l = T[T.length - 1];
        if (!l || Math.hypot(x - l.x, y - l.y) > 3) T.push({ x, y, t: now });
      }
      while (T.length && now - T[0].t > 320) T.shift();
      for (let i = 1; i < T.length; i++) {
        const a = T[i - 1], b = T[i], k = 1 - (now - b.t) / 320;
        const fl = 0.75 + 0.25 * Math.sin(now * 0.04 + i);
        c.strokeStyle = `rgba(255,80,20,${(0.22 * k).toFixed(3)})`; c.lineWidth = 22 * k * fl;
        c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
        c.strokeStyle = `rgba(255,170,60,${(0.5 * k).toFixed(3)})`; c.lineWidth = 9 * k * fl;
        c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
        c.strokeStyle = `rgba(255,240,200,${(0.75 * k).toFixed(3)})`; c.lineWidth = 3 * k;
        c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
        if (Math.random() < 0.15 * k) ember(ch, b.x, b.y, 0.6);
      }
    }
  },

  fs: `
uniform vec4 uComet;    // xy: the comet's head (aspect units) · z: how bright
uniform vec4 uImpact;   // xy: where it hit · z: shockwave radius · w: shockwave strength
uniform float uFlash;

float burning(float d) { return smoothstep(-.012, 0., d) * (1. - smoothstep(.02, .09, d)); }

void main() {
  vec2 uv = vUv;
  vec2 a = vec2(uv.x * uAr, uv.y);
  float rd = distance(a, uImpact.xy);
  float wave = uImpact.w * exp(-abs(rd - uImpact.z) * 40.);
  vec2 dir = (a - uImpact.xy) / max(rd, 1e-3);
  uv -= vec2(dir.x / uAr, dir.y) * wave * .012;                            // the shockwave bends what it crosses
  a = vec2(uv.x * uAr, uv.y);

  float n = fbm(a * 3.);
  float d = seedFuel(a, n, .45, 1., 0);
  float torch = uPtrOn * smoothstep(.15, 0., distance(a, uPtr) + (n - .5) * .07);

  // behind the front: the final, wavering in the heat, ashy just behind the edge
  float heat = d > 0. ? exp(-d * 18.) : 0.;
  vec2 wob = vec2(vn(a * 14. + vec2(0., -uT * 2.)), vn(a * 14. + vec2(31., -uT * 2.3))) - .5;
  vec3 fin = texture(uFinal, uv + wob * .009 * heat).rgb;
  fin *= 1. - .55 * smoothstep(.05, 0., d);

  // ahead of it: paper that browns, then chars
  vec3 dr = texture(uDraft, uv).rgb;
  float sc = smoothstep(-.14, 0., d);
  sc = max(sc * sc, torch * .5);
  dr = mix(dr, dr * vec3(.6, .4, .22), sc);
  dr = mix(dr, vec3(.07, .045, .03), smoothstep(-.03, 0., d));
  vec3 col = mix(dr, fin, smoothstep(0., .005, d));

  // embers still glowing in the burnt band
  float emb = burning(d) * smoothstep(.55, .9, vn(a * 55. + vec2(0., -uT * .8))) * (.6 + .4 * vn(a * 9. + uT * 3.));
  col += vec3(1., .38, .06) * emb * 1.2;

  // flames rise off the burning band below this pixel, torn into tongues by turbulence streaming upward
  float F = burning(d);
  for (int k = 1; k <= 4; k++) {
    float s = float(k) * .038;
    vec2 b = a - vec2(0., s);
    F = max(F, burning(seedFuel(b, fbm(b * 3.), .45, 1., 0)) * (1. - s / .17));
  }
  vec2 fp = vec2(a.x * 7., a.y * 4.5 - uT * 2.8);
  float tn = fbm(fp + vec2(vn(fp * .7 + vec2(0., uT)) * 1.6, 0.));
  float T = F * (.35 + tn * 1.25);
  float fl = smoothstep(.22, .9, T);
  vec3 flame = mix(vec3(.75, .1, .02), vec3(1., .5, .1), smoothstep(.35, .65, T));
  flame = mix(flame, vec3(1., .93, .72), smoothstep(.75, 1.05, T));
  col = col * (1. - fl * .35) + flame * fl * 1.35;

  // the burning rim: red, orange, white
  float flick = .68 + .32 * vn(a * 22. + vec2(uT * 1.7, -uT * 3.1));
  float k = clamp(exp(-abs(d) * 130.) * flick * 1.2, 0., 1.);
  col += vec3(min(k * 1.9, 1.), min(k * k * 1.25, 1.), min(k * k * k * k * 1.1, 1.)) * 1.4;
  col += vec3(1., .42, .1) * torch * torch * .1 * flick * step(d, 0.);

  // the comet lights the page as it comes in; the impact flashes, and its shockwave glows
  col += vec3(1., .55, .2) * uComet.z * (exp(-distance(a, uComet.xy) * 4.) * .45 + .05);
  col += vec3(1., .7, .35) * wave * .6;
  col += vec3(1., .8, .55) * uFlash * .35;
  o = vec4(col, 1.);
}`,
};

export default fire;
