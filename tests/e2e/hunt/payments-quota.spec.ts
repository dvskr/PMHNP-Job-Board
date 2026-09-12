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

  test('company name lock is bypassable via PATCH /api/auth/profile (settings refuses, profile accepts)', async ({ page }) => {
    await employerLogin(page);

    const before = await page.request.get('/api/employer/settings');
    expect(before.status()).toBe(200);
    const beforeJson = await before.json();
    const originalCompany: string | null = beforeJson.profile?.company ?? null;
    console.log('ORIGINAL company =', JSON.stringify(originalCompany));

    // 1. Settings route refuses a rename (documented lock)
    const viaSettings = await page.request.patch('/api/employer/settings', {
      data: { company: 'Probe Rename Org' },
      headers: { origin: 'http://localhost:3000' },
    });
    console.log('settings PATCH status =', viaSettings.status(), await viaSettings.text());

    // 2. Generic profile route accepts the same rename
    const viaProfile = await page.request.patch('/api/auth/profile', {
      data: { company: 'Probe Rename Org' },
      headers: { origin: 'http://localhost:3000' },
    });
    const viaProfileJson = await viaProfile.json().catch(() => ({}));
    console.log('auth/profile PATCH status =', viaProfile.status(), 'company =', JSON.stringify(viaProfileJson.company));

    const after = await page.request.get('/api/employer/settings');
    const afterJson = await after.json();
    console.log('settings after company =', JSON.stringify(afterJson.profile?.company));

    const quota = await page.request.get('/api/employer/post-price');
    console.log('post-price after rename =', await quota.text());

    // Restore (always)
    const restore = await page.request.patch('/api/auth/profile', {
      data: { company: originalCompany ?? '' },
      headers: { origin: 'http://localhost:3000' },
    });
    const restoreJson = await restore.json().catch(() => ({}));
    console.log('restore status =', restore.status(), 'company =', JSON.stringify(restoreJson.company));

    expect(viaSettings.status()).toBe(409);
    expect(viaProfile.status()).toBe(200);
    expect(afterJson.profile?.company).toBe('Probe Rename Org');
    expect(restoreJson.company).toBe(originalCompany);
  });

  test('POST /api/auth/profile re-call also rewrites company for an existing employer', async ({ page }) => {
    await employerLogin(page);
    const before = await page.request.get('/api/employer/settings');
    const originalCompany: string | null = (await before.json()).profile?.company ?? null;

    const res = await page.request.post('/api/auth/profile', {
      data: { role: 'employer', company: 'Probe Signup Rename' },
      headers: { origin: 'http://localhost:3000' },
    });
    const json = await res.json().catch(() => ({}));
    console.log('auth/profile POST status =', res.status(), 'company =', JSON.stringify(json.company), 'role =', json.role);

    const restore = await page.request.post('/api/auth/profile', {
      data: { role: 'employer', company: originalCompany ?? '' },
      headers: { origin: 'http://localhost:3000' },
    });
    const restoreJson = await restore.json().catch(() => ({}));
    console.log('restore status =', restore.status(), 'company =', JSON.stringify(restoreJson.company));

    expect(res.status()).toBe(200);
    expect(json.company).toBe('Probe Signup Rename');
    expect(restoreJson.company).toBe(originalCompany);
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
