// The showcase: sites that asked to be listed and that the owner approved.
// GET  /api/showcase  public: the approved sites, with the effects they're known to use (if they ever pinged).
// POST /api/showcase  two uses:
//   - anyone, no token: { url } asks for that site to be listed. It waits as 'requested' until the owner decides.
//   - owner (STATS_TOKEN as a bearer token): { site, status: 'approved' | 'hidden' | 'requested' | null }.
// (Versions 0.2–1.0 of the library could also ask from the page with showcase: true; see /api/ping.)
import { timingSafeEqual } from 'node:crypto';
import { configured, db } from './_db.js';

const STATUSES = new Set(['approved', 'hidden', 'requested']);
const MAX_PENDING = 200;   // a ceiling on open requests, in case someone floods the form
const OWN = new Set(['reveal.brightkumedzro.com', 'elemental-reveal.vercel.app', 'weather-the-draft.vercel.app']);

function authorised(req) {
  const want = process.env.STATS_TOKEN || '';
  const got = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!want || got.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(want));
}
const reply = (body, status = 200, cache = 'no-store') =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': cache } });

/* A site's address as the showcase keys it: the hostname, lower case, without www. Null if it isn't a public site. */
function siteOf(input) {
  try {
    const raw = String(input || '').trim();
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const h = u.hostname.toLowerCase().replace(/^www\./, '');
    if (!/^[a-z0-9.-]{1,253}$/.test(h) || !h.includes('.') || /^[\d.]+$/.test(h) || h.endsWith('.local') || h.endsWith('.localhost') || OWN.has(h)) return null;
    return h;
  } catch {
    return null;
  }
}

export async function GET() {
  if (!configured) return reply({ sites: [] }, 200);
  const sql = await db();
  const rows = await sql`
    select s.site,
           extract(epoch from s.first_seen) * 1000 as since,
           array(select distinct d.effect from wtd_daily d where d.site = s.site and d.effect <> 'unknown' order by 1) as effects
    from wtd_sites s
    where s.showcase = 'approved'
    order by s.first_seen asc
    limit 60`;
  return reply({ sites: rows.map((r) => ({ site: r.site, since: Number(r.since), effects: r.effects })) }, 200, 'public, s-maxage=300, stale-while-revalidate=600');
}

export async function POST(req) {
  if (!configured) return reply({ error: 'database not connected' }, 503);
  let body = {};
  try { body = await req.json(); } catch { /* checked below */ }
  const sql = await db();

  if (req.headers.get('authorization')) {
    if (!authorised(req)) return reply({ error: 'not allowed' }, 401);
    const site = typeof body.site === 'string' ? body.site.toLowerCase() : '';
    const status = body.status === null ? null : STATUSES.has(body.status) ? body.status : undefined;
    if (!site || status === undefined) return reply({ error: 'need a site and a status' }, 400);
    const done = await sql`update wtd_sites set showcase = ${status} where site = ${site} returning site, showcase`;
    return done.length ? reply(done[0]) : reply({ error: 'no such site' }, 404);
  }

  // a request from the form on /stats
  const site = siteOf(body.url);
  if (!site) return reply({ error: 'That doesn’t look like a public website address.' }, 400);
  const [{ pending }] = await sql`select count(*)::int as pending from wtd_sites where showcase = 'requested'`;
  if (pending >= MAX_PENDING) return reply({ error: 'Too many requests are waiting right now. Please try again later.' }, 429);
  await sql`
    insert into wtd_sites (site, loads, showcase) values (${site}, 0, 'requested')
    on conflict (site) do update set showcase = 'requested' where wtd_sites.showcase is null`;
  return reply({ ok: true, site });
}
