// POST /api/ping: the library calls this once per page per effect (see ping() in js/lib.js).
// It records the site's domain (from the Origin header), the effect and the library version. Nothing else.
// With { s: 1 } the site is also asking to be listed in the showcase, which only happens once the owner approves it.
import { configured, db } from './_db.js';

// every effect in both packs (old elemental-reveal pings only ever send the first five)
const EFFECTS = new Set(['fire', 'water', 'air', 'earth', 'lightning', 'clone', 'vortex', 'spiral', 'blade', 'storm', 'twister']);
const CORS = { 'Access-Control-Allow-Origin': '*' };
const MAX_SITES = 100000;   // a ceiling, in case someone floods it with made-up domains

function siteOf(req) {
  try {
    return new URL(req.headers.get('origin') || req.headers.get('referer') || '').hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}
const ignored = (h) => !h || h.length > 253 || !/^[a-z0-9.-]+$/.test(h) || !h.includes('.') ||
  h.endsWith('.local') || h.endsWith('.localhost') || /^[\d.]+$/.test(h) || h === 'elemental-reveal.vercel.app' || h === 'weather-the-draft.vercel.app';

export async function POST(req) {
  const site = siteOf(req);
  if (!configured || ignored(site)) return new Response(null, { status: 204, headers: CORS });

  let body = {};
  try { body = JSON.parse(await req.text()); } catch { /* keep defaults */ }
  const effect = EFFECTS.has(body.e) ? body.e : 'unknown';
  const v = typeof body.v === 'string' && /^[\w.-]{1,20}$/.test(body.v) ? body.v : 'unknown';
  // @brightkumedzro/reveal sends p: 'reveal'; the old elemental-reveal sends no p. Kept apart in the version column.
  const version = body.p === 'reveal' ? `reveal-${v}` : v;

  try {
    const sql = await db();
    const [{ known, total }] = await sql`
      select exists(select 1 from wtd_sites where site = ${site}) as known, (select count(*)::int from wtd_sites) as total`;
    if (!known && total >= MAX_SITES) return new Response(null, { status: 204, headers: CORS });
    await sql`
      insert into wtd_sites (site) values (${site})
      on conflict (site) do update set last_seen = now(), loads = wtd_sites.loads + 1`;
    await sql`
      insert into wtd_daily (day, site, effect, version) values (current_date, ${site}, ${effect}, ${version})
      on conflict (day, site, effect, version) do update set loads = wtd_daily.loads + 1`;
    if (body.s === 1) await sql`update wtd_sites set showcase = 'requested' where site = ${site} and showcase is null`;
  } catch {
    // the ping is best-effort; never fail the caller
  }
  return new Response(null, { status: 204, headers: CORS });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' } });
}
