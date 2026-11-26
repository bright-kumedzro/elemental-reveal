/* @brightkumedzro/reveal: every effect from both packs, by name.
     import { reveal } from '@brightkumedzro/reveal';
     reveal('#hero', { effect: 'fire', from: '/sketch.png', to: '/final.png' });
   Effects: fire, water, air, earth, lightning, frost (elemental) · clone, vortex, spiral, blade, storm, twister, magma, shuriken (shinobi).
   For a smaller bundle, import one pack: '@brightkumedzro/reveal/elemental' or '@brightkumedzro/reveal/shinobi'. */
import { makeReveal, VERSION } from './reveal.js';
import { effects as elemental } from './elemental/index.js';
import { effects as shinobi } from './shinobi/index.js';

export const packs = { elemental, shinobi };
export const effects = { ...elemental, ...shinobi };
export const reveal = makeReveal(effects);
export { VERSION, makeReveal };
export default reveal;
