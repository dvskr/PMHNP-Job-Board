import { test, expect, type Browser, type BrowserContext, type Page, type Response } from '@playwright/test';
import path from 'path';
import {
  getEmployerCreds,
  getSeekerCreds,
  loginAsEmployer,
  loginAsSeeker,
} from '../fixtures/auth';
import { attachErrorCollectors, assertClean, type Collected } from './_helpers';

/**
 * Bug-hunt slice "employer-talent" (run tag h0902).
 *
 * Journey: an employer (Test Corp) manages applicants and talent.
 *   1. Access control: a job seeker / anonymous visitor must not reach the
 *      employer applicant + talent surfaces or their APIs.
 *   2. Setup: make sure Test Corp has one active platform-apply posting
 *      (the suite skips when none exists: there is no unpaid create path) and that
 *      the shared seeker has applied to it in-platform (resume upload,
 *      consent, submit).
 *   3. /employer/applicants: rows vs empty state, status change, notes,
 *      filters, resume download, ownership of the jobId filter.
 *   4. /employer/candidates: browse, keyword + state/experience/specialty
 *      filters, privacy transform, edge-case params.
 *   5. Unlock flow: candidate detail gating (hidden / garbage ids), single
 *      unlock, resume endpoint, bulk unlock incl. over-quota response.
 *   6. Save candidate + note + tags, candidate alerts CRUD, testimonial form.
 *   7. Messaging: employer -> applicant, seeker reply, employer edit/delete,
 *      PDF attachment (PNG rejected by design), dashboard sent-messages tab.
 *   8. AI talent search: one query, results or an honest disabled state.
 *
 * Every page has error collectors attached; each test asserts no page
 * errors, hydration warnings or 5xx responses (see _helpers.ts).
 */

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const AGAINST_PROD = !!process.env.PLAYWRIGHT_BASE_URL && process.env.PLAYWRIGHT_BASE_URL.includes('pmhnphiring.com');
const HAS_EMPLOYER = getEmployerCreds() !== null;
const HAS_SEEKER = getSeekerCreds() !== null;
const SAMPLE_PDF = path.resolve(process.cwd(), process.env.E2E_TEST_RESUME_PATH || 'tests/e2e/fixtures/sample-resume.pdf');
const RUN_TAG = 'h0902';
// The shared seeker's display name is NOT hard-coded: other suites edit that
// profile, so the applicant row is resolved at runtime from the employer's own
// applicants feed (the E2E posting only ever has the one application).
const EMPLOYER_NAME = 'TestEmployer';
const E2E_JOB_TITLE_PREFIX = 'E2E Talent Slice PMHNP';

// ─── Session cache: log in once per role, then hand out fresh contexts ───

const stateCache: Partial<Record<'employer' | 'seeker', string>> = {};

async function contextFor(browser: Browser, role: 'employer' | 'seeker'): Promise<BrowserContext> {
  if (!stateCache[role]) {
    const ctx = await browser.newContext({ baseURL: BASE_URL });
    const page = await ctx.newPage();
    if (role === 'employer') await loginAsEmployer(page);
    else await loginAsSeeker(page);
    stateCache[role] = JSON.stringify(await ctx.storageState());
    await ctx.close();
  }
  return browser.newContext({ baseURL: BASE_URL, storageState: JSON.parse(stateCache[role]!) });
}

interface ApiResult<T = unknown> {
  status: number;
  contentType: string | null;
  text: string;
  json: T | null;
}

/** In-page fetch so cookies + Origin/Referer behave exactly like the real UI. */
async function apiFetch<T = unknown>(
  page: Page,
  url: string,
  init?: { method?: string; body?: unknown },
): Promise<ApiResult<T>> {
  await ensureOnApp(page);
  return page.evaluate(async ({ url, init }) => {
    const res = await fetch(url, {
      method: init?.method || 'GET',
      headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const text = await res.text();
    let json: unknown = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, contentType: res.headers.get('content-type'), text, json: json as never };
  }, { url, init });
}

/** Same as apiFetch but sends the body verbatim (for malformed-JSON probes). */
async function apiFetchRaw(
  page: Page,
  url: string,
  init: { method: string; rawBody: string; contentType?: string },
): Promise<ApiResult> {
  await ensureOnApp(page);
  return page.evaluate(async ({ url, init }) => {
    const res = await fetch(url, {
      method: init.method,
      headers: { 'Content-Type': init.contentType || 'application/json' },
      body: init.rawBody,
    });
    const text = await res.text();
    let json: unknown = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, contentType: res.headers.get('content-type'), text, json: json as never };
  }, { url, init });
}

/** page.evaluate(fetch) needs a same-origin document; load a cheap one once. */
async function ensureOnApp(page: Page): Promise<void> {
  if (page.url().startsWith(BASE_URL)) return;
  await page.goto('/unauthorized', { waitUntil: 'domcontentloaded' });
}

// ─── Shared fixtures resolved lazily (cached for the run) ───

interface EmployerJob { id: string; slug: string; title: string; postingId: string }
let employerJob: EmployerJob | null = null;

interface UsagePosting { id: string; jobId: string; jobTitle: string; unlocks: { used: number; limit: number; remaining: number } }

/**
 * Make sure Test Corp has one ACTIVE platform-apply posting. Reuses an
 * existing one (the free quota is one post per account) and only posts a
 * new free job when none exists.
 */
async function ensureEmployerJob(empPage: Page): Promise<EmployerJob> {
  if (employerJob) return employerJob;
  const usage = await apiFetch<{ postings?: UsagePosting[] }>(empPage, '/api/employer/usage');
  expect(usage.status, `GET /api/employer/usage -> ${usage.status} ${usage.text.slice(0, 200)}`).toBe(200);
  const postings = usage.json?.postings || [];
  for (const p of postings) {
    const job = await apiFetch<{ id: string; slug: string | null; applyOnPlatform: boolean; title: string }>(empPage, `/api/jobs/${p.jobId}`);
    if (job.status === 200 && job.json?.applyOnPlatform && job.json.slug) {
      employerJob = { id: job.json.id, slug: job.json.slug, title: job.json.title, postingId: p.id };
      return employerJob;
    }
  }
  // Every post now goes through Stripe checkout, so this suite can no longer
  // seed its own posting: the retired unpaid route answers 410. Skip rather
  // than fabricate a fixture. To run this slice, seed one Test Corp
  // platform-apply posting through checkout first (Stripe test mode).
  test.skip(true, `no active platform-apply posting for ${E2E_JOB_TITLE_PREFIX} and no unpaid create path exists; seed one via checkout`);
  throw new Error('unreachable: test.skip aborts the test');
}

let seekerApplied = false;

/** Make sure the shared seeker has an in-platform application on the E2E job. */
async function ensureSeekerApplied(browser: Browser, job: EmployerJob): Promise<void> {
  if (seekerApplied) return;
  const ctx = await contextFor(browser, 'seeker');
  const page = await ctx.newPage();
  const collected = attachErrorCollectors(page);
  try {
    const check = await apiFetch<{ applied: boolean }>(page, `/api/applications/check?jobId=${job.id}`);
    if (check.json?.applied) { seekerApplied = true; return; }
    await applyInPlatform(page, job);
    seekerApplied = true;
    assertClean(collected, 'seeker apply');
  } finally {
    await ctx.close();
  }
}

async function applyInPlatform(page: Page, job: EmployerJob): Promise<void> {
  await page.goto(`/jobs/${job.slug}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1 })).toContainText(job.title.slice(0, 20));
  const applyBtn = page.getByRole('button', { name: /easy apply|apply now|apply again/i }).first();
  await expect(applyBtn).toBeVisible();
  await applyBtn.click();
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: /submit application/i }) });
  await expect(form).toBeVisible();
  const uploadResp = page.waitForResponse((r) => r.url().includes('/api/upload') && r.request().method() === 'POST');
  await form.locator('input[type="file"]').first().setInputFiles(SAMPLE_PDF);
  const up = await uploadResp;
  expect(up.status(), 'resume upload inside apply form').toBe(200);
  await form.locator('input[type="checkbox"]').first().check();
  const applyResp = page.waitForResponse((r) => r.url().includes('/api/applications/apply-direct'));
  await form.getByRole('button', { name: /submit application/i }).click();
  const applied = await applyResp;
  expect(applied.status(), `apply-direct -> ${applied.status()} ${await applied.text().catch(() => '')}`).toBe(200);
  await expect(page.getByText(/application submitted/i)).toBeVisible();
}

async function openApplicants(page: Page): Promise<void> {
  const listResp = page.waitForResponse((r) => r.url().includes('/api/employer/applicants') && r.request().method() === 'GET');
  await page.goto('/employer/applicants', { waitUntil: 'domcontentloaded' });
  const res = await listResp;
  expect(res.status(), 'GET /api/employer/applicants from the page').toBe(200);
}

interface SeekerIdentity { id: string; name: string }
let seekerIdentity: SeekerIdentity | null = null;

/**
 * Resolve the applicant row that belongs to the shared seeker, by job rather
 * than by a hard-coded name — the seeker profile is edited by other suites, so
 * the display name is not a stable selector.
 */
async function getSeekerIdentity(empPage: Page, job: EmployerJob): Promise<SeekerIdentity> {
  if (seekerIdentity) return seekerIdentity;
  const list = await apiFetch<{ applicants: Array<{ candidate: { id: string; name: string }; job: { id: string } }> }>(
    empPage,
    '/api/employer/applicants',
  );
  expect(list.status, `GET /api/employer/applicants -> ${list.status} ${list.text.slice(0, 200)}`).toBe(200);
  const row = (list.json?.applicants || []).find((a) => a.job.id === job.id);
  expect(row, `expected one application on the E2E posting ${job.id}, got ${(list.json?.applicants || []).length} rows`).toBeTruthy();
  seekerIdentity = { id: row!.candidate.id, name: row!.candidate.name };
  return seekerIdentity;
}

function seekerCard(page: Page, name: string) {
  return page.locator('.app-card').filter({ hasText: name }).first();
}

/**
 * The talent-pool list fetch. 3xx responses are ignored on purpose: the SEO
 * middleware 301-redirects any URL carrying ?page=1, API routes included, so
 * the page's first request is a redirect and the JSON arrives on the retry.
 * See the dedicated "page=1 is served directly" test below.
 */
function isCandidatesList(r: Response): boolean {
  return r.url().includes('/api/employer/candidates?') && r.request().method() === 'GET' && r.status() < 300;
}

interface CandidateRow {
  id: string;
  displayName: string;
  yearsExperience: number | null;
  specialties: string[];
  licenseStates?: string[];
  hasResume?: boolean;
}
interface CandidateList { candidates: CandidateRow[]; totalCount: number; page: number; totalPages: number; viewedCandidateIds: string[] }

// ═══════════════════════════════════════════════════════════════════════
// 1. Access control
// ═══════════════════════════════════════════════════════════════════════

test.describe('employer-talent: access control', () => {
  test('anonymous visitor is bounced from /employer/applicants and gets 401 from the APIs', async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: BASE_URL });
    const page = await ctx.newPage();
    const collected = attachErrorCollectors(page);
    await page.goto('/employer/applicants', { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/(login|employer\/login|unauthorized)/, { waitUntil: 'domcontentloaded' });
    expect(page.url()).not.toContain('/employer/applicants');
    for (const url of ['/api/employer/applicants', '/api/employer/candidates', '/api/employer/candidate-alerts', '/api/employer/saved-candidates', '/api/employer/tags']) {
      const r = await apiFetch(page, url);
      expect(r.status, `${url} anonymous`).toBe(401);
    }
    const bulk = await apiFetch(page, '/api/employer/profiles/unlock-bulk', { method: 'POST', body: { candidateIds: ['x'] } });
    expect(bulk.status, 'unlock-bulk anonymous').toBe(401);
    assertClean(collected);
    await ctx.close();
  });

  test('job seeker cannot open /employer/applicants (redirect, no applicant data)', async ({ browser }) => {
    test.skip(!HAS_SEEKER, 'E2E_SEEKER creds not set');
    const ctx = await contextFor(browser, 'seeker');
    const page = await ctx.newPage();
    const collected = attachErrorCollectors(page);
    await page.goto('/employer/applicants', { waitUntil: 'domcontentloaded' });
    await page.waitForURL((u) => !u.pathname.startsWith('/employer/applicants'), { waitUntil: 'domcontentloaded' });
    expect(page.url()).toMatch(/\/(unauthorized|login)/);
    const body = await page.locator('body').innerText();
    expect(body).not.toMatch(/Candidates who have applied to your job postings/i);
    assertClean(collected);
    await ctx.close();
  });

  test('job seeker cannot open /employer/candidates or /employer/talent-search', async ({ browser }) => {
    test.skip(!HAS_SEEKER, 'E2E_SEEKER creds not set');
    const ctx = await contextFor(browser, 'seeker');
    const page = await ctx.newPage();
    const collected = attachErrorCollectors(page);
    await page.goto('/employer/candidates', { waitUntil: 'domcontentloaded' });
    await page.waitForURL((u) => !u.pathname.startsWith('/employer/candidates'), { waitUntil: 'domcontentloaded' });
    expect(page.url()).toMatch(/\/(unauthorized|login)/);
    await page.goto('/employer/talent-search', { waitUntil: 'domcontentloaded' });
    await page.waitForURL((u) => !u.pathname.startsWith('/employer/'), { waitUntil: 'domcontentloaded' });
    expect(page.url()).toMatch(/\/(unauthorized|login)/);
    assertClean(collected);
    await ctx.close();
  });

  test('job seeker gets 403 from every employer talent API', async ({ browser }) => {
    test.skip(!HAS_SEEKER, 'E2E_SEEKER creds not set');
    const ctx = await contextFor(browser, 'seeker');
    const page = await ctx.newPage();
    const collected = attachErrorCollectors(page);
    const gets = ['/api/employer/applicants', '/api/employer/candidates', '/api/employer/candidate-alerts', '/api/employer/saved-candidates', '/api/employer/tags', '/api/employer/usage', '/api/employer/messages'];
    for (const url of gets) {
      const r = await apiFetch(page, url);
      expect(r.status, `${url} as seeker -> ${r.status} ${r.text.slice(0, 120)}`).toBe(403);
    }
    const bulk = await apiFetch(page, '/api/employer/profiles/unlock-bulk', { method: 'POST', body: { candidateIds: ['x'] } });
    expect(bulk.status, 'unlock-bulk as seeker').toBe(403);
    const patch = await apiFetch(page, '/api/employer/applicants', { method: 'PATCH', body: { applicationId: 'x', status: 'hired' } });
    expect(patch.status, 'PATCH applicants as seeker').toBe(403);
    const talent = await apiFetch(page, '/api/employer/talent/search', { method: 'POST', body: { query: 'telehealth pmhnp' } });
    expect(talent.status, 'talent search as seeker').toBe(403);
    assertClean(collected);
    await ctx.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 2 + 3. Setup posting + applicants management
// ═══════════════════════════════════════════════════════════════════════

test.describe('employer-talent: applicants', () => {
  test.skip(AGAINST_PROD, 'no mutations against production');
  test.skip(!HAS_EMPLOYER || !HAS_SEEKER, 'E2E employer/seeker creds not set');
  test.describe.configure({ mode: 'serial' });

  test('Test Corp has an active platform-apply posting that renders publicly', async ({ browser }) => {
    test.setTimeout(180_000);
    const ctx = await contextFor(browser, 'employer');
    const page = await ctx.newPage();
    const collected = attachErrorCollectors(page);
    const job = await ensureEmployerJob(page);
    await page.goto(`/jobs/${job.slug}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1 })).toContainText(job.title.slice(0, 20));
    await expect(page.getByRole('button', { name: /easy apply/i }).first()).toBeVisible();
    assertClean(collected);
    await ctx.close();
  });

  test('seeker applies in-platform (resume upload + consent) and the application is recorded', async ({ browser }) => {
    test.setTimeout(180_000);
    const empCtx = await contextFor(browser, 'employer');
    const empPage = await empCtx.newPage();
    const job = await ensureEmployerJob(empPage);
    await empCtx.close();

    await ensureSeekerApplied(browser, job);

    const ctx = await contextFor(browser, 'seeker');
    const page = await ctx.newPage();
    const collected = attachErrorCollectors(page);
    const check = await apiFetch<{ applied: boolean; status?: string }>(page, `/api/applications/check?jobId=${job.id}`);
    expect(check.status).toBe(200);
    expect(check.json?.applied, `application check: ${check.text}`).toBe(true);
    const mine = await apiFetch<Array<{ jobId: string; job: { title: string } }>>(page, '/api/applications');
    expect(mine.status).toBe(200);
    expect((mine.json || []).some((a) => a.jobId === job.id), 'seeker /api/applications lists the E2E job').toBe(true);
    assertClean(collected);
    await ctx.close();
  });

  test('/employer/applicants lists the seeker application with job title and pipeline counts', async ({ browser }) => {
    test.setTimeout(180_000);
    const ctx = await contextFor(browser, 'employer');
    const page = await ctx.newPage();
    const collected = attachErrorCollectors(page);
    const job = await ensureEmployerJob(page);
    await ensureSeekerApplied(browser, job);
    const seeker = await getSeekerIdentity(page, job);
    await openApplicants(page);
    await expect(page.getByRole('heading', { level: 1, name: /applicants/i })).toBeVisible();
    const card = seekerCard(page, seeker.name);
    await expect(card).toBeVisible();
    await expect(card).toContainText(job.title.slice(0, 25));
    await expect(card.getByRole('link', { name: new RegExp(seeker.name) })).toHaveAttribute('href', `/employer/candidates/${seeker.id}`);
    // Pipeline pills sum to the number of cards.
    const pills = page.locator('button.app-pipeline-pill');
    expect(await pills.count()).toBe(7);
    let sum = 0;
    for (let i = 0; i < 7; i++) {
      const n = parseInt(((await pills.nth(i).innerText()).match(/(\d+)\s*$/) || ['', '0'])[1], 10);
      sum += n;
    }
    expect(sum).toBe(await page.locator('.app-card').count());
    assertClean(collected);
    await ctx.close();
  });

  test('changing an applicant status persists after reload and updates the pipeline pill', async ({ browser }) => {
    test.setTimeout(180_000);
    const ctx = await contextFor(browser, 'employer');
    const page = await ctx.newPage();
    const collected = attachErrorCollectors(page);
    const job = await ensureEmployerJob(page);
    await ensureSeekerApplied(browser, job);
    const seeker = await getSeekerIdentity(page, job);
    await openApplicants(page);
    const card = seekerCard(page, seeker.name);
    const select = card.locator('select');
    const current = await select.inputValue();
    const target = current === 'interview' ? 'screening' : 'interview';
    const patch = page.waitForResponse((r) => r.url().includes('/api/employer/applicants') && r.request().method() === 'PATCH');
    await select.selectOption(target);
    const res = await patch;
    expect(res.status(), `PATCH status -> ${res.status()} ${await res.text().catch(() => '')}`).toBe(200);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForResponse((r) => r.url().includes('/api/employer/applicants') && r.request().method() === 'GET');
    const after = seekerCard(page, seeker.name);
    await expect(after.locator('select')).toHaveValue(target);
    const label = target === 'interview' ? 'Interview' : 'Screening';
    await expect(after.getByText(label, { exact: true }).first()).toBeVisible();
    const pill = page.locator('button.app-pipeline-pill').filter({ hasText: new RegExp(`^${label}`) });
    expect(parseInt(((await pill.innerText()).match(/(\d+)\s*$/) || ['', '0'])[1], 10)).toBeGreaterThan(0);
    // Filtering by that status keeps the card; an unused status shows the empty state.
    await pill.click();
    await page.waitForResponse((r) => r.url().includes(`status=${target}`));
    await expect(seekerCard(page, seeker.name)).toBeVisible();
    assertClean(collected);
    await ctx.close();
  });

  test('status filter with zero applicants shows the honest empty state', async ({ browser }) => {
    test.setTimeout(180_000);
    const ctx = await contextFor(browser, 'employer');
    const page = await ctx.newPage();
    const collected = attachErrorCollectors(page);
    const job = await ensureEmployerJob(page);
    await ensureSeekerApplied(browser, job);
    await openApplicants(page);
    const zeroPill = page.locator('button.app-pipeline-pill').filter({ hasText: /0\s*$/ }).first();
    test.skip((await zeroPill.count()) === 0, 'every pipeline status has applicants');
    const status = (await zeroPill.innerText()).replace(/\d+\s*$/, '').trim();
    await zeroPill.click();
    await page.waitForResponse((r) => r.url().includes('/api/employer/applicants?status='));
    await expect(page.getByText(new RegExp(`No applicants with status "${status}"`, 'i'))).toBeVisible();
    expect(await page.locator('.app-card').count()).toBe(0);
    assertClean(collected);
    await ctx.close();
  });

  test('applicant notes persist (script tag + unicode stored as text, no XSS)', async ({ browser }) => {
    test.setTimeout(180_000);
    const ctx = await contextFor(browser, 'employer');
    const page = await ctx.newPage();
    const collected = attachErrorCollectors(page);
    let dialogs = 0;
    page.on('dialog', (d) => { dialogs++; d.dismiss().catch(() => undefined); });
    const job = await ensureEmployerJob(page);
    await ensureSeekerApplied(browser, job);
    const seeker = await getSeekerIdentity(page, job);
    await openApplicants(page);
    const card = seekerCard(page, seeker.name);
    await card.locator('button.app-notes-btn').click();
    const note = `E2E note ${RUN_TAG} ✓ naïve <script>alert(1)</script> ${Date.now()}`;
    await card.getByPlaceholder(/add private notes/i).fill(note);
    const patch = page.waitForResponse((r) => r.url().includes('/api/employer/applicants') && r.request().method() === 'PATCH');
    await card.getByRole('button', { name: 'Save' }).click();
    expect((await patch).status()).toBe(200);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForResponse((r) => r.url().includes('/api/employer/applicants') && r.request().method() === 'GET');
    const after = seekerCard(page, seeker.name);
    await expect(after.locator('button.app-notes-btn')).toContainText('naïve <script>alert(1)</script>');
    expect(dialogs, 'a script tag in notes must never execute').toBe(0);
    assertClean(collected);
    await ctx.close();
  });

  test('applicant resume link serves a PDF and PATCH validation rejects bad input', async ({ browser }) => {
    test.setTimeout(180_000);
    const ctx = await contextFor(browser, 'employer');
    const page = await ctx.newPage();
    const collected = attachErrorCollectors(page);
    const job = await ensureEmployerJob(page);
    await ensureSeekerApplied(browser, job);
    const seeker = await getSeekerIdentity(page, job);
    const list = await apiFetch<{ applicants: Array<{ id: string; resumeUrl: string | null; candidate: { id: string } }> }>(page, '/api/employer/applicants');
    expect(list.status).toBe(200);
    const app = (list.json?.applicants || []).find((a) => a.candidate.id === seeker.id);
    expect(app, 'seeker application present in API list').toBeTruthy();
    expect(app!.resumeUrl, 'application carries a signed resume URL').toBeTruthy();
    const pdf = await page.request.get(app!.resumeUrl!);
    expect(pdf.status(), `signed resume URL -> ${pdf.status()}`).toBe(200);
    expect(pdf.headers()['content-type'] || '').toMatch(/pdf|octet-stream/);
    expect((await pdf.body()).subarray(0, 4).toString()).toBe('%PDF');

    const badStatus = await apiFetch<{ error?: string }>(page, '/api/employer/applicants', { method: 'PATCH', body: { applicationId: app!.id, status: 'ghosted' } });
    expect(badStatus.status, badStatus.text).toBe(400);
    const noId = await apiFetch(page, '/api/employer/applicants', { method: 'PATCH', body: { status: 'hired' } });
    expect(noId.status, noId.text).toBe(400);
    const missing = await apiFetch(page, '/api/employer/applicants', { method: 'PATCH', body: { applicationId: 'does-not-exist', status: 'hired' } });
    expect(missing.status, missing.text).toBe(404);
    assertClean(collected);
    await ctx.close();
  });

  test('PATCH applicants rejects non-string notes and malformed JSON with 400, not 500', async ({ browser }) => {
    test.setTimeout(180_000);
    const ctx = await contextFor(browser, 'employer');
    const page = await ctx.newPage();
    const collected = attachErrorCollectors(page);
    const job = await ensureEmployerJob(page);
    await ensureSeekerApplied(browser, job);
    const seeker = await getSeekerIdentity(page, job);
    const list = await apiFetch<{ applicants: Array<{ id: string; notes: string | null; candidate: { id: string } }> }>(page, '/api/employer/applicants');
    const app = (list.json?.applicants || []).find((a) => a.candidate.id === seeker.id);
    expect(app, 'seeker application present in API list').toBeTruthy();
    const outcomes: string[] = [];
    const numericNotes = await apiFetch(page, '/api/employer/applicants', { method: 'PATCH', body: { applicationId: app!.id, notes: 12345 } });
    outcomes.push(`notes as number -> ${numericNotes.status} ${numericNotes.text.slice(0, 120)}`);
    const objectId = await apiFetch(page, '/api/employer/applicants', { method: 'PATCH', body: { applicationId: { $gt: '' }, status: 'hired' } });
    outcomes.push(`applicationId as object -> ${objectId.status} ${objectId.text.slice(0, 120)}`);
    const malformed = await apiFetchRaw(page, '/api/employer/applicants', { method: 'PATCH', rawBody: '{"applicationId": ' });
    outcomes.push(`malformed JSON -> ${malformed.status} ${malformed.text.slice(0, 120)}`);
    // Restore the note field to what it was in case the numeric write went through.
    if (numericNotes.status === 200) {
      await apiFetch(page, '/api/employer/applicants', { method: 'PATCH', body: { applicationId: app!.id, notes: app!.notes ?? '' } });
    }
    expect(outcomes.filter((o) => / -> 5\d\d /.test(o)), `bad PATCH bodies must not 5xx:\n${outcomes.join('\n')}`).toEqual([]);
    expect(outcomes.filter((o) => / -> 400 /.test(o)).length, `expected validation errors:\n${outcomes.join('\n')}`).toBe(outcomes.length);
    collected.serverErrors.length = 0; // already asserted above with detail
    assertClean(collected);
    await ctx.close();
  });

  test('jobId filter is scoped to the employer own jobs (no cross-employer applicant leak)', async ({ browser }) => {
    test.setTimeout(180_000);
    // Seeker logs an application on a job Test Corp does NOT own, then Test
    // Corp asks for that jobId explicitly. The response must be empty.
    const seekerCtx = await contextFor(browser, 'seeker');
    const seekerPage = await seekerCtx.newPage();
    const jobs = await apiFetch<{ jobs: Array<{ id: string; sourceType?: string | null; employer?: string }> }>(seekerPage, '/api/jobs?limit=10');
    expect(jobs.status).toBe(200);
    const foreign = (jobs.json?.jobs || []).find((j) => j.sourceType !== 'employer' && j.employer !== 'Test Corp');
    expect(foreign, 'need a non-Test-Corp job in the public list').toBeTruthy();
    const logged = await apiFetch(seekerPage, '/api/applications', { method: 'POST', body: { jobId: foreign!.id } });
    expect(logged.status, `POST /api/applications -> ${logged.status} ${logged.text.slice(0, 150)}`).toBe(200);

    const ctx = await contextFor(browser, 'employer');
    const page = await ctx.newPage();
    const collected = attachErrorCollectors(page);
    await ensureEmployerJob(page);
    try {
      const leak = await apiFetch<{ applicants: Array<{ id: string; job: { id: string } }> }>(page, `/api/employer/applicants?jobId=${foreign!.id}`);
      expect(leak.status).toBe(200);
      const foreignRows = (leak.json?.applicants || []).filter((a) => a.job.id === foreign!.id);
      expect(
        foreignRows,
        `GET /api/employer/applicants?jobId=<job owned by another employer> returned ${foreignRows.length} applicant row(s) for job ${foreign!.id} (${foreign!.employer}) to Test Corp`,
      ).toEqual([]);
      assertClean(collected);
    } finally {
      await apiFetch(seekerPage, '/api/applications', { method: 'DELETE', body: { jobId: foreign!.id } }).catch(() => undefined);
      await seekerCtx.close();
      await ctx.close();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 4. Talent pool browse + filters
// ═══════════════════════════════════════════════════════════════════════

test.describe('employer-talent: candidate search', () => {
  test.skip(!HAS_EMPLOYER, 'E2E employer creds not set');

  test('/employer/candidates lists candidates with privacy-safe names', async ({ browser }) => {
    const ctx = await contextFor(browser, 'employer');
    const page = await ctx.newPage();
    const collected = attachErrorCollectors(page);
    const listResp = page.waitForResponse(isCandidatesList);
    await page.goto('/employer/candidates', { waitUntil: 'domcontentloaded' });
    const res = await listResp;
    expect(res.status()).toBe(200);
    const data = (await res.json()) as CandidateList;
    expect(data.totalCount).toBeGreaterThan(0);
    expect(data.candidates.length).toBeGreaterThan(0);
    for (const c of data.candidates) {
      expect(c.displayName, `display name "${c.displayName}" must be first name + last initial only`).toMatch(/^(PMHNP Candidate|\S+(?:\s+\S+)*\s[A-Za-z]\.|\S+(?:\s\S+)*)$/);
      expect(c.displayName.split(' ').pop()!.length <= 2 || c.displayName === 'PMHNP Candidate' || !c.displayName.includes(' '), `last name leaked in "${c.displayName}"`).toBe(true);
    }
    expect(await page.locator('a[href^="/employer/candidates/"]').count()).toBeGreaterThan(0);
    assertClean(collected);
    await ctx.close();
  });

  test('state filter via the UI only returns candidates licensed in that state', async ({ browser }) => {
    test.setTimeout(180_000);
    const ctx = await contextFor(browser, 'employer');
    const page = await ctx.newPage();
    const collected = attachErrorCollectors(page);
    await ensureEmployerJob(page); // active posting unlocks licenseStates in the payload
    await page.goto('/employer/candidates', { waitUntil: 'domcontentloaded' });
    await page.waitForResponse(isCandidatesList);
    await page.getByRole('button', { name: /filters/i }).first().click();
    // Pick the first state that actually has candidates so the assertion is meaningful.
    const all = await apiFetch<CandidateList>(page, '/api/employer/candidates?limit=50');
    const withStates = (all.json?.candidates || []).find((c) => (c.licenseStates || []).length > 0);
    test.skip(!withStates, 'no candidate with license states in the talent pool');
    const state = withStates!.licenseStates![0];
    const filtered = page.waitForResponse((r) => isCandidatesList(r) && r.url().includes(`states=${state}`));
    await page.getByRole('button', { name: state, exact: true }).click();
    const data = (await (await filtered).json()) as CandidateList;
    expect(data.candidates.length).toBeGreaterThan(0);
    for (const c of data.candidates) {
      expect((c.licenseStates || []).join(','), `${c.displayName} should be licensed in ${state}`).toMatch(new RegExp(state, 'i'));
    }
    await expect(page.getByText(/Licensed States \(1\)/)).toBeVisible();
    assertClean(collected);
    await ctx.close();
  });

  test('experience, specialty, resume and keyword filters are honoured by the API', async ({ browser }) => {
    test.setTimeout(180_000);
    const ctx = await contextFor(browser, 'employer');
    const page = await ctx.newPage();
    const collected = attachErrorCollectors(page);
    await ensureEmployerJob(page);
    const exp = await apiFetch<CandidateList>(page, '/api/employer/candidates?experience=10&limit=50');
    expect(exp.status).toBe(200);
    expect(exp.json!.candidates.length).toBeGreaterThan(0);
    for (const c of exp.json!.candidates) expect(c.yearsExperience ?? -1, `${c.displayName} years`).toBeGreaterThanOrEqual(10);

    const spec = await apiFetch<CandidateList>(page, '/api/employer/candidates?specialties=ADHD&limit=50');
    expect(spec.status).toBe(200);
    expect(spec.json!.candidates.length).toBeGreaterThan(0);
    for (const c of spec.json!.candidates) expect(c.specialties.join(','), `${c.displayName} specialties`).toMatch(/ADHD/i);

    const noResume = await apiFetch<CandidateList>(page, '/api/employer/candidates?hasResume=false&limit=50');
    expect(noResume.status).toBe(200);
    for (const c of noResume.json!.candidates) expect(c.hasResume, `${c.displayName} hasResume`).toBe(false);
    const withResume = await apiFetch<CandidateList>(page, '/api/employer/candidates?hasResume=true&limit=50');
    for (const c of withResume.json!.candidates) expect(c.hasResume, `${c.displayName} hasResume`).toBe(true);
    expect(withResume.json!.totalCount + noResume.json!.totalCount).toBe((await apiFetch<CandidateList>(page, '/api/employer/candidates')).json!.totalCount);

    // Keyword: search by the first name of a known candidate.
    const first = withResume.json!.candidates.find((c) => c.displayName !== 'PMHNP Candidate');
    test.skip(!first, 'no named candidate');
    const name = first!.displayName.split(' ')[0];
    const kw = await apiFetch<CandidateList>(page, `/api/employer/candidates?q=${encodeURIComponent(name)}`);
    expect(kw.status).toBe(200);
    expect(kw.json!.candidates.some((c) => c.id === first!.id), `keyword "${name}" should find ${first!.id}`).toBe(true);
    assertClean(collected);
    await ctx.close();
  });

  test('edge-case query params never 500 and limits are capped', async ({ browser }) => {
    const ctx = await contextFor(browser, 'employer');
    const page = await ctx.newPage();
    const collected = attachErrorCollectors(page);
    const capped = await apiFetch<CandidateList>(page, '/api/employer/candidates?limit=999&page=abc');
    expect(capped.status).toBe(200);
    expect(capped.json!.page).toBe(1);
    expect(capped.json!.candidates.length).toBeLessThanOrEqual(50);
    expect(capped.json!.totalPages).toBe(Math.ceil(capped.json!.totalCount / 50));
    const weird = await apiFetch<CandidateList>(page, `/api/employer/candidates?q=${encodeURIComponent('<script>alert(1)</script> ünïcode\'--')}&experience=abc&states=,,&specialties=%20`);
    expect(weird.status, weird.text.slice(0, 200)).toBe(200);
    expect(Array.isArray(weird.json!.candidates)).toBe(true);
    const long = await apiFetch(page, `/api/employer/candidates?q=${'a'.repeat(3000)}`);
    expect(long.status, long.text.slice(0, 200)).toBeLessThan(500);
    assertClean(collected);
    await ctx.close();
  });

  test('API GET with page=1 is served directly, not 301-redirected by the SEO middleware', async ({ browser }) => {
    // Known bug: middleware.ts "Page=1 Stripping" applies to /api/* too, so the
    // talent pool's very first fetch (?page=1&limit=20) is a 301 and the JSON
    // only arrives on the follow-up request. Marked test.fail so the suite stays
    // green until the middleware excludes API routes.
    test.fail(true, 'middleware.ts strips ?page=1 with a 301 on /api/* routes');
    const ctx = await contextFor(browser, 'employer');
    const page = await ctx.newPage();
    const collected = attachErrorCollectors(page);
    const r = await page.request.get('/api/employer/candidates?page=1&limit=5', { maxRedirects: 0 });
    expect(r.status(), `GET /api/employer/candidates?page=1&limit=5 -> ${r.status()} location=${r.headers()['location'] || ''}`).toBe(200);
    assertClean(collected);
    await ctx.close();
  });

  test('oversized page numbers are clamped or rejected, never 500', async ({ browser }) => {
    const ctx = await contextFor(browser, 'employer');
    const page = await ctx.newPage();
    const collected = attachErrorCollectors(page);
    const outcomes: string[] = [];
    for (const p of ['99999999999', '2147483648', '-7', '1e3']) {
      const r = await apiFetch<CandidateList>(page, `/api/employer/candidates?page=${p}&limit=5`);
      outcomes.push(`page=${p} -> ${r.status} ${r.text.slice(0, 120)}`);
    }
    expect(outcomes.filter((o) => / -> 5\d\d /.test(o)), `page param edge cases must not 5xx:\n${outcomes.join('\n')}`).toEqual([]);
    collected.serverErrors.length = 0; // already asserted above with detail
    assertClean(collected);
    await ctx.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 5. Unlock flow, detail gating, resume endpoint, bulk unlock quota
// ═══════════════════════════════════════════════════════════════════════

test.describe('employer-talent: unlock + detail', () => {
  test.skip(AGAINST_PROD, 'no mutations against production');
  test.skip(!HAS_EMPLOYER, 'E2E employer creds not set');
  test.describe.configure({ mode: 'serial' });

  test('hidden or non-existent candidate ids return 404 (gated page, no 500)', async ({ browser }) => {
    const ctx = await contextFor(browser, 'employer');
    const page = await ctx.newPage();
    const collected = attachErrorCollectors(page);
    for (const id of ['not-a-real-id', '00000000-0000-4000-8000-000000000000', '%3Cscript%3E', '..%2F..%2Fetc']) {
      const api = await apiFetch(page, `/api/employer/candidates/${id}`);
      expect(api.status, `GET /api/employer/candidates/${id} -> ${api.status} ${api.text.slice(0, 120)}`).toBe(404);
      const resume = await apiFetch(page, `/api/employer/candidates/${id}/resume?json=1`);
      expect(resume.status, `resume for ${id}`).toBeGreaterThanOrEqual(400);
      expect(resume.status, `resume for ${id}`).toBeLessThan(500);
    }
    const detail = page.waitForResponse((r) => /\/api\/employer\/candidates\/not-a-real-id/.test(r.url()));
    await page.goto('/employer/candidates/not-a-real-id', { waitUntil: 'domcontentloaded' });
    expect((await detail).status()).toBe(404);
    await expect(page.getByText(/Candidate not found or profile is no longer visible/i)).toBeVisible();
    assertClean(collected);
    await ctx.close();
  });

  test('unlocking a candidate reveals contact info and the resume endpoint streams a PDF', async ({ browser }) => {
    test.setTimeout(180_000);
    const ctx = await contextFor(browser, 'employer');
    const page = await ctx.newPage();
    const collected = attachErrorCollectors(page);
    const job = await ensureEmployerJob(page);
    const list = await apiFetch<CandidateList>(page, '/api/employer/candidates?hasResume=true&limit=50');
    expect(list.status).toBe(200);
    const viewed = new Set(list.json!.viewedCandidateIds);
    const pick = list.json!.candidates.find((c) => viewed.has(c.id)) || list.json!.candidates[0];
    test.skip(!pick, 'no candidate with a resume in the talent pool');

    const detail = page.waitForResponse((r) => r.url().includes(`/api/employer/candidates/${pick.id}`) && !r.url().includes('/resume'));
    await page.goto(`/employer/candidates/${pick.id}?postingId=${job.postingId}`, { waitUntil: 'domcontentloaded' });
    const res = await detail;
    const body = await res.json().catch(() => ({}));
    if (res.status() === 403 && body.reason === 'posting_cap' && !viewed.has(pick.id)) {
      test.skip(true, 'unlock credits exhausted before this test and no previously unlocked candidate has a resume');
    }
    expect(res.status(), `detail -> ${res.status()} ${JSON.stringify(body).slice(0, 200)}`).toBe(200);
    expect(body.hasFullAccess).toBe(true);
    expect(body.contactEmail, 'unlocked detail carries contactEmail').toMatch(/@/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(body.displayName.split(' ')[0]);
    await expect(page.getByRole('link', { name: /download resume/i }).first()).toHaveAttribute('href', `/api/employer/candidates/${pick.id}/resume`);

    // Unlock is idempotent: a second visit must not fail on quota.
    const again = await apiFetch<{ hasFullAccess: boolean }>(page, `/api/employer/candidates/${pick.id}`);
    expect(again.status).toBe(200);
    expect(again.json!.hasFullAccess).toBe(true);
    const listAfter = await apiFetch<CandidateList>(page, '/api/employer/candidates?limit=1');
    expect(listAfter.json!.viewedCandidateIds).toContain(pick.id);

    // Resume: JSON mode hands back a signed URL that streams a PDF; default mode 302s.
    const json = await apiFetch<{ url: string; expiresInSeconds: number }>(page, `/api/employer/candidates/${pick.id}/resume?json=1`);
    expect(json.status, json.text.slice(0, 200)).toBe(200);
    expect(json.json!.url).toMatch(/^https?:\/\//);
    const file = await page.request.get(json.json!.url);
    expect(file.status(), `signed resume URL -> ${file.status()}`).toBe(200);
    expect(file.headers()['content-type'] || '').toMatch(/pdf|octet-stream|msword|officedocument/);
    const redirect = await page.request.get(`/api/employer/candidates/${pick.id}/resume`, { maxRedirects: 0 });
    expect(redirect.status(), 'resume endpoint should 302 to the signed URL').toBe(302);
    expect(redirect.headers()['location']).toMatch(/^https?:\/\//);
    assertClean(collected);
    await ctx.close();
  });

  test('resume endpoint refuses candidates that were not unlocked', async ({ browser }) => {
    const ctx = await contextFor(browser, 'employer');
    const page = await ctx.newPage();
    const collected = attachErrorCollectors(page);
    const list = await apiFetch<CandidateList>(page, '/api/employer/candidates?limit=50');
    const viewed = new Set(list.json!.viewedCandidateIds);
    const locked = list.json!.candidates.find((c) => !viewed.has(c.id));
    test.skip(!locked, 'every candidate on page 1 is already unlocked');
    const r = await apiFetch(page, `/api/employer/candidates/${locked!.id}/resume?json=1`);
    expect(r.status, r.text.slice(0, 200)).toBe(403);
    assertClean(collected);
    await ctx.close();
  });

  test('bulk unlock validates input and reports per-candidate outcomes', async ({ browser }) => {
    test.setTimeout(180_000);
    const ctx = await contextFor(browser, 'employer');
    const page = await ctx.newPage();
    const collected = attachErrorCollectors(page);
    const job = await ensureEmployerJob(page);
    const empty = await apiFetch(page, '/api/employer/profiles/unlock-bulk', { method: 'POST', body: { candidateIds: [] } });
    expect(empty.status, empty.text).toBe(400);
    const tooMany = await apiFetch(page, '/api/employer/profiles/unlock-bulk', { method: 'POST', body: { candidateIds: Array.from({ length: 101 }, (_, i) => `id-${i}`) } });
    expect(tooMany.status, tooMany.text).toBe(400);
    const notJson = await apiFetch(page, '/api/employer/profiles/unlock-bulk', { method: 'POST', body: 'garbage' });
    expect(notJson.status, notJson.text).toBe(400);

    const list = await apiFetch<CandidateList>(page, '/api/employer/candidates?limit=50');
    const viewed = list.json!.viewedCandidateIds;
    const known = viewed[0] || list.json!.candidates[0]?.id;
    test.skip(!known, 'no candidates');
    const mixed = await apiFetch<{ unlocked: { candidateId: string }[]; failed: { candidateId: string; reason: string; message: string }[]; allowanceRemaining: number | null }>(
      page,
      '/api/employer/profiles/unlock-bulk',
      { method: 'POST', body: { candidateIds: [known, 'ghost-candidate', known], postingId: job.postingId } },
    );
    expect(mixed.status, mixed.text.slice(0, 200)).toBe(200);
    expect(mixed.json!.unlocked.length + mixed.json!.failed.length, 'duplicate ids are collapsed').toBe(2);
    const ghost = mixed.json!.failed.find((f) => f.candidateId === 'ghost-candidate');
    expect(ghost?.reason).toBe('not_found');
    const knownOutcome = mixed.json!.unlocked.find((u) => u.candidateId === known) || mixed.json!.failed.find((f) => f.candidateId === known);
    expect(knownOutcome, 'known candidate has an outcome').toBeTruthy();
    if (mixed.json!.failed.find((f) => f.candidateId === known)) {
      expect(mixed.json!.failed.find((f) => f.candidateId === known)!.reason).toMatch(/posting_cap|daily_cap/);
    }
    assertClean(collected);
    await ctx.close();
  });

  test('bulk unlock beyond the posting credits returns posting_cap failures and the detail page gates honestly', async ({ browser }) => {
    test.setTimeout(400_000);
    const ctx = await contextFor(browser, 'employer');
    const page = await ctx.newPage();
    const collected = attachErrorCollectors(page);
    const job = await ensureEmployerJob(page);
    const ids: string[] = [];
    for (let p = 1; p <= 2; p++) {
      const list = await apiFetch<CandidateList>(page, `/api/employer/candidates?limit=50&page=${p}`);
      expect(list.status).toBe(200);
      ids.push(...list.json!.candidates.map((c) => c.id));
      if (p >= list.json!.totalPages) break;
    }
    const usageBefore = await apiFetch<{ postings: UsagePosting[] }>(page, '/api/employer/usage');
    const posting = usageBefore.json!.postings.find((x) => x.id === job.postingId)!;
    const creditLimit = posting.unlocks.limit;
    test.skip(creditLimit === -1 || ids.length <= creditLimit, `pool (${ids.length}) does not exceed the posting credits (${creditLimit}); cannot exercise over-quota`);

    const bulk = await apiFetch<{ unlocked: { candidateId: string }[]; failed: { candidateId: string; reason: string; message: string }[]; allowanceRemaining: number | null }>(
      page,
      '/api/employer/profiles/unlock-bulk',
      { method: 'POST', body: { candidateIds: ids.slice(0, 100), postingId: job.postingId } },
    );
    expect(bulk.status, bulk.text.slice(0, 300)).toBe(200);
    const result = bulk.json!;
    expect(result.unlocked.length + result.failed.length).toBe(Math.min(ids.length, 100));
    expect(result.failed.length, 'some unlocks must be refused once credits run out').toBeGreaterThan(0);
    for (const f of result.failed) {
      expect(f.reason, `${f.candidateId}: ${f.message}`).toMatch(/^(posting_cap|daily_cap)$/);
      expect(f.message).not.toMatch(/Unexpected error/);
    }
    const capReason = result.failed[0].reason;
    if (capReason === 'posting_cap') expect(result.allowanceRemaining).toBe(0);
    expect(result.unlocked.length, 'unlocked count is bounded by the posting credit limit').toBeLessThanOrEqual(creditLimit);

    const usageAfter = await apiFetch<{ postings: UsagePosting[]; usage: { candidateUnlocks: { used: number; limit: number | null } } }>(page, '/api/employer/usage');
    const after = usageAfter.json!.postings.find((x) => x.id === job.postingId)!;
    expect(after.unlocks.used, 'usage counter reflects the bulk unlock').toBeGreaterThanOrEqual(Math.min(creditLimit, result.unlocked.length));

    // A still-locked candidate now hits the quota gate on the detail page (403, never 500).
    const locked = result.failed[0].candidateId;
    const detail = page.waitForResponse((r) => r.url().includes(`/api/employer/candidates/${locked}`));
    await page.goto(`/employer/candidates/${locked}?postingId=${job.postingId}`, { waitUntil: 'domcontentloaded' });
    const res = await detail;
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.reason).toBe(capReason);
    await expect(page.getByText(capReason === 'posting_cap' ? /unlock limit reached/i : /daily unlock cap/i)).toBeVisible();
    // Talent pool cards for locked candidates now show the exhausted state instead of an Unlock CTA.
    await page.goto('/employer/candidates', { waitUntil: 'domcontentloaded' });
    await page.waitForResponse(isCandidatesList);
    if (capReason === 'posting_cap') {
      await expect(page.getByText(/No Unlocks Left/i).first()).toBeVisible();
    }
    assertClean(collected);
    await ctx.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 6. Saved candidates, tags, alerts, testimonials
// ═══════════════════════════════════════════════════════════════════════

test.describe('employer-talent: saved candidates, tags, alerts, testimonial', () => {
  test.skip(AGAINST_PROD, 'no mutations against production');
  test.skip(!HAS_EMPLOYER, 'E2E employer creds not set');

  test('save a candidate from a card, add note + tags, verify persistence, unsave', async ({ browser }) => {
    test.setTimeout(180_000);
    const ctx = await contextFor(browser, 'employer');
    const page = await ctx.newPage();
    const collected = attachErrorCollectors(page);
    await page.goto('/employer/candidates', { waitUntil: 'domcontentloaded' });
    await page.waitForResponse(isCandidatesList);
    await page.waitForResponse((r) => r.url().includes('/api/employer/saved-candidates')).catch(() => undefined);
    const saveBtn = page.getByTitle('Save candidate').first();
    await expect(saveBtn).toBeVisible();
    const href = await saveBtn.locator('xpath=ancestor::div[.//a[starts-with(@href,"/employer/candidates/")]][1]').locator('a[href^="/employer/candidates/"]').first().getAttribute('href');
    const candidateId = href!.replace('/employer/candidates/', '').split('?')[0];
    const saved = page.waitForResponse((r) => r.url().includes('/api/employer/saved-candidates') && r.request().method() === 'POST');
    await saveBtn.click();
    expect((await saved).status()).toBe(201);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForResponse((r) => r.url().includes('/api/employer/saved-candidates') && r.request().method() === 'GET');
    await expect(page.getByTitle('Remove from saved').first()).toBeVisible();

    const note = `E2E ${RUN_TAG} note ✓ <b>bold</b>`;
    const tagName = `E2E ${RUN_TAG} tag ${Date.now().toString(36)}`;
    const tag = await apiFetch<{ tag: { id: string; name: string } }>(page, '/api/employer/tags', { method: 'POST', body: { name: tagName, color: '#7C3AED' } });
    expect(tag.status, tag.text).toBe(201);
    try {
      const patch = await apiFetch<{ success: boolean; note: string; tags: string[] }>(page, '/api/employer/saved-candidates/note', { method: 'PATCH', body: { candidateId, note, tags: [tagName] } });
      expect(patch.status, patch.text).toBe(200);
      expect(patch.json!.note).toBe(note);
      expect(patch.json!.tags).toEqual([tagName]);
      const list = await apiFetch<{ savedCandidates: Array<{ note: string | null; tags: string[]; candidate: { id: string } }> }>(page, '/api/employer/saved-candidates');
      expect(list.status).toBe(200);
      const entry = list.json!.savedCandidates.find((s) => s.candidate.id === candidateId);
      expect(entry, 'saved list contains the candidate').toBeTruthy();
      expect(entry!.note).toBe(note);
      expect(entry!.tags).toEqual([tagName]);
      // Dashboard "Saved" tab renders the note and tag as text (no HTML injection).
      await page.goto('/employer/dashboard?tab=saved', { waitUntil: 'domcontentloaded' });
      await page.waitForResponse((r) => r.url().includes('/api/employer/saved-candidates'));
      await expect(page.getByText(note).first()).toBeVisible();
      expect(await page.locator('b', { hasText: 'bold' }).count(), 'note HTML must not render as markup').toBe(0);
    } finally {
      const unsave = await apiFetch(page, '/api/employer/saved-candidates', { method: 'DELETE', body: { candidateId } });
      expect(unsave.status).toBe(200);
      await apiFetch(page, '/api/employer/tags', { method: 'DELETE', body: { tagId: tag.json!.tag.id } });
    }
    const after = await apiFetch<{ savedCandidates: Array<{ candidate: { id: string } }> }>(page, '/api/employer/saved-candidates');
    expect(after.json!.savedCandidates.some((s) => s.candidate.id === candidateId)).toBe(false);
    const missingNote = await apiFetch(page, '/api/employer/saved-candidates/note', { method: 'PATCH', body: { candidateId, note: 'x' } });
    expect(missingNote.status, 'note on an unsaved candidate').toBe(404);
    assertClean(collected);
    await ctx.close();
  });

  test('tag API: create, duplicate 409, empty 400, odd names never 500, delete', async ({ browser }) => {
    const ctx = await contextFor(browser, 'employer');
    const page = await ctx.newPage();
    const collected = attachErrorCollectors(page);
    const name = `E2E ${RUN_TAG} ${Date.now().toString(36)}`;
    const created = await apiFetch<{ tag: { id: string; name: string; color: string } }>(page, '/api/employer/tags', { method: 'POST', body: { name: `  ${name}  `, color: '#7C3AED' } });
    expect(created.status, created.text).toBe(201);
    expect(created.json!.tag.name, 'name is trimmed').toBe(name);
    const ids = [created.json!.tag.id];
    try {
      const dup = await apiFetch(page, '/api/employer/tags', { method: 'POST', body: { name } });
      expect(dup.status, dup.text).toBe(409);
      const empty = await apiFetch(page, '/api/employer/tags', { method: 'POST', body: { name: '   ' } });
      expect(empty.status, empty.text).toBe(400);
      const noBody = await apiFetch(page, '/api/employer/tags', { method: 'POST', body: {} });
      expect(noBody.status, noBody.text).toBe(400);
      const weird = await apiFetch<{ tag?: { id: string } }>(page, '/api/employer/tags', { method: 'POST', body: { name: `<script>alert(${RUN_TAG})</script> ${'x'.repeat(400)}`, color: 'javascript:alert(1)' } });
      expect(weird.status, weird.text.slice(0, 200)).toBeLessThan(500);
      if (weird.json?.tag?.id) ids.push(weird.json.tag.id);
      const list = await apiFetch<{ tags: Array<{ id: string }> }>(page, '/api/employer/tags');
      expect(list.status).toBe(200);
      expect(list.json!.tags.some((t) => t.id === created.json!.tag.id)).toBe(true);
      const noId = await apiFetch(page, '/api/employer/tags', { method: 'DELETE', body: {} });
      expect(noId.status).toBe(400);
    } finally {
      for (const id of ids) {
        const del = await apiFetch(page, '/api/employer/tags', { method: 'DELETE', body: { tagId: id } });
        expect(del.status).toBe(200);
      }
    }
    const after = await apiFetch<{ tags: Array<{ id: string }> }>(page, '/api/employer/tags');
    expect(after.json!.tags.some((t) => ids.includes(t.id))).toBe(false);
    assertClean(collected);
    await ctx.close();
  });

  test('candidate alerts: create, read back, disable', async ({ browser }) => {
    const ctx = await contextFor(browser, 'employer');
    const page = await ctx.newPage();
    const collected = attachErrorCollectors(page);
    const create = await apiFetch(page, '/api/employer/candidate-alerts', { method: 'POST', body: { specialties: ['ADHD', 'Telehealth'], states: ['MO', 'TX'], minExperience: 3, workMode: 'Remote', isActive: true } });
    expect(create.status, create.text).toBe(200);
    const read = await apiFetch<{ alert: { specialties: string[]; states: string[]; minExperience: number | null; workMode: string | null; isActive: boolean } | null }>(page, '/api/employer/candidate-alerts');
    expect(read.status).toBe(200);
    expect(read.json!.alert, 'alert exists after create').toBeTruthy();
    expect(read.json!.alert!.specialties).toEqual(['ADHD', 'Telehealth']);
    expect(read.json!.alert!.states).toEqual(['MO', 'TX']);
    expect(read.json!.alert!.minExperience).toBe(3);
    expect(read.json!.alert!.workMode).toBe('Remote');
    expect(read.json!.alert!.isActive).toBe(true);
    const del = await apiFetch(page, '/api/employer/candidate-alerts', { method: 'DELETE' });
    expect(del.status).toBe(200);
    const after = await apiFetch<{ alert: { isActive: boolean } | null }>(page, '/api/employer/candidate-alerts');
    expect(after.json!.alert?.isActive, 'DELETE disables the alert').toBe(false);
    assertClean(collected);
    await ctx.close();
  });

  test('candidate alerts reject malformed payloads with 400 instead of crashing', async ({ browser }) => {
    const ctx = await contextFor(browser, 'employer');
    const page = await ctx.newPage();
    const collected = attachErrorCollectors(page);
    const cases: Array<[string, unknown]> = [
      ['minExperience as text', { specialties: ['ADHD'], minExperience: 'abc' }],
      ['specialties as string', { specialties: 'ADHD, PTSD', states: ['MO'] }],
      ['states as object', { states: { MO: true } }],
      ['workMode as number', { workMode: 42 }],
    ];
    const outcomes: string[] = [];
    for (const [label, body] of cases) {
      const r = await apiFetch(page, '/api/employer/candidate-alerts', { method: 'POST', body });
      outcomes.push(`${label} -> ${r.status} ${r.text.slice(0, 80)}`);
    }
    // Leave the alert disabled for the shared account.
    await apiFetch(page, '/api/employer/candidate-alerts', { method: 'DELETE' });
    expect(outcomes.filter((o) => / -> 5\d\d /.test(o)), `malformed alert bodies must not 5xx:\n${outcomes.join('\n')}`).toEqual([]);
    expect(outcomes.filter((o) => / -> 400 /.test(o)).length, `expected validation errors:\n${outcomes.join('\n')}`).toBe(cases.length);
    assertClean(collected);
    await ctx.close();
  });

  test('dashboard "Share Your Story" testimonial form submits with consent, API rejects short/unconsented input', async ({ browser }) => {
    test.setTimeout(180_000);
    const ctx = await contextFor(browser, 'employer');
    const page = await ctx.newPage();
    const collected = attachErrorCollectors(page);
    const short = await apiFetch<{ error: string }>(page, '/api/employer/testimonials', { method: 'POST', body: { content: 'short', consent: true } });
    expect(short.status, short.text).toBe(400);
    const noConsent = await apiFetch<{ error: string }>(page, '/api/employer/testimonials', { method: 'POST', body: { content: 'A perfectly long enough testimonial body', consent: false } });
    expect(noConsent.status, noConsent.text).toBe(400);
    const badRating = await apiFetch(page, '/api/employer/testimonials', { method: 'POST', body: { content: 'A perfectly long enough testimonial body', consent: true, rating: 9 } });
    expect(badRating.status, badRating.text).toBe(400);

    await page.goto('/employer/dashboard', { waitUntil: 'domcontentloaded' });
    const textarea = page.getByPlaceholder(/How has PMHNP Hiring helped your recruitment/i);
    await expect(textarea).toBeVisible();
    const submit = page.getByRole('button', { name: /share/i }).filter({ hasNot: page.locator('a') }).last();
    await expect(submit).toBeDisabled();
    await textarea.fill(`E2E ${RUN_TAG} testimonial: the applicant pipeline made screening candidates simple. ✓`);
    await expect(submit).toBeDisabled();
    await page.getByLabel(/I consent to my review being featured publicly/i).check();
    await expect(page.getByRole('button', { name: /anonymous/i })).toBeVisible();
    await page.getByRole('button', { name: /anonymous/i }).click();
    await expect(submit).toBeEnabled();
    const post = page.waitForResponse((r) => r.url().includes('/api/employer/testimonials'));
    await submit.click();
    const res = await post;
    expect(res.status(), `POST testimonial -> ${res.status()} ${await res.text().catch(() => '')}`).toBe(200);
    await expect(page.getByText(/Story Shared!/i)).toBeVisible();
    assertClean(collected);
    await ctx.close();
  });

  test('job seeker cannot submit an employer testimonial (role gate)', async ({ browser }) => {
    test.skip(!HAS_SEEKER, 'E2E seeker creds not set');
    const ctx = await contextFor(browser, 'seeker');
    const page = await ctx.newPage();
    const collected = attachErrorCollectors(page);
    const r = await apiFetch(page, '/api/employer/testimonials', {
      method: 'POST',
      body: { content: `E2E ${RUN_TAG} probe: a job seeker should not be able to file an employer testimonial.`, consent: true, displayAs: 'anonymous' },
    });
    expect(r.status, `seeker POST /api/employer/testimonials -> ${r.status} ${r.text.slice(0, 200)}`).toBe(403);
    assertClean(collected);
    await ctx.close();
  });

  test('per-posting notification preferences: read, update, persist, invalid digest 400, foreign posting 404/403', async ({ browser }) => {
    test.setTimeout(180_000);
    const ctx = await contextFor(browser, 'employer');
    const page = await ctx.newPage();
    const collected = attachErrorCollectors(page);
    const job = await ensureEmployerJob(page);
    interface Pref { employerJobId: string; jobId: string; jobTitle: string; notifyOnApplication: boolean; notifyDigest: string }
    const before = await apiFetch<{ preferences: Pref[] }>(page, '/api/employer/settings/notifications');
    expect(before.status, before.text.slice(0, 200)).toBe(200);
    const mine = before.json!.preferences.find((p) => p.employerJobId === job.postingId);
    expect(mine, 'the E2E posting has a notification preference row').toBeTruthy();
    const targetDigest = mine!.notifyDigest === 'daily' ? 'instant' : 'daily';
    const targetNotify = !mine!.notifyOnApplication;
    try {
      const patch = await apiFetch<{ success: boolean; notifyOnApplication: boolean; notifyDigest: string }>(page, '/api/employer/settings/notifications', {
        method: 'PATCH',
        body: { employerJobId: job.postingId, notifyOnApplication: targetNotify, notifyDigest: targetDigest },
      });
      expect(patch.status, patch.text.slice(0, 200)).toBe(200);
      expect(patch.json!.notifyDigest).toBe(targetDigest);
      expect(patch.json!.notifyOnApplication).toBe(targetNotify);
      const after = await apiFetch<{ preferences: Pref[] }>(page, '/api/employer/settings/notifications');
      const row = after.json!.preferences.find((p) => p.employerJobId === job.postingId)!;
      expect(row.notifyDigest, 'digest persisted').toBe(targetDigest);
      expect(row.notifyOnApplication, 'notifyOnApplication persisted').toBe(targetNotify);
      const bad = await apiFetch(page, '/api/employer/settings/notifications', { method: 'PATCH', body: { employerJobId: job.postingId, notifyDigest: 'hourly' } });
      expect(bad.status, bad.text.slice(0, 200)).toBe(400);
      const ghost = await apiFetch(page, '/api/employer/settings/notifications', { method: 'PATCH', body: { employerJobId: 'ghost-posting', notifyDigest: 'off' } });
      expect(ghost.status, ghost.text.slice(0, 200)).toBe(404);
    } finally {
      await apiFetch(page, '/api/employer/settings/notifications', {
        method: 'PATCH',
        body: { employerJobId: job.postingId, notifyOnApplication: mine!.notifyOnApplication, notifyDigest: mine!.notifyDigest },
      });
    }
    assertClean(collected);
    await ctx.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 7. Messaging between employer and applicant
// ═══════════════════════════════════════════════════════════════════════

test.describe('employer-talent: messaging', () => {
  test.skip(AGAINST_PROD, 'no mutations against production');
  test.skip(!HAS_EMPLOYER || !HAS_SEEKER, 'E2E employer/seeker creds not set');
  test.describe.configure({ mode: 'serial' });

  const stamp = Date.now().toString(36);
  const firstBody = `E2E ${RUN_TAG} outreach ${stamp}: we would love to talk about the role.`;
  const replyBody = `E2E ${RUN_TAG} reply ${stamp}: thanks, happy to chat. Ünïcode ✓`;
  const secondBody = `E2E ${RUN_TAG} follow-up ${stamp} original`;
  const editedBody = `E2E ${RUN_TAG} follow-up ${stamp} EDITED`;
  let conversationId: string | null = null;
  let seekerDisplayName = '';

  test('employer messages the applicant from /employer/applicants', async ({ browser }) => {
    test.setTimeout(180_000);
    const ctx = await contextFor(browser, 'employer');
    const page = await ctx.newPage();
    const collected = attachErrorCollectors(page);
    const job = await ensureEmployerJob(page);
    await ensureSeekerApplied(browser, job);
    const seeker = await getSeekerIdentity(page, job);
    seekerDisplayName = seeker.name;
    await openApplicants(page);
    const card = seekerCard(page, seeker.name);
    const msgBtn = card.getByRole('button', { name: new RegExp(`Message ${seeker.name.split(' ')[0]}`, 'i') });
    await expect(msgBtn, 'featured (free) posting must expose the Message action').toBeVisible();
    await msgBtn.click();
    const dialog = page.getByRole('dialog', { name: /new message/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('#compose-subject')).toHaveValue(new RegExp(`Regarding: ${job.title.slice(0, 15)}`));
    await expect(dialog.getByRole('button', { name: /send message/i })).toBeDisabled();
    await dialog.locator('#compose-body').fill(firstBody);
    const sent = page.waitForResponse((r) => r.url().includes('/api/employer/messages') && r.request().method() === 'POST');
    await dialog.getByRole('button', { name: /send message/i }).click();
    const res = await sent;
    const body = await res.json().catch(() => ({}));
    expect(res.status(), `POST /api/employer/messages -> ${res.status()} ${JSON.stringify(body)}`).toBe(200);
    conversationId = body.conversationId;
    await expect(dialog.getByText(/Message sent successfully/i)).toBeVisible();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    // Sent-messages tab on the dashboard lists it.
    await page.goto('/employer/dashboard?tab=messages', { waitUntil: 'domcontentloaded' });
    await page.waitForResponse((r) => r.url().includes('/api/employer/messages'));
    await expect(page.getByText(new RegExp(`Regarding: ${job.title.slice(0, 15)}`)).first()).toBeVisible();
    assertClean(collected);
    await ctx.close();
  });

  test('seeker sees the conversation in /messages and can reply', async ({ browser }) => {
    test.setTimeout(180_000);
    test.skip(!conversationId, 'no conversation was created');
    const ctx = await contextFor(browser, 'seeker');
    const page = await ctx.newPage();
    const collected = attachErrorCollectors(page);
    const convs = page.waitForResponse((r) => r.url().endsWith('/api/conversations'));
    await page.goto('/messages', { waitUntil: 'domcontentloaded' });
    const list = await (await convs).json();
    const mine = (list.conversations || []).find((c: { id: string }) => c.id === conversationId);
    expect(mine, 'seeker conversation list contains the new thread').toBeTruthy();
    expect(mine.otherUser.name).toContain(EMPLOYER_NAME);
    expect(mine.unreadCount).toBeGreaterThan(0);
    const item = page.getByText(new RegExp(`Regarding:`)).first();
    await expect(item).toBeVisible();
    const thread = page.waitForResponse((r) => r.url().includes(`/api/conversations/${conversationId}`) && r.request().method() === 'GET');
    await item.click();
    expect((await thread).status()).toBe(200);
    await expect(page.getByText(firstBody)).toBeVisible();
    const input = page.getByPlaceholder(/write a message/i);
    await expect(input).toBeVisible();
    await input.fill(replyBody);
    const reply = page.waitForResponse((r) => r.url().includes(`/api/conversations/${conversationId}`) && r.request().method() === 'POST');
    await input.press('Enter');
    const res = await reply;
    expect(res.status(), `seeker reply -> ${res.status()} ${await res.text().catch(() => '')}`).toBe(200);
    await expect(page.getByText(replyBody)).toBeVisible();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByText(/Regarding:/).first().click();
    await expect(page.getByText(replyBody)).toBeVisible();
    assertClean(collected);
    await ctx.close();
  });

  test('employer sees the reply, edits and deletes a follow-up, attaches a PDF', async ({ browser }) => {
    test.setTimeout(240_000);
    test.skip(!conversationId, 'no conversation was created');
    const ctx = await contextFor(browser, 'employer');
    const page = await ctx.newPage();
    const collected = attachErrorCollectors(page);
    await page.goto('/messages', { waitUntil: 'domcontentloaded' });
    await page.waitForResponse((r) => r.url().endsWith('/api/conversations'));
    const item = page.getByText(new RegExp(seekerDisplayName.split(' ')[0] || 'Regarding:')).first();
    await expect(item).toBeVisible();
    await item.click();
    await page.waitForResponse((r) => r.url().includes(`/api/conversations/${conversationId}`) && r.request().method() === 'GET');
    await expect(page.getByText(replyBody)).toBeVisible();
    await expect(page.getByText(firstBody)).toBeVisible();

    // Follow-up message (unread by the seeker => editable + deletable for both).
    const input = page.getByPlaceholder(/write a message/i);
    await input.fill(secondBody);
    const sent = page.waitForResponse((r) => r.url().includes(`/api/conversations/${conversationId}`) && r.request().method() === 'POST');
    await input.press('Enter');
    expect((await sent).status()).toBe(200);
    const bubble = page.getByText(secondBody, { exact: true });
    await expect(bubble).toBeVisible();
    const wrapper = bubble.locator('xpath=ancestor::div[.//button[@title="Delete message"]][1]');
    await bubble.hover();
    await wrapper.getByTitle('Edit message').click();
    const editBox = wrapper.locator('textarea');
    await expect(editBox).toHaveValue(secondBody);
    await editBox.fill(editedBody);
    const edited = page.waitForResponse((r) => r.url().includes('/edit') && r.request().method() === 'PATCH');
    await wrapper.getByRole('button', { name: /save/i }).click();
    expect((await edited).status()).toBe(200);
    await expect(page.getByText(editedBody, { exact: true })).toBeVisible();
    await expect(page.getByText('(edited)').first()).toBeVisible();

    const editedBubble = page.getByText(editedBody, { exact: true });
    const editedWrapper = editedBubble.locator('xpath=ancestor::div[.//button[@title="Delete message"]][1]');
    await editedBubble.hover();
    await editedWrapper.getByTitle('Delete message').click();
    await expect(page.getByText(/Delete message\?/i)).toBeVisible();
    const deleted = page.waitForResponse((r) => /\/api\/conversations\/.+\/messages\/.+/.test(r.url()) && r.request().method() === 'DELETE');
    await page.getByRole('button', { name: /delete for everyone|^delete$/i }).last().click();
    const delRes = await deleted;
    expect(delRes.status()).toBe(200);
    expect((await delRes.json()).deletedForBoth, 'unread follow-up is deleted for both parties').toBe(true);
    await expect(page.getByText(/Message deleted for everyone/i)).toBeVisible();
    await expect(page.getByText(editedBody, { exact: true })).toHaveCount(0);

    // PDF attachment.
    const upload = page.waitForResponse((r) => r.url().includes('/api/upload/message-attachment'));
    await page.locator('input[type="file"]').first().setInputFiles(SAMPLE_PDF);
    const upRes = await upload;
    expect(upRes.status(), `attachment upload -> ${upRes.status()} ${await upRes.text().catch(() => '')}`).toBe(200);
    await expect(page.getByText('sample-resume.pdf').first()).toBeVisible();
    const sentAttach = page.waitForResponse((r) => r.url().includes(`/api/conversations/${conversationId}`) && r.request().method() === 'POST');
    await page.locator('.msg-composer button').last().click();
    expect((await sentAttach).status()).toBe(200);
    const link = page.getByRole('link', { name: /sample-resume\.pdf/ }).first();
    await expect(link).toBeVisible();
    const href = await link.getAttribute('href');
    expect(href).toMatch(/^https?:\/\//);
    const file = await page.request.get(href!);
    expect(file.status(), `attachment signed URL -> ${file.status()}`).toBe(200);
    expect((await file.body()).subarray(0, 4).toString()).toBe('%PDF');

    // PNG attachments are rejected by the upload endpoint (documents only).
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    const pngRes = await page.request.post('/api/upload/message-attachment', { multipart: { file: { name: 'tiny.png', mimeType: 'image/png', buffer: png } } });
    expect(pngRes.status(), await pngRes.text()).toBe(400);
    const spoof = await page.request.post('/api/upload/message-attachment', { multipart: { file: { name: 'tiny.pdf', mimeType: 'application/pdf', buffer: png } } });
    expect(spoof.status(), `PNG bytes declared as PDF: ${await spoof.text()}`).toBe(400);
    assertClean(collected);
    await ctx.close();
  });

  test('seeker sees the attachment but not the deleted follow-up', async ({ browser }) => {
    test.setTimeout(180_000);
    test.skip(!conversationId, 'no conversation was created');
    const ctx = await contextFor(browser, 'seeker');
    const page = await ctx.newPage();
    const collected = attachErrorCollectors(page);
    await page.goto('/messages', { waitUntil: 'domcontentloaded' });
    await page.waitForResponse((r) => r.url().endsWith('/api/conversations'));
    await page.getByText(/Regarding:/).first().click();
    const thread = await (await page.waitForResponse((r) => r.url().includes(`/api/conversations/${conversationId}`) && r.request().method() === 'GET')).json();
    const bodies = (thread.messages as Array<{ body: string; attachmentName: string | null; isDeleted?: boolean }>);
    expect(bodies.some((m) => m.body === firstBody)).toBe(true);
    expect(bodies.some((m) => m.body === replyBody)).toBe(true);
    expect(bodies.some((m) => m.body === editedBody || m.body === secondBody), 'deleted-for-both follow-up must not reach the seeker').toBe(false);
    expect(bodies.some((m) => m.attachmentName === 'sample-resume.pdf')).toBe(true);
    await expect(page.getByRole('link', { name: /sample-resume\.pdf/ }).first()).toBeVisible();
    await expect(page.getByText(editedBody, { exact: true })).toHaveCount(0);
    assertClean(collected);
    await ctx.close();
  });

  test('employer message API validates recipient and body', async ({ browser }) => {
    const ctx = await contextFor(browser, 'employer');
    const page = await ctx.newPage();
    const collected = attachErrorCollectors(page);
    const job = await ensureEmployerJob(page);
    const missing = await apiFetch(page, '/api/employer/messages', { method: 'POST', body: { subject: 'x' } });
    expect(missing.status, missing.text).toBe(400);
    const ghost = await apiFetch(page, '/api/employer/messages', { method: 'POST', body: { recipientId: 'ghost', subject: 'x', body: 'y', jobId: job.id } });
    expect(ghost.status, ghost.text).toBe(404);
    const list = await apiFetch<CandidateList>(page, '/api/employer/candidates?limit=1');
    const tooLong = await apiFetch(page, '/api/employer/messages', { method: 'POST', body: { recipientId: list.json!.candidates[0].id, subject: 'x', body: 'y'.repeat(2001), jobId: job.id } });
    expect(tooLong.status, tooLong.text).toBe(400);
    assertClean(collected);
    await ctx.close();
  });

  test('employer message API rejects non-string subject/body with 400, not 500', async ({ browser }) => {
    test.setTimeout(180_000);
    const ctx = await contextFor(browser, 'employer');
    const page = await ctx.newPage();
    const collected = attachErrorCollectors(page);
    const job = await ensureEmployerJob(page);
    await ensureSeekerApplied(browser, job);
    // Send to the applicant (an existing conversation makes this a free reply, so no InMail credit is spent).
    const seeker = await getSeekerIdentity(page, job);
    const list = await apiFetch<{ applicants: Array<{ candidate: { id: string; name: string } }> }>(page, '/api/employer/applicants');
    const app = (list.json?.applicants || []).find((a) => a.candidate.id === seeker.id);
    expect(app, 'seeker application present').toBeTruthy();
    const outcomes: string[] = [];
    const numericBody = await apiFetch(page, '/api/employer/messages', { method: 'POST', body: { recipientId: app!.candidate.id, subject: `E2E ${RUN_TAG} type probe`, body: 12345, jobId: job.id } });
    outcomes.push(`body as number -> ${numericBody.status} ${numericBody.text.slice(0, 120)}`);
    const objectSubject = await apiFetch(page, '/api/employer/messages', { method: 'POST', body: { recipientId: app!.candidate.id, subject: { x: 1 }, body: `E2E ${RUN_TAG} type probe`, jobId: job.id } });
    outcomes.push(`subject as object -> ${objectSubject.status} ${objectSubject.text.slice(0, 120)}`);
    const objectRecipient = await apiFetch(page, '/api/employer/messages', { method: 'POST', body: { recipientId: { in: ['a'] }, subject: 'x', body: 'y', jobId: job.id } });
    outcomes.push(`recipientId as object -> ${objectRecipient.status} ${objectRecipient.text.slice(0, 120)}`);
    const malformed = await apiFetchRaw(page, '/api/employer/messages', { method: 'POST', rawBody: '{"recipientId": ' });
    outcomes.push(`malformed JSON -> ${malformed.status} ${malformed.text.slice(0, 120)}`);
    expect(outcomes.filter((o) => / -> 5\d\d /.test(o)), `bad message bodies must not 5xx:\n${outcomes.join('\n')}`).toEqual([]);
    expect(outcomes.filter((o) => / -> 400 /.test(o)).length, `expected validation errors:\n${outcomes.join('\n')}`).toBe(outcomes.length);
    collected.serverErrors.length = 0; // already asserted above with detail
    assertClean(collected);
    await ctx.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 8. AI talent search
// ═══════════════════════════════════════════════════════════════════════

test.describe('employer-talent: AI talent search', () => {
  test.skip(!HAS_EMPLOYER, 'E2E employer creds not set');

  test('/employer/talent-search redirects into the talent pool with ai=1', async ({ browser }) => {
    const ctx = await contextFor(browser, 'employer');
    const page = await ctx.newPage();
    const collected = attachErrorCollectors(page);
    await page.goto('/employer/talent-search', { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/employer\/candidates\?ai=1/, { waitUntil: 'domcontentloaded' });
    await expect(page.getByPlaceholder(/Describe the candidate you need/i).first()).toBeVisible();
    assertClean(collected);
    await ctx.close();
  });

  test('one AI query returns ranked results or an honest disabled/limit state', async ({ browser }) => {
    test.setTimeout(180_000);
    const ctx = await contextFor(browser, 'employer');
    const page = await ctx.newPage();
    const collected = attachErrorCollectors(page);
    await page.goto('/employer/candidates', { waitUntil: 'domcontentloaded' });
    await page.waitForResponse(isCandidatesList);
    const box = page.getByPlaceholder(/Describe the candidate you need/i).first();
    await box.fill('experienced telehealth PMHNP licensed in Texas who treats ADHD');
    const search = page.waitForResponse((r) => r.url().includes('/api/employer/talent/search'), { timeout: 90_000 });
    await page.getByRole('button', { name: /AI Search/i }).first().click();
    const res = await search;
    const text = await res.text().catch(() => '');
    expect([200, 404, 429, 503], `talent search -> ${res.status()} ${text.slice(0, 200)}`).toContain(res.status());
    if (res.status() === 200) {
      const data = JSON.parse(text);
      expect(Array.isArray(data.candidates)).toBe(true);
      if (data.candidates.length > 0) {
        expect(await page.locator('a[href^="/employer/candidates/"]').count()).toBeGreaterThan(0);
        await expect(page.getByText(/AI-ranked candidate/i).first()).toBeVisible();
        for (const c of data.candidates) {
          expect(typeof c.reason).toBe('string');
          expect(c.matchPercent).toBeGreaterThanOrEqual(0);
        }
      } else {
        await expect(page.getByText(/No candidates found/i)).toBeVisible();
      }
    } else if (res.status() === 404) {
      await expect(page.getByText(/AI search isn.t enabled on your account yet/i)).toBeVisible();
    } else if (res.status() === 429) {
      await expect(page.getByText(/limit/i).first()).toBeVisible();
    } else {
      await expect(page.getByText(/AI search is temporarily unavailable/i)).toBeVisible();
    }
    // Validation: too-short query and out-of-range k must be 400 when enabled (404 when disabled).
    const bad = await apiFetch(page, '/api/employer/talent/search', { method: 'POST', body: { query: 'ab', k: 999 } });
    expect([400, 404], bad.text.slice(0, 200)).toContain(bad.status);
    assertClean(collected);
    await ctx.close();
  });
});
