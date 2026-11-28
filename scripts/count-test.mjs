// Tests api/count.js against an in-memory stand-in for its two Postgres tables. node scripts/count-test.mjs
const { POST, GET, PAGES, __setSql } = await import('../api/count.js');
const { ELEMENTS } = await import('./copy-elemental.mjs');
const { TECHNIQUES } = await import('./copy-shinobi.mjs');
const { PAPER } = await import('./copy-paper.mjs');
const counts = new Map(), sources = new Map(), seen = [];
const fake = async (strings, ...v) => {
  const q = strings.join('?').replace(/\s+/g, ' ');
  seen.push(q);
  if (q.startsWith('create table')) return [];
  if (q.startsWith('insert into site_counts')) { const k = `${v[0]}|${v[1]}`; counts.set(k, (counts.get(k) || 0) + 1); return []; }
  if (q.startsWith('insert into site_sources')) { sources.set(v[0], (sources.get(v[0]) || 0) + 1); return []; }
  if (q.startsWith('select event, sum(n)')) { const s = {}; for (const [k, n] of counts) { const e = k.split('|')[1]; s[e] = (s[e] || 0) + n; } return Object.entries(s).map(([event, n]) => ({ event, n: String(n) })); }
  if (q.startsWith("select to_char(day")) return [...counts].filter(([k]) => k.split('|')[0] >= v[0] && k.endsWith('|visit')).map(([k, n]) => ({ day: k.split('|')[0], event: 'visit', n: String(n) }));
  if (q.startsWith('select src, n')) return [...sources].map(([src, n]) => ({ src, n: String(n) }));
  throw new Error('unexpected query: ' + q);
};
__setSql(fake);
const post = async (body, ua = 'Mozilla/5.0 Chrome') => (await POST(new Request('http://x/api/count', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'user-agent': ua } }))).status;
const get = async (qs = '') => { const r = await GET(new Request('http://x/api/count' + qs)); return { status: r.status, body: await r.json() }; };
const ok = (cond, msg) => { console.log(cond ? 'ok  ' : 'FAIL', msg); if (!cond) process.exitCode = 1; };

const generated = ['home', 'elemental', 'shinobi', 'paper', 'scroll', 'use', 'stats', 'sound-lab', ...[...ELEMENTS, ...TECHNIQUES, ...PAPER].map((e) => e.id)];
ok(generated.length === PAGES.length && generated.every((p) => PAGES.includes(p)), `allowlist matches the pages the generator writes (${PAGES.length})`);

ok(await post('{"e":"visit","src":"linkedin"}') === 204, 'visit from LinkedIn (sendBeacon sends text)');
ok(await post({ e: 'visit', src: 'nonsense' }) === 204, 'unknown source: visit counted, source dropped');
for (let i = 0; i < 3; i++) await post({ e: 'view:fire' });
await post({ e: 'view:home' }); await post({ e: 'view:scroll' }); await post({ e: 'copy' });
ok(await post({ e: 'view:nonexistent' }) === 400, 'unknown page refused');
ok(await post({ e: 'hack' }) === 400, 'unknown events are refused');
ok(await post('not json') === 400, 'garbage is refused');
ok(await post({ e: 'visit' }, 'Googlebot/2.1') === 204, 'a bot gets 204...');
const g = await get();
ok(g.body.totals.visit === 2 && g.body.totals.copy === 1 && g.body.pages[0].page === 'fire' && g.body.pages[0].n === 3 && g.body.pages.length === 3, `...and isn't counted: ${JSON.stringify(g.body)}`);
for (const p of PAGES) await post({ e: `view:${p}` });
ok((await get()).body.pages.length === 10, 'top pages capped at ten');
const d = await get('?days=30');
ok(d.body.daily.length === 30 && d.body.daily.at(-1).visit === 2 && d.body.sources.linkedin === 1 && !('nonsense' in d.body.sources), 'daily series and sources');
ok(seen.filter((q) => q.startsWith('create')).length === 2, 'tables created once, on first use');
ok(seen.every((q) => !/wtd_|name|ip|agent|cookie/i.test(q)), 'no personal data in any statement; wtd_* untouched');
