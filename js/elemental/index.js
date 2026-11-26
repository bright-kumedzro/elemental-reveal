/* @brightkumedzro/reveal/elemental: just the elemental pack (fire, water, air, earth, lightning, frost, snow), for a smaller bundle.
     import { reveal } from '@brightkumedzro/reveal/elemental';
     reveal('#hero', { effect: 'water', from: '/sketch.png', to: '/final.png' }); */
import { makeReveal, VERSION } from '../reveal.js';
import fire from './fire.js';
import water from './water.js';
import air from './air.js';
import earth from './earth.js';
import lightning from './lightning.js';
import frost from './frost.js';
import snow from './snow.js';

export const effects = { fire, water, air, earth, lightning, frost, snow };
export const reveal = makeReveal(effects);
export { VERSION, fire, water, air, earth, lightning, frost, snow };
export default reveal;
