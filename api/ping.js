// POST /api/ping: the library calls this once per page per effect (see ping() in js/lib.js).
// It records the site's domain (from the Origin header), the effect and the library version. Nothing else.
import { configured, pipeline } from './_redis.js';

const EFFECTS = new Set(['fire', 'water', 'air', 'earth', 'lightning']);
const CORS = { 'Access-Control-Allow-Origin': '*' };
const DAY = 60 * 60 * 24;
const MAX_SITES = 100000;   // a ceiling, in case someone floods it with made-up domains

function siteOf(req) {
  try {
    return new URL(req.headers.get('origin') || req.headers.get('referer') || '').hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}
const ignored = (h) => !h || h.length > 253 || !/^[a-z0-9.-]+$/.test(h) || !h.includes('.') || h === 'localhost' ||
  h.endsWith('.local') || h.endsWith('.localhost') || /^[\d.]+$/.test(h) || h === 'weather-the-draft.vercel.app';

export async function POST(req) {
  const site = siteOf(req);
  if (!configured || ignored(site)) return new Response(null, { status: 204, headers: CORS });

  let body = {};
  try { body = JSON.parse(await req.text()); } catch { /* keep defaults */ }
  const effect = EFFECTS.has(body.e) ? body.e : 'unknown';
  const version = typeof body.v === 'string' && /^[\w.-]{1,20}$/.test(body.v) ? body.v : 'unknown';
  const day = new Date().toISOString().slice(0, 10);

  try {
    const [isMember, count] = await pipeline([['SISMEMBER', 'wtd:sites', site], ['SCARD', 'wtd:sites']]);
    if (!isMember && count >= MAX_SITES) return new Response(null, { status: 204, headers: CORS });
    await pipeline([
      ['SADD', 'wtd:sites', site],
      ['HSETNX', 'wtd:first', site, String(Date.now())],
      ['HSET', 'wtd:last', site, String(Date.now())],
      ['HINCRBY', 'wtd:loads', site, '1'],
      ['HINCRBY', `wtd:effects:${site}`, effect, '1'],
      ['HINCRBY', 'wtd:effects', effect, '1'],
      ['HINCRBY', 'wtd:versions', version, '1'],
      ['SADD', `wtd:day:${day}`, site],
      ['EXPIRE', `wtd:day:${day}`, String(DAY * 400)],
      ['INCR', `wtd:dayloads:${day}`],
      ['EXPIRE', `wtd:dayloads:${day}`, String(DAY * 400)],
    ]);
  } catch {
    // the ping is best-effort; never fail the caller
  }
  return new Response(null, { status: 204, headers: CORS });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' } });
}
