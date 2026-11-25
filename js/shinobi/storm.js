/* Sandstorm: a gale gets up, a wall of dust rolls across the page and scours the draft away.
   From the first scroll the wind is up: sand races across the whole page in gusts that come in waves, bands of haze
   drift past, grains blast by and bounce, the paper shivers, and the light goes orange-brown and dim. On the left a
   towering wall of dust looms, rust-dark at its base and paler and raggeder towards the top, its billows rolling
   forward. It bears down and sweeps across. Inside there's almost nothing to see: the page goes hazy brown and
   streaks of sand race across. The sand scours the sketch off grain by grain inside the wall, and behind it the
   haze slowly thins onto the finished design.
   Move over the paper and the sand eddies round your hand. Click to kick up a dust devil that scours its own hole. */
import { fbm, hh, ign, clamp, rand, lite, DONE, MAX_SEEDS } from '../core.js';
import { tuned } from './sfx.js';
import { STORM, makeStorm, playGust } from './sfx-storm.js';

const GS = 0.0028;      // one grain, in page heights
const LEAD = 0.3;       // the wall starts this far left of the page: its billows already loom in at the left edge
const SLANT = 0.16;     // its top leans this much ahead of its base
const BIL = 0.2;        // how far its edge lumps in and out
const LAG = 0.3;        // the draft is scoured away this far inside the wall
const THICK = 0.36;     // the wall is all but opaque for this depth
const CLEAR = 0.5;      // behind that, the haze thins over about this distance
const SAND = ['#c9a06a', '#dcb680', '#b8895a', '#e8cc98', '#a77a4b', '#9a6a40'];

const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lead = (y) => SLANT * y + BIL * (fbm(y * 2.5, 7) - 0.5);   // the wall's shape, top leaning ahead
const wallX = (ch) => ch.p * ch.K - LEAD;                          // where its base line is (aspect units)
const sandCol = () => SAND[(Math.random() * SAND.length) | 0];
// the gale: up within the first few percent of scroll, dying away as the air clears
const galeOf = (p) => ss(0, 0.035, p) * (1 - ss(0.86, 1, p));
// gusts come in waves (the shader runs the same wave across the page)
const gustOf = (now) => { const t = now / 1000; return 0.55 + 0.45 * Math.sin(-t * 3.1 + Math.sin(t * 0.7) * 2); };
// how much of the storm is on you: loud from the first scroll, fullest inside the wall, gone as the air clears
const inside = (ch) => { const x = wallX(ch) + lead(0.5); return ss(-0.45, 0.15, x) * (1 - ss(ch.AR + 0.35, ch.AR + 1.1, x)); };
const presence = (ch) => galeOf(ch.p) * (0.6 + 0.4 * inside(ch));

function fuel(ch, u, v, now) {
  const ax = u * ch.AR, ay = v, gr = hh(Math.floor(ax / GS), Math.floor(ay / GS));
  let d = wallX(ch) + lead(ay) - LAG - ax + (fbm(ax * 5, ay * 5) - 0.5) * 0.05 + (gr - 0.5) * 0.04;
  for (let i = 1; i < ch.seeds.length; i++) {
    const s = ch.seeds[i];
    d = Math.max(d, Math.max(ch.p - s.p0, 0) * ch.K * 0.35 + ign(s, now) + (s.off || 0) - Math.hypot(ax - s.u * ch.AR, ay - s.v) + (gr - 0.5) * 0.05);
  }
  return d;
}

/* ---------- particles ---------- */
// a grain hopping along the paper in the wind (it bounces where it started, lower each time)
function grain(ch, x, y, vx, col) { ch.spawn({ k: 0, x, y, y0: y, vx, vy: -rand(20, 90), hop: 1, age: 0, life: rand(0.7, 1.6), z: rand(1.1, 2.4), col: col || sandCol() }); }
// a streak of sand racing past
function streak(ch, x, y, a = rand(0.25, 0.6)) { ch.spawn({ k: 1, x, y, vx: rand(650, 1200), vy: rand(-30, 20), len: rand(18, 70), age: 0, life: rand(0.25, 0.6), a }); }
// a puff of dust (a click's devil throws these out)
function puff(ch, x, y, vx, vy) { ch.spawn({ k: 2, x, y, vx, vy, age: 0, life: rand(1, 1.8), r: rand(14, 30), gr: rand(25, 60) }); }
// a scrap of the sketch, torn off and tumbling away downwind
function fleck(ch, x, y) {
  ch.spawn({ k: 3, x, y, vx: rand(250, 520), vy: rand(-60, 30), age: 0, life: rand(0.6, 1.3), w: rand(2, 5), h: rand(1.5, 3.5), rot: rand(0, 6.28), vr: rand(-12, 12), col: ch.draftColor(x, y) });
}

/* ---------- sound ---------- */
function steer(ch) {
  const A = ch.sound;
  if (!A?.ctx || ch.mode !== 'gl') return;
  const S = (ch.s.snd = ch.s.snd || makeStorm(A));
  S.set(tuned('storm', STORM), presence(ch), Math.min(1, ch.speed * 6));
}
function hush(ch) { ch.s.snd?.silence(); }

const storm = {
  id: 'storm',
  num: '05',
  label: 'Sandstorm',
  hud: 'Draft scoured',
  hint: 'Scroll to bring the storm in',
  clickHint: 'the paper to kick up a dust devil',
  // no WebGL2: the draft is wiped off from the left
  clip: (k) => `inset(0 0 0 ${Number(k).toFixed(2)}%)`,
  wantsColor: true,
  uniforms: ['uW', 'uEnd', 'uAge'],
  theme: {
    accent: '#d2593c', accent2: '#f4c9a8', onAccent: '#2a0d05', seed: 22,
    glowA: 'rgba(210,89,60,.12)', glowB: 'rgba(200,140,80,.08)',
    kicker: 'Experiment · Scour the draft',
    draft: ['Clear the', 'air?'], final: ['Clear the', 'air.'],
    aside: 'let it blow over.',
    sub: 'Let the storm roll through the first draft. Whatever it leaves standing was worth keeping.',
    note: ['v0.4', 'too cluttered.', 'scour it.'],
    chips: [['Drafts scoured', '22'], ['Shipped', '12']],
  },
  home: () => ({ u: 0, v: 0.5, p0: 0, born: 0 }),
  // by DONE the scour line has to pass the right edge, wherever the wall's lumps put it
  reach: (AR) => AR + LEAD + LAG + BIL * 0.5 + 0.07,
  fuel,

  emit(ch, x, y, d, act) {
    const r = Math.random();
    if (d < -LAG && d > -LAG - 0.45) {                 // ahead of the wall: grains skitter, faster closer in
      const near = 1 - (-LAG - d) / 0.45;
      if (r < (0.06 + 0.3 * near) * galeOf(ch.p)) grain(ch, x, y, rand(80, 200) + 300 * near, Math.random() < 0.3 ? ch.draftColor(x, y) : null);
    } else if (d >= -LAG && d < 0.02) {                // inside the wall: sand races through and tears the sketch off
      if (r < act * 0.45) streak(ch, x, y);
      else if (r < act * 0.6) fleck(ch, x, y);
    } else if (d >= 0.02 && d < THICK && r < 0.08) streak(ch, x, y);
  },

  onClick(ch, seed) { seed.off = -0.02; if (ch.sound?.ctx) playGust(ch.sound, tuned('storm', STORM)); },
  burst(ch, x, y) {
    for (let i = 0; i < 28; i++) { const a = rand(0, 6.283), sp = rand(70, 220); ch.spawn({ k: 4, x, y, vx: -Math.sin(a) * sp + Math.cos(a) * 40, vy: Math.cos(a) * sp + Math.sin(a) * 40, age: 0, life: rand(0.8, 1.6), z: rand(1.2, 2.6), col: sandCol(), cx: x, cy: y }); }
    for (let i = 0; i < 7; i++) { const a = rand(0, 6.283), sp = rand(30, 110); puff(ch, x, y, Math.cos(a) * sp, Math.sin(a) * sp - 30); }
  },
  reset(ch) { hush(ch); ch.s = { snd: ch.s.snd }; },
  quiet: hush,

  onFrame(ch, now, dt) {
    const s = ch.s, gale = galeOf(ch.p);
    // the page shivers in the gale, and the ground trembles while the wall is over you
    ch.quake = Math.max(ch.quake * 0.5, gale * 0.07, presence(ch) * 0.12);
    steer(ch);
    // the gale: sand blasting across the whole page from the first scroll, thicker in each gust
    if (gale > 0.01 && ch.mode === 'gl') {
      s.acc = (s.acc || 0) + dt * (lite ? 55 : 130) * gale * (0.4 + gustOf(now));
      while (s.acc >= 1) {
        s.acc--;
        const x = rand(-60, ch.W), y = rand(0, ch.H);
        if (Math.random() < 0.6) streak(ch, x, y, rand(0.2, 0.5));
        else grain(ch, x, y, rand(320, 760));
      }
    }
  },

  setUniforms(ch, gl, loc, now) {
    const s = ch.s;
    s.age = s.age || new Float32Array(MAX_SEEDS);
    s.age.fill(99);
    ch.seeds.forEach((sd, i) => { if (i && sd.born) s.age[i] = (now - sd.born) / 1000; });
    gl.uniform1f(loc.uW, wallX(ch));
    gl.uniform1f(loc.uEnd, ss(DONE - 0.06, 1, ch.p));
    gl.uniform1fv(loc.uAge, s.age);
  },

  step(ch, c, dt) {
    const P = ch.parts;
    c.lineCap = 'round';
    for (let i = P.length - 1; i >= 0; i--) {
      const s = P[i];
      s.age += dt;
      if (s.age >= s.life) { P.splice(i, 1); continue; }
      const h = 1 - s.age / s.life;
      if (s.k === 0) {                                   // a grain, hopping downwind
        s.vy += 520 * dt; s.x += s.vx * dt; s.y += s.vy * dt;
        if (s.y > s.y0) { s.y = s.y0; s.hop *= 0.65; s.vy = -rand(30, 110) * s.hop; }
        c.globalAlpha = Math.min(1, h * 3);
        c.fillStyle = s.col; c.fillRect(s.x - s.z / 2, s.y - s.z / 2, s.z, s.z);
      } else if (s.k === 1) {                            // a streak of sand, racing past
        s.x += s.vx * dt; s.y += s.vy * dt;
        c.globalAlpha = 1;
        c.strokeStyle = `rgba(236,200,150,${(s.a * Math.min(1, h * 3)).toFixed(3)})`; c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(s.x - s.len, s.y - s.vy * 0.03); c.stroke();
      } else if (s.k === 2) {                            // a puff of dust, spreading and settling
        s.vx *= 1 - dt * 2; s.vy = s.vy * (1 - dt * 2) + 15 * dt; s.r += s.gr * dt;
        s.x += s.vx * dt; s.y += s.vy * dt;
        c.globalAlpha = 1;
        const g = c.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
        g.addColorStop(0, `rgba(190,140,90,${(h * 0.32).toFixed(3)})`); g.addColorStop(1, 'rgba(190,140,90,0)');
        c.fillStyle = g; c.beginPath(); c.arc(s.x, s.y, s.r, 0, 6.283); c.fill();
      } else if (s.k === 3) {                            // a scrap of the sketch, tumbling away
        s.vx += (700 - s.vx) * Math.min(1, dt * 1.5); s.vy += 40 * dt;
        s.x += s.vx * dt; s.y += s.vy * dt; s.rot += s.vr * dt;
        c.save();
        c.globalAlpha = Math.min(1, h * 3);
        c.translate(s.x, s.y); c.rotate(s.rot);
        c.fillStyle = s.col; c.fillRect(-s.w / 2, -s.h / 2, s.w, s.h);
        c.restore();
      } else {                                           // a grain in a dust devil, whirled round and up
        const dx = s.x - s.cx, dy = s.y - s.cy, r = Math.hypot(dx, dy) || 1;
        s.vx += ((dy / r) * 260 - (dx / r) * 40) * dt; s.vy += ((-dx / r) * 260 - (dy / r) * 40 - 60) * dt;
        s.vx *= 1 - dt * 1.4; s.vy *= 1 - dt * 1.4;
        s.x += s.vx * dt; s.y += s.vy * dt;
        c.globalAlpha = Math.min(1, h * 3);
        c.fillStyle = s.col; c.fillRect(s.x - s.z / 2, s.y - s.z / 2, s.z, s.z);
      }
    }
    c.globalAlpha = 1;
  },

  fs: `
const float GS = ${GS.toFixed(4)}, LAG = ${LAG.toFixed(3)}, SLANT = ${SLANT.toFixed(3)}, BIL = ${BIL.toFixed(3)};
const float THICK = ${THICK.toFixed(3)}, CLEAR = ${CLEAR.toFixed(3)};
const vec3 SANDC = vec3(.85, .69, .46);
uniform float uW, uEnd;     // the wall's base line (aspect units) · how far the air has cleared at the end
uniform float uAge[${MAX_SEEDS}];

float lead(float y) { return SLANT * y + BIL * (fbm(vec2(y * 2.5, 7.)) - .5); }
// noise swirling round a point, with no seam where the angle wraps
float swirl(vec2 v, float r, float spin, float rf) {
  float an = atan(v.y, v.x) - uT * spin - r * 18.;
  return fbm(vec2(cos(an), sin(an)) * 2.2 + r * rf);
}

void main() {
  vec2 uv = vUv + uQuake * vec2(sin(uT * 61.), cos(uT * 73.)) * .002;
  vec2 a = vec2(uv.x * uAr, uv.y);
  float gr = h(a / GS);
  // the gale, and its gusts sweeping across the page in waves
  float gale = smoothstep(0., .035, uP) * (1. - smoothstep(.86, 1., uP));
  float gust = .55 + .45 * sin(a.x * 2.4 - uT * 3.1 + sin(uT * .7) * 2.);

  // the scour line: it trails the wall's front, ragged at the grain
  float xf = uW + lead(a.y);
  float dw = xf - LAG - a.x + (fbm(a * 5.) - .5) * .05 + (gr - .5) * .04;
  float d = dw;
  for (int i = 1; i < ${MAX_SEEDS}; i++) {
    if (i >= uN) break;
    vec4 s = uSeeds[i];
    d = max(d, max(uP - s.z, 0.) * uK * .35 + s.w - distance(a, s.xy) + (gr - .5) * .05);
  }

  // the wall's edge boils: billows lump in and out and roll forward, raggeder towards the top
  vec2 q = vec2((a.x - uW) * 3.2, a.y * 3.2);
  vec2 roll = vec2(-uT * .32, uT * .1);
  float n0 = fbm(q * .42 + roll * .5 + 3.);
  float n = fbm(q + roll);
  float n2 = fbm(q * 2.3 + vec2(-uT * .55, -uT * .18) + 11.);
  float loom = .2 * smoothstep(0., .04, uP) * (1. - smoothstep(.1, .35, uP));   // it surges into view as the gale gets up
  float b = xf + loom - a.x + (n0 - .5) * (.26 + .2 * a.y) + (n - .5) * (.16 + .24 * a.y) + (n2 - .5) * (.05 + .07 * a.y);   // depth inside the dust
  float top = smoothstep(.55, 1., a.y);
  float ahead = max(-b, 0.);

  // the paper: it shivers in the gale; sand settles on it ahead of the wall; inside, grains are torn off and smeared
  float sc = max(smoothstep(-LAG, 0., dw), smoothstep(-.03, 0., d));   // wide inside the wall, narrow round a hole
  vec2 gj = vec2(h(a / GS + 17.), h(a / GS + 41.)) - .5;
  float nearw = max(exp(-ahead / .1), sc);
  vec2 shiver = vec2(sin(uT * 37. + a.y * 41.), sin(uT * 29. + a.x * 33.)) * .0012 * gale * gust;
  vec3 dr = texture(uDraft, uv + shiver + vec2(gj.x * .005 * nearw - .025 * sc * gr, gj.y * .005 * nearw) * vec2(1. / uAr, 1.)).rgb;
  vec3 grc = SANDC * mix(.62, 1., h(a / GS + 5.));
  dr = mix(dr, dr * vec3(.97, .86, .7), exp(-ahead / .2) * .5);
  dr = mix(dr, grc, step(1. - max(sc * .7, exp(-ahead / .035) * .14), gr) * .8);
  vec3 col = d < 0. ? dr : texture(uFinal, uv).rgb;

  // the light goes orange-brown and dim at once, darker towards the looming wall; close in, the paper is in its shadow
  col *= mix(vec3(1.), vec3(.88, .66, .45), gale * .7);
  col *= 1. - gale * (.12 + .3 * exp(-ahead / .7));
  col = mix(col, vec3(.6, .43, .28), gale * .16);                     // visibility drops: a brown veil over everything
  col *= 1. - .32 * exp(-ahead / .1) * step(0., -b);

  // the gale across the whole page: drifting bands of haze and streaks of sand, thicker in every gust
  float band = fbm(vec2(a.x * .9 - uT * .8, a.y * 3.2 + sin(a.x * 1.3 + uT * .4) * .4));
  col = mix(col, vec3(.66, .47, .29), gale * smoothstep(.3, .78, band) * (.3 + .38 * gust));
  float st0 = fbm(vec2(a.x * 1.4 - uT * 3.2, a.y * 48.));
  float st1 = fbm(vec2(a.x * 3. - uT * 5.5, a.y * 130.) + 7.);
  col = mix(col, vec3(.94, .78, .55), gale * smoothstep(.54, .78, st0) * (.3 + .5 * gust));
  col = mix(col, vec3(.98, .86, .64), gale * smoothstep(.6, .8, st1) * (.15 + .35 * gust));
  col += vec3(1., .86, .62) * step(.995, h(a * 640. + floor(uT * 24.))) * gale * .35;

  // the wall: sunlit billows on its face, rust-dark at the base and paler up high, dark in its heart, with streaks
  // of sand racing through; behind that the haze thins out onto the finished design
  float nl = fbm(q + roll + vec2(.05, .04));
  float lit = clamp(.55 + (n - nl) * 7., 0., 1.);
  float face = exp(-max(b, 0.) / .07);
  vec3 dust = mix(vec3(.38, .2, .1), vec3(.8, .58, .36), clamp(a.y * .75 + (n - .5) * .7 + .1, 0., 1.));
  dust *= .62 + .55 * lit;
  dust += vec3(.3, .18, .08) * face * lit;
  dust *= 1. - .28 * smoothstep(.02, THICK, b) * (1. - smoothstep(THICK, THICK + .35, b));
  float st = fbm(vec2(a.x * 1.1 - uT * 1.9, a.y * 36.));
  dust = mix(dust, vec3(.95, .78, .54), smoothstep(.56, .8, st) * .4 * smoothstep(0., .06, b));
  dust = mix(dust, vec3(.78, .6, .42), smoothstep(THICK, THICK + .25, b) * .6);
  float edge = smoothstep(-.012 - .06 * top, .035 + .12 * top, b);   // wispy up high
  float dens = edge * (b < THICK ? .97 : .97 * exp(-(b - THICK) / CLEAR)) * (1. - uEnd) * (1. - .2 * top * (1. - smoothstep(0., THICK, b)));
  col = mix(col, dust, dens);
  col += vec3(1., .86, .62) * step(.993, h(a * 640. + floor(uT * 24.))) * dens * .45;   // grains glinting

  // sand eddies round the pointer
  vec2 pv = a - uPtr; float pr = length(pv);
  float eddy = uPtrOn * exp(-pr * pr / .007) * smoothstep(.5, .78, swirl(pv, pr, 3., 30.));
  col = mix(col, grc, eddy * .75 * (1. - dens));
  // a click's dust devil: a whirling ring of sand that rises out of the hole and dies away
  for (int i = 1; i < ${MAX_SEEDS}; i++) {
    if (i >= uN) break;
    float ag = uAge[i];
    vec2 sv = a - uSeeds[i].xy; float sr = length(sv);
    float dv = (1. - smoothstep(1.2, 2.8, ag)) * exp(-pow((sr - .05 - ag * .035) / .035, 2.)) * smoothstep(.42, .72, swirl(sv, sr, 5., 25.));
    col = mix(col, vec3(.74, .55, .34), dv * .85);
  }
  o = vec4(clamp(col, 0., 1.), 1.);
}`,
};

export default storm;
