# Elemental Reveal

Five WebGL2 reveals between any two images: **fire, water, air, earth and lightning**. Each one takes the first image apart in its own way and leaves the second underneath. Drive it with scroll, let it play on its own, or set the progress yourself. No dependencies.

**Live demo and docs:** https://elemental-reveal.vercel.app/use · **See all five:** https://elemental-reveal.vercel.app

## Install

```sh
npm install @brightkumedzro/elemental-reveal
```

```js
import { reveal } from '@brightkumedzro/elemental-reveal';

reveal('#hero', { effect: 'water', from: '/sketch.png', to: '/final.png' });
```

Or with no build step, straight from a CDN. Pin the version so updates never change your page unexpectedly:

```html
<div id="hero" style="height: 80vh"></div>
<script type="module">
  import { reveal } from 'https://cdn.jsdelivr.net/npm/@brightkumedzro/elemental-reveal@0.2/js/lib.js';
  reveal('#hero', { effect: 'fire', from: '/sketch.png', to: '/final.png' });
</script>
```

The element needs a size. Anything you put inside it stays on top of the effect, so it works as a background behind your own content.

## Options

| Option | Default | What it does |
|---|---|---|
| `effect` | `'fire'` | `'fire'`, `'water'`, `'air'`, `'earth'` or `'lightning'` |
| `from` | required | What gets taken away: an image URL, or an `<img>`, `<canvas>` or `<video>` |
| `to` | required | What's revealed underneath |
| `progress` | `'scroll'` | `'scroll'` follows the page, `'auto'` plays once when it comes into view, and `'manual'` waits for `fx.progress(p)` |
| `track` | none | Scroll mode: a tall wrapper the element is pinned inside (`position: sticky`) |
| `duration` | `3500` | Auto mode: how long it takes, in ms |
| `interactive` | `true` | Hover and click effects: throw fire, spill water, send a gust, start a quake, call down a bolt |
| `fit` | `'cover'` | `'cover'`, `'contain'` or `'fill'`, like CSS `object-fit` |
| `background` | `'#0b0b0c'` | Shown behind images that don't fill the element |
| `sound` | `'off'` | Synthesised sound, no audio files. `'on'` starts at the visitor's first click, tap or key press (browsers block sound before one); `'toggle'` waits for `fx.sound(true)` or a `[data-reveal-sound]` button |
| `onProgress` | none | Called every frame with progress from 0 to 1 (the draft is gone by about 0.9) |
| `telemetry` | `false` | Opt in to the anonymous adoption ping, described below |
| `showcase` | `false` | Ask to be listed under "Made with Elemental Reveal" at [/stats](https://elemental-reveal.vercel.app/stats). Sends the ping too; your site appears once it is approved |
| `credit` | `true` | One line crediting the library in the browser console |

`reveal()` returns `{ ready, progress(p?), play(), reset(), sound(on?), destroy() }`.

## Sound

Each element has its own sound, synthesised with Web Audio: fire roars and the comet lands with a boom, water rushes, the wind gusts, the ground grinds and quakes, and lightning crackles and thunders. It is off unless you ask for it, and it gets louder the harder the visitor scrolls.

```html
<button data-reveal-sound aria-pressed="false">Sound</button>
<script type="module">
  import { reveal } from '@brightkumedzro/elemental-reveal';
  const fx = reveal('#hero', { effect: 'earth', from: '/sketch.png', to: '/final.png', sound: 'toggle' });
  // any [data-reveal-sound] button turns it on and off, or do it yourself: fx.sound(true)
</script>
```

Every reveal on a page shares one sound switch, and the visitor's choice is remembered. A reveal goes quiet when it scrolls out of view.

## Good to know

- Images from another domain need CORS headers, or WebGL can't read them.
- Each call gets its own WebGL2 canvas. Browsers cap how many can run at once (often around 16), so call `destroy()` on ones you're done with.
- On slow devices it drops its render resolution automatically until it's smooth.
- Without WebGL2 it falls back to a wipe. With reduced motion on it cross-fades, so lightning doesn't flash.
- It's safe to import during server rendering; it only runs in the browser.

## Telemetry

Off by default. If you turn it on with `telemetry: true` (thank you), the library sends one tiny request per page per effect to `elemental-reveal.vercel.app/api/ping`. It contains the effect name and the library version. The server records your site's domain from the request's `Origin` header. Nothing about your visitors is sent or stored: no cookies, no IPs, no paths. It never runs on localhost. The totals are public at [elemental-reveal.vercel.app/stats](https://elemental-reveal.vercel.app/stats); no domain is shown unless you ask to be in the showcase with `showcase: true`. Versions before 0.2.0 sent it by default.

## Credit

MIT licensed, so use it anywhere. Keeping the copyright notice in the code is the only requirement. If it helps your project, a link back to [elemental-reveal.vercel.app](https://elemental-reveal.vercel.app) is appreciated, never required.

---

## The site

`index.html` runs all five in a row. Each element also has a page of its own: `/fire`, `/water`, `/air`, `/earth`, `/lightning`.

- **Fire.** The first scroll calls down a comet. It streaks in, hits with a flash and a shockwave, and flames rise off the burning edge. Move over the paper and fire follows your hand. Click to throw a fireball.
- **Water.** Water runs down the page in meandering rivulets with irregular, blunt edges that merge into a sheet, refracting the design. The paper wicks ahead of it and the pencil runs. Click to spill some.
- **Air.** Wind strips the paper off in streaks and carries it downwind. Click to send a gust.
- **Earth.** The paper turns to stone, one stone at a time, cracks along jagged fault lines and falls apart. Click to start a quake.
- **Lightning.** Branching bolts strike as you scroll, and the reveal spreads out from each channel. Click to call down your own.

### How it works

- Each chapter paints two drawings from one layout, the draft and the final, and uploads them as textures. One fixed WebGL2 canvas draws every chapter on screen into its own rectangle, each with its own fragment shader. Textures load when a chapter comes near and are freed when it's well away.
- Each element's shader gives every pixel a fuel value, and progress pushes the front through it. A JS copy of each fuel function, using the same integer-hash noise, tells the particles where the front is.
- `js/core.js` is the engine and site drawing; `js/lib.js` is the library; each effect is one file in `js/`. `js/sound.js` holds the sound switch and `js/sfx.js` the five sound recipes, which `sound-lab.html` tunes by ear.

### Develop

```sh
python -m http.server 5179          # then open http://127.0.0.1:5179 (and /sound-lab to tune the sounds)
node scripts/pages.mjs              # rewrite index.html and the five element pages from their copy
vercel deploy --prod
```

`?capture=<effect>&p=<progress>&t=<ms>` shows one chapter full screen on a virtual clock. For fire, `&comet=<ms>` places the comet partway through its flight. `window.__capture.prime(p, t)` and `window.__capture.frame(p, t, 0)` render frame by frame, which is how the covers and card loops are made.

`/api/ping` records adoption in Neon Postgres (connected through the Vercel Marketplace, free plan). `/stats` shows the public totals. The list of individual sites is only returned by `/api/stats` with the `STATS_TOKEN` environment variable as a bearer token. `/api/signals` gathers npm downloads, jsDelivr CDN requests, npm dependents and GitHub stars for the same page, cached for an hour. `/api/showcase` lists the sites that asked to be shown (`showcase: true`) and that you approved: open `/stats#owner`, paste the `STATS_TOKEN`, and approve or hide each request.

burn-the-draft.vercel.app redirects to `/fire`.

## License

[MIT](LICENSE) © 2026 Bright Kumedzro
