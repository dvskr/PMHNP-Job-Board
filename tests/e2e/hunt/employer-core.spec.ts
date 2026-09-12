import { test, expect, type Page, type APIResponse } from '@playwright/test';
import { getEmployerCreds, uniqueEmail, TEST_PASSWORD } from '../fixtures/auth';
import { attachErrorCollectors, assertClean, type Collected } from './_helpers';

/**
 * Bug-hunt slice "employer-core" (run tag h0902).
 *
 * Journey: an employer signs in (or signs up), lands on the employer
 * dashboard, walks the 4-step /post-job wizard (validation, Quill editor,
 * screening questions, logo upload, AI JD, JD templates), previews, hands off
 * to checkout, then manages a listing: public page, search visibility,
 * pause/unpause, edit-by-token, archive/restore, renewal and checkout guards,
 * billing/usage/invoice/receipt APIs, settings and notification persistence,
 * analytics + CSV export, legacy token dashboard, sign-out redirects and copy
 * rules.
 *
 * Every test is independent and re-runnable. Data-mutating describes skip
 * against production.
 *
 * Pricing model these specs run against: every post is paid and every post
 * goes through Stripe Checkout. The first post per employer identity is half
 * price, the rest are standard price, and there is no route that publishes a
 * listing without payment. A suite that never completes a payment therefore
 * cannot create a listing, so the "job lifecycle" block adopts an existing
 * "E2E Hunt PMHNP" listing and skips when there is none. Checkout itself is
 * still exercised: the hand-off runs up to the Stripe-hosted page and the
 * navigation is aborted at that boundary, so a session is created and never
 * paid.
 */

const AGAINST_PROD =
  !!process.env.PLAYWRIGHT_BASE_URL && process.env.PLAYWRIGHT_BASE_URL.includes('pmhnphiring.com');
const HAS_EMPLOYER = getEmployerCreds() !== null;
const RUN_TAG = 'h0902';

// next dev compiles routes on first hit and the shared DB answers slowly under
// load, so API calls and clicks get a longer budget than the config default.
test.use({ actionTimeout: 45_000, navigationTimeout: 60_000 });

// Minimal valid 1x1 PNG (base64) used for logo upload tests.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const TINY_SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>');

// The 200-char minimum is on visible text. This description also carries an
// explicit licensure restriction so the eligibility extractor (Remote posts
// only) populates eligibleStateCodes = [TX, CA] for the public Role Snapshot.
const DESCRIPTION_TEXT =
  'We are hiring a psychiatric mental health nurse practitioner for an outpatient telepsychiatry program serving adults with anxiety, depression and ADHD. ' +
  'You will manage a panel of about 250 patients, complete initial evaluations and medication management follow-ups, and collaborate with therapists and a supervising psychiatrist. ' +
  'Candidates must be licensed in Texas and California. ' +
  'Schedule is Monday through Friday with no weekends, and full benefits are included.';

async function employerLogin(page: Page): Promise<void> {
  const creds = getEmployerCreds();
  if (!creds) throw new Error('E2E_EMPLOYER_EMAIL/PASS not set');
  await page.goto('/employer/login', { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/\/login\?role=employer|\/employer\/dashboard/, { timeout: 60_000, waitUntil: 'domcontentloaded' });
  if (/\/employer\/dashboard/.test(page.url())) return;
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.locator('button[type="submit"]').first().waitFor({ state: 'visible' });
  await page.locator('input[type="email"]').first().fill(creds.email);
  await page.locator('input[type="password"]').first().fill(creds.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/employer\/dashboard/, { timeout: 60_000, waitUntil: 'domcontentloaded' });
}

/** Clear any server-side and local draft so wizard tests start empty. */
async function resetDraft(page: Page): Promise<void> {
  await page.request.delete('/api/job-draft').catch(() => undefined);
  await page.evaluate(() => {
    try {
      localStorage.removeItem('jobFormData');
      localStorage.removeItem('jobScreeningQuestions');
    } catch { /* ignore */ }
  }).catch(() => undefined);
}

async function json(res: APIResponse): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { __raw: text.slice(0, 300) };
  }
}

async function quotaStatus(page: Page): Promise<Record<string, unknown>> {
  const res = await page.request.get('/api/employer/post-price');
  expect(res.status(), 'post-price must answer 200 for a signed-in employer').toBe(200);
  return json(res);
}

function continueButton(page: Page) {
  return page.getByRole('button', { name: 'Continue', exact: true });
}

/**
 * The app's own modals. The cookie-consent banner is also role="dialog", so a
 * bare getByRole('dialog') is ambiguous on every page; only the app modals set
 * aria-modal="true".
 */
function modal(page: Page) {
  return page.locator('[role="dialog"][aria-modal="true"]');
}

/**
 * The auth pages mount an always-present empty aria-live region with
 * role="alert" (toast host), so a bare getByRole('alert') is ambiguous.
 * Only the alert that carries text is the form's error banner.
 */
function visibleAlert(page: Page) {
  return page.getByRole('alert').filter({ hasText: /\S/ }).first();
}

async function gotoWizard(page: Page): Promise<void> {
  await page.goto('/post-job', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#title')).toBeVisible({ timeout: 60_000 });
}

async function fillStep1(page: Page, title: string): Promise<void> {
  await page.locator('#title').fill(title);
  await page.locator('#companyName').fill('Test Corp');
  await page.locator('#companyWebsite').fill('https://www.testcorp-e2e.example.com');
  const email = getEmployerCreds()!.email;
  await page.locator('#contactEmail').fill(email);
  await continueButton(page).click();
  await expect(page.locator('#location')).toBeVisible({ timeout: 20_000 });
}

async function fillStep2(page: Page, opts: { mode?: string; jobType?: string } = {}): Promise<void> {
  await page.locator('#location').fill('Remote');
  await page.locator('label', { hasText: new RegExp(`^${opts.mode ?? 'Remote'}$`) }).click();
  await page.locator('label', { hasText: new RegExp(`^${opts.jobType ?? 'Full-Time'}$`) }).click();
  await page.locator('label', { hasText: /^2-4 years$/ }).click();
  await page.locator('#setting').selectOption('Telehealth');
  await page.locator('#population').selectOption('Adults');
  await continueButton(page).click();
  await expect(page.locator('.ql-editor')).toBeVisible({ timeout: 30_000 });
}

async function typeDescription(page: Page, text: string): Promise<void> {
  const editor = page.locator('.ql-editor');
  await editor.click();
  await page.keyboard.type(text);
}

async function fillStep3(page: Page): Promise<void> {
  await typeDescription(page, DESCRIPTION_TEXT);
  await continueButton(page).click();
  await expect(page.getByPlaceholder(/^Min/)).toBeVisible({ timeout: 20_000 });
}

async function fillStep4(page: Page, opts: { onPlatform?: boolean; min?: string; max?: string } = {}): Promise<void> {
  await page.locator('label', { hasText: /^Annual$/ }).click();
  await page.getByPlaceholder(/^Min/).fill(opts.min ?? '140000');
  await page.getByPlaceholder(/^Max/).fill(opts.max ?? '175000');
  await page.locator('label', { hasText: /Health Insurance/ }).click();
  await page.locator('label', { hasText: /CME Allowance/ }).click();
  if (opts.onPlatform ?? true) {
    await page.locator('label', { hasText: 'Receive on PMHNP Hiring' }).click();
    await expect(page.getByText(/Screening Questions/)).toBeVisible();
  } else {
    await page.locator('#applyUrl').fill('https://www.testcorp-e2e.example.com/careers/apply');
  }
}

/** Reads the employer's jobs as the dashboard renders them. */
interface DashboardJob {
  title: string;
  editToken: string | null;
  publicHref: string | null;
}

async function readDashboardJobs(page: Page): Promise<DashboardJob[]> {
  await page.goto('/employer/dashboard', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
  const cards = page.locator('.emp-job-card');
  const count = await cards.count();
  const jobs: DashboardJob[] = [];
  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    const title = (await card.locator('.emp-job-title').innerText()).trim();
    const editHref = await card.locator('a[href^="/jobs/edit/"]').first().getAttribute('href').catch(() => null);
    const publicHref = await card.locator('.emp-job-title').getAttribute('href');
    jobs.push({
      title,
      editToken: editHref ? editHref.replace('/jobs/edit/', '') : null,
      publicHref: publicHref && publicHref !== '#' ? publicHref : null,
    });
  }
  return jobs;
}

async function publicStatus(page: Page, path: string): Promise<number> {
  const res = await page.request.get(path, { maxRedirects: 0 });
  return res.status();
}

// ─────────────────────────────────────────────────────────────────────────────
// Login
// ─────────────────────────────────────────────────────────────────────────────

test.describe('employer login', () => {
  test.skip(!HAS_EMPLOYER, 'E2E_EMPLOYER_EMAIL / E2E_EMPLOYER_PASS not set');

  test('wrong password shows an inline error and stays on the employer login form', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await page.goto('/employer/login', { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/login\?role=employer/, { timeout: 60_000 });
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.locator('input[type="email"]').first().fill(getEmployerCreds()!.email);
    await page.locator('input[type="password"]').first().fill('definitely-wrong-password');
    await page.locator('button[type="submit"]').first().click();
    await expect(visibleAlert(page)).toBeVisible({ timeout: 30_000 });
    await expect(visibleAlert(page)).toContainText(/invalid|credentials|password/i);
    expect(page.url()).toMatch(/\/login\?role=employer/);
    assertClean(c, 'wrong password');
  });

  test('successful login lands on /employer/dashboard', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await employerLogin(page);
    expect(page.url()).toMatch(/\/employer\/dashboard/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
    assertClean(c, 'login');
  });

  test('already-authenticated employer visiting /employer/login is bounced to the employer dashboard', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await employerLogin(page);
    await page.goto('/employer/login', { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/employer\/dashboard/, { timeout: 60_000, waitUntil: 'domcontentloaded' });
    expect(page.url()).toMatch(/\/employer\/dashboard/);
    assertClean(c, 'login bounce');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Signup
// ─────────────────────────────────────────────────────────────────────────────

test.describe('employer signup', () => {
  test.skip(AGAINST_PROD, 'no mutations against production');

  test('signup form validates mismatched passwords, free email domains and warns that the company name is permanent', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await page.goto('/employer/signup', { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/signup\?role=employer/, { timeout: 60_000 });
    await page.waitForLoadState('networkidle').catch(() => undefined);

    // Permanence warning is visible next to the company field.
    await expect(page.locator('#signup-company')).toBeVisible();
    await expect(page.locator('#signup-company-note')).toContainText(/cannot be changed/i);

    // Empty submit is blocked by required attributes: still on the form.
    await page.locator('button[type="submit"]').first().click();
    expect(page.url()).toMatch(/\/signup/);
    await expect(page.locator('#signup-email')).toBeVisible();

    await page.locator('#signup-firstName').fill('E2e');
    await page.locator('#signup-lastName').fill('Employer');
    await page.locator('#signup-company').fill('E2E Hunt Clinic');

    // Free email provider is refused for employers.
    await page.locator('#signup-email').fill('e2e-employer@gmail.com');
    const pw = page.locator('input[type="password"]');
    await pw.nth(0).fill(TEST_PASSWORD);
    await pw.nth(1).fill(TEST_PASSWORD);
    await page.locator('button[type="submit"]').first().click();
    await expect(visibleAlert(page)).toContainText(/company email|free email/i, { timeout: 20_000 });

    // Mismatched confirmation.
    await page.locator('#signup-email').fill(uniqueEmail('employer'));
    await pw.nth(1).fill(TEST_PASSWORD + 'x');
    await page.locator('button[type="submit"]').first().click();
    await expect(visibleAlert(page)).toContainText(/do not match/i, { timeout: 20_000 });
    expect(page.url()).toMatch(/\/signup/);
    assertClean(c, 'signup validation');
  });

  test('fresh employer signup with a company name creates an employer profile (or asks for email confirmation)', async ({ page }) => {
    const c = attachErrorCollectors(page);
    const email = uniqueEmail('employer');
    await page.goto('/signup?role=employer', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.locator('#signup-firstName').fill('E2e');
    await page.locator('#signup-lastName').fill('Hunt');
    await page.locator('#signup-company').fill('E2E Hunt Behavioral Group');
    await page.locator('#signup-email').fill(email);
    const pw = page.locator('input[type="password"]');
    await pw.nth(0).fill(TEST_PASSWORD);
    await pw.nth(1).fill(TEST_PASSWORD);
    await page.locator('button[type="submit"]').first().click();

    const landed = await Promise.race([
      page.waitForURL(/\/employer\/dashboard/, { timeout: 60_000, waitUntil: 'domcontentloaded' }).then(() => 'dashboard' as const),
      page.getByText(/check your email/i).waitFor({ state: 'visible', timeout: 60_000 }).then(() => 'confirm' as const),
      visibleAlert(page).waitFor({ state: 'visible', timeout: 60_000 }).then(() => 'error' as const),
    ]);
    if (landed === 'error') {
      throw new Error(`signup surfaced an error: ${await visibleAlert(page).innerText()}`);
    }
    if (landed === 'dashboard') {
      const profile = await json(await page.request.get('/api/auth/profile'));
      expect(profile.role, `profile after employer signup: ${JSON.stringify(profile).slice(0, 300)}`).toBe('employer');
      expect(profile.company).toBe('E2E Hunt Behavioral Group');
      // Company name is locked from now on.
      const patch = await page.request.patch('/api/employer/settings', { data: { company: 'Renamed Co' } });
      expect(patch.status(), 'renaming the company after signup must be refused').toBe(409);
    }
    assertClean(c, `signup (${landed})`);
  });

  test('an existing job_seeker account can upgrade to employer through POST /api/auth/profile', async ({ page }) => {
    const c = attachErrorCollectors(page);
    const email = uniqueEmail('seeker');
    await page.goto('/signup', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.locator('#signup-firstName').fill('E2e');
    await page.locator('#signup-lastName').fill('Upgrader');
    await page.locator('#signup-email').fill(email);
    const pw = page.locator('input[type="password"]');
    await pw.nth(0).fill(TEST_PASSWORD);
    await pw.nth(1).fill(TEST_PASSWORD);
    await page.locator('button[type="submit"]').first().click();
    const landed = await Promise.race([
      page.waitForURL(/\/onboarding|\/dashboard/, { timeout: 60_000, waitUntil: 'domcontentloaded' }).then(() => 'session' as const),
      page.getByText(/check your email/i).waitFor({ state: 'visible', timeout: 60_000 }).then(() => 'confirm' as const),
    ]);
    test.skip(landed === 'confirm', 'email confirmation required; no session to exercise the upgrade path');

    const before = await json(await page.request.get('/api/auth/profile'));
    expect(before.role).toBe('job_seeker');

    const upgrade = await page.request.post('/api/auth/profile', {
      data: { firstName: 'E2e', lastName: 'Upgrader', role: 'employer', company: 'E2E Upgrade Clinic' },
    });
    expect(upgrade.status(), await upgrade.text()).toBe(200);
    const after = await json(await page.request.get('/api/auth/profile'));
    expect(after.role, `role after upgrade: ${JSON.stringify(after).slice(0, 200)}`).toBe('employer');
    expect(after.company).toBe('E2E Upgrade Clinic');

    // Employer surfaces now accept the account.
    const quota = await json(await page.request.get('/api/employer/post-price'));
    expect(quota.reason).not.toBe('not-employer');
    assertClean(c, 'role upgrade');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard and read-only APIs
// ─────────────────────────────────────────────────────────────────────────────

test.describe('employer dashboard and read APIs', () => {
  test.skip(!HAS_EMPLOYER, 'E2E_EMPLOYER_EMAIL / E2E_EMPLOYER_PASS not set');

  test('dashboard renders the employer header, stat tiles, tabs and a jobs list or empty state', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await employerLogin(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
    for (const label of ['Live Jobs', 'Total Views', 'Apply Clicks', 'Applicants']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByRole('button', { name: /My Jobs \(\d+\)/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Applicants/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Analytics/ }).first()).toBeVisible();
    const cards = page.locator('.emp-job-card');
    const postLink = page.getByRole('link', { name: /post.*job/i }).first();
    expect((await cards.count()) > 0 || (await postLink.isVisible()), 'either job cards or a post-job CTA').toBe(true);
    assertClean(c, 'dashboard');
  });

  test('post-price reports an eligible employer with a coherent price shape', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await employerLogin(page);
    const q = await quotaStatus(page);
    expect(q.eligible, JSON.stringify(q)).toBe(true);
    expect(typeof q.isFirstPost).toBe('boolean');
    // The kind, the remaining-discount counter and the quoted price must all
    // tell the same story: one half-price post per employer identity, then
    // the standard price with nothing left to discount.
    expect(q.priceKind).toBe(q.isFirstPost ? 'first' : 'standard');
    expect(q.remaining).toBe(q.isFirstPost ? 1 : 0);
    expect(typeof q.priceDollars).toBe('number');
    expect(Number(q.priceDollars) > 0).toBe(true);
    assertClean(c, 'post-price');
  });

  test('billing, usage, invoice and receipt APIs answer sanely for a free account', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await employerLogin(page);

    const billing = await page.request.get('/api/employer/billing');
    expect(billing.status()).toBe(200);
    const b = await json(billing);
    expect(Array.isArray(b.payments), JSON.stringify(b).slice(0, 300)).toBe(true);
    for (const p of b.payments as Array<Record<string, unknown>>) {
      expect(typeof p.jobId).toBe('string');
      expect(typeof p.isFree).toBe('boolean');
      expect(Array.isArray(p.charges)).toBe(true);
    }

    const usage = await page.request.get('/api/employer/usage');
    expect(usage.status()).toBe(200);
    const u = await json(usage);
    expect(typeof u.tier, JSON.stringify(u).slice(0, 300)).toBe('string');

    // Invoice / receipt without a jobId → 400; with a garbage jobId → 404, never 5xx.
    const invNo = await page.request.get('/api/employer/invoice');
    expect(invNo.status()).toBe(400);
    const invBad = await page.request.get('/api/employer/invoice?jobId=00000000-0000-0000-0000-000000000000');
    expect([400, 404]).toContain(invBad.status());
    const rcNo = await page.request.get('/api/employer/receipt');
    expect(rcNo.status()).toBe(400);
    const rcBad = await page.request.get('/api/employer/receipt?jobId=00000000-0000-0000-0000-000000000000');
    expect([400, 404]).toContain(rcBad.status());

    // A free posting has no invoice or receipt: must be a clean 4xx, not a 5xx.
    const freeJob = (b.payments as Array<Record<string, unknown>>).find((p) => p.isFree);
    if (freeJob) {
      const inv = await page.request.get(`/api/employer/invoice?jobId=${freeJob.jobId}`, { maxRedirects: 0 });
      expect(inv.status(), `invoice for free job: ${await inv.text()}`).toBeLessThan(500);
      const rc = await page.request.get(`/api/employer/receipt?jobId=${freeJob.jobId}`, { maxRedirects: 0 });
      expect(rc.status(), `receipt for free job: ${await rc.text()}`).toBeLessThan(500);
    }
    assertClean(c, 'billing apis');
  });

  test('analytics and benchmark APIs return aggregates; CSV endpoint is admin-only', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await employerLogin(page);
    const a = await page.request.get('/api/employer/analytics?days=30');
    expect(a.status()).toBe(200);
    const body = await json(a);
    const summary = body.summary as Record<string, number>;
    expect(typeof summary.totalViews).toBe('number');
    expect(typeof summary.ctr).toBe('number');

    const bench = await page.request.get('/api/employer/analytics/benchmarks');
    expect(bench.status()).toBe(200);
    const bb = await json(bench);
    expect(typeof (bb.benchmarks as Record<string, unknown>).avgViews).toBe('number');
    expect(Array.isArray(bb.employerJobs)).toBe(true);

    const csv = await page.request.get('/api/employer/analytics/csv');
    expect([403, 200]).toContain(csv.status());
    if (csv.status() === 200) {
      expect(csv.headers()['content-type']).toMatch(/text\/csv/);
    }
    assertClean(c, 'analytics apis');
  });

  test('/employer/analytics renders tiles and the CSV export produces a .csv download when jobs exist', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await employerLogin(page);
    await page.goto('/employer/analytics', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Job Analytics/ })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('Total views')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Loading analytics/)).toBeHidden({ timeout: 60_000 });
    const exportBtn = page.getByRole('button', { name: /Export CSV/ });
    await expect(exportBtn).toBeVisible();
    if (await exportBtn.isEnabled()) {
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 30_000 }),
        exportBtn.click(),
      ]);
      expect(download.suggestedFilename()).toMatch(/\.csv$/);
      const content = await (await download.createReadStream()).toArray();
      expect(Buffer.concat(content).toString('utf8')).toMatch(/Job ID.*Title.*Views/);
    } else {
      await expect(page.getByText(/No job activity yet|Post or renew a job/)).toBeVisible();
    }
    assertClean(c, 'analytics page');
  });

  test('without a session the employer APIs answer 401 and the pages redirect to login', async ({ page }) => {
    const c = attachErrorCollectors(page);
    for (const path of ['/api/employer/billing', '/api/employer/usage', '/api/employer/analytics', '/api/employer/settings', '/api/employer/jd-templates', '/api/employer/ai-jd/usage']) {
      const res = await page.request.get(path);
      expect([401, 403], `${path} -> ${res.status()}`).toContain(res.status());
    }
    const q = await json(await page.request.get('/api/employer/post-price'));
    expect(q.eligible).toBe(false);
    expect(q.reason).toBe('unauthenticated');

    for (const path of ['/employer/dashboard', '/employer/settings', '/employer/analytics']) {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await page.waitForURL(/\/login/, { timeout: 60_000, waitUntil: 'domcontentloaded' });
      expect(page.url(), `${path} should redirect to login`).toMatch(/\/login/);
    }
    await page.goto('/post-job', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('link', { name: /Sign Up as Employer/ })).toBeVisible({ timeout: 60_000 });
    assertClean(c, 'unauthenticated');
  });

  test('logged-out employer entry pages hydrate without server/client mismatches', async ({ browser }) => {
    test.setTimeout(240_000);
    // One fresh context per path so a mismatch is attributable to a direct
    // visit of that URL (not to a client-side transition from another layout).
    const paths = ['/login', '/login?role=employer', '/post-job', '/signup?role=employer', '/employer/dashboard'];
    const problems: string[] = [];
    for (const path of paths) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const c = attachErrorCollectors(page);
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 60_000 });
      await page.waitForLoadState('networkidle').catch(() => undefined);
      const hydration = [...c.pageErrors, ...c.consoleErrors].filter((t) => /Hydration|#418|#423|#425/.test(t));
      if (hydration.length) problems.push(`${path} -> ${page.url()}: ${hydration[0].split('\n').slice(0, 1).join(' ')} (${hydration.length} message(s))`);
      if (c.serverErrors.length) problems.push(`${path}: ${c.serverErrors.join(', ')}`);
      await context.close();
    }
    expect(problems, `hydration / 5xx problems on logged-out pages:\n  ${problems.join('\n  ')}`).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Post-job wizard
// ─────────────────────────────────────────────────────────────────────────────

test.describe('post-job wizard', () => {
  test.skip(AGAINST_PROD, 'no mutations against production');
  test.skip(!HAS_EMPLOYER, 'E2E_EMPLOYER_EMAIL / E2E_EMPLOYER_PASS not set');

  test.beforeEach(async ({ page }) => {
    await employerLogin(page);
    await resetDraft(page);
  });

  test('step 1 validates empty, short, free-email and bad-URL inputs and accepts unicode', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await gotoWizard(page);
    await page.locator('#title').fill('');
    await page.locator('#companyName').fill('');
    await page.locator('#contactEmail').fill('');
    await continueButton(page).click();
    await expect(page.getByText(/at least 10 characters/)).toBeVisible();
    await expect(page.getByText(/Company name is required/)).toBeVisible();
    await expect(page.getByText(/valid email/)).toBeVisible();
    await expect(page.locator('#title')).toBeVisible();

    await page.locator('#title').fill('Short');
    await page.locator('#companyName').fill('   ');
    await page.locator('#contactEmail').fill('hiring@gmail.com');
    await page.locator('#companyWebsite').fill('not a url');
    await continueButton(page).click();
    await expect(page.getByText(/at least 10 characters/)).toBeVisible();
    await expect(page.getByText(/Please use your company email/)).toBeVisible();
    await expect(page.getByText(/valid URL/)).toBeVisible();
    // A whitespace-only company name must not pass the "required" check.
    await expect(page.getByText(/Company name is required/), 'whitespace-only company name passed step-1 validation').toBeVisible();

    await page.locator('#title').fill('PMHNP Télépsychiatrie 🧠 <script>alert(1)</script>');
    await page.locator('#companyName').fill('Test Corp');
    await page.locator('#companyWebsite').fill('');
    await page.locator('#contactEmail').fill(getEmployerCreds()!.email);
    await continueButton(page).click();
    await expect(page.locator('#location')).toBeVisible({ timeout: 20_000 });
    assertClean(c, 'step 1');
  });

  test('step 2 requires location and an experience bucket, and the pills toggle', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await gotoWizard(page);
    await fillStep1(page, `E2E Hunt PMHNP step2 ${Date.now()}`);
    await continueButton(page).click();
    await expect(page.getByText(/Location is required/)).toBeVisible();
    await expect(page.getByText(/select an experience level/i)).toBeVisible();
    await page.locator('#location').fill('Austin, TX');
    await page.locator('label', { hasText: /^Hybrid$/ }).click();
    await page.locator('label', { hasText: /^Part-Time$/ }).click();
    await expect(page.locator('input[type="radio"][value="Hybrid"]')).toBeChecked();
    await expect(page.locator('input[type="radio"][value="Part-Time"]')).toBeChecked();
    await page.locator('label', { hasText: /^New grad accepted$/ }).click();
    await page.locator('#experienceQualifier').fill('x'.repeat(81));
    await continueButton(page).click();
    // 81-char qualifier is over the 80 cap: either the input caps it or an error shows.
    const capped = (await page.locator('#experienceQualifier').inputValue().catch(() => '')).length <= 80;
    const errored = await page.getByText(/80 characters/).isVisible().catch(() => false);
    expect(capped || errored, 'experience note over 80 chars must be capped or rejected').toBe(true);
    assertClean(c, 'step 2');
  });

  test('step 3 rejects a short description and keeps bold + bullet formatting from the Quill editor', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await gotoWizard(page);
    await fillStep1(page, `E2E Hunt PMHNP quill ${Date.now()}`);
    await fillStep2(page);
    await typeDescription(page, 'Too short.');
    await continueButton(page).click();
    await expect(page.getByText(/at least 200 characters/)).toBeVisible();

    const editor = page.locator('.ql-editor');
    await editor.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Delete');
    await page.locator('.ql-toolbar .ql-bold').click();
    await page.keyboard.type('About the role');
    await page.locator('.ql-toolbar .ql-bold').click();
    await page.keyboard.press('Enter');
    await page.locator('.ql-toolbar .ql-list[value="bullet"]').click();
    await page.keyboard.type('Manage a caseload of adults with ADHD and depression in telehealth');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Collaborate with therapists and a supervising psychiatrist');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type(DESCRIPTION_TEXT);
    await expect(editor.locator('strong')).toContainText('About the role');
    await expect(editor.locator('ul li')).toHaveCount(2);
    await continueButton(page).click();
    await expect(page.getByPlaceholder(/^Min/)).toBeVisible({ timeout: 20_000 });
    // Going back keeps the formatted HTML in the editor.
    await page.getByRole('button', { name: /^Back$/ }).click();
    await expect(page.locator('.ql-editor strong')).toContainText('About the role', { timeout: 20_000 });
    await expect(page.locator('.ql-editor ul li')).toHaveCount(2);
    assertClean(c, 'step 3');
  });

  test('step 4 validates salary ordering, non-numeric salary and an invalid external apply URL', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await gotoWizard(page);
    await fillStep1(page, `E2E Hunt PMHNP salary ${Date.now()}`);
    await fillStep2(page);
    await fillStep3(page);

    const minInput = page.getByPlaceholder(/^Min/);
    const maxInput = page.getByPlaceholder(/^Max/);
    await minInput.fill('200000');
    await maxInput.fill('100000');
    await page.locator('#applyUrl').fill('not-a-url');
    await page.getByRole('button', { name: /Continue to Preview/ }).click();
    await expect(page.getByText(/cannot be greater than maximum/)).toBeVisible();
    await expect(page.getByText(/valid URL/)).toBeVisible();
    expect(page.url()).toMatch(/\/post-job$/);

    await minInput.fill('');
    await minInput.pressSequentially('abc');
    await maxInput.fill('');
    await maxInput.pressSequentially('-5');
    await page.getByRole('button', { name: /Continue to Preview/ }).click();
    await expect(page.getByText(/Minimum salary is required|positive number/)).toBeVisible();
    await expect(page.getByText(/Maximum salary is required|positive number/)).toBeVisible();

    // Competitive salary bypasses the numeric checks.
    await page.getByText(/competitive/i).first().click();
    await expect(minInput).toBeDisabled();
    await page.locator('#applyUrl').fill('https://www.testcorp-e2e.example.com/apply');
    await page.getByRole('button', { name: /Continue to Preview/ }).click();
    await page.waitForURL(/\/post-job\/preview/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: /Preview Your Job Post/ })).toBeVisible({ timeout: 60_000 });
    assertClean(c, 'step 4');
  });

  test('screening questions builder adds presets and custom questions, toggles required and removes', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await gotoWizard(page);
    await fillStep1(page, `E2E Hunt PMHNP screening ${Date.now()}`);
    await fillStep2(page);
    await fillStep3(page);
    await fillStep4(page, { onPlatform: true });

    await expect(page.getByText('0/5')).toBeVisible();
    await page.getByRole('button', { name: /Choose from suggested questions/ }).click();
    await page.getByRole('button', { name: /active PMHNP-BC certification/ }).click();
    await expect(page.getByText('1/5')).toBeVisible();
    await expect(page.getByText(/Auto-reject if "No"/)).toBeVisible();

    const custom = page.getByPlaceholder('Type a custom question...');
    await custom.fill('Describe your experience with Athena EHR <b>bold</b>');
    await page.keyboard.press('Enter');
    await expect(page.getByText('2/5')).toBeVisible();
    await expect(page.getByText(/2\. Describe your experience with Athena EHR/)).toBeVisible();

    // Custom questions start optional; toggle to required and back.
    const optional = page.getByRole('button', { name: 'Optional' });
    await optional.click();
    await expect(page.getByRole('button', { name: /Required/ })).toHaveCount(2);

    // Remove the preset (first row's trailing X button).
    const presetRow = page.locator('div.p-3', { hasText: /1\. Do you have an active PMHNP-BC certification\?/ }).first();
    await presetRow.locator('button').last().click();
    await expect(page.getByText('1/5')).toBeVisible();

    // Persisted in localStorage for the preview/submit step.
    const stored = await page.evaluate(() => localStorage.getItem('jobScreeningQuestions'));
    expect(stored).toContain('Athena EHR');
    assertClean(c, 'screening builder');
  });

  test('logo upload accepts a PNG, and the UI does not silently swallow an SVG rejection or an oversized file', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await gotoWizard(page);
    const dialogs: string[] = [];
    page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss().catch(() => undefined); });
    const fileInput = page.locator('input[type="file"]');

    // Valid PNG: server re-encodes and returns a hosted URL.
    const [uploadRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/upload/company-logo'), { timeout: 60_000 }),
      fileInput.setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: TINY_PNG }),
    ]);
    expect(uploadRes.status(), await uploadRes.text()).toBe(200);
    const uploaded = await uploadRes.json();
    expect(String(uploaded.url)).toMatch(/^https?:\/\//);
    await expect(page.getByText('Change Logo')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('img[alt="Logo"]')).toHaveAttribute('src', /^https?:\/\//);

    // SVG: client lets it through (image/*), server rejects with 400.
    const [svgRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/upload/company-logo'), { timeout: 60_000 }),
      fileInput.setInputFiles({ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: TINY_SVG }),
    ]);
    expect(svgRes.status()).toBe(400);
    // The rejection must reach the employer: either an alert/dialog or visible
    // error text. A silent blob preview would look like a successful upload.
    await page.waitForTimeout(500);
    const previewSrc = await page.locator('img[alt="Logo"]').getAttribute('src');
    const errorShown = dialogs.some((m) => /svg|not permitted|failed|only/i.test(m))
      || (await page.getByText(/SVG|not permitted|upload failed/i).isVisible().catch(() => false));
    expect(
      errorShown,
      `SVG upload was rejected by the server (400) but the wizard showed no error; logo preview src is now "${previewSrc}" (blob preview replaced the hosted logo). dialogs=${JSON.stringify(dialogs)}`,
    ).toBe(true);

    // Oversized (3 MB) is blocked client-side with an alert.
    const big = Buffer.concat([TINY_PNG, Buffer.alloc(3 * 1024 * 1024)]);
    await fileInput.setInputFiles({ name: 'big.png', mimeType: 'image/png', buffer: big });
    await expect.poll(() => dialogs.some((m) => /under 2MB/i.test(m)), { timeout: 10_000 }).toBe(true);

    // Direct API checks: svg and oversized are 400, never 5xx.
    const apiSvg = await page.request.post('/api/upload/company-logo', {
      multipart: { file: { name: 'x.svg', mimeType: 'image/svg+xml', buffer: TINY_SVG } },
    });
    expect(apiSvg.status()).toBe(400);
    const apiBig = await page.request.post('/api/upload/company-logo', {
      multipart: { file: { name: 'big.png', mimeType: 'image/png', buffer: big } },
    });
    expect(apiBig.status()).toBe(400);
    const spoof = await page.request.post('/api/upload/company-logo', {
      multipart: { file: { name: 'x.png', mimeType: 'image/png', buffer: TINY_SVG } },
    });
    expect(spoof.status(), 'SVG bytes declared as PNG must be refused').toBe(400);
    assertClean(c, 'logo upload');
  });

  test('AI JD dialog requires a facts summary; one generation call increments the usage counter', async ({ page }) => {
    test.setTimeout(180_000);
    const c = attachErrorCollectors(page);
    const before = await json(await page.request.get('/api/employer/ai-jd/usage'));
    const usageBefore = before.usage as { used: number; remaining: number; cap: number };
    expect(typeof usageBefore.used, JSON.stringify(before)).toBe('number');

    await gotoWizard(page);
    await fillStep1(page, `E2E Hunt PMHNP ai ${Date.now()}`);
    await fillStep2(page);
    await page.getByRole('button', { name: /Generate with AI/ }).click();
    const dialog = modal(page);
    await expect(dialog).toBeVisible();
    const generate = dialog.getByRole('button', { name: /^Generate$/ });
    await expect(generate).toBeDisabled();
    await dialog.locator('textarea').first().fill('short');
    await expect(generate).toBeDisabled();
    await dialog.getByRole('button', { name: /Cancel/ }).click();
    await expect(dialog).toBeHidden();

    test.skip(usageBefore.remaining === 0, 'daily AI JD cap already used on this account');

    // One real generation through the API (same payload shape as the panel).
    const gen = await page.request.post('/api/employer/ai-jd', {
      data: {
        role: 'Remote PMHNP Telepsychiatry (E2E hunt)',
        setting: 'Telehealth',
        context: 'Employer name: Test Corp. Location: Remote. Specific facts from the employer: adult outpatient med management, Athena EHR, Monday to Friday, 250 patient panel cap, licensed in Texas and California.',
        mode: 'generate',
        tone: 'professional',
        length: 'concise',
        mustHaves: ['PMHNP-BC certification'],
      },
      timeout: 150_000,
    });
    const genBody = await json(gen);
    expect([200, 422, 429], `ai-jd status ${gen.status()}: ${JSON.stringify(genBody).slice(0, 300)}`).toContain(gen.status());
    if (gen.status() === 200) {
      expect(String(genBody.html ?? genBody.description ?? genBody.body ?? '')).not.toBe('');
      const after = await json(await page.request.get('/api/employer/ai-jd/usage'));
      const usageAfter = after.usage as { used: number; remaining: number };
      expect(usageAfter.used, 'usage counter must increment by exactly one').toBe(usageBefore.used + 1);
      expect(usageAfter.remaining).toBe(usageBefore.remaining - 1);
    }
    assertClean(c, 'ai jd');
  });

  test('JD templates: save the current draft, list it, apply it and delete it; API rejects short bodies', async ({ page }) => {
    const c = attachErrorCollectors(page);
    const label = `E2E Hunt template ${Date.now()}`;
    await gotoWizard(page);
    await fillStep1(page, `E2E Hunt PMHNP template ${Date.now()}`);
    await fillStep2(page);
    await typeDescription(page, DESCRIPTION_TEXT);

    await page.getByRole('button', { name: /Save to my templates/ }).click();
    const dialog = modal(page);
    await expect(dialog.getByRole('heading', { name: /Save as template/ })).toBeVisible();
    await dialog.getByPlaceholder(/Outpatient PMHNP/).fill(label);
    await dialog.getByPlaceholder(/Adult outpatient/).fill('E2E summary');
    const [saveRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/employer/jd-templates') && r.request().method() === 'POST'),
      dialog.getByRole('button', { name: /Save template/ }).click(),
    ]);
    expect(saveRes.status(), await saveRes.text()).toBe(201);
    await expect(dialog).toBeHidden();

    // Listed via API and in the picker.
    const list = await json(await page.request.get('/api/employer/jd-templates'));
    const mine = (list.items as Array<Record<string, unknown>>).find((t) => t.label === label);
    expect(mine, JSON.stringify(list).slice(0, 300)).toBeTruthy();

    // Replace editor content, then apply the saved template back.
    const editor = page.locator('.ql-editor');
    await editor.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('Placeholder text that will be replaced by the template body. '.repeat(3));
    await page.getByRole('button', { name: /Browse templates/ }).click();
    const picker = modal(page);
    await expect(picker.getByRole('heading', { name: /skeleton starters/ })).toBeVisible();
    await picker.getByRole('button', { name: /My Templates \(\d+\)/ }).click();
    await picker.getByRole('button', { name: new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first().click();
    const confirm = modal(page).filter({ hasText: /replace|Replace/ });
    if (await confirm.isVisible().catch(() => false)) {
      await confirm.getByRole('button', { name: /Replace|Use|Apply|Confirm/ }).first().click();
    }
    await expect(editor).toContainText('licensed in Texas and California', { timeout: 20_000 });
    await expect(editor).not.toContainText('Placeholder text');

    // Delete through the picker.
    await page.getByRole('button', { name: /Browse templates/ }).click();
    await modal(page).getByRole('button', { name: /My Templates \(\d+\)/ }).click();
    const card = modal(page).locator('div', { hasText: label }).filter({ has: page.getByRole('button', { name: 'Delete template' }) }).last();
    await card.getByRole('button', { name: 'Delete template' }).click();
    const [delRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes(`/api/employer/jd-templates/${mine!.id}`) && r.request().method() === 'DELETE'),
      modal(page).filter({ hasText: /Delete this saved template/ }).getByRole('button', { name: /^Delete$/ }).click(),
    ]);
    expect(delRes.status()).toBe(200);
    const after = await json(await page.request.get('/api/employer/jd-templates'));
    expect((after.items as Array<Record<string, unknown>>).some((t) => t.id === mine!.id)).toBe(false);

    // API validation: short body and short label are 400.
    const bad = await page.request.post('/api/employer/jd-templates', { data: { label: 'x', body: 'too short' } });
    expect(bad.status()).toBe(400);
    const missing = await page.request.delete(`/api/employer/jd-templates/${mine!.id}`);
    expect(missing.status()).toBe(404);
    assertClean(c, 'jd templates');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Paid checkout guard while the free post is still available
// ─────────────────────────────────────────────────────────────────────────────

async function seedFormData(page: Page, title: string): Promise<void> {
  await page.evaluate(({ t, email, desc }) => {
    localStorage.setItem('jobFormData', JSON.stringify({
      title: t,
      companyName: 'Test Corp',
      companyWebsite: 'https://www.testcorp-e2e.example.com',
      contactEmail: email,
      location: 'Remote',
      mode: 'Remote',
      jobType: 'Full-Time',
      salaryMin: 140000,
      salaryMax: 175000,
      salaryPeriod: 'annual',
      salaryCompetitive: false,
      description: `<p>${desc}</p>`,
      applyUrl: '',
      applyOnPlatform: true,
      pricingTier: 'pro',
      benefits: ['Health Insurance'],
      setting: 'Telehealth',
      population: 'Adults',
      minYearsExperience: 2,
      maxYearsExperience: 4,
      newGradFriendly: false,
      experienceQualifier: '',
    }));
    localStorage.removeItem('jobScreeningQuestions');
  }, { t: title, email: getEmployerCreds()!.email, desc: DESCRIPTION_TEXT });
}

/**
 * Drive /post-job/checkout to the point of payment and stop there.
 *
 * On success the page assigns window.location to the Stripe-hosted URL, and
 * that navigation tears down the response body before it can be read — so the
 * URL is captured from the aborted Stripe request instead of from res.json().
 * Nothing is ever loaded from checkout.stripe.com.
 */
async function runCheckout(
  page: Page,
  title: string,
): Promise<{ status: number; body: Record<string, unknown>; stripeUrl: string | null }> {
  await seedFormData(page, title);
  let stripeUrl: string | null = null;
  await page.route('https://checkout.stripe.com/**', (route) => {
    stripeUrl = route.request().url();
    return route.abort();
  });
  await page.goto('/post-job/checkout', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /Confirm Your Job Posting/ })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(title)).toBeVisible();
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/create-checkout'), { timeout: 90_000 }),
    page.getByRole('button', { name: /Proceed to Payment/ }).click(),
  ]);
  const status = res.status();
  const body = await res.json().catch(() => ({}));
  if (status === 200 && !stripeUrl) {
    // The redirect may not have been issued yet when the response resolved.
    await expect.poll(() => stripeUrl, { timeout: 20_000, intervals: [500] }).not.toBeNull();
  }
  return { status, body, stripeUrl };
}

test.describe('paid checkout guard', () => {
  test.skip(AGAINST_PROD, 'no mutations against production');
  test.skip(!HAS_EMPLOYER, 'E2E_EMPLOYER_EMAIL / E2E_EMPLOYER_PASS not set');

  test('create-checkout returns a Stripe URL at whichever price post-price quoted', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await employerLogin(page);
    const q = await quotaStatus(page);
    const { status, body, stripeUrl } = await runCheckout(page, `E2E Hunt PMHNP Paid guard ${Date.now()}`);
    // Every post is paid now, so there is no free-post 409 branch. Both the
    // discounted first post and a standard post land on a Stripe-hosted
    // page; 503 is Stripe unconfigured in this environment.
    expect([200, 503], `${q.priceKind} post: ${JSON.stringify(body)}`).toContain(status);
    // Stop at the Stripe-hosted page: the redirect is aborted, never loaded.
    if (status === 200) expect(String(stripeUrl)).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    assertClean(c, 'checkout guard');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Job lifecycle: create (free) → dashboard → public → search → pause → edit → archive
// ─────────────────────────────────────────────────────────────────────────────

interface LifecycleJob {
  id: string;
  title: string;
  slug: string;
  editToken: string;
  createdThisRun: boolean;
}
let lifecycle: LifecycleJob | null = null;

test.describe('job lifecycle', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(AGAINST_PROD, 'no mutations against production');
  test.skip(!HAS_EMPLOYER, 'E2E_EMPLOYER_EMAIL / E2E_EMPLOYER_PASS not set');

  test('re-use the existing E2E listing (every post is paid, so the suite never creates one)', async ({ page }) => {
    test.setTimeout(240_000);
    const c = attachErrorCollectors(page);
    await employerLogin(page);
    await resetDraft(page);

    // There is no unpaid create path any more: the wizard ends at Stripe
    // checkout for the first post and every post after it. The lifecycle
    // therefore runs against a listing seeded earlier (a legacy free row or a
    // paid one) and skips when none exists rather than fabricating a payment.
    const billing = await json(await page.request.get('/api/employer/billing'));
    const e2eJobs = (billing.payments as Array<Record<string, unknown>>).filter((p) => String(p.jobTitle).startsWith('E2E Hunt PMHNP'));
    test.skip(e2eJobs.length === 0, 'no E2E Hunt listing to re-use; seed one via checkout in Stripe test mode');
    const target = e2eJobs[0];
    const jobs = await readDashboardJobs(page);
    let mine = jobs.find((j) => j.title === target.jobTitle);
    expect(mine, `dashboard jobs: ${JSON.stringify(jobs)}`).toBeTruthy();
    // Make sure it is active + published for the rest of the flow.
    const archivedFilter = page.getByRole('button', { name: /archived \(\d+\)/i });
    if (!mine!.publicHref) {
      const card = page.locator('.emp-job-card', { hasText: mine!.title });
      if (await card.getByRole('button', { name: /Restore/ }).isVisible().catch(() => false)) {
        await card.getByRole('button', { name: /Restore/ }).click();
      } else if (await archivedFilter.isVisible().catch(() => false)) {
        await archivedFilter.click();
        const archivedCard = page.locator('.emp-job-card', { hasText: mine!.title });
        if (await archivedCard.getByRole('button', { name: /Restore/ }).isVisible().catch(() => false)) {
          await archivedCard.getByRole('button', { name: /Restore/ }).click();
        }
      }
      await page.request.patch(`/api/employer/jobs/${target.jobId}/toggle-publish`).catch(() => undefined);
      const again = await readDashboardJobs(page);
      mine = again.find((j) => j.title === target.jobTitle);
    }
    expect(mine!.publicHref, 're-used listing must be live').toMatch(/^\/jobs\/.+/);
    lifecycle = { id: String(target.jobId), title: mine!.title, slug: mine!.publicHref!.replace('/jobs/', ''), editToken: mine!.editToken!, createdThisRun: false };
    assertClean(c, 're-use job');
  });

  test('dashboard lists the job as live with a working edit link', async ({ page }) => {
    test.skip(!lifecycle, 'no lifecycle job');
    const c = attachErrorCollectors(page);
    await employerLogin(page);
    await readDashboardJobs(page);
    const card = page.locator('.emp-job-card', { hasText: lifecycle!.title });
    await expect(card).toBeVisible();
    // The re-used listing may be a legacy free row or a paid one, so no
    // plan badge is asserted here; the paid-first pricing suite pins the
    // legacy label separately.
    await expect(card.getByText(/Live|Active/).first()).toBeVisible();
    await expect(card.getByRole('link', { name: /Edit/ })).toHaveAttribute('href', `/jobs/edit/${lifecycle!.editToken}`);
    await expect(card.getByRole('button', { name: /Pause/ })).toBeVisible();
    await expect(card.getByRole('button', { name: /Archive/ })).toBeVisible();
    await expect(card.getByText(/expires|days left|expiring/i).first()).toBeVisible();
    assertClean(c, 'dashboard job card');
  });

  test('public job page renders salary, schedule, eligibility states and Easy Apply', async ({ page }) => {
    test.skip(!lifecycle, 'no lifecycle job');
    const c = attachErrorCollectors(page);
    await page.goto(`/jobs/${lifecycle!.slug}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1 })).toContainText(lifecycle!.title, { timeout: 60_000 });
    const body = page.locator('body');
    await expect(body).toContainText('Test Corp');
    await expect(body).toContainText(/\$140,000|140k/);
    await expect(body).toContainText(/Role Snapshot/);
    await expect(body).toContainText(/Schedule/);
    await expect(body).toContainText(/Full-Time/);
    if (lifecycle!.createdThisRun) {
      await expect(body, 'Remote post restricted to TX/CA in the description must surface eligible states').toContainText(/Eligible license states/);
      await expect(body).toContainText(/Texas/);
      await expect(body).toContainText(/California/);
    }
    await expect(page.getByRole('button', { name: /Easy Apply/ }).or(page.getByRole('link', { name: /Easy Apply/ })).first()).toBeVisible();
    const questions = await json(await page.request.get(`/api/jobs/${lifecycle!.id}/screening-questions`));
    expect(Array.isArray(questions.questions)).toBe(true);
    if (lifecycle!.createdThisRun) {
      expect((questions.questions as unknown[]).length, 'screening question added in the wizard must persist').toBeGreaterThan(0);
    }
    assertClean(c, 'public page');
  });

  test('the new post appears in /jobs search by its unique title within a minute', async ({ page }) => {
    test.skip(!lifecycle, 'no lifecycle job');
    const c = attachErrorCollectors(page);
    const q = encodeURIComponent(lifecycle!.title);
    await expect.poll(async () => {
      const res = await page.request.get(`/api/jobs?q=${q}&limit=20`);
      if (!res.ok()) return `status ${res.status()}`;
      const body = await res.json();
      return (body.jobs as Array<{ id: string }>).some((j) => j.id === lifecycle!.id) ? 'found' : `total ${body.total}`;
    }, { timeout: 60_000, intervals: [3_000] }).toBe('found');

    await page.goto(`/jobs?q=${q}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('link', { name: new RegExp(lifecycle!.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first()).toBeVisible({ timeout: 60_000 });
    assertClean(c, 'search');
  });

  test('pausing the job takes the public page down (404/410) and unpausing brings it back (200)', async ({ page }) => {
    test.setTimeout(240_000);
    test.skip(!lifecycle, 'no lifecycle job');
    const c = attachErrorCollectors(page);
    await employerLogin(page);
    await readDashboardJobs(page);
    const card = page.locator('.emp-job-card', { hasText: lifecycle!.title });
    await card.getByRole('button', { name: /^Pause$/ }).click();
    const [pauseRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/toggle-publish'), { timeout: 60_000 }),
      page.getByRole('button', { name: /Pause Anyway|Pause Job/ }).click(),
    ]);
    expect(pauseRes.status(), await pauseRes.text()).toBe(200);
    await expect(card.getByText(/Paused/)).toBeVisible({ timeout: 20_000 });
    await expect(card.getByRole('button', { name: /Unpause/ })).toBeVisible();

    // Persisted after reload and the public page is gone.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('.emp-job-card', { hasText: lifecycle!.title }).getByText(/Paused/)).toBeVisible({ timeout: 60_000 });
    await expect.poll(() => publicStatus(page, `/jobs/${lifecycle!.slug}`), { timeout: 90_000, intervals: [3_000] }).not.toBe(200);
    const downStatus = await publicStatus(page, `/jobs/${lifecycle!.slug}`);
    expect([404, 410], `paused job public status ${downStatus}`).toContain(downStatus);

    // Unpause.
    const [unpauseRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/toggle-publish'), { timeout: 60_000 }),
      page.locator('.emp-job-card', { hasText: lifecycle!.title }).getByRole('button', { name: /Unpause/ }).click(),
    ]);
    expect(unpauseRes.status(), await unpauseRes.text()).toBe(200);
    await expect(page.locator('.emp-job-card', { hasText: lifecycle!.title }).getByRole('button', { name: /^Pause$/ })).toBeVisible({ timeout: 20_000 });
    const started = Date.now();
    await expect.poll(() => publicStatus(page, `/jobs/${lifecycle!.slug}`), { timeout: 120_000, intervals: [3_000] }).toBe(200);
    const backAfterMs = Date.now() - started;
    expect(backAfterMs, `public page took ${Math.round(backAfterMs / 1000)}s to return 200 after unpause (middleware 410 cache)`).toBeLessThan(15_000);
    assertClean(c, 'pause/unpause');
  });

  test('editing the title via /jobs/edit/[token] updates the public page and dashboard', async ({ page }) => {
    test.setTimeout(180_000);
    test.skip(!lifecycle, 'no lifecycle job');
    const c = attachErrorCollectors(page);
    const newTitle = `${lifecycle!.title.replace(/ \(edited.*\)$/, '')} (edited ${RUN_TAG})`;
    await page.goto(`/jobs/edit/${lifecycle!.editToken}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#title')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('#title')).toHaveValue(lifecycle!.title);
    await page.locator('#title').fill(newTitle);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.locator('.ql-editor')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.locator('#contactEmail').or(page.getByPlaceholder(/^Min/))).toBeVisible({ timeout: 30_000 });
    if (await page.getByRole('button', { name: 'Continue', exact: true }).isVisible().catch(() => false)) {
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
    }
    const [updRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/jobs/update') && r.request().method() === 'POST', { timeout: 60_000 }),
      page.getByRole('button', { name: /Save Changes/ }).click(),
    ]);
    expect(updRes.status(), await updRes.text()).toBe(200);
    await expect(page.getByText(/Job updated successfully/)).toBeVisible({ timeout: 20_000 });

    await page.goto(`/jobs/${lifecycle!.slug}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1 })).toContainText(newTitle, { timeout: 60_000 });

    await employerLogin(page);
    const jobs = await readDashboardJobs(page);
    expect(jobs.map((j) => j.title)).toContain(newTitle);
    lifecycle!.title = newTitle;

    // Garbage token is rejected cleanly.
    await page.goto('/jobs/edit/not-a-real-token', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Invalid Edit Link/ })).toBeVisible({ timeout: 60_000 });
    assertClean(c, 'edit');
  });

  test('editing salary and schedule via /jobs/edit/[token] is reflected on the public page and the job API', async ({ page }) => {
    test.setTimeout(240_000);
    test.skip(!lifecycle, 'no lifecycle job');
    const c = attachErrorCollectors(page);

    // Snapshot for the restore at the end so the suite stays re-runnable.
    const before = await json(await page.request.get(`/api/jobs/edit/${lifecycle!.editToken}`));
    const beforeJob = (before.job ?? before) as Record<string, unknown>;

    await page.goto(`/jobs/edit/${lifecycle!.editToken}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#title')).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: 'Part-Time', exact: true }).click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.locator('.ql-editor')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByPlaceholder(/^Min/)).toBeVisible({ timeout: 30_000 });
    await page.getByPlaceholder(/^Min/).fill('150000');
    await page.getByPlaceholder(/^Max/).fill('185000');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.locator('#contactEmail')).toBeVisible({ timeout: 30_000 });
    const [updRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/jobs/update') && r.request().method() === 'POST', { timeout: 60_000 }),
      page.getByRole('button', { name: /Save Changes/ }).click(),
    ]);
    expect(updRes.status(), await updRes.text()).toBe(200);
    await expect(page.getByText(/Job updated successfully/)).toBeVisible({ timeout: 20_000 });

    const problems: string[] = [];
    // The raw columns are written by the edit route; the derived columns the
    // public surfaces read (displaySalary, normalized salary, jobTypes) must
    // follow, otherwise candidates keep seeing the pre-edit values.
    const api = await json(await page.request.get(`/api/jobs/${lifecycle!.id}`));
    if (api.minSalary !== 150000 || api.maxSalary !== 185000) problems.push(`raw salary not saved: ${api.minSalary}-${api.maxSalary}`);
    if (api.jobType !== 'Part-Time') problems.push(`jobType not saved: ${api.jobType}`);
    if (!String(api.displaySalary ?? '').match(/150/)) problems.push(`displaySalary still "${api.displaySalary}" after editing salary to 150000-185000`);
    if (api.normalizedMinSalary !== 150000) problems.push(`normalizedMinSalary still ${api.normalizedMinSalary} after editing salary to 150000`);
    const types = Array.isArray(api.jobTypes) ? (api.jobTypes as string[]) : [];
    if (!types.includes('Part-Time') || types.includes('Full-Time')) problems.push(`jobTypes still ${JSON.stringify(api.jobTypes)} after switching schedule to Part-Time`);

    await page.goto(`/jobs/${lifecycle!.slug}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1 })).toContainText(lifecycle!.title, { timeout: 60_000 });
    const body = await page.locator('body').innerText();
    if (!/\$150,000|150k/i.test(body)) problems.push('public page does not show the edited $150,000 salary');
    if (/\$140,000|140k/i.test(body)) problems.push('public page still shows the pre-edit $140,000 salary');
    const snapshot = body.match(/Schedule\s*\n?\s*([^\n]+)/);
    if (snapshot && /Full-Time/.test(snapshot[1]) && !/Part-Time/.test(snapshot[1])) problems.push(`Role Snapshot schedule still "${snapshot[1].trim()}" after switching to Part-Time`);

    // Restore the original values through the same API the edit page uses.
    const restore = await page.request.post('/api/jobs/update', {
      data: {
        token: lifecycle!.editToken,
        jobData: {
          title: lifecycle!.title,
          location: String(beforeJob.location ?? 'Remote'),
          mode: String(beforeJob.mode ?? 'Remote'),
          jobType: 'Full-Time',
          description: String(beforeJob.description ?? DESCRIPTION_TEXT),
          applyOnPlatform: true,
          applyLink: null,
          minSalary: 140000,
          maxSalary: 175000,
          salaryPeriod: 'annual',
          benefits: Array.isArray(beforeJob.benefits) ? beforeJob.benefits : [],
          contactEmail: getEmployerCreds()!.email,
        },
      },
    });
    expect(restore.status(), await restore.text()).toBe(200);

    expect(problems, `salary/schedule edit did not propagate:\n  ${problems.join('\n  ')}`).toEqual([]);
    assertClean(c, 'edit salary/schedule');
  });

  test('archiving hides the job from the active list, public page and search; restore brings it back', async ({ page }) => {
    test.setTimeout(240_000);
    test.skip(!lifecycle, 'no lifecycle job');
    const c = attachErrorCollectors(page);
    await employerLogin(page);
    await readDashboardJobs(page);
    const card = page.locator('.emp-job-card', { hasText: lifecycle!.title });
    await card.getByRole('button', { name: /^Archive$/ }).click();
    await expect(page.getByRole('heading', { name: /Archive this posting/ })).toBeVisible();
    const [archRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/archive'), { timeout: 60_000 }),
      page.getByRole('button', { name: /^Archive$/ }).last().click(),
    ]);
    expect(archRes.status(), await archRes.text()).toBe(200);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: /active \(\d+\)/i })).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('.emp-job-card', { hasText: lifecycle!.title })).toHaveCount(0);
    await page.getByRole('button', { name: /archived \(\d+\)/i }).click();
    const archivedCard = page.locator('.emp-job-card', { hasText: lifecycle!.title });
    await expect(archivedCard).toBeVisible();
    await expect(archivedCard.getByText('Archived')).toBeVisible();

    await expect.poll(() => publicStatus(page, `/jobs/${lifecycle!.slug}`), { timeout: 90_000, intervals: [3_000] }).not.toBe(200);
    const res = await page.request.get(`/api/jobs?q=${encodeURIComponent(lifecycle!.title)}&limit=20`);
    const body = await res.json();
    expect((body.jobs as Array<{ id: string }>).some((j) => j.id === lifecycle!.id), 'archived job must not be searchable').toBe(false);

    // Restore + republish so the listing is live for the next run.
    const [restoreRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/archive'), { timeout: 60_000 }),
      archivedCard.getByRole('button', { name: /Restore/ }).click(),
    ]);
    expect(restoreRes.status()).toBe(200);
    await page.reload({ waitUntil: 'domcontentloaded' });
    const restored = page.locator('.emp-job-card', { hasText: lifecycle!.title });
    await expect(restored).toBeVisible({ timeout: 60_000 });
    if (await restored.getByRole('button', { name: /Unpause/ }).isVisible().catch(() => false)) {
      const [pub] = await Promise.all([
        page.waitForResponse((r) => r.url().includes('/toggle-publish'), { timeout: 60_000 }),
        restored.getByRole('button', { name: /Unpause/ }).click(),
      ]);
      expect(pub.status()).toBe(200);
    }
    await expect.poll(() => publicStatus(page, `/jobs/${lifecycle!.slug}`), { timeout: 120_000, intervals: [3_000] }).toBe(200);
    assertClean(c, 'archive/restore');
  });

  test('renewal: free posts cannot be renewed, garbage tokens 404, and renewal-success without a session shows an error', async ({ page }) => {
    test.skip(!lifecycle, 'no lifecycle job');
    const c = attachErrorCollectors(page);
    await employerLogin(page);
    const missing = await page.request.post('/api/create-renewal-checkout', { data: {} });
    expect(missing.status()).toBe(400);
    const garbage = await page.request.post('/api/create-renewal-checkout', { data: { jobId: lifecycle!.id, editToken: 'nope' } });
    expect(garbage.status()).toBe(404);
    const free = await page.request.post('/api/create-renewal-checkout', { data: { jobId: lifecycle!.id, editToken: lifecycle!.editToken } });
    const freeBody = await json(free);
    expect([409, 503], JSON.stringify(freeBody)).toContain(free.status());
    if (free.status() === 409) expect(String(freeBody.error)).toMatch(/Free posts cannot be renewed/);

    await page.goto('/employer/renewal-success', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/No session ID provided/)).toBeVisible({ timeout: 60_000 });
    await page.goto('/employer/renewal-success?session_id=cs_test_garbage', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Error/ })).toBeVisible({ timeout: 60_000 });
    assertClean(c, 'renewal');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Existing employer posting, read-only.
//
// The free-post quota is one per employer org/domain for the life of the
// account, so on any run after the first the lifecycle block above has no
// listing to create and skips. These checks keep the "an employer's own
// posting is correct on the public side" assertions alive without mutating a
// listing that another suite may be driving at the same time.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('existing employer posting (read-only)', () => {
  test.skip(!HAS_EMPLOYER, 'E2E_EMPLOYER_EMAIL / E2E_EMPLOYER_PASS not set');

  interface ExistingJob { id: string; title: string; slug: string }

  async function pickExistingJob(page: Page): Promise<ExistingJob | null> {
    const jobs = await readDashboardJobs(page);
    const live = jobs.find((j) => j.publicHref);
    if (!live) return null;
    const billing = await json(await page.request.get('/api/employer/billing'));
    // A 429 from the employer rate limiter answers without `payments`; treat
    // that as "no job to drive" rather than throwing a TypeError.
    const payments = Array.isArray(billing.payments) ? (billing.payments as Array<Record<string, unknown>>) : null;
    if (!payments) return null;
    const row = payments.find((p) => p.jobTitle === live.title);
    if (!row) return null;
    return { id: String(row.jobId), title: live.title, slug: live.publicHref!.replace('/jobs/', '') };
  }

  test('a live posting on the dashboard is reachable at its public /jobs/[slug] with the employer surfaces intact', async ({ page }) => {
    test.setTimeout(180_000);
    const c = attachErrorCollectors(page);
    await employerLogin(page);
    const job = await pickExistingJob(page);
    test.skip(!job, 'this employer account has no live posting');

    await page.goto(`/jobs/${job!.slug}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1 })).toContainText(job!.title, { timeout: 60_000 });
    const body = page.locator('body');
    await expect(body).toContainText('Test Corp');
    await expect(body).toContainText(/Role Snapshot/);
    await expect(body).toContainText(/Schedule/);
    // An employer posting always offers one apply route or the other.
    const apply = page
      .getByRole('button', { name: /Easy Apply|Apply/ })
      .or(page.getByRole('link', { name: /Easy Apply|Apply/ }))
      .first();
    await expect(apply).toBeVisible({ timeout: 30_000 });

    // The public salary string must agree with the raw columns the employer
    // edits, not drift from them.
    const api = await json(await page.request.get(`/api/jobs/${job!.id}`));
    const min = api.minSalary as number | null;
    const display = String(api.displaySalary ?? '');
    if (min && display) {
      const shownThousands = Math.round(min / 1000);
      expect(
        display.includes(String(min)) || display.includes(String(shownThousands)) || display.includes(min.toLocaleString('en-US')),
        `displaySalary "${display}" does not match the stored minSalary ${min} for /jobs/${job!.slug}`,
      ).toBe(true);
    }
    // Role Snapshot schedule comes from the jobTypes array, which must contain
    // the raw jobType the employer chose.
    const types = Array.isArray(api.jobTypes) ? (api.jobTypes as string[]) : [];
    if (api.jobType && types.length) {
      expect(types, `jobTypes ${JSON.stringify(types)} does not contain the stored jobType "${api.jobType}"`).toContain(api.jobType);
    }
    assertClean(c, 'existing posting public page');
  });

  test('a live posting is findable in /jobs search by its exact title', async ({ page }) => {
    test.setTimeout(180_000);
    const c = attachErrorCollectors(page);
    await employerLogin(page);
    const job = await pickExistingJob(page);
    test.skip(!job, 'this employer account has no live posting');

    const q = encodeURIComponent(job!.title);
    await expect.poll(async () => {
      const res = await page.request.get(`/api/jobs?q=${q}&limit=20`);
      if (!res.ok()) return `status ${res.status()}`;
      const body = await res.json();
      return (body.jobs as Array<{ id: string }>).some((j) => j.id === job!.id) ? 'found' : `total ${body.total}`;
    }, { timeout: 60_000, intervals: [3_000] }).toBe('found');

    await page.goto(`/jobs?q=${q}`, { waitUntil: 'domcontentloaded' });
    // The card's clickable wrapper carries an aria-label built from title +
    // employer + location, while the visible <h3> carries the title alone.
    // Assert on the rendered text so this survives card-markup changes.
    await expect(
      page.getByText(new RegExp(job!.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).first(),
    ).toBeVisible({ timeout: 60_000 });
    assertClean(c, 'existing posting search');
  });

  test('the edit-token page loads the posting and a garbage token is refused', async ({ page }) => {
    test.setTimeout(180_000);
    const c = attachErrorCollectors(page);
    await employerLogin(page);
    const jobs = await readDashboardJobs(page);
    const withToken = jobs.find((j) => j.editToken);
    test.skip(!withToken, 'this employer account has no posting with an edit link');

    await page.goto(`/jobs/edit/${withToken!.editToken}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#title')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('#title')).toHaveValue(withToken!.title);

    await page.goto('/jobs/edit/not-a-real-token', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Invalid Edit Link/ })).toBeVisible({ timeout: 60_000 });
    assertClean(c, 'edit token page');
  });

  test('renewal endpoints validate input without a payment: missing body 400, bad token 404, renewal-success without a session errors', async ({ page }) => {
    test.setTimeout(180_000);
    const c = attachErrorCollectors(page);
    await employerLogin(page);
    const jobs = await readDashboardJobs(page);
    const withToken = jobs.find((j) => j.editToken);

    const missing = await page.request.post('/api/create-renewal-checkout', { data: {} });
    expect(missing.status()).toBe(400);
    if (withToken) {
      const billing = await json(await page.request.get('/api/employer/billing'));
      const row = (billing.payments as Array<Record<string, unknown>>).find((p) => p.jobTitle === withToken.title);
      if (row) {
        const garbage = await page.request.post('/api/create-renewal-checkout', { data: { jobId: row.jobId, editToken: 'nope' } });
        expect(garbage.status()).toBe(404);
        const real = await page.request.post('/api/create-renewal-checkout', { data: { jobId: row.jobId, editToken: withToken.editToken } });
        const realBody = await json(real);
        expect([200, 409, 503], `renewal for ${row.jobTitle}: ${real.status()} ${JSON.stringify(realBody).slice(0, 200)}`).toContain(real.status());
        // Stop at the Stripe-hosted page; never follow it.
        if (real.status() === 200) expect(String(realBody.url)).toMatch(/^https:\/\/checkout\.stripe\.com\//);
      }
    }

    await page.goto('/employer/renewal-success', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/No session ID provided/)).toBeVisible({ timeout: 60_000 });
    await page.goto('/employer/renewal-success?session_id=cs_test_garbage', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Error/ })).toBeVisible({ timeout: 60_000 });
    assertClean(c, 'renewal guards');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Paid checkout once the free post is consumed
// ─────────────────────────────────────────────────────────────────────────────

test.describe('paid checkout after quota', () => {
  test.skip(AGAINST_PROD, 'no mutations against production');
  test.skip(!HAS_EMPLOYER, 'E2E_EMPLOYER_EMAIL / E2E_EMPLOYER_PASS not set');

  test('create-checkout returns a Stripe-hosted URL without completing payment', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await employerLogin(page);
    const q = await quotaStatus(page);
    test.skip(q.isFirstPost === true, 'discounted first post still available; the guard test covers this state');
    const { status, body, stripeUrl } = await runCheckout(page, `E2E Hunt PMHNP Paid ${Date.now()}`);
    expect([200, 503], JSON.stringify(body)).toContain(status);
    if (status === 200) {
      // The page redirects to the Stripe-hosted page; the request is aborted
      // at the boundary so payment is never started.
      expect(String(stripeUrl)).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    }
    assertClean(c, 'paid checkout');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Settings, notifications, legacy token dashboard
// ─────────────────────────────────────────────────────────────────────────────

test.describe('employer settings', () => {
  test.skip(AGAINST_PROD, 'no mutations against production');
  test.skip(!HAS_EMPLOYER, 'E2E_EMPLOYER_EMAIL / E2E_EMPLOYER_PASS not set');

  test('company profile fields persist after reload, company name is read-only and refused by the API', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await employerLogin(page);
    await page.goto('/employer/settings', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Company Information/ })).toBeVisible({ timeout: 60_000 });

    const nameInput = page.getByPlaceholder('Set at signup');
    await expect(nameInput).toHaveAttribute('readonly', '');
    await expect(nameInput).toHaveValue('Test Corp');
    await expect(page.getByText(/contact support/i).first()).toBeVisible();

    const stamp = `E2E ${RUN_TAG} ${Date.now()}`;
    const website = 'https://www.testcorp-e2e.example.com';
    await page.getByPlaceholder('https://yourcompany.com', { exact: true }).fill(website);
    await page.getByPlaceholder(/Tell candidates about your company/).fill(`Test Corp description ${stamp}`);
    const phone = page.getByPlaceholder('(555) 555-5555');
    const hasPhone = await phone.isVisible().catch(() => false);
    if (hasPhone) await phone.fill('(512) 555-0199');
    const [saveRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/employer/settings') && r.request().method() === 'PATCH', { timeout: 60_000 }),
      page.getByRole('button', { name: /Save Changes/ }).click(),
    ]);
    expect(saveRes.status(), await saveRes.text()).toBe(200);
    await expect(page.getByText(/Settings saved/)).toBeVisible({ timeout: 20_000 });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Company Information/ })).toBeVisible({ timeout: 60_000 });
    const settings = await json(await page.request.get('/api/employer/settings'));
    const info = settings.companyInfo as Record<string, unknown> | null;
    if (info) {
      // Company info lives on EmployerJob rows; only present once a job exists.
      expect(info.website).toBe(website);
      expect(String(info.description)).toContain(stamp);
      await expect(page.getByPlaceholder('https://yourcompany.com', { exact: true })).toHaveValue(website);
      await expect(page.getByPlaceholder(/Tell candidates about your company/)).toHaveValue(new RegExp(stamp));
    }
    if (hasPhone) {
      expect((settings.profile as Record<string, unknown>).phone).toBe('(512) 555-0199');
    }

    const locked = await page.request.patch('/api/employer/settings', { data: { company: 'Renamed Corp' } });
    expect(locked.status()).toBe(409);
    expect((await json(locked)).code).toBe('COMPANY_NAME_LOCKED');
    // XSS payload in description is stored as text, never executed.
    const xss = await page.request.patch('/api/employer/settings', { data: { companyDescription: `Test Corp <img src=x onerror=alert(1)> ${stamp}` } });
    expect(xss.status()).toBe(200);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Company Information/ })).toBeVisible({ timeout: 60_000 });

    // The website is rendered as a raw <a href> on every public listing's
    // "About the employer" card, so the API must refuse non-http(s) schemes.
    const badScheme = await page.request.patch('/api/employer/settings', { data: { companyWebsite: 'javascript:alert(document.domain)' } });
    const stored = await json(await page.request.get('/api/employer/settings'));
    const storedSite = (stored.companyInfo as Record<string, unknown> | null)?.website;
    // Put the real website back before asserting so a failure leaves clean data.
    await page.request.patch('/api/employer/settings', { data: { companyWebsite: website } });
    expect(
      badScheme.status() === 400 || storedSite !== 'javascript:alert(document.domain)',
      `PATCH /api/employer/settings accepted companyWebsite="javascript:alert(document.domain)" (status ${badScheme.status()}) and GET now returns website="${storedSite}"`,
    ).toBe(true);
    assertClean(c, 'settings');
  });

  test('the write-once company name cannot be changed through the generic profile endpoints either', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await employerLogin(page);
    const original = await json(await page.request.get('/api/auth/profile'));
    expect(original.role).toBe('employer');
    const originalCompany = String(original.company ?? '');
    expect(originalCompany, 'shared employer must have a company set').not.toBe('');
    const restoreBody = {
      firstName: original.firstName ?? null,
      lastName: original.lastName ?? null,
      phone: original.phone ?? null,
      company: originalCompany,
    };

    const attempts: string[] = [];
    try {
      // The signup endpoint re-called by an existing employer.
      const post = await page.request.post('/api/auth/profile', {
        data: { ...restoreBody, role: 'employer', company: `Renamed via POST ${RUN_TAG}` },
      });
      const afterPost = await json(await page.request.get('/api/auth/profile'));
      if (afterPost.company !== originalCompany) {
        attempts.push(`POST /api/auth/profile -> ${post.status()} changed company from "${originalCompany}" to "${afterPost.company}"`);
      }
      // The profile settings endpoint (candidate profile form).
      const patch = await page.request.patch('/api/auth/profile', {
        headers: { origin: new URL(page.url()).origin },
        data: { company: `Renamed via PATCH ${RUN_TAG}` },
      });
      const afterPatch = await json(await page.request.get('/api/auth/profile'));
      if (afterPatch.company !== originalCompany) {
        attempts.push(`PATCH /api/auth/profile -> ${patch.status()} changed company from "${originalCompany}" to "${afterPatch.company}"`);
      }
    } finally {
      // Always put the shared account back. POST /api/auth/profile is rate
      // limited (RATE_LIMITS.auth), so a single restore call can silently 429
      // and leave the shared employer renamed for every other suite. Retry
      // through PATCH, which is not on the auth bucket, until it sticks.
      const origin = new URL(page.url()).origin;
      await expect
        .poll(
          async () => {
            const current = await json(await page.request.get('/api/auth/profile'));
            if (current.company === originalCompany) return originalCompany;
            await page.request.patch('/api/auth/profile', {
              headers: { origin },
              data: { ...restoreBody, company: originalCompany },
            });
            return String(current.company);
          },
          { timeout: 60_000, intervals: [2_000], message: 'restore of the shared employer company name' },
        )
        .toBe(originalCompany);
    }
    // /api/employer/settings enforces COMPANY_NAME_LOCKED (409); the same
    // rule must hold everywhere the column is writable.
    expect(attempts, `company name lock bypassed:\n  ${attempts.join('\n  ')}`).toEqual([]);
    assertClean(c, 'company lock');
  });

  test('per-job application notification toggle persists after reload', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await employerLogin(page);
    const prefs = await json(await page.request.get('/api/employer/settings/notifications'));
    const list = prefs.preferences as Array<{ employerJobId: string; jobTitle: string; notifyOnApplication: boolean }>;
    test.skip(!list || list.length === 0, 'no postings to toggle notifications for');
    const target = list[0];

    await page.goto('/employer/settings', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Notifications/ }).first().click();
    await expect(page.getByRole('heading', { name: /Application Notifications/ })).toBeVisible({ timeout: 60_000 });
    const toggle = page.getByRole('button', { name: `Toggle notifications for ${target.jobTitle}` }).first();
    await expect(toggle).toBeVisible();
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/employer/settings/notifications') && r.request().method() === 'PATCH', { timeout: 60_000 }),
      toggle.click(),
    ]);
    expect(res.status(), await res.text()).toBe(200);
    const after = await json(await page.request.get('/api/employer/settings/notifications'));
    const updated = (after.preferences as typeof list).find((p) => p.employerJobId === target.employerJobId);
    expect(updated?.notifyOnApplication).toBe(!target.notifyOnApplication);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Notifications/ }).first().click();
    const row = page.locator('div', { has: page.getByRole('button', { name: `Toggle notifications for ${target.jobTitle}` }) }).last();
    await expect(row).toContainText(target.notifyOnApplication ? 'Notifications off' : 'Email on each application', { timeout: 60_000 });

    // Restore the original state so the test is re-runnable.
    const restore = await page.request.patch('/api/employer/settings/notifications', { data: { employerJobId: target.employerJobId, notifyOnApplication: target.notifyOnApplication } });
    expect(restore.status()).toBe(200);
    const bad = await page.request.patch('/api/employer/settings/notifications', { data: { employerJobId: target.employerJobId, notifyDigest: 'hourly' } });
    expect(bad.status()).toBe(400);
    assertClean(c, 'notifications');
  });

  test('legacy /employer/dashboard/[token] with a garbage token falls back to employer login, then the dashboard when signed in', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await page.goto('/employer/dashboard/not-a-real-token', { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/login\?role=employer/, { timeout: 60_000, waitUntil: 'domcontentloaded' });
    expect(page.url()).toContain('redirectTo=%2Femployer%2Fdashboard');
    await employerLogin(page);
    await page.goto('/employer/dashboard/not-a-real-token', { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/employer\/dashboard(\?|$)/, { timeout: 60_000, waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
    assertClean(c, 'legacy token dashboard');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Sign out
// ─────────────────────────────────────────────────────────────────────────────

test.describe('sign out', () => {
  test.skip(!HAS_EMPLOYER, 'E2E_EMPLOYER_EMAIL / E2E_EMPLOYER_PASS not set');

  test('signing out from the header menu redirects employer pages to login', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await employerLogin(page);
    await page.locator('button.um-trigger').first().click();
    await page.getByRole('button', { name: /Sign out/ }).click();
    await page.waitForURL((u) => u.pathname === '/', { timeout: 60_000, waitUntil: 'domcontentloaded' });
    await expect.poll(async () => (await page.request.get('/api/employer/billing')).status(), { timeout: 30_000 }).toBe(401);
    await page.goto('/employer/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/login/, { timeout: 60_000, waitUntil: 'domcontentloaded' });
    await page.goto('/employer/settings', { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/login/, { timeout: 60_000, waitUntil: 'domcontentloaded' });
    assertClean(c, 'sign out');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Copy rules
// ─────────────────────────────────────────────────────────────────────────────

test.describe('employer copy rules', () => {
  test.skip(!HAS_EMPLOYER, 'E2E_EMPLOYER_EMAIL / E2E_EMPLOYER_PASS not set');

  test('employer pages contain no em/en dashes, "founder" or "Pavan" in visible copy', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await employerLogin(page);
    await resetDraft(page);
    const violations: string[] = [];
    const scan = async (label: string) => {
      const text = await page.locator('body').innerText();
      for (const line of text.split('\n')) {
        if (/[–—]/.test(line)) violations.push(`${label}: dash in "${line.trim().slice(0, 90)}"`);
        if (/founder/i.test(line)) violations.push(`${label}: founder in "${line.trim().slice(0, 90)}"`);
        if (/Pavan/.test(line)) violations.push(`${label}: Pavan in "${line.trim().slice(0, 90)}"`);
      }
    };
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
    await scan('/employer/dashboard');
    await page.goto('/employer/settings', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Company Information/ })).toBeVisible({ timeout: 60_000 });
    await scan('/employer/settings');
    await gotoWizard(page);
    await scan('/post-job step 1');
    await fillStep1(page, `E2E Hunt PMHNP copy ${Date.now()}`);
    await scan('/post-job step 2');
    await fillStep2(page);
    await scan('/post-job step 3');
    await fillStep3(page);
    await scan('/post-job step 4');
    await seedFormData(page, `E2E Hunt PMHNP copy ${Date.now()}`);
    await page.goto('/post-job/preview', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Preview Your Job Post/ })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Live for|Free trial post|has used its free post|This listing is/)).toBeVisible({ timeout: 60_000 });
    await scan('/post-job/preview');
    await page.goto('/post-job/checkout', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Confirm Your Job Posting/ })).toBeVisible({ timeout: 60_000 });
    await scan('/post-job/checkout');
    const unique = Array.from(new Set(violations));
    expect(unique, `copy rule violations (${unique.length}):\n  ${unique.slice(0, 40).join('\n  ')}`).toEqual([]);
    assertClean(c, 'copy rules');
  });
});
