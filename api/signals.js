// GET /api/signals: adoption signals from outside the ping, gathered server-side and cached for an hour, so the
// stats page never runs into anyone's rate limit. Each source is best-effort: one that doesn't answer is null.
// It counts both packages: @brightkumedzro/reveal and the @brightkumedzro/elemental-reveal it grew from.
const PKGS = ['@brightkumedzro/reveal', '@brightkumedzro/elemental-reveal'];
const REPO = 'bright-kumedzro/elemental-reveal';

async function json(url, headers = {}) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'reveal-stats', ...headers }, signal: AbortSignal.timeout(5000) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}
const iso = (d) => d.toISOString().slice(0, 10);

/* npm: downloads per week (Monday to Sunday) for the last 12 weeks, both packages added up, plus the dependents
   count from npm search (only a maintainer search reports it). A package npm doesn't know yet counts as zero. */
async function npm() {
  const end = new Date(), start = new Date(end - 84 * 864e5);
  const [ranges, search] = await Promise.all([
    Promise.all(PKGS.map((p) => json(`https://api.npmjs.org/downloads/range/${iso(start)}:${iso(end)}/${p}`))),
    json('https://registry.npmjs.org/-/v1/search?text=maintainer:brightkumedzro&size=50'),
  ]);
  const days = new Map();
  for (const r of ranges) for (const d of r?.downloads || []) days.set(d.day, (days.get(d.day) || 0) + d.downloads);
  if (!days.size) return null;
  const weeks = [];
  for (const [dayStr, n] of [...days].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const day = new Date(dayStr + 'T00:00:00Z'), monday = iso(new Date(day - ((day.getUTCDay() + 6) % 7) * 864e5));
    if (!weeks.length || weeks.at(-1).week !== monday) weeks.push({ week: monday, downloads: 0 });
    weeks.at(-1).downloads += n;
  }
  // the first few days after a release are mostly registry mirrors and security scanners fetching the new version
  const hits = (search?.objects || []).filter((o) => PKGS.includes(o.package?.name));
  const dependents = hits.length ? hits.reduce((s, o) => s + (typeof o.dependents === 'number' ? o.dependents : 0), 0) : null;
  return { weeks, dependents };
}

/* jsDelivr: files served from the CDN per day, last 30 days, both packages added up: pages loading it with no
   build step. */
async function jsdelivr() {
  const all = await Promise.all(PKGS.map((p) => json(`https://data.jsdelivr.com/v1/stats/packages/npm/${p}?period=month`)));
  const days = new Map();
  let total = 0, any = false;
  for (const d of all) {
    if (!d?.hits?.dates) continue;
    any = true;
    total += d.hits.total ?? 0;
    for (const [day, hits] of Object.entries(d.hits.dates)) days.set(day, (days.get(day) || 0) + hits);
  }
  return any ? { total, daily: [...days].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([day, hits]) => ({ day, hits })) } : null;
}

/* GitHub: stars, forks and open issues on the repo. */
async function github() {
  const r = await json(`https://api.github.com/repos/${REPO}`, { Accept: 'application/vnd.github+json' });
  return r ? { stars: r.stargazers_count, forks: r.forks_count, issues: r.open_issues_count, url: r.html_url } : null;
}

export async function GET() {
  const [n, j, g] = await Promise.all([npm(), jsdelivr(), github()]);
  return new Response(JSON.stringify({ generatedAt: Date.now(), packages: PKGS, npm: n, jsdelivr: j, github: g }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
    },
  });
}
