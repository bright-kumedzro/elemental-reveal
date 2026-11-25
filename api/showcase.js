// The showcase: sites that asked to be listed (reveal(…, { showcase: true })) and that the owner approved.
// GET  /api/showcase  public: approved sites still active in the last 30 days, with the effects they use.
// POST /api/showcase  owner only (STATS_TOKEN as a bearer token): { site, status: 'approved' | 'hidden' | null }.
import { timingSafeEqual } from 'node:crypto';
import { configured, db } from './_db.js';

const STATUSES = new Set(['approved', 'hidden', 'requested']);

function authorised(req) {
  const want = process.env.STATS_TOKEN || '';
  const got = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!want || got.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(want));
}
const reply = (body, status = 200, cache = 'no-store') =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': cache } });

export async function GET() {
  if (!configured) return reply({ sites: [] }, 200);
  const sql = await db();
  const rows = await sql`
    select s.site,
           extract(epoch from s.first_seen) * 1000 as since,
           array(select distinct d.effect from wtd_daily d where d.site = s.site and d.effect <> 'unknown' order by 1) as effects
    from wtd_sites s
    where s.showcase = 'approved' and s.last_seen > now() - interval '30 days'
    order by s.loads desc
    limit 60`;
  return reply({ sites: rows.map((r) => ({ site: r.site, since: Number(r.since), effects: r.effects })) }, 200, 'public, s-maxage=300, stale-while-revalidate=600');
}

export async function POST(req) {
  if (!authorised(req)) return reply({ error: 'not allowed' }, 401);
  if (!configured) return reply({ error: 'database not connected' }, 503);
  let body = {};
  try { body = await req.json(); } catch { /* checked below */ }
  const site = typeof body.site === 'string' ? body.site.toLowerCase() : '';
  const status = body.status === null ? null : STATUSES.has(body.status) ? body.status : undefined;
  if (!site || status === undefined) return reply({ error: 'need a site and a status' }, 400);
  const sql = await db();
  const done = await sql`update wtd_sites set showcase = ${status} where site = ${site} returning site, showcase`;
  return done.length ? reply(done[0]) : reply({ error: 'no such site' }, 404);
}
