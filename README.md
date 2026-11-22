# Weather the draft

Four scroll-driven reveals, the follow-up to [Burn the draft](https://burn-the-draft.vercel.app). Water, air, earth and lightning each take the same pencil wireframe apart in their own way and leave the finished design underneath.

Part of the [Playground](https://www.brightkumedzro.com/playground).

## The chapters

- **Water.** A tide rises from the bottom with a travelling swell. Ahead of it the paper soaks, greys, and the pencil bleeds. Below the waterline the final wavers through refracting water with caustic light. Click to drop a stone. It sends out ripples and floods outward from where it lands.
- **Air.** Wind blows in from the left along streaky noise. The paper flutters before the gust reaches it. Then the wind strips it off in streaks and smears it downwind. Paper flecks take their colour from the part of the sketch they came from. Click to send a gust.
- **Earth.** The page splits into Voronoi plates. Each plate's timing comes from its centre, so a whole plate goes at once: cracks open along its edges, then it shrinks and sinks into the dark. Pebbles and dust fall off it. Scrolling fast shakes the ground. Click to start a new quake.
- **Lightning.** Four bolts grow as branching random walks. Each bolt gets a chamfer distance field on a coarse grid, packed one bolt per channel into an `RGBA16F` texture. When scroll progress reaches a bolt's moment it strikes, and the reveal spreads out from its channel. Click to call down your own bolt (up to four, in a second texture). Flashes are short, cover a small area, and fire at most about twice a second.

## How it works

- **Two drawings, one layout.** Each chapter paints a draft (Caveat on paper) and a final (Plus Jakarta Sans on dark) from the same layout and uploads them as textures. The 2D copies are freed once the GPU has them.
- **One WebGL canvas for everything.** A fixed WebGL2 canvas sits behind the page. Each frame, every chapter on screen is drawn into its own stage's rectangle (viewport + scissor), each with its own fragment shader. Running one context instead of four keeps memory down and stays clear of mobile context limits. Textures are created when a chapter comes within a screen of the viewport and deleted once it's well out of view.
- **Fuel.** Each element's shader gives every pixel a fuel value, and scrolling pushes the front through it. Each element has a JS copy of its fuel function, built on the same integer-hash noise, so particles spawn exactly at the front.
- **Fallbacks.** Without WebGL2 each chapter does a CSS clip wipe in its own direction. With `prefers-reduced-motion` they cross-fade, so the lightning chapter doesn't flash. Phones and low-core devices get fewer noise octaves, a lower pixel ratio and a coarser lightning grid.

There are no libraries and no build step: `index.html`, `style.css`, and ES modules in `js/` (`core.js` is the engine; each element is one file).

## Run locally

```sh
python -m http.server 5179
```

Then open http://127.0.0.1:5179. ES modules need a server, so opening the file directly won't work.

`?capture=<water|air|earth|lightning>&p=<progress>&t=<ms>` shows one chapter full screen and renders a single frame on a virtual clock, with a short run-up so particles and strikes are in place. `window.__capture.frame(p, t)` renders more frames. Use it for covers and card loops.

## Deploy

```sh
vercel deploy --prod
```
