/* Frost: the page freezes over, then the ice shatters and falls away.
   Freeze: the light goes cold and breath-fog gathers at the edges. Frost crystals creep in from the edges: each
   grows from a seed point as a ragged six-armed dendrite, arms feathered with side branches, like frost on a
   window. Behind them a white-blue glaze of rime covers the paper, the sketch blurred faintly through it, glinting.
   Break: once the page is frozen, the ice cracks from a point near the middle, radial cracks first and then the
   rings between them, so the sheet becomes wedge-shaped shards like broken glass, glinting along their edges.
   Shard by shard, outward, they drop away (the falling shards are drawn on the particle canvas), leaving the
   finished design with rime still on the edges and a few drops of melt running down.
   Move over the paper and frost forms under your hand. Click to freeze a patch, which then shatters. */
import { fbm, vn, hh, seedFuel, clamp, rand, lite, fine, DONE } from '../core.js';
import { tunedFrost, makeFrost, playCrack, playShards } from './sfx-frost.js';

const EY = 0.56;               // where the ice cracks from (page fractions, y up; x is the middle)
const NA = 22, RS = 9;         // the shatter: radial sectors, and rings per unit of page height
const PF = 0.4;                // progress by which the page is frozen over
const PB = 0.44;               // progress at which the ice starts to break
const CF = 7;                  // frost crystal seeds per unit of page height
const TAU = Math.PI * 2;

const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const maxR = (AR) => Math.hypot(0.5 * AR, Math.max(EY, 1 - EY));
const KB = (AR) => (maxR(AR) + 0.14) / (DONE - PB - 0.01);                 // the break reaches the far corner by DONE
const KF = (AR) => (Math.min(AR, 1) / 2 + 0.12 + 0.11) / PF;              // the frost reaches the middle by PF

/* The shard under a point (aspect units): sector i, ring j, and the radius its break is timed from. Mirrors
   shard() in the shader. */
function shard(ax, ay, AR) {
  const vx = ax - 0.5 * AR, vy = ay - EY, r = Math.hypot(vx, vy);
  const ang = Math.atan2(vy, vx) + (vn(r * 5, 2.7) - 0.5) * 0.25;
  const sp = ((ang + Math.PI) / TAU) * NA;
  const i = ((Math.floor(sp) % NA) + NA) % NA;
  const off = (hh(i, 3) - 0.5) * 0.7, j = Math.floor(r * RS + off);
  return { i, j, rc: Math.max(0, (j + 0.5 - off) / RS) };
}
const brkOf = (p, AR, i, j, rc) => (p - PB) * KB(AR) - rc + (hh(i + 31, j + 77) - 0.5) * 0.12;

function fuel(ch, u, v, now) {
  const ax = u * ch.AR, ay = v, S = shard(ax, ay, ch.AR);
  const d = brkOf(ch.p, ch.AR, S.i, S.j, S.rc);
  return Math.max(d, seedFuel(ch, ax, ay, fbm(ax * 3, ay * 3), 0.25, 0.6, 1, now));
}

/* ---------- particles ---------- */
function sparkle(ch, x, y, vy = rand(10, 40)) { ch.spawn({ k: 0, x, y, vx: rand(-12, 12), vy, age: 0, life: rand(0.6, 1.4), r: rand(1, 2.4), ph: rand(0, 6.28) }); }
function drop(ch, x, y) { ch.spawn({ k: 3, x, y, vx: 0, vy: rand(18, 40), age: 0, life: rand(1.4, 2.6), r: rand(1.4, 2.4) }); }

/* A shard of the sheet as a polygon in stage pixels, from its sector and ring. */
function shardPoly(ch, i, j) {
  const AR = ch.AR, off = (hh(i, 3) - 0.5) * 0.7;
  const r0 = Math.max(0, (j - off) / RS), r1 = (j + 1 - off) / RS;
  const a0 = (i / NA) * TAU - Math.PI, a1 = ((i + 1) / NA) * TAU - Math.PI;
  const pt = (a, r) => [(0.5 * AR + Math.cos(a) * r) * ch.H, (1 - (EY + Math.sin(a) * r)) * ch.H];
  const steps = Math.max(1, Math.round(r1 * 6));
  const pts = [];
  for (let k = 0; k <= steps; k++) pts.push(pt(a0 + ((a1 - a0) * k) / steps, r1));
  for (let k = steps; k >= 0; k--) pts.push(pt(a0 + ((a1 - a0) * k) / steps, r0));
  const mx = pts.reduce((m, p) => m + p[0], 0) / pts.length, my = pts.reduce((m, p) => m + p[1], 0) / pts.length;
  return pts.map(([x, y]) => [mx + (x - mx) * 0.9, my + (y - my) * 0.9]);   // a hair smaller, so they read as separate pieces
}
function shardFall(ch, i, j, now) {
  const pts = shardPoly(ch, i, j);
  let cx = 0, cy = 0;
  for (const [x, y] of pts) { cx += x; cy += y; }
  cx /= pts.length; cy /= pts.length;
  if (cx < -40 || cx > ch.W + 40 || cy < -40 || cy > ch.H + 40) return false;
  const ox = cx - 0.5 * ch.AR * ch.H, oy = cy - (1 - EY) * ch.H, l = Math.hypot(ox, oy) || 1;
  ch.spawn({
    k: 1, x: cx, y: cy, pts: pts.map(([x, y]) => [x - cx, y - cy]),
    vx: (ox / l) * rand(10, 50), vy: rand(-30, 10), rot: 0, vr: rand(-1.6, 1.6), age: 0, life: rand(0.8, 1.2), tone: hh(i + 7, j + 3),
  });
  if (Math.random() < 0.5) sparkle(ch, cx, cy, rand(-20, 20));
  return true;
}

/* ---------- sound ---------- */
const live = (ch) => ch.sound?.ctx && (ch.mode ? ch.mode === 'gl' : !!ch.gl);
function steer(ch, freeze, act, on) {
  if (!live(ch)) return;
  ch.bed ||= makeFrost(ch.sound);
  ch.bed.set(tunedFrost(), freeze, act, on);
}

const frost = {
  id: 'frost',
  num: '06',
  label: 'Frost',
  hud: 'Draft shattered',
  hint: 'Scroll to freeze the draft',
  clickHint: 'the paper to freeze a patch',
  // no WebGL2: a jagged hole opens from where the ice cracks (evenodd cuts it out of the page)
  clip: (k) => {
    const r = Number(k) * 0.78, pts = ['0% 0%', '100% 0%', '100% 100%', '0% 100%', '0% 0%'];
    for (let n = 0; n <= 32; n++) {
      const a = (n / 32) * TAU, rr = r * (n % 2 ? 0.86 : 1.04);
      pts.push(`${(50 + rr * Math.cos(a)).toFixed(2)}% ${(100 * (1 - EY) + rr * Math.sin(a)).toFixed(2)}%`);
    }
    return `polygon(evenodd, ${pts.join(', ')})`;
  },
  wantsColor: true,
  uniforms: ['uKB', 'uKF'],
  theme: {
    accent: '#9fd8ff', accent2: '#e6f6ff', onAccent: '#04141f', seed: 17,
    glowA: 'rgba(159,216,255,.12)', glowB: 'rgba(170,210,255,.07)',
    kicker: 'Experiment · Freeze the draft',
    draft: ['Break the', 'ice?'], final: ['Break the', 'ice.'],
    aside: 'cool it.',
    sub: 'Freeze the first version, then shatter it. What was underneath was ready all along.',
    note: ['v0.7', 'too stiff.', 'shatter it.'],
    chips: [['Drafts shattered', '23'], ['Shipped', '12']],
  },
  home: () => ({ u: 0.5, v: EY, p0: 0, born: 0, off: -10 }),   // only for clicks' growth rate; the ice has its own timing
  reach: (AR) => maxR(AR) + 0.1,
  fuel,

  // ice dust glitters off the edges as shards go; once the ice is gone, a few drops of melt run down
  emit(ch, x, y, d, act) {
    if (d > 0 && d < 0.025 && Math.random() < act * 0.3) sparkle(ch, x, y);
    else if (d > 0.02 && d < 0.07 && Math.random() < 0.012) drop(ch, x, y);
    else if (d < 0 && ch.p > 0.12 && ch.p < PB && Math.random() < 0.006) sparkle(ch, x, y, rand(-4, 4));
  },

  onClick(ch, seed) { seed.off = -0.07; },   // it frosts over first, then shatters (see onFrame)
  burst(ch, x, y) { for (let i = 0; i < 14; i++) { const a = rand(0, TAU), r = rand(4, 40); sparkle(ch, x + Math.cos(a) * r, y + Math.sin(a) * r, rand(-8, 8)); } },
  reset(ch) { ch.bed?.silence(); const S = ch.s; S.fallen = new Set(); S.armed = false; S.cracked = 0; },
  quiet(ch) { ch.bed?.silence(); },

  onFrame(ch, now) {
    const S = ch.s, AR = ch.AR;
    S.fallen ||= new Set();
    // the sheet: which shards have broken off since last frame
    const jmax = Math.ceil(maxR(AR) * RS) + 1;
    let fell = 0;
    for (let i = 0; i < NA; i++) {
      const off = (hh(i, 3) - 0.5) * 0.7;
      for (let j = -1; j <= jmax; j++) {
        const rc = Math.max(0, (j + 0.5 - off) / RS), b = brkOf(ch.p, AR, i, j, rc), key = i * 1000 + j + 10;
        if (b >= 0 && !S.fallen.has(key)) {
          S.fallen.add(key);
          // shards already gone when the page opens don't all fall at once
          if (S.armed && ch.mode === 'gl' && fell < (lite ? 10 : 24) && shardFall(ch, i, j, now)) fell++;
        } else if (b < -0.01 && S.fallen.has(key)) S.fallen.delete(key);
      }
    }
    if (fell && !S.cracked) S.cracked = now;
    if (ch.p < PB - 0.02) S.cracked = 0;
    // a click's patch: frost first, then it shatters
    for (const sd of ch.seeds) if (sd.born && !sd.cracked && now - sd.born > 620) {
      sd.cracked = true;
      if (live(ch)) playCrack(ch.sound, tunedFrost(), 0.45);
      const x = sd.u * ch.W, y = (1 - sd.v) * ch.H;
      for (let k = 0; k < 9; k++) {
        const a = rand(0, TAU), r = rand(6, 26), w = rand(5, 12);
        ch.spawn({ k: 1, x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, pts: [[-w, -w * 0.4], [w * 0.7, -w * 0.6], [w * 0.4, w * 0.7], [-w * 0.6, w * 0.3]], vx: Math.cos(a) * rand(30, 90), vy: rand(-60, 0), rot: rand(0, 6), vr: rand(-4, 4), age: 0, life: rand(0.8, 1.3), tone: Math.random() });
      }
    }
    S.armed = true;
    // sound: the bed while it's cold, the crack when the sheet goes, tinkles for every shard
    const freeze = ss(0.02, 0.12, ch.p) * (1 - ss(PB, PB + 0.06, ch.p)) + ch.seeds.filter((s) => s.born && now - s.born < 700).length * 0.5;
    const cold = ch.p > 0.004 && ch.p < DONE + 0.03;
    steer(ch, Math.min(1, freeze), Math.min(1, ch.speed * 6), cold || freeze > 0 ? 1 : 0);
    if (live(ch)) {
      if (S.cracked === now) playCrack(ch.sound, tunedFrost(), 1);
      else if (fell) playShards(ch.sound, tunedFrost(), fell);
    }
    ch.quake = Math.max(ch.quake * 0.5, S.cracked ? Math.exp(-(now - S.cracked) / 220) * 0.7 : 0);
    // frost under the pointer glitters
    if (fine && ch.ptr.on > 0.5 && Math.random() < 0.25 && fuel(ch, ch.ptr.u, ch.ptr.v, now) < 0) {
      const a = rand(0, TAU), r = rand(2, 22);
      sparkle(ch, ch.ptr.u * ch.W + Math.cos(a) * r, (1 - ch.ptr.v) * ch.H + Math.sin(a) * r, rand(-6, 6));
    }
  },

  setUniforms(ch, gl, loc) {
    gl.uniform1f(loc.uKB, KB(ch.AR));
    gl.uniform1f(loc.uKF, KF(ch.AR));
  },

  step(ch, c, dt) {
    const P = ch.parts;
    for (let i = P.length - 1; i >= 0; i--) {
      const s = P[i];
      s.age += dt;
      if (s.age >= s.life) { P.splice(i, 1); continue; }
      const h = 1 - s.age / s.life;
      if (s.k === 0) {                                   // a glint of ice dust, twinkling as it drifts
        s.x += s.vx * dt; s.y += s.vy * dt;
        const tw = 0.55 + 0.45 * Math.sin(s.age * 18 + s.ph), a = Math.min(1, h * 2) * tw, r = s.r;
        c.fillStyle = `rgba(235,248,255,${a.toFixed(3)})`;
        c.beginPath(); c.moveTo(s.x, s.y - r * 1.8); c.lineTo(s.x + r * 0.5, s.y); c.lineTo(s.x, s.y + r * 1.8); c.lineTo(s.x - r * 0.5, s.y); c.closePath(); c.fill();
        c.fillRect(s.x - r * 1.6, s.y - 0.4, r * 3.2, 0.8);
      } else if (s.k === 1) {                            // a shard of ice, dropping and turning
        s.vy += 980 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.rot += s.vr * dt;
        c.save();
        c.globalAlpha = Math.min(1, h * 2.5);
        c.translate(s.x, s.y); c.rotate(s.rot);
        c.beginPath();
        s.pts.forEach(([x, y], k) => (k ? c.lineTo(x, y) : c.moveTo(x, y)));
        c.closePath();
        const g = c.createLinearGradient(-30, -30, 30, 30);
        g.addColorStop(0, `rgba(${228 + Math.round(s.tone * 22)},246,255,.62)`);
        g.addColorStop(1, 'rgba(160,200,235,.42)');
        c.fillStyle = g; c.fill();
        c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 1; c.stroke();
        c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 0.8;   // a glint across the face
        c.beginPath(); c.moveTo(s.pts[0][0] * 0.5, s.pts[0][1] * 0.5); c.lineTo(s.pts[Math.floor(s.pts.length / 2)][0] * 0.4, s.pts[Math.floor(s.pts.length / 2)][1] * 0.4); c.stroke();
        c.restore();
      } else {                                           // a drop of melt sliding down
        s.y += s.vy * dt; s.vy *= 1 - dt * 0.3;
        const a = Math.min(1, h * 2) * 0.7;
        c.strokeStyle = `rgba(200,230,255,${(a * 0.4).toFixed(3)})`; c.lineWidth = s.r * 0.9;
        c.beginPath(); c.moveTo(s.x, s.y - 14); c.lineTo(s.x, s.y); c.stroke();
        c.fillStyle = `rgba(225,242,255,${a.toFixed(3)})`;
        c.beginPath(); c.arc(s.x, s.y, s.r, 0, 6.283); c.fill();
      }
    }
  },

  fs: `
const float EY = ${EY.toFixed(3)}, NA = ${NA.toFixed(1)}, RS = ${RS.toFixed(1)}, PB = ${PB.toFixed(3)}, CF = ${CF.toFixed(1)};
const vec3 ICE = vec3(.86, .93, 1.);
uniform float uKB, uKF;

float edgeD(vec2 a) { return min(min(a.x, uAr - a.x), min(a.y, 1. - a.y)); }
// how far the frost has got at a point: in from the edges, ragged
float frz(vec2 a) { return uP * uKF - edgeD(a) + (fbm(a * 4.) - .5) * .12 + (vn(a * 11.) - .5) * .05; }

// one frost crystal: six ragged arms (each a different length), feathered with side branches at 60 degrees
float dendrite(vec2 v, float R, float rot, vec2 g, vec2 dirIn) {
  float r = length(v);
  if (r > R || r < 1e-5) return 0.;
  const float SEC = 1.0471976;
  float ang = atan(v.y, v.x) + rot;
  float k = floor((ang + SEC * .5) / SEC);
  float t = ang - k * SEC - (h(g + vec2(k + 40., 1.)) - .5) * .35;   // the arms aren't evenly spaced
  float armA = k * SEC - rot;
  float inward = dot(vec2(cos(armA), sin(armA)), dirIn);
  // arms reaching in from the edge grow long and feathery; the rest stay stubby, so it reads as fronds
  float armR = R * (.15 + .85 * h(g + vec2(k + 20., 7.))) * (.18 + .82 * smoothstep(-.4, .75, inward));
  vec2 q = r * vec2(cos(t), sin(t));
  if (q.x > armR) return 0.;
  float ay = abs(q.y);
  float stem = exp(-ay / .0016);
  float u2 = q.x - ay * .57735;                     // which side branch this point would be on
  float sk = floor(u2 / .011 + .5) * .011;
  float br = (sk > .004 && ay < (armR - sk) * .45) ? exp(-abs(u2 - sk) * .866 / .0012) : 0.;
  br *= .55 + .45 * vn(q * 140. + g);                // feathery: some branches fainter than others
  return max(stem, br * .85) * (1. - smoothstep(armR * .55, armR, q.x) * .55);
}
float crystals(vec2 a) {
  vec2 ip = floor(a * CF);
  float best = 0.;
  vec2 mid = vec2(.5 * uAr, .5);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = ip + vec2(float(i), float(j));
    vec2 c = (g + .2 + .6 * vec2(h(g), h(g + vec2(57., 113.)))) / CF;
    float f = frz(c);
    if (f <= 0.) continue;
    float R = min(f * 2., .16) * (.55 + .45 * h(g + vec2(5., 9.)));
    float dd = dendrite(a - c, R, h(g + vec2(13., 2.)) * 1.0472, g, normalize(mid - c + 1e-4));
    best = 1. - (1. - best) * (1. - dd * .8);          // overlapping fronds build up softly
  }
  return best;
}

void main() {
  vec2 uv = vUv + uQuake * vec2(sin(uT * 89.), cos(uT * 101.)) * .003;
  vec2 a = vec2(uv.x * uAr, uv.y);

  // the shatter: wedge shards round the point where the ice cracks; radial cracks wander a little
  vec2 v = a - vec2(.5 * uAr, EY);
  float r = length(v);
  float ang = atan(v.y, v.x) + (vn(vec2(r * 5., 2.7)) - .5) * .25;
  float sp = (ang + 3.14159265) / 6.2831853 * NA;
  float si = mod(floor(sp), NA);
  float off = (h(vec2(si, 3.)) - .5) * .7, rr = r * RS + off, sj = floor(rr);
  float rc = max(0., (sj + .5 - off) / RS);
  float brk = (uP - PB) * uKB - rc + (h(vec2(si + 31., sj + 77.)) - .5) * .12;
  float sd = seedFuel(a, fbm(a * 3.), .25, .6, 1);
  float d = max(brk, sd);

  float cold = smoothstep(0., .22, uP) * (1. - .65 * smoothstep(PB + .1, ${DONE.toFixed(2)}, uP));

  // the frozen paper
  float f = frz(a);
  float glaze = smoothstep(0., .14, f);
  glaze = max(glaze, smoothstep(-.13, -.07, sd));                              // a click's patch frosts over first
  glaze = max(glaze, uPtrOn * .8 * smoothstep(.09, 0., distance(a, uPtr)));   // and so does the paper under your hand
  vec2 refr = (vec2(vn(a * 18.), vn(a * 18. + 9.)) - .5) * .006 * glaze;
  vec3 col = texture(uDraft, uv + vec2(refr.x / uAr, refr.y)).rgb;
  col *= mix(vec3(1.), vec3(.88, .94, 1.05), cold);                           // the light goes cold
  col *= mix(vec3(1.), vec3(.93, .96, 1.), smoothstep(-.1, 0., f) * (1. - glaze));   // damp just ahead of the frost
  col = mix(col, ICE * (.9 + .12 * vn(a * 60.)) + .04 * (vn(a * 140.) - .5), glaze * .62);
  float cr = crystals(a) * smoothstep(-.02, .03, f);
  col = mix(col, vec3(.97, .99, 1.), cr * .7);
  vec2 cell = floor(a * 520.);
  float tw = step(.992, h(cell)) * (.5 + .5 * sin(uT * 6. + h(cell + 3.) * 40.));
  col += tw * glaze * .6;                                                     // glints in the rime
  float haze = exp(-edgeD(a) / .07) * .38 * cold * (.6 + .4 * vn(a * 3. + vec2(uT * .08, 0.)));
  col = mix(col, vec3(.9, .95, 1.), haze);                                    // breath-fog at the edges

  // the cracks: radial ones race out first, then the rings between them; they glint
  float fa = fract(sp), fr = fract(rr);
  float dA = min(fa, 1. - fa) * (6.2831853 / NA) * r, dR = min(fr, 1. - fr) / RS;
  float visA = smoothstep(-.32, -.06, brk), visR = smoothstep(-.16, -.01, brk);
  float wA = .0009 + .0022 * visA, wR = .0009 + .002 * visR;
  float crack = max((1. - smoothstep(wA, wA + .0012, dA)) * visA, (1. - smoothstep(wR, wR + .0012, dR)) * visR);
  crack = max(crack, exp(-abs(sd + .006) / .0018) * smoothstep(-.03, -.006, sd) * .8);   // round a click's patch
  float glint = pow(.5 + .5 * sin(uT * 2.2 + r * 26. - ang * 2.), 12.);
  col = mix(col, vec3(.3, .38, .48), crack * .75);
  col += vec3(.9, .97, 1.) * crack * glint * .9;
  col *= 1. + .1 * smoothstep(-.06, 0., brk);                                // a shard about to go lifts and catches the light

  // where the ice has gone: the finished design, rime still on the edges, wet just behind them
  if (d > 0.) {
    vec3 fin = texture(uFinal, uv).rgb;
    fin *= mix(vec3(1.), vec3(.92, .96, 1.04), cold * .5);
    fin = mix(fin, ICE, exp(-d / .012) * .55);
    fin += vec3(.7, .85, 1.) * exp(-d / .03) * .05;
    col = fin;
  }
  o = vec4(clamp(col, 0., 1.), 1.);
}`,
};

export default frost;
