/* @brightkumedzro/reveal/paper: just the paper pack (curl, fold, draw), for a smaller bundle.
     import { reveal } from '@brightkumedzro/reveal/paper';
     reveal('#hero', { effect: 'curl', from: '/sketch.png', to: '/final.png' }); */
import { makeReveal, VERSION } from '../reveal.js';
import curl from './curl.js';
import fold from './fold.js';
import draw from './draw.js';

export const effects = { curl, fold, draw };
export const reveal = makeReveal(effects);
export { VERSION, curl, fold, draw };
export default reveal;
