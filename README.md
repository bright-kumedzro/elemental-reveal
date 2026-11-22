# Weather the draft

Five WebGL2 reveals between any two images: **fire, water, air, earth and lightning**. Each one takes the first image apart in its own way and leaves the second underneath. Drive it with scroll, let it play on its own, or set the progress yourself. No dependencies.

**Live demo and docs:** https://weather-the-draft.vercel.app/use · **See all five:** https://weather-the-draft.vercel.app

## Install

```sh
npm install weather-the-draft
```

```js
import { reveal } from 'weather-the-draft';

reveal('#hero', { effect: 'water', from: '/sketch.png', to: '/final.png' });
```

Or with no build step, straight from a CDN. Pin the version so updates never change your page unexpectedly:

```html
<div id="hero" style="height: 80vh"></div>
<script type="module">
  import { reveal } from 'https://cdn.jsdelivr.net/npm/weather-the-draft@0.1/js/lib.js';
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
| `onProgress` | none | Called every frame with progress from 0 to 1 (the draft is gone by about 0.9) |
| `telemetry` | `true` | The anonymous adoption ping, described below |
| `credit` | `true` | One line crediting the library in the browser console |

`reveal()` returns `{ ready, progress(p?), play(), reset(), destroy() }`.

## Good to know

- Images from another domain need CORS headers, or WebGL can't read them.
- Each call gets its own WebGL2 canvas. Browsers cap how many can run at once (often around 16), so call `destroy()` on ones you're done with.
- On slow devices it drops its render resolution automatically until it's smooth.
- Without WebGL2 it falls back to a wipe. With reduced motion on it cross-fades, so lightning doesn't flash.
- It's safe to import during server rendering; it only runs in the browser.

## Telemetry

So I can see whether anyone uses this, the library sends one tiny request per page per effect to `weather-the-draft.vercel.app/api/ping`. It contains the effect name and the library version. The server records your site's domain from the request's `Origin` header. Nothing about your visitors is sent or stored: no cookies, no IPs, no paths. It never runs on localhost. Turn it off with `telemetry: false`.

## Credit

MIT licensed, so use it anywhere. Keeping the copyright notice in the code is the only requirement. If it helps your project, a link back to [weather-the-draft.vercel.app](https://weather-the-draft.vercel.app) is appreciated, never required.

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
- `js/core.js` is the engine and site drawing; `js/lib.js` is the library; each effect is one file in `js/`.

### Develop

```sh
python -m http.server 5179          # then open http://127.0.0.1:5179
node scripts/pages.mjs              # rewrite index.html and the five element pages from their copy
vercel deploy --prod
```

`?capture=<effect>&p=<progress>&t=<ms>` shows one chapter full screen on a virtual clock. For fire, `&comet=<ms>` places the comet partway through its flight. `window.__capture.prime(p, t)` and `window.__capture.frame(p, t, 0)` render frame by frame, which is how the covers and card loops are made.

`/api/ping` records adoption in Neon Postgres (connected through the Vercel Marketplace, free plan). `/stats` shows it, behind the `STATS_TOKEN` environment variable.

burn-the-draft.vercel.app redirects to `/fire`.

## License

[MIT](LICENSE) © 2026 Bright Kumedzro
