# Reveal

Scroll-driven WebGL2 reveals between any two images, in two packs. Each effect takes the first image apart in its own way and leaves the second underneath. Drive it with scroll, let it play on its own, or set the progress yourself. No dependencies.

- **Elemental:** `fire`, `water`, `air`, `earth`, `lightning`, `frost`, `snow`
- **Shinobi:** `clone`, `vortex`, `spiral`, `blade`, `storm`, `twister`, `magma`, `shuriken`
- **Paper:** `curl`, `fold`, `draw`

**Live demo and docs:** https://reveal.brightkumedzro.com/use · **See them all:** https://reveal.brightkumedzro.com

## Install

```sh
npm install @brightkumedzro/reveal
```

```js
import { reveal } from '@brightkumedzro/reveal';

reveal('#hero', { effect: 'storm', from: '/sketch.png', to: '/final.png' });
```

Only using one pack? Import it on its own for a smaller bundle:

```js
import { reveal } from '@brightkumedzro/reveal/elemental';   // fire · water · air · earth · lightning · frost · snow
import { reveal } from '@brightkumedzro/reveal/shinobi';     // clone · vortex · spiral · blade · storm · twister · magma · shuriken
import { reveal } from '@brightkumedzro/reveal/paper';       // curl · fold · draw
```

Or with no build step, straight from a CDN. Pin the version so updates never change your page unexpectedly:

```html
<div id="hero" style="height: 80vh"></div>
<script type="module">
  import { reveal } from 'https://cdn.jsdelivr.net/npm/@brightkumedzro/reveal@1/js/lib.js';
  // one pack: …/reveal@1/js/elemental/index.js or …/reveal@1/js/shinobi/index.js
  reveal('#hero', { effect: 'fire', from: '/sketch.png', to: '/final.png' });
</script>
```

The element needs a size. Anything you put inside it stays on top of the effect, so it works as a background behind your own content.

### Coming from `@brightkumedzro/elemental-reveal`

It's the same library under a new name, with the shinobi pack added. Swap the import for `@brightkumedzro/reveal/elemental` (or `@brightkumedzro/reveal` for every effect) and everything works as before: same options, same methods, same effect names.

## Scroll effects

For your own page content rather than two images: text, numbers, SVG, pictures and whole sections.

```js
import { words, count, lines, mask, steps, scrub, zoom, chrome } from '@brightkumedzro/reveal/scroll';

words('#intro');                                   // each word lights up as you scroll
count('.stat');                                    // numbers count up in view, in the format you wrote them ("1,000+", "98%")
lines('#journey', { pen: true });                  // SVG paths draw themselves
mask('#title', { src: '/hero.jpg' });              // big type becomes a window onto a picture
steps('[data-steps]', { onStep: (i) => {} });      // a pinned visual with steps scrolling past it
scrub('#track', { frames: '/f/%03d.jpg', count: 90 });   // scroll plays an image sequence
zoom('#story');                                    // dive from one scene into the next
chrome('#title');                                  // light flows into the type and it settles into chrome
```

Each returns `{ stop() }`, they share one scroll listener, and with reduced motion each shows its finished state. See them all at [reveal.brightkumedzro.com/scroll](https://reveal.brightkumedzro.com/scroll).

## Options

| Option | Default | What it does |
|---|---|---|
| `effect` | the pack's first | Any effect by name: `'fire'`, `'water'`, `'air'`, `'earth'`, `'lightning'`, `'frost'`, `'snow'`, `'clone'`, `'vortex'`, `'spiral'`, `'blade'`, `'storm'`, `'twister'`, `'magma'`, `'shuriken'`, `'curl'`, `'fold'` or `'draw'`. The main import defaults to `'fire'`, the shinobi pack to `'clone'` |
| `from` | required | What gets taken away: an image URL, or an `<img>`, `<canvas>` or `<video>` |
| `to` | required | What's revealed underneath |
| `progress` | `'scroll'` | `'scroll'` follows the page, `'auto'` plays once when it comes into view, and `'manual'` waits for `fx.progress(p)` |
| `track` | none | Scroll mode: a tall wrapper the element is pinned inside (`position: sticky`) |
| `duration` | `3500` | Auto mode: how long it takes, in ms |
| `interactive` | `true` | Hover and click effects: every effect does something of its own where you click |
| `fit` | `'cover'` | `'cover'`, `'contain'` or `'fill'`, like CSS `object-fit` |
| `background` | `'#0b0b0c'` | Shown behind images that don't fill the element |
| `sound` | `'off'` | Synthesised sound, no audio files. `'on'` starts at the visitor's first click, tap or key press (browsers block sound before one); `'toggle'` waits for `fx.sound(true)` or a `[data-reveal-sound]` button |
| `onProgress` | none | Called every frame with progress from 0 to 1 (the draft is gone by about 0.9) |
| `credit` | `true` | One line crediting the library in the browser console |

`reveal()` returns `{ ready, progress(p?), play(), reset(), sound(on?), destroy() }`. The package also exports `effects` (every effect by name), `packs` (`{ elemental, shinobi }`), `makeReveal(effects)` for your own set, and `VERSION`.

## Sound

Every effect has its own sound, synthesised with Web Audio: fire roars and the comet lands with a boom, water rushes, the wind gusts, the ground grinds and quakes, lightning crackles and thunders, clones go with a poof, sand roars and hisses, the sphere whirs, the blade shrieks, the storm howls, the twister roars like a train, the ice creaks and shatters, the magma bubbles and sizzles, the shuriken screams, paper rustles, flaps and snaps, and a nib scratches. It is off unless you ask for it, and it gets louder the harder the visitor scrolls.

```html
<button data-reveal-sound aria-pressed="false">Sound</button>
<script type="module">
  import { reveal } from '@brightkumedzro/reveal';
  const fx = reveal('#hero', { effect: 'earth', from: '/sketch.png', to: '/final.png', sound: 'toggle' });
  // any [data-reveal-sound] button turns it on and off, or do it yourself: fx.sound(true)
</script>
```

Every reveal on a page shares one sound switch, and the visitor's choice is remembered. A reveal goes quiet when it scrolls out of view.

## Good to know

- Images from another domain need CORS headers, or WebGL can't read them.
- Each call gets its own WebGL2 canvas. Browsers cap how many can run at once (often around 16), so call `destroy()` on ones you're done with.
- On slow devices it drops its render resolution automatically until it's smooth.
- Without WebGL2 it falls back to a wipe. With reduced motion on it cross-fades, so nothing flashes.
- It's safe to import during server rendering; it only runs in the browser.

## Privacy

The library makes no network requests of its own: it only loads the images you give it, and it sends nothing about you or your visitors anywhere. (Versions before 1.1 could send an opt-in adoption ping; the `telemetry` and `showcase` options are now ignored.)

Using it on a site? [Submit it](https://reveal.brightkumedzro.com/stats) to be listed under "Made with Reveal".

## Credit

MIT licensed, so use it anywhere. Keeping the copyright notice in the code is the only requirement. If it helps your project, a link back to [reveal.brightkumedzro.com](https://reveal.brightkumedzro.com) is appreciated, never required. The shinobi pack's techniques are anime-inspired; every effect is written from scratch.

---

## The site

`/` introduces both packs. `/elemental` runs the seven elements in a row, `/shinobi` the eight techniques and `/paper` the three paper effects; every effect also has a page of its own (`/fire` … `/twister`). `/use` is the docs with a live demo, `/stats` the adoption numbers, and `/sound-lab` tunes every effect's sound by ear.

### How it works

- Each chapter paints two drawings from one layout, the draft and the final, and uploads them as textures. One fixed WebGL2 canvas draws every chapter on screen into its own rectangle, each with its own fragment shader. Textures load when a chapter comes near and are freed when it's well away.
- Each effect's shader gives every pixel a fuel value, and progress pushes the front through it. A JS copy of each fuel function, using the same integer-hash noise, tells the particles and clicks where the front is.

| File | What it is |
|---|---|
| `js/core.js` | The engine and the site's drawings, shared by both packs |
| `js/reveal.js` | The library: `makeReveal(effects)` |
| `js/lib.js` | The package's main entry: every effect |
| `js/elemental/` | The elemental pack: `index.js` (its entry), one file per effect, and `sfx.js`, its sound recipes |
| `js/shinobi/` | The shinobi pack: `index.js` (its entry), one file per effect, and `sfx*.js`, its sound recipes |
| `js/sound.js` | The sound switch and small Web Audio helpers |
| `js/main.js` | The site: boots whichever chapters a page has |
| `js/*/lab.js`, `sound-lab.html` | The sound lab (not in the npm package) |
| `scripts/pages.mjs` | Writes every page from `scripts/copy-elemental.mjs` and `scripts/copy-shinobi.mjs` |
| `api/` | The stats server (not in the npm package) |
| `compat/elemental-reveal/` | The last `@brightkumedzro/elemental-reveal`, which re-exports the elemental pack from here |

### Develop

```sh
python -m http.server 5179          # then open http://127.0.0.1:5179 (and /sound-lab to tune the sounds)
node scripts/pages.mjs              # rewrite every page from the copy
vercel deploy --prod
```

`?capture=<effect>&p=<progress>&t=<ms>` shows one chapter full screen on a virtual clock. For fire, `&comet=<ms>` places the comet partway through its flight; for the blade, `&run=<ms>` places its charge partway through its run. `window.__capture.prime(p, t)` and `window.__capture.frame(p, t, 0)` render frame by frame, which is how the covers and card loops are made.

`/api/showcase` keeps the "Made with Reveal" list in Neon Postgres (connected through the Vercel Marketplace, free plan): anyone can submit a site from `/stats`, and it only shows once you approve it at `/stats#owner` with the `STATS_TOKEN`. `/api/signals` gathers npm downloads, jsDelivr CDN requests and npm dependents for both package names, and GitHub stars, cached for an hour. `/api/ping` still accepts pings from versions before 1.1, which could opt in to one.

burn-the-draft.vercel.app redirects to `/fire`.

## License

[MIT](LICENSE) © 2026 Bright Kumedzro
