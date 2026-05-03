import { test, expect } from '@playwright/test';

/**
 * Admin user journey tests.
 *
 * Admin routes (/admin/*) are noindex + auth-gated. These tests verify:
 *   - unauthenticated requests redirect away from /admin
 *   - authenticated admin can reach core admin pages (analytics, jobs, users, email)
 *
 * Auth-required tests use E2E_ADMIN_EMAIL / E2E_ADMIN_PASS — skipped if not set.
 *
 * Mutation tests (bulk job actions, send broadcast email) are .skip()ed against
 * production for obvious reasons.
 */

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const ADMIN_PASS = process.env.E2E_ADMIN_PASS;
const HAS_AUTH = Boolean(ADMIN_EMAIL && ADMIN_PASS);

// ── Unauthenticated checks ──────────────────────────────────────────────────

test('admin: /admin redirects unauthenticated user', async ({ page }) => {
  await page.goto('/admin');
  // Should not stay on /admin without auth
  const url = page.url();
  expect(url).not.toMatch(/\/admin\/?$/);
});

test('admin: /admin/users is protected', async ({ page }) => {
  await page.goto('/admin/users');
  expect(page.url()).not.toMatch(/\/admin\/users/);
});

test('admin: /admin/email is protected', async ({ page }) => {
  await page.goto('/admin/email');
  expect(page.url()).not.toMatch(/\/admin\/email/);
});

// ── Authenticated tests ─────────────────────────────────────────────────────

test.describe('authenticated admin', () => {
  test.skip(!HAS_AUTH, 'E2E_ADMIN_EMAIL / E2E_ADMIN_PASS not set');

  test('can log in and reach /admin dashboard', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin');
    expect(page.url()).toContain('/admin');
  });

  test('can view /admin/analytics', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/analytics');
    expect(page.url()).toContain('/admin/analytics');
  });

  test('can view /admin/jobs', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/jobs');
    expect(page.url()).toContain('/admin/jobs');
  });

  test('can view /admin/users', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/users');
    expect(page.url()).toContain('/admin/users');
  });

  test('can view /admin/email', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/email');
    expect(page.url()).toContain('/admin/email');
  });

  test('can view /admin/blog', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/blog');
    expect(page.url()).toContain('/admin/blog');
  });
});

// ── Mutation tests (skipped against production) ─────────────────────────────

test.describe('admin mutations (skipped against production)', () => {
  test.skip(
    !process.env.PLAYWRIGHT_BASE_URL || process.env.PLAYWRIGHT_BASE_URL.includes('pmhnphiring.com'),
    'Mutation tests against admin endpoints can affect real users — only run against staging'
  );

  test('can bulk-unpublish jobs', async () => {
    // TODO
  });

  test('can send a test broadcast email', async () => {
    // TODO
  });
});

// ── Helpers ─────────────────────────────────────────────────────────────────

async function loginAsAdmin(page: import('@playwright/test').Page) {
  // Admins log in via the same /login flow as job seekers; role check happens server-side
  await page.goto('/login');
  await page.fill('input[type="email"]', ADMIN_EMAIL!);
  await page.fill('input[type="password"]', ADMIN_PASS!);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
}
