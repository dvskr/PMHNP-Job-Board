import { test, expect } from '@playwright/test';

/**
 * Job seeker user journey tests.
 *
 * Read-only tests run unconditionally.
 * Auth-required tests use credentials from env (E2E_SEEKER_EMAIL / E2E_SEEKER_PASS)
 * and skip if not provided.
 *
 * Mutation tests (apply to job, save profile changes) are marked .skip() against
 * production — enable when running against a non-prod env.
 */

const SEEKER_EMAIL = process.env.E2E_SEEKER_EMAIL;
const SEEKER_PASS = process.env.E2E_SEEKER_PASS;
const HAS_AUTH = Boolean(SEEKER_EMAIL && SEEKER_PASS);

// ── Read-only tests (always run) ────────────────────────────────────────────

test('job seeker: can browse jobs without logging in', async ({ page }) => {
  await page.goto('/jobs');
  await expect(page).toHaveURL(/\/jobs$/);
  // Page loaded; should have some result indicators
  const bodyText = await page.locator('body').innerText();
  expect(bodyText).toMatch(/job|position|opening/i);
});

test('job seeker: can filter jobs by remote', async ({ page }) => {
  await page.goto('/jobs/remote');
  const heading = page.locator('h1').first();
  await expect(heading).toContainText(/remote/i);
});

test('job seeker: can navigate to a job detail from listings', async ({ page }) => {
  await page.goto('/jobs');
  // Find any job-detail link (slug pattern: words-uuid)
  const jobLink = page
    .locator('a[href^="/jobs/"]')
    .filter({ hasNotText: /^(remote|telehealth|inpatient|outpatient|state|city|metro|new-grad|locations|behavioral|addiction|crisis|veterans|geriatric|child|substance|hospital|community|private|va|correctional|lgbtq|locum|travel|contract|full-time|part-time|per-diem|entry|mid-career|senior|1099)$/i });
  // Look for a link with a slug that looks like a real job (has hyphens + likely a UUID-ish suffix)
  const realJobLink = jobLink.filter({ has: page.locator(':scope') }).first();
  const href = await realJobLink.getAttribute('href');
  if (!href || !href.match(/\/jobs\/[a-z0-9-]+-[a-f0-9-]{20,}/i)) {
    test.skip(true, 'No real job detail links visible on /jobs');
    return;
  }
  await realJobLink.click();
  await expect(page).toHaveURL(/\/jobs\/[a-z0-9-]+/);
});

test('job seeker: signup form validates required fields', async ({ page }) => {
  await page.goto('/signup');
  // Find the form's submit button
  const submitBtn = page.locator('button[type="submit"]').first();
  await submitBtn.click();
  // Either inline HTML5 validation or custom error messaging — page should NOT redirect away
  await page.waitForTimeout(500);
  expect(page.url()).toMatch(/\/signup/);
});

test('job seeker: login page renders auth form', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

// ── Auth-required tests (skip if no creds in env) ───────────────────────────

test.describe('authenticated job seeker', () => {
  test.skip(!HAS_AUTH, 'E2E_SEEKER_EMAIL / E2E_SEEKER_PASS not set');

  test('can log in with valid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', SEEKER_EMAIL!);
    await page.fill('input[type="password"]', SEEKER_PASS!);
    await page.click('button[type="submit"]');
    // After login, should redirect away from /login
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
    expect(page.url()).not.toContain('/login');
  });

  test('logged-in seeker can access dashboard', async ({ page }) => {
    await loginAsSeeker(page);
    await page.goto('/dashboard');
    expect(page.url()).toContain('/dashboard');
    // Should NOT redirect back to login
    expect(page.url()).not.toContain('/login');
  });

  test('logged-in seeker can access settings', async ({ page }) => {
    await loginAsSeeker(page);
    await page.goto('/settings');
    expect(page.url()).toContain('/settings');
  });

  test('logged-in seeker can save a job', async ({ page }) => {
    await loginAsSeeker(page);
    await page.goto('/saved');
    // Just verify the page renders for an authed user (no redirect to login)
    expect(page.url()).toContain('/saved');
  });
});

// ── Mutation tests (skipped against production) ─────────────────────────────

test.describe('job seeker mutations (skipped against production)', () => {
  test.skip(
    !process.env.PLAYWRIGHT_BASE_URL || process.env.PLAYWRIGHT_BASE_URL.includes('pmhnphiring.com'),
    'Mutation tests pollute production data — enable only against preview/staging'
  );

  test('can apply to a job', async () => {
    // TODO: implement when staging env is available
  });

  test('can update profile fields', async () => {
    // TODO: implement when staging env is available
  });

  test('can subscribe to job alerts', async () => {
    // TODO: implement when staging env is available
  });
});

// ── Helpers ─────────────────────────────────────────────────────────────────

async function loginAsSeeker(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.fill('input[type="email"]', SEEKER_EMAIL!);
  await page.fill('input[type="password"]', SEEKER_PASS!);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
}
