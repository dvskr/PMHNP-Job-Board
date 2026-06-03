// SEO infra check: fetch live sitemaps via a real browser (passes Vercel challenge),
// count URLs, and verify unpublished jobs do NOT leak. See docs/AUDIT_RUNBOOK.md.
import { chromium } from 'playwright';
const BASE = process.env.AUDIT_BASE_URL || 'https://pmhnphiring.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ userAgent: UA });
const p = await ctx.newPage();
async function get(path) {
  const r = await p.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 40000 }).catch(e => ({ err: e.message }));
  if (r?.err) return { path, err: r.err };
  const body = await p.content();
  const locs = (body.match(/<loc>([^<]+)<\/loc>/g) || []).map(s => s.replace(/<\/?loc>/g, '').replace(BASE, ''));
  return { path, status: r.status(), locCount: locs.length, sitemapChildren: (body.match(/<sitemap>/g) || []).length, sample: locs.slice(0, 3) };
}
for (const u of ['/robots.txt', '/sitemap.xml', '/api/sitemaps/index', '/api/sitemaps/jobs/0', '/api/sitemaps/cities/0', '/image-sitemap.xml', '/video-sitemap.xml']) {
  console.log(JSON.stringify(await get(u)));
}
console.log('\nCHECK: /api/sitemaps/jobs/0 locCount MUST equal published-job count (db-analysis). If much higher → unpublished jobs are leaking into the sitemap.');
await b.close();
