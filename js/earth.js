/* Earth: the page is split into Voronoi plates. Hairline cracks open along their edges first, then each plate
   shrinks and sinks into the dark, shedding pebbles and dust. Each plate's timing comes from its centre's distance
   to the epicentre, so whole plates go at once. Scroll fast and the ground shakes. Click to start a new quake. */
import { fbm, hh, seedFuel, rand } from './core.js';

const CS = 4.6;      // plates per unit of page height
const FALL = 0.16;   // how much fuel a plate takes to drop out of sight
const PEBBLE = ['#5b4a3a', '#7d6a55', '#a8977e', '#d9cdb5', '#2f2620'];

/* Nearest Voronoi cell: [ix, iy, centreX, centreY] in cell units. Mirrors the first loop of the shader. */
function cell(x, y) {
  const nx = Math.floor(x), ny = Math.floor(y);
  let md = 8, bx = 0, by = 0, cx = 0, cy = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const gx = nx + i, gy = ny + j;
    const ox = 0.15 + 0.7 * hh(gx, gy), oy = 0.15 + 0.7 * hh(gx + 57, gy + 113);
    const rx = gx + ox - x, ry = gy + oy - y, dd = rx * rx + ry * ry;
    if (dd < md) { md = dd; bx = gx; by = gy; cx = gx + ox; cy = gy + oy; }
  }
  return [bx, by, cx, cy];
}

function pebble(ch, x, y, b) {
  ch.spawn({
    k: 0, x, y, vx: rand(-30, 30) * b, vy: rand(-60, 10) * b, age: 0, life: rand(0.7, 1.5),
    size: rand(1.2, 3.4), rot: rand(0, 6.28), vr: rand(-8, 8), col: PEBBLE[(Math.random() * PEBBLE.length) | 0],
  });
}
function dust(ch, x, y) {
  ch.spawn({ k: 1, x, y, vx: rand(-15, 15), vy: rand(-25, -5), age: 0, life: rand(0.8, 1.6), r: rand(4, 9), gr: rand(10, 24) });
}

const earth = {
  id: 'earth',
  num: '03',
  label: 'Earth',
  hud: 'Draft broken',
  hint: 'Scroll to break the draft',
  clickHint: 'the paper to start a quake',
  clip: (k) => `inset(0 0 ${k}% 0)`,
  theme: {
    accent: '#e9a85a', accent2: '#f8dcae', onAccent: '#2a1704', seed: 12,
    glowA: 'rgba(233,168,90,.10)', glowB: 'rgba(140,100,60,.10)',
    kicker: 'Experiment · Break the draft',
    draft: ['Break new', 'ground?'], final: ['Break new', 'ground.'],
    aside: 'go deeper.',
    sub: 'Crack the first version open. The foundation was under it all along.',
    note: ['v0.6', 'too rigid.', 'break it.'],
    chips: [['Drafts broken', '31'], ['Shipped', '12']],
  },
  home: () => ({ u: 0.5, v: 0.45, p0: 0, born: 0, off: -0.45 }),   // the epicentre, held back so 0% is whole
  reach: (AR) => Math.hypot(AR * 0.5, 0.55) + 0.45 + 0.15 + 0.09 + FALL + 0.05,

  fuel(ch, u, v, now) {
    const [bx, by, cx, cy] = cell(u * ch.AR * CS, v * CS);
    const px = cx / CS, py = cy / CS;
    return seedFuel(ch, px, py, fbm(px * 3, py * 3), 0.3, 1, 0, now) - (hh(bx + 11, by + 5) - 0.5) * 0.18;
  },

  emit(ch, x, y, d, act) {
    if (d > 0 && d < 0.05 && Math.random() < act * 0.55) {
      if (Math.random() < 0.72) pebble(ch, x, y, 1); else dust(ch, x, y);
    }
  },

  onClick(ch, seed, q, now) { ch.s.kick = now; },
  burst(ch, x, y) { for (let i = 0; i < 22; i++) pebble(ch, x, y, 1.7); for (let i = 0; i < 6; i++) dust(ch, x, y); },
  onFrame(ch, now) {
    if (ch.s.kick) ch.quake = Math.max(ch.quake, Math.exp(-(now - ch.s.kick) / 280));
  },

  step(ch, c, dt) {
    const P = ch.parts;
    for (let i = P.length - 1; i >= 0; i--) {
      const s = P[i];
      s.age += dt;
      if (s.age >= s.life) { P.splice(i, 1); continue; }
      const h = 1 - s.age / s.life;
      if (s.k === 0) {                                   // pebbles tumble and fall
        s.vy += 620 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.rot += s.vr * dt;
        const z = s.size;
        c.save(); c.globalAlpha = Math.min(1, h * 3);
        c.translate(s.x, s.y); c.rotate(s.rot); c.fillStyle = s.col;
        c.beginPath(); c.moveTo(-z, -z * 0.6); c.lineTo(z, -z * 0.8); c.lineTo(z * 0.7, z * 0.7); c.lineTo(-z * 0.8, z * 0.5); c.closePath(); c.fill();
        c.restore();
      } else {                                           // dust billows and thins out
        s.x += s.vx * dt; s.y += s.vy * dt; s.r += s.gr * dt;
        const g = c.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
        g.addColorStop(0, `rgba(180,160,130,${(h * 0.14).toFixed(3)})`); g.addColorStop(1, 'rgba(180,160,130,0)');
        c.fillStyle = g;
        c.beginPath(); c.arc(s.x, s.y, s.r, 0, 6.283); c.fill();
      }
    }
  },

  fs: `
const float CS = ${CS.toFixed(2)};
vec2 jit(vec2 i) { return vec2(h(i), h(i + vec2(57., 113.))); }

void main() {
  vec2 uv = vUv + uQuake * vec2(sin(uT * 83.), cos(uT * 97.)) * .0035;   // the ground shakes
  vec2 a = vec2(uv.x * uAr, uv.y);

  // Voronoi: the nearest plate, then the distance to its edge
  vec2 x = a * CS, ip = floor(x), f = x - ip, mr = vec2(0.), mg = vec2(0.);
  float md = 8.;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j)), r = g + .15 + .7 * jit(ip + g) - f;
    float dd = dot(r, r);
    if (dd < md) { md = dd; mr = r; mg = g; }
  }
  float ed = 8.;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    vec2 g = mg + vec2(float(i), float(j)), r = g + .15 + .7 * jit(ip + g) - f, dv = r - mr;
    if (dot(dv, dv) > 1e-6) ed = min(ed, dot(.5 * (mr + r), normalize(dv)));
  }
  vec2 cid = ip + mg;
  vec2 c = (x + mr) / CS;                       // this plate's centre, aspect units
  float f1 = sqrt(md), t = f1 / (f1 + ed);      // 0 at the centre, 1 at the edge
  float e = ed / CS;                            // distance to the edge, aspect units
  float d = seedFuel(c, fbm(c * 3.), .3, 1., 0) - (h(cid + vec2(11., 5.)) - .5) * .18;

  // still in place: cracks open along the edges, and the paper bruises around them
  float torch = uPtrOn * smoothstep(.15, 0., distance(a, uPtr));
  float crack = max(smoothstep(-.22, -.02, d), torch * .6);
  float ej = e + (vn(a * 70.) - .5) * .005 * crack;
  float cw = crack * (.0015 + .0035 * crack);
  float fall = clamp(d / ${FALL.toFixed(2)}, 0., 1.);
  fall *= fall;                                 // it accelerates as it drops
  float s = 1. - fall;
  vec2 src = c + (a - c) / max(s, .02) + vec2(0., fall * .06);

  // the plate shrinks about its centre: this pixel is still on it if its source point is in the same cell
  bool on = d < ${FALL.toFixed(2)};
  if (fall > 0. && on) {
    vec2 y = src * CS, iq = floor(y), gq = vec2(0.);
    float mq = 8.;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j)), r = g + .15 + .7 * jit(iq + g) - (y - iq);
      float dd = dot(r, r);
      if (dd < mq) { mq = dd; gq = g; }
    }
    on = iq + gq == cid;
  }

  vec3 plate = texture(uDraft, vec2(src.x / uAr, src.y)).rgb;
  plate *= 1. - .18 * crack * exp(-ej * 90.);
  float fis = (1. - smoothstep(cw, cw + .0018, ej)) * smoothstep(0., .15, crack) * step(d, 0.);
  plate = mix(plate, vec3(.13, .1, .08), fis);
  plate *= 1. - .6 * fall;                      // and darkens as it sinks away

  // underneath: the final, dusty where a plate just left, shadowed by the one still falling
  vec3 fin = texture(uFinal, uv).rgb;
  float fresh = exp(-max(d, 0.) * 9.) * step(0., d);
  fin = mix(fin, fin * .4 + vec3(.09, .07, .05), fresh * .8);
  fin *= 1. - .55 * smoothstep(s + .12, s, t) * step(0., d) * (1. - fall);

  o = vec4(on ? plate : fin, 1.);
}`,
};

export default earth;
