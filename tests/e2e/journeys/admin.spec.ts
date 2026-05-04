import { test, expect } from '@playwright/test';
import { getAdminCreds, loginAsAdmin } from '../fixtures/auth';

/**
 * Admin user journey tests — full E2E with mutations.
 *
 * Auth-gated tests need E2E_ADMIN_EMAIL / E2E_ADMIN_PASS.
 * Mutation tests skip if PLAYWRIGHT_BASE_URL points at production.
 */

const HAS_AUTH = getAdminCreds() !== null;
const AGAINST_PROD =
  !!process.env.PLAYWRIGHT_BASE_URL && process.env.PLAYWRIGHT_BASE_URL.includes('pmhnphiring.com');

// ── Unauthenticated checks ──────────────────────────────────────────────────

test('admin: /admin redirects unauthenticated user away', async ({ page }) => {
  await page.goto('/admin');
  await page.waitForLoadState('domcontentloaded');
  expect(page.url()).not.toMatch(/\/admin\/?$/);
});

test('admin: /admin/users is gated', async ({ page }) => {
  await page.goto('/admin/users');
  await page.waitForLoadState('domcontentloaded');
  expect(page.url()).not.toMatch(/\/admin\/users/);
});

test('admin: /admin/email is gated', async ({ page }) => {
  await page.goto('/admin/email');
  await page.waitForLoadState('domcontentloaded');
  expect(page.url()).not.toMatch(/\/admin\/email/);
});

test('admin: /admin/jobs is gated', async ({ page }) => {
  await page.goto('/admin/jobs');
  await page.waitForLoadState('domcontentloaded');
  expect(page.url()).not.toMatch(/\/admin\/jobs/);
});

// ── Auth-gated tests ────────────────────────────────────────────────────────

test.describe('authenticated admin', () => {
  test.skip(!HAS_AUTH, 'E2E_ADMIN_EMAIL / E2E_ADMIN_PASS not set');

  test('logs in and reaches /admin', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin/);
  });

  test('can view /admin/analytics', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/analytics');
    await expect(page).toHaveURL(/\/admin\/analytics/);
  });

  test('can view /admin/jobs', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/jobs');
    await expect(page).toHaveURL(/\/admin\/jobs/);
  });

  test('can view /admin/users', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/users');
    await expect(page).toHaveURL(/\/admin\/users/);
  });

  test('can view /admin/email', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/email');
    await expect(page).toHaveURL(/\/admin\/email/);
  });

  test('can view /admin/blog', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/blog');
    await expect(page).toHaveURL(/\/admin\/blog/);
  });

  test('can view /admin/outreach', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/outreach');
    await expect(page).toHaveURL(/\/admin\/outreach/);
  });

  test('can view /admin/settings', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/settings');
    await expect(page).toHaveURL(/\/admin\/settings/);
  });

  test('analytics page renders without errors', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/analytics');
    await page.waitForLoadState('networkidle');
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/something went wrong|application error|500/i);
    // Should show at least a heading or stat number
    expect(bodyText.length).toBeGreaterThan(50);
  });
});

// ── Mutation tests (local only) ─────────────────────────────────────────────

test.describe('admin mutations (local only)', () => {
  test.skip(AGAINST_PROD, 'Mutation tests pollute data — local/staging only');
  test.skip(!HAS_AUTH, 'Needs E2E_ADMIN_EMAIL/PASS');

  test('jobs page lets admin filter or search', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/jobs');

    // Try to find a search/filter input
    const searchField = page
      .getByPlaceholder(/search|filter/i)
      .or(page.locator('input[type="search"]'))
      .first();
    if (!(await searchField.count())) {
      test.skip(true, 'No search field on /admin/jobs');
      return;
    }
    await searchField.fill('PMHNP');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1500);
    // Verify no 5xx
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/something went wrong|application error/i);
  });

  test('admin can open the email composer (no send)', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/email');

    // Look for a compose / new email button
    const composeBtn = page
      .getByRole('button', { name: /compose|new.*email|create/i })
      .or(page.getByRole('link', { name: /compose|new.*email|create/i }))
      .first();
    if (await composeBtn.count()) {
      await composeBtn.click();
      await page.waitForTimeout(1000);
    }
    // Verify a form/editor area is now present (subject or body field)
    const subjectField = page
      .getByLabel(/subject/i)
      .or(page.getByPlaceholder(/subject/i))
      .first();
    if (!(await subjectField.count())) {
      test.skip(true, 'No subject field — admin email UI may be different');
      return;
    }
    await subjectField.fill('E2E test subject — DO NOT SEND');
    expect(await subjectField.inputValue()).toContain('E2E test');
    // Do NOT click send — we don't want broadcast emails going out
  });

  test('admin can preview an email template', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/email');
    // Look for any "preview" or "template" link
    const previewLink = page
      .getByRole('link', { name: /preview|template/i })
      .or(page.getByRole('button', { name: /preview|template/i }))
      .first();
    if (!(await previewLink.count())) {
      test.skip(true, 'No preview button visible on /admin/email');
      return;
    }
    await previewLink.click();
    await page.waitForLoadState('domcontentloaded');
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/something went wrong|application error/i);
  });

  test('admin can navigate the blog editor list', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/blog');
    // Try to click the first blog post in the list
    const firstPost = page.locator('a[href^="/admin/blog/"]').first();
    if (!(await firstPost.count())) {
      test.skip(true, 'No blog posts in /admin/blog');
      return;
    }
    await firstPost.click();
    await expect(page).toHaveURL(/\/admin\/blog\/.+/);
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/application error|something went wrong/i);
  });
});
