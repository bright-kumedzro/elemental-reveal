// GET /api/signals: adoption signals from outside the ping, gathered server-side and cached for an hour, so the
// stats page never runs into anyone's rate limit. Each source is best-effort: one that doesn't answer is null.
const PKG = '@brightkumedzro/elemental-reveal';
const REPO = 'bright-kumedzro/elemental-reveal';

async function json(url, headers = {}) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'elemental-reveal-stats', ...headers }, signal: AbortSignal.timeout(5000) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}
const iso = (d) => d.toISOString().slice(0, 10);

/* npm: downloads per week (Monday to Sunday) for the last 12 weeks, plus the dependents count from npm search. */
async function npm() {
  const end = new Date(), start = new Date(end - 84 * 864e5);
  const [range, search] = await Promise.all([
    json(`https://api.npmjs.org/downloads/range/${iso(start)}:${iso(end)}/${PKG}`),
    json(`https://registry.npmjs.org/-/v1/search?text=maintainer:brightkumedzro&size=50`),   // only a maintainer search reports dependents
  ]);
  if (!range?.downloads) return null;
  const weeks = [];
  for (const d of range.downloads) {
    const day = new Date(d.day + 'T00:00:00Z'), monday = iso(new Date(day - ((day.getUTCDay() + 6) % 7) * 864e5));
    if (!weeks.length || weeks.at(-1).week !== monday) weeks.push({ week: monday, downloads: 0 });
    weeks.at(-1).downloads += d.downloads;
  }
  // the first few days after a release are mostly registry mirrors and security scanners fetching the new version
  const hit = search?.objects?.find((o) => o.package?.name === PKG);
  return { weeks, dependents: typeof hit?.dependents === 'number' ? hit.dependents : null };
}

/* jsDelivr: files served from the CDN per day, last 30 days. That's pages loading it with no build step. */
async function jsdelivr() {
  const d = await json(`https://data.jsdelivr.com/v1/stats/packages/npm/${PKG}?period=month`);
  const dates = d?.hits?.dates;
  if (!dates) return null;
  return { total: d.hits.total ?? 0, daily: Object.entries(dates).map(([day, hits]) => ({ day, hits })) };
}

/* GitHub: stars, forks and open issues on the repo. */
async function github() {
  const r = await json(`https://api.github.com/repos/${REPO}`, { Accept: 'application/vnd.github+json' });
  return r ? { stars: r.stargazers_count, forks: r.forks_count, issues: r.open_issues_count, url: r.html_url } : null;
}

export async function GET() {
  const [n, j, g] = await Promise.all([npm(), jsdelivr(), github()]);
  return new Response(JSON.stringify({ generatedAt: Date.now(), npm: n, jsdelivr: j, github: g }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
    },
  });
}
