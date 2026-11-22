/* Earth: the page turns to stone and falls apart under gravity.
   The stones are domain-warped Voronoi cells, so the fault lines are irregular. Ahead of the quake the paper
   petrifies: each stone is shaded as a rounded, pitted, grainy rock lit from the top left, with the sketch cut
   into its face. Cracks race outward along the stones' edges, with hairline cracks branching off. A chunk's timing comes from its centre's distance to the
   epicentre. It rattles loose, then breaks off and falls: accelerating down the page, turning and dropping away,
   leaving a shadowed hole. To draw a falling chunk, each pixel scans upward for a chunk whose fall has carried
   it here, and checks the inverse-transformed point really lies inside that chunk.
   Scroll fast and the ground shakes. Click to start a new quake. */
import { fbm, vn, hh, seedFuel, rand, lite, DONE } from './core.js';

const CS = 5.2;       // stones per unit of page height
const FALLK = 0.2;    // fuel a chunk takes to fall out of sight
const MAXD = 0.38;    // how far it has dropped by then
const NSCAN = lite ? 6 : 8;
const STEP = 0.42 / (NSCAN - 1);
const OFF = -0.45;    // the epicentre is held back so 0% is whole
const PEBBLE = ['#5f584f', '#7a7166', '#948a7c', '#b3a998', '#3c3631'];

/* The chunk under a point: [idx, idy, centreX, centreY]. Mirrors warp() + chunk() in the shader. */
function chunk(ax, ay) {
  const wx = ax + (vn(ax * 3.3, ay * 3.3) - 0.5) * 0.11, wy = ay + (vn(ax * 3.3 + 17, ay * 3.3 + 4) - 0.5) * 0.11;
  const x = wx * CS, y = wy * CS, nx = Math.floor(x), ny = Math.floor(y);
  let md = 8, bx = 0, by = 0, cx = 0, cy = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const gx = nx + i, gy = ny + j;
    const ox = 0.15 + 0.7 * hh(gx, gy), oy = 0.15 + 0.7 * hh(gx + 57, gy + 113);
    const rx = gx + ox - x, ry = gy + oy - y, dd = rx * rx + ry * ry;
    if (dd < md) { md = dd; bx = gx; by = gy; cx = gx + ox; cy = gy + oy; }
  }
  return [bx, by, cx / CS, cy / CS];
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
  num: '04',
  label: 'Earth',
  hud: 'Draft broken',
  hint: 'Scroll to break the draft',
  clickHint: 'the paper to start a quake',
  clip: (k) => `inset(0 0 ${k}% 0)`,
  uniforms: ['uScan'],
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
  home: () => ({ u: 0.5, v: 0.45, p0: 0, born: 0, off: OFF }),
  reach: (AR) => Math.hypot(AR * 0.5, 0.55) + -OFF + 0.15 + 0.09 + 0.06 + FALLK + 0.04,

  fuel(ch, u, v, now) {
    const [bx, by, cx, cy] = chunk(u * ch.AR, v);
    return seedFuel(ch, cx, cy, fbm(cx * 3, cy * 3), 0.3, 1, 0, now) - (hh(bx + 11, by + 5) - 0.5) * 0.18;
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
  setUniforms(ch, gl, loc) {
    // only pay for the falling-chunk scan while something can be falling
    const clicks = ch.seeds.some((s) => s.born);
    gl.uniform1f(loc.uScan, clicks || (ch.p * ch.K + OFF + 0.35 > 0 && ch.p < DONE + 0.04) ? 1 : 0);
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
const float FALLK = ${FALLK.toFixed(2)};
const float MAXD = ${MAXD.toFixed(2)};
const int NSCAN = ${NSCAN};
const float STEP = ${STEP.toFixed(4)};
uniform float uScan;

vec2 jit(vec2 i) { return vec2(h(i), h(i + vec2(57., 113.))); }
vec2 warp(vec2 a) { return a + (vec2(vn(a * 3.3), vn(a * 3.3 + vec2(17., 4.))) - .5) * .11; }

// the stone under a point: xy = cell id, zw = its centre (aspect units)
vec4 chunk(vec2 a) {
  vec2 x = warp(a) * CS, ip = floor(x), f = x - ip, id = ip, cc = ip;
  float md = 8.;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j)), o = .15 + .7 * jit(ip + g), r = g + o - f;
    float dd = dot(r, r);
    if (dd < md) { md = dd; id = ip + g; cc = ip + g + o; }
  }
  return vec4(id, cc / CS);
}
// the same, plus the distance to its edge and that edge's outward normal
float cellEdge(vec2 a, out vec4 C, out vec2 nb) {
  vec2 x = warp(a) * CS, ip = floor(x), f = x - ip, mr = vec2(0.), mg = vec2(0.);
  float md = 8.;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j)), r = g + .15 + .7 * jit(ip + g) - f;
    float dd = dot(r, r);
    if (dd < md) { md = dd; mr = r; mg = g; }
  }
  float ed = 8.;
  nb = vec2(0., 1.);
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    vec2 g = mg + vec2(float(i), float(j)), r = g + .15 + .7 * jit(ip + g) - f, dv = r - mr;
    if (dot(dv, dv) > 1e-6) {
      float e = dot(.5 * (mr + r), normalize(dv));
      if (e < ed) { ed = e; nb = normalize(dv); }
    }
  }
  C = vec4(ip + mg, (x + mr) / CS);
  return ed / CS;
}
float fuelAt(vec4 C) { return seedFuel(C.zw, fbm(C.zw * 3.), .3, 1., 0) - (h(C.xy + vec2(11., 5.)) - .5) * .18; }

// a falling stone drops (accelerating), drifts, turns and recedes; this undoes that for one pixel
vec2 fallSrc(vec2 a, vec4 C, float fall, out float rot) {
  rot = (h(C.xy + vec2(3., 7.)) - .5) * 1.2 * fall;
  vec2 off = vec2((h(C.xy + vec2(9., 1.)) - .5) * .06 * fall, -MAXD * fall * fall);
  vec2 q = (a - C.zw - off) / (1. - .2 * fall);
  float cs = cos(rot), sn = sin(rot);
  return C.zw + vec2(cs * q.x + sn * q.y, -sn * q.x + cs * q.y);
}

float bump(vec2 p) { return vn(p * 26.) * .65 + vn(p * 61.) * .35; }

// a stone: rounded at its edges, pitted and grainy, lit from the top left, the sketch cut into its face
vec3 stone(vec2 p, vec2 suv, vec4 C, float e, vec2 nb) {
  float k = clamp(e / .04, 0., 1.);
  float slope = (1. - k * k) * 1.8;                      // the face rolls off steeply into the crack
  float b0 = bump(p);
  vec2 g = vec2(bump(p + vec2(.002, 0.)) - b0, bump(p + vec2(0., .002)) - b0) * 7.;
  vec3 N = normalize(vec3(nb * slope - g, 1.));
  vec3 L = normalize(vec3(-.5, .65, .6));
  float diff = max(dot(N, L), 0.);
  float spec = pow(max(dot(reflect(-L, N), vec3(0., 0., 1.)), 0.), 16.) * .1;
  float tone = h(C.xy + vec2(5., 9.));
  vec3 alb = mix(vec3(.45, .41, .36), vec3(.63, .58, .5), tone);
  alb = mix(alb, alb * vec3(.92, .96, 1.02), h(C.xy + vec2(2., 4.)));   // some cooler, some warmer
  alb *= .8 + .32 * (vn(p * 9. + C.xy * 3.7) * .6 + vn(p * 21.) * .4);   // mottling
  alb *= 1. - .16 * smoothstep(.8, .92, vn(p * 120. + C.xy));            // dark grains
  alb += .07 * step(.9, vn(p * 170. + vec2(3.)));                       // bright grains
  vec3 dr = texture(uDraft, suv).rgb;
  float lum = dot(dr, vec3(.3, .59, .11));
  alb *= mix(vec3(1.), dr / max(lum, .2), .3);                          // the sketch's colours stain it
  alb *= 1. - .6 * smoothstep(.72, .3, lum);                            // and its lines are cut into it
  float ao = .5 + .5 * smoothstep(0., .03, e);                          // darker down by the cracks
  return alb * (.34 + .9 * diff) * ao + spec;
}

void main() {
  vec2 uv = vUv + uQuake * vec2(sin(uT * 83.), cos(uT * 97.)) * .0035;   // the ground shakes
  vec2 a = vec2(uv.x * uAr, uv.y);

  vec4 own; vec2 nb;
  float e = cellEdge(a, own, nb);
  float dOwn = fuelAt(own);

  // ahead of the quake the paper turns to stone; cracks run out along the stones' edges, hairlines branch off
  float torch = uPtrOn * smoothstep(.15, 0., distance(a, uPtr));
  float dPix = seedFuel(a, vn(a * 3.), .3, 1., 0);
  float petr = max(smoothstep(-.34, -.3, dOwn + (vn(a * 24.) - .5) * .03), torch * .8);   // each stone forms whole, one by one
  float crack = max(smoothstep(-.32, -.06, dPix + (vn(a * 31.) - .5) * .08), torch * .6);
  float loose = smoothstep(-.09, 0., dOwn);
  float cw = crack * (.0015 + .003 * crack) + loose * .004;
  float ej = e + (vn(a * 80.) - .5) * .004 * crack;
  float hair = .65 * vn(a * 15.) + .35 * vn(a * 34.);
  float hmask = max(smoothstep(.6, .85, vn(a * 4.7 + vec2(3., 8.))), 1. - smoothstep(0., .03, ej));
  float hl = (1. - smoothstep(.011, .022, abs(hair - .5))) * smoothstep(.45, 1., crack) * hmask * petr;

  // a stone still in place: rattles when it works loose
  vec2 jig = loose * vec2(sin(uT * 55. + own.x * 7.), cos(uT * 63. + own.y * 5.)) * .0016 - vec2(0., loose * .004);
  vec2 suv = uv + vec2(jig.x / uAr, jig.y);
  vec3 ground = mix(texture(uDraft, suv).rgb, stone(a + jig, suv, own, ej, nb), petr);
  float inC = (1. - smoothstep(cw, cw + .0015, ej)) * smoothstep(0., .1, crack + loose);
  vec3 fissure = mix(vec3(.2, .16, .12), vec3(.03, .025, .02), clamp(1. - ej / max(cw, 1e-4), 0., 1.));
  ground = mix(ground, fissure, inC);
  ground = mix(ground, ground * .55, hl);

  // a hole: the final underneath, dusty where a stone just left, shadowed under the edge above
  vec3 fin = texture(uFinal, uv).rgb;
  fin = mix(fin, fin * .45 + vec3(.1, .08, .06), exp(-max(dOwn, 0.) * 7.) * .7);
  fin *= 1. - .45 * (1. - smoothstep(0., .04, e)) * max(nb.y, 0.);

  vec3 col = dOwn <= 0. ? ground : fin;

  // a falling stone, from here or from above, is drawn in front of everything
  if (uScan > .5) {
    vec2 last = vec2(-1e4);
    for (int k = 0; k < NSCAN; k++) {
      vec4 C = k == 0 ? own : chunk(a + vec2(0., float(k) * STEP));
      if (C.xy == last) continue;
      last = C.xy;
      float dc = k == 0 ? dOwn : fuelAt(C);
      if (dc <= 0. || dc >= FALLK) continue;
      float fall = dc / FALLK, rot;
      vec2 src = fallSrc(a, C, fall, rot);
      vec4 C2; vec2 nb2;
      float e2 = cellEdge(src, C2, nb2);
      if (C2.xy != C.xy) continue;
      float cs = cos(rot), sn = sin(rot);
      nb2 = vec2(cs * nb2.x - sn * nb2.y, sn * nb2.x + cs * nb2.y);   // the light stays put as it turns
      vec3 piece = stone(src, vec2(src.x / uAr, src.y), C, e2, nb2) * (1. - .5 * fall);
      col = mix(piece, col, smoothstep(.75, 1., fall));
      break;
    }
  }
  o = vec4(col, 1.);
}`,
};

export default earth;
