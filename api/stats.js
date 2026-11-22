// GET /api/stats: adoption numbers for the dashboard at /stats. Needs the STATS_TOKEN as a bearer token.
import { timingSafeEqual } from 'node:crypto';
import { configured, pipeline, toObject } from './_redis.js';

const DAY_MS = 86400000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);

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

  const now = Date.now();
  const days = Array.from({ length: 30 }, (_, i) => iso(now - (29 - i) * DAY_MS));
  const res = await pipeline([
    ['HGETALL', 'wtd:first'], ['HGETALL', 'wtd:last'], ['HGETALL', 'wtd:loads'],
    ['HGETALL', 'wtd:effects'], ['HGETALL', 'wtd:versions'],
    ...days.map((d) => ['SMEMBERS', `wtd:day:${d}`]),
    ...days.map((d) => ['GET', `wtd:dayloads:${d}`]),
  ]);
  const [first, last, loads, effects, versions] = res.slice(0, 5).map(toObject);
  const daySites = res.slice(5, 35).map((m) => new Set(m || []));
  const dayLoads = res.slice(35, 65).map((n) => Number(n) || 0);

  const union = (sets) => { const u = new Set(); sets.forEach((s) => s.forEach((x) => u.add(x))); return u; };
  const active7 = union(daySites.slice(-7)), active30 = union(daySites);
  const sites = Object.keys(first);
  const age = (s) => now - Number(first[s]);
  const new7 = sites.filter((s) => age(s) < 7 * DAY_MS);
  // retention: of the sites that first loaded it 4+ weeks ago, how many still loaded it this week
  const cohort = sites.filter((s) => age(s) >= 28 * DAY_MS);
  const retained = cohort.filter((s) => active7.has(s));

  const top = sites
    .map((s) => ({ site: s, loads: Number(loads[s]) || 0, first: Number(first[s]), last: Number(last[s]) || null, active7: active7.has(s) }))
    .sort((a, b) => b.loads - a.loads)
    .slice(0, 100);

  return new Response(JSON.stringify({
    generatedAt: now,
    totals: {
      sites: sites.length,
      active7: active7.size,
      active30: active30.size,
      new7: new7.length,
      retention28: cohort.length ? retained.length / cohort.length : null,
      cohort28: cohort.length,
      loads: Object.values(loads).reduce((a, n) => a + Number(n), 0),
    },
    daily: days.map((d, i) => ({ day: d, sites: daySites[i].size, loads: dayLoads[i] })),
    effects: Object.fromEntries(Object.entries(effects).map(([k, v]) => [k, Number(v)])),
    versions: Object.fromEntries(Object.entries(versions).map(([k, v]) => [k, Number(v)])),
    sites: top,
  }), { status: 200, headers });
}
