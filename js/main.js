// The demo site: every chapter on the page, whichever pack it's from. boot() only builds the chapters a page has.
import { boot } from './core.js';
import { effects } from './lib.js';

// sound: 'toggle' (controls shown, starts off), 'on' (starts on at the first click or key), 'off' (no sound, no controls)
if (document.querySelector('.track[data-el]')) boot(effects, { sound: 'toggle' });
