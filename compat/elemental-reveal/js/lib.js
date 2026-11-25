/* @brightkumedzro/elemental-reveal has moved to @brightkumedzro/reveal. This last version re-exports its elemental
   pack, so `import { reveal } from '@brightkumedzro/elemental-reveal'` keeps working with bundlers and Node. Switch to
   `import { reveal } from '@brightkumedzro/reveal/elemental'` (or '@brightkumedzro/reveal' for every effect).
   Pages loading 0.1 or 0.2 from a CDN are pinned to those versions and are unaffected. */
export { reveal, effects, VERSION, fire, water, air, earth, lightning } from '@brightkumedzro/reveal/elemental';
export { default } from '@brightkumedzro/reveal/elemental';
