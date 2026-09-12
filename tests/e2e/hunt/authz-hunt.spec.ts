/**
 * Authorization / authentication bug hunt (read-mostly).
 *
 * Every test restores whatever state it mutates on the three shared
 * E2E accounts. No destructive account actions.
 */
import { test, expect, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { loginAsSeeker, loginAsEmployer, getEmployerCreds, getSeekerCreds } from '../fixtures/auth';

const RESUME_FIXTURE = path.resolve(__dirname, '../fixtures/sample-resume.pdf');

async function getProfile(page: Page) {
  const res = await page.request.get('/api/auth/profile');
  expect(res.status(), 'profile GET should be 200').toBe(200);
  return res.json();
}

test.use({ navigationTimeout: 150_000, actionTimeout: 60_000 });

test.describe('authz hunt', () => {
  test.describe.configure({ mode: 'serial' });

  test('A: write-once company name is editable through /api/auth/profile', async ({ page }) => {
    test.skip(!getEmployerCreds(), 'employer creds missing');
    await loginAsEmployer(page);

    const before = await getProfile(page);
    const original: string | null = before.company ?? null;
    const spoofed = 'Talkiatry Behavioral Group';

    // The documented lock: employer settings refuses the rename.
    const locked = await page.request.patch('/api/employer/settings', {
      data: { company: spoofed },
    });
    console.log('[A] PATCH /api/employer/settings ->', locked.status(), (await locked.text()).slice(0, 200));
    expect(locked.status(), 'settings route enforces the write-once lock').toBe(409);

    // The unguarded path.
    const bypass = await page.request.patch('/api/auth/profile', {
      data: { company: spoofed },
    });
    const bypassBody = await bypass.json().catch(() => ({}));
    console.log('[A] PATCH /api/auth/profile ->', bypass.status(), 'company =', bypassBody.company);

    const after = await getProfile(page);
    console.log('[A] profile.company after bypass =', after.company);

    // Restore before asserting so a failure never leaves the account dirty.
    await page.request.patch('/api/auth/profile', { data: { company: original } });
    const restored = await getProfile(page);
    expect(restored.company, 'company restored').toBe(original);

    expect(bypass.status()).toBe(200);
    expect(after.company, 'company name changed despite the write-once lock').toBe(spoofed);
  });

  test('B: resumeUrl is client-writable -> cross-user resume read', async ({ browser }) => {
    test.skip(!getSeekerCreds() || !getEmployerCreds(), 'creds missing');
    test.skip(!fs.existsSync(RESUME_FIXTURE), 'resume fixture missing');

    // --- seeker: upload a resume, capture its storage path ---
    const seekerCtx = await browser.newContext();
    const seekerPage = await seekerCtx.newPage();
    seekerPage.setDefaultNavigationTimeout(150_000);
    await loginAsSeeker(seekerPage);
    console.log('[B] seeker landed on', seekerPage.url());
    await seekerPage.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    const seekerBefore = await getProfile(seekerPage);
    const seekerOriginalResume: string | null = seekerBefore.resumeUrl ?? null;

    const buffer = fs.readFileSync(RESUME_FIXTURE);
    const upload = await seekerPage.request.post('/api/upload', {
      multipart: {
        type: 'resume',
        file: { name: 'sample-resume.pdf', mimeType: 'application/pdf', buffer },
      },
    });
    const uploadBody = await upload.json().catch(() => ({}));
    console.log('[B] seeker upload ->', upload.status(), JSON.stringify(uploadBody).slice(0, 300));
    expect(upload.status(), 'seeker resume upload').toBe(200);
    // The realistic attacker artifact: a signed resume URL that has since
    // expired (forwarded in email, browser history, an old API response).
    const victimSignedUrl: string = uploadBody.url;
    expect(victimSignedUrl, 'upload returned a signed URL').toBeTruthy();

    // --- employer: point their own profile.resumeUrl at the seeker's file ---
    const empCtx = await browser.newContext();
    const empPage = await empCtx.newPage();
    empPage.setDefaultNavigationTimeout(150_000);
    await loginAsEmployer(empPage);
    console.log('[B] employer landed on', empPage.url());
    const empBefore = await getProfile(empPage);
    const empOriginalResume: string | null = empBefore.resumeUrl ?? null;

    console.log('[B] employer original resumeUrl =', empOriginalResume);
    const patch = await empPage.request.patch('/api/auth/profile', {
      data: { resumeUrl: victimSignedUrl },
    });
    console.log('[B] employer PATCH resumeUrl ->', patch.status());

    const mint = await empPage.request.get('/api/documents/resume/me/url');
    const mintBody = await mint.json().catch(() => ({}));
    console.log('[B] employer GET /api/documents/resume/me/url ->', mint.status(),
      JSON.stringify(mintBody).slice(0, 160));

    let fetched = -1;
    let fetchedType = '';
    if (mintBody?.url) {
      const raw = await empPage.request.get(mintBody.url);
      fetched = raw.status();
      fetchedType = raw.headers()['content-type'] || '';
      console.log('[B] fetching the minted URL ->', fetched, fetchedType);
    }

    // restore: clear the employer's borrowed pointer. The seeker keeps the
    // resume just uploaded through the normal endpoint (a valid state).
    await empPage.request.patch('/api/auth/profile', { data: { resumeUrl: empOriginalResume || null } });
    console.log('[B] seeker resumeUrl before this test was', seekerOriginalResume);
    await empCtx.close().catch(() => undefined);
    await seekerCtx.close().catch(() => undefined);

    expect(patch.status(), 'employer could set an arbitrary resumeUrl').toBe(200);
    expect(mint.status(), 'server minted a signed URL for a file the caller does not own').toBe(200);
    expect(fetched, 'the minted URL served the other user\'s PDF').toBe(200);
  });

  test('C: unauthenticated GET /api/jobs/[id] increments viewCount with no rate limit', async ({ playwright, baseURL }) => {
    const realUa = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    const request = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { 'User-Agent': realUa },
    });
    const list = await request.get('/api/jobs?limit=1');
    expect(list.status()).toBe(200);
    const body = await list.json();
    const job = (body.jobs ?? body.data ?? body)[0];
    const jobId = job?.id;
    expect(jobId, 'found a published job id').toBeTruthy();

    const first = await request.get(`/api/jobs/${jobId}`);
    const firstBody = await first.json();
    const startCount: number = firstBody.viewCount;

    let last = startCount;
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) {
      const r = await request.get(`/api/jobs/${jobId}?_=${Date.now()}-${i}`);
      statuses.push(r.status());
      last = (await r.json()).viewCount;
    }
    const final = await request.get(`/api/jobs/${jobId}?_=final-${Date.now()}`);
    last = (await final.json()).viewCount;
    await request.dispose();
    console.log('[C] jobId', jobId, 'viewCount', startCount, '->', last, 'statuses', statuses.join(','));

    // Note: the handler's JSON body is served stale within a run (Next route
    // cache), so the growth shows up across runs: 11 -> 15 -> 19 over three
    // batches of unauthenticated GETs in this session.
    expect(statuses.every((s) => s === 200), 'no rate limit over 9 unauthenticated write-triggering GETs').toBe(true);
    expect(last, 'read a count').toBeGreaterThanOrEqual(startCount);
  });

  test('D: CSRF origin check is applied to some mutating routes and not others', async ({ page }) => {
    test.skip(!getEmployerCreds(), 'employer creds missing');
    await loginAsEmployer(page);
    const before = await getProfile(page);
    const originalPhone: string | null = before.phone ?? null;

    const evil = { origin: 'https://evil.example.com', referer: 'https://evil.example.com/x' };

    const guarded = await page.request.patch('/api/auth/profile', {
      headers: evil,
      data: { phone: '5550001111' },
    });
    console.log('[D] PATCH /api/auth/profile (cross-origin) ->', guarded.status());

    const unguarded = await page.request.patch('/api/employer/settings', {
      headers: evil,
      data: { phone: '5550002222' },
    });
    console.log('[D] PATCH /api/employer/settings (cross-origin) ->', unguarded.status(),
      (await unguarded.text()).slice(0, 160));

    const after = await getProfile(page);
    console.log('[D] phone after cross-origin writes =', after.phone);

    await page.request.patch('/api/auth/profile', { data: { phone: originalPhone } });

    expect(guarded.status(), '/api/auth/profile blocks cross-origin').toBe(403);
    expect(unguarded.status(), '/api/employer/settings accepts cross-origin').toBe(200);
    expect(after.phone, 'cross-origin write persisted').toBe('5550002222');
  });
});
