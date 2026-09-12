import { test, expect, type Page, type APIRequestContext, type Response } from '@playwright/test';
import { attachErrorCollectors, assertClean, type Collected } from './_helpers';

/**
 * Hunt slice: SEO surface crawl and console hygiene (run tag h0902).
 *
 * Journey: a crawler (Googlebot, an AI fetcher, a feed reader) discovers the
 * site through robots.txt, the sitemap index, the RSS/aggregator feeds and
 * llms.txt, then walks the advertised URLs. Every advertised page must be a
 * real 200 with exactly one H1, a self canonical, title + description, a
 * working OG image, parseable JSON-LD, clean visible text and no runtime
 * errors. Invalid or retired URLs must answer a clean 404/410 (never 5xx),
 * duplicates must redirect, and the core surfaces must SSR without JS.
 *
 * Sub-journeys:
 *   1. machine-readable surfaces (robots, sitemaps, feeds, llms, csv)
 *   2. page audit of the most important static pages
 *   3. page audit of sitemap-sourced URLs (states, metros, categories, cities,
 *      salary guide, tools, blog, companies)
 *   4. redirects and canonical/pagination rules
 *   5. invalid URL handling (410 / 404 / shortlink / widget)
 *   6. job-detail lifecycle (live vs expired) and JobPosting JSON-LD
 *   7. SSR with JavaScript disabled
 *   8. user-facing copy rules (collected across the crawl, asserted once)
 *
 * All tests are read-only. Copy-rule violations found during the crawl are
 * recorded and asserted by the final test so a copy nit never masks a real
 * runtime defect on the same page.
 */

const BASE = (process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const AGAINST_PROD = !!process.env.PLAYWRIGHT_BASE_URL && process.env.PLAYWRIGHT_BASE_URL.includes('pmhnphiring.com');
const UUID_RE = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i;
const JOB_URL_RE = /\/jobs\/[a-z0-9-]*[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const NAV_TIMEOUT = 80_000;

// Copy rules for this product (reported as low severity, asserted once at the end).
const COPY_RULES: Array<{ name: string; re: RegExp }> = [
  { name: 'em dash', re: /\u2014/ },
  { name: 'en dash', re: /\u2013/ },
  { name: 'word "founder"', re: /\bfounders?\b/i },
  { name: 'name "Pavan"', re: /\bPavan\b/ },
];
const copyViolations: string[] = [];

// ── helpers ─────────────────────────────────────────────────────────────────

/** Rewrite the production host (hard-coded in canonicals / OG urls) onto the test origin. */
function localize(url: string): string {
  const u = new URL(url, BASE);
  if (/(^|\.)pmhnphiring\.com$/i.test(u.hostname) || /^localhost$/i.test(u.hostname)) {
    const b = new URL(BASE);
    u.protocol = b.protocol;
    u.host = b.host;
  }
  return u.toString();
}

function pathAndQuery(url: string): string {
  const u = new URL(url, BASE);
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach((k) => u.searchParams.delete(k));
  const q = u.searchParams.toString();
  return decodeURIComponent(u.pathname) + (q ? `?${q}` : '');
}

async function parseXml(page: Page, xml: string): Promise<{ error: string | null; locs: string[] }> {
  return page.evaluate((text) => {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    const err = doc.querySelector('parsererror');
    const locs = Array.from(doc.getElementsByTagName('loc')).map((n) => n.textContent || '');
    return { error: err ? (err.textContent || 'parsererror') : null, locs };
  }, xml);
}

function recordCopy(path: string, text: string) {
  for (const rule of COPY_RULES) {
    const m = rule.re.exec(text);
    if (m) {
      const start = Math.max(0, m.index - 40);
      const snippet = text.slice(start, m.index + 40).replace(/\s+/g, ' ');
      copyViolations.push(`${path}: ${rule.name} -> "...${snippet}..."`);
    }
  }
}

function salaryStringsFor(n: number, unit: string): string[] {
  if (unit === 'HOUR') return [`$${n}`, `$${n.toLocaleString('en-US')}`];
  return [`$${Math.round(n / 1000)}k`, `$${n.toLocaleString('en-US')}`, `$${(n / 1000).toFixed(1)}k`];
}

function validateJobPosting(jp: Record<string, unknown>, visibleText: string): string[] {
  const errs: string[] = [];
  if (!jp.title) errs.push('missing title');
  const posted = typeof jp.datePosted === 'string' ? Date.parse(jp.datePosted) : NaN;
  if (Number.isNaN(posted)) errs.push(`bad datePosted ${String(jp.datePosted)}`);
  if (jp.validThrough !== undefined) {
    const through = typeof jp.validThrough === 'string' ? Date.parse(jp.validThrough) : NaN;
    if (Number.isNaN(through)) errs.push(`bad validThrough ${String(jp.validThrough)}`);
    else if (!Number.isNaN(posted) && through <= posted) errs.push(`validThrough (${jp.validThrough}) not after datePosted (${jp.datePosted})`);
  }
  const org = jp.hiringOrganization as { name?: string } | undefined;
  if (!org || !org.name) errs.push('missing hiringOrganization.name');
  if (!jp.jobLocation && !jp.applicantLocationRequirements) errs.push('neither jobLocation nor applicantLocationRequirements');
  const base = jp.baseSalary as { value?: Record<string, unknown> } | undefined;
  if (base && base.value) {
    const v = base.value;
    const unit = String(v.unitText || 'YEAR');
    const nums = [v.minValue, v.maxValue, v.value].filter((n): n is number => typeof n === 'number');
    if (nums.length === 0) errs.push('baseSalary.value has no numeric bounds');
    const lower = visibleText.toLowerCase();
    for (const n of nums) {
      const ok = salaryStringsFor(n, unit).some((s) => lower.includes(s.toLowerCase()));
      if (!ok) errs.push(`baseSalary ${n} ${unit} not visible on the page (expected one of ${salaryStringsFor(n, unit).join(' | ')})`);
    }
  }
  return errs;
}

interface AuditOptions {
  /** Expected canonical path+query. Defaults to the requested path. */
  canonical?: string;
  /** Sitemap-advertised pages must not be noindexed. */
  mustBeIndexable?: boolean;
}

interface AuditResult {
  collected: Collected;
  ld: Record<string, unknown>[];
  bodyText: string;
}

/**
 * Full crawler-eye audit of one page. Fails with the concrete defect in the
 * assertion message. Collected console/5xx errors are asserted last so a
 * metadata problem does not hide a runtime problem (and vice versa).
 */
async function auditPage(page: Page, request: APIRequestContext, path: string, opts: AuditOptions = {}): Promise<AuditResult> {
  page.setDefaultNavigationTimeout(NAV_TIMEOUT);
  const collected = attachErrorCollectors(page);
  const res = await page.goto(path, { waitUntil: 'domcontentloaded' });
  expect(res, `${path}: no response`).not.toBeNull();
  expect(res!.status(), `${path}: expected HTTP 200, got ${res!.status()}`).toBe(200);
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);

  const problems: string[] = [];

  // Exactly one H1
  const h1Count = await page.locator('h1').count();
  if (h1Count !== 1) {
    const h1s = await page.locator('h1').allInnerTexts();
    problems.push(`expected exactly one <h1>, found ${h1Count}: ${JSON.stringify(h1s)}`);
  }

  // Title + description
  const title = await page.title();
  if (!title.trim()) problems.push('empty <title>');
  if (/Page Not Found|404/i.test(title)) problems.push(`title looks like an error page: "${title}"`);
  if (/\| PMHNP Hiring \| PMHNP Hiring/.test(title)) problems.push(`title carries the brand suffix twice: "${title}"`);
  const description = await page.locator('meta[name="description"]').first().getAttribute('content');
  if (!description || !description.trim()) problems.push('missing meta description');

  // Canonical
  const canonicals = page.locator('link[rel="canonical"]');
  const canonicalCount = await canonicals.count();
  if (canonicalCount !== 1) {
    problems.push(`expected exactly one canonical, found ${canonicalCount}`);
  } else {
    const href = (await canonicals.first().getAttribute('href')) || '';
    const expected = opts.canonical ?? pathAndQuery(path);
    if (!href) problems.push('canonical href is empty');
    else if (pathAndQuery(href) !== expected) problems.push(`canonical "${href}" does not match expected path "${expected}"`);
  }

  // Robots
  const robots = (await page.locator('meta[name="robots"]').first().getAttribute('content').catch(() => null)) || '';
  const xRobots = res!.headers()['x-robots-tag'] || '';
  if (opts.mustBeIndexable && (/noindex/i.test(robots) || /noindex/i.test(xRobots))) {
    problems.push(`page is advertised in the sitemap but noindexed (meta="${robots}" header="${xRobots}")`);
  }

  // OG image resolves to an image
  const ogImage = await page.locator('meta[property="og:image"]').first().getAttribute('content');
  if (!ogImage) {
    problems.push('missing og:image');
  } else {
    const target = localize(ogImage);
    const img = await request.get(target, { timeout: 60_000, maxRedirects: 3 }).catch((e: Error) => e);
    if (img instanceof Error) problems.push(`og:image ${target} failed: ${img.message}`);
    else {
      const ct = img.headers()['content-type'] || '';
      if (img.status() !== 200 || !ct.startsWith('image/')) problems.push(`og:image ${target} -> ${img.status()} ${ct}`);
    }
  }

  // JSON-LD
  const ldTexts = await page.locator('script[type="application/ld+json"]').allTextContents();
  const ld: Record<string, unknown>[] = [];
  ldTexts.forEach((t, i) => {
    try {
      const parsed = JSON.parse(t);
      const list = Array.isArray(parsed) ? parsed : parsed['@graph'] ? parsed['@graph'] : [parsed];
      ld.push(...list);
    } catch (e) {
      problems.push(`ld+json block #${i} does not parse: ${(e as Error).message}; starts with ${t.slice(0, 80)}`);
    }
  });

  // Visible text hygiene
  const bodyText = await page.locator('body').innerText();
  const leak = /\b(undefined|NaN|null|\[object Object\])\b/.exec(bodyText);
  if (leak) problems.push(`visible text contains "${leak[0]}" near "...${bodyText.slice(Math.max(0, leak.index - 40), leak.index + 40).replace(/\s+/g, ' ')}..."`);
  const fffd = bodyText.indexOf('\uFFFD');
  if (fffd >= 0) problems.push(`visible text contains U+FFFD near "...${bodyText.slice(Math.max(0, fffd - 40), fffd + 40)}..."`);
  recordCopy(path, bodyText);
  recordCopy(`${path} <title>`, title);
  if (description) recordCopy(`${path} <meta description>`, description);

  for (const item of ld) {
    if (item['@type'] === 'JobPosting') {
      const errs = validateJobPosting(item, bodyText);
      if (errs.length) problems.push(`JobPosting JSON-LD: ${errs.join('; ')}`);
    }
  }

  expect(problems, `${path}: SEO defects:\n  ${problems.join('\n  ')}`).toEqual([]);
  assertClean(collected, path);
  return { collected, ld, bodyText };
}

async function fetchText(request: APIRequestContext, path: string): Promise<{ res: import('@playwright/test').APIResponse; text: string }> {
  const res = await request.get(localize(path), { timeout: 120_000, maxRedirects: 0 });
  const text = await res.text();
  return { res, text };
}

function statusAndLocation(res: import('@playwright/test').APIResponse): string {
  return `${res.status()} location=${res.headers()['location'] || ''}`;
}

// ── 1. Machine-readable surfaces ────────────────────────────────────────────

test.describe('machine-readable SEO surfaces', () => {
  test('robots.txt is well-formed and points at every sitemap', async ({ request }) => {
    const { res, text } = await fetchText(request, '/robots.txt');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toMatch(/text\/plain/);
    expect(text).toMatch(/User-Agent:\s*\*/i);
    expect(text).toMatch(/Sitemap:\s*\S+\/api\/sitemaps\/index/i);
    expect(text).toMatch(/Sitemap:\s*\S+\/sitemap\.xml/i);
    expect(text).toMatch(/Sitemap:\s*\S+\/image-sitemap\.xml/i);
    expect(text).toMatch(/Sitemap:\s*\S+\/video-sitemap\.xml/i);
    expect(text).toMatch(/Allow:\s*\/api\/sitemaps/i);
    expect(text).toMatch(/Disallow:\s*\/api\//i);
    expect(text).not.toMatch(/User-Agent:\s*\*\s*\nDisallow:\s*\/\s*$/im);
    // Auth pages must be re-blocked after the P2.3 window (prior finding: AUTH_REBLOCK_DATE expired).
    expect(text, 'robots.txt should disallow /login for the catch-all agent').toMatch(/Disallow:\s*\/login/);
  });

  test('sitemap.xml parses and advertises the core surfaces', async ({ request, page }) => {
    const { res, text } = await fetchText(request, '/sitemap.xml');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toMatch(/xml/);
    const { error, locs } = await parseXml(page, text);
    expect(error, 'sitemap.xml must parse as XML').toBeNull();
    expect(locs.length).toBeGreaterThan(50);
    const paths = locs.map((l) => new URL(l).pathname);
    for (const must of ['/', '/jobs', '/blog', '/salary-guide', '/jobs/remote', '/jobs/locations', '/tools']) {
      expect(paths, `sitemap should advertise ${must}`).toContain(must);
    }
    // No duplicate <loc>, no redirecting shapes (trailing slash / uppercase / page param)
    expect(new Set(locs).size, 'duplicate <loc> entries in sitemap').toBe(locs.length);
    const bad = locs.filter((l) => /\/$/.test(new URL(l).pathname) && new URL(l).pathname !== '/' || /[A-Z]/.test(new URL(l).pathname) || /\?/.test(l));
    expect(bad, 'sitemap advertises redirecting URL shapes').toEqual([]);
    const badHost = locs.filter((l) => !l.startsWith(BASE) && !/pmhnphiring\.com/.test(l));
    expect(badHost, 'sitemap <loc> entries on an unexpected host').toEqual([]);
  });

  test('sitemap index lists children that all resolve to parseable XML', async ({ request, page }) => {
    const { res, text } = await fetchText(request, '/api/sitemaps/index');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toMatch(/xml/);
    const { error, locs } = await parseXml(page, text);
    expect(error).toBeNull();
    expect(locs.length).toBeGreaterThanOrEqual(2);
    expect(text).toContain('<sitemapindex');
    for (const loc of locs) {
      const child = await request.get(localize(loc), { timeout: 120_000 });
      expect(child.status(), `child sitemap ${loc}`).toBe(200);
      expect(child.headers()['content-type'], `child sitemap ${loc}`).toMatch(/xml/);
      const parsed = await parseXml(page, await child.text());
      expect(parsed.error, `child sitemap ${loc} must parse`).toBeNull();
    }
  });

  test('job and city sitemap batches parse and reject invalid batch indexes', async ({ request, page }) => {
    for (const path of ['/api/sitemaps/jobs/0', '/api/sitemaps/cities/0']) {
      const { res, text } = await fetchText(request, path);
      expect(res.status(), path).toBe(200);
      expect(res.headers()['content-type'], path).toMatch(/xml/);
      const { error, locs } = await parseXml(page, text);
      expect(error, `${path} must parse`).toBeNull();
      const notJobShaped = path.includes('/jobs/') ? locs.filter((l) => !JOB_URL_RE.test(new URL(l).pathname)) : [];
      expect(notJobShaped, 'job sitemap must only contain /jobs/<slug>-<uuid> URLs').toEqual([]);
    }
    for (const path of ['/api/sitemaps/jobs/9999', '/api/sitemaps/cities/9999', '/api/sitemaps/jobs/abc', '/api/sitemaps/cities/-1']) {
      const res = await request.get(localize(path), { timeout: 120_000 });
      expect(res.status(), path).toBe(404);
    }
  });

  test('job sitemap agrees with the public listing about whether live jobs exist', async ({ request, page }) => {
    // If the public /jobs listing shows jobs, the job sitemap must advertise
    // at least one of them; an empty job sitemap next to a populated listing
    // means the two surfaces disagree on what is live.
    const listing = await fetchText(request, '/api/jobs?limit=5');
    expect(listing.res.status()).toBe(200);
    const listed: { jobs?: Array<{ id: string }> } = JSON.parse(listing.text);
    const listedCount = listed.jobs?.length ?? 0;
    const { text } = await fetchText(request, '/api/sitemaps/jobs/0');
    const { locs } = await parseXml(page, text);
    if (listedCount === 0) test.skip(true, 'no jobs in the public listing');
    expect(
      locs.length,
      `public listing returns ${listedCount} jobs but /api/sitemaps/jobs/0 advertises ${locs.length} URLs (listing and sitemap disagree on live inventory)`,
    ).toBeGreaterThan(0);
  });

  test('image and video sitemaps parse', async ({ request, page }) => {
    const img = await fetchText(request, '/image-sitemap.xml');
    expect(img.res.status()).toBe(200);
    expect(img.res.headers()['content-type']).toMatch(/xml/);
    const imgParsed = await parseXml(page, img.text);
    expect(imgParsed.error).toBeNull();
    expect(imgParsed.locs.length).toBeGreaterThan(0);
    expect(imgParsed.locs.every((l) => /^https?:\/\//.test(l)), 'image sitemap locs must be absolute').toBe(true);

    const vid = await fetchText(request, '/video-sitemap.xml');
    expect(vid.res.status()).toBe(200);
    expect(vid.res.headers()['content-type']).toMatch(/xml/);
    const vidParsed = await parseXml(page, vid.text);
    expect(vidParsed.error).toBeNull();
    expect(vid.text).toContain('<urlset');
  });

  test('RSS and aggregator feeds parse with the right content type', async ({ request, page }) => {
    const rss = await fetchText(request, '/feed.xml');
    expect(rss.res.status()).toBe(200);
    expect(rss.res.headers()['content-type']).toMatch(/rss\+xml|xml/);
    const rssParsed = await parseXml(page, rss.text);
    expect(rssParsed.error, '/feed.xml must parse').toBeNull();
    expect(rss.text).toContain('<rss');
    expect(rss.text).toMatch(/<atom:link[^>]+rel="self"/);

    const agg = await fetchText(request, '/feeds/jobs.xml');
    expect(agg.res.status()).toBe(200);
    expect(agg.res.headers()['content-type']).toMatch(/xml/);
    const aggParsed = await parseXml(page, agg.text);
    expect(aggParsed.error, '/feeds/jobs.xml must parse').toBeNull();
    expect(agg.text).toContain('<source>');

    const blog = await fetchText(request, '/blog/feed.xml');
    expect(blog.res.status()).toBe(200);
    expect(blog.res.headers()['content-type']).toMatch(/rss\+xml/);
    const blogParsed = await parseXml(page, blog.text);
    expect(blogParsed.error, '/blog/feed.xml must parse').toBeNull();
    expect((blog.text.match(/<item>/g) || []).length, 'blog feed should carry items').toBeGreaterThan(0);
    const blogLinks = Array.from(blog.text.matchAll(/<link>([^<]+)<\/link>/g)).map((m) => m[1]);
    expect(blogLinks.filter((l) => /\/blog\/[^/]+$/.test(l)).length).toBeGreaterThan(0);
  });

  test('llms.txt and llms-full.txt are plain text with absolute links', async ({ request }) => {
    for (const path of ['/llms.txt', '/llms-full.txt']) {
      const { res, text } = await fetchText(request, path);
      expect(res.status(), path).toBe(200);
      expect(res.headers()['content-type'], path).toMatch(/text\/plain/);
      expect(text, path).toMatch(/^# PMHNP Hiring/m);
      expect(text, path).not.toContain('\uFFFD');
      // llms.txt uses markdown links; llms-full.txt lists bare URLs. Either
      // way every link must be absolute so an AI fetcher can follow it.
      const mdLinks = Array.from(text.matchAll(/\]\(([^)]+)\)/g)).map((m) => m[1]);
      const bareUrls = Array.from(text.matchAll(/https?:\/\/[^\s)]+/g)).map((m) => m[0]);
      expect(mdLinks.length + bareUrls.length, `${path} should contain links`).toBeGreaterThan(3);
      expect(mdLinks.filter((l) => !/^https?:\/\//.test(l)), `${path} markdown links must be absolute`).toEqual([]);
      expect(text, `${path} must not leak the dev origin`).not.toMatch(/localhost:\d+/);
      expect(text, `${path} must not leak placeholder values`).not.toMatch(/\b(undefined|NaN|null)\b/);
      recordCopy(path, text);
    }
  });

  test('advertised salary CSV is well-formed', async ({ request }) => {
    const { res, text } = await fetchText(request, '/data/pmhnp-advertised-salaries.csv');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toMatch(/text\/csv/);
    const lines = text.trim().split('\n');
    expect(lines[0]).toBe('state,sample_size_n,median_advertised_annual_usd,p25_advertised_annual_usd,p75_advertised_annual_usd');
    expect(lines.length, 'CSV should carry at least one state row').toBeGreaterThan(1);
    for (const line of lines.slice(1)) {
      const cells = line.split(',');
      expect(cells.length, `row "${line}" must have 5 cells`).toBe(5);
      expect(cells[0].trim().length, `row "${line}" state must not be empty`).toBeGreaterThan(0);
      expect(Number(cells[1]), `row "${line}" sample size must be a positive integer`).toBeGreaterThan(0);
      expect(Number(cells[2]), `row "${line}" median must be a positive number`).toBeGreaterThan(0);
      for (const c of cells.slice(3)) if (c !== '') expect(Number.isFinite(Number(c)), `row "${line}" p25/p75 must be numeric or blank`).toBe(true);
    }
  });
});

// ── 2. Static page audit ────────────────────────────────────────────────────

const STATIC_PAGES: Array<{ path: string; canonical?: string }> = [
  { path: '/' },
  { path: '/jobs' },
  { path: '/blog' },
  { path: '/companies' },
  { path: '/salary-guide' },
  { path: '/tools' },
  { path: '/resources' },
  { path: '/about' },
  { path: '/faq' },
  { path: '/contact' },
  { path: '/pricing' },
  { path: '/post-job' },
  { path: '/for-employers' },
  { path: '/for-job-seekers' },
  { path: '/for-programs' },
  { path: '/terms' },
  { path: '/privacy' },
  { path: '/security' },
  { path: '/sub-processors' },
  { path: '/do-not-sell' },
  { path: '/data-request' },
  { path: '/job-alerts' },
  { path: '/jobs/locations' },
  { path: '/jobs/easy-apply' },
  { path: '/resources/fpa-guide' },
  { path: '/resources/1099-vs-w2' },
  { path: '/resources/multi-state-licensure' },
  { path: '/resources/private-practice-guide' },
];

test.describe('static page audit', () => {
  for (const { path, canonical } of STATIC_PAGES) {
    test(`static page ${path} is crawler-clean`, async ({ page, request }) => {
      await auditPage(page, request, path, { canonical });
    });
  }
});

// ── 3. Sitemap-sourced page audit ───────────────────────────────────────────

const SITEMAP_PAGES: string[] = [
  // state hubs
  '/jobs/state/new-york',
  '/jobs/state/california',
  '/jobs/state/texas',
  '/jobs/state/florida',
  '/jobs/state/illinois',
  '/jobs/state/massachusetts',
  '/jobs/state/washington',
  '/jobs/state/pennsylvania',
  // metros
  '/jobs/metro/new-york-ny',
  '/jobs/metro/los-angeles-ca',
  '/jobs/metro/chicago-il',
  '/jobs/metro/dallas-tx',
  // category landings
  '/jobs/remote',
  '/jobs/telehealth',
  '/jobs/inpatient',
  '/jobs/outpatient',
  '/jobs/travel',
  '/jobs/new-grad',
  '/jobs/per-diem',
  '/jobs/1099',
  '/jobs/full-time',
  '/jobs/part-time',
  '/jobs/contract',
  '/jobs/addiction',
  '/jobs/behavioral-health',
  '/jobs/child-adolescent',
  '/jobs/correctional',
  '/jobs/locum-tenens',
  // salary guide states
  '/salary-guide/new-york',
  '/salary-guide/california',
  '/salary-guide/texas',
  '/salary-guide/florida',
  // tools
  '/tools/offer-analyzer',
  '/tools/salary-converter',
  '/tools/1099-vs-w2-calculator',
  '/tools/practice-authority-map',
  '/tools/resume-checker',
  '/tools/resume-builder',
  // city / category x city / setting x state
  '/jobs/city/boston-ma',
  '/jobs/remote/city/new-york-ny',
  '/jobs/telehealth/new-york',
];

test.describe('sitemap-sourced page audit', () => {
  for (const path of SITEMAP_PAGES) {
    test(`sitemap page ${path} is crawler-clean`, async ({ page, request }) => {
      await auditPage(page, request, path, { mustBeIndexable: true });
    });
  }

  test('a random sample of sitemap.xml URLs all answer 200', async ({ request, page }) => {
    const { text } = await fetchText(request, '/sitemap.xml');
    const { locs } = await parseXml(page, text);
    // 8 URLs, not 15: each is a cold dev-server compile of a pSEO route, and
    // a larger sample blows the per-test budget on load rather than on a bug.
    const shuffled = [...locs].sort(() => Math.random() - 0.5).slice(0, 8);
    const failures: string[] = [];
    for (const loc of shuffled) {
      const res = await request.get(localize(loc), { timeout: 120_000, maxRedirects: 0 });
      if (res.status() !== 200) failures.push(`${new URL(loc).pathname} -> ${statusAndLocation(res)}`);
      else {
        const body = await res.text();
        if (/name="robots" content="[^"]*noindex/i.test(body)) failures.push(`${new URL(loc).pathname} -> 200 but meta robots noindex`);
      }
    }
    expect(failures, `sitemap advertises URLs that are not indexable 200s:\n  ${failures.join('\n  ')}`).toEqual([]);
  });

  test('blog posts from the blog feed are crawler-clean', async ({ page, request }) => {
    const { text } = await fetchText(request, '/blog/feed.xml');
    const links = Array.from(text.matchAll(/<link>([^<]+)<\/link>/g)).map((m) => m[1]).filter((l) => /\/blog\/[^/]+$/.test(l));
    expect(links.length).toBeGreaterThan(0);
    for (const link of links.slice(0, 3)) {
      const path = new URL(link).pathname;
      const { ld } = await auditPage(page, request, path, { mustBeIndexable: true });
      const types = ld.map((i) => String(i['@type']));
      expect(types.some((t) => /Article|BlogPosting|NewsArticle/.test(t)), `${path} should carry Article JSON-LD, found ${types.join(',')}`).toBe(true);
    }
  });

  test('company pages linked from /companies are crawler-clean', async ({ page, request }) => {
    page.setDefaultNavigationTimeout(NAV_TIMEOUT);
    await page.goto('/companies', { waitUntil: 'domcontentloaded' });
    const hrefs = await page.locator('a[href^="/companies/"]').evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute('href') || ''));
    const unique = Array.from(new Set(hrefs.filter((h) => /^\/companies\/[^/?#]+$/.test(h))));
    if (unique.length === 0) test.skip(true, 'no company links on /companies');
    for (const path of unique.slice(0, 2)) {
      const { ld } = await auditPage(page, request, path);
      const types = ld.map((i) => String(i['@type']));
      expect(types.some((t) => /Organization/.test(t)), `${path} should carry Organization JSON-LD, found ${types.join(',')}`).toBe(true);
    }
  });
});

// ── 4. Redirects, canonical and pagination rules ────────────────────────────

test.describe('redirects and canonical rules', () => {
  test('trailing slash and uppercase variants redirect to the lowercase bare URL', async ({ request }) => {
    const cases: Array<[string, string]> = [
      ['/jobs/', '/jobs'],
      ['/blog/', '/blog'],
      ['/jobs/remote/', '/jobs/remote'],
      ['/Jobs', '/jobs'],
      ['/JOBS/REMOTE', '/jobs/remote'],
      ['/Salary-Guide', '/salary-guide'],
    ];
    const failures: string[] = [];
    for (const [from, to] of cases) {
      const res = await request.get(localize(from), { maxRedirects: 0, timeout: 120_000 });
      const loc = res.headers()['location'] || '';
      const locPath = loc ? new URL(loc, BASE).pathname : '';
      if (![301, 308].includes(res.status()) || locPath !== to) failures.push(`${from} -> ${statusAndLocation(res)} (expected 301/308 to ${to})`);
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  test('utm parameters and ?page=1 are stripped with a permanent redirect', async ({ request }) => {
    const a = await request.get(localize('/jobs?page=1'), { maxRedirects: 0, timeout: 120_000 });
    expect(a.status(), statusAndLocation(a)).toBe(301);
    expect(new URL(a.headers()['location'] || '', BASE).pathname + new URL(a.headers()['location'] || '', BASE).search).toBe('/jobs');
    const b = await request.get(localize('/jobs/remote?utm_source=test&utm_medium=e2e'), { maxRedirects: 0, timeout: 120_000 });
    expect(b.status(), statusAndLocation(b)).toBe(301);
    const bLoc = new URL(b.headers()['location'] || '', BASE);
    expect(bLoc.pathname).toBe('/jobs/remote');
    expect(bLoc.search).toBe('');
  });

  test('paginated /jobs views are noindex,follow with a self canonical', async ({ request }) => {
    const { res, text } = await fetchText(request, '/jobs?page=2');
    expect(res.status()).toBe(200);
    expect(res.headers()['x-robots-tag'] || '').toMatch(/noindex,\s*follow/i);
    const canonical = /rel="canonical" href="([^"]+)"/.exec(text)?.[1] || '';
    expect(pathAndQuery(canonical)).toBe('/jobs?page=2');
    expect(/name="robots" content="([^"]+)"/.exec(text)?.[1] || '').toMatch(/noindex/);
    expect(text).toMatch(/Page 2/);
    const title = /<title>([^<]*)<\/title>/.exec(text)?.[1] || '';
    recordCopy('/jobs?page=2 <title>', title);
  });

  test('filtered and sorted /jobs views canonicalize to /jobs', async ({ request }) => {
    for (const [path, expectNoindex] of [
      ['/jobs?location=Texas', true],
      ['/jobs?jobType=Full-Time', true],
      ['/jobs?sort=newest', false],
      ['/jobs?location=Texas&page=2', true],
    ] as Array<[string, boolean]>) {
      const { res, text } = await fetchText(request, path);
      expect(res.status(), path).toBe(200);
      const canonical = /rel="canonical" href="([^"]+)"/.exec(text)?.[1] || '';
      expect(pathAndQuery(canonical), `${path} canonical`).toBe('/jobs');
      const robots = /name="robots" content="([^"]+)"/.exec(text)?.[1] || '';
      if (expectNoindex) expect(robots, `${path} should be noindexed`).toMatch(/noindex/);
    }
  });

  test('paginated category landing carries the noindex,follow header', async ({ request }) => {
    const { res } = await fetchText(request, '/jobs/remote?page=2');
    expect([200, 404]).toContain(res.status());
    if (res.status() === 200) expect(res.headers()['x-robots-tag'] || '').toMatch(/noindex,\s*follow/i);
  });

  test('ambiguous city slug without a state code permanently redirects to the canonical slug', async ({ request }) => {
    const res = await request.get(localize('/jobs/city/boston'), { maxRedirects: 0, timeout: 120_000 });
    expect(res.status(), statusAndLocation(res)).toBe(308);
    expect(new URL(res.headers()['location'] || '', BASE).pathname).toBe('/jobs/city/boston-ma');
  });
});

// ── 5. Invalid URL handling ─────────────────────────────────────────────────

test.describe('invalid URL handling', () => {
  test.skip(AGAINST_PROD, 'no mutations against production');

  test('made-up taxonomies under /jobs answer 410 with noindex', async ({ request }) => {
    const paths = [
      '/jobs/not-a-category',
      '/jobs/not-a-category/city/austin',
      '/jobs/remote/city/not-a-real-city-zz',
      '/jobs/state/narnia',
      '/jobs/metro/nowhere-xx',
      '/jobs/not-a-category/texas',
    ];
    const failures: string[] = [];
    for (const path of paths) {
      const res = await request.get(localize(path), { maxRedirects: 0, timeout: 120_000 });
      const xr = res.headers()['x-robots-tag'] || '';
      const body = await res.text();
      if (res.status() !== 410) failures.push(`${path} -> ${res.status()} (expected 410)`);
      if (!/noindex/i.test(xr) && !/name="robots" content="[^"]*noindex/i.test(body)) failures.push(`${path} lacks noindex`);
      if (/application\/ld\+json/.test(body) && /JobPosting/.test(body)) failures.push(`${path} 410 body carries JobPosting JSON-LD`);
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  test('unknown or thin city slugs answer a clean 404 (never 5xx, never a dropped connection)', async ({ request }) => {
    for (const path of ['/jobs/city/nowhere-zz', '/jobs/city/zzzz-qqqq-ny', '/jobs/city/no-such-place']) {
      const res = await request.get(localize(path), { maxRedirects: 0, timeout: 120_000 }).catch((e: Error) => e);
      expect(res instanceof Error ? `connection error: ${res.message}` : res.status(), path).toBe(404);
    }
  });

  test('random catch-all paths answer 404 with the branded page', async ({ page, request }) => {
    page.setDefaultNavigationTimeout(NAV_TIMEOUT);
    const collected = attachErrorCollectors(page);
    const res = await page.goto('/this-page-does-not-exist-h0902', { waitUntil: 'domcontentloaded' });
    expect(res?.status()).toBe(404);
    // The 404 must actually render app/not-found.tsx. A zero-length body is a
    // blank white page for every mistyped or dead top-level URL.
    const html = await res!.text();
    expect(
      html.length,
      `/this-page-does-not-exist-h0902 returned 404 with a ${html.length}-byte body and content-type "${res!.headers()['content-type'] || ''}" (expected the branded 404 page)`,
    ).toBeGreaterThan(500);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/not found/i);
    const api = await request.get(localize('/api/this-does-not-exist'), { timeout: 120_000 });
    expect(api.status()).toBeLessThan(500);
    assertClean(collected, '/this-page-does-not-exist');
  });

  test('shortlink garbage codes redirect to /jobs and never 5xx', async ({ request }) => {
    // Codes that reach the /r/[code] handler must answer a noindex 302 to /jobs.
    for (const code of ['zzz', 'a', 'a99999']) {
      const res = await request.get(localize(`/r/${code}`), { maxRedirects: 0, timeout: 120_000 });
      expect([302, 404], `/r/${code} -> ${statusAndLocation(res)}`).toContain(res.status());
      if (res.status() === 302) {
        expect(res.headers()['x-robots-tag'] || '', `/r/${code} should be noindex`).toMatch(/noindex/);
        const loc = new URL(res.headers()['location'] || '', BASE);
        expect(loc.pathname.startsWith('/jobs') || loc.pathname === '/', `/r/${code} redirects to ${loc.pathname}`).toBe(true);
      }
    }
    // Percent-encoded and mixed-case codes never reach the handler: `%2e%2e`
    // is path-normalized away by the server and anything with uppercase in the
    // (encoded) path is 301'd to its lowercase form by middleware. Neither is
    // a defect, but neither may 5xx and both must terminate at a real page.
    for (const code of ['%2e%2e', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'f1%3Cscript%3E']) {
      const raw = await request.get(localize(`/r/${code}`), { maxRedirects: 0, timeout: 120_000 });
      expect(raw.status(), `/r/${code} -> ${statusAndLocation(raw)}`).toBeLessThan(500);
      const followed = await request.get(localize(`/r/${code}`), { timeout: 120_000 });
      expect(followed.status(), `/r/${code} after redirects`).toBeLessThan(500);
      expect(await followed.text(), `/r/${code} must not reflect the raw code into HTML`).not.toContain('<script>alert');
    }
  });

  test('embeddable widget renders for a valid state and rejects bad input', async ({ request }) => {
    const ok = await request.get(localize('/widget?state=CA'), { timeout: 120_000 });
    expect(ok.status()).toBe(200);
    expect(ok.headers()['content-type']).toMatch(/text\/html/);
    expect(ok.headers()['x-robots-tag'] || '').toMatch(/noindex/);
    expect(ok.headers()['content-security-policy'] || '').toMatch(/frame-ancestors/);
    const html = await ok.text();
    expect(html).toContain('Latest PMHNP Jobs in CA');
    expect(html).toMatch(/class="pd-row"|class="pd-empty"/);
    expect(html).not.toMatch(/\b(undefined|NaN|null)\b/);
    recordCopy('/widget?state=CA', html.replace(/<[^>]+>/g, ' '));

    const lower = await request.get(localize('/widget?state=ca&limit=3'), { timeout: 120_000 });
    expect(lower.status()).toBe(200);

    for (const bad of ['/widget', '/widget?state=ZZ', '/widget?state=CA&limit=99', '/widget?state=%3Cscript%3E']) {
      const res = await request.get(localize(bad), { timeout: 120_000 });
      expect(res.status(), bad).toBe(400);
      expect(res.headers()['content-type'], bad).toMatch(/text\/html/);
      const body = await res.text();
      expect(body, bad).toContain('Widget Request Issue');
      expect(body, `${bad} must escape the reflected value`).not.toContain('<script>');
    }
  });
});

// ── 6. Job-detail lifecycle and JobPosting JSON-LD ──────────────────────────

test.describe('job detail lifecycle', () => {
  test('job cards on /jobs link to job pages that are still live', async ({ page, request }) => {
    page.setDefaultNavigationTimeout(NAV_TIMEOUT);
    await page.goto('/jobs', { waitUntil: 'domcontentloaded' });
    const hrefs = await page.locator('a[href^="/jobs/"]').evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute('href') || ''));
    const jobLinks = Array.from(new Set(hrefs.filter((h) => JOB_URL_RE.test(h.split('?')[0]))));
    if (jobLinks.length === 0) test.skip(true, 'no job-detail links rendered on /jobs');
    const failures: string[] = [];
    for (const href of jobLinks.slice(0, 3)) {
      const res = await request.get(localize(href), { maxRedirects: 0, timeout: 120_000 });
      if (res.status() !== 200) failures.push(`${href.split('?')[0]} -> ${res.status()}`);
    }
    expect(failures, `/jobs lists jobs whose detail page is gone (listing and detail disagree on expiry):\n  ${failures.join('\n  ')}`).toEqual([]);
  });

  test('a job from the public API is either live with valid JobPosting or gone with 410 + noindex', async ({ page, request }) => {
    const { res, text } = await fetchText(request, '/api/jobs?limit=1');
    expect(res.status()).toBe(200);
    const data = JSON.parse(text) as { jobs?: Array<{ id: string; slug?: string | null; title: string }> };
    const job = data.jobs?.[0];
    if (!job) test.skip(true, 'API returned no jobs');
    const path = `/jobs/${job!.slug || job!.id}`;
    const probe = await request.get(localize(path), { maxRedirects: 0, timeout: 120_000 });
    const body = await probe.text();
    if (probe.status() === 200) {
      // /api/jobs omits `slug`, so `path` is the bare-id alias; the page
      // legitimately cross-canonicals to the slug URL. Audit the canonical
      // URL itself so the self-canonical rule is applied to the real page.
      const canonicalHref = /rel="canonical" href="([^"]+)"/.exec(body)?.[1];
      const auditPath = canonicalHref ? pathAndQuery(canonicalHref) : path;
      const { ld } = await auditPage(page, request, auditPath);
      const jp = ld.find((i) => i['@type'] === 'JobPosting');
      expect(jp, `${path} live job page must carry JobPosting JSON-LD`).toBeTruthy();
      const through = Date.parse(String(jp!.validThrough));
      expect(through, 'live JobPosting.validThrough must be in the future').toBeGreaterThan(Date.now());
    } else {
      expect(probe.status(), `${path} -> ${probe.status()}`).toBe(410);
      expect(probe.headers()['x-robots-tag'] || '').toMatch(/noindex/);
      expect(body).not.toContain('JobPosting');
    }
  });

  test('live jobs advertised in the RSS feed carry valid JobPosting JSON-LD', async ({ page, request }) => {
    const { text } = await fetchText(request, '/feed.xml');
    const links = Array.from(text.matchAll(/<link>([^<]+)<\/link>/g)).map((m) => m[1]).filter((l) => JOB_URL_RE.test(new URL(l).pathname));
    if (links.length === 0) test.skip(true, '/feed.xml advertises no live jobs (all published jobs are expired in this environment)');
    for (const link of links.slice(0, 3)) {
      const path = new URL(link).pathname;
      const { ld } = await auditPage(page, request, path, { mustBeIndexable: true });
      const jp = ld.find((i) => i['@type'] === 'JobPosting');
      expect(jp, `${path} must carry JobPosting JSON-LD`).toBeTruthy();
      expect(Date.parse(String(jp!.validThrough))).toBeGreaterThan(Date.now());
    }
  });

  test('unpublished and nonexistent job URLs answer 410 with noindex and no JobPosting', async ({ request }) => {
    // The first slug is a known unpublished employer draft on the dev
    // database; the second is a random UUID that cannot exist. Both must
    // answer the same clean 410.
    for (const path of [
      '/jobs/remote-pmhnp-760c0fd7-7563-4620-875a-ba9ca39e2887',
      '/jobs/anything-00000000-0000-4000-8000-000000000000',
      '/jobs/undefined-undefined-00000000-0000-4000-8000-000000000000',
    ]) {
      const res = await request.get(localize(path), { maxRedirects: 0, timeout: 120_000 });
      if (res.status() === 301) {
        // /jobs/undefined* is 301-consolidated to /jobs by middleware
        expect(new URL(res.headers()['location'] || '', BASE).pathname, path).toBe('/jobs');
        continue;
      }
      expect(res.status(), `${path} -> ${res.status()}`).toBe(410);
      expect(res.headers()['x-robots-tag'] || '', path).toMatch(/noindex/);
      expect(await res.text(), path).not.toContain('JobPosting');
    }
  });

  test('expired job page renders the branded 410 without runtime errors', async ({ page, request }) => {
    const { text } = await fetchText(request, '/api/jobs?limit=1');
    const job = (JSON.parse(text) as { jobs?: Array<{ id: string; slug?: string | null }> }).jobs?.[0];
    if (!job) test.skip(true, 'API returned no jobs');
    const path = `/jobs/${job!.slug || job!.id}`;
    page.setDefaultNavigationTimeout(NAV_TIMEOUT);
    const collected = attachErrorCollectors(page);
    const res = await page.goto(path, { waitUntil: 'domcontentloaded' });
    if (res?.status() === 200) test.skip(true, 'job is live; covered by the JobPosting test');
    expect(res?.status()).toBe(410);
    await expect(page.locator('h1')).toHaveCount(1);
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/\b(undefined|NaN|null|\[object Object\])\b/);
    recordCopy(`${path} (410 page)`, bodyText);
    recordCopy(`${path} (410 page) <title>`, await page.title());
    assertClean(collected, path);
  });

  test('the 410 page for a nonexistent job follows the copy rules (title and body)', async ({ page }) => {
    // The middleware renders this page from a string template; the title and
    // the "Don't worry" subtext are user-facing copy and must respect the
    // no-dash rule like every other surface.
    page.setDefaultNavigationTimeout(NAV_TIMEOUT);
    const path = '/jobs/anything-00000000-0000-4000-8000-000000000000';
    const res = await page.goto(path, { waitUntil: 'domcontentloaded' });
    expect(res?.status()).toBe(410);
    const title = await page.title();
    const bodyText = await page.locator('body').innerText();
    const dashes = [title, bodyText].filter((t) => /[–—]/.test(t));
    expect(dashes, `410 page copy contains em/en dashes: ${JSON.stringify(dashes.map((t) => t.slice(0, 120)))}`).toEqual([]);
  });
});

// ── 7. SSR with JavaScript disabled ─────────────────────────────────────────

test.describe('server-side rendering without JavaScript', () => {
  test('homepage renders meaningful content with JavaScript disabled', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(NAV_TIMEOUT);
    try {
      const res = await page.goto('/', { waitUntil: 'domcontentloaded' });
      expect(res?.status()).toBe(200);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('h1').first()).toBeVisible();
      const text = await page.locator('body').innerText();
      expect(text.length, 'homepage body text should be substantial without JS').toBeGreaterThan(1500);
      expect(text).toMatch(/PMHNP/);
      const navLinks = await page.locator('a[href="/jobs"], a[href^="/jobs?"]').count();
      expect(navLinks, 'homepage should link to /jobs without JS').toBeGreaterThan(0);
      const ld = await page.locator('script[type="application/ld+json"]').count();
      expect(ld).toBeGreaterThan(0);
    } finally {
      await context.close();
    }
  });

  test('/jobs renders job cards with JavaScript disabled', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(NAV_TIMEOUT);
    try {
      const res = await page.goto('/jobs', { waitUntil: 'domcontentloaded' });
      expect(res?.status()).toBe(200);
      await expect(page.locator('h1')).toHaveCount(1);
      const hrefs = await page.locator('a[href^="/jobs/"]').evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute('href') || ''));
      const jobLinks = hrefs.filter((h) => JOB_URL_RE.test(h.split('?')[0]));
      expect(jobLinks.length, 'job-detail links must be present in the SSR HTML').toBeGreaterThan(0);
      const text = await page.locator('body').innerText();
      expect(text).not.toMatch(/\b(undefined|NaN|null|\[object Object\])\b/);
    } finally {
      await context.close();
    }
  });
});

// ── 8. Copy rules (collected across the crawl) ──────────────────────────────

test.describe('user-facing copy rules', () => {
  test('crawled pages contain no em/en dashes, "founder" or "Pavan" in visible copy', async () => {
    // Populated by every audited page above; when run in isolation with
    // --grep this test has nothing to check and passes vacuously.
    const unique = Array.from(new Set(copyViolations));
    expect(unique, `copy-rule violations (${unique.length}):\n  ${unique.slice(0, 80).join('\n  ')}`).toEqual([]);
  });
});
