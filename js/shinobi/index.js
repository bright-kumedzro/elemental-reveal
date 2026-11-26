/* @brightkumedzro/reveal/shinobi: just the shinobi pack (clone, vortex, spiral, blade, storm, twister, magma, shuriken), for a
   smaller bundle.
     import { reveal } from '@brightkumedzro/reveal/shinobi';
     reveal('#hero', { effect: 'storm', from: '/sketch.png', to: '/final.png' }); */
import { makeReveal, VERSION } from '../reveal.js';
import clone from './clone.js';
import vortex from './vortex.js';
import spiral from './spiral.js';
import blade from './blade.js';
import storm from './storm.js';
import twister from './twister.js';
import magma from './magma.js';
import shuriken from './shuriken.js';

export const effects = { clone, vortex, spiral, blade, storm, twister, magma, shuriken };
export const reveal = makeReveal(effects);
export { VERSION, clone, vortex, spiral, blade, storm, twister, magma, shuriken };
export default reveal;
