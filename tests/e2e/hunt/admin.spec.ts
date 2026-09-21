import { test as base, expect, type Page, type Browser } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { attachErrorCollectors, assertClean, type Collected } from './_helpers';
import {
  getAdminCreds, getSeekerCreds, getEmployerCreds,
  loginAsAdmin, loginAsSeeker, loginAsEmployer,
  uniqueEmail, TEST_PASSWORD, fillNameFields, clickSubmit,
} from '../fixtures/auth';

/**
 * Bug hunt: admin console (slice "admin", run tag h0902).
 *
 * Journey: an operator signs in with the admin test account, walks every
 * /admin page, drills into users / jobs / employers / blog / email /
 * testimonials / settings, performs reversible mutations on throwaway data
 * (a fresh signup, an admin-created job, a scratch blog post) and reverts
 * them. Gating is verified for anonymous, seeker and employer sessions.
 *
 * Nothing here sends broadcast or test email, triggers a cron, or touches the
 * three shared test accounts destructively. Tests that reproduce a confirmed
 * bug are marked test.fail() so the suite stays green; each carries a comment
 * naming the bug and the file that causes it.
 *
 * Rate limiting: every /api/admin/* route shares ONE 20 req/min per-IP bucket
 * (lib/auth/require-api-admin.ts + lib/rate-limit.ts). adminFetch() paces
 * direct API calls and waits out a 429 so pacing, not the product, decides
 * pass/fail. The last test deliberately exhausts the bucket.
 */

const AGAINST_PROD =
  !!process.env.PLAYWRIGHT_BASE_URL && process.env.PLAYWRIGHT_BASE_URL.includes('pmhnphiring.com');
const HAS_ADMIN = getAdminCreds() !== null;
const ROOT = path.resolve(__dirname, '../../..');
const STATE_DIR = path.resolve(ROOT, 'tests/e2e/.results');
const ERROR_TEXT = /application error|something went wrong|unhandled runtime|error loading|internal server error/i;

/* ─── Admin session once per worker (storageState) ─── */
type WorkerFx = { adminStatePath: string };
// No extra test-scoped fixtures. `Record<string, never>` cannot be used here:
// it collapses every fixture value to `never`, so both this call and the later
// `test.use({ storageState })` overrides fail to type-check.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type TestFx = {};
const test = base.extend<TestFx, WorkerFx>({
  adminStatePath: [
    async ({ browser }, use, workerInfo) => {
      fs.mkdirSync(STATE_DIR, { recursive: true });
      const statePath = path.join(STATE_DIR, `admin-state-h0902-${workerInfo.workerIndex}.json`);
      const ctx = await browser.newContext({ baseURL: workerInfo.project.use.baseURL });
      const page = await ctx.newPage();
      await loginAsAdmin(page);
      await ctx.storageState({ path: statePath });
      await ctx.close();
      await use(statePath);
    },
    { scope: 'worker' },
  ],
});

/* ─── Admin API pacing (single 20 req/min IP bucket) ─── */
const adminCalls: number[] = [];
const ADMIN_BUDGET_PER_MIN = 15;
const ADMIN_API_RE = /\/api\/(admin|outreach)\//;

function noteAdminCall(): void {
  adminCalls.push(Date.now());
}

async function paceAdminCalls(page: Page): Promise<void> {
  for (;;) {
    const now = Date.now();
    while (adminCalls.length && now - adminCalls[0] > 60_000) adminCalls.shift();
    if (adminCalls.length < ADMIN_BUDGET_PER_MIN) return;
    await page.waitForTimeout(Math.min(5_000, adminCalls[0] + 61_000 - now));
  }
}

function attach(page: Page): Collected {
  page.on('response', (res) => {
    if (ADMIN_API_RE.test(res.url())) noteAdminCall();
  });
  return attachErrorCollectors(page);
}

interface ApiResult { status: number; json: any; text: string; headers: Record<string, string> }

async function adminFetch(
  page: Page,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  data?: unknown,
): Promise<ApiResult> {
  await paceAdminCalls(page);
  const send = () => page.request.fetch(url, {
    method,
    data: data === undefined ? undefined : data,
    headers: { 'Content-Type': 'application/json' },
    maxRedirects: 0,
  });
  let res = await send();
  if (res.status() === 429) {
    const retryAfter = Number(res.headers()['retry-after'] || 60);
    await page.waitForTimeout((retryAfter + 1) * 1000);
    adminCalls.length = 0;
    res = await send();
  }
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status(), json, text, headers: res.headers() };
}

async function gotoAdmin(page: Page, urlPath: string): Promise<void> {
  await paceAdminCalls(page);
  await page.goto(urlPath, { waitUntil: 'domcontentloaded' });
}

async function waitSettled(page: Page): Promise<void> {
  await expect.poll(async () => (await page.locator('body').innerText()).replace(/\s+/g, ' '), {
    timeout: 60_000,
  }).not.toMatch(/Loading\b/);
}

async function bodyText(page: Page): Promise<string> {
  return (await page.locator('body').innerText()).replace(/\s+/g, ' ');
}

async function signupThrowaway(browser: Browser, baseURL: string | undefined): Promise<string> {
  const email = uniqueEmail('seeker');
  // storageState MUST be cleared explicitly: without it the new context picks
  // up the describe-level admin session and /signup just redirects to
  // /dashboard as the admin, so the signup form never renders.
  const ctx = await browser.newContext({ baseURL, storageState: undefined });
  const page = await ctx.newPage();
  await page.goto('/signup', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  // /signup is a client component; on a cold dev compile the form can take
  // well over the 20s default action timeout to appear. Surface what the page
  // actually rendered when it never does — a bare timeout says nothing.
  try {
    await page.locator('input[type="email"]').first().waitFor({ state: 'visible', timeout: 60_000 });
  } catch (err) {
    const seen = (await page.locator('body').innerText().catch(() => '<no body>')).replace(/\s+/g, ' ').slice(0, 400);
    const inputs = await page.locator('input').count().catch(() => -1);
    await ctx.close();
    throw new Error(`signup form never showed an email input at ${page.url()} (inputs on page: ${inputs}) — body: ${seen} — original: ${(err as Error).message}`);
  }
  await fillNameFields(page, 'E2eHunt', 'Throwaway');
  await page.locator('input[type="email"]').first().fill(email);
  const pw = page.locator('input[type="password"]');
  await pw.nth(0).fill(TEST_PASSWORD);
  if ((await pw.count()) > 1) await pw.nth(1).fill(TEST_PASSWORD);
  const tos = page.locator('input[type="checkbox"]').first();
  if (await tos.count()) await tos.check({ force: true }).catch(() => undefined);
  const profileCreated = page.waitForResponse(
    (r) => r.url().includes('/api/auth/profile') && r.request().method() === 'POST',
    { timeout: 45_000 },
  ).catch(() => null);
  await clickSubmit(page);
  await profileCreated;
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await ctx.close();
  return email;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. Gating
 * ═══════════════════════════════════════════════════════════════════════════ */
test.describe('admin gating', () => {
  test('anonymous /admin redirects to /login', async ({ page }) => {
    const c = attach(page);
    await page.goto('/admin', { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/login/, { timeout: 60_000 });
    expect(page.url()).toMatch(/\/login/);
    assertClean(c, 'anon /admin');
  });

  test('anonymous /admin/users redirects to /login', async ({ page }) => {
    const c = attach(page);
    await page.goto('/admin/users', { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/login/, { timeout: 60_000 });
    expect(page.url()).toMatch(/\/login/);
    assertClean(c, 'anon /admin/users');
  });

  test('anonymous admin APIs answer 401, never 5xx', async ({ request }) => {
    const users = await request.get('/api/admin/users');
    expect(users.status()).toBe(401);
    const jobs = await request.get('/api/admin/jobs');
    expect(jobs.status()).toBe(401);
    const flags = await request.get('/api/admin/ai/flags');
    expect(flags.status()).toBe(401);
  });

  test('anonymous /api/admin/cron-list answers 401/403, not 500 NEXT_REDIRECT', async ({ request }) => {
    // Regression guard. This route used to wrap requireAdmin() (a page helper
    // that signals rejection by THROWING a redirect) in try/catch and return
    // the caught redirect as HTTP 500 {"error":"NEXT_REDIRECT"}, leaking a
    // framework-internal string to anonymous callers. It now uses
    // requireApiAdmin, so a plain 401 is the expected answer.
    const res = await request.get('/api/admin/cron-list', { maxRedirects: 0 });
    const text = await res.text();
    expect(res.status(), `body: ${text}`).toBeLessThan(500);
    expect([401, 403, 302, 307]).toContain(res.status());
  });

  test('anonymous PATCH /api/admin/pd-campaign answers 401/403 JSON like every other admin API', async ({ request }) => {
    // app/api/admin/pd-campaign/route.ts uses the PAGE helper requireAdmin()
    // (lib/auth/protect.ts) instead of requireApiAdmin(): no rate limit, and
    // an anonymous caller gets a redirect to /login instead of a 401.
    const res = await request.patch('/api/admin/pd-campaign', {
      data: { id: '00000000-0000-4000-8000-000000000000', status: 'replied' },
      maxRedirects: 0,
    });
    const text = await res.text();
    expect(res.status(), `body: ${text.slice(0, 200)}`).toBeLessThan(500);
    test.fail(res.status() >= 300 && res.status() < 400, 'pd-campaign PATCH redirects anonymous callers instead of answering 401');
    expect([401, 403]).toContain(res.status());
  });

  test('seeker cannot reach admin pages or APIs', async ({ page }) => {
    test.skip(!getSeekerCreds(), 'E2E_SEEKER creds missing');
    const c = attach(page);
    await loginAsSeeker(page);
    await page.goto('/admin', { waitUntil: 'domcontentloaded' });
    await page.waitForURL((u) => !u.pathname.startsWith('/admin'), { timeout: 60_000 });
    expect(page.url()).toMatch(/\/unauthorized|\/login|\/dashboard/);
    expect(await bodyText(page)).not.toMatch(/Admin Dashboard|Admin Panel/);

    await page.goto('/admin/jobs', { waitUntil: 'domcontentloaded' });
    await page.waitForURL((u) => !u.pathname.startsWith('/admin'), { timeout: 60_000 });
    expect(await bodyText(page)).not.toMatch(/Jobs Management/);

    const api = await page.request.get('/api/admin/users');
    expect(api.status()).toBe(403);
    assertClean(c, 'seeker gating');
  });

  test('employer cannot reach admin pages or APIs', async ({ page }) => {
    test.skip(!getEmployerCreds(), 'E2E_EMPLOYER creds missing');
    const c = attach(page);
    await loginAsEmployer(page);
    await page.goto('/admin', { waitUntil: 'domcontentloaded' });
    await page.waitForURL((u) => !u.pathname.startsWith('/admin'), { timeout: 60_000 });
    expect(page.url()).toMatch(/\/unauthorized|\/login|\/dashboard/);
    expect(await bodyText(page)).not.toMatch(/Admin Dashboard|Admin Panel/);

    await page.goto('/admin/jobs', { waitUntil: 'domcontentloaded' });
    await page.waitForURL((u) => !u.pathname.startsWith('/admin'), { timeout: 60_000 });
    expect(await bodyText(page)).not.toMatch(/Jobs Management/);

    const api = await page.request.get('/api/admin/users');
    expect(api.status()).toBe(403);
    const jobs = await page.request.get('/api/admin/jobs');
    expect(jobs.status()).toBe(403);
    assertClean(c, 'employer gating');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 2. Every admin page renders (read-only)
 * ═══════════════════════════════════════════════════════════════════════════ */
interface AdminPageSpec { path: string; heading: RegExp; api?: string; expectText?: RegExp }
const ADMIN_PAGES: AdminPageSpec[] = [
  { path: '/admin', heading: /Admin Dashboard/, api: '/api/admin/analytics', expectText: /Active Jobs/ },
  { path: '/admin/analytics', heading: /^Analytics$/, api: '/api/admin/analytics' },
  { path: '/admin/blog', heading: /Blog Management/, api: '/api/admin/blog', expectText: /\d+ total posts/ },
  { path: '/admin/cron', heading: /Cron Health Dashboard/, api: '/api/admin/cron-list', expectText: /Trigger Manually/ },
  { path: '/admin/dmarc', heading: /DMARC/i },
  { path: '/admin/email', heading: /Email/i, api: '/api/admin/email/audience', expectText: /Compose/ },
  { path: '/admin/employers', heading: /^Employers$/, api: '/api/admin/employers' },
  { path: '/admin/health', heading: /Health/i, api: '/api/admin/health' },
  { path: '/admin/jobs', heading: /Jobs Management/, api: '/api/admin/jobs', expectText: /[1-9][\d,]* total jobs/ },
  { path: '/admin/outreach', heading: /Employer Outreach/, api: '/api/outreach' },
  { path: '/admin/pd-campaign', heading: /PD Campaign|Program Director/i },
  { path: '/admin/pipeline', heading: /Pipeline/i, api: '/api/admin/pipeline-flow' },
  { path: '/admin/seo-health', heading: /SEO/i },
  { path: '/admin/settings', heading: /^Settings$/ },
  { path: '/admin/testimonials', heading: /Employer Testimonials/ },
  { path: '/admin/users', heading: /Users & Subscribers/, api: '/api/admin/users', expectText: /Showing \d+ of [1-9]\d*/ },
];

test.describe('admin pages render', () => {
  test.skip(!HAS_ADMIN, 'E2E_ADMIN creds missing');
  test.use({ storageState: async ({ adminStatePath }, use) => { await use(adminStatePath); } });

  for (const spec of ADMIN_PAGES) {
    test(`${spec.path} renders real data or an honest empty state`, async ({ page }) => {
      const c = attach(page);
      const apiRes = spec.api
        ? page.waitForResponse((r) => r.url().includes(spec.api!), { timeout: 90_000 }).catch(() => null)
        : Promise.resolve(null);
      await gotoAdmin(page, spec.path);
      await expect(page).toHaveURL(new RegExp(spec.path.replace(/\//g, '\\/') + '\\/?$'));
      await expect(page.getByRole('heading', { level: 1, name: spec.heading }).first()).toBeVisible({ timeout: 60_000 });
      const res = await apiRes;
      if (spec.api) {
        expect(res, `${spec.api} never called`).not.toBeNull();
        expect(res!.status(), `${spec.api} status`).toBeLessThan(500);
        // 301 = middleware strips ?page=1 from API URLs too; the browser
        // follows it, so the page still renders. That defect has its own test
        // ("admin API canonicalisation"), so it is tolerated here.
        expect(
          [200, 301],
          `${spec.api} status (429 = shared admin bucket exhausted)`,
        ).toContain(res!.status());
      }
      await waitSettled(page);
      const text = await bodyText(page);
      expect(text).not.toMatch(ERROR_TEXT);
      if (spec.expectText) expect(text).toMatch(spec.expectText);
      assertClean(c, spec.path);
    });
  }

  test('/admin/analytics window buttons and every tab render without errors', async ({ page }) => {
    test.setTimeout(180_000);
    const c = attach(page);
    const first = page.waitForResponse((r) => r.url().includes('/api/admin/analytics?days=30'), { timeout: 90_000 });
    await gotoAdmin(page, '/admin/analytics');
    expect((await first).status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: /^Analytics$/ })).toBeVisible({ timeout: 60_000 });
    for (const tab of [/^Engagement$/, /^User Growth$/, /^Feedback$/, /^Reports$/, /^Overview$/]) {
      await page.getByRole('button', { name: tab }).click();
      await waitSettled(page);
      expect(await bodyText(page)).not.toMatch(ERROR_TEXT);
    }
    const seven = page.waitForResponse((r) => r.url().includes('/api/admin/analytics?days=7'), { timeout: 90_000 });
    await paceAdminCalls(page);
    await page.getByRole('button', { name: /^7d$/ }).click();
    expect((await seven).status()).toBe(200);
    await waitSettled(page);
    expect(await bodyText(page)).not.toMatch(ERROR_TEXT);
    assertClean(c, '/admin/analytics tabs');
  });

  test('/admin/cron lists every vercel.json cron with last-run info', async ({ page }) => {
    // BUG (feature gap): the cron page shows schedule + a manual trigger only.
    // There is no last-run / success / duration column even though CronRun
    // rows exist and /admin/seo-health and /admin/pipeline render them.
    const c = attach(page);
    const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf-8'));
    const cronCount: number = vercel.crons.length;
    await gotoAdmin(page, '/admin/cron');
    await expect(page.getByRole('heading', { level: 1, name: /Cron Health Dashboard/ })).toBeVisible({ timeout: 60_000 });
    await waitSettled(page);
    await expect(page.getByRole('button', { name: /Trigger Manually/ })).toHaveCount(cronCount);
    assertClean(c, '/admin/cron');
    test.fail(true, '/admin/cron renders no last-run information for any cron');
    expect(await bodyText(page)).toMatch(/last run|last ran|ran at|succeeded|failed at/i);
  });

  test('/admin/settings shows live config, not hard-coded status badges', async ({ page }) => {
    // BUG (misleading state): app/admin/settings/page.tsx is a static client
    // component; every "Active" / "Enabled" badge is hard-coded and never
    // reads env or DB. The AI feature flags (which have a real API) are not
    // surfaced at all.
    const c = attach(page);
    await gotoAdmin(page, '/admin/settings');
    await expect(page.getByRole('heading', { level: 1, name: /^Settings$/ })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Job Aggregators/)).toBeVisible();
    assertClean(c, '/admin/settings');
    test.fail(true, 'settings page is static: no live flag state, no AI flag controls');
    expect(await bodyText(page)).toMatch(/feature flag|ai\.candidate|ai\.employer/i);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 3. Data endpoints the pages depend on
 * ═══════════════════════════════════════════════════════════════════════════ */
test.describe('admin data endpoints', () => {
  test.skip(!HAS_ADMIN, 'E2E_ADMIN creds missing');
  test.use({ storageState: async ({ adminStatePath }, use) => { await use(adminStatePath); } });

  test('cron-list, health, pipeline-flow and pseo/health return well-formed data', async ({ page }) => {
    attach(page);
    const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf-8'));
    const crons = await adminFetch(page, 'GET', '/api/admin/cron-list');
    expect(crons.status).toBe(200);
    expect(crons.json.crons).toHaveLength(vercel.crons.length);

    const health = await adminFetch(page, 'GET', '/api/admin/health');
    expect(health.status, health.text.slice(0, 200)).toBe(200);
    expect(health.json.catalog.total).toBeGreaterThan(0);
    expect(health.json.catalog.published).toBeGreaterThan(0);

    const pipeline = await adminFetch(page, 'GET', '/api/admin/pipeline-flow');
    expect(pipeline.status, pipeline.text.slice(0, 200)).toBe(200);
    expect(Array.isArray(pipeline.json.recentRuns)).toBe(true);
    expect(Array.isArray(pipeline.json.today?.funnels)).toBe(true);

    const pseo = await page.request.get('/api/pseo/health');
    expect(pseo.status()).toBe(200);
    const pseoJson = await pseo.json();
    expect(pseoJson.status).toBe('healthy');
    expect(pseoJson.overview.totalLiveJobs).toBeGreaterThan(0);
  });

  test('AI flags and stats endpoints work; override toggle round-trips', async ({ page }) => {
    attach(page);
    const flags = await adminFetch(page, 'GET', '/api/admin/ai/flags');
    expect(flags.status).toBe(200);
    expect(flags.json.flags.length).toBeGreaterThan(0);
    const target = flags.json.flags[0] as { flag: string; default: boolean };

    // Override with enabled === compiled default and a 2-minute expiry so
    // behaviour never changes and the row self-cleans (there is no DELETE).
    const expiresAt = new Date(Date.now() + 2 * 60_000).toISOString();
    const set = await adminFetch(page, 'POST', '/api/admin/ai/flags', {
      flag: target.flag, tenantType: 'global', tenantId: null,
      enabled: target.default, reason: 'e2e hunt h0902 round-trip', expiresAt,
    });
    expect(set.status, set.text).toBe(200);
    expect(set.json.override.flag).toBe(target.flag);

    const after = await adminFetch(page, 'GET', '/api/admin/ai/flags');
    const row = after.json.overrides.find((o: any) => o.flag === target.flag && o.tenantType === 'global');
    expect(row, 'override visible after POST').toBeTruthy();
    expect(row.enabled).toBe(target.default);

    // Validation paths
    const unknown = await adminFetch(page, 'POST', '/api/admin/ai/flags', {
      flag: 'ai.does.not.exist', tenantType: 'global', tenantId: null, enabled: true,
    });
    expect(unknown.status).toBe(400);
    const badTenant = await adminFetch(page, 'POST', '/api/admin/ai/flags', {
      flag: target.flag, tenantType: 'employer', tenantId: null, enabled: true,
    });
    expect(badTenant.status).toBe(400);
    const badJson = await adminFetch(page, 'POST', '/api/admin/ai/flags', 'not-json{');
    expect(badJson.status).toBe(400);

    const stats = await adminFetch(page, 'GET', '/api/admin/ai/stats?days=7');
    expect(stats.status, stats.text.slice(0, 200)).toBe(200);
    expect(stats.json.windowDays).toBe(7);
    expect(typeof stats.json.totals.calls).toBe('number');
    const statsBad = await adminFetch(page, 'GET', '/api/admin/ai/stats?days=abc');
    expect(statsBad.status).toBe(200);
    expect(statsBad.json.windowDays).toBe(7);
  });

  test('analytics rejects a non-numeric days param with 400, not 500', async ({ page }) => {
    // BUG: app/api/admin/analytics/route.ts parseInt('abc') -> NaN -> Invalid
    // Date passed to Prisma -> caught -> 500.
    attach(page);
    test.fail(true, 'GET /api/admin/analytics?days=abc returns 500');
    const res = await adminFetch(page, 'GET', '/api/admin/analytics?days=abc');
    expect(res.status, res.text.slice(0, 200)).toBeLessThan(500);
  });

  test('admin test endpoints: read-only and dry-run surfaces only', async ({ page }) => {
    attach(page);
    // lifecycle-test GET = HTML registry + preview; POST would email, so never called.
    const index = await adminFetch(page, 'GET', '/api/admin/lifecycle-test');
    expect(index.status).toBe(200);
    expect(index.headers['content-type']).toMatch(/text\/html/);
    const ids = [...index.text.matchAll(/\?emailId=([a-z0-9_]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(0);
    const preview = await adminFetch(page, 'GET', `/api/admin/lifecycle-test?emailId=${ids[0]}`);
    expect(preview.status).toBe(200);
    expect(preview.text).toMatch(/<html|<table|<body/i);
    const unknown = await adminFetch(page, 'GET', '/api/admin/lifecycle-test?emailId=nope');
    expect(unknown.status).toBe(404);

    // match-digest-test GET = stats; POST with bogus id must 404 before any send.
    const digestStats = await adminFetch(page, 'GET', '/api/admin/match-digest-test');
    expect(digestStats.status, digestStats.text.slice(0, 200)).toBe(200);
    expect(digestStats.json.success).toBe(true);
    const digestMissing = await adminFetch(page, 'POST', '/api/admin/match-digest-test', {
      employerJobId: 'e2e-hunt-does-not-exist', dryRun: true,
    });
    expect(digestMissing.status, digestMissing.text.slice(0, 200)).toBe(404);

    // system-message-test: GET usage; POST dryRun=1 writes nothing per route contract.
    const smUsage = await adminFetch(page, 'GET', '/api/admin/system-message-test');
    expect(smUsage.status).toBe(200);
    expect(smUsage.json.usage).toMatch(/dryRun/);
    const smDry = await adminFetch(page, 'POST', '/api/admin/system-message-test?side=candidate&dryRun=1');
    expect(smDry.status, smDry.text.slice(0, 200)).toBe(200);
    expect(smDry.json.dryRun).toBe(true);
    expect(smDry.json.conversationId).toBeNull();
    expect(typeof smDry.json.body).toBe('string');
    expect(smDry.json.body).not.toMatch(/founder|Pavan/i);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 4. Users
 * ═══════════════════════════════════════════════════════════════════════════ */
test.describe('admin users', () => {
  test.skip(AGAINST_PROD, 'no mutations against production');
  test.skip(!HAS_ADMIN, 'E2E_ADMIN creds missing');
  test.use({ storageState: async ({ adminStatePath }, use) => { await use(adminStatePath); } });

  test('search by email finds testseeker, opens the profile drawer, and filters honestly', async ({ page }) => {
    const seeker = getSeekerCreds();
    test.skip(!seeker, 'E2E_SEEKER creds missing');
    const c = attach(page);
    await gotoAdmin(page, '/admin/users');
    await expect(page.getByRole('heading', { level: 1, name: /Users & Subscribers/ })).toBeVisible({ timeout: 60_000 });
    await waitSettled(page);

    const search = page.getByPlaceholder(/Search name or email/i);
    await search.fill(seeker!.email);
    const row = page.locator('tr', { hasText: seeker!.email });
    await expect(row).toHaveCount(1);
    await expect(page.getByText(/Showing 1 of \d+/)).toBeVisible();
    await expect(row.locator('select')).toHaveValue('job_seeker');

    // Open the profile drawer from the name cell
    await row.locator('td').first().click();
    const modal = page.getByRole('heading', { name: /User Profile/ });
    await expect(modal).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(seeker!.email).nth(1)).toBeVisible();
    await modal.locator('..').getByRole('button').first().click();
    await expect(modal).toHaveCount(0);

    // Role filter narrows, nonsense search yields the empty state
    await page.locator('select').filter({ hasText: 'All Roles' }).selectOption('employer');
    await expect(row).toHaveCount(0);
    await page.locator('select').filter({ hasText: 'All Roles' }).selectOption('all');
    await search.fill('zzz-no-such-user-h0902-<script>alert(1)</script>');
    await expect(page.getByText(/No users found/)).toBeVisible();
    await expect(page.getByText(/Showing 0 of/)).toBeVisible();
    assertClean(c, '/admin/users search');
  });

  test('role change and deactivate on a throwaway account persist and revert', async ({ page, browser }, testInfo) => {
    test.setTimeout(240_000);
    const c = attach(page);
    const email = await signupThrowaway(browser, testInfo.project.use.baseURL);

    const list = await adminFetch(page, 'GET', '/api/admin/users');
    expect(list.status).toBe(200);
    const user = list.json.users.find((u: any) => u.email.toLowerCase() === email.toLowerCase());
    test.skip(!user, `throwaway ${email} did not appear in /api/admin/users (signup may need email confirmation)`);

    await gotoAdmin(page, '/admin/users');
    await expect(page.getByRole('heading', { level: 1, name: /Users & Subscribers/ })).toBeVisible({ timeout: 60_000 });
    await waitSettled(page);
    await page.getByPlaceholder(/Search name or email/i).fill(email);
    const row = page.locator('tr', { hasText: email });
    await expect(row).toHaveCount(1);

    const patch = page.waitForResponse((r) => r.url().includes(`/api/admin/users/${user.id}`) && r.request().method() === 'PATCH');
    await row.locator('select').selectOption('employer');
    const patchRes = await patch;
    expect(patchRes.status()).toBe(200);
    await expect(page.getByText(/Role updated to employer/)).toBeVisible();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitSettled(page);
    await page.getByPlaceholder(/Search name or email/i).fill(email);
    await expect(row.locator('select')).toHaveValue('employer');

    // Deactivate (soft) through the UI, confirm dialog accepted
    page.once('dialog', (d) => d.accept());
    const del = page.waitForResponse((r) => r.url().includes(`/api/admin/users/${user.id}`) && r.request().method() === 'DELETE');
    await row.locator('button[title="Deactivate"]').click();
    expect((await del).status()).toBe(200);
    await expect(row.getByText('Hidden')).toBeVisible();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitSettled(page);
    await page.getByPlaceholder(/Search name or email/i).fill(email);
    await expect(row.getByText('Hidden')).toBeVisible();

    // Revert both via API (the UI offers no restore control)
    const revert = await adminFetch(page, 'PATCH', `/api/admin/users/${user.id}`, {
      role: 'job_seeker', profileVisible: true, openToOffers: false,
    });
    expect(revert.status, revert.text).toBe(200);
    expect(revert.json.user.role).toBe('job_seeker');
    expect(revert.json.user.profileVisible).toBe(true);
    assertClean(c, 'users role/deactivate');
  });

  test('subscriber, employer-lead and alert tabs show counts that match the API payload', async ({ page }) => {
    const c = attach(page);
    const apiRes = page.waitForResponse((r) => r.url().endsWith('/api/admin/users') && r.request().method() === 'GET', { timeout: 90_000 });
    await gotoAdmin(page, '/admin/users');
    const json = await (await apiRes).json();
    await expect(page.getByRole('heading', { level: 1, name: /Users & Subscribers/ })).toBeVisible({ timeout: 60_000 });
    await waitSettled(page);

    await page.getByRole('button', { name: /^Subscribers \(\d+\)$/ }).click();
    await expect(page.getByText(new RegExp(`^Showing ${json.emailLeads.length}$`))).toBeVisible();
    if (json.emailLeads.length > 0) {
      await expect(page.locator('tbody tr')).toHaveCount(json.emailLeads.length);
    }
    await page.locator('select').first().selectOption('without');
    const without = json.emailLeads.filter((l: any) => !l.hasAccount).length;
    await expect(page.getByText(new RegExp(`^Showing ${without}$`))).toBeVisible();

    await page.getByRole('button', { name: /^Employer Leads \(\d+\)$/ }).click();
    const leads = (json.employerLeads || []).length;
    await expect(page.getByText(new RegExp(`^Showing ${leads}$`))).toBeVisible();
    if (leads === 0) await expect(page.getByText(/No employer leads/)).toBeVisible();

    await page.getByRole('button', { name: /^Alerts \(\d+\)$/ }).click();
    const alertRows = json.emailLeads.reduce((n: number, l: any) => n + l.jobAlerts.length, 0);
    await expect(page.locator('tbody tr')).toHaveCount(alertRows);
    expect(json.summary.totalAlerts).toBe(alertRows);
    assertClean(c, '/admin/users tabs');
  });

  test('deactivated users have no restore control in the UI', async ({ page }) => {
    // BUG (UX): /admin/users offers Deactivate (DELETE -> profileVisible=false)
    // but no button to restore; the only path back is a raw PATCH.
    const c = attach(page);
    await gotoAdmin(page, '/admin/users');
    await expect(page.getByRole('heading', { level: 1, name: /Users & Subscribers/ })).toBeVisible({ timeout: 60_000 });
    await waitSettled(page);
    assertClean(c, '/admin/users');
    test.fail(true, 'no restore / reactivate control on /admin/users');
    await expect(page.getByRole('button', { name: /restore|reactivate|unhide/i }).first()).toBeVisible({ timeout: 5_000 });
  });

  test('PATCH /api/admin/users/:id validates role and empty body', async ({ page }) => {
    attach(page);
    const seeker = getSeekerCreds();
    test.skip(!seeker, 'E2E_SEEKER creds missing');
    const list = await adminFetch(page, 'GET', '/api/admin/users');
    const user = list.json.users.find((u: any) => u.email.toLowerCase() === seeker!.email.toLowerCase());
    expect(user, 'testseeker present').toBeTruthy();
    const badRole = await adminFetch(page, 'PATCH', `/api/admin/users/${user.id}`, { role: 'superuser' });
    expect(badRole.status).toBe(400);
    const empty = await adminFetch(page, 'PATCH', `/api/admin/users/${user.id}`, { nothing: true });
    expect(empty.status).toBe(400);
    // confirm nothing changed
    const detail = await adminFetch(page, 'GET', `/api/admin/users/${user.id}`);
    expect(detail.status).toBe(200);
    expect(detail.json.user.role).toBe('job_seeker');
  });

  test('PATCH /api/admin/users/:id with a non-boolean flag answers 400, not 500', async ({ page }) => {
    // BUG: app/api/admin/users/[id]/route.ts copies profileVisible/openToOffers
    // without type checks; Prisma rejects the string and the catch returns 500.
    attach(page);
    const seeker = getSeekerCreds();
    test.skip(!seeker, 'E2E_SEEKER creds missing');
    const list = await adminFetch(page, 'GET', '/api/admin/users');
    const user = list.json.users.find((u: any) => u.email.toLowerCase() === seeker!.email.toLowerCase());
    test.fail(true, 'non-boolean profileVisible returns 500');
    const res = await adminFetch(page, 'PATCH', `/api/admin/users/${user.id}`, { profileVisible: 'yes' });
    expect(res.status, res.text).toBe(400);
  });

  test('PATCH /api/admin/users/:id for an unknown id answers 404, not 500', async ({ page }) => {
    // BUG: prisma.update on a missing row throws P2025 which the catch maps to 500.
    attach(page);
    test.fail(true, 'unknown user id returns 500');
    const res = await adminFetch(page, 'PATCH', '/api/admin/users/00000000-0000-4000-8000-000000000000', { role: 'employer' });
    expect(res.status, res.text).toBe(404);
  });

  test('an admin cannot demote their own account through the role endpoint', async ({ page, browser }, testInfo) => {
    // BUG (guardrail): PATCH /api/admin/users/:id has no self-target check, so
    // an admin can strip their own admin role and lock themselves out.
    test.setTimeout(240_000);
    attach(page);
    const email = await signupThrowaway(browser, testInfo.project.use.baseURL);
    const list = await adminFetch(page, 'GET', '/api/admin/users');
    const user = list.json.users.find((u: any) => u.email.toLowerCase() === email.toLowerCase());
    test.skip(!user, 'throwaway not visible in admin users list');
    const promote = await adminFetch(page, 'PATCH', `/api/admin/users/${user.id}`, { role: 'admin' });
    expect(promote.status, promote.text).toBe(200);

    const ctx = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
    const other = await ctx.newPage();
    let loggedIn = true;
    try {
      await other.goto('/login', { waitUntil: 'domcontentloaded' });
      await other.waitForLoadState('networkidle').catch(() => undefined);
      await other.locator('input[type="email"]').first().fill(email);
      await other.locator('input[type="password"]').first().fill(TEST_PASSWORD);
      await other.locator('button[type="submit"]').first().click();
      await other.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 });
    } catch {
      loggedIn = false;
    }
    if (!loggedIn) {
      await ctx.close();
      await adminFetch(page, 'PATCH', `/api/admin/users/${user.id}`, { role: 'job_seeker' });
      test.skip(true, 'throwaway could not sign in (email confirmation required)');
    }
    await paceAdminCalls(page);
    noteAdminCall();
    const self = await other.request.patch(`/api/admin/users/${user.id}`, { data: { role: 'job_seeker' } });
    const selfText = await self.text();
    await ctx.close();
    // Always leave the throwaway as a seeker
    await adminFetch(page, 'PATCH', `/api/admin/users/${user.id}`, { role: 'job_seeker' });
    test.fail(true, 'self-demotion is accepted with 200');
    expect(self.status(), selfText).toBe(400);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 5. Jobs
 * ═══════════════════════════════════════════════════════════════════════════ */
test.describe('admin jobs', () => {
  test.skip(AGAINST_PROD, 'no mutations against production');
  test.skip(!HAS_ADMIN, 'E2E_ADMIN creds missing');
  test.use({ storageState: async ({ adminStatePath }, use) => { await use(adminStatePath); } });

  const HUNT_TITLE_PREFIX = 'E2E Hunt h0902 PMHNP';
  const HUNT_EMPLOYER = 'E2E Hunt Employer h0902';

  async function createHuntJob(page: Page, suffix: string): Promise<{ id: string; slug: string; title: string }> {
    const title = `${HUNT_TITLE_PREFIX} ${suffix} ${Date.now()}`;
    const res = await adminFetch(page, 'POST', '/api/admin/jobs', {
      title, employer: HUNT_EMPLOYER, location: 'Austin, TX', city: 'Austin', state: 'Texas',
      description: 'Scratch posting created by the admin bug-hunt spec. Safe to delete.',
      applyLink: 'https://example.com/apply-h0902', isPublished: true,
    });
    expect(res.status, res.text).toBe(201);
    return { id: res.json.job.id, slug: res.json.job.slug, title };
  }

  async function hardDelete(page: Page, id: string): Promise<void> {
    const res = await adminFetch(page, 'DELETE', `/api/admin/jobs/${id}?hard=true`);
    expect([200, 404]).toContain(res.status);
  }

  test('search finds the Test Corp employer job and the source filter has an employer bucket', async ({ page }) => {
    const c = attach(page);
    await gotoAdmin(page, '/admin/jobs');
    await expect(page.getByRole('heading', { level: 1, name: /Jobs Management/ })).toBeVisible({ timeout: 60_000 });
    await waitSettled(page);
    const sourceSelect = page.locator('select').filter({ hasText: 'All Sources' });
    await expect(sourceSelect.locator('option', { hasText: /^employer \(\d+\)$/ })).toHaveCount(1);

    const listRes = page.waitForResponse((r) => r.url().includes('/api/admin/jobs?') && r.url().includes('search=Test'));
    await page.getByPlaceholder(/Search title or employer/i).fill('Test Corp');
    // 301 = the middleware ?page=1 strip; see "admin API canonicalisation".
    expect([200, 301]).toContain((await listRes).status());
    await waitSettled(page);
    const rows = page.locator('tbody tr', { hasText: 'Test Corp' });
    await expect(rows.first()).toBeVisible({ timeout: 30_000 });
    expect(await rows.count()).toBeGreaterThan(0);

    // 301 tolerated here too; see "admin API canonicalisation".
    const srcRes = page.waitForResponse((r) => r.url().includes('source=employer'));
    await sourceSelect.selectOption('employer');
    expect([200, 301]).toContain((await srcRes).status());
    await waitSettled(page);
    await expect(rows.first()).toBeVisible();
    assertClean(c, '/admin/jobs search');
  });

  test('edit a field, verify persistence on reload, then revert', async ({ page }) => {
    test.setTimeout(180_000);
    const c = attach(page);
    const job = await createHuntJob(page, 'edit');
    try {
      await gotoAdmin(page, '/admin/jobs');
      await expect(page.getByRole('heading', { level: 1, name: /Jobs Management/ })).toBeVisible({ timeout: 60_000 });
      await page.getByPlaceholder(/Search title or employer/i).fill(job.title);
      const row = page.locator('tbody tr', { hasText: job.title });
      await expect(row).toHaveCount(1, { timeout: 30_000 });
      await row.locator('button[title="Edit"]').click();
      await expect(page.getByRole('heading', { name: /Edit Job/ })).toBeVisible();
      const locationInput = page.locator('label', { hasText: /^Location$/ }).locator('..').locator('input');
      await expect(locationInput).toHaveValue('Austin, TX');
      await locationInput.fill('Dallas, TX (edited h0902) ünïcode');
      const patch = page.waitForResponse((r) => r.url().includes(`/api/admin/jobs/${job.id}`) && r.request().method() === 'PATCH');
      await page.getByRole('button', { name: /Save Changes/ }).click();
      expect((await patch).status()).toBe(200);
      await expect(page.getByText(/Job updated/)).toBeVisible();

      const detail = await adminFetch(page, 'GET', `/api/admin/jobs/${job.id}`);
      expect(detail.json.job.location).toBe('Dallas, TX (edited h0902) ünïcode');

      const revert = await adminFetch(page, 'PATCH', `/api/admin/jobs/${job.id}`, { location: 'Austin, TX' });
      expect(revert.status).toBe(200);
      const again = await adminFetch(page, 'GET', `/api/admin/jobs/${job.id}`);
      expect(again.json.job.location).toBe('Austin, TX');
      assertClean(c, 'jobs edit');
    } finally {
      await hardDelete(page, job.id);
    }
  });

  test('saving the edit modal keeps untouched optional fields null instead of writing empty strings', async ({ page }) => {
    // app/admin/jobs/page.tsx openEdit() seeds displaySalary/jobType/mode with
    // `job.x || ''` and saveEdit() PATCHes the whole form, so a job created
    // with null optional fields comes back with '' after any unrelated edit.
    test.setTimeout(180_000);
    const c = attach(page);
    const job = await createHuntJob(page, 'nulls');
    try {
      const before = await adminFetch(page, 'GET', `/api/admin/jobs/${job.id}`);
      expect(before.json.job.jobType).toBeNull();
      expect(before.json.job.mode).toBeNull();
      expect(before.json.job.displaySalary).toBeNull();

      await gotoAdmin(page, '/admin/jobs');
      await expect(page.getByRole('heading', { level: 1, name: /Jobs Management/ })).toBeVisible({ timeout: 60_000 });
      await page.getByPlaceholder(/Search title or employer/i).fill(job.title);
      const row = page.locator('tbody tr', { hasText: job.title });
      await expect(row).toHaveCount(1, { timeout: 30_000 });
      await row.locator('button[title="Edit"]').click();
      const titleInput = page.locator('label', { hasText: /^Title$/ }).locator('..').locator('input');
      await titleInput.fill(`${job.title} renamed`);
      const patch = page.waitForResponse((r) => r.url().includes(`/api/admin/jobs/${job.id}`) && r.request().method() === 'PATCH');
      await page.getByRole('button', { name: /Save Changes/ }).click();
      expect((await patch).status()).toBe(200);
      await expect(page.getByText(/Job updated/)).toBeVisible();

      const after = await adminFetch(page, 'GET', `/api/admin/jobs/${job.id}`);
      expect(after.json.job.title).toBe(`${job.title} renamed`);
      assertClean(c, 'jobs edit nulls');
      test.fail(true, 'edit modal writes "" into null jobType/mode/displaySalary');
      expect(after.json.job.jobType, 'jobType should stay null').toBeNull();
      expect(after.json.job.mode, 'mode should stay null').toBeNull();
      expect(after.json.job.displaySalary, 'displaySalary should stay null').toBeNull();
    } finally {
      await hardDelete(page, job.id);
    }
  });

  test('bulk unpublish then publish is reflected on the public job page', async ({ page }) => {
    test.setTimeout(240_000);
    const c = attach(page);
    const job = await createHuntJob(page, 'bulk');
    try {
      const livePublic = await page.request.get(`/jobs/${job.slug}`, { maxRedirects: 0 });
      expect(livePublic.status(), 'freshly created published job is public').toBe(200);

      await gotoAdmin(page, '/admin/jobs');
      await expect(page.getByRole('heading', { level: 1, name: /Jobs Management/ })).toBeVisible({ timeout: 60_000 });
      await page.getByPlaceholder(/Search title or employer/i).fill(job.title);
      const row = page.locator('tbody tr', { hasText: job.title });
      await expect(row).toHaveCount(1, { timeout: 30_000 });
      await row.locator('input[type="checkbox"]').check();
      await expect(page.getByText(/1 selected/)).toBeVisible();
      // Scope to the bulk bar: every row also carries a button titled
      // "Unpublish", so an unscoped role lookup is ambiguous.
      const bulkBar = page.getByText(/^\d+ selected$/).locator('..');
      const bulk1 = page.waitForResponse((r) => r.url().includes('/api/admin/jobs/bulk'));
      await bulkBar.getByRole('button', { name: 'Unpublish', exact: true }).click();
      expect((await bulk1).status()).toBe(200);
      await expect(page.getByText(/unpublish: 1 job/)).toBeVisible();
      await expect(row.getByTitle('Click to publish')).toBeVisible({ timeout: 30_000 });

      const gonePublic = await page.request.get(`/jobs/${job.slug}`, { maxRedirects: 0 });
      const statusAfterUnpublish = gonePublic.status();

      await row.locator('input[type="checkbox"]').check();
      const bulk2 = page.waitForResponse((r) => r.url().includes('/api/admin/jobs/bulk'));
      await bulkBar.getByRole('button', { name: 'Publish', exact: true }).click();
      expect((await bulk2).status()).toBe(200);
      await expect(row.getByTitle('Click to unpublish')).toBeVisible({ timeout: 30_000 });

      const backPublic = await page.request.get(`/jobs/${job.slug}`, { maxRedirects: 0 });
      expect(backPublic.status(), 'republished job is public again').toBe(200);
      assertClean(c, 'jobs bulk');
      // BUG: middleware.ts caches its per-job "live" verdict for 60s
      // (MIDDLEWARE_CACHE_TTL_MS) and /jobs/[slug] is ISR-cached for an hour
      // (revalidate = 3600). No admin mutation path calls revalidatePath or
      // busts that cache, so a job unpublished in the admin console keeps
      // serving a 200 "live job" page to the public.
      test.fail(statusAfterUnpublish === 200, 'unpublished job still public: no cache invalidation on admin mutations');
      expect([404, 410], 'unpublished job must not be public').toContain(statusAfterUnpublish);
    } finally {
      await hardDelete(page, job.id);
    }
  });

  test('bulk and PATCH validation: bad action, empty ids, past expiry, script in title', async ({ page }) => {
    test.setTimeout(180_000);
    const c = attach(page);
    const job = await createHuntJob(page, 'validate');
    try {
      const badAction = await adminFetch(page, 'POST', '/api/admin/jobs/bulk', { action: 'explode', jobIds: [job.id] });
      expect(badAction.status).toBe(400);
      const noIds = await adminFetch(page, 'POST', '/api/admin/jobs/bulk', { action: 'publish', jobIds: [] });
      expect(noIds.status).toBe(400);
      const past = await adminFetch(page, 'PATCH', `/api/admin/jobs/${job.id}`, { expiresAt: '2020-01-01T00:00:00Z' });
      expect(past.status).toBe(400);
      const noFields = await adminFetch(page, 'PATCH', `/api/admin/jobs/${job.id}`, { bogus: 1 });
      expect(noFields.status).toBe(400);

      // Script tag in title must be stored inert and rendered escaped (no dialog)
      const evil = `${job.title} <script>alert("h0902")</script>`;
      const patch = await adminFetch(page, 'PATCH', `/api/admin/jobs/${job.id}`, { title: evil });
      expect(patch.status).toBe(200);
      let dialogs = 0;
      page.on('dialog', (d) => { dialogs += 1; void d.dismiss(); });
      await gotoAdmin(page, '/admin/jobs');
      await page.getByPlaceholder(/Search title or employer/i).fill('h0902 PMHNP validate');
      await expect(page.locator('tbody tr', { hasText: 'alert("h0902")' })).toHaveCount(1, { timeout: 30_000 });
      expect(dialogs).toBe(0);
      assertClean(c, 'jobs validation');
    } finally {
      await hardDelete(page, job.id);
    }
  });

  test('GET /api/admin/jobs with a non-numeric page answers 400, not 500', async ({ page }) => {
    // BUG: app/api/admin/jobs/route.ts Math.max(1, parseInt('abc')) is NaN,
    // Prisma rejects skip=NaN and the catch returns 500.
    attach(page);
    test.fail(true, 'page=abc returns 500');
    const res = await adminFetch(page, 'GET', '/api/admin/jobs?page=abc&limit=5');
    expect(res.status, res.text.slice(0, 200)).toBeLessThan(500);
  });

  test('PATCH /api/admin/jobs/:id rejects a non-boolean isPublished with 400, not 500', async ({ page }) => {
    // BUG: PATCH copies allow-listed fields with no type checks; a string
    // isPublished reaches Prisma and surfaces as 500.
    attach(page);
    const job = await createHuntJob(page, 'types');
    try {
      test.fail(true, 'isPublished="yes" returns 500');
      const res = await adminFetch(page, 'PATCH', `/api/admin/jobs/${job.id}`, { isPublished: 'yes' });
      expect(res.status, res.text).toBe(400);
    } finally {
      await hardDelete(page, job.id);
    }
  });

  test('PATCH /api/admin/jobs/:id refuses an empty title', async ({ page }) => {
    // BUG: an empty string title is accepted (200) and the job stays published
    // with no title on the public listing.
    attach(page);
    const job = await createHuntJob(page, 'empty-title');
    try {
      test.fail(true, 'empty title accepted with 200');
      const res = await adminFetch(page, 'PATCH', `/api/admin/jobs/${job.id}`, { title: '   ' });
      expect(res.status, res.text).toBe(400);
    } finally {
      await hardDelete(page, job.id);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 6. Employers org rollup
 * ═══════════════════════════════════════════════════════════════════════════ */
test.describe('admin employers', () => {
  test.skip(!HAS_ADMIN, 'E2E_ADMIN creds missing');
  test.use({ storageState: async ({ adminStatePath }, use) => { await use(adminStatePath); } });

  test('org rollup shows Test Corp and the search narrows to it', async ({ page }) => {
    const c = attach(page);
    const api = page.waitForResponse((r) => r.url().includes('/api/admin/employers'), { timeout: 90_000 });
    await gotoAdmin(page, '/admin/employers');
    await expect(page.getByRole('heading', { level: 1, name: /^Employers$/ })).toBeVisible({ timeout: 60_000 });
    const res = await api;
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.organizations.length).toBeGreaterThan(0);
    const testCorp = json.organizations.find((o: any) =>
      o.name?.toLowerCase().includes('test corp') || o.allNames?.some((n: string) => n.toLowerCase().includes('test corp')));
    expect(testCorp, 'Test Corp organization present in rollup').toBeTruthy();

    await waitSettled(page);
    await page.getByPlaceholder(/Search organization/i).fill('Test Corp');
    const rows = page.locator('tbody tr', { hasText: /Test Corp/i });
    await expect(rows.first()).toBeVisible();
    await page.getByPlaceholder(/Search organization/i).fill('zzz-none-h0902');
    await expect(page.getByText(/No organizations found/)).toBeVisible();
    assertClean(c, '/admin/employers');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 7. Blog
 * ═══════════════════════════════════════════════════════════════════════════ */
test.describe('admin blog', () => {
  test.skip(AGAINST_PROD, 'no mutations against production');
  test.skip(!HAS_ADMIN, 'E2E_ADMIN creds missing');
  test.use({ storageState: async ({ adminStatePath }, use) => { await use(adminStatePath); } });

  test('create draft, edit body, publish/unpublish toggle, public visibility, delete', async ({ page }) => {
    test.setTimeout(240_000);
    const c = attach(page);
    const title = `E2E Hunt h0902 Draft ${Date.now()}`;
    await gotoAdmin(page, '/admin/blog');
    await expect(page.getByRole('heading', { level: 1, name: /Blog Management/ })).toBeVisible({ timeout: 60_000 });
    await waitSettled(page);

    await page.getByRole('button', { name: /New Post/ }).click();
    await expect(page.getByRole('heading', { name: /New Blog Post/ })).toBeVisible();
    // Empty submit is rejected client-side
    await page.getByRole('button', { name: /Create Post/ }).click();
    await expect(page.getByText(/Title, content, and category are required/)).toBeVisible();

    await page.getByPlaceholder(/Blog post title/i).fill(title);
    await page.getByPlaceholder(/Write your blog post content/i).fill('## Scratch post\n\nCreated by the admin hunt spec. <script>alert("blog")</script>');
    const create = page.waitForResponse((r) => r.url().endsWith('/api/admin/blog') && r.request().method() === 'POST');
    await page.getByRole('button', { name: /Create Post/ }).click();
    const createRes = await create;
    expect(createRes.status()).toBe(201);
    const created = (await createRes.json()).post;
    await expect(page.getByText(/Post created/)).toBeVisible();
    const row = page.locator('tbody tr', { hasText: title });
    await expect(row).toHaveCount(1, { timeout: 30_000 });
    await expect(row.getByTitle('Click to publish')).toBeVisible();

    try {
      // Draft is not public
      const draftPublic = await page.request.get(`/blog/${created.slug}`, { maxRedirects: 0 });
      expect(draftPublic.status()).toBe(404);

      // Edit body, save, verify via API
      await row.locator('button[title="Edit"]').click();
      await expect(page.getByRole('heading', { name: /Edit Post/ })).toBeVisible();
      const contentBox = page.getByPlaceholder(/Write your blog post content/i);
      await expect(contentBox).toHaveValue(/Scratch post/);
      await contentBox.fill('## Scratch post edited\n\nSecond revision from the hunt spec.');
      const put = page.waitForResponse((r) => r.url().includes(`/api/admin/blog/${created.id}`) && r.request().method() === 'PUT');
      await page.getByRole('button', { name: /Update Post/ }).click();
      expect((await put).status()).toBe(200);
      await expect(page.getByText(/Post updated/)).toBeVisible();
      const detail = await adminFetch(page, 'GET', `/api/admin/blog/${created.id}`);
      expect(detail.json.post.content).toMatch(/Second revision/);

      // Publish toggle -> public 200; unpublish -> 404
      const pub = page.waitForResponse((r) => r.url().includes(`/api/admin/blog/${created.id}`) && r.request().method() === 'PUT');
      await row.getByTitle('Click to publish').click();
      expect((await pub).status()).toBe(200);
      await expect(page.getByText(/Published!/)).toBeVisible();
      await expect(row.getByTitle('Click to unpublish')).toBeVisible();
      // Count dialogs only while the public post is open; a persistent
      // listener would later swallow the delete confirm this test must accept.
      let dialogs = 0;
      const countDialog = (d: import('@playwright/test').Dialog) => { dialogs += 1; void d.dismiss(); };
      page.on('dialog', countDialog);
      await page.goto(`/blog/${created.slug}`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible({ timeout: 60_000 });
      expect(dialogs, 'script tag in markdown must not execute').toBe(0);
      page.off('dialog', countDialog);

      await gotoAdmin(page, '/admin/blog');
      await waitSettled(page);
      const unpub = page.waitForResponse((r) => r.url().includes(`/api/admin/blog/${created.id}`) && r.request().method() === 'PUT');
      await row.getByTitle('Click to unpublish').click();
      expect((await unpub).status()).toBe(200);
      await expect(row.getByTitle('Click to publish')).toBeVisible();
      const unpubPublic = await page.request.get(`/blog/${created.slug}`, { maxRedirects: 0 });
      expect(unpubPublic.status()).toBe(404);

      // Delete through the UI
      page.once('dialog', (d) => d.accept());
      const del = page.waitForResponse((r) => r.url().includes(`/api/admin/blog/${created.id}`) && r.request().method() === 'DELETE');
      await row.locator('button[title="Delete"]').click();
      expect((await del).status()).toBe(200);
      await expect(page.getByText(/Post deleted/)).toBeVisible();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitSettled(page);
      await expect(page.locator('tbody tr', { hasText: title })).toHaveCount(0);
      assertClean(c, 'blog lifecycle');
    } finally {
      await adminFetch(page, 'DELETE', `/api/admin/blog/${created.id}`);
    }
  });

  test('the Preview link on a draft opens a page that exists', async ({ page }) => {
    // BUG: the eye icon links to /blog/<slug>, but lib/blog.ts getPostBySlug
    // filters status='published', so every draft preview is a 404.
    test.setTimeout(180_000);
    attach(page);
    const create = await adminFetch(page, 'POST', '/api/admin/blog', {
      title: `E2E Hunt h0902 Preview ${Date.now()}`, content: 'preview body', category: 'career_myths', status: 'draft',
    });
    expect(create.status).toBe(201);
    const post = create.json.post;
    try {
      await gotoAdmin(page, '/admin/blog');
      await waitSettled(page);
      const row = page.locator('tbody tr', { hasText: post.title });
      await expect(row).toHaveCount(1, { timeout: 30_000 });
      const href = await row.locator('a[title="Preview"]').getAttribute('href');
      expect(href).toBe(`/blog/${post.slug}`);
      test.fail(true, 'draft preview link resolves to 404');
      const res = await page.request.get(href!, { maxRedirects: 0 });
      expect(res.status()).toBe(200);
    } finally {
      await adminFetch(page, 'DELETE', `/api/admin/blog/${post.id}`);
    }
  });

  test('the category filter and editor offer every category that existing posts use', async ({ page }) => {
    // app/admin/blog/page.tsx hard-codes 9 categories while lib/blog.ts
    // defines 13; posts in the other four cannot be filtered and their
    // category shows as a raw id.
    const c = attach(page);
    const list = await adminFetch(page, 'GET', '/api/admin/blog');
    expect(list.status).toBe(200);
    const used = [...new Set((list.json.posts as Array<{ category: string }>).map((p) => p.category))].sort();
    await gotoAdmin(page, '/admin/blog');
    await expect(page.getByRole('heading', { level: 1, name: /Blog Management/ })).toBeVisible({ timeout: 60_000 });
    await waitSettled(page);
    const options = await page.locator('select').filter({ hasText: 'All Categories' }).locator('option').evaluateAll(
      (els) => els.map((e) => (e as HTMLOptionElement).value),
    );
    const missing = used.filter((cat) => !options.includes(cat));
    assertClean(c, '/admin/blog categories');
    test.fail(missing.length > 0, `categories used by posts but absent from the admin dropdown: ${missing.join(', ')}`);
    expect(missing, 'every category in use is selectable').toEqual([]);
  });

  test('blog API validation: missing fields 400, bogus status rejected, unknown id 404', async ({ page }) => {
    attach(page);
    const missing = await adminFetch(page, 'POST', '/api/admin/blog', { title: 'no content' });
    expect(missing.status).toBe(400);

    const create = await adminFetch(page, 'POST', '/api/admin/blog', {
      title: `E2E Hunt h0902 Status ${Date.now()}`, content: 'x', category: 'career_myths', status: 'draft',
    });
    expect(create.status).toBe(201);
    const post = create.json.post;
    try {
      // BUG: PUT /api/admin/blog/:id copies any status string; "bogus" is
      // stored and the post is neither draft nor published.
      const bogus = await adminFetch(page, 'PUT', `/api/admin/blog/${post.id}`, { status: 'bogus' });
      const detail = await adminFetch(page, 'GET', `/api/admin/blog/${post.id}`);
      expect.soft(bogus.status, 'bogus status should be a 400').toBe(400);
      expect.soft(detail.json.post.status, 'stored status must stay draft/published').toMatch(/^(draft|published)$/);
      // BUG: unknown id -> Prisma P2025 -> 500
      const unknown = await adminFetch(page, 'PUT', '/api/admin/blog/00000000-0000-4000-8000-000000000000', { title: 'x' });
      expect.soft(unknown.status, unknown.text).toBe(404);
      test.fail(true, 'blog PUT accepts arbitrary status and 500s on unknown id');
      expect(test.info().errors.length, 'soft failures above').toBe(0);
    } finally {
      await adminFetch(page, 'DELETE', `/api/admin/blog/${post.id}`);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 8. Email broadcasts (no send)
 * ═══════════════════════════════════════════════════════════════════════════ */
test.describe('admin email (never sends)', () => {
  test.skip(!HAS_ADMIN, 'E2E_ADMIN creds missing');
  test.use({ storageState: async ({ adminStatePath }, use) => { await use(adminStatePath); } });

  test('audience preview counts update per segment and the composer accepts a subject', async ({ page }) => {
    test.setTimeout(180_000);
    const c = attach(page);
    const first = page.waitForResponse((r) => r.url().includes('/api/admin/email/audience?segment=all'), { timeout: 90_000 });
    await gotoAdmin(page, '/admin/email');
    const firstRes = await first;
    expect(firstRes.status()).toBe(200);
    const allJson = await firstRes.json();
    expect(allJson.count).toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: new RegExp(`Send to ${allJson.count.toLocaleString()} Recipients`) })).toBeVisible({ timeout: 30_000 });

    const audienceSelect = page.locator('select').first();
    const seg = page.waitForResponse((r) => r.url().includes('segment=employers'));
    await audienceSelect.selectOption('employers');
    const segJson = await (await seg).json();
    expect(segJson.segment).toBe('employers');
    expect(segJson.count).toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: new RegExp(`Send to ${segJson.count.toLocaleString()} Recipients`) })).toBeVisible({ timeout: 30_000 });

    await page.getByPlaceholder(/Exciting new features/i).fill('E2E hunt h0902 subject (never sent)');
    await expect(page.getByPlaceholder(/Exciting new features/i)).toHaveValue(/h0902/);
    // Send button exists but is never clicked.
    await expect(page.getByRole('button', { name: /Send to .* Recipients/ })).toBeVisible();
    assertClean(c, '/admin/email compose');
  });

  test('Test Send targets the signed-in admin, not a hard-coded personal address', async ({ page }) => {
    // BUG: app/admin/email/page.tsx handleTestSend() posts to
    // /api/admin/email/send with customEmails: ['<hard-coded personal
    // address>'], so every admin's "Test Send" mails one fixed inbox and the
    // address ships in the public client bundle. Never clicked here: the
    // bundle is inspected instead.
    const c = attach(page);
    const scripts: Array<{ url: string; body: string }> = [];
    page.on('response', async (res) => {
      // Every script is inspected, not just chunks whose URL mentions "email":
      // in dev the admin page ships as hashed chunks with no route hint.
      if (res.request().resourceType() !== 'script') return;
      try { scripts.push({ url: res.url(), body: await res.text() }); } catch { /* ignore */ }
    });
    await gotoAdmin(page, '/admin/email');
    await expect(page.getByRole('heading', { level: 1, name: /Email Broadcasts/ })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('button', { name: /Test Send/ })).toBeVisible();
    await expect.poll(() => scripts.length, { timeout: 30_000 }).toBeGreaterThan(0);
    // Only literals inside a customEmails recipient array count; the bundle
    // legitimately carries brand and schema addresses.
    const recipientLiteral = /customEmails\s*:\s*\[\s*["'`]([^"'`]+@[^"'`]+)["'`]/g;
    const found = scripts.flatMap((s) =>
      [...s.body.matchAll(recipientLiteral)]
        .map((m) => m[1])
        .filter((addr) => !/@(pmhnphiring\.com|example\.com)$/i.test(addr))
        .map((addr) => `${addr} in ${s.url}`),
    );
    assertClean(c, '/admin/email bundle');
    test.fail(found.length > 0, 'hard-coded recipient address in the admin email bundle');
    expect(found, 'no personal email literals in the client bundle').toEqual([]);
  });

  test('save-as-template from the composer, list it on the Templates tab, delete it', async ({ page }) => {
    test.skip(AGAINST_PROD, 'no mutations against production');
    test.setTimeout(180_000);
    const c = attach(page);
    const name = `E2E hunt h0902 tpl ${Date.now()}`;
    await gotoAdmin(page, '/admin/email');
    await expect(page.getByRole('heading', { level: 1, name: /Email Broadcasts/ })).toBeVisible({ timeout: 60_000 });

    const saveBtn = page.getByRole('button', { name: /Save Template/ });
    await expect(saveBtn).toBeDisabled();
    await page.getByPlaceholder(/Exciting new features/i).fill('Template subject h0902 {{firstName}}');
    const bodyBox = page.locator('textarea').first();
    await bodyBox.fill('Hi {{firstName}},\n\nTemplate body from the hunt spec. ünïcode <script>alert(1)</script>');
    await expect(bodyBox).toHaveValue(/Template body from the hunt spec/);
    await page.getByPlaceholder(/Template name/i).fill(name);
    await expect(page.getByPlaceholder(/Template name/i)).toHaveValue(name);
    await expect(saveBtn).toBeEnabled();
    const post = page.waitForResponse((r) => r.url().includes('/api/admin/email/templates') && r.request().method() === 'POST');
    await saveBtn.click();
    const postRes = await post;
    expect(postRes.status()).toBe(200);
    const created = (await postRes.json()).template;
    try {
      await expect(page.getByText(/Template saved/)).toBeVisible();
      await page.getByRole('button', { name: /^Templates$/ }).click();
      const card = page.locator('h3', { hasText: name }).locator('..').locator('..').locator('..');
      await expect(card).toHaveCount(1, { timeout: 30_000 });
      await expect(card.getByText(/Template subject h0902/)).toBeVisible();
      let dialogs = 0;
      page.on('dialog', (d) => { dialogs += 1; void d.dismiss(); });
      expect(dialogs).toBe(0);

      const del = page.waitForResponse((r) => r.url().includes(`/api/admin/email/templates?id=${created.id}`) && r.request().method() === 'DELETE');
      await card.getByRole('button').first().click();
      expect((await del).status()).toBe(200);
      await expect(page.getByText(/Template deleted/)).toBeVisible();
      await expect(page.locator('h3', { hasText: name })).toHaveCount(0, { timeout: 30_000 });
      const after = await adminFetch(page, 'GET', '/api/admin/email/templates');
      expect(after.json.templates.some((t: any) => t.id === created.id)).toBe(false);
      assertClean(c, '/admin/email templates');
    } finally {
      await adminFetch(page, 'DELETE', `/api/admin/email/templates?id=${created.id}`);
    }
  });

  test('History tab lists past broadcasts or an honest empty state', async ({ page }) => {
    const c = attach(page);
    await gotoAdmin(page, '/admin/email');
    await expect(page.getByRole('heading', { level: 1, name: /Email Broadcasts/ })).toBeVisible({ timeout: 60_000 });
    const hist = page.waitForResponse((r) => r.url().includes('/api/admin/email/history'), { timeout: 60_000 });
    await page.getByRole('button', { name: /^History$/ }).click();
    const histRes = await hist;
    expect(histRes.status()).toBe(200);
    const json = await histRes.json();
    await expect(page.getByRole('heading', { name: /Send History/ })).toBeVisible();
    if (json.broadcasts.length === 0) {
      await expect(page.getByText(/No broadcasts sent yet/)).toBeVisible();
    } else {
      await expect(page.locator('tbody tr')).toHaveCount(json.broadcasts.length);
    }
    assertClean(c, '/admin/email history');
  });

  test('template preview renders HTML with merge tags substituted', async ({ page }) => {
    attach(page);
    const res = await adminFetch(page, 'POST', '/api/admin/email/preview', {
      subject: 'Hello {{firstName}} h0902',
      body: 'Hi {{firstName}},\n\n**Bold** and [link](https://example.com)\n\nBye',
    });
    expect(res.status, res.text.slice(0, 200)).toBe(200);
    expect(res.json.subject).toBe('Hello Sarah h0902');
    expect(res.json.html).toMatch(/Hi Sarah/);
    expect(res.json.html).toMatch(/<strong>Bold<\/strong>/);
    expect(res.json.html).not.toMatch(/founder|Pavan/i);
    const missing = await adminFetch(page, 'POST', '/api/admin/email/preview', { subject: 'only subject' });
    expect(missing.status).toBe(400);

    const index = await adminFetch(page, 'GET', '/api/admin/email/test');
    expect(index.status).toBe(200);
    expect(index.headers['content-type']).toMatch(/text\/html/);
    const tpl = await adminFetch(page, 'GET', '/api/admin/email/test?template=welcome');
    expect([200, 404]).toContain(tpl.status);
    if (tpl.status === 200) expect(tpl.text).toMatch(/<html/i);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 9. Testimonials
 * ═══════════════════════════════════════════════════════════════════════════ */
test.describe('admin testimonials', () => {
  test.skip(AGAINST_PROD, 'no mutations against production');
  test.skip(!HAS_ADMIN, 'E2E_ADMIN creds missing');
  test.use({ storageState: async ({ adminStatePath }, use) => { await use(adminStatePath); } });

  test('list matches API, feature/unfeature round-trips on a test item when one exists, validation holds', async ({ page }) => {
    const c = attach(page);
    const api = await adminFetch(page, 'GET', '/api/admin/testimonials');
    expect(api.status).toBe(200);
    const items = api.json.testimonials as Array<{ id: string; employerName: string; consent: boolean; featuredAt: string | null }>;

    await gotoAdmin(page, '/admin/testimonials');
    await expect(page.getByRole('heading', { level: 1, name: /Employer Testimonials/ })).toBeVisible({ timeout: 60_000 });
    await waitSettled(page);
    if (items.length === 0) {
      await expect(page.getByText(/No employer testimonials have been submitted yet/)).toBeVisible();
    } else {
      await expect(page.locator('tbody tr')).toHaveCount(items.length);
    }

    const bad = await adminFetch(page, 'PATCH', '/api/admin/testimonials', { id: 'x', featured: 'yes' });
    expect(bad.status).toBe(400);
    const missing = await adminFetch(page, 'PATCH', '/api/admin/testimonials', { id: '00000000-0000-4000-8000-000000000000', featured: true });
    expect(missing.status).toBe(404);

    const testItem = items.find((t) => /test|e2e/i.test(t.employerName) && t.consent);
    test.skip(!testItem, 'no consented test testimonial to toggle');
    const row = page.locator('tbody tr', { hasText: testItem!.employerName }).first();
    const wasFeatured = testItem!.featuredAt !== null;
    const flip = page.waitForResponse((r) => r.url().includes('/api/admin/testimonials') && r.request().method() === 'PATCH');
    await row.getByRole('button', { name: wasFeatured ? /Unfeature/ : /^Feature$/ }).click();
    expect((await flip).status()).toBe(200);
    await expect(row.getByText(wasFeatured ? 'Hidden' : 'Featured')).toBeVisible();
    const back = await adminFetch(page, 'PATCH', '/api/admin/testimonials', { id: testItem!.id, featured: wasFeatured });
    expect(back.status).toBe(200);
    assertClean(c, '/admin/testimonials');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 10. Rate limit behaviour (deliberately last: exhausts the shared bucket)
 * ═══════════════════════════════════════════════════════════════════════════ */
test.describe('admin rate limit', () => {
  test.skip(!HAS_ADMIN, 'E2E_ADMIN creds missing');
  test.use({ storageState: async ({ adminStatePath }, use) => { await use(adminStatePath); } });

  test('jobs page surfaces a 429 instead of silently showing "No jobs found"', async ({ page }) => {
    // BUG: every /api/admin/* route shares one 20 req/min IP bucket; when it
    // trips, app/admin/jobs/page.tsx ignores the non-success payload and
    // renders "0 total jobs / No jobs found" with no error message.
    test.setTimeout(240_000);
    const c = attach(page);
    // Fired concurrently: on this dev box a single admin call takes seconds,
    // so a sequential loop of 26 spans more than the 60s window and never
    // trips the limiter.
    const statuses = await Promise.all(
      Array.from({ length: 30 }, () =>
        page.request
          .get('/api/admin/ai/stats?days=1', { timeout: 60_000 })
          .then((r) => r.status())
          .catch(() => 0),
      ),
    );
    const sawLimit = statuses.includes(429);
    expect(sawLimit, `admin bucket should trip within 30 concurrent calls, saw: ${[...new Set(statuses)].join(',')}`).toBe(true);

    const listRes = page.waitForResponse((r) => r.url().includes('/api/admin/jobs?'), { timeout: 90_000 });
    await page.goto('/admin/jobs', { waitUntil: 'domcontentloaded' });
    const status = (await listRes).status();
    await waitSettled(page);
    const text = await bodyText(page);
    assertClean(c, 'rate limited jobs page');
    test.fail(status === 429, 'UI shows "No jobs found" on 429 with no error state');
    if (status === 429) {
      expect(text).toMatch(/too many requests|rate limit|try again/i);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 11. Silent failures and copy (added after the first triage pass)
 * ═══════════════════════════════════════════════════════════════════════════ */
test.describe('admin silent failures', () => {
  test.skip(!HAS_ADMIN, 'E2E_ADMIN creds missing');
  test.use({ storageState: async ({ adminStatePath }, use) => { await use(adminStatePath); } });

  test('a failed role change tells the admin something went wrong', async ({ page }) => {
    // BUG: app/admin/users/page.tsx changeRole() only acts on `if (res.ok)`.
    // A 403/429/500 leaves no message at all: the <select> snaps back to the
    // old role and the operator believes nothing happened by accident.
    // The PATCH is intercepted, so no user row is ever modified.
    const seeker = getSeekerCreds();
    test.skip(!seeker, 'E2E_SEEKER creds missing');
    const c = attach(page);
    await gotoAdmin(page, '/admin/users');
    await expect(page.getByRole('heading', { level: 1, name: /Users & Subscribers/ })).toBeVisible({ timeout: 60_000 });
    await waitSettled(page);

    await page.route('**/api/admin/users/*', async (route) => {
      if (route.request().method() !== 'PATCH') return route.fallback();
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'Failed to update user' }),
      });
    });

    await page.getByPlaceholder(/Search name or email/i).fill(seeker!.email);
    const row = page.locator('tr', { hasText: seeker!.email });
    await expect(row).toHaveCount(1, { timeout: 30_000 });
    await row.locator('select').selectOption('employer');
    // The role must not have changed anywhere.
    await expect(row.locator('select')).toHaveValue('job_seeker');
    // The 500 here is injected by this test, so only page-level errors matter.
    expect(c.pageErrors, `page errors: ${c.pageErrors.join(' | ')}`).toEqual([]);
    test.fail(true, 'no error banner when PATCH /api/admin/users/:id fails');
    await expect(page.getByText(/failed|error|could not/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test('a failed job edit tells the admin something went wrong', async ({ page }) => {
    // BUG: app/admin/jobs/page.tsx saveEdit() also only acts on `if (res.ok)`.
    // On a non-2xx the modal just stays open with no message. Intercepted, so
    // no job row is modified.
    test.setTimeout(180_000);
    const c = attach(page);
    await gotoAdmin(page, '/admin/jobs');
    await expect(page.getByRole('heading', { level: 1, name: /Jobs Management/ })).toBeVisible({ timeout: 60_000 });
    await waitSettled(page);

    await page.route('**/api/admin/jobs/*', async (route) => {
      if (route.request().method() !== 'PATCH') return route.fallback();
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'Failed to update job' }),
      });
    });

    const firstRow = page.locator('tbody tr').first();
    await expect(firstRow).toBeVisible({ timeout: 30_000 });
    await firstRow.locator('button[title="Edit"]').click();
    await expect(page.getByRole('heading', { name: /Edit Job/ })).toBeVisible();
    const locationInput = page.locator('label', { hasText: /^Location$/ }).locator('..').locator('input');
    await locationInput.fill('Nowhere, ZZ (intercepted h0902)');
    await page.getByRole('button', { name: /Save Changes/ }).click();
    // Modal stays open, which is the only signal the admin gets.
    await expect(page.getByRole('heading', { name: /Edit Job/ })).toBeVisible();
    // The 500 here is injected by this test, so only page-level errors matter.
    expect(c.pageErrors, `page errors: ${c.pageErrors.join(' | ')}`).toEqual([]);
    test.fail(true, 'no error banner when PATCH /api/admin/jobs/:id fails');
    await expect(page.getByText(/failed|error|could not/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test('admin dashboard subtitle follows the no-dash copy rule', async ({ page }) => {
    // COPY: app/admin/page.tsx:214 renders "PMHNP Hiring overview, last 30
    // days"; product copy rules forbid em/en dashes (fixed).
    const c = attach(page);
    await gotoAdmin(page, '/admin');
    const h1 = page.getByRole('heading', { level: 1, name: /Admin Dashboard/ });
    await expect(h1).toBeVisible({ timeout: 60_000 });
    const subtitle = await h1.locator('xpath=following-sibling::p[1]').innerText();
    assertClean(c, '/admin copy');
    expect(subtitle, `subtitle: ${subtitle}`).not.toMatch(/[\u2013\u2014]/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 12. Admin data reachable without an admin session
 * ═══════════════════════════════════════════════════════════════════════════ */
test.describe('admin data exposure', () => {
  test('the SEO-health data endpoint is not readable anonymously', async ({ request }) => {
    // BUG: app/api/pseo/health/route.ts has no auth guard at all, yet it is the
    // data source behind /admin/seo-health. Anyone can read catalog size and
    // pSEO coverage, and every cold call runs several unindexed aggregates.
    const res = await request.get('/api/pseo/health');
    const body = await res.text();
    expect(res.status(), body.slice(0, 200)).toBeLessThan(500);
    test.fail(res.status() === 200, 'internal catalog metrics served to anonymous callers');
    expect([401, 403]).toContain(res.status());
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 13. Middleware canonicalisation leaking onto admin APIs
 * ═══════════════════════════════════════════════════════════════════════════ */
test.describe('admin API canonicalisation', () => {
  test('GET /api/admin/jobs?page=1 is answered, not 301-redirected', async ({ request }) => {
    // BUG: middleware.ts strips ?page=1 with a 301 for SEO canonicalisation,
    // and its matcher covers /api/*. app/admin/jobs/page.tsx always sends
    // page=1 (line 94), so every first page of the admin jobs list costs an
    // extra round trip; a non-GET or cross-origin caller carrying page=1 is
    // broken outright (a 301 turns POST into GET and drops CORS headers).
    // Checked anonymously: the redirect happens before the route's auth.
    const withPage = await request.get('/api/admin/jobs?page=1&limit=5', { maxRedirects: 0 });
    const withoutPage = await request.get('/api/admin/jobs?limit=5', { maxRedirects: 0 });
    expect(withoutPage.status(), 'control: no page param reaches the route').toBe(401);
    test.fail(
      withPage.status() >= 300 && withPage.status() < 400,
      'middleware 301-redirects /api/admin/jobs?page=1 instead of letting the route answer',
    );
    expect(withPage.status(), `Location: ${withPage.headers()['location'] ?? ''}`).toBe(401);
  });

  test('an uppercase segment in an admin API path is not silently lowercased', async ({ request }) => {
    // BUG: the same middleware block 301-lowercases any pathname containing an
    // uppercase letter. Its comment claims API routes are excluded; the code
    // excludes only /_next. Path tokens are lowercase hex today, so this is
    // latent rather than exploitable, but any future case-sensitive token in
    // an API path segment would be corrupted before the route ever sees it.
    const res = await request.get('/api/admin/Jobs?limit=5', { maxRedirects: 0 });
    test.fail(res.status() >= 300 && res.status() < 400, 'API pathnames are 301-lowercased by middleware');
    expect(res.status(), `Location: ${res.headers()['location'] ?? ''}`).toBeLessThan(300);
  });
});
