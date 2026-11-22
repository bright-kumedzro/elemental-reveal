# Weather the draft

Five scroll-driven reveals. Fire, water, air, earth and lightning each take the same pencil wireframe apart in their own way and leave the finished design underneath.

**Live:** https://weather-the-draft.vercel.app (all five in a row) · each element on its own page: [/fire](https://weather-the-draft.vercel.app/fire), [/water](https://weather-the-draft.vercel.app/water), [/air](https://weather-the-draft.vercel.app/air), [/earth](https://weather-the-draft.vercel.app/earth), [/lightning](https://weather-the-draft.vercel.app/lightning). Part of the [Playground](https://www.brightkumedzro.com/playground).

## The elements

- **Fire.** The first scroll calls down a comet. It streaks in trailing fire, lights the page as it comes, and hits: a flash, a shockwave that bends everything it crosses, and a blast crater that catches. Flames rise off the burning edge, embers lift away, and the final wavers in the heat. Move over the paper and fire follows your hand. Click to throw a fireball. It arcs up from below and lights a new fire where it lands.
- **Water.** Water pours in from the top and runs down the page under gravity. Each column has its own speed, so it comes down in meandering rivulets with blunt, rounded heads. Every rivulet thickens as more water comes until they merge into a sheet, and a lumpy warp keeps the edges irregular. Ahead of it the paper wicks the water up and the pencil runs, leaving a tide line. In the water, ripples flow downhill and refract the design, and the sketch's pigment washes out behind the front. Click to spill some.
- **Air.** Wind blows in from the left along streaky noise. The paper flutters, then gets stripped off in streaks and carried downwind. Paper flecks take their colour from the part of the sketch they came from. Click to send a gust.
- **Earth.** Ahead of the quake the paper turns to stone, one stone at a time. Each stone is a domain-warped Voronoi cell, shaded as a rounded, pitted, grainy rock with the sketch cut into its face. Cracks race out along the stones' edges, then each stone rattles loose and falls down the page, turning as it drops. Each pixel scans upward for a stone whose fall has carried it there. Click to start a quake.
- **Lightning.** Four bolts grow as branching random walks. Each gets a chamfer distance field, packed one bolt per channel into an `RGBA16F` texture. When scroll progress reaches a bolt it strikes, and the reveal spreads out from its channel. Click to call down your own. Flashes are short, cover a small area, and fire at most about twice a second.

## Use it in your project

`js/lib.js` puts any of the five effects between any two images, on any page. There's a live demo and the full options at [/use](https://weather-the-draft.vercel.app/use).

```html
<div id="hero" style="height: 80vh"></div>
<script type="module">
  import { reveal } from 'https://weather-the-draft.vercel.app/js/lib.js';
  reveal('#hero', { effect: 'water', from: '/sketch.png', to: '/final.png' });
</script>
```

- **Progress** follows the scroll by default. Set `progress: 'auto'` to play once when it comes into view, `track: '#wrapper'` to pin it inside a tall wrapper, or `progress: 'manual'` to drive it yourself with `fx.progress(p)`.
- `reveal` returns `{ ready, progress, play, reset, destroy }`.
- `from` and `to` take an image URL or an `<img>`, `<canvas>` or `<video>`. Anything inside the element stays on top of the effect.
- `/js/*` is served with `Access-Control-Allow-Origin: *`, so the import works from any site. Your images need CORS headers if they're on another domain.

## How it works

- **Two drawings, one layout.** Each chapter paints a draft (Caveat on paper) and a final (Plus Jakarta Sans on dark) from the same layout and uploads them as textures.
- **One WebGL canvas for everything.** A fixed WebGL2 canvas sits behind the page. Each frame, every chapter on screen is drawn into its own stage's rectangle (viewport + scissor), each with its own fragment shader. Textures are created when a chapter comes within a screen of the viewport and deleted once it's well out of view.
- **Fuel.** Each element's shader gives every pixel a fuel value, and scrolling pushes the front through it. Each element has a JS copy of its fuel function, built on the same integer-hash noise, so particles spawn exactly at the front.
- **Fallbacks.** Without WebGL2 each chapter does a CSS clip wipe. With `prefers-reduced-motion` they cross-fade, with no flashes.

There are no libraries and no build step. `js/core.js` is the engine and each element is one file in `js/`.

## Pages

`index.html` and the five element pages are written by `scripts/pages.mjs` from the copy at the top of that file. Edit the copy there, then run:

```sh
node scripts/pages.mjs
```

## Run locally

```sh
python -m http.server 5179
```

Then open http://127.0.0.1:5179. ES modules need a server, so opening the file directly won't work.

`?capture=<fire|water|air|earth|lightning>&p=<progress>&t=<ms>` shows one chapter full screen and renders a single frame on a virtual clock. For fire, `&comet=<ms>` places the comet partway through its flight. `window.__capture.prime(p, t)` and `window.__capture.frame(p, t, 0)` render frame by frame, which is how the covers and card loops are made.

## Deploy

```sh
vercel deploy --prod
```

burn-the-draft.vercel.app redirects to `/fire`.
