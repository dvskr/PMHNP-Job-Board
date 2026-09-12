import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { attachErrorCollectors, assertClean } from './_helpers';
import { getSeekerCreds, loginAsSeeker } from '../fixtures/auth';

/**
 * Bug hunt slice "jobs-search-and-detail" (run tag h0902).
 *
 * Journey: an anonymous visitor discovers jobs.
 *   1. Homepage hero search hands off to /jobs with the query in the URL.
 *   2. /jobs renders cards, keyword search, every sidebar filter (alone and
 *      combined), chips, clear-all, sort, pagination, zero-result state and
 *      browser back/forward restoring filter state.
 *   3. The AI/semantic search bar on /jobs (at most two AI queries per run).
 *   4. Job detail for an employer-posted job and an external job: breadcrumbs,
 *      Role Snapshot, salary consistency, description rendering, apply button,
 *      share menu, report dialog, anonymous save (localStorage), related jobs,
 *      JobPosting JSON-LD, and the expired / unknown job behaviour.
 *   5. /companies index and one /companies/[slug] page.
 *
 * Every page gets error collectors (pageerror, console error, 5xx) and each
 * test ends with assertClean(). Job slugs are discovered at run time from the
 * API / SSR list so nothing is hard-coded to a specific row.
 */

const AGAINST_PROD =
  !!process.env.PLAYWRIGHT_BASE_URL && process.env.PLAYWRIGHT_BASE_URL.includes('pmhnphiring.com');

const JOB_HREF_RE = /^\/jobs\/[a-z0-9-]*[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const UUID_RE = /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i;
const BAD_TEXT_RE = /\b(undefined|NaN|\[object Object\])\b|(?<![A-Za-z])null(?![A-Za-z])/;
const DASH_RE = /[–—]/; // en dash, em dash

interface ApiJob {
  id: string;
  title: string;
  employer: string;
  location: string | null;
  displaySalary: string | null;
  normalizedMaxSalary: number | null;
  normalizedMinSalary: number | null;
  isRemote: boolean;
  sourceType: string | null;
  applyOnPlatform: boolean;
  originalPostedAt: string | null;
  createdAt: string;
  slug?: string;
}
interface ApiJobsResponse {
  jobs: ApiJob[];
  total: number;
  page: number;
  totalPages: number;
}

async function apiJobs(request: APIRequestContext, qs: string): Promise<ApiJobsResponse> {
  const res = await request.get(`/api/jobs?${qs}`);
  expect(res.status(), `GET /api/jobs?${qs}`).toBe(200);
  return (await res.json()) as ApiJobsResponse;
}

/** Wait for the next client-side list fetch and return its parsed body. */
function nextListFetch(page: Page): Promise<ApiJobsResponse> {
  return page
    .waitForResponse(
      (r) => r.request().method() === 'GET' && /\/api\/jobs\?/.test(r.url()),
      { timeout: 60_000 },
    )
    .then((r) => r.json() as Promise<ApiJobsResponse>);
}

function cards(page: Page) {
  return page.locator('a:has(> .jc-card)');
}

/**
 * Sidebar checkbox accessible name = "<label> <count>" (the count badge is part
 * of the <label>), so match the label prefix followed only by the numeric badge.
 */
function checkboxName(label: string): RegExp {
  const escaped = label.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  return new RegExp(`^${escaped}\\s*[\\d,.]*$`);
}

/** Filter-count badges start as 0 while loading; wait for the real totals. */
async function waitForCounts(page: Page) {
  await expect(sidebar(page).getByText(/jobs found/)).not.toContainText('...', { timeout: 60_000 });
}

function sidebar(page: Page) {
  // Desktop fixed filter rail (the mobile drawer is not rendered while closed).
  return page
    .locator('div[class~="lg:block"]')
    .filter({ has: page.getByRole('heading', { level: 2, name: 'Filters' }) })
    .first();
}

async function gotoJobs(page: Page, qs = '') {
  await page.goto(`/jobs${qs}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/PMHNP/);
}

async function cardHrefs(page: Page): Promise<string[]> {
  return cards(page).evaluateAll((els) =>
    els.map((e) => (e as HTMLAnchorElement).getAttribute('href') || ''),
  );
}

async function visibleText(page: Page): Promise<string> {
  return page.locator('body').innerText();
}

/**
 * Detail pages only render for jobs that are published AND not date-expired
 * (app/jobs/[slug]/page.tsx getJob). The listing does not apply the expiry
 * gate, so candidates are probed until one actually renders.
 */
async function findRenderableJob(
  request: APIRequestContext,
  candidates: ApiJob[],
  maxProbes = 8,
): Promise<{ job: ApiJob; path: string } | null> {
  for (const job of candidates.slice(0, maxProbes)) {
    const path = `/jobs/${job.slug || `job-${job.id}`}`;
    const res = await request.get(path, { timeout: 90_000 }).catch(() => null);
    if (!res || res.status() !== 200) continue;
    const html = await res.text();
    const title = (html.match(/<title>([^<]*)<\/title>/i) || [])[1] || '';
    if (/page not found|no longer available|position removed/i.test(title)) continue;
    return { job, path };
  }
  return null;
}

// ── 1. Homepage hero search ───────────────────────────────────────────────────

test.describe('homepage hero search', () => {
  test('keyword submits to /jobs with q in the URL and results render', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const keyword = page.getByRole('textbox', { name: 'Job title or keyword' });
    await keyword.fill('telehealth');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.waitForURL(/\/jobs\?q=telehealth/, { waitUntil: 'domcontentloaded' });
    await expect(cards(page).first()).toBeVisible({ timeout: 60_000 });
    // The sidebar echoes the submitted query as a chip and as input value.
    await expect(sidebar(page).getByRole('button', { name: 'Remove "telehealth" filter' })).toBeVisible();
    assertClean(c, 'hero keyword search');
  });

  test('quick-filter pill "Remote" lands on /jobs?q=Remote with results', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('link', { name: 'Remote', exact: true }).first().click();
    await page.waitForURL(/\/jobs\?q=Remote/, { waitUntil: 'domcontentloaded' });
    await expect(cards(page).first()).toBeVisible({ timeout: 60_000 });
    assertClean(c, 'hero quick filter');
  });

  test('location box accepts the suggested value "Remote" and still finds jobs', async ({ page, request }) => {
    const c = attachErrorCollectors(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('textbox', { name: 'City or remote' }).fill('Remote');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.waitForURL(/\/jobs\?location=Remote/, { waitUntil: 'domcontentloaded' });
    const remoteJobs = await apiJobs(request, 'workMode=remote&limit=1');
    expect(remoteJobs.total, 'there are remote jobs on the board').toBeGreaterThan(0);
    // The placeholder literally suggests 'Remote'; the result must not be empty.
    const viaLocation = await apiJobs(request, 'location=Remote&limit=1');
    expect(
      viaLocation.total,
      `hero location "Remote" produced ${viaLocation.total} results while ${remoteJobs.total} remote jobs exist`,
    ).toBeGreaterThan(0);
    await expect(page.getByText('No jobs found')).toHaveCount(0);
    assertClean(c, 'hero location Remote');
  });

  test('location box accepts a city name and finds jobs in that city', async ({ request }) => {
    // Pick a real city from the current inventory, then search by it the way
    // the hero form does (?location=<city>).
    const sample = await apiJobs(request, 'workMode=onsite&limit=20');
    const withCity = sample.jobs.find((j) => j.location && j.location.includes(','));
    expect(withCity, 'a job with a "City, State" location exists').toBeTruthy();
    const city = withCity!.location!.split(',')[0].trim();
    const byCity = await apiJobs(request, `location=${encodeURIComponent(city)}&limit=1`);
    expect(byCity.total, `hero location "${city}" (a real city on the board) returned 0 jobs`).toBeGreaterThan(0);
  });
});

// ── 2. /jobs list, search, filters, sort, pagination ─────────────────────────

test.describe('/jobs listing', () => {
  test('renders cards with title, employer, location, posted label and no placeholder text', async ({ page, request }) => {
    const c = attachErrorCollectors(page);
    await gotoJobs(page);
    const list = cards(page);
    await expect(list.first()).toBeVisible({ timeout: 60_000 });
    const count = await list.count();
    expect(count, 'first page renders a full page of cards').toBeGreaterThanOrEqual(20);

    for (let i = 0; i < 5; i += 1) {
      const card = list.nth(i);
      await expect(card.locator('h3')).not.toBeEmpty();
      const label = (await card.getAttribute('aria-label')) || '';
      expect(label, `card ${i} aria-label`).toMatch(/.+ at .+/);
      // Posted label appears after hydration (mount-guarded).
      await expect(card.getByText(/Just posted|Posted /)).toBeVisible({ timeout: 20_000 });
    }
    // At least one card in the first page shows a salary badge.
    const api = await apiJobs(request, 'limit=50');
    const anySalary = api.jobs.some((j) => j.displaySalary);
    if (anySalary) {
      await expect(page.getByText(/\$\d/).first()).toBeVisible();
    }
    const text = await visibleText(page);
    expect(text, 'placeholder text leaked into the list').not.toMatch(BAD_TEXT_RE);
    expect(text.toLowerCase()).not.toMatch(/\bfounder\b/);
    expect(text).not.toContain('Pavan');
    assertClean(c, '/jobs render');
  });

  test('sidebar total matches the API total for the unfiltered list', async ({ page, request }) => {
    const c = attachErrorCollectors(page);
    await gotoJobs(page);
    const api = await apiJobs(request, 'limit=1');
    const totalText = sidebar(page).getByText(/jobs found/);
    await expect(totalText).not.toContainText('...', { timeout: 60_000 });
    const shown = Number(((await totalText.innerText()).match(/[\d,]+/) || ['0'])[0].replace(/,/g, ''));
    expect(Math.abs(shown - api.total), `sidebar says ${shown}, API says ${api.total}`).toBeLessThanOrEqual(5);
    assertClean(c, 'sidebar total');
  });

  test('keyword search narrows results and writes ?q= to the URL', async ({ page, request }) => {
    const c = attachErrorCollectors(page);
    await gotoJobs(page);
    const baseline = (await apiJobs(request, 'limit=1')).total;
    const box = sidebar(page).getByRole('searchbox', { name: 'Search by job title or company' });
    const fetched = nextListFetch(page);
    await box.fill('telehealth');
    await box.press('Enter');
    await page.waitForURL(/[?&]q=telehealth/, { waitUntil: 'commit' });
    const data = await fetched;
    expect(data.total).toBeGreaterThan(0);
    expect(data.total, 'search must narrow the set').toBeLessThan(baseline);
    await expect(sidebar(page).getByRole('button', { name: 'Remove "telehealth" filter' })).toBeVisible();
    assertClean(c, 'keyword search');
  });

  test('keyword search edge inputs: whitespace only, script tag, unicode, very long', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await gotoJobs(page);
    const box = sidebar(page).getByRole('searchbox', { name: 'Search by job title or company' });

    // Whitespace only: must not become an active filter / chip.
    await box.fill('   ');
    await box.press('Enter');
    await expect(sidebar(page).getByRole('button', { name: /^Clear all/ })).toBeHidden({ timeout: 5_000 }).catch(() => undefined);
    expect.soft(page.url(), 'whitespace-only search became a URL filter').not.toMatch(/[?&]q=/);
    await expect.soft(sidebar(page).getByRole('button', { name: /^Remove ".*" filter$/ }), 'whitespace-only search produced a chip').toHaveCount(0);

    // Script tag: rendered as text in the chip, never executed.
    const evil = '<script>window.__pwned=1</script>';
    let fetched = nextListFetch(page);
    await box.fill(evil);
    await box.press('Enter');
    await page.waitForURL(/[?&]q=/, { waitUntil: 'commit' });
    await fetched;
    await expect(page.getByText('No jobs found')).toBeVisible({ timeout: 60_000 });
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    await expect(sidebar(page).getByText(evil, { exact: false })).toBeVisible();

    // Unicode query.
    fetched = nextListFetch(page);
    await box.fill('psiquiatría 🧠');
    await box.press('Enter');
    await fetched;
    await expect(page.getByText('No jobs found').or(cards(page).first())).toBeVisible({ timeout: 60_000 });

    // Very long query (2k chars) — must not 5xx.
    const long = 'a'.repeat(2000);
    fetched = nextListFetch(page);
    await box.fill(long);
    await box.press('Enter');
    const data = await fetched;
    expect(data.total).toBe(0);
    assertClean(c, 'search edge inputs');
  });

  test('zero-result query shows the empty state and "Clear filters" recovers', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await gotoJobs(page, '?q=zzqxjjjnonsensequery');
    await expect(page.getByText('No jobs found')).toBeVisible({ timeout: 60_000 });
    const clear = page.getByRole('link', { name: 'Clear filters' });
    await expect(clear).toBeVisible();
    await clear.click();
    await page.waitForURL((u) => u.pathname === '/jobs' && !u.search, { waitUntil: 'commit' });
    await expect(cards(page).first()).toBeVisible({ timeout: 60_000 });
    assertClean(c, 'zero results');
  });

  // Each sidebar filter: click → URL param → the client fetch returns a strictly
  // smaller (or equal, for freshness) set than the unfiltered baseline.
  const FILTERS: Array<{
    name: string;
    checkbox: string;
    param: RegExp;
    chip: string;
    verifyCard?: (page: Page) => Promise<void>;
  }> = [
    {
      name: 'work mode: Remote',
      checkbox: 'Remote',
      param: /workMode=remote/,
      chip: 'Remove Remote filter',
      verifyCard: async (page) => {
        await expect(cards(page).first().getByText('Remote', { exact: true }).first()).toBeVisible();
      },
    },
    { name: 'work mode: Hybrid', checkbox: 'Hybrid', param: /workMode=hybrid/, chip: 'Remove Hybrid filter' },
    { name: 'work mode: On-site', checkbox: 'On-site', param: /workMode=onsite/, chip: 'Remove Onsite filter' },
    { name: 'job type: Full-Time', checkbox: 'Full-Time', param: /jobType=Full-Time/, chip: 'Remove Full-Time filter' },
    { name: 'job type: Part-Time', checkbox: 'Part-Time', param: /jobType=Part-Time/, chip: 'Remove Part-Time filter' },
    { name: 'job type: Other', checkbox: 'Other', param: /jobType=Other/, chip: 'Remove Other filter' },
    { name: 'salary: $150,000+', checkbox: '$150,000+', param: /salaryMin=150000/, chip: 'Remove $150k+ filter' },
    { name: 'freshness: Past week', checkbox: 'Past week', param: /postedWithin=7d/, chip: 'Remove Past week filter' },
    { name: 'freshness: Past 24 hours', checkbox: 'Past 24 hours', param: /postedWithin=24h/, chip: 'Remove Past 24h filter' },
    {
      name: 'easy apply',
      checkbox: 'Direct employers / Easy Apply',
      param: /easyApply=1/,
      chip: 'Remove Easy Apply filter',
      verifyCard: async (page) => {
        await expect(cards(page).first().getByText('Featured', { exact: true })).toBeVisible();
      },
    },
    { name: 'specialty: Telehealth', checkbox: 'Telehealth', param: /specialty=Telehealth/, chip: 'Remove Telehealth filter' },
    { name: 'specialty: Travel / Locum', checkbox: 'Travel / Locum', param: /specialty=Travel/, chip: 'Remove Travel filter' },
    { name: 'experience: open to new grads', checkbox: 'Open to new grads', param: /newGrad=1/, chip: 'Remove Open to new grads filter' },
    { name: 'experience: I have 1+ years', checkbox: 'I have 1+ years', param: /minYears=1/, chip: 'Remove 1+ yrs exp filter' },
  ];

  for (const f of FILTERS) {
    test(`filter ${f.name} updates URL, narrows results, chip removes it`, async ({ page, request }) => {
      const c = attachErrorCollectors(page);
      await gotoJobs(page);
      const baseline = (await apiJobs(request, 'limit=1')).total;
      await waitForCounts(page);
      const box = sidebar(page).getByRole('checkbox', { name: checkboxName(f.checkbox) }).first();
      await expect(box).toBeVisible({ timeout: 60_000 });

      // Badge count next to the checkbox must agree with the fetched total.
      const row = box.locator('xpath=ancestor::label[1]');
      const badgeText = await row.locator('span').last().innerText();
      const badge = Number(badgeText.replace(/[^\d]/g, ''));

      const fetched = nextListFetch(page);
      await box.click();
      await page.waitForURL(f.param, { waitUntil: 'commit' });
      const data = await fetched;
      expect(data.total, `${f.name}: total ${data.total} vs baseline ${baseline}`).toBeLessThan(baseline);
      expect(data.total, `${f.name}: fetched total vs badge ${badge}`).toBe(badge);
      if (data.total > 0) {
        await expect(cards(page).first()).toBeVisible({ timeout: 60_000 });
        expect(await cards(page).count()).toBe(Math.min(50, data.total));
        if (f.verifyCard) await f.verifyCard(page);
      } else {
        await expect(page.getByText('No jobs found')).toBeVisible({ timeout: 60_000 });
        // A zero-result state under an active filter must offer recovery.
        await expect(page.getByRole('link', { name: 'Clear filters' })).toBeVisible();
      }
      await expect(box).toBeChecked();

      // Chip removal restores the unfiltered URL.
      const chip = sidebar(page).getByRole('button', { name: f.chip });
      await expect(chip).toBeVisible();
      const refetch = nextListFetch(page);
      await chip.click();
      await page.waitForURL((u) => !f.param.test(u.search), { waitUntil: 'commit' });
      await refetch;
      await expect(box).not.toBeChecked();
      assertClean(c, f.name);
    });
  }

  test('location filter by state narrows to that state and combines with Remote + salary', async ({ page, request }) => {
    const c = attachErrorCollectors(page);
    await gotoJobs(page);
    const baseline = (await apiJobs(request, 'limit=1')).total;
    const loc = sidebar(page).getByRole('textbox', { name: 'Filter by city, state, or remote' });
    let fetched = nextListFetch(page);
    await loc.fill('Texas');
    await loc.press('Enter');
    await page.waitForURL(/location=Texas/, { waitUntil: 'commit' });
    const texas = await fetched;
    expect(texas.total).toBeGreaterThan(0);
    expect(texas.total).toBeLessThan(baseline);
    expect(texas.jobs.every((j) => /texas|\bTX\b/i.test(j.location || '') || j.isRemote)).toBe(true);

    // Combine: + Remote + $100k+.
    fetched = nextListFetch(page);
    await sidebar(page).getByRole('checkbox', { name: checkboxName('Remote') }).click();
    await page.waitForURL(/workMode=remote/, { waitUntil: 'commit' });
    const texasRemote = await fetched;
    expect(texasRemote.total).toBeLessThanOrEqual(texas.total);
    expect(page.url()).toMatch(/location=Texas/);

    fetched = nextListFetch(page);
    await sidebar(page).getByRole('checkbox', { name: checkboxName('$100,000+') }).click();
    await page.waitForURL(/salaryMin=100000/, { waitUntil: 'commit' });
    const combo = await fetched;
    expect(combo.total).toBeLessThanOrEqual(texasRemote.total);
    expect(page.url()).toMatch(/location=Texas/);
    expect(page.url()).toMatch(/workMode=remote/);
    if (combo.total > 0) {
      expect(combo.jobs.every((j) => j.isRemote)).toBe(true);
      expect(combo.jobs.every((j) => (j.normalizedMaxSalary ?? 0) >= 100000 || (j.normalizedMinSalary ?? 0) >= 100000)).toBe(true);
    }

    // Three chips + Clear all.
    const clearAll = sidebar(page).getByRole('button', { name: /^Clear all \(3\)/ });
    await expect(clearAll).toBeVisible();
    fetched = nextListFetch(page);
    await clearAll.click();
    await page.waitForURL((u) => u.pathname === '/jobs' && !u.search, { waitUntil: 'commit' });
    await fetched;
    await expect(sidebar(page).getByRole('checkbox', { name: checkboxName('Remote') })).not.toBeChecked();
    await expect(loc).toHaveValue('');
    assertClean(c, 'location + combo + clear all');
  });

  test('a zero-result combination of uncounted filters still offers "Clear filters"', async ({ page, request }) => {
    const c = attachErrorCollectors(page);
    const combo = await apiJobs(request, 'specialty=Travel&easyApply=1&limit=1');
    test.skip(combo.total > 0, 'Travel + Easy Apply is not empty on this dataset');
    await gotoJobs(page, '?specialty=Travel&easyApply=1');
    await expect(page.getByText('No jobs found')).toBeVisible({ timeout: 60_000 });
    // Two filters are active (sidebar shows both chips) so the empty state must
    // offer "Clear filters", not the no-filter "set up an alert" copy.
    await expect(sidebar(page).getByRole('button', { name: 'Remove Easy Apply filter' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Clear filters' })).toBeVisible();
    assertClean(c, 'uncounted zero-result');
  });

  test('sort newest / salary / best change order and persist in URL', async ({ page, request }) => {
    const c = attachErrorCollectors(page);
    await gotoJobs(page);
    const bestApi = await apiJobs(request, 'limit=5');
    const bestFirst = bestApi.jobs[0];
    // "best" pins employer posts first.
    expect(bestFirst.sourceType, 'best sort leads with an employer post').toBe('employer');
    await expect(cards(page).first().locator('h3')).toHaveText(bestFirst.title);

    const select = page.locator('select.jp-sort-select');
    let fetched = nextListFetch(page);
    await select.selectOption('newest');
    await page.waitForURL(/sort=newest/, { waitUntil: 'commit' });
    const newest = await fetched;
    const stamps = newest.jobs.map((j) => new Date(j.originalPostedAt || j.createdAt).getTime());
    for (let i = 1; i < stamps.length; i += 1) {
      expect(stamps[i], `newest sort position ${i}`).toBeLessThanOrEqual(stamps[i - 1]);
    }
    await expect(cards(page).first().locator('h3')).toHaveText(newest.jobs[0].title, { timeout: 60_000 });

    fetched = nextListFetch(page);
    await select.selectOption('salary');
    await page.waitForURL(/sort=salary/, { waitUntil: 'commit' });
    const salary = await fetched;
    const maxes = salary.jobs.map((j) => j.normalizedMaxSalary ?? -1);
    for (let i = 1; i < maxes.length; i += 1) {
      expect(maxes[i], `salary sort position ${i}`).toBeLessThanOrEqual(maxes[i - 1]);
    }
    await expect(cards(page).first().locator('h3')).toHaveText(salary.jobs[0].title, { timeout: 60_000 });

    fetched = nextListFetch(page);
    await select.selectOption('best');
    await page.waitForURL((u) => !u.search.includes('sort='), { waitUntil: 'commit' });
    await fetched;
    await expect(cards(page).first().locator('h3')).toHaveText(bestFirst.title, { timeout: 60_000 });
    assertClean(c, 'sort');
  });

  test('unknown ?sort= falls back to best without errors', async ({ page, request }) => {
    const c = attachErrorCollectors(page);
    const best = await apiJobs(request, 'limit=1');
    await gotoJobs(page, '?sort=garbage');
    await expect(cards(page).first().locator('h3')).toHaveText(best.jobs[0].title, { timeout: 60_000 });
    assertClean(c, 'sort garbage');
  });

  test('browser back restores the previous sort in both the URL and the rendered order', async ({ page, request }) => {
    const c = attachErrorCollectors(page);
    await gotoJobs(page);
    const bestFirst = (await apiJobs(request, 'limit=1')).jobs[0];
    const select = page.locator('select.jp-sort-select');
    let fetched = nextListFetch(page);
    await select.selectOption('newest');
    await page.waitForURL(/sort=newest/, { waitUntil: 'commit' });
    const newest = await fetched;
    await expect(cards(page).first().locator('h3')).toHaveText(newest.jobs[0].title, { timeout: 60_000 });

    const refetch = page.waitForResponse(
      (r) => r.request().method() === 'GET' && /\/api\/jobs\?/.test(r.url()),
      { timeout: 60_000 },
    );
    await page.goBack({ waitUntil: 'commit' });
    await expect(page).toHaveURL((u) => u.pathname === '/jobs' && !u.search.includes('sort='));
    const afterBack = await refetch;
    // The URL says "best": the fetch, the select and the list must agree.
    expect.soft(afterBack.url(), 'list fetch issued after Back').not.toContain('sort=newest');
    await expect.soft(select, 'sort dropdown after Back').toHaveValue('best');
    await expect(cards(page).first().locator('h3'), 'first card after Back').toHaveText(bestFirst.title, { timeout: 60_000 });
    assertClean(c, 'back restores sort');
  });

  test('browser back/forward restores filter checkboxes and URL', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await gotoJobs(page);
    const remote = sidebar(page).getByRole('checkbox', { name: checkboxName('Remote') });
    const fullTime = sidebar(page).getByRole('checkbox', { name: checkboxName('Full-Time') });

    let fetched = nextListFetch(page);
    await remote.click();
    await page.waitForURL(/workMode=remote/, { waitUntil: 'commit' });
    await fetched;
    fetched = nextListFetch(page);
    await fullTime.click();
    await page.waitForURL(/jobType=Full-Time/, { waitUntil: 'commit' });
    await fetched;

    fetched = nextListFetch(page);
    await page.goBack({ waitUntil: 'commit' });
    await expect(page).toHaveURL(/workMode=remote/);
    await expect(page).not.toHaveURL(/jobType=/);
    await fetched;
    await expect(remote).toBeChecked();
    await expect(fullTime).not.toBeChecked();

    fetched = nextListFetch(page);
    await page.goForward({ waitUntil: 'commit' });
    await expect(page).toHaveURL(/jobType=Full-Time/);
    await fetched;
    await expect(fullTime).toBeChecked();
    await expect(remote).toBeChecked();

    fetched = nextListFetch(page);
    await page.goBack({ waitUntil: 'commit' });
    await page.goBack({ waitUntil: 'commit' });
    await expect(page).toHaveURL((u) => u.pathname === '/jobs' && !u.search);
    await fetched;
    await expect(remote).not.toBeChecked();
    await expect(sidebar(page).getByRole('button', { name: /^Clear all/ })).toHaveCount(0);
    assertClean(c, 'back/forward filters');
  });

  test('pagination: Next / Prev / numbered links change the page and the cards', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await gotoJobs(page);
    const firstPageHrefs = await cardHrefs(page);
    expect(firstPageHrefs.length).toBeGreaterThan(0);
    expect(firstPageHrefs.every((h) => JOB_HREF_RE.test(h)), `card hrefs: ${firstPageHrefs.slice(0, 3).join(', ')}`).toBe(true);
    await expect(page.getByText('Previous', { exact: true })).toHaveAttribute('aria-disabled', 'true');

    let fetched = nextListFetch(page);
    await page.getByRole('link', { name: 'Next page' }).click();
    await page.waitForURL(/[?&]page=2(&|$)/, { waitUntil: 'commit' });
    const p2 = await fetched;
    expect(p2.page).toBe(2);
    await expect(page.locator('span[aria-current="page"]')).toHaveText('2', { timeout: 60_000 });
    const secondPageHrefs = await cardHrefs(page);
    expect(secondPageHrefs.length).toBeGreaterThan(0);
    expect(secondPageHrefs[0]).not.toBe(firstPageHrefs[0]);
    expect(secondPageHrefs.some((h) => firstPageHrefs.includes(h)), 'pages overlap').toBe(false);

    fetched = nextListFetch(page);
    await page.getByRole('link', { name: 'Previous page' }).click();
    await page.waitForURL((u) => u.pathname === '/jobs' && !u.search.includes('page='), { waitUntil: 'commit' });
    await fetched;
    await expect(cards(page).first()).toHaveAttribute('href', firstPageHrefs[0], { timeout: 60_000 });

    // The client-fetched list must link to the same canonical URLs the SSR list did.
    const refetchedHrefs = await cardHrefs(page);
    const byId = (hs: string[]) => new Map(hs.map((h) => [(h.match(UUID_RE) || [])[1], h]));
    const ssr = byId(firstPageHrefs);
    for (const [id, href] of byId(refetchedHrefs)) {
      if (ssr.has(id)) expect(href, `href for ${id} after client refetch`).toBe(ssr.get(id));
    }
    assertClean(c, 'pagination');
  });

  test('direct ?page=3 renders page 3 with a crawlable numbered nav', async ({ page, request }) => {
    const c = attachErrorCollectors(page);
    const api = await apiJobs(request, 'page=3&limit=50');
    await gotoJobs(page, '?page=3');
    await expect(cards(page).first().locator('h3')).toHaveText(api.jobs[0].title, { timeout: 60_000 });
    await expect(page.locator('span[aria-current="page"]')).toHaveText('3');
    await expect(page.getByRole('link', { name: 'Previous page' })).toHaveAttribute('href', '/jobs?page=2');
    await expect(page.getByRole('link', { name: 'Next page' })).toHaveAttribute('href', '/jobs?page=4');
    assertClean(c, 'page=3');
  });

  test('out-of-range ?page=9999 shows an empty state, not an error', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await gotoJobs(page, '?page=9999');
    await expect(page.getByText('No jobs found')).toBeVisible({ timeout: 60_000 });
    assertClean(c, 'page=9999');
  });

  for (const bad of ['0', '-1', 'abc']) {
    test(`invalid ?page=${bad} falls back to page 1 instead of an empty list`, async ({ page, request }) => {
      const c = attachErrorCollectors(page);
      const first = (await apiJobs(request, 'limit=1')).jobs[0];
      await gotoJobs(page, `?page=${bad}`);
      await expect(page.getByText('No jobs found'), `?page=${bad} rendered the empty state`).toHaveCount(0);
      await expect(cards(page).first().locator('h3')).toHaveText(first.title, { timeout: 60_000 });
      assertClean(c, `page=${bad}`);
    });

    test(`GET /api/jobs?page=${bad} does not 500`, async ({ request }) => {
      const res = await request.get(`/api/jobs?page=${bad}&limit=5`);
      expect(res.status(), `/api/jobs?page=${bad} -> ${res.status()} ${await res.text()}`).toBeLessThan(500);
    });
  }

  test('list copy follows the house style (no em/en dashes, no "founder", no "Pavan")', async ({ page }) => {
    // Known low-severity violation (em dashes in the /jobs subtitle and the
    // sidebar "Your experience" helper). Expected to fail until the copy is fixed.
    test.fail();
    const c = attachErrorCollectors(page);
    await gotoJobs(page);
    await expect(cards(page).first()).toBeVisible({ timeout: 60_000 });
    // Only OUR copy: exclude card content (job titles are employer data).
    const ourCopy = await page.evaluate(() => {
      const clone = document.body.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('.jc-card, script, style').forEach((n) => n.remove());
      return (clone as HTMLElement).innerText;
    });
    const dashHits = ourCopy.split('\n').filter((l) => DASH_RE.test(l));
    expect(dashHits, `em/en dash in our copy:\n${dashHits.join('\n')}`).toEqual([]);
    expect(ourCopy.toLowerCase()).not.toMatch(/\bfounder\b/);
    expect(ourCopy).not.toContain('Pavan');
    assertClean(c, 'copy rules');
  });
});

// ── 3. AI / semantic search bar (max 2 AI queries in this file) ─────────────

test.describe('AI search bar on /jobs', () => {
  test('natural-language query returns ranked matches with constraint chips (AI query 1 of 2)', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await gotoJobs(page);
    const input = page.getByRole('textbox', { name: 'Describe the role you want' });
    const submit = page.getByRole('button', { name: /AI Search/ });
    await expect(submit).toBeDisabled();
    await input.fill('telehealth child psych in CA');
    await expect(submit).toBeEnabled();
    const semantic = page.waitForResponse((r) => r.url().includes('/api/jobs/search/semantic'), { timeout: 90_000 });
    await submit.click();
    const res = await semantic;
    expect(res.status(), 'semantic endpoint status').toBeLessThan(500);
    if (res.status() === 404) {
      // Flag off: the bar must fall back to keyword search with the same query, visibly.
      await expect(sidebar(page).getByRole('button', { name: /Remove ".*" filter/ })).toBeVisible({ timeout: 60_000 });
      assertClean(c, 'ai search (flag off)');
      return;
    }
    const body = (await res.json()) as { jobs: unknown[]; parsedConstraints?: { state: string | null } };
    if (body.jobs.length > 0) {
      await expect(page.getByText(/Showing relevant matches for/)).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText('CA eligible').or(page.getByText('CA (location)'))).toBeVisible();
      expect(await cards(page).count()).toBe(body.jobs.length);
      // Pagination is hidden in AI mode.
      await expect(page.getByRole('link', { name: 'Next page' })).toHaveCount(0);
      // Clearing the AI search restores the browse list.
      await page.getByRole('button', { name: 'Clear search' }).click();
      await expect(page.getByText(/Showing relevant matches/)).toHaveCount(0);
      await expect(cards(page).first()).toBeVisible();
      await expect(input).toHaveValue('');
    } else {
      await expect(page.getByText(/No jobs met every requirement|No semantic matches|No jobs found/)).toBeVisible({ timeout: 60_000 });
    }
    assertClean(c, 'ai search');
  });

  test('nonsense query is not a dead end: feedback shown and the list is recoverable (AI query 2 of 2)', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await gotoJobs(page);
    const input = page.getByRole('textbox', { name: 'Describe the role you want' });
    const semantic = page.waitForResponse((r) => r.url().includes('/api/jobs/search/semantic'), { timeout: 90_000 });
    await input.fill('zzqxjjj purple elephant accountant');
    await page.getByRole('button', { name: /AI Search/ }).click();
    const res = await semantic;
    expect(res.status()).toBeLessThan(500);
    // Either the AI panel explains the miss, or keyword fallback shows the
    // empty state; in both cases the user needs a visible way to recover AND
    // an indication of what was searched.
    const aiPanel = page.getByText(/No semantic matches|No jobs met every requirement|Showing relevant matches/);
    const empty = page.getByText('No jobs found');
    await expect(aiPanel.or(empty).first()).toBeVisible({ timeout: 60_000 });
    if (await empty.isVisible()) {
      // Keyword fallback: the query must be echoed somewhere the user can remove it.
      const chip = sidebar(page).getByRole('button', { name: /Remove ".*" filter/ });
      const clearBtn = page.getByRole('button', { name: 'Clear search' });
      await expect.soft(chip.or(clearBtn).first(), 'no visible way to see/clear the fallback keyword search').toBeVisible({ timeout: 5_000 });
      expect.soft(page.url(), 'fallback keyword search is not reflected in the URL').toMatch(/[?&]q=/);
      const recover = page.getByRole('link', { name: 'Clear filters' });
      await expect(recover).toBeVisible();
      await recover.click();
      await expect(cards(page).first(), 'list did not recover after "Clear filters"').toBeVisible({ timeout: 60_000 });
    } else {
      await page.getByRole('button', { name: 'Clear search' }).click();
      await expect(cards(page).first()).toBeVisible({ timeout: 60_000 });
    }
    assertClean(c, 'ai nonsense');
  });
});

// ── 4. Job detail ────────────────────────────────────────────────────────────

test.describe('job detail', () => {
  let employerJob: { job: ApiJob; path: string } | null = null;
  let externalJob: { job: ApiJob; path: string } | null = null;

  test.beforeAll(async ({ request }) => {
    const emp = await apiJobs(request, 'easyApply=1&limit=20');
    employerJob = await findRenderableJob(request, emp.jobs.filter((j) => j.sourceType === 'employer'));
    const ext = await apiJobs(request, 'sort=newest&limit=20');
    externalJob = await findRenderableJob(request, ext.jobs.filter((j) => j.sourceType !== 'employer'));
  });

  test('the first job on /jobs opens a real detail page (list and detail agree on what is live)', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await gotoJobs(page);
    const first = cards(page).first();
    await expect(first).toBeVisible({ timeout: 60_000 });
    const title = (await first.locator('h3').innerText()).trim();
    const href = (await first.getAttribute('href')) || '';
    const res = await page.goto(href, { waitUntil: 'domcontentloaded' });
    const status = res?.status();
    const h1 = await page.getByRole('heading', { level: 1 }).first().innerText({ timeout: 60_000 }).catch(() => '');
    // A job that /jobs advertises as open must render; a 200 with a
    // "not found" body is a soft 404 for the visitor and for Google.
    expect(
      status === 200 && h1.trim() === title,
      `listed job "${title}" -> ${href} answered HTTP ${status} with h1 "${h1}" (page title "${await page.title()}")`,
    ).toBe(true);
    assertClean(c, 'list -> detail');
  });

  test('employer-posted job: breadcrumbs, Role Snapshot, Easy Apply, salary parity, JSON-LD', async ({ page, request }) => {
    test.skip(!employerJob, 'no employer-posted job renders a detail page in this environment');
    const c = attachErrorCollectors(page);
    const { job, path } = employerJob!;
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(job.title, { timeout: 60_000 });

    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumbs.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    await expect(crumbs.getByRole('link', { name: 'Jobs' })).toHaveAttribute('href', '/jobs');
    await expect(crumbs).toContainText(job.title);

    const snapshot = page.locator('section[aria-labelledby="role-snapshot-heading"]');
    await expect(snapshot.getByRole('heading', { name: 'Role Snapshot' })).toBeVisible();
    await expect(snapshot.locator('dt', { hasText: 'Work mode' })).toBeVisible();
    for (const dd of await snapshot.locator('dd').allInnerTexts()) {
      expect(dd.trim().length).toBeGreaterThan(0);
      expect(dd).not.toMatch(BAD_TEXT_RE);
    }

    // Salary parity: card/API string == detail badge.
    if (job.displaySalary) {
      await expect(page.locator('.job-detail-hero-card').getByText(job.displaySalary, { exact: true })).toBeVisible();
    }

    // Easy Apply / in-platform apply CTA.
    const apply = page.locator('button.apply-btn').filter({ visible: true }).first();
    await expect(apply).toBeVisible();
    if (job.applyOnPlatform) await expect(apply).toContainText('Easy Apply');
    await expect(page.getByRole('button', { name: /Message .+/ }).first()).toBeVisible();

    // Description rendered as HTML, no raw tags / entities leaking.
    const desc = page.locator('.prose').first();
    const descText = await desc.innerText();
    expect(descText.length).toBeGreaterThan(20);
    expect(descText).not.toMatch(/<\/?(p|br|ul|li|div|strong)\b|&lt;|&gt;|&nbsp;|&amp;/);

    // JSON-LD JobPosting.
    const ldBlocks = await page.locator('script[type="application/ld+json"]').allInnerTexts();
    const parsed = ldBlocks.map((t) => JSON.parse(t) as { '@type'?: string; [k: string]: unknown });
    const posting = parsed.find((p) => p['@type'] === 'JobPosting');
    expect(posting, 'JobPosting JSON-LD present').toBeTruthy();
    expect(posting!.title).toBe(job.title);
    expect(String(posting!.url)).toMatch(/\/jobs\/.+/);
    expect(new Date(String(posting!.validThrough)).getTime()).toBeGreaterThan(Date.now());
    expect(posting!.hiringOrganization).toMatchObject({ name: job.employer });
    if (job.applyOnPlatform) expect(posting!.directApply).toBe(true);
    const breadcrumbLd = parsed.filter((p) => p['@type'] === 'BreadcrumbList');
    expect(breadcrumbLd.length, 'exactly one BreadcrumbList').toBe(1);

    await expect(page.getByRole('heading', { name: /Similar PMHNP Jobs|More from/ }).first()).toBeVisible();
    const text = await visibleText(page);
    expect(text).not.toMatch(BAD_TEXT_RE);
    expect(text.toLowerCase()).not.toMatch(/\bfounder\b/);
    expect(text).not.toContain('Pavan');
    assertClean(c, 'employer detail');
  });

  test('external job: apply CTA opens a new tab and hits track-apply; anonymous users see the sign-in wall', async ({ page, context }) => {
    test.skip(!externalJob, 'no external job renders a detail page in this environment');
    const c = attachErrorCollectors(page);
    const { job, path } = externalJob!;
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(job.title, { timeout: 60_000 });
    await expect(page.getByText("Opens the employer's application in a new tab")).toBeVisible();
    const apply = page.locator('button.apply-btn').filter({ visible: true }).first();
    await expect(apply).toContainText(/Apply Now|Direct Apply/);
    await apply.click();
    await expect(page.getByRole('heading', { name: 'Sign in to apply' })).toBeVisible();
    expect(context.pages().length, 'no tab opened for an anonymous click').toBe(1);
    await page.getByRole('button', { name: /Back/ }).click();
    await expect(apply).toBeVisible();

    if (job.displaySalary) {
      await expect(page.locator('.job-detail-hero-card').getByText(job.displaySalary, { exact: true })).toBeVisible();
    }
    const ldBlocks = await page.locator('script[type="application/ld+json"]').allInnerTexts();
    const posting = ldBlocks.map((t) => JSON.parse(t)).find((p) => p['@type'] === 'JobPosting');
    expect(posting).toBeTruthy();
    expect(posting.directApply).toBeUndefined();
    if (job.isRemote) {
      expect(posting.jobLocationType).toBe('TELECOMMUTE');
      expect(posting.applicantLocationRequirements).toBeTruthy();
    } else {
      expect(posting.jobLocation).toBeTruthy();
    }
    assertClean(c, 'external detail anon');
  });

  test.describe('authenticated interactions', () => {
    test.skip(AGAINST_PROD, 'no mutations against production');
    test.skip(!getSeekerCreds(), 'E2E_SEEKER_EMAIL / E2E_SEEKER_PASS not set');

    test('logged-in apply on an external job opens the employer link and POSTs track-apply', async ({ page, context }) => {
      test.skip(!externalJob, 'no external job renders a detail page in this environment');
      const c = attachErrorCollectors(page);
      await loginAsSeeker(page);
      const { job, path } = externalJob!;
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(job.title, { timeout: 60_000 });
      const apply = page.locator('button.apply-btn').filter({ visible: true }).first();
      await expect(apply).toBeEnabled();
      const popup = context.waitForEvent('page', { timeout: 30_000 });
      const tracked = page.waitForResponse((r) => r.url().includes(`/api/jobs/${job.id}/track-apply`), { timeout: 30_000 });
      await apply.click();
      const newTab = await popup;
      const trackRes = await tracked;
      expect(trackRes.status()).toBe(200);
      expect(await trackRes.json()).toMatchObject({ success: true });
      await newTab.waitForLoadState('domcontentloaded').catch(() => undefined);
      expect(newTab.url(), 'popup navigated to the employer apply link').toMatch(/^https?:\/\//);
      await newTab.close();
      await expect(page.getByText('Did you finish applying?')).toBeVisible();
      await page.getByRole('button', { name: 'Not yet' }).click();
      await expect(apply).toBeVisible();
      assertClean(c, 'tracked apply');
    });

    test('report dialog submits, and a duplicate report is acknowledged without a second row', async ({ page }) => {
      const target = employerJob ?? externalJob;
      test.skip(!target, 'no job renders a detail page in this environment');
      const c = attachErrorCollectors(page);
      await loginAsSeeker(page);
      await page.goto(target!.path, { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(target!.job.title, { timeout: 60_000 });

      const submitReport = async () => {
        await page.getByRole('button', { name: 'Report this job' }).click();
        const dialog = page.getByRole('dialog', { name: 'Report Job' });
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole('button', { name: 'Submit Report' })).toBeDisabled();
        await dialog.getByRole('button', { name: 'Other' }).click();
        await dialog.getByPlaceholder('Details (optional)').fill('E2E hunt h0902 test report <script>x</script>');
        const res = page.waitForResponse((r) => r.url().includes('/api/jobs/report') && r.request().method() === 'POST');
        await dialog.getByRole('button', { name: 'Submit Report' }).click();
        const body = (await (await res).json()) as { success: boolean; alreadyReported: boolean; reportId: string | null };
        await expect(dialog.getByText('Report Submitted')).toBeVisible();
        await expect(dialog).toBeHidden({ timeout: 10_000 });
        return body;
      };
      const first = await submitReport();
      expect(first.success).toBe(true);
      expect(first.reportId).toBeTruthy();
      const second = await submitReport();
      expect(second.success).toBe(true);
      expect(second.alreadyReported, 'second report from the same account is deduped').toBe(true);
      expect(second.reportId).toBe(first.reportId);
      assertClean(c, 'report job');
    });
  });

  test('anonymous report attempt is gated behind sign-in', async ({ page }) => {
    const target = employerJob ?? externalJob;
    test.skip(!target, 'no job renders a detail page in this environment');
    const c = attachErrorCollectors(page);
    await page.goto(target!.path, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Report this job' }).click();
    const dialog = page.getByRole('dialog', { name: 'Report Job' });
    await expect(dialog.getByText('Sign in to report')).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'Sign In' })).toHaveAttribute('href', '/login');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    assertClean(c, 'anon report');
  });

  test('share buttons render and Copy link puts the canonical URL on the clipboard', async ({ page, context }) => {
    const target = employerJob ?? externalJob;
    test.skip(!target, 'no job renders a detail page in this environment');
    const c = attachErrorCollectors(page);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(target!.path, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
    const share = page.locator('div[class~="lg:block"]').filter({ hasText: 'Share this job' }).first();
    for (const name of ['Share on LinkedIn', 'Share on X', 'Share on Facebook', 'Share on WhatsApp']) {
      await expect(share.getByRole('button', { name })).toBeVisible();
    }
    await expect(share.getByRole('link', { name: 'Share via Email' })).toHaveAttribute('href', /^mailto:/);
    await share.getByRole('button', { name: 'Copy link' }).click();
    await expect(share.getByRole('button', { name: 'Copied!' })).toBeVisible();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(clip).toMatch(/\/jobs\/.+/);
    expect(new URL(clip).pathname).toBe(new URL(canonical || clip).pathname);
    assertClean(c, 'share');
  });

  test('anonymous save persists in localStorage and survives reload', async ({ page }) => {
    const target = employerJob ?? externalJob;
    test.skip(!target, 'no job renders a detail page in this environment');
    const c = attachErrorCollectors(page);
    await page.goto(target!.path, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
    const save = page.getByRole('button', { name: 'Save job' }).filter({ visible: true }).first();
    await save.click();
    const saved = page.getByRole('button', { name: 'Remove saved job' }).filter({ visible: true }).first();
    await expect(saved).toHaveAttribute('aria-pressed', 'true');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('savedJobs') || '{}'));
    expect(stored, 'localStorage savedJobs map').toHaveProperty(target!.job.id);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: 'Remove saved job' }).filter({ visible: true }).first()).toHaveAttribute('aria-pressed', 'true', { timeout: 60_000 });
    // And the /jobs card for this job reflects it.
    await gotoJobs(page, `?q=${encodeURIComponent(target!.job.title)}`);
    const card = page.locator(`a[href$="${target!.job.id}"]:has(> .jc-card)`).first();
    await expect(card.getByRole('button', { name: 'Unsave job' })).toBeVisible({ timeout: 60_000 });
    await card.getByRole('button', { name: 'Unsave job' }).click();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('savedJobs') || '{}'))).not.toHaveProperty(target!.job.id);
    assertClean(c, 'anon save');
  });

  test('a slug with the wrong title prefix still resolves and canonicalises to the stored slug', async ({ page }) => {
    const target = employerJob ?? externalJob;
    test.skip(!target, 'no job renders a detail page in this environment');
    const c = attachErrorCollectors(page);
    const res = await page.goto(`/jobs/wrong-prefix-${target!.job.id}`, { waitUntil: 'domcontentloaded' });
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(target!.job.title, { timeout: 60_000 });
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical).toMatch(new RegExp(`/jobs/.*${target!.job.id}$`));
    expect(canonical).not.toContain('wrong-prefix');
    assertClean(c, 'wrong prefix slug');
  });

  test('a deleted / unknown job id answers 404 or 410, never a 200 "not found" page', async ({ page }) => {
    const c = attachErrorCollectors(page);
    const res = await page.goto('/jobs/some-title-00000000-0000-0000-0000-000000000000', { waitUntil: 'domcontentloaded' });
    expect(res, 'response').toBeTruthy();
    const status = res!.status();
    const title = await page.title();
    expect([404, 410], `status ${status} with title "${title}"`).toContain(status);
    // The body must still be a branded page with a way back to the list.
    await expect(page.getByRole('link', { name: /Browse All Jobs|Browse/i }).first()).toBeVisible();
    assertClean(c, 'unknown job');
  });

  test('a garbage /jobs/<no-uuid> URL is a proper 404/410', async ({ page }) => {
    const res = await page.goto('/jobs/this-does-not-exist-anywhere', { waitUntil: 'domcontentloaded' });
    expect([404, 410]).toContain(res?.status());
  });

});

// ── 5. Companies ────────────────────────────────────────────────────────────

test.describe('companies', () => {
  test('/companies index lists employers with well-formed links', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await page.goto('/companies', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Companies Hiring PMHNPs');
    const links = page.locator('a[href^="/companies/"]');
    const count = await links.count();
    expect(count).toBeGreaterThan(0);
    const hrefs = await links.evaluateAll((els) => els.map((e) => e.getAttribute('href') || ''));
    const withSpaces = hrefs.filter((h) => /\s/.test(h));
    expect(withSpaces, `company links containing whitespace: ${withSpaces.slice(0, 5).join(' | ')}`).toEqual([]);
    for (let i = 0; i < Math.min(5, count); i += 1) {
      await expect(links.nth(i)).toContainText(/\d+ open position/);
    }
    const text = await visibleText(page);
    expect(text).not.toMatch(BAD_TEXT_RE);
    assertClean(c, 'companies index');
  });

  test('the first company card on /companies opens a company page with open positions', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await page.goto('/companies', { waitUntil: 'domcontentloaded' });
    const first = page.locator('a[href^="/companies/"]').first();
    const name = (await first.locator('span').first().innerText()).trim();
    const positions = Number(((await first.innerText()).match(/(\d+) open position/) || ['', '0'])[1]);
    expect(positions).toBeGreaterThan(0);
    const href = (await first.getAttribute('href')) || '';
    const res = await page.goto(href, { waitUntil: 'domcontentloaded' });
    expect(res?.status(), `company page for "${name}" (${positions} open positions on the index, href ${href}) -> HTTP ${res?.status()}`).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name, { timeout: 60_000 });
    await expect(page.getByRole('heading', { name: /Open Positions \(\d+\)/ })).toBeVisible();
    expect(await page.locator('a[href^="/jobs/"]').filter({ has: page.locator('h3') }).count()).toBeGreaterThan(0);
    assertClean(c, 'company page');
  });

  test('unknown company slug is a 404/410', async ({ page }) => {
    const res = await page.goto('/companies/no-such-company-h0902', { waitUntil: 'domcontentloaded' });
    expect([404, 410]).toContain(res?.status());
  });
});
