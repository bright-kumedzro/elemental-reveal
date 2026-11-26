/* @brightkumedzro/reveal: every effect from both packs, by name.
     import { reveal } from '@brightkumedzro/reveal';
     reveal('#hero', { effect: 'fire', from: '/sketch.png', to: '/final.png' });
   Effects: fire, water, air, earth, lightning, frost, snow (elemental) · clone, vortex, spiral, blade, storm, twister, magma, shuriken (shinobi) · curl, fold, draw (paper).
   For a smaller bundle, import one pack: '@brightkumedzro/reveal/elemental', '/shinobi' or '/paper'. */
import { makeReveal, VERSION, gpu } from './reveal.js';
import { effects as elemental } from './elemental/index.js';
import { effects as shinobi } from './shinobi/index.js';
import { effects as paper } from './paper/index.js';

export const packs = { elemental, shinobi, paper };
export const effects = { ...elemental, ...shinobi, ...paper };
export const reveal = makeReveal(effects);
export { VERSION, gpu, makeReveal };
export default reveal;
