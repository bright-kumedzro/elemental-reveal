// POST /api/count: anonymous counts for this website only (never the npm package, which sends nothing).
// Adds 1 to an event's count for today. GET returns the totals, the ten most viewed pages, and with ?days=N a daily
// series of visits plus where visits came from. Nothing personal is stored: no IPs, no cookies, no user agents.
// Two small tables, created on first use and kept apart from the wtd_* ones:
//   site_counts(day, event, n)   one row per day and event
//   site_sources(src, n)         visits by where they came from
import { configured, db } from './_db.js';

// every page of the site that carries the tracker: keep in step with scripts/pages.mjs (scripts/count-test.mjs checks it)
export const PAGES = [
  'home', 'elemental', 'shinobi', 'paper', 'scroll', 'use', 'stats', 'sound-lab',
  'fire', 'water', 'air', 'earth', 'lightning', 'frost', 'snow',
  'clone', 'vortex', 'spiral', 'blade', 'storm', 'twister', 'magma', 'shuriken',
  'curl', 'fold', 'draw',
];
const EVENTS = ['visit', 'copy', ...PAGES.map((p) => `view:${p}`)];
const SOURCES = ['linkedin', 'whatsapp', 'x', 'facebook', 'instagram', 'google', 'share', 'portfolio', 'github', 'direct', 'other'];
const BOT = /bot|crawl|spider|slurp|headless|preview|facebookexternalhit|whatsapp\/|linkedinbot|embedly|monitor|curl|wget|python|axios|node-fetch/i;

let override = null, ready = null;
export function __setSql(fn) { override = fn; ready = null; }   // tests swap in a stand-in
async function store() {
  const sql = override || await db();
  ready ??= Promise.all([
    sql`create table if not exists site_counts (day date not null, event text not null, n bigint not null default 0, primary key (day, event))`,
    sql`create table if not exists site_sources (src text primary key, n bigint not null default 0)`,
  ]).catch((e) => { ready = null; throw e; });
  await ready;
  return sql;
}
const day = (d = new Date()) => d.toISOString().slice(0, 10);
const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra } });

export async function POST(req) {
  if (!configured && !override) return json({ error: 'counter not configured' }, 503);
  if (BOT.test(req.headers.get('user-agent') || '')) return new Response(null, { status: 204 });
  let body = null;
  try { body = JSON.parse(await req.text()); } catch { /* refused below */ }
  const e = body?.e, src = SOURCES.includes(body?.src) ? body.src : null;
  if (!EVENTS.includes(e)) return json({ error: 'unknown event' }, 400);
  try {
    const q = await store(), d = day();
    await q`insert into site_counts (day, event, n) values (${d}, ${e}, 1) on conflict (day, event) do update set n = site_counts.n + 1`;
    if (e === 'visit' && src) await q`insert into site_sources (src, n) values (${src}, 1) on conflict (src) do update set n = site_sources.n + 1`;
  } catch { return json({ error: 'store unavailable' }, 502); }
  return new Response(null, { status: 204 });
}

export async function GET(req) {
  if (!configured && !override) return json({ error: 'counter not configured' }, 503);
  try {
    const q = await store();
    const rows = await q`select event, sum(n)::bigint as n from site_counts group by event`;
    const t = Object.fromEntries(rows.map((r) => [r.event, +r.n]));
    const out = {
      totals: { visit: t.visit || 0, copy: t.copy || 0 },
      pages: PAGES.map((p) => ({ page: p, n: t[`view:${p}`] || 0 })).filter((r) => r.n > 0).sort((a, b) => b.n - a.n).slice(0, 10),
    };
    const days = Math.min(90, Math.max(0, parseInt(new URL(req.url).searchParams.get('days'), 10) || 0));
    if (days) {
      const dates = [...Array(days)].map((_, i) => day(new Date(Date.now() - (days - 1 - i) * 864e5)));
      const recent = await q`select to_char(day, 'YYYY-MM-DD') as day, event, n from site_counts where day >= ${dates[0]} and event = 'visit'`;
      out.daily = dates.map((d) => ({ date: d, visit: +(recent.find((r) => r.day === d)?.n || 0) }));
      const srcs = await q`select src, n from site_sources`;
      out.sources = Object.fromEntries(SOURCES.map((s) => [s, +(srcs.find((r) => r.src === s)?.n || 0)]));
    }
    return json(out, 200, { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' });
  } catch {
    return json({ error: 'store unavailable' }, 502);
  }
}
