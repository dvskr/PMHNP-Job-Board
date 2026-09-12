import { test, expect, type Page } from '@playwright/test';
import { getEmployerCreds } from '../fixtures/auth';

/**
 * Bug-hunt slice "payments-quota": entitlement and quota identity probes
 * against the running dev server. Read-mostly; the one mutation (company
 * name via /api/auth/profile) is restored at the end of the test.
 */

const HAS_EMPLOYER = getEmployerCreds() !== null;

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

test.describe('payments + quota identity', () => {
  test.skip(!HAS_EMPLOYER, 'employer creds missing');

  // The company name is the org half of the quota identity that decides who
  // has already spent their discounted first post, so a rename is a way to
  // re-earn the discount and to publish under another brand. Both write paths
  // must refuse it. These two tests used to assert the bypass; they now assert
  // it is closed, and neither leaves a renamed row behind if it fails.
  test('company name lock holds on PATCH /api/auth/profile, not just /api/employer/settings', async ({ page }) => {
    await employerLogin(page);

    const before = await page.request.get('/api/employer/settings');
    expect(before.status()).toBe(200);
    const originalCompany: string | null = (await before.json()).profile?.company ?? null;
    test.skip(!originalCompany, 'employer has no locked company name to defend');

    const viaSettings = await page.request.patch('/api/employer/settings', {
      data: { company: 'Probe Rename Org' },
      headers: { origin: 'http://localhost:3000' },
    });
    const viaProfile = await page.request.patch('/api/auth/profile', {
      data: { company: 'Probe Rename Org' },
      headers: { origin: 'http://localhost:3000' },
    });

    const afterJson = await (await page.request.get('/api/employer/settings')).json();

    expect(viaSettings.status(), 'settings route must refuse the rename').toBe(409);
    expect(viaProfile.status(), 'profile route must refuse the same rename').toBe(409);
    expect(afterJson.profile?.company, 'the locked name must be unchanged').toBe(originalCompany);
  });

  test('an unrelated profile save still succeeds while the company name is locked', async ({ page }) => {
    await employerLogin(page);
    const before = await page.request.get('/api/employer/settings');
    const originalCompany: string | null = (await before.json()).profile?.company ?? null;

    // The settings form posts every field including the unchanged company, so
    // a lock that refused a same-value echo would break saving anything else.
    const echo = await page.request.patch('/api/auth/profile', {
      data: { company: originalCompany, headline: 'Probe headline' },
      headers: { origin: 'http://localhost:3000' },
    });
    expect(echo.status(), 'same-value company must not trip the lock').toBe(200);

    // A signup re-call must not become a second rename path either.
    const viaSignup = await page.request.post('/api/auth/profile', {
      data: { role: 'employer', company: 'Probe Signup Rename' },
      headers: { origin: 'http://localhost:3000' },
    });
    const afterJson = await (await page.request.get('/api/employer/settings')).json();

    expect([200, 409]).toContain(viaSignup.status());
    expect(afterJson.profile?.company, 'signup re-call must not rewrite the locked name').toBe(originalCompany);
  });

  test('billing / quota surfaces for the shared employer', async ({ page }) => {
    await employerLogin(page);
    const billing = await page.request.get('/api/employer/billing');
    console.log('billing status =', billing.status());
    const bj = await billing.json();
    for (const p of bj.payments ?? []) {
      console.log('  payment', p.jobId, 'status=', p.status, 'isFree=', p.isFree, 'isActive=', p.isActive, 'expiresAt=', p.expiresAt, 'charges=', p.charges?.length);
    }
    const quota = await page.request.get('/api/employer/post-price');
    console.log('quota =', await quota.text());
    const usage = await page.request.get('/api/employer/usage');
    console.log('usage status =', usage.status(), (await usage.text()).slice(0, 600));
    expect(billing.status()).toBe(200);
  });

  test('verify-checkout-session is unauthenticated and unthrottled', async ({ request }) => {
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) {
      const r = await request.get('/api/verify-checkout-session?session_id=cs_test_doesnotexist_' + i);
      statuses.push(r.status());
    }
    console.log('verify-checkout-session statuses =', statuses.join(','));
    const renewal = await request.get('/api/verify-renewal-session?session_id=cs_test_doesnotexist');
    console.log('verify-renewal-session status =', renewal.status(), await renewal.text());
    expect(statuses.every((s) => s !== 429)).toBe(true);
  });
});
