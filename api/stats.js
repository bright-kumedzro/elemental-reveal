// GET /api/stats: adoption numbers for the dashboard at /stats. Needs the STATS_TOKEN as a bearer token.
import { timingSafeEqual } from 'node:crypto';
import { configured, db } from './_db.js';

function authorised(req) {
  const want = process.env.STATS_TOKEN || '';
  const got = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!want || got.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

export async function GET(req) {
  const headers = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' };
  if (!authorised(req)) return new Response(JSON.stringify({ error: 'unauthorised' }), { status: 401, headers });
  if (!configured) return new Response(JSON.stringify({ error: 'database not connected' }), { status: 503, headers });

  const sql = await db();
  const [[totals], daily, effects, versions, sites] = await Promise.all([
    sql`
      with active7 as (select distinct site from wtd_daily where day > current_date - 7),
           cohort as (select site from wtd_sites where first_seen <= now() - interval '28 days')
      select
        (select count(*)::int from wtd_sites) as sites,
        (select count(*)::int from active7) as active7,
        (select count(distinct site)::int from wtd_daily where day > current_date - 30) as active30,
        (select count(*)::int from wtd_sites where first_seen > now() - interval '7 days') as new7,
        (select count(*)::int from cohort) as cohort28,
        (select count(*)::int from cohort where site in (select site from active7)) as retained28,
        (select coalesce(sum(loads), 0)::bigint from wtd_sites) as loads`,
    sql`
      select to_char(d, 'YYYY-MM-DD') as day,
             count(distinct w.site)::int as sites,
             coalesce(sum(w.loads), 0)::int as loads
      from generate_series(current_date - 29, current_date, interval '1 day') as d
      left join wtd_daily w on w.day = d::date
      group by d order by d`,
    sql`select effect as k, sum(loads)::int as v from wtd_daily group by effect`,
    sql`select version as k, sum(loads)::int as v from wtd_daily group by version`,
    sql`
      select s.site, s.loads::int as loads,
             extract(epoch from s.first_seen) * 1000 as first,
             extract(epoch from s.last_seen) * 1000 as last,
             exists(select 1 from wtd_daily w where w.site = s.site and w.day > current_date - 7) as active7
      from wtd_sites s order by s.loads desc limit 100`,
  ]);

  const kv = (rows) => Object.fromEntries(rows.map((r) => [r.k, r.v]));
  return new Response(JSON.stringify({
    generatedAt: Date.now(),
    totals: {
      sites: totals.sites, active7: totals.active7, active30: totals.active30, new7: totals.new7,
      cohort28: totals.cohort28, retention28: totals.cohort28 ? totals.retained28 / totals.cohort28 : null,
      loads: Number(totals.loads),
    },
    daily,
    effects: kv(effects),
    versions: kv(versions),
    sites: sites.map((s) => ({ ...s, first: Number(s.first), last: Number(s.last) })),
  }), { status: 200, headers });
}
