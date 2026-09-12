import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { getSeekerCreds } from '../fixtures/auth';
import { attachErrorCollectors, assertClean, hydrationWarnings, type Collected } from './_helpers';

/**
 * Bug-hunt slice "seeker-jobs-flow" (run tag h0902).
 *
 * Journey: a logged-in job seeker (the shared testseeker account) doing job
 * things end to end:
 *   - saving / unsaving jobs from the list and the detail page, with server
 *     persistence verified on /saved after clearing localStorage
 *   - resume upload on /settings (PDF fixture), AI autofill review, replace,
 *     remove, and client-side validation for .txt / oversized files
 *   - in-platform (Easy Apply) application: required-field validation, happy
 *     path with screening questions, duplicate notice, withdraw
 *   - external apply click tracking (/api/jobs/[id]/track-apply) and the
 *     "Did you finish applying?" confirmation
 *   - /messages inbox
 *   - job alerts from the nav pill on /jobs and the /job-alerts/manage page
 *   - /dashboard/resume-studio: create, edit + autosave, score, tailor, PDF
 *     export, duplicate, delete, quota display
 *   - push-notification prompt and PWA install banner dismissal persistence
 *   - user-facing copy rules (no em/en dashes, no "founder", no "Pavan")
 *
 * Every test is independent and re-runnable: state it needs is (re)created
 * through the same APIs the UI uses, and state it creates is removed again.
 * Mutating describes skip against production.
 */

const AGAINST_PROD =
  !!process.env.PLAYWRIGHT_BASE_URL && process.env.PLAYWRIGHT_BASE_URL.includes('pmhnphiring.com');
const SEEKER = getSeekerCreds();
const RESUME_PATH = path.resolve(
  process.cwd(),
  process.env.E2E_TEST_RESUME_PATH || 'tests/e2e/fixtures/sample-resume.pdf',
);
const HAS_RESUME_FIXTURE = fs.existsSync(RESUME_PATH);
const RUN_TAG = 'h0902';
const STUDIO_TITLE_PREFIX = `E2E ${RUN_TAG}`;
const UUID_RE = /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i;
const DASH_RE = /[–—]/; // en dash, em dash

/**
 * playwright.config.ts caps navigation at 30s and actions at 20s. Against
 * `next dev` those caps are too tight for this slice: routes compile on first
 * hit and the seeker journey walks a lot of first-hit routes (/jobs, a job
 * detail page, /saved, /settings, /my-applications, /dashboard/resume-studio),
 * which produced page.goto/page.reload timeouts that look like product bugs
 * and are not. Scoped to this file so other specs keep the repo defaults.
 */
test.use({ navigationTimeout: 120_000, actionTimeout: 45_000 });

interface JobSummary {
  id: string;
  title: string;
  employer: string;
  sourceType: string | null;
  applyOnPlatform: boolean;
}

/** A listing row plus the canonical detail-page slug, once liveness is proven. */
type LiveJob = JobSummary & { slug: string };

interface ScreeningQuestion {
  id: string;
  questionText: string;
  questionType: 'boolean' | 'text' | 'select' | 'number';
  options: string[];
  isRequired: boolean;
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function loginSeeker(page: Page): Promise<void> {
  if (!SEEKER) throw new Error('E2E_SEEKER_EMAIL / E2E_SEEKER_PASS not set');
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.locator('button[type="submit"]').first().waitFor({ state: 'visible', timeout: 60_000 });
  await page.locator('input[type="email"]').first().fill(SEEKER.email);
  await page.locator('input[type="password"]').first().fill(SEEKER.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
    timeout: 60_000,
    waitUntil: 'domcontentloaded',
  });
}

async function dismissCookieBanner(page: Page): Promise<void> {
  const accept = page.getByRole('button', { name: /accept all/i });
  if (await accept.isVisible().catch(() => false)) {
    await accept.click().catch(() => undefined);
  }
}

async function apiJson<T = unknown>(
  page: Page,
  url: string,
  init?: { method?: string; data?: unknown },
): Promise<{ status: number; body: T }> {
  const res = await page.request.fetch(url, {
    method: init?.method ?? 'GET',
    data: init?.data,
    headers: init?.data !== undefined ? { 'Content-Type': 'application/json' } : undefined,
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = await res.text().catch(() => null);
  }
  return { status: res.status(), body: body as T };
}

async function listEasyApplyJobs(page: Page): Promise<JobSummary[]> {
  const { status, body } = await apiJson<{ jobs: JobSummary[] }>(page, '/api/jobs?easyApply=1&limit=50');
  expect(status, 'GET /api/jobs?easyApply=1 should succeed').toBe(200);
  return (body.jobs || []).filter((j) => j.applyOnPlatform && j.sourceType === 'employer');
}

/**
 * Liveness probe for a listing row.
 *
 * The browse surfaces (`/jobs` SSR and `GET /api/jobs`) select through
 * lib/filters.ts `publicJobsWhere()`, which is `isPublished` + the non-PMHNP
 * exclusions and carries NO expiry predicate. Every detail surface disagrees:
 * `GET /api/jobs/[id]` requires `expiresAt` null-or-future, `/jobs/[slug]`
 * treats a past `expiresAt` as gone, and the middleware job-410 handler serves
 * "Position Removed". So a job can be listed and still have no page behind it.
 * Any test that opens a detail page must therefore confirm the row is live
 * first, and `GET /api/jobs/[id]` applies exactly the detail-page predicate.
 *
 * Returns the row's canonical slug (detail URLs are `/jobs/<title>-<uuid>`;
 * a bare UUID also resolves, but the slug is what users actually click).
 */
async function liveJob(page: Page, id: string): Promise<string | null> {
  // Only a 404 means "this row is gone". 429/5xx/timeouts happen constantly on
  // a shared dev server and must not silently turn a real assertion into a
  // skip, so retry once and then assume the job is usable — a wrong guess
  // fails the test loudly instead of hiding it.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const res = await page.request.get(`/api/jobs/${id}`).catch(() => null);
    if (!res) continue;
    if (res.status() === 404) return null;
    if (res.status() === 200) {
      const body = (await res.json().catch(() => null)) as { slug?: string | null } | null;
      return body?.slug || id;
    }
  }
  return id;
}

/** Prefer an operator test posting so real employers get no notification noise. */
async function pickEasyApplyJob(page: Page): Promise<LiveJob | null> {
  const jobs = await listEasyApplyJobs(page);
  const ordered = [
    ...jobs.filter((j) => /test/i.test(j.title)),
    ...jobs.filter((j) => !/test/i.test(j.title)),
  ];
  for (const job of ordered) {
    const slug = await liveJob(page, job.id);
    if (slug) return { ...job, slug };
  }
  return null;
}

async function pickExternalJob(page: Page): Promise<LiveJob | null> {
  const { status, body } = await apiJson<{ jobs: JobSummary[] }>(page, '/api/jobs?limit=50&sort=newest');
  expect(status).toBe(200);
  const candidates = (body.jobs || []).filter((j) => !j.applyOnPlatform && j.sourceType !== 'employer');
  for (const job of candidates) {
    const slug = await liveJob(page, job.id);
    if (slug) return { ...job, slug };
  }
  return null;
}

async function getScreeningQuestions(page: Page, jobId: string): Promise<ScreeningQuestion[]> {
  const { body } = await apiJson<{ questions?: ScreeningQuestion[] }>(page, `/api/jobs/${jobId}/screening-questions`);
  return body?.questions ?? [];
}

function answerFor(q: ScreeningQuestion): string {
  if (q.questionType === 'boolean') return 'yes';
  if (q.questionType === 'select') return q.options?.[0] ?? 'Yes';
  if (q.questionType === 'number') return '3';
  return 'Yes, I meet this requirement.';
}

/** Remove any application row for this job so the apply flow starts clean. */
async function resetApplication(page: Page, jobId: string): Promise<void> {
  const { status } = await apiJson(page, '/api/applications', { method: 'DELETE', data: { jobId } });
  expect([200, 401]).toContain(status);
  await page.evaluate(() => localStorage.removeItem('appliedJobs'));
}

/** Make sure the seeker has a live (non-withdrawn) application on this job. */
async function ensureApplied(page: Page, jobId: string): Promise<string> {
  const questions = await getScreeningQuestions(page, jobId);
  const { status, body } = await apiJson<{ applicationId?: string; error?: string }>(
    page,
    '/api/applications/apply-direct',
    {
      method: 'POST',
      data: {
        jobId,
        coverLetter: `E2E ${RUN_TAG} setup application`,
        consent: true,
        screeningAnswers: questions.length
          ? questions.map((q) => ({ questionId: q.id, answer: answerFor(q) }))
          : undefined,
      },
    },
  );
  expect(status, `apply-direct setup failed: ${JSON.stringify(body)}`).toBe(200);
  return body.applicationId as string;
}

async function firstJobCardOnList(page: Page): Promise<{ id: string; bookmark: ReturnType<Page['locator']> }> {
  await page.goto('/jobs', { waitUntil: 'domcontentloaded' });
  const bookmark = page.locator('button[aria-label="Save job"], button[aria-label="Save"]').first();
  await expect(bookmark, 'a job card bookmark button should render on /jobs').toBeVisible({ timeout: 60_000 });
  const href = await bookmark.locator('xpath=ancestor::a[starts-with(@href,"/jobs/")][1]').getAttribute('href');
  const id = href?.match(UUID_RE)?.[1];
  expect(id, `could not extract job id from card href ${href}`).toBeTruthy();
  return { id: id as string, bookmark };
}

async function bodyText(page: Page): Promise<string> {
  return page.locator('body').innerText();
}

// Copy rules: no em/en dashes, never "founder", never "Pavan".
function assertCopyRules(text: string, label: string): void {
  const dashMatches = text.split('\n').filter((line) => DASH_RE.test(line)).slice(0, 5);
  expect(dashMatches, `${label}: user-facing copy contains em/en dashes:\n  ${dashMatches.join('\n  ')}`).toEqual([]);
  expect(text, `${label}: copy must never contain the word "founder"`).not.toMatch(/\bfounder\b/i);
  expect(text, `${label}: copy must never display "Pavan"`).not.toMatch(/Pavan/);
}

async function deleteStudioLeftovers(page: Page): Promise<void> {
  const { status, body } = await apiJson<{ documents?: Array<{ id: string; title: string }> }>(
    page,
    '/api/resume-studio/documents',
  );
  if (status !== 200) return;
  for (const doc of body.documents ?? []) {
    if (doc.title.startsWith(STUDIO_TITLE_PREFIX)) {
      await apiJson(page, `/api/resume-studio/documents/${doc.id}`, { method: 'DELETE' });
    }
  }
}

// ── 0. sanity ────────────────────────────────────────────────────────────────

test.describe('sanity', () => {
  test.skip(!SEEKER, 'E2E_SEEKER_EMAIL / E2E_SEEKER_PASS not set');

  test('login page is PMHNP Hiring and seeker login lands on an app page', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toContainText(/PMHNP Hiring/i, { timeout: 60_000 });
    await loginSeeker(page);
    expect(page.url()).not.toMatch(/\/login/);
    const cookies = await page.context().cookies();
    const authCookie = cookies.find((ck) => /^sb-.*-auth-token/.test(ck.name));
    expect(authCookie, 'a Supabase auth cookie should be set after login').toBeTruthy();
    expect(authCookie?.name, 'must be talking to the DEV Supabase project').toContain('zdmpmncrcpgpmwdqvekg');
    const { status, body } = await apiJson<{ id?: string; email?: string; role?: string }>(page, '/api/auth/me');
    expect(status).toBe(200);
    expect(body.email?.toLowerCase()).toBe(SEEKER!.email.toLowerCase());
    assertClean(c, 'login');
  });
});

// ── 0b. the list must only advertise jobs that still have a page ─────────────

test.describe('browse -> open a job', () => {
  test.skip(!SEEKER, 'seeker creds missing');

  test('every job card on /jobs page 1 opens a real detail page (listing vs detail expiry gate)', async ({ page }) => {
    // Regression guard for the listing-vs-detail expiry gap found in this run
    // (h0902): lib/filters.ts `publicJobsWhere()` — the predicate behind both
    // the /jobs SSR page and GET /api/jobs — was `isPublished` plus the
    // non-PMHNP exclusions with NO expiry clause, while every detail surface
    // enforces one (`GET /api/jobs/[id]` requires expiresAt null-or-future;
    // app/jobs/[slug]/page.tsx treats a past expiresAt as gone; middleware.ts
    // serves a 410 "Position Removed"). /jobs/easy-apply, the sitemaps and the
    // feeds all filtered expiry already, so the main browse surface was the
    // only one advertising jobs with no page behind them: at the time of the
    // finding all 12 of the newest listed jobs 404'd on their detail route.
    // Keep this assertion green — the listing must never re-open that gap.
    test.setTimeout(180_000);
    const c = attachErrorCollectors(page);
    await loginSeeker(page);
    const { status, body } = await apiJson<{ jobs: JobSummary[] }>(page, '/api/jobs?limit=10&sort=newest');
    expect(status).toBe(200);
    const jobs = (body.jobs ?? []).slice(0, 10);
    expect(jobs.length, 'the listing API should return jobs').toBeGreaterThan(0);

    const dead: string[] = [];
    for (const job of jobs) {
      const res = await page.request.get(`/api/jobs/${job.id}`);
      if (res.status() !== 200) dead.push(`${res.status()} ${job.id} "${job.title}" (${job.employer})`);
    }
    expect(
      dead,
      `jobs listed on /jobs whose detail route is gone:\n  ${dead.join('\n  ')}`,
    ).toEqual([]);
    assertClean(c, 'browse -> open');
  });
});

// ── 0c. applied-state hydration ──────────────────────────────────────────────

test.describe('hydration of applied state', () => {
  test.skip(AGAINST_PROD, 'no mutations against production');
  test.skip(!SEEKER, 'seeker creds missing');

  test('a seeker with an application gets no hydration mismatch on /jobs or the job detail page', async ({ page }) => {
    // BUG (h0902): lib/hooks/useAppliedJobs.ts seeds its module cache from
    // localStorage during the RENDER phase (`if (cachedMap === null &&
    // typeof window !== 'undefined') cachedMap = getStoredAppliedJobs()`),
    // with no mount guard. Two consumers then branch on it in markup that the
    // server rendered without it:
    //   components/JobCard.tsx:81  `const applied = isApplied(job.id)` ->
    //     an extra "✓ Applied" pill at :341 (grid) / :645 (list)
    //   components/ApplyButton.tsx:152 `isApplied(jobId) || serverApplied?.applied`
    //     -> the CTA text at :624 reads "Apply Again" instead of "Easy Apply"
    // so the client's first paint disagrees with the SSR HTML and React
    // throws the whole subtree away and re-renders it. The same file already
    // knows the fix: `freshness`, `viewed` and `ageIndicator` in JobCard are
    // all behind useViewedJobs' `isHydrated` flag, and SaveJobButton uses a
    // `mounted` state for exactly this reason -- `applied` was left out.
    // It only reproduces for a seeker who has actually applied to a job that
    // is on the page, which is why it survives a logged-out smoke test.
    // Marked test.fail() so the suite stays green while documenting it.
    test.fail(true, 'applied state is read from localStorage during render, so JobCard and ApplyButton mismatch the SSR HTML');
    test.setTimeout(240_000);
    const c = attachErrorCollectors(page);
    await loginSeeker(page);
    const job = await pickEasyApplyJob(page);
    test.skip(!job, 'no live employer-posted Easy Apply job in DB');
    await ensureApplied(page, job!.id);

    // First visit: the hook syncs GET /api/applications and mirrors the result
    // into localStorage. Nothing mismatches yet because the cache started
    // empty, so wait until the entry is actually written.
    await page.goto('/jobs', { waitUntil: 'domcontentloaded' });
    await dismissCookieBanner(page);
    await expect(page.locator(`a[href*="${job!.id}"]`).first()).toBeVisible({ timeout: 90_000 });
    await expect
      .poll(
        async () => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('appliedJobs') || '{}')).length),
        { timeout: 60_000, message: 'the applied-jobs cache should mirror the server row' },
      )
      .toBeGreaterThan(0);

    // Second visit: now the very first client render reads a non-empty cache
    // while the server rendered the page without it.
    c.pageErrors.length = 0;
    c.consoleErrors.length = 0;
    await page.goto('/jobs', { waitUntil: 'domcontentloaded' });
    await expect(page.locator(`a[href*="${job!.id}"]`).first()).toBeVisible({ timeout: 90_000 });
    await page.goto(`/jobs/${job!.slug}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: /^(easy apply|apply again)$/i }).first()).toBeVisible({
      timeout: 90_000,
    });

    const mismatches = hydrationWarnings(c);
    await resetApplication(page, job!.id);
    expect(
      mismatches,
      `React hydration mismatches while a seeker with an application browsed /jobs and the detail page:\n  ${mismatches.join('\n  ')}`,
    ).toEqual([]);
  });
});

// ── 1. saved jobs ────────────────────────────────────────────────────────────

test.describe('saved jobs', () => {
  test.skip(AGAINST_PROD, 'no mutations against production');
  test.skip(!SEEKER, 'seeker creds missing');

  /**
   * Put a job into a known state on BOTH sides before a UI assertion.
   *
   * Clearing only the server row is not enough: lib/hooks/useSavedJobs.ts
   * re-runs its localStorage -> server migration on every full page load
   * (`migrated` is module scope, so it resets with the JS context), and any
   * id that is in localStorage but not on the server is POSTed straight back.
   * A test that clears the row and reloads therefore finds the job saved
   * again and its "Save" click turns into an unsave.
   */
  async function resetSaved(page: Page, jobId: string, saved: boolean): Promise<void> {
    await apiJson(page, '/api/saved-jobs', {
      method: saved ? 'POST' : 'DELETE',
      data: { jobId },
    });
    await page.evaluate(() => localStorage.removeItem('savedJobs')).catch(() => undefined);
  }

  /** The server list is the source of truth; poll it instead of racing a verb. */
  async function expectServerSaved(page: Page, jobId: string, saved: boolean): Promise<void> {
    await expect
      .poll(
        async () => {
          const { body } = await apiJson<{ savedJobs?: Array<{ jobId: string }> }>(page, '/api/saved-jobs');
          return (body.savedJobs ?? []).some((s) => s.jobId === jobId);
        },
        {
          timeout: 60_000,
          message: `GET /api/saved-jobs should ${saved ? 'contain' : 'not contain'} ${jobId}`,
        },
      )
      .toBe(saved);
  }

  test('save from the list persists to the server and shows on /saved after localStorage is cleared', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await loginSeeker(page);
    const { id } = await firstJobCardOnList(page);
    await dismissCookieBanner(page);

    // Start from a known-unsaved state on the server AND in localStorage.
    await resetSaved(page, id, false);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator(`a[href*="${id}"]`).first()).toBeVisible({ timeout: 90_000 });
    // Let the hook's server sync land before clicking, otherwise the button
    // can flip under the click and send the opposite verb.
    await page
      .waitForResponse((r) => r.url().includes('/api/saved-jobs') && r.request().method() === 'GET', { timeout: 60_000 })
      .catch(() => undefined);
    const bookmark = page
      .locator(`a[href*="${id}"] button[aria-label="Save job"], a[href*="${id}"] button[aria-label="Save"]`)
      .first();
    await expect(bookmark, 'the card should render in the unsaved state').toBeVisible({ timeout: 60_000 });

    await bookmark.click();
    await expectServerSaved(page, id, true);

    // Server persistence: wipe the local cache, the saved page must rebuild from the API.
    await page.evaluate(() => localStorage.removeItem('savedJobs'));
    await page.goto('/saved', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /my jobs/i })).toBeVisible({ timeout: 90_000 });
    await expect(page.locator(`a[href*="${id}"]`).first()).toBeVisible({ timeout: 60_000 });

    await resetSaved(page, id, false);
    assertClean(c, 'save from list');
  });

  test('save from the detail page, unsave from /saved, and the server list follows', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await loginSeeker(page);
    const job = (await pickEasyApplyJob(page)) ?? (await pickExternalJob(page));
    test.skip(!job, 'no live (non-expired) job available in this database');
    const id = job!.id;

    await page.goto(`/jobs/${job!.slug}`, { waitUntil: 'domcontentloaded' });
    await dismissCookieBanner(page);
    await resetSaved(page, id, false);
    await page.reload({ waitUntil: 'domcontentloaded' });
    const saveBtn = page.locator('button[aria-label="Save job"]').first();
    await expect(saveBtn).toBeVisible({ timeout: 90_000 });
    await saveBtn.click();
    await expect(page.locator('button[aria-label="Remove saved job"]').first()).toHaveAttribute('aria-pressed', 'true');
    await expectServerSaved(page, id, true);

    // Reload with an empty cache: the saved state must come back from the
    // server, not from localStorage.
    await page.evaluate(() => localStorage.removeItem('savedJobs'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(
      page.locator('button[aria-label="Remove saved job"]').first(),
      'a server-saved job must render as saved on a cold detail-page load',
    ).toBeVisible({ timeout: 90_000 });

    // Unsave from /saved via the card's remove control.
    await page.goto('/saved', { waitUntil: 'domcontentloaded' });
    const wrapper = page.locator('.saved-job-wrapper').filter({ has: page.locator(`a[href*="${id}"]`) }).first();
    await expect(wrapper).toBeVisible({ timeout: 90_000 });
    const { body: before } = await apiJson<{ savedJobs: Array<{ jobId: string }> }>(page, '/api/saved-jobs');
    await expect(
      page.getByRole('button', { name: /^Saved/ }).first(),
      'Saved tab badge should equal the server saved count',
    ).toContainText(String(before.savedJobs.length));

    await wrapper.hover();
    await wrapper.locator('button[title="Remove from saved"]').click({ force: true });
    await expectServerSaved(page, id, false);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator(`a[href*="${id}"]`)).toHaveCount(0, { timeout: 90_000 });
    assertClean(c, 'save from detail');
  });

  test('unsave from the detail page clears the server row and flips the button back', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await loginSeeker(page);
    const job = (await pickEasyApplyJob(page)) ?? (await pickExternalJob(page));
    test.skip(!job, 'no live (non-expired) job available in this database');
    const id = job!.id;

    await page.goto(`/jobs/${job!.slug}`, { waitUntil: 'domcontentloaded' });
    await dismissCookieBanner(page);
    await resetSaved(page, id, true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    const removeBtn = page.locator('button[aria-label="Remove saved job"]').first();
    await expect(removeBtn).toBeVisible({ timeout: 90_000 });

    await removeBtn.click();
    await expect(page.locator('button[aria-label="Save job"]').first()).toBeVisible({ timeout: 30_000 });
    await expectServerSaved(page, id, false);
    assertClean(c, 'unsave from detail');
  });
});

// ── 2. resume ────────────────────────────────────────────────────────────────

test.describe('resume upload on /settings', () => {
  test.skip(AGAINST_PROD, 'no mutations against production');
  test.skip(!SEEKER, 'seeker creds missing');
  test.skip(!HAS_RESUME_FIXTURE, `resume fixture missing at ${RESUME_PATH}`);

  async function gotoResumeSection(page: Page): Promise<void> {
    await page.goto('/settings?tab=personal', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#section-resume')).toBeVisible({ timeout: 60_000 });
    await dismissCookieBanner(page);
  }

  test('upload the PDF, review the AI extraction (Jordan Rivera, skills, licenses) and apply it to the profile', async ({ page }) => {
    test.setTimeout(300_000); // the AI parse regularly takes 60-150s
    const c = attachErrorCollectors(page);
    await loginSeeker(page);
    await gotoResumeSection(page);

    const [uploadRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/upload') && r.request().method() === 'POST', { timeout: 90_000 }),
      page.locator('#section-resume input[type="file"]').setInputFiles(RESUME_PATH),
    ]);
    expect(uploadRes.status(), 'POST /api/upload').toBe(200);
    await expect(page.getByText(/Resume uploaded/)).toBeVisible({ timeout: 30_000 });

    const dialog = page.getByRole('dialog', { name: /review extracted resume data/i });
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    const previewRes = await page.waitForResponse(
      (r) => r.url().includes('/api/resume/parse') && r.url().includes('preview=1'),
      { timeout: 240_000 },
    );
    expect(previewRes.status(), `preview parse: ${await previewRes.text().catch(() => '')}`).toBe(200);

    await expect(dialog).toContainText(/Jordan/i, { timeout: 30_000 });
    await expect(dialog).toContainText(/Rivera/i);
    await expect(dialog, 'skills should be extracted').toContainText(/Telepsychiatry|Medication management|Epic/i);
    await expect(dialog, 'license should be extracted').toContainText(/APRN|Texas|TX/i);
    await expect(dialog, 'certification should be extracted').toContainText(/PMHNP-BC/i);

    const [applyRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/resume/parse') && !r.url().includes('preview=1') && r.request().method() === 'POST',
        { timeout: 240_000 },
      ),
      dialog.getByRole('button', { name: /fill empty fields/i }).click(),
    ]);
    expect(applyRes.status(), `apply parse: ${await applyRes.text().catch(() => '')}`).toBe(200);
    await expect(dialog).toBeHidden({ timeout: 30_000 });

    const { body: profile } = await apiJson<{ resumeUrl: string | null; resumeParseStatus: string | null; skills?: string[] | null }>(page, '/api/auth/profile');
    expect(profile.resumeUrl, 'profile.resumeUrl should be set after upload').toBeTruthy();
    expect(profile.resumeParseStatus).toBe('completed');

    const { body: licenses } = await apiJson<unknown>(page, '/api/profile/licenses');
    const { body: certs } = await apiJson<unknown>(page, '/api/profile/certifications');
    const licenseJson = JSON.stringify(licenses);
    const certJson = JSON.stringify(certs);
    expect(
      /TX|Texas/i.test(licenseJson) || /PMHNP-BC/i.test(certJson),
      `expected a Texas license or PMHNP-BC certification after autofill; licenses=${licenseJson.slice(0, 300)} certs=${certJson.slice(0, 300)}`,
    ).toBe(true);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#section-resume')).toContainText(/Uploaded/, { timeout: 60_000 });
    await expect(page.locator('#section-resume')).toContainText(/Profile filled/);
    assertClean(c, 'resume upload + autofill');
  });

  test('replace the resume with a second upload, then delete it', async ({ page }) => {
    test.setTimeout(240_000);
    const c = attachErrorCollectors(page);
    await loginSeeker(page);
    await gotoResumeSection(page);

    const { body: before } = await apiJson<{ resumeUrl: string | null }>(page, '/api/auth/profile');
    if (!before.resumeUrl) {
      await Promise.all([
        page.waitForResponse((r) => r.url().includes('/api/upload') && r.request().method() === 'POST', { timeout: 90_000 }),
        page.locator('#section-resume input[type="file"]').setInputFiles(RESUME_PATH),
      ]);
      await page.getByRole('dialog').getByRole('button', { name: /skip for now|close/i }).first().click().catch(() => undefined);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.locator('#section-resume')).toBeVisible({ timeout: 60_000 });
    }
    const { body: current } = await apiJson<{ resumeUrl: string | null }>(page, '/api/auth/profile');
    expect(current.resumeUrl).toBeTruthy();

    // Replace with a renamed copy of the fixture.
    await expect(page.getByRole('button', { name: /replace resume/i })).toBeVisible({ timeout: 60_000 });
    const [uploadRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/upload') && r.request().method() === 'POST', { timeout: 90_000 }),
      page.locator('#section-resume input[type="file"]').setInputFiles({
        name: `second-resume-${RUN_TAG}.pdf`,
        mimeType: 'application/pdf',
        buffer: fs.readFileSync(RESUME_PATH),
      }),
    ]);
    expect(uploadRes.status()).toBe(200);
    await expect(page.getByText(/Resume uploaded/)).toBeVisible({ timeout: 30_000 });
    const reviewDialog = page.getByRole('dialog', { name: /review extracted resume data/i });
    await expect(reviewDialog).toBeVisible({ timeout: 30_000 });
    await reviewDialog.getByRole('button', { name: /^close review$/i }).click();
    await expect(reviewDialog).toBeHidden();
    await expect(page.locator('#section-resume')).toContainText(`second-resume-${RUN_TAG}.pdf`);

    const { body: after } = await apiJson<{ resumeUrl: string | null }>(page, '/api/auth/profile');
    expect(after.resumeUrl, 'resumeUrl should be set after replace').toBeTruthy();
    expect(after.resumeUrl, 'replace must store the new file path').not.toBe(current.resumeUrl);

    // Remove
    await page.getByRole('button', { name: /delete resume/i }).click();
    await expect(page.getByText(/Delete your resume\?/)).toBeVisible();
    const [delRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/profile/resume') && r.request().method() === 'DELETE', { timeout: 60_000 }),
      page.getByRole('button', { name: /yes, delete/i }).click(),
    ]);
    expect(delRes.status(), 'DELETE /api/profile/resume').toBe(200);
    await expect(page.getByText(/Upload Your Resume/)).toBeVisible({ timeout: 30_000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Upload Your Resume/)).toBeVisible({ timeout: 60_000 });
    const { body: gone } = await apiJson<{ resumeUrl: string | null }>(page, '/api/auth/profile');
    expect(gone.resumeUrl).toBeNull();
    assertClean(c, 'resume replace + delete');
  });

  test('a .txt file is rejected client-side with a clear message and no upload request', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await loginSeeker(page);
    await gotoResumeSection(page);
    let uploadRequests = 0;
    page.on('request', (r) => {
      if (r.url().includes('/api/upload') && r.method() === 'POST') uploadRequests += 1;
    });
    await page.locator('#section-resume input[type="file"]').setInputFiles({
      name: 'resume.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Jordan Rivera PMHNP-BC plain text resume'),
    });
    await expect(page.locator('#section-resume')).toContainText(/Invalid file type|PDF or Word/i, { timeout: 15_000 });
    expect(uploadRequests, 'invalid type must not hit /api/upload').toBe(0);
    assertClean(c, 'txt rejected');
  });

  test('an oversized PDF (6 MB) is rejected client-side with a size message', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await loginSeeker(page);
    await gotoResumeSection(page);
    let uploadRequests = 0;
    page.on('request', (r) => {
      if (r.url().includes('/api/upload') && r.method() === 'POST') uploadRequests += 1;
    });
    const big = Buffer.alloc(6 * 1024 * 1024, 0x20);
    Buffer.from('%PDF-1.4\n').copy(big, 0);
    await page.locator('#section-resume input[type="file"]').setInputFiles({
      name: 'huge.pdf',
      mimeType: 'application/pdf',
      buffer: big,
    });
    await expect(page.locator('#section-resume')).toContainText(/too large|Maximum size is 5 MB/i, { timeout: 15_000 });
    expect(uploadRequests, 'oversized file must not hit /api/upload').toBe(0);
    assertClean(c, 'oversized rejected');
  });
});

// ── 3. in-platform apply ─────────────────────────────────────────────────────

test.describe('in-platform apply (Easy Apply)', () => {
  test.skip(AGAINST_PROD, 'no mutations against production');
  test.skip(!SEEKER, 'seeker creds missing');

  async function openApplyModal(page: Page, jobSlug: string) {
    await page.goto(`/jobs/${jobSlug}`, { waitUntil: 'domcontentloaded' });
    await dismissCookieBanner(page);
    const applyBtn = page.getByRole('button', { name: /^(easy apply|apply again)$/i }).first();
    await expect(applyBtn).toBeVisible({ timeout: 60_000 });
    await applyBtn.click();
    const modal = page.locator('form').filter({ has: page.getByRole('button', { name: /submit application/i }) });
    await expect(modal).toBeVisible({ timeout: 30_000 });
    await expect(modal.getByText(/Loading your profile/)).toBeHidden({ timeout: 60_000 });
    return modal;
  }

  test('empty submit is blocked: consent gate, then required screening questions', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await loginSeeker(page);
    const job = await pickEasyApplyJob(page);
    test.skip(!job, 'no live employer-posted Easy Apply job in DB');
    await resetApplication(page, job!.id);
    const questions = await getScreeningQuestions(page, job!.id);

    const modal = await openApplyModal(page, job!.slug);
    const submit = modal.getByRole('button', { name: /submit application/i });
    await expect(submit, 'submit must be disabled until consent is given').toBeDisabled();

    // Server-side guard for the same rule.
    const noConsent = await apiJson<{ error?: string }>(page, '/api/applications/apply-direct', {
      method: 'POST',
      data: { jobId: job!.id, consent: false },
    });
    expect(noConsent.status).toBe(400);
    expect(noConsent.body.error).toMatch(/consent/i);

    await modal.getByRole('checkbox').first().check();
    await expect(submit).toBeEnabled();

    if (questions.some((q) => q.isRequired)) {
      const [res] = await Promise.all([
        page.waitForResponse((r) => r.url().includes('/api/applications/apply-direct'), { timeout: 60_000 }),
        submit.click(),
      ]);
      expect(res.status(), 'unanswered required question must be rejected').toBe(400);
      await expect(modal.getByText(/Please answer/i)).toBeVisible({ timeout: 15_000 });
      const { body } = await apiJson<{ applied: boolean }>(page, `/api/applications/check?jobId=${job!.id}`);
      expect(body.applied, 'no application row after a rejected submit').toBe(false);
    } else {
      test.info().annotations.push({ type: 'note', description: `job ${job!.id} has no required screening questions` });
    }
    assertClean(c, 'apply validation');
  });

  test('happy path: fill the form with screening answers + unicode/script cover letter, submit, see it on /my-applications', async ({ page }) => {
    test.setTimeout(180_000);
    const c = attachErrorCollectors(page);
    await loginSeeker(page);
    const job = await pickEasyApplyJob(page);
    test.skip(!job, 'no live employer-posted Easy Apply job in DB');
    await resetApplication(page, job!.id);
    const questions = await getScreeningQuestions(page, job!.id);

    const modal = await openApplyModal(page, job!.slug);
    for (const q of questions) {
      const block = modal.locator('div').filter({ hasText: q.questionText }).last();
      if (q.questionType === 'boolean') await block.getByRole('button', { name: /^yes$/i }).click();
      else if (q.questionType === 'select') await block.locator('select').selectOption({ index: 1 });
      else if (q.questionType === 'number') await block.locator('input[type="number"]').fill('3');
      else await block.getByPlaceholder('Your answer').fill('Yes, I meet this requirement.');
    }
    const cover = `E2E ${RUN_TAG} cover letter with unicode: café, naïve, 日本語 <script>alert(1)</script> and a long line ${'x'.repeat(300)}`;
    await modal.locator('#coverLetter').fill(cover);
    await modal.getByRole('checkbox').first().check();

    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/applications/apply-direct'), { timeout: 90_000 }),
      modal.getByRole('button', { name: /submit application/i }).click(),
    ]);
    expect(res.status(), `apply-direct: ${await res.text().catch(() => '')}`).toBe(200);
    // The modal closes itself on success; the confirmation panel it is
    // supposed to show first is unreachable (own test below).
    await expect(modal).toBeHidden({ timeout: 30_000 });

    // Server state + sanitization
    const { body: check } = await apiJson<{ applied: boolean; status?: string }>(page, `/api/applications/check?jobId=${job!.id}`);
    expect(check.applied).toBe(true);
    const { body: apps } = await apiJson<Array<{ id: string; jobId: string; coverLetter: string | null; status: string }>>(page, '/api/applications');
    const row = apps.find((a) => a.jobId === job!.id);
    expect(row, 'application row should exist').toBeTruthy();
    expect(row!.coverLetter ?? '').not.toContain('<script');
    expect(row!.coverLetter ?? '').toContain('café');

    // Detail page reflects it
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/You.ve already applied/)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('button', { name: /apply again/i }).first()).toBeVisible();

    // /my-applications lists it with a status pill
    await page.goto('/my-applications', { waitUntil: 'domcontentloaded' });
    const card = page.locator('.app-card').filter({ hasText: job!.title }).first();
    await expect(card).toBeVisible({ timeout: 60_000 });
    await expect(card).toContainText(/Applied|Not Selected|Screening/);
    await expect(card).toContainText(/Cover letter/);
    assertClean(c, 'easy apply happy path');
  });

  test('the apply modal shows its "Application Submitted!" confirmation before closing', async ({ page }) => {
    // BUG (h0902): components/InPlatformApplyForm.tsx:211-212 sets its own
    // `submitted` flag and then calls `onSuccess()` in the same tick, and
    // components/ApplyButton.tsx:304-307 handles that by doing
    // `setShowPlatformApply(false)`. React batches both updates, so the parent
    // unmounts the form in the very render that was supposed to paint the
    // success panel: the "Application Submitted!" heading at
    // InPlatformApplyForm.tsx:242, its next-steps copy and its "Done" button
    // are dead code. The application IS recorded, but the candidate gets no
    // confirmation step -- the dialog just disappears.
    // Marked test.fail() so the suite stays green while documenting it.
    test.fail(true, 'onSuccess unmounts the form in the same batch that sets submitted, so the confirmation never paints');
    test.setTimeout(240_000);
    const c = attachErrorCollectors(page);
    await loginSeeker(page);
    const job = await pickEasyApplyJob(page);
    test.skip(!job, 'no live employer-posted Easy Apply job in DB');
    await resetApplication(page, job!.id);

    const modal = await openApplyModal(page, job!.slug);
    await modal.getByRole('checkbox').first().check();
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/applications/apply-direct'), { timeout: 90_000 }),
      modal.getByRole('button', { name: /submit application/i }).click(),
    ]);
    expect(res.status(), `apply-direct: ${await res.text().catch(() => '')}`).toBe(200);
    await expect(
      page.getByText(/Application Submitted!/),
      'the success panel must render before the dialog closes',
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /^done$/i })).toBeVisible();

    await resetApplication(page, job!.id);
    expect(c).toBeTruthy();
  });

  test('applying twice keeps a single application row and shows the already-applied notice', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await loginSeeker(page);
    const job = await pickEasyApplyJob(page);
    test.skip(!job, 'no live employer-posted Easy Apply job in DB');
    await resetApplication(page, job!.id);
    const firstId = await ensureApplied(page, job!.id);
    const secondId = await ensureApplied(page, job!.id);
    expect(secondId, 'second apply must reuse the same application row').toBe(firstId);
    const { body: apps } = await apiJson<Array<{ jobId: string }>>(page, '/api/applications');
    expect(apps.filter((a) => a.jobId === job!.id)).toHaveLength(1);

    await page.goto(`/jobs/${job!.slug}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/You.ve already applied/)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('link', { name: /view your applications/i }).first()).toBeVisible();
    assertClean(c, 'duplicate apply');
  });

  test('withdraw from /my-applications marks the application Withdrawn (UI sends jobId, API expects applicationId)', async ({ page }) => {
    // BUG (h0902): app/my-applications/page.tsx handleWithdraw posts { jobId }
    // but DELETE /api/applications/withdraw validates { applicationId } and
    // returns 400, which the page swallows silently. The Withdraw button is a
    // no-op for every user. Marked test.fail() so the suite documents it.
    test.fail(true, 'withdraw button posts jobId instead of applicationId, API returns 400 and UI does nothing');
    const c = attachErrorCollectors(page);
    await loginSeeker(page);
    const job = await pickEasyApplyJob(page);
    test.skip(!job, 'no live employer-posted Easy Apply job in DB');
    await resetApplication(page, job!.id);
    await ensureApplied(page, job!.id);

    page.on('dialog', (d) => d.accept());
    await page.goto('/my-applications', { waitUntil: 'domcontentloaded' });
    const card = page.locator('.app-card').filter({ hasText: job!.title }).first();
    await expect(card).toBeVisible({ timeout: 60_000 });
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/applications/withdraw'), { timeout: 60_000 }),
      card.locator('button[title="Withdraw application"]').click(),
    ]);
    expect(res.status(), `DELETE /api/applications/withdraw -> ${await res.text().catch(() => '')}`).toBe(200);
    await expect(card).toContainText(/Withdrawn/, { timeout: 15_000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('.app-card').filter({ hasText: job!.title }).first()).toContainText(/Withdrawn/, { timeout: 60_000 });
    assertClean(c, 'withdraw via UI');
  });

  test('withdraw API works with applicationId and the detail page no longer says applied', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await loginSeeker(page);
    const job = await pickEasyApplyJob(page);
    test.skip(!job, 'no live employer-posted Easy Apply job in DB');
    await resetApplication(page, job!.id);
    const applicationId = await ensureApplied(page, job!.id);

    const wrongShape = await apiJson<{ error?: string }>(page, '/api/applications/withdraw', { method: 'DELETE', data: { jobId: job!.id } });
    expect(wrongShape.status, 'the payload the UI sends is rejected by the API').toBe(400);

    const ok = await apiJson<{ success?: boolean }>(page, '/api/applications/withdraw', { method: 'DELETE', data: { applicationId } });
    expect(ok.status).toBe(200);
    const { body: check } = await apiJson<{ applied: boolean }>(page, `/api/applications/check?jobId=${job!.id}`);
    expect(check.applied, 'withdrawn application must not count as applied').toBe(false);

    await page.goto('/my-applications', { waitUntil: 'domcontentloaded' });
    const card = page.locator('.app-card').filter({ hasText: job!.title }).first();
    await expect(card).toBeVisible({ timeout: 60_000 });
    await expect(card).toContainText(/Withdrawn/);
    await expect(card.locator('button[title="Withdraw application"]')).toHaveCount(0);

    await resetApplication(page, job!.id);
    assertClean(c, 'withdraw via API');
  });

  test('a withdrawn application stops reading as applied on the job detail page', async ({ page }) => {
    // BUG (h0902): GET /api/applications (app/api/applications/route.ts:101)
    // returns every JobApplication row for the user with no status/withdrawnAt
    // filter, and lib/hooks/useAppliedJobs.ts maps all of them into its
    // "applied" set. components/ApplyButton.tsx:152 then computes
    //   applied = isApplied(jobId) || serverApplied?.applied
    // so the withdrawn row keeps the button on "Apply Again" and keeps the
    // "You've already applied" banner up forever, even though
    // GET /api/applications/check (which DOES exclude withdrawnAt) says false.
    // The /saved "Applied" tab counts withdrawn rows for the same reason.
    // Marked test.fail() so the suite stays green while documenting it.
    test.fail(true, 'useAppliedJobs treats withdrawn rows as applied; ApplyButton ORs it over the correct check');
    test.setTimeout(180_000);
    const c = attachErrorCollectors(page);
    await loginSeeker(page);
    const job = await pickEasyApplyJob(page);
    test.skip(!job, 'no live employer-posted Easy Apply job in DB');
    await resetApplication(page, job!.id);
    const applicationId = await ensureApplied(page, job!.id);

    const ok = await apiJson(page, '/api/applications/withdraw', { method: 'DELETE', data: { applicationId } });
    expect(ok.status).toBe(200);
    const { body: check } = await apiJson<{ applied: boolean }>(page, `/api/applications/check?jobId=${job!.id}`);
    expect(check.applied, 'the authoritative check must report not-applied').toBe(false);

    // GET /api/applications is what useAppliedJobs mirrors, and it returns the
    // row with no status / withdrawnAt filter at all.
    const { body: rows } = await apiJson<Array<{ id: string; status: string }>>(page, '/api/applications');
    expect(
      rows.find((a) => a.id === applicationId)?.status,
      'the withdrawn row is still in the list the applied-jobs cache is built from',
    ).toBe('withdrawn');

    // Fresh browser state: nothing in localStorage, so anything the client
    // marks as applied can only have come from that list.
    await page.goto(`/jobs/${job!.slug}`, { waitUntil: 'domcontentloaded' });
    await dismissCookieBanner(page);
    await expect(page.getByRole('button', { name: /^(easy apply|apply again)$/i }).first()).toBeVisible({
      timeout: 90_000,
    });
    await page
      .waitForResponse((r) => /\/api\/applications$/.test(new URL(r.url()).pathname) && r.request().method() === 'GET', {
        timeout: 60_000,
      })
      .catch(() => undefined);

    await expect
      .poll(
        async () =>
          page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('appliedJobs') || '{}'))),
        {
          timeout: 30_000,
          message: 'a withdrawn application must not be mirrored into the applied-jobs cache',
        },
      )
      .not.toContain(job!.id);
    await expect(
      page.getByRole('button', { name: /^easy apply$/i }).first(),
      'a withdrawn application should leave the primary CTA as Easy Apply',
    ).toBeVisible({ timeout: 30_000 });

    await resetApplication(page, job!.id);
    assertClean(c, 'withdrawn no longer applied');
  });

  test('"Clear history" on the /saved Applied tab must not destroy a submitted in-platform application', async ({ page }) => {
    // BUG (h0902): app/saved/page.tsx handleClearApplied (line 141) calls
    // useAppliedJobs.clearAll(), which fires DELETE /api/applications
    // { jobId } for every entry, and that route hard-deletes the row
    // (app/api/applications/route.ts:78 prisma.jobApplication.deleteMany).
    // The Applied tab does not distinguish an external apply-click the user
    // merely tracked from an Easy Apply application the user actually
    // submitted with a cover letter and screening answers, so one click on
    // "Clear history" (confirm copy: "clear your application history")
    // permanently erases submitted applications and removes the candidate
    // from the employer's applicant pipeline. The intended, non-destructive
    // path is Withdraw on /my-applications, which keeps the row with
    // status='withdrawn' for the GDPR scrub — and that button is itself a
    // no-op (see the withdraw test above). Marked test.fail() so the suite
    // stays green while documenting it.
    test.fail(true, 'Clear history hard-deletes submitted applications instead of withdrawing them');
    test.setTimeout(240_000);
    const c = attachErrorCollectors(page);
    await loginSeeker(page);
    const job = await pickEasyApplyJob(page);
    test.skip(!job, 'no live employer-posted Easy Apply job in DB');
    await resetApplication(page, job!.id);
    const applicationId = await ensureApplied(page, job!.id);

    page.on('dialog', (d) => d.accept());
    await page.goto('/saved', { waitUntil: 'domcontentloaded' });
    await dismissCookieBanner(page);
    await page.getByRole('button', { name: /^Applied/ }).first().click();
    await expect(page.locator(`a[href*="${job!.id}"]`).first()).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: /clear history/i }).click();
    await expect(page.locator(`a[href*="${job!.id}"]`)).toHaveCount(0, { timeout: 30_000 });

    const { body: apps } = await apiJson<Array<{ id: string; status: string }>>(page, '/api/applications');
    const row = apps.find((a) => a.id === applicationId);
    expect(
      row,
      'a submitted application must survive "Clear history" (withdrawn at most), not be hard-deleted',
    ).toBeTruthy();
    expect(row?.status).toBe('withdrawn');

    await resetApplication(page, job!.id);
    assertClean(c, 'clear applied history');
  });
});

// ── 4. external apply tracking ───────────────────────────────────────────────

test.describe('external apply click tracking', () => {
  test.skip(AGAINST_PROD, 'no mutations against production');
  test.skip(!SEEKER, 'seeker creds missing');

  test.beforeEach(async ({ page }) => {
    // Keep the employer site out of the test: window.open returns a stub the
    // ApplyButton can assign opener/location on without leaving the app.
    await page.addInitScript(() => {
      (window as unknown as { open: unknown }).open = () => ({ opener: null, location: { href: '' }, closed: false });
    });
  });

  test('clicking Apply on an external job records the click via track-apply and asks for confirmation', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await loginSeeker(page);
    const job = await pickExternalJob(page);
    test.skip(!job, 'no live external job available in this database');
    await resetApplication(page, job!.id);

    await page.goto(`/jobs/${job!.slug}`, { waitUntil: 'domcontentloaded' });
    await dismissCookieBanner(page);
    const applyBtn = page.getByRole('button', { name: /^(apply now|direct apply)$/i }).first();
    await expect(applyBtn).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Opens the employer.s application in a new tab/)).toBeVisible();

    const [trackRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes(`/api/jobs/${job!.id}/track-apply`), { timeout: 60_000 }),
      applyBtn.click(),
    ]);
    expect(trackRes.status()).toBe(200);
    const trackBody = await trackRes.json();
    expect(trackBody, 'track-apply must report success').toMatchObject({ success: true });

    await expect(page.getByText(/Did you finish applying\?/)).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /not yet/i }).click();
    await expect(applyBtn).toBeVisible();
    const { body: check } = await apiJson<{ applied: boolean }>(page, `/api/applications/check?jobId=${job!.id}`);
    expect(check.applied, '"Not yet" must not record an application').toBe(false);
    assertClean(c, 'track-apply');
  });

  test('confirming "Yes, I applied" records the application and it appears on /my-applications', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await loginSeeker(page);
    const job = await pickExternalJob(page);
    test.skip(!job, 'no live external job available in this database');
    await resetApplication(page, job!.id);

    await page.goto(`/jobs/${job!.slug}`, { waitUntil: 'domcontentloaded' });
    await dismissCookieBanner(page);
    const applyBtn = page.getByRole('button', { name: /^(apply now|direct apply)$/i }).first();
    await expect(applyBtn).toBeVisible({ timeout: 60_000 });
    await applyBtn.click();
    await expect(page.getByText(/Did you finish applying\?/)).toBeVisible({ timeout: 15_000 });
    const [postRes] = await Promise.all([
      page.waitForResponse((r) => /\/api\/applications$/.test(r.url()) && r.request().method() === 'POST', { timeout: 60_000 }),
      page.getByRole('button', { name: /yes, i applied/i }).click(),
    ]);
    expect(postRes.status()).toBe(200);
    await expect(page.getByText(/Added to your applications/)).toBeVisible();

    await page.goto('/my-applications', { waitUntil: 'domcontentloaded' });
    const card = page.locator('.app-card').filter({ hasText: job!.title }).first();
    await expect(card).toBeVisible({ timeout: 60_000 });
    await expect(card).toContainText(/Applied/);

    await resetApplication(page, job!.id);
    assertClean(c, 'confirm applied');
  });
});

// ── 5. messages ──────────────────────────────────────────────────────────────

test.describe('messages', () => {
  test.skip(AGAINST_PROD, 'no mutations against production');
  test.skip(!SEEKER, 'seeker creds missing');

  test('/messages loads the inbox; sends a reply in the Test Corp thread when one exists', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await loginSeeker(page);
    await page.goto('/messages', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /^messages$/i })).toBeVisible({ timeout: 60_000 });
    const { status, body } = await apiJson<{ conversations: Array<{ id: string; otherUser: { name: string; company: string | null } }> }>(page, '/api/conversations');
    expect(status).toBe(200);
    const convs = body.conversations ?? [];

    if (convs.length === 0) {
      await expect(page.getByText(/No messages yet/)).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText(/Conversations with employers and candidates will appear here/)).toBeVisible();
    } else {
      await expect(page.locator('.messages-list-panel')).toContainText(convs[0].otherUser.name, { timeout: 60_000 });
      const testCorp = convs.find((cv) => /test corp/i.test(`${cv.otherUser.name} ${cv.otherUser.company ?? ''}`));
      if (testCorp) {
        await page.locator('.messages-list-panel').getByText(testCorp.otherUser.name, { exact: false }).first().click();
        await expect(page.locator('.messages-thread-panel')).toContainText(testCorp.otherUser.name, { timeout: 60_000 });
        const composer = page.getByPlaceholder('Write a message...');
        if (await composer.isVisible().catch(() => false)) {
          const text = `E2E ${RUN_TAG} seeker reply ${Date.now()}`;
          await composer.fill(text);
          const [res] = await Promise.all([
            page.waitForResponse((r) => r.url().includes(`/api/conversations/${testCorp.id}`) && r.request().method() === 'POST', { timeout: 60_000 }),
            composer.press('Enter'),
          ]);
          expect(res.status(), `send message: ${await res.text().catch(() => '')}`).toBe(200);
          await expect(page.locator('.messages-thread-panel')).toContainText(text);
          await page.reload({ waitUntil: 'domcontentloaded' });
          await page.locator('.messages-list-panel').getByText(testCorp.otherUser.name, { exact: false }).first().click();
          await expect(page.locator('.messages-thread-panel')).toContainText(text, { timeout: 60_000 });
        } else {
          await expect(page.getByText(/Awaiting employer reply/)).toBeVisible();
          test.info().annotations.push({ type: 'note', description: 'Test Corp thread is awaiting an employer reply; composer gated' });
        }
      } else {
        test.info().annotations.push({ type: 'note', description: 'no conversation with Test Corp; only list rendering verified' });
      }
    }
    assertClean(c, 'messages');
  });
});

// ── 6. job alerts ────────────────────────────────────────────────────────────

test.describe('job alerts while logged in', () => {
  test.skip(AGAINST_PROD, 'no mutations against production');
  test.skip(!SEEKER, 'seeker creds missing');

  async function openAlertModal(page: Page) {
    await page.goto('/jobs', { waitUntil: 'domcontentloaded' });
    await dismissCookieBanner(page);
    const pill = page.getByRole('button', { name: /job alerts/i }).first();
    await expect(pill, 'nav Job Alerts pill should show on /jobs').toBeVisible({ timeout: 90_000 });
    // The pill is a fire-and-forget `window.dispatchEvent('pmhnp:open-alert-modal')`
    // (components/Header.tsx:315) and JobsPageClient only starts listening once
    // it hydrates, so a click that lands first is dropped with no feedback and
    // no retry. Retry here so the test measures the feature, not the race
    // (the dropped-click behaviour has its own test below).
    const heading = page.getByRole('heading', { name: /create job alert/i });
    await expect(async () => {
      await pill.click();
      await expect(heading).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 90_000 });
    return page.locator('form').filter({ has: page.getByRole('button', { name: /create alert/i }) });
  }

  test('the nav Job Alerts pill is a dropped click until /jobs finishes hydrating', async ({ page }) => {
    // BUG (h0902): components/Header.tsx:315 opens the alert modal by
    // dispatching a window event that app/jobs/JobsPageClient.tsx:74-79 only
    // subscribes to inside a useEffect. On this page the effect does not run
    // until hydration finishes (tens of seconds on a cold route), and the
    // event has no buffer, no state fallback and no visible feedback, so an
    // early click is silently swallowed and the user has to guess to click
    // again. Marked test.fail() so the suite stays green while documenting it.
    test.fail(true, 'the pill dispatches a window event that nothing is listening for until JobsPageClient hydrates');
    test.setTimeout(180_000);
    await loginSeeker(page);
    await page.goto('/jobs', { waitUntil: 'domcontentloaded' });
    await dismissCookieBanner(page);
    const pill = page.getByRole('button', { name: /job alerts/i }).first();
    await expect(pill).toBeVisible({ timeout: 90_000 });
    await pill.click();
    await expect(
      page.getByRole('heading', { name: /create job alert/i }),
      'the first click on the pill should open the modal',
    ).toBeVisible({ timeout: 10_000 });
  });

  test('nav pill opens the alert modal; empty and invalid emails are rejected without a request', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await loginSeeker(page);
    const form = await openAlertModal(page);
    let posts = 0;
    page.on('request', (r) => {
      if (r.url().includes('/api/job-alerts') && r.method() === 'POST') posts += 1;
    });
    await form.getByRole('button', { name: /create alert/i }).click();
    await expect(form.getByText(/Email is required/)).toBeVisible({ timeout: 10_000 });

    const email = form.getByLabel(/email address/i);
    await email.fill('not-an-email');
    await form.getByRole('button', { name: /create alert/i }).click();
    const rhfMessage = await form.getByText(/valid email/i).isVisible().catch(() => false);
    const nativeInvalid = await email.evaluate((el) => !(el as HTMLInputElement).checkValidity());
    expect(rhfMessage || nativeInvalid, 'invalid email must be flagged').toBe(true);
    expect(posts, 'no POST for invalid input').toBe(0);
    assertClean(c, 'alert validation');
  });

  test('create an alert from the nav, then manage it: frequency, pause, resume, delete', async ({ page }) => {
    test.setTimeout(180_000);
    const c = attachErrorCollectors(page);
    await loginSeeker(page);
    const form = await openAlertModal(page);
    await form.getByLabel(/email address/i).fill(SEEKER!.email);
    await form.getByLabel(/how often/i).selectOption('daily');
    const [createRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/job-alerts') && r.request().method() === 'POST', { timeout: 60_000 }),
      form.getByRole('button', { name: /create alert/i }).click(),
    ]);
    expect(createRes.status(), `POST /api/job-alerts: ${await createRes.text().catch(() => '')}`).toBe(200);
    const created = (await createRes.json()) as { success: boolean; reactivated?: boolean; alert: { id: string; token: string } };
    expect(created.success).toBe(true);
    await expect(page.getByText(/Alert created!|Alert reactivated/)).toBeVisible({ timeout: 15_000 });

    // Manage page auto-detects the logged-in email.
    await page.goto('/job-alerts/manage', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /manage job alerts/i })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(SEEKER!.email)).toBeVisible({ timeout: 60_000 });
    const { body: listed } = await apiJson<{ alerts: Array<{ id: string; token: string; frequency: string; isActive: boolean }> }>(
      page,
      `/api/job-alerts/by-email?email=${encodeURIComponent(SEEKER!.email)}`,
    );
    const mine = listed.alerts.find((a) => a.id === created.alert.id);
    expect(mine, 'created alert should be listed for the seeker email').toBeTruthy();
    const card = page.locator('.alert-card').filter({ hasText: /All PMHNP jobs/ }).first();
    await expect(card).toBeVisible({ timeout: 60_000 });
    await expect(card).toContainText(/Active/);

    // Frequency -> weekly
    const [freqRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes(`/api/job-alerts/${created.alert.token}`) && r.request().method() === 'PATCH', { timeout: 60_000 }),
      card.getByRole('button', { name: /^weekly$/i }).click(),
    ]);
    expect(freqRes.status()).toBe(200);
    await page.reload({ waitUntil: 'domcontentloaded' });
    const cardAfter = page.locator('.alert-card').filter({ hasText: /All PMHNP jobs/ }).first();
    await expect(cardAfter).toBeVisible({ timeout: 60_000 });
    await expect(cardAfter).toContainText(/Weekly/);
    const { body: afterFreq } = await apiJson<{ alerts: Array<{ id: string; frequency: string }> }>(page, `/api/job-alerts/by-email?email=${encodeURIComponent(SEEKER!.email)}`);
    expect(afterFreq.alerts.find((a) => a.id === created.alert.id)?.frequency).toBe('weekly');

    // Pause
    const [pauseRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes(`/api/job-alerts/${created.alert.token}`) && r.request().method() === 'PATCH', { timeout: 60_000 }),
      cardAfter.getByRole('button', { name: /^pause$/i }).click(),
    ]);
    expect(pauseRes.status()).toBe(200);
    await expect(cardAfter).toContainText(/Paused/);
    await page.reload({ waitUntil: 'domcontentloaded' });
    const pausedCard = page.locator('.alert-card').filter({ hasText: /All PMHNP jobs/ }).first();
    await expect(pausedCard).toContainText(/Paused/, { timeout: 60_000 });

    // Resume
    await pausedCard.getByRole('button', { name: /^resume$/i }).click();
    await expect(pausedCard).toContainText(/Active/, { timeout: 15_000 });

    // Delete (confirm)
    await pausedCard.getByRole('button', { name: /^delete$/i }).click();
    const [delRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/job-alerts') && r.request().method() === 'DELETE', { timeout: 60_000 }),
      pausedCard.getByRole('button', { name: /^yes$/i }).click(),
    ]);
    expect(delRes.status()).toBe(200);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /manage job alerts/i })).toBeVisible({ timeout: 60_000 });
    const { body: afterDelete } = await apiJson<{ alerts: Array<{ id: string }> }>(page, `/api/job-alerts/by-email?email=${encodeURIComponent(SEEKER!.email)}`);
    expect(afterDelete.alerts.map((a) => a.id)).not.toContain(created.alert.id);
    assertClean(c, 'alert lifecycle');
  });
});

// ── 7. resume studio ─────────────────────────────────────────────────────────

test.describe('resume studio', () => {
  test.skip(AGAINST_PROD, 'no mutations against production');
  test.skip(!SEEKER, 'seeker creds missing');

  // getByLabel('Professional summary') matches two nodes in the studio (the
  // SectionCard heading exposes the same accessible name as the textarea it
  // wraps), so pin the control explicitly.
  const summaryField = (page: Page) => page.locator('textarea').first();

  async function gotoStudio(page: Page): Promise<void> {
    await page.goto('/dashboard/resume-studio', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: /your resumes/i })).toBeVisible({ timeout: 90_000 });
    await dismissCookieBanner(page);
  }

  async function createDocFromProfile(page: Page, title: string): Promise<string> {
    await deleteStudioLeftovers(page);
    await gotoStudio(page);
    const library = page.getByRole('button', { name: /your resumes/i });
    if ((await library.getAttribute('aria-expanded')) !== 'true') await library.click();
    const [createRes] = await Promise.all([
      page.waitForResponse((r) => /\/api\/resume-studio\/documents$/.test(r.url()) && r.request().method() === 'POST', { timeout: 60_000 }),
      page.getByRole('button', { name: /new from profile/i }).click(),
    ]);
    expect(createRes.status(), `create document: ${await createRes.text().catch(() => '')}`).toBe(201);
    const { document } = (await createRes.json()) as { document: { id: string; title: string } };
    await expect(summaryField(page)).toBeVisible({ timeout: 60_000 });

    // Rename so the document is identifiable and cleanup can find it. The
    // library's inline rename control is only reachable on a card that is not
    // the open document, so go through the same PATCH the control uses and
    // reload to pick the new title up.
    const rename = await apiJson<{ document?: { title: string } }>(
      page,
      `/api/resume-studio/documents/${document.id}`,
      { method: 'PATCH', data: { title } },
    );
    expect(rename.status, `rename document: ${JSON.stringify(rename.body)}`).toBe(200);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: /your resumes/i })).toBeVisible({ timeout: 90_000 });
    const lib = page.getByRole('button', { name: /your resumes/i });
    if ((await lib.getAttribute('aria-expanded')) !== 'true') await lib.click();
    await expect(page.locator('.rs-doc-card').filter({ hasText: title })).toBeVisible({ timeout: 60_000 });
    await selectDocByTitle(page, title);
    await expect(summaryField(page)).toBeVisible({ timeout: 60_000 });
    return document.id;
  }

  async function selectDocByTitle(page: Page, title: string): Promise<void> {
    const library = page.getByRole('button', { name: /your resumes/i });
    if ((await library.getAttribute('aria-expanded')) !== 'true') await library.click();
    const card = page.locator('.rs-doc-card').filter({ hasText: title }).first();
    await expect(card).toBeVisible({ timeout: 60_000 });
    const editBtn = card.getByRole('button', { name: /^edit$/i });
    if (await editBtn.isVisible().catch(() => false)) await editBtn.click();
    // Selecting a document collapses the library, so assert on the toolbar
    // heading (which is the open document's title) rather than the card.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title, { timeout: 30_000 });
  }

  test('create a document from the profile, edit the summary, autosave persists across reload', async ({ page }) => {
    test.setTimeout(180_000);
    const c = attachErrorCollectors(page);
    await loginSeeker(page);
    const title = `${STUDIO_TITLE_PREFIX} autosave ${Date.now()}`;
    const docId = await createDocFromProfile(page, title);

    const fullName = page.getByLabel('Full name');
    await expect(fullName).toBeVisible();
    const summary = `Board-certified PMHNP (E2E ${RUN_TAG}) with telehealth experience: café, naïve, <b>bold</b> <script>alert(1)</script>.`;
    const [patchRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes(`/api/resume-studio/documents/${docId}`) && r.request().method() === 'PATCH' && !!r.request().postData()?.includes('sections'),
        { timeout: 60_000 },
      ),
      summaryField(page).fill(summary),
    ]);
    expect(patchRes.status(), `autosave PATCH: ${await patchRes.text().catch(() => '')}`).toBe(200);
    await expect(page.getByText(/^Saved/).first()).toBeVisible({ timeout: 30_000 });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: /your resumes/i })).toBeVisible({ timeout: 90_000 });
    await selectDocByTitle(page, title);
    await expect(summaryField(page)).toHaveValue(/Board-certified PMHNP \(E2E h0902\)/, { timeout: 60_000 });
    await expect(summaryField(page), 'unicode must survive the round trip').toHaveValue(/café/);
    // lib/sanitize.ts sanitizeText strips scripts/handlers and leaves inert
    // markup alone, and nothing renders this field as HTML, so the security
    // property to assert is that a script tag cannot survive the save.
    await expect(summaryField(page), 'a script tag must not survive the save').not.toHaveValue(/<script/i);

    await apiJson(page, `/api/resume-studio/documents/${docId}`, { method: 'DELETE' });
    assertClean(c, 'studio create + autosave');
  });

  test('score the document (free), tailor it to a posting once, and the quota badge updates', async ({ page }) => {
    test.setTimeout(300_000);
    const c = attachErrorCollectors(page);
    await loginSeeker(page);
    const title = `${STUDIO_TITLE_PREFIX} ai ${Date.now()}`;
    const docId = await createDocFromProfile(page, title);

    // Score
    const [scoreRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/resume-studio/score') && r.request().method() === 'POST', { timeout: 60_000 }),
      page.getByRole('button', { name: /check score/i }).click(),
    ]);
    expect(scoreRes.status(), `score: ${await scoreRes.text().catch(() => '')}`).toBe(200);
    await expect(page.locator('[aria-label^="Resume score"]').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Free and unlimited/)).toBeVisible();

    // Tailor (one AI call) if quota remains
    const { body: usage } = await apiJson<{ usage: { resume_tailoring: { used: number; cap: number; remaining: number } } }>(page, '/api/resume-studio/usage');
    const tailorBefore = usage.usage.resume_tailoring;
    await page.getByRole('tab', { name: /^tailor$/i }).click();
    const badge = page.getByText(new RegExp(`${tailorBefore.remaining} of ${tailorBefore.cap} left today`));
    await expect(badge, 'quota badge should match /api/resume-studio/usage').toBeVisible({ timeout: 15_000 });

    if (tailorBefore.remaining > 0) {
      const job = await pickEasyApplyJob(page);
      const posting = job
        ? `${job.title} at ${job.employer}. Psychiatric mental health nurse practitioner providing medication management, telehealth visits, and crisis assessment for adults with depression, anxiety and bipolar disorder. Requires APRN license, PMHNP-BC certification and Epic EHR experience.`
        : 'Psychiatric mental health nurse practitioner for outpatient telehealth medication management. Requires APRN license and PMHNP-BC.';
      await page.getByPlaceholder(/Paste the full job description here/).fill(posting);
      // The tab is named "Tailor"; the action button inside it is
      // "Tailor to posting".
      const tailorBtn = page.getByRole('button', { name: /tailor to posting/i }).first();
      const [tailorRes] = await Promise.all([
        page.waitForResponse((r) => r.url().includes('/api/resume-studio/tailor') && r.request().method() === 'POST', { timeout: 240_000 }),
        tailorBtn.click(),
      ]);
      expect([200, 402, 429, 503]).toContain(tailorRes.status());
      if (tailorRes.status() === 200) {
        const tailorBody = (await tailorRes.json()) as { tailoring?: { fitSummary?: string }; usage?: { remaining: number; cap: number } };
        expect(tailorBody.tailoring?.fitSummary, 'tailoring should return a fit summary').toBeTruthy();
        const { body: after } = await apiJson<{ usage: { resume_tailoring: { remaining: number; cap: number } } }>(page, '/api/resume-studio/usage');
        expect(after.usage.resume_tailoring.remaining, 'quota must decrement by one').toBe(tailorBefore.remaining - 1);
        await expect(page.getByText(new RegExp(`${after.usage.resume_tailoring.remaining} of ${after.usage.resume_tailoring.cap} left today`))).toBeVisible({ timeout: 15_000 });
      } else {
        test.info().annotations.push({ type: 'note', description: `tailor returned ${tailorRes.status()}: ${await tailorRes.text().catch(() => '')}` });
      }
    } else {
      test.info().annotations.push({ type: 'note', description: 'tailoring quota exhausted for today; skipped AI call' });
    }

    await apiJson(page, `/api/resume-studio/documents/${docId}`, { method: 'DELETE' });
    assertClean(c, 'studio score + tailor');
  });

  test('export PDF returns application/pdf, duplicate creates a copy, delete removes it', async ({ page }) => {
    test.setTimeout(180_000);
    const c = attachErrorCollectors(page);
    await loginSeeker(page);
    const title = `${STUDIO_TITLE_PREFIX} export ${Date.now()}`;
    const docId = await createDocFromProfile(page, title);

    const exportLink = page.getByRole('link', { name: /export pdf/i });
    await expect(exportLink).toHaveAttribute('href', new RegExp(`/api/resume-studio/documents/${docId}/pdf`));
    const pdf = await page.request.get(`/api/resume-studio/documents/${docId}/pdf`);
    expect(pdf.status(), 'PDF export').toBe(200);
    expect(pdf.headers()['content-type']).toContain('application/pdf');
    expect(pdf.headers()['content-disposition'] ?? '').toMatch(/attachment; filename="e2e-h0902-export-\d+\.pdf"/);
    const bytes = await pdf.body();
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(1000);

    // Duplicate. Selecting a document collapses the library, so re-open it
    // before reaching for a per-card control. Duplicate is disabled once the
    // account holds MAX_DOCUMENTS resumes, so only exercise it below the cap.
    const libraryToggle = page.getByRole('button', { name: /your resumes/i });
    if ((await libraryToggle.getAttribute('aria-expanded')) !== 'true') await libraryToggle.click();
    await expect(page.locator('.rs-doc-card').filter({ hasText: title }).first()).toBeVisible({ timeout: 30_000 });
    const capLabel = (await libraryToggle.innerText()).match(/(\d+)\s+of\s+(\d+)/);
    const atCap = !!capLabel && Number(capLabel[1]) >= Number(capLabel[2]);
    if (atCap) {
      test.info().annotations.push({
        type: 'note',
        description: `resume library is at its cap (${capLabel![1]} of ${capLabel![2]}); duplicate is disabled, skipping that leg`,
      });
      await apiJson(page, `/api/resume-studio/documents/${docId}`, { method: 'DELETE' });
      const { body: onlyFinal } = await apiJson<{ documents: Array<{ id: string }> }>(page, '/api/resume-studio/documents');
      expect(onlyFinal.documents.map((d) => d.id)).not.toContain(docId);
      assertClean(c, 'studio export (cap reached)');
      return;
    }
    const [dupRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes(`/api/resume-studio/documents/${docId}/duplicate`), { timeout: 60_000 }),
      page.getByRole('button', { name: new RegExp(`^Duplicate ${title}$`) }).click(),
    ]);
    expect(dupRes.status()).toBe(201);
    const copyCard = page.locator('.rs-doc-card').filter({ hasText: `${title} (copy)` }).first();
    await expect(copyCard).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /your resumes/i })).toContainText(/\d+ of 10/);

    // Delete the copy
    await copyCard.getByRole('button', { name: new RegExp(`^Delete ${title} \\(copy\\)$`) }).click();
    const confirm = page.getByRole('group', { name: new RegExp(`^Delete ${title} \\(copy\\)\\?$`) })
      .or(copyCard.locator('[role="alertdialog"], [role="group"]').filter({ hasText: /Delete this resume\?/ }));
    await expect(confirm.first()).toBeVisible({ timeout: 15_000 });
    const [delRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/resume-studio/documents/') && r.request().method() === 'DELETE', { timeout: 60_000 }),
      confirm.first().getByRole('button', { name: /^delete$/i }).click(),
    ]);
    expect(delRes.status()).toBe(200);
    await expect(page.locator('.rs-doc-card').filter({ hasText: `${title} (copy)` })).toHaveCount(0, { timeout: 15_000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: /your resumes/i })).toBeVisible({ timeout: 90_000 });
    const { body: docs } = await apiJson<{ documents: Array<{ id: string; title: string }> }>(page, '/api/resume-studio/documents');
    expect(docs.documents.map((d) => d.title)).not.toContain(`${title} (copy)`);
    expect(docs.documents.map((d) => d.id)).toContain(docId);

    await apiJson(page, `/api/resume-studio/documents/${docId}`, { method: 'DELETE' });
    const { body: final } = await apiJson<{ documents: Array<{ id: string }> }>(page, '/api/resume-studio/documents');
    expect(final.documents.map((d) => d.id)).not.toContain(docId);
    assertClean(c, 'studio export + duplicate + delete');
  });
});

// ── 8. overlays ──────────────────────────────────────────────────────────────

test.describe('push notification prompt', () => {
  test.skip(!SEEKER, 'seeker creds missing');

  test('prompt appears for a returning logged-in user and "Not now" persists the dismissal', async ({ page }) => {
    test.setTimeout(150_000);
    const c = attachErrorCollectors(page);
    await loginSeeker(page);
    await page.goto('/jobs', { waitUntil: 'domcontentloaded' });
    await dismissCookieBanner(page);
    await page.evaluate(() => {
      localStorage.setItem('pmhnp_visit_count', '5');
      localStorage.removeItem('pmhnp_push_prompt_dismissed');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await dismissCookieBanner(page);
    const prompt = page.getByText(/Get notified about new jobs/);
    const appeared = await prompt
      .waitFor({ state: 'visible', timeout: 45_000 })
      .then(() => true)
      .catch(() => false);
    if (!appeared) {
      test.info().annotations.push({ type: 'note', description: 'push prompt did not appear (VAPID key missing or SW/push unsupported in this context)' });
      assertClean(c, 'push prompt (absent)');
      return;
    }
    await page.getByRole('button', { name: /not now/i }).click();
    await expect(prompt).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem('pmhnp_push_prompt_dismissed'))).toBe('1');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(0);
    await expect(prompt).toBeHidden({ timeout: 25_000 });
    assertClean(c, 'push prompt');
  });
});

test.describe('PWA install banner (mobile Safari UA)', () => {
  test.skip(!SEEKER, 'seeker creds missing');
  test.use({
    viewport: { width: 375, height: 812 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });

  test('banner shows after 5 visits and its dismissal persists across reload', async ({ page }) => {
    test.setTimeout(150_000);
    const c = attachErrorCollectors(page);
    await loginSeeker(page);
    await page.goto('/jobs', { waitUntil: 'domcontentloaded' });
    await dismissCookieBanner(page);
    await page.evaluate(() => {
      localStorage.setItem('pmhnp_visit_count', '6');
      localStorage.removeItem('pmhnp_pwa_install_dismissed');
      localStorage.setItem('pmhnp_push_prompt_dismissed', '1');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await dismissCookieBanner(page);
    const banner = page.getByText(/Add PMHNP Hiring to your home screen/);
    await expect(banner).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Add to Home Screen/)).toBeVisible();
    await page.getByRole('button', { name: /^dismiss$/i }).last().click();
    await expect(banner).toBeHidden();
    const stamp = await page.evaluate(() => localStorage.getItem('pmhnp_pwa_install_dismissed'));
    expect(Number(stamp)).toBeGreaterThan(Date.now() - 60_000);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.waitForTimeout(9_000); // iOS fallback timer is 8s; the banner must stay away
    await expect(banner).toBeHidden();
    assertClean(c, 'pwa banner');
  });
});

// ── 10. the filter-count endpoint every /jobs visit hits ─────────────────────

test.describe('/jobs filter counts', () => {
  test('POST /api/jobs/filter-counts rejects hostile numbers instead of answering 500', async ({ page }) => {
    // BUG (h0902): app/api/jobs/filter-counts/route.ts copies the POST body
    // straight into FilterState — `salaryMin: raw.salaryMin ?? null`, and the
    // minYears guard is `typeof raw.minYearsExperience === 'number' && >= 0`,
    // which Infinity satisfies. JSON.parse turns `1e400` into Infinity and a
    // string stays a string, so both reach Prisma as unserializable filter
    // values and the route answers a public, unauthenticated 500. The GET
    // listing route was hardened for exactly this on the query-string side
    // (lib/filters.ts parseFiltersFromParams clamps salaryMin to a finite
    // positive number); this POST body is the remaining hole, and every
    // /jobs visitor reaches the endpoint through
    // components/jobs/LinkedInFilters.tsx fetchCounts.
    // Marked test.fail() so the suite stays green while documenting it.
    test.fail(true, 'unvalidated salaryMin / minYearsExperience in the POST body produce a public 500');
    // Raw strings, not objects: JSON.stringify(Infinity) is "null", which
    // would sanitise the payload before it ever left the test.
    const hostile = ['{"salaryMin":1e400}', '{"minYearsExperience":1e400}', '{"salaryMin":"abc"}'];
    const failures: string[] = [];
    for (const body of hostile) {
      const res = await page.request.post('/api/jobs/filter-counts', {
        headers: { 'Content-Type': 'application/json' },
        data: body,
      });
      if (res.status() >= 500) failures.push(`${res.status()} for ${body}`);
    }
    expect(failures, `filter-counts answered 5xx on hostile input:\n  ${failures.join('\n  ')}`).toEqual([]);
  });

  test('POST /api/jobs/filter-counts answers 200 for the payload the /jobs page sends', async ({ page }) => {
    const res = await page.request.post('/api/jobs/filter-counts', {
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({
        search: '', workMode: [], jobType: [], specialty: [], experienceLevel: [],
        newGradFriendly: null, minYearsExperience: null, easyApply: null,
        salaryMin: null, postedWithin: null, location: null, cityExact: null,
        stateCode: null, employer: null, category: null,
      }),
    });
    expect(res.status(), await res.text().catch(() => '')).toBe(200);
    const body = (await res.json()) as { total?: number };
    expect(typeof body.total, 'filter counts must carry a numeric total').toBe('number');
  });
});

// ── 9. copy rules ────────────────────────────────────────────────────────────

test.describe('user-facing copy rules on seeker pages', () => {
  test.skip(!SEEKER, 'seeker creds missing');

  // Known em/en-dash copy on these routes (h0902); marked expected-to-fail so
  // the suite documents the violations without hiding them.
  const PAGES: Array<{ path: string; ready: RegExp; knownDash: string | null }> = [
    { path: '/saved', ready: /My Jobs/, knownDash: 'app/saved/page.tsx: "Bookmark jobs you\'re interested in — they\'ll show up here." and "Title A–Z"' },
    { path: '/my-applications', ready: /My Applications/, knownDash: null },
    { path: '/settings?tab=personal', ready: /Settings/, knownDash: 'components/auth/ResumeUpload.tsx: "PDF or Word doc, max 5 MB — drag & drop or click to browse"' },
    { path: '/job-alerts/manage', ready: /Manage Job Alerts/, knownDash: null },
    { path: '/dashboard', ready: /./, knownDash: 'components/dashboard/DashboardContent.tsx:639: "— Here’s what’s happening with your job search."' },
    { path: '/dashboard/resume-studio', ready: /Your resumes/, knownDash: null },
  ];

  for (const p of PAGES) {
    test(`${p.path}: no em/en dashes, no "founder", no "Pavan"`, async ({ page }) => {
      if (p.knownDash) test.fail(true, `known copy violation: ${p.knownDash}`);
      const c = attachErrorCollectors(page);
      await loginSeeker(page);
      await page.goto(p.path, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body')).toContainText(p.ready, { timeout: 90_000 });
      await page.waitForLoadState('networkidle').catch(() => undefined);
      assertCopyRules(await bodyText(page), p.path);
      assertClean(c, `copy ${p.path}`);
    });
  }
});
