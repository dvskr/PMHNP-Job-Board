/**
 * Bug hunt slice "mobile-and-a11y" (run tag h0902).
 *
 * Journey: a visitor (and a signed-in seeker / employer) uses the product on
 * a 375x812 phone, a 768x1024 tablet and a 1440 desktop. For every surface
 * we check that the page does not scroll horizontally, that it exposes the
 * expected landmarks / labels / accessible names, that axe-core reports no
 * serious or critical WCAG 2.1 A/AA violations, and that the mobile chrome
 * (header menu, BottomNav, MobileFilterDrawer, sticky apply bar) actually
 * works with touch and keyboard.
 *
 * Every test attaches the shared error collectors from ./_helpers and fails
 * on uncaught page errors, hydration warnings or 5xx responses.
 *
 * axe-core is loaded from node_modules/axe-core (the @axe-core/playwright
 * wrapper is not installed) and injected with page.evaluate so the CSP
 * nonce does not block it.
 *
 * Job-detail tests resolve a LIVE job at runtime: the dev DB is mostly older
 * than the detail page's 60-day expiry fallback, so every candidate is
 * verified by fetching its detail HTML first (see resolveLiveJobs).
 */

import { test, expect, type Page, type Locator, type APIRequestContext } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { attachErrorCollectors, assertClean } from './_helpers';
import { getSeekerCreds, getEmployerCreds, loginAsSeeker, loginAsEmployer } from '../fixtures/auth';

const AGAINST_PROD =
  !!process.env.PLAYWRIGHT_BASE_URL && process.env.PLAYWRIGHT_BASE_URL.includes('pmhnphiring.com');

const MOBILE = { width: 375, height: 812 };
const TABLET = { width: 768, height: 1024 };
const DESKTOP = { width: 1440, height: 900 };

const BLOG_POST = '/blog/best-states-for-pmhnps';
const STATE_PAGE = '/jobs/state/california';
const CITY_PAGE = '/jobs/city/sacramento-ca';
const UNKNOWN_JOB = '/jobs/unknown-role-00000000-0000-4000-8000-000000000000';

const AXE_PATH = path.resolve(process.cwd(), 'node_modules/axe-core/axe.min.js');
const AXE_SOURCE = fs.existsSync(AXE_PATH) ? fs.readFileSync(AXE_PATH, 'utf8') : null;

/** Auth pages intentionally hide the site header, so no nav landmark there. */
const AUTH_PATHS = ['/login', '/signup'];

// ── helpers ──────────────────────────────────────────────────────────────────

async function gotoPage(page: Page, url: string): Promise<number | null> {
  const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await expect(page.locator('body')).toBeVisible();
  // Let client chunks hydrate; the header hamburger only responds after that.
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);
  return res ? res.status() : null;
}

async function dismissCookieConsent(page: Page) {
  const dialog = page.getByRole('dialog', { name: /cookie consent/i });
  const accept = dialog.getByRole('button', { name: /accept all/i });
  if (await accept.isVisible().catch(() => false)) {
    await accept.click();
    await expect(dialog).toBeHidden();
  }
}

interface OverflowReport {
  vw: number;
  sw: number;
  offenders: string[];
}

async function overflowReport(page: Page): Promise<OverflowReport> {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const sw = document.documentElement.scrollWidth;
    const offenders: string[] = [];
    if (sw > vw + 1) {
      const describe = (el: Element) => {
        const cls = typeof el.className === 'string' ? el.className.split(/\s+/).filter(Boolean).slice(0, 3).join('.') : '';
        return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls ? '.' + cls : ''}`;
      };
      for (const el of Array.from(document.querySelectorAll('body *'))) {
        const r = el.getBoundingClientRect();
        if (r.width === 0) continue;
        if (getComputedStyle(el).position === 'fixed') continue;
        if (r.right > vw + 1) offenders.push(`${describe(el)} right=${Math.round(r.right)}`);
        if (offenders.length >= 8) break;
      }
    }
    return { vw, sw, offenders };
  });
}

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const r = await overflowReport(page);
  expect(
    r.sw,
    `${label}: document.scrollWidth ${r.sw} > innerWidth ${r.vw}. Offenders: ${r.offenders.join(' | ') || 'none found (inside overflow container?)'}`,
  ).toBeLessThanOrEqual(r.vw + 1);
}

interface StructureReport {
  mains: string[];
  navs: number;
  unlabeledInputs: string[];
  imgsWithoutAlt: string[];
  unnamedButtons: string[];
  unnamedLinks: string[];
  h1Count: number;
}

async function structureReport(page: Page): Promise<StructureReport> {
  return page.evaluate(() => {
    const visible = (el: Element) => {
      const he = el as HTMLElement;
      if (he.hidden) return false;
      const cs = getComputedStyle(he);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      const r = he.getBoundingClientRect();
      return r.width > 0 || r.height > 0;
    };
    const describe = (el: Element) => {
      const he = el as HTMLElement;
      const cls = typeof he.className === 'string' ? he.className.split(/\s+/).filter(Boolean).slice(0, 2).join('.') : '';
      const extra = [
        he.id ? `#${he.id}` : '',
        he.getAttribute('name') ? `[name=${he.getAttribute('name')}]` : '',
        he.getAttribute('type') ? `[type=${he.getAttribute('type')}]` : '',
        he.getAttribute('placeholder') ? `[placeholder=${he.getAttribute('placeholder')}]` : '',
        he.getAttribute('href') ? `[href=${he.getAttribute('href')}]` : '',
      ].join('');
      return `${he.tagName.toLowerCase()}${cls ? '.' + cls : ''}${extra}`;
    };
    const hasName = (el: Element) => {
      const he = el as HTMLElement;
      if (he.getAttribute('aria-label')?.trim()) return true;
      if (he.getAttribute('aria-labelledby')) return true;
      if (he.getAttribute('title')?.trim()) return true;
      if (he.textContent?.trim()) return true;
      const img = he.querySelector('img[alt], svg[aria-label], svg > title');
      if (img) {
        const alt = img.getAttribute('alt') ?? img.getAttribute('aria-label') ?? img.textContent;
        if (alt?.trim()) return true;
      }
      return false;
    };
    const mains = Array.from(document.querySelectorAll('main, [role="main"]')).map(
      (m) => `${m.tagName.toLowerCase()}${m.id ? '#' + m.id : ''} (parent ${m.parentElement?.tagName.toLowerCase()})`,
    );
    const navs = document.querySelectorAll('nav, [role="navigation"]').length;
    const unlabeledInputs: string[] = [];
    for (const el of Array.from(document.querySelectorAll('input, textarea, select'))) {
      const input = el as HTMLInputElement;
      if (input.type === 'hidden') continue;
      if (!visible(input) && !input.closest('label')) continue;
      const labelled =
        input.getAttribute('aria-label')?.trim() ||
        input.getAttribute('aria-labelledby') ||
        input.getAttribute('title')?.trim() ||
        (input.id && document.querySelector(`label[for="${CSS.escape(input.id)}"]`)) ||
        input.closest('label');
      if (!labelled) unlabeledInputs.push(describe(input));
    }
    const imgsWithoutAlt = Array.from(document.querySelectorAll('img'))
      .filter((img) => !img.hasAttribute('alt') && img.getAttribute('role') !== 'presentation')
      .map((img) => `img[src=${(img.getAttribute('src') || '').slice(0, 80)}]`);
    const unnamedButtons = Array.from(document.querySelectorAll('button, [role="button"]'))
      .filter((b) => visible(b) && !hasName(b))
      .map(describe);
    const unnamedLinks = Array.from(document.querySelectorAll('a[href]'))
      .filter((a) => visible(a) && !hasName(a))
      .map(describe);
    const h1Count = document.querySelectorAll('h1').length;
    return { mains, navs, unlabeledInputs, imgsWithoutAlt, unnamedButtons, unnamedLinks, h1Count };
  });
}

async function expectSoundStructure(page: Page, label: string, opts: { requireNav?: boolean } = {}) {
  const requireNav = opts.requireNav ?? true;
  const s = await structureReport(page);
  const problems: string[] = [];
  if (s.mains.length !== 1) problems.push(`expected exactly 1 main landmark, found ${s.mains.length}: ${s.mains.join(', ')}`);
  if (requireNav && s.navs < 1) problems.push(`expected at least 1 nav landmark, found ${s.navs}`);
  if (s.unlabeledInputs.length) problems.push(`inputs without a label: ${s.unlabeledInputs.join(', ')}`);
  if (s.imgsWithoutAlt.length) problems.push(`images without alt: ${s.imgsWithoutAlt.join(', ')}`);
  if (s.unnamedButtons.length) problems.push(`buttons without accessible name: ${s.unnamedButtons.join(', ')}`);
  if (s.unnamedLinks.length) problems.push(`links without accessible name: ${s.unnamedLinks.join(', ')}`);
  expect(problems, `${label}: ${problems.join('\n')}`).toEqual([]);
}

interface AxeViolation {
  id: string;
  impact: string;
  help: string;
  count: number;
  nodes: string[];
}

async function runAxe(page: Page): Promise<AxeViolation[]> {
  if (!AXE_SOURCE) return [];
  await page.evaluate(AXE_SOURCE);
  return page.evaluate(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const axe = (window as any).axe;
    const result = await axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      resultTypes: ['violations'],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return result.violations.map((v: any) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      count: v.nodes.length,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nodes: v.nodes.slice(0, 4).map((n: any) => {
        const data = n.any?.[0]?.data ?? n.all?.[0]?.data;
        const detail = data && typeof data === 'object'
          ? ` {fg ${data.fgColor ?? '?'} on bg ${data.bgColor ?? '?'} ratio ${data.contrastRatio ?? '?'} (need ${data.expectedContrastRatio ?? '?'})}`
          : '';
        return `${n.target.join(' ')} "${(n.html || '').replace(/\s+/g, ' ').slice(0, 90)}"${detail}`;
      }),
    }));
  });
}

async function expectNoSeriousAxeViolations(page: Page, label: string) {
  test.skip(!AXE_SOURCE, 'axe-core not installed');
  const violations = (await runAxe(page)).filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const summary = violations.map((v) => `[${v.impact}] ${v.id} (${v.count} nodes): ${v.help}\n    ${v.nodes.join('\n    ')}`);
  expect(summary, `${label}: axe serious/critical violations:\n${summary.join('\n')}`).toEqual([]);
}

/** Copy rules for this product: no em/en dashes, no "founder", no "Pavan". */
async function copyViolations(page: Page, opts: { bodyText?: boolean; title?: boolean } = {}): Promise<string[]> {
  const problems: string[] = [];
  const scan = (text: string, where: string) => {
    const dash = text.match(/[^\n]{0,40}[–—][^\n]{0,40}/);
    if (dash) problems.push(`em/en dash in ${where}: "${dash[0].trim()}"`);
    const founder = text.match(/[^\n]{0,40}\bfounders?\b[^\n]{0,40}/i);
    if (founder) problems.push(`"founder" in ${where}: "${founder[0].trim()}"`);
    const pavan = text.match(/[^\n]{0,40}\bPavan\b[^\n]{0,40}/);
    if (pavan) problems.push(`"Pavan" displayed in ${where}: "${pavan[0].trim()}"`);
  };
  if (opts.bodyText ?? true) scan(await page.locator('body').innerText(), 'copy');
  if (opts.title ?? true) scan(await page.title(), 'document.title');
  return problems;
}

async function centerHit(page: Page, locator: Locator): Promise<{ box: { x: number; y: number; width: number; height: number } | null; hit: string; inside: boolean }> {
  const box = await locator.boundingBox();
  if (!box) return { box, hit: 'no box', inside: false };
  const handle = await locator.elementHandle();
  const result = await page.evaluate(
    ({ x, y, target }) => {
      const el = document.elementFromPoint(x, y);
      const describe = (e: Element | null) => {
        if (!e) return 'null';
        const cls = typeof e.className === 'string' ? e.className.split(/\s+/).filter(Boolean).slice(0, 4).join('.') : '';
        return `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${cls ? '.' + cls : ''} "${(e.textContent || '').trim().slice(0, 40)}"`;
      };
      return { hit: describe(el), inside: !!el && (el === target || target.contains(el)) };
    },
    { x: box.x + box.width / 2, y: box.y + box.height / 2, target: handle! },
  );
  return { box, ...result };
}

interface ApiJob {
  id: string;
  title: string;
  sourceType: string;
  applyOnPlatform: boolean;
}

interface LiveJobs {
  employerJob: string | null;
  externalJob: string | null;
  listed: ApiJob[];
  notFoundListed: string[];
}

let liveJobsCache: Promise<LiveJobs> | null = null;

/** Fetch a job detail page and report whether it rendered the real job. */
async function detailIsLive(request: APIRequestContext, id: string): Promise<boolean> {
  const res = await request.get(`/jobs/${id}`, { timeout: 90_000 }).catch(() => null);
  if (!res || !res.ok()) return false;
  const html = await res.text();
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
  return !/page not found|no longer available/i.test(title) && /apply-btn/.test(html);
}

/**
 * The dev DB's jobs are mostly past the detail page's 60-day expiry
 * fallback, so a job returned by /api/jobs is NOT guaranteed to render.
 * Verify candidates and hand back a live employer (Easy Apply) and a live
 * external job when one exists. Also records which listed jobs 404.
 */
function resolveLiveJobs(request: APIRequestContext): Promise<LiveJobs> {
  if (!liveJobsCache) {
    liveJobsCache = (async () => {
      const out: LiveJobs = { employerJob: null, externalJob: null, listed: [], notFoundListed: [] };
      const res = await request.get('/api/jobs?limit=50', { timeout: 90_000 }).catch(() => null);
      if (!res || !res.ok()) return out;
      const body = (await res.json()) as { jobs: ApiJob[] };
      out.listed = body.jobs;
      const employers = body.jobs.filter((j) => j.sourceType === 'employer' && j.applyOnPlatform);
      const externals = body.jobs.filter((j) => j.sourceType !== 'employer').slice(0, 6);
      for (const j of employers) {
        if (await detailIsLive(request, j.id)) { out.employerJob = `/jobs/${j.id}`; break; }
        out.notFoundListed.push(`${j.id} [${j.title}]`);
      }
      for (const j of externals) {
        if (await detailIsLive(request, j.id)) { out.externalJob = `/jobs/${j.id}`; break; }
        out.notFoundListed.push(`${j.id} [${j.title}]`);
      }
      return out;
    })();
  }
  return liveJobsCache;
}

// ── page matrix (logged out) ────────────────────────────────────────────────

interface PageCase {
  name: string;
  url: string;
  /** Marketing / product copy pages get the copy-rule scan. */
  checkCopy?: boolean;
}

const PUBLIC_PAGES: PageCase[] = [
  { name: 'home', url: '/', checkCopy: true },
  { name: 'jobs', url: '/jobs', checkCopy: true },
  { name: 'login', url: '/login', checkCopy: true },
  { name: 'signup', url: '/signup', checkCopy: true },
  { name: 'pricing', url: '/pricing', checkCopy: true },
  { name: 'salary converter', url: '/tools/salary-converter', checkCopy: true },
  { name: 'resume checker', url: '/tools/resume-checker', checkCopy: true },
  { name: 'salary guide', url: '/salary-guide', checkCopy: true },
  { name: 'blog post', url: BLOG_POST, checkCopy: true },
  { name: 'state page', url: STATE_PAGE, checkCopy: true },
  { name: 'city page', url: CITY_PAGE, checkCopy: true },
];

test.describe('public pages: layout and accessibility', () => {
  for (const pc of PUBLIC_PAGES) {
    const isAuth = AUTH_PATHS.includes(pc.url);

    test(`${pc.name} at 375: no overflow, landmarks, labels, copy rules, axe`, async ({ page }) => {
      const collected = attachErrorCollectors(page);
      await page.setViewportSize(MOBILE);
      const status = await gotoPage(page, pc.url);
      // pSEO state/city pages are gated on a minimum live-job count, so in a
      // sparse DB they legitimately 404. That is a data state, not a layout
      // bug — skip rather than report a false a11y failure against the 404
      // template (which has its own dedicated test below).
      test.skip(status === 404 && /^\/jobs\/(state|city)\//.test(pc.url), `${pc.url} 404s in this DB (below the pSEO job-count gate)`);
      if (!isAuth) expect(page.url(), 'public page should not redirect to login').not.toMatch(/\/login/);
      await expectNoHorizontalOverflow(page, `${pc.name} 375 at load`);
      await expectSoundStructure(page, `${pc.name} 375`, { requireNav: !isAuth });
      if (pc.checkCopy) {
        const copy = await copyViolations(page);
        expect(copy, `${pc.name}: copy rules:\n${copy.join('\n')}`).toEqual([]);
      }
      await expectNoSeriousAxeViolations(page, `${pc.name} 375`);
      assertClean(collected, pc.name);
    });

    test(`${pc.name} at 768 and 1440: no horizontal overflow`, async ({ page }) => {
      const collected = attachErrorCollectors(page);
      await page.setViewportSize(TABLET);
      const status = await gotoPage(page, pc.url);
      test.skip(status === 404 && /^\/jobs\/(state|city)\//.test(pc.url), `${pc.url} 404s in this DB (below the pSEO job-count gate)`);
      await expectNoHorizontalOverflow(page, `${pc.name} 768`);
      await page.setViewportSize(DESKTOP);
      await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(DESKTOP.width);
      await expectNoHorizontalOverflow(page, `${pc.name} 1440`);
      assertClean(collected, pc.name);
    });
  }
});

// ── job detail pages ─────────────────────────────────────────────────────────

test.describe('job detail pages: layout and accessibility', () => {
  for (const kind of ['employer', 'external'] as const) {
    test(`${kind} job at 375: no overflow, landmarks, labels, title copy, axe`, async ({ page, request }) => {
      const collected = attachErrorCollectors(page);
      const live = await resolveLiveJobs(request);
      const url = kind === 'employer' ? live.employerJob : live.externalJob;
      test.skip(!url, `no live ${kind} job detail in this DB (listed jobs that 404: ${live.notFoundListed.length})`);
      await page.setViewportSize(MOBILE);
      await gotoPage(page, url!);
      await expect(page.locator('h1').first()).not.toHaveText(/page not found/i);
      await expectNoHorizontalOverflow(page, `${kind} job 375`);
      await expectSoundStructure(page, `${kind} job 375`);
      // Job descriptions are third-party text, so only the page <title> gets the dash rule.
      const copy = await copyViolations(page, { bodyText: false, title: true });
      expect(copy, `${kind} job: copy rules:\n${copy.join('\n')}`).toEqual([]);
      await expectNoSeriousAxeViolations(page, `${kind} job 375`);
      assertClean(collected, `${kind} job`);
    });

    test(`${kind} job at 768 and 1440: no horizontal overflow`, async ({ page, request }) => {
      const collected = attachErrorCollectors(page);
      const live = await resolveLiveJobs(request);
      const url = kind === 'employer' ? live.employerJob : live.externalJob;
      test.skip(!url, `no live ${kind} job detail in this DB`);
      await page.setViewportSize(TABLET);
      await gotoPage(page, url!);
      await expectNoHorizontalOverflow(page, `${kind} job 768`);
      await page.setViewportSize(DESKTOP);
      await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(DESKTOP.width);
      await expectNoHorizontalOverflow(page, `${kind} job 1440`);
      assertClean(collected, `${kind} job`);
    });
  }

  test('every job on the first /api/jobs page has a live detail page (list and detail agree on expiry)', async ({ request }) => {
    const res = await request.get('/api/jobs?limit=10', { timeout: 90_000 });
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as { jobs: ApiJob[] };
    expect(body.jobs.length, 'listing returned no jobs').toBeGreaterThan(0);
    const dead: string[] = [];
    for (const j of body.jobs) {
      const detail = await request.get(`/jobs/${j.id}`, { timeout: 90_000 });
      const html = await detail.text();
      const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
      if (/page not found|no longer available/i.test(title) || !detail.ok()) {
        dead.push(`${j.id} [${j.title}] (${j.sourceType}) -> HTTP ${detail.status()} "${title}"`);
      }
    }
    expect(dead, `jobs listed by /api/jobs (buildWhereClause has no expiry predicate) whose detail page renders "Page Not Found" (page.tsx getJob 60-day fallback):\n${dead.join('\n')}`).toEqual([]);
  });

  test('unknown job id answers HTTP 404, not a 200 soft-404', async ({ request }) => {
    const res = await request.get(UNKNOWN_JOB, { timeout: 90_000 });
    const html = await res.text();
    const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
    expect(res.status(), `expected 404 for an unknown job id but got ${res.status()} with title "${title}"`).toBe(404);
  });

  test('404 page at 375: single main landmark, no overflow, axe', async ({ page }) => {
    const collected = attachErrorCollectors(page);
    await page.setViewportSize(MOBILE);
    await gotoPage(page, UNKNOWN_JOB);
    await expect(page.locator('h1').first()).toBeVisible();
    await expectNoHorizontalOverflow(page, '404 page 375');
    await expectSoundStructure(page, '404 page 375');
    await expectNoSeriousAxeViolations(page, '404 page 375');
    assertClean(collected, '404 page');
  });
});

// ── header menu (mobile) ────────────────────────────────────────────────────

test.describe('mobile header menu', () => {
  test.use({ viewport: MOBILE });

  test('opens, locks scroll, closes via button, no overflow while open', async ({ page }) => {
    const collected = attachErrorCollectors(page);
    await gotoPage(page, '/');
    await dismissCookieConsent(page);
    const toggle = page.getByRole('button', { name: /toggle menu/i });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    const menu = page.getByRole('dialog', { name: /mobile navigation menu/i });
    await expect(menu).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(menu.getByRole('link', { name: /browse jobs/i })).toBeVisible();
    await expectNoHorizontalOverflow(page, 'home 375 with menu open');
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden');
    await toggle.click();
    await expect(menu).toBeHidden();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
    assertClean(collected);
  });

  test('menu link navigates and the menu closes on route change', async ({ page }) => {
    const collected = attachErrorCollectors(page);
    await gotoPage(page, '/');
    await dismissCookieConsent(page);
    await page.getByRole('button', { name: /toggle menu/i }).click();
    const menu = page.getByRole('dialog', { name: /mobile navigation menu/i });
    await menu.getByRole('link', { name: /salary guide/i }).click();
    await page.waitForURL(/\/salary-guide/, { waitUntil: 'domcontentloaded' });
    await expect(menu).toBeHidden();
    await expect(page.getByRole('button', { name: /toggle menu/i })).toHaveAttribute('aria-expanded', 'false');
    assertClean(collected);
  });

  test('traps focus while open (aria-modal dialog)', async ({ page }) => {
    const collected = attachErrorCollectors(page);
    await gotoPage(page, '/');
    await dismissCookieConsent(page);
    const toggle = page.getByRole('button', { name: /toggle menu/i });
    await toggle.click();
    const menu = page.getByRole('dialog', { name: /mobile navigation menu/i });
    await expect(menu).toBeVisible();
    // With the menu open, focus must move into the dialog or at least never
    // leave the dialog + header once inside it.
    const escaped: string[] = [];
    let enteredMenu = false;
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        const inMenu = !!a?.closest('#mobile-nav-menu');
        const inHeader = !!a?.closest('header');
        const desc = a ? `${a.tagName.toLowerCase()} "${(a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 40)}"` : 'null';
        return { inMenu, inHeader, desc };
      });
      if (info.inMenu) enteredMenu = true;
      if (enteredMenu && !info.inMenu && !info.inHeader) escaped.push(`tab ${i + 1}: ${info.desc}`);
    }
    expect(enteredMenu, 'Tab never reached the open menu').toBe(true);
    expect(escaped, `focus left the open aria-modal menu (Header.tsx has no focus trap): ${escaped.join(' | ')}`).toEqual([]);
    assertClean(collected);
  });

  test('Escape closes the menu and focus returns to the toggle', async ({ page }) => {
    const collected = attachErrorCollectors(page);
    await gotoPage(page, '/');
    await dismissCookieConsent(page);
    const toggle = page.getByRole('button', { name: /toggle menu/i });
    await toggle.click();
    const menu = page.getByRole('dialog', { name: /mobile navigation menu/i });
    await expect(menu).toBeVisible();
    // Move focus onto a link inside the menu, as a keyboard user would.
    await menu.getByRole('link', { name: /browse jobs/i }).focus();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    const active = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null;
      return a ? `${a.tagName.toLowerCase()} ${a.getAttribute('aria-label') || a.textContent?.trim().slice(0, 30) || ''}` : 'null';
    });
    expect(active, 'focus should return to the menu toggle after Escape').toMatch(/button.*toggle menu/i);
    assertClean(collected);
  });
});

// ── BottomNav ────────────────────────────────────────────────────────────────

test.describe('BottomNav (mobile)', () => {
  test.use({ viewport: MOBILE });

  test('/jobs: four tappable items with names, hidden on desktop', async ({ page }) => {
    const collected = attachErrorCollectors(page);
    await gotoPage(page, '/jobs');
    const nav = page.locator('nav.fixed.bottom-0');
    await expect(nav).toBeVisible();
    const links = nav.getByRole('link');
    await expect(links).toHaveCount(4);
    const names = await links.evaluateAll((els) => els.map((e) => (e.textContent || '').trim()));
    expect(names).toEqual(expect.arrayContaining(['Home', 'Jobs', 'Saved']));
    for (let i = 0; i < 4; i++) {
      const link = links.nth(i);
      const { box, hit, inside } = await centerHit(page, link);
      expect(box!.height, `BottomNav item ${names[i]} height`).toBeGreaterThanOrEqual(44);
      expect(inside, `BottomNav item ${names[i]} is covered by ${hit}`).toBe(true);
    }
    await expect(nav.getByRole('link', { name: /^jobs$/i })).toHaveAttribute('aria-current', 'page');
    await page.setViewportSize(DESKTOP);
    await expect(nav).toBeHidden();
    assertClean(collected);
  });

  test('/jobs: tapping Saved navigates', async ({ page }) => {
    const collected = attachErrorCollectors(page);
    await gotoPage(page, '/jobs');
    await page.locator('nav.fixed.bottom-0').getByRole('link', { name: /saved/i }).click();
    await page.waitForURL(/\/saved|\/login/, { waitUntil: 'domcontentloaded' });
    assertClean(collected);
  });

  test('job detail: sticky apply bar does not cover the BottomNav and vice versa', async ({ page, request }) => {
    const collected = attachErrorCollectors(page);
    const live = await resolveLiveJobs(request);
    test.skip(!live.employerJob && !live.externalJob, 'no live job detail in this DB');
    await gotoPage(page, (live.employerJob || live.externalJob)!);
    await dismissCookieConsent(page);
    const nav = page.locator('nav.fixed.bottom-0');
    const bar = page.locator('div.lg\\:hidden.fixed.bottom-0');
    const apply = bar.getByRole('button', { name: /easy apply|apply now|direct apply|apply again|one moment/i });
    await expect(apply).toBeVisible();
    const navBox = await nav.boundingBox();
    const barBox = await bar.boundingBox();
    expect(navBox, 'BottomNav is not rendered on the job detail page').not.toBeNull();
    for (const name of ['Home', 'Jobs', 'Saved']) {
      const item = nav.getByRole('link', { name: new RegExp(`^${name}$`, 'i') });
      const { hit, inside } = await centerHit(page, item);
      expect(inside, `BottomNav "${name}" (nav ${JSON.stringify(navBox)}) is covered by ${hit} (sticky bar ${JSON.stringify(barBox)})`).toBe(true);
    }
    const { box, hit, inside } = await centerHit(page, apply);
    expect(inside, `apply CTA is covered by ${hit}`).toBe(true);
    expect(box!.y + box!.height, 'apply CTA is below the fold').toBeLessThanOrEqual(MOBILE.height);
    assertClean(collected);
  });
});

// ── MobileFilterDrawer ───────────────────────────────────────────────────────

test.describe('MobileFilterDrawer', () => {
  test.use({ viewport: MOBILE });

  test('opens with focus inside, Escape closes, focus returns to trigger, nothing focusable when closed', async ({ page }) => {
    const collected = attachErrorCollectors(page);
    await gotoPage(page, '/jobs');
    await dismissCookieConsent(page);
    const trigger = page.getByRole('button', { name: /^filters/i });
    await expect(trigger).toBeVisible();
    await trigger.click();
    const drawer = page.getByRole('dialog', { name: /filter jobs/i });
    await expect(drawer).toBeVisible();
    await expectNoHorizontalOverflow(page, 'jobs 375 with drawer open');
    await expect.poll(() =>
      page.evaluate(() => !!document.activeElement?.closest('[role="dialog"][aria-label="Filter jobs"]')),
    ).toBe(true);
    // Tab cycles inside the drawer.
    const outside: string[] = [];
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        return { inside: !!a?.closest('[role="dialog"][aria-label="Filter jobs"]'), desc: a ? `${a.tagName.toLowerCase()} "${(a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 30)}"` : 'null' };
      });
      if (!info.inside) outside.push(`tab ${i + 1}: ${info.desc}`);
    }
    expect(outside, `focus escaped the filter drawer: ${outside.join(' | ')}`).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect.poll(() =>
      page.evaluate(() => (document.activeElement as HTMLElement | null)?.textContent?.trim() || ''),
    ).toMatch(/^Filters/);
    // Nothing from the drawer stays focusable once closed.
    const strays = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[aria-label="Close filters"], [role="dialog"][aria-label="Filter jobs"] input')).length,
    );
    expect(strays, 'closed drawer still has focusable content in the DOM').toBe(0);
    assertClean(collected);
  });

  test('toggling Remote applies the filter and "Show N jobs" closes the drawer', async ({ page }) => {
    const collected = attachErrorCollectors(page);
    await gotoPage(page, '/jobs');
    await dismissCookieConsent(page);
    await page.getByRole('button', { name: /^filters/i }).click();
    const drawer = page.getByRole('dialog', { name: /filter jobs/i });
    await expect(drawer).toBeVisible();
    const remote = drawer.getByRole('checkbox', { name: /^remote/i });
    await expect(remote).toBeVisible();
    await expect(remote).not.toBeChecked();
    const jobsResponse = page.waitForResponse((r) => r.url().includes('/api/jobs') && r.url().includes('workMode=remote'), { timeout: 60_000 });
    // The checkbox is controlled from the URL, so its checked state flips only
    // after router.push commits — which in App Router means after the server
    // has rendered the new /jobs RSC payload. On the dev server that is a
    // 10-40s round trip, so the URL assertion needs its own generous timeout
    // (measured: ~15s). Click and wait for the URL, do not use check().
    await remote.click();
    await expect(page).toHaveURL(/workMode=remote/, { timeout: 90_000 });
    await expect(remote).toBeChecked({ timeout: 30_000 });
    const res = await jobsResponse;
    expect(res.status()).toBeLessThan(500);
    const show = drawer.getByRole('button', { name: /^show .*jobs?$/i });
    await expect(show).toBeVisible();
    await expect(show).not.toHaveText(/^Show jobs$/, { timeout: 30_000 });
    const showText = await show.textContent();
    await show.click();
    await expect(drawer).toBeHidden();
    await expect(page.getByRole('button', { name: /^filters \(1\)/i })).toBeVisible();
    await expect(page.locator('a[href^="/jobs/"][aria-label]').first()).toBeVisible();
    // The drawer's count must match what the page says it found.
    const n = parseInt((showText || '').replace(/[^0-9]/g, ''), 10);
    expect(n, `drawer said "${showText}"`).toBeGreaterThan(0);
    await expect(page.getByText(new RegExp(`\\b${n.toLocaleString()}\\b`)).first()).toBeVisible();
    assertClean(collected);
  });

  test('backdrop tap or close button closes the drawer and unlocks body scroll', async ({ page }) => {
    const collected = attachErrorCollectors(page);
    await gotoPage(page, '/jobs');
    await dismissCookieConsent(page);
    await page.getByRole('button', { name: /^filters/i }).click();
    const drawer = page.getByRole('dialog', { name: /filter jobs/i });
    await expect(drawer).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden');
    // Drawer is max-w-sm (384px) so at 375 it fills the width; use a point at the far right edge outside it if any.
    const box = await drawer.boundingBox();
    if (box && box.width < MOBILE.width - 4) {
      await page.mouse.click(MOBILE.width - 2, MOBILE.height / 2);
    } else {
      await drawer.getByRole('button', { name: /close filters/i }).click();
    }
    await expect(drawer).toBeHidden();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
    assertClean(collected);
  });
});

// ── sticky apply CTA ─────────────────────────────────────────────────────────

test.describe('sticky apply CTA on job detail (mobile)', () => {
  test.use({ viewport: MOBILE });

  for (const kind of ['employer', 'external'] as const) {
    test(`${kind} job: CTA visible without scrolling, >= 44px, not covered`, async ({ page, request }) => {
      const collected = attachErrorCollectors(page);
      const live = await resolveLiveJobs(request);
      const url = kind === 'employer' ? live.employerJob : live.externalJob;
      test.skip(!url, `no live ${kind} job detail in this DB`);
      await gotoPage(page, url!);
      const bar = page.locator('div.lg\\:hidden.fixed.bottom-0');
      const cta = bar.getByRole('button', { name: /easy apply|apply now|direct apply|apply again|one moment/i });
      await expect(cta).toBeVisible();
      await expect(cta).not.toHaveText(/one moment/i, { timeout: 30_000 });
      if (kind === 'employer') await expect(cta).toHaveText(/easy apply|apply again/i);
      // First: a fresh visitor with the cookie banner still showing (if the region shows one).
      let r = await centerHit(page, cta);
      expect(r.box!.width, 'CTA width').toBeGreaterThanOrEqual(44);
      expect(r.box!.height, 'CTA height').toBeGreaterThanOrEqual(44);
      expect(r.box!.y, 'CTA top').toBeGreaterThanOrEqual(0);
      expect(r.box!.y + r.box!.height, 'CTA bottom').toBeLessThanOrEqual(MOBILE.height);
      const bannerVisible = await page.getByRole('dialog', { name: /cookie consent/i }).isVisible().catch(() => false);
      expect(r.inside, `CTA center is covered by ${r.hit} (cookie banner visible: ${bannerVisible})`).toBe(true);
      await dismissCookieConsent(page);
      r = await centerHit(page, cta);
      expect(r.inside, `CTA center is covered by ${r.hit} after consent dismissed`).toBe(true);
      // The page heading must not be hidden behind the fixed header.
      const h1 = page.locator('h1').first();
      await expect(h1).toBeVisible();
      const h1Box = await h1.boundingBox();
      expect(h1Box!.y, 'h1 sits under the fixed header').toBeGreaterThanOrEqual(100);
      assertClean(collected);
    });
  }

  test('employer job: tapping Easy Apply as a guest shows a sign-in path, not a dead click', async ({ page, request }) => {
    const collected = attachErrorCollectors(page);
    const live = await resolveLiveJobs(request);
    test.skip(!live.employerJob, 'no live employer job detail in this DB');
    await gotoPage(page, live.employerJob!);
    await dismissCookieConsent(page);
    const bar = page.locator('div.lg\\:hidden.fixed.bottom-0');
    const cta = bar.getByRole('button', { name: /easy apply/i });
    await expect(cta).toBeVisible();
    await cta.click();
    // The inline auth gate replaces the button inside the sticky bar.
    const signUp = bar.getByRole('button', { name: /create free account/i });
    const signIn = bar.getByRole('button', { name: /^sign in$/i });
    await expect(signUp).toBeVisible({ timeout: 30_000 });
    await expect(signIn).toBeVisible();
    // Both must be tappable inside the capped (70vh) bar without scrolling it.
    for (const [label, loc] of [['Create Free Account', signUp], ['Sign In', signIn]] as const) {
      const { box, hit, inside } = await centerHit(page, loc);
      expect(box!.height, `${label} height`).toBeGreaterThanOrEqual(40);
      expect(inside, `${label} is covered by ${hit}`).toBe(true);
    }
    await expectNoHorizontalOverflow(page, 'job detail after Easy Apply tap');
    await bar.getByRole('button', { name: /back/i }).click();
    await expect(cta).toBeVisible();
    assertClean(collected);
  });
});

// ── keyboard ─────────────────────────────────────────────────────────────────

test.describe('keyboard navigation on /jobs', () => {
  test('375: Tab reaches the search input and the first job card within 15 tabs', async ({ page }) => {
    const collected = attachErrorCollectors(page);
    await page.setViewportSize(MOBILE);
    await gotoPage(page, '/jobs');
    await dismissCookieConsent(page);
    await expect(page.locator('a[href^="/jobs/"]').first()).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    const trail: string[] = [];
    let searchAt = -1;
    let cardAt = -1;
    for (let i = 1; i <= 15; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        if (!a) return { desc: 'null', isSearch: false, isCard: false };
        const isSearch = a.tagName === 'INPUT' && /describe the role|search by job title/i.test(a.getAttribute('aria-label') || '');
        const href = a.getAttribute('href') || '';
        const isCard = a.tagName === 'A' && /^\/jobs\/[a-z0-9-]+-[a-f0-9]{8}-/i.test(href);
        return { desc: `${a.tagName.toLowerCase()} ${a.getAttribute('aria-label') || a.textContent?.trim().slice(0, 30) || href}`, isSearch, isCard };
      });
      trail.push(`${i}:${info.desc}`);
      if (info.isSearch && searchAt < 0) searchAt = i;
      if (info.isCard && cardAt < 0) cardAt = i;
    }
    expect(searchAt, `search input not reached in 15 tabs. Trail: ${trail.join(' > ')}`).toBeGreaterThan(0);
    expect(cardAt, `first job card link not reached in 15 tabs. Trail: ${trail.join(' > ')}`).toBeGreaterThan(0);
    assertClean(collected);
  });

  test('1440: skip link jumps past the header and the search input is reachable', async ({ page }) => {
    const collected = attachErrorCollectors(page);
    await page.setViewportSize(DESKTOP);
    await gotoPage(page, '/jobs');
    await dismissCookieConsent(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.keyboard.press('Tab');
    const first = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.textContent?.trim() || '');
    expect(first, 'first tab stop should be the skip link').toMatch(/skip to main content/i);
    await page.keyboard.press('Enter');
    let searchAt = -1;
    const trail: string[] = [];
    for (let i = 1; i <= 15; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        const isSearch = !!a && a.tagName === 'INPUT' && /describe the role|search by job title/i.test(a.getAttribute('aria-label') || '');
        return { desc: a ? `${a.tagName.toLowerCase()} ${a.getAttribute('aria-label') || a.textContent?.trim().slice(0, 30) || ''}` : 'null', isSearch };
      });
      trail.push(`${i}:${info.desc}`);
      if (info.isSearch) { searchAt = i; break; }
    }
    expect(searchAt, `search input not reached within 15 tabs after skip link. Trail: ${trail.join(' > ')}`).toBeGreaterThan(0);
    assertClean(collected);
  });
});

// ── text overflow on cards ───────────────────────────────────────────────────

test.describe('long titles', () => {
  test.use({ viewport: MOBILE });

  test('/jobs cards with very long titles do not overflow at 375', async ({ page, request }) => {
    const collected = attachErrorCollectors(page);
    // Find the longest title among recent jobs so the check is data-driven.
    const res = await request.get('/api/jobs?limit=50&sort=newest', { timeout: 90_000 });
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as { jobs: Array<{ id: string; title: string }> };
    const longest = [...body.jobs].sort((a, b) => b.title.length - a.title.length)[0];
    expect(longest, 'no jobs returned').toBeTruthy();
    const q = longest.title.split(/\s+/).slice(0, 4).join(' ');
    await gotoPage(page, `/jobs?q=${encodeURIComponent(q)}`);
    await dismissCookieConsent(page);
    const cards = page.locator('a[href^="/jobs/"][aria-label]');
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThan(0);
    await expectNoHorizontalOverflow(page, `jobs?q=${q} 375`);
    const overflowing = await page.evaluate(() => {
      const vw = window.innerWidth;
      const out: string[] = [];
      for (const h of Array.from(document.querySelectorAll('a[href^="/jobs/"] h3, a[href^="/jobs/"] h2'))) {
        const r = h.getBoundingClientRect();
        const cs = getComputedStyle(h);
        const clipped = cs.overflow === 'hidden' || cs.textOverflow === 'ellipsis' || (cs as unknown as { webkitLineClamp: string }).webkitLineClamp !== 'none';
        if (r.right > vw + 1) out.push(`"${(h.textContent || '').trim().slice(0, 50)}" right=${Math.round(r.right)}`);
        else if (!clipped && h.scrollWidth > h.clientWidth + 2) out.push(`"${(h.textContent || '').trim().slice(0, 50)}" scrollWidth ${h.scrollWidth} > clientWidth ${h.clientWidth}`);
      }
      return out;
    });
    expect(overflowing, `card titles overflow: ${overflowing.join(' | ')}`).toEqual([]);
    assertClean(collected);
  });

  test('job detail h1 and sticky bar stay inside 375 for a live job', async ({ page, request }) => {
    const collected = attachErrorCollectors(page);
    const live = await resolveLiveJobs(request);
    const url = live.employerJob || live.externalJob;
    test.skip(!url, 'no live job detail in this DB');
    await gotoPage(page, url!);
    await expect(page.locator('h1').first()).toBeVisible();
    await expectNoHorizontalOverflow(page, `job ${url} 375`);
    const h1 = await page.locator('h1').first().evaluate((h) => ({ right: h.getBoundingClientRect().right, sw: h.scrollWidth, cw: h.clientWidth }));
    expect(h1.right, 'h1 extends past viewport').toBeLessThanOrEqual(MOBILE.width + 1);
    expect(h1.sw, 'h1 text is wider than its box').toBeLessThanOrEqual(h1.cw + 2);
    assertClean(collected);
  });
});

// ── media emulation ──────────────────────────────────────────────────────────

test.describe('media emulation', () => {
  test.use({ viewport: MOBILE });

  test('prefers-reduced-motion: home and jobs still lay out and the menu opens', async ({ page }) => {
    const collected = attachErrorCollectors(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoPage(page, '/');
    await expectNoHorizontalOverflow(page, 'home 375 reduced motion');
    await dismissCookieConsent(page);
    await page.getByRole('button', { name: /toggle menu/i }).click();
    await expect(page.getByRole('dialog', { name: /mobile navigation menu/i })).toBeVisible();
    await page.keyboard.press('Escape');
    await gotoPage(page, '/jobs');
    await expectNoHorizontalOverflow(page, 'jobs 375 reduced motion');
    await expect(page.locator('a[href^="/jobs/"]').first()).toBeVisible();
    assertClean(collected);
  });

  test('prefers-color-scheme dark: page keeps an explicit background and readable text', async ({ page }) => {
    const collected = attachErrorCollectors(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await gotoPage(page, '/');
    await expectNoHorizontalOverflow(page, 'home 375 dark');
    const colors = await page.evaluate(() => {
      const bg = getComputedStyle(document.body).backgroundColor;
      const scheme = getComputedStyle(document.documentElement).colorScheme;
      return { bg, scheme };
    });
    // The product declares color-scheme: light; body must still paint an explicit background.
    expect(colors.bg, `body background is transparent under dark scheme (color-scheme=${colors.scheme})`).not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
    await expectNoSeriousAxeViolations(page, 'home 375 dark');
    assertClean(collected);
  });
});

// ── forms: validation paths ──────────────────────────────────────────────────

test.describe('form validation is announced (mobile)', () => {
  test.use({ viewport: MOBILE });

  test('/login: empty submit and invalid email give feedback', async ({ page }) => {
    const collected = attachErrorCollectors(page);
    await gotoPage(page, '/login');
    const submit = page.locator('button[type="submit"]').first();
    await expect(submit).toBeVisible();
    await submit.click();
    // Either native constraint validation stops the submit (email invalid) or the app renders role=alert.
    const state = await page.evaluate(() => {
      const email = document.querySelector<HTMLInputElement>('input[type="email"]');
      return { nativeInvalid: email ? !email.checkValidity() : false, hasAlert: !!document.querySelector('[role="alert"]') };
    });
    expect(state.nativeInvalid || state.hasAlert, 'empty login submit gave no feedback').toBe(true);
    await page.locator('input[type="email"]').first().fill('not-an-email');
    await page.locator('input[type="password"]').first().fill('x');
    await submit.click();
    const state2 = await page.evaluate(() => {
      const email = document.querySelector<HTMLInputElement>('input[type="email"]');
      return { nativeInvalid: email ? !email.checkValidity() : false, hasAlert: !!document.querySelector('[role="alert"]') };
    });
    expect(state2.nativeInvalid || state2.hasAlert, 'invalid email login gave no feedback').toBe(true);
    await expect(page).toHaveURL(/\/login/);
    await expectNoHorizontalOverflow(page, 'login 375 with error');
    assertClean(collected);
  });

  test('/signup: invalid email, short password and mismatched confirmation are rejected client-side', async ({ page }) => {
    const collected = attachErrorCollectors(page);
    await gotoPage(page, '/signup');
    await page.getByLabel(/first name/i).fill('   ');
    await page.getByLabel(/last name/i).fill('<script>alert(1)</script>');
    await page.locator('input[type="email"]').first().fill('not-an-email');
    const pw = page.locator('input[type="password"]');
    await pw.nth(0).fill('short');
    if ((await pw.count()) > 1) await pw.nth(1).fill('different');
    await page.locator('button[type="submit"]').first().click();
    const feedback = await page.evaluate(() => {
      const email = document.querySelector<HTMLInputElement>('input[type="email"]');
      const alert = document.querySelector('[role="alert"]');
      return { nativeInvalid: email ? !email.checkValidity() : false, alert: alert?.textContent?.trim() || null, url: location.pathname };
    });
    expect(feedback.url, 'signup navigated away with invalid input').toMatch(/\/signup/);
    expect(feedback.nativeInvalid || !!feedback.alert, 'invalid signup gave no feedback').toBe(true);
    // Now a valid-looking email with a too-short password: the app must block before calling Supabase.
    await page.locator('input[type="email"]').first().fill('e2e+a11y-never-submitted@pmhnptest.com');
    await pw.nth(0).fill('short');
    if ((await pw.count()) > 1) await pw.nth(1).fill('short');
    await page.locator('button[type="submit"]').first().click();
    const feedback2 = await page.evaluate(() => {
      const p = document.querySelector<HTMLInputElement>('input[type="password"]');
      return { nativeInvalid: p ? !p.checkValidity() : false, alert: document.querySelector('[role="alert"]')?.textContent?.trim() || null, url: location.pathname };
    });
    expect(feedback2.url).toMatch(/\/signup/);
    expect(feedback2.nativeInvalid || /8 characters/i.test(feedback2.alert || ''), `short password not rejected: ${JSON.stringify(feedback2)}`).toBe(true);
    await expectNoHorizontalOverflow(page, 'signup 375 with error');
    assertClean(collected);
  });
});

// ── signed-in seeker surfaces ────────────────────────────────────────────────

const SEEKER_PAGES: PageCase[] = [
  { name: 'dashboard', url: '/dashboard' },
  { name: 'settings', url: '/settings' },
  { name: 'saved', url: '/saved' },
  { name: 'messages', url: '/messages' },
];

test.describe('signed-in seeker pages', () => {
  test.skip(!getSeekerCreds(), 'E2E_SEEKER_EMAIL/PASS not set');
  test.skip(AGAINST_PROD, 'no mutations against production');

  for (const pc of SEEKER_PAGES) {
    test(`${pc.name} at 375: no overflow, landmarks, labels, copy, axe, BottomNav`, async ({ page }) => {
      const collected = attachErrorCollectors(page);
      await page.setViewportSize(MOBILE);
      await loginAsSeeker(page);
      await gotoPage(page, pc.url);
      expect(page.url(), 'seeker session was not honoured').not.toMatch(/\/login/);
      await expectNoHorizontalOverflow(page, `${pc.name} 375`);
      await expectSoundStructure(page, `${pc.name} 375`);
      const copy = await copyViolations(page);
      expect(copy, `${pc.name}: copy rules:\n${copy.join('\n')}`).toEqual([]);
      await expect(page.locator('nav.fixed.bottom-0')).toBeVisible();
      await expectNoSeriousAxeViolations(page, `${pc.name} 375`);
      assertClean(collected, pc.name);
    });

    test(`${pc.name} at 768 and 1440: no horizontal overflow`, async ({ page }) => {
      const collected = attachErrorCollectors(page);
      await page.setViewportSize(TABLET);
      await loginAsSeeker(page);
      await gotoPage(page, pc.url);
      await expectNoHorizontalOverflow(page, `${pc.name} 768`);
      await page.setViewportSize(DESKTOP);
      await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(DESKTOP.width);
      await expectNoHorizontalOverflow(page, `${pc.name} 1440`);
      assertClean(collected, pc.name);
    });
  }

  test('signed-in header menu shows seeker links and BottomNav shows Messages', async ({ page }) => {
    const collected = attachErrorCollectors(page);
    await page.setViewportSize(MOBILE);
    await loginAsSeeker(page);
    await gotoPage(page, '/jobs');
    await dismissCookieConsent(page);
    await expect(page.locator('nav.fixed.bottom-0').getByRole('link', { name: /messages/i })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: /toggle menu/i }).click();
    const menu = page.getByRole('dialog', { name: /mobile navigation menu/i });
    await expect(menu.getByRole('link', { name: /dashboard/i })).toBeVisible();
    await expect(menu.getByRole('link', { name: /saved/i })).toBeVisible();
    await expectNoHorizontalOverflow(page, 'jobs 375 signed-in menu open');
    assertClean(collected);
  });
});

// ── signed-in employer surfaces ──────────────────────────────────────────────

const EMPLOYER_PAGES: PageCase[] = [
  { name: 'post-job', url: '/post-job' },
  { name: 'employer dashboard', url: '/employer/dashboard' },
  { name: 'employer applicants', url: '/employer/applicants' },
];

test.describe('signed-in employer pages', () => {
  test.skip(!getEmployerCreds(), 'E2E_EMPLOYER_EMAIL/PASS not set');
  test.skip(AGAINST_PROD, 'no mutations against production');

  for (const pc of EMPLOYER_PAGES) {
    test(`${pc.name} at 375: no overflow, landmarks, labels, copy, axe`, async ({ page }) => {
      const collected = attachErrorCollectors(page);
      await page.setViewportSize(MOBILE);
      await loginAsEmployer(page);
      await gotoPage(page, pc.url);
      expect(page.url(), 'employer session was not honoured').not.toMatch(/\/login/);
      await expectNoHorizontalOverflow(page, `${pc.name} 375`);
      await expectSoundStructure(page, `${pc.name} 375`);
      const copy = await copyViolations(page);
      expect(copy, `${pc.name}: copy rules:\n${copy.join('\n')}`).toEqual([]);
      await expectNoSeriousAxeViolations(page, `${pc.name} 375`);
      assertClean(collected, pc.name);
    });

    test(`${pc.name} at 768 and 1440: no horizontal overflow`, async ({ page }) => {
      const collected = attachErrorCollectors(page);
      await page.setViewportSize(TABLET);
      await loginAsEmployer(page);
      await gotoPage(page, pc.url);
      await expectNoHorizontalOverflow(page, `${pc.name} 768`);
      await page.setViewportSize(DESKTOP);
      await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(DESKTOP.width);
      await expectNoHorizontalOverflow(page, `${pc.name} 1440`);
      assertClean(collected, pc.name);
    });
  }

  test('/post-job at 375: Continue with an empty title stays on step 1, shows the error and focuses the field', async ({ page }) => {
    const collected = attachErrorCollectors(page);
    await page.setViewportSize(MOBILE);
    await loginAsEmployer(page);
    await gotoPage(page, '/post-job');
    await dismissCookieConsent(page);
    const title = page.getByLabel(/job title/i).first();
    await expect(title).toBeVisible({ timeout: 30_000 });
    await title.fill('   ');
    const next = page.getByRole('button', { name: /^continue/i }).first();
    await next.scrollIntoViewIfNeeded();
    const { hit, inside } = await centerHit(page, next);
    expect(inside, `post-job Continue button is covered by ${hit}`).toBe(true);
    await next.click();
    await expect(page).toHaveURL(/\/post-job/);
    await expect(title).toBeVisible();
    const errors = page.locator('[role="alert"], [aria-invalid="true"], .text-red-500, .text-red-600, [id$="-error"]').or(page.getByText(/required|at least/i));
    await expect.poll(async () => errors.count(), { timeout: 15_000, message: 'no validation error rendered after Continue with an empty title' }).toBeGreaterThan(0);
    const focused = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null;
      return a ? `${a.tagName.toLowerCase()}#${a.id}` : 'null';
    });
    expect(focused, 'focus was not moved to the invalid field after Continue').toMatch(/^(input|select|textarea)#/);
    await expectNoHorizontalOverflow(page, 'post-job 375 with errors');
    assertClean(collected);
  });
});

// ── heading structure + control state (added after run 1) ───────────────────

test.describe('control state and heading structure', () => {
  test.use({ viewport: MOBILE });

  test('/login: the Job Seeker / Employer toggle exposes its selected state', async ({ page }) => {
    const collected = attachErrorCollectors(page);
    await gotoPage(page, '/login');
    await expect(page.getByRole('button', { name: /job seeker/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^employer$/i })).toBeVisible();
    // A two-state toggle must say which half is on: aria-pressed, aria-selected,
    // aria-checked or role=tab. Colour and font-weight alone are invisible to a
    // screen reader, so the user cannot tell which login mode is active.
    const state = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button'))
        .filter((b) => /^(job seeker|employer)$/i.test((b.textContent || '').trim()))
        .map((b) => ({
          label: (b.textContent || '').trim(),
          pressed: b.getAttribute('aria-pressed'),
          selected: b.getAttribute('aria-selected'),
          checked: b.getAttribute('aria-checked'),
          role: b.getAttribute('role'),
        })),
    );
    expect(state.length, 'role toggle buttons not found').toBeGreaterThan(0);
    const announced = state.filter((s) => s.pressed || s.selected || s.checked || s.role === 'tab');
    expect(
      announced.length,
      `login role toggle has no programmatic selected state (components/auth/LoginContent.tsx:168-196): ${JSON.stringify(state)}`,
    ).toBe(state.length);
    assertClean(collected, 'login role toggle');
  });
});

test.describe('post-job heading structure', () => {
  test.skip(!getEmployerCreds(), 'E2E_EMPLOYER_EMAIL/PASS not set');
  test.skip(AGAINST_PROD, 'no mutations against production');

  test('/post-job at 375: the page has exactly one h1', async ({ page }) => {
    const collected = attachErrorCollectors(page);
    await page.setViewportSize(MOBILE);
    await loginAsEmployer(page);
    await gotoPage(page, '/post-job');
    const headings = await page.evaluate(() => ({
      h1: Array.from(document.querySelectorAll('h1')).map((h) => (h.textContent || '').trim().slice(0, 40)),
      h2: Array.from(document.querySelectorAll('h2')).map((h) => (h.textContent || '').trim().slice(0, 40)).slice(0, 4),
    }));
    expect(
      headings.h1.length,
      `/post-job renders no h1 — the wizard starts at h2 (app/post-job/page.tsx:809). h2s: ${headings.h2.join(' | ')}`,
    ).toBe(1);
    assertClean(collected, 'post-job headings');
  });
});
