import { test, expect } from '@playwright/test';

/**
 * Employer user journey tests.
 *
 * Read-only tests run unconditionally.
 * Auth-required tests use credentials from env (E2E_EMPLOYER_EMAIL / E2E_EMPLOYER_PASS)
 * and skip if not provided.
 *
 * Mutation tests (post-job, message candidate) are .skip()ed against production.
 */

const EMPLOYER_EMAIL = process.env.E2E_EMPLOYER_EMAIL;
const EMPLOYER_PASS = process.env.E2E_EMPLOYER_PASS;
const HAS_AUTH = Boolean(EMPLOYER_EMAIL && EMPLOYER_PASS);

// ── Read-only tests ─────────────────────────────────────────────────────────

test('employer: /for-employers page loads with CTA', async ({ page }) => {
  await page.goto('/for-employers');
  // Should have at least one "Post a job" / "Get started" CTA
  const ctas = page.locator('a, button').filter({ hasText: /post.*job|get started|sign up|start hiring/i });
  expect(await ctas.count()).toBeGreaterThan(0);
});

test('employer: /pricing page lists tiers', async ({ page }) => {
  await page.goto('/pricing');
  const bodyText = await page.locator('body').innerText();
  // Must have at least one dollar sign or "free"/"$0" indicator
  expect(bodyText).toMatch(/\$|free|month|year/i);
});

test('employer: /post-job page renders the form', async ({ page }) => {
  await page.goto('/post-job');
  // Either the form is visible OR it redirects to login first — both acceptable
  await page.waitForLoadState('domcontentloaded');
  const url = page.url();
  expect(url).toMatch(/\/post-job|\/login|\/employer/);
});

test('employer: /employer/login renders auth form', async ({ page }) => {
  await page.goto('/employer/login');
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

test('employer: /employer/signup renders signup form', async ({ page }) => {
  await page.goto('/employer/signup');
  await expect(page.locator('input[type="email"]')).toBeVisible();
});

// ── Auth-required tests ─────────────────────────────────────────────────────

test.describe('authenticated employer', () => {
  test.skip(!HAS_AUTH, 'E2E_EMPLOYER_EMAIL / E2E_EMPLOYER_PASS not set');

  test('can log in via /employer/login', async ({ page }) => {
    await page.goto('/employer/login');
    await page.fill('input[type="email"]', EMPLOYER_EMAIL!);
    await page.fill('input[type="password"]', EMPLOYER_PASS!);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.startsWith('/employer/login'), { timeout: 15_000 });
    expect(page.url()).not.toContain('/employer/login');
  });

  test('can access employer candidates list', async ({ page }) => {
    await loginAsEmployer(page);
    await page.goto('/employer/candidates');
    expect(page.url()).toContain('/employer/candidates');
  });

  test('can access employer settings', async ({ page }) => {
    await loginAsEmployer(page);
    await page.goto('/employer/settings');
    expect(page.url()).toContain('/employer/settings');
  });
});

// ── Mutation tests (skipped against production) ─────────────────────────────

test.describe('employer mutations (skipped against production)', () => {
  test.skip(
    !process.env.PLAYWRIGHT_BASE_URL || process.env.PLAYWRIGHT_BASE_URL.includes('pmhnphiring.com'),
    'Mutation tests pollute production data — enable only against preview/staging'
  );

  test('can post a job (full checkout flow)', async () => {
    // TODO: implement against staging
  });

  test('can message an applicant', async () => {
    // TODO: implement against staging
  });

  test('can update employer settings', async () => {
    // TODO: implement against staging
  });
});

// ── Helpers ─────────────────────────────────────────────────────────────────

async function loginAsEmployer(page: import('@playwright/test').Page) {
  await page.goto('/employer/login');
  await page.fill('input[type="email"]', EMPLOYER_EMAIL!);
  await page.fill('input[type="password"]', EMPLOYER_PASS!);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith('/employer/login'), { timeout: 15_000 });
}
