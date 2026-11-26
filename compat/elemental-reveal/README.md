# @brightkumedzro/elemental-reveal has moved

It's now **[@brightkumedzro/reveal](https://www.npmjs.com/package/@brightkumedzro/reveal)**: the same five elemental effects (fire, water, air, earth, lightning), plus a second pack (clone, vortex, spiral, blade, storm, twister).

```sh
npm uninstall @brightkumedzro/elemental-reveal
npm install @brightkumedzro/reveal
```

```js
// before
import { reveal } from '@brightkumedzro/elemental-reveal';
// after: the same effects, options and methods
import { reveal } from '@brightkumedzro/reveal/elemental';
```

This last version (0.3.0) simply re-exports `@brightkumedzro/reveal/elemental`, so nothing breaks in the meantime. Pages that load 0.1 or 0.2 from a CDN are pinned to those versions and keep working as they are.

Docs and demo: https://reveal.brightkumedzro.com/use

MIT © 2026 Bright Kumedzro
