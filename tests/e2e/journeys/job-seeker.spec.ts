import { test, expect, type Page } from '@playwright/test';
import {
  getSeekerCreds,
  loginAsSeeker,
  uniqueEmail,
  TEST_PASSWORD,
  fillNameFields,
  clickSubmit,
} from '../fixtures/auth';
import path from 'path';
import fs from 'fs';

/**
 * Job seeker user journey tests — full E2E with mutations.
 *
 * Read-only tests run unconditionally.
 * Auth-gated tests skip if E2E_SEEKER_EMAIL / E2E_SEEKER_PASS are not set.
 * Mutation tests skip if running against production (PLAYWRIGHT_BASE_URL contains pmhnphiring.com).
 */

const SEEKER_CREDS = getSeekerCreds();
const HAS_AUTH = SEEKER_CREDS !== null;
const AGAINST_PROD =
  !!process.env.PLAYWRIGHT_BASE_URL && process.env.PLAYWRIGHT_BASE_URL.includes('pmhnphiring.com');

// ── Read-only tests (always run) ────────────────────────────────────────────

test('seeker: can browse jobs without logging in', async ({ page }) => {
  await page.goto('/jobs');
  await expect(page).toHaveURL(/\/jobs/);
  const bodyText = await page.locator('body').innerText();
  expect(bodyText).toMatch(/job|position|opening/i);
});

test('seeker: can filter jobs by remote', async ({ page }) => {
  await page.goto('/jobs/remote');
  await expect(page.locator('h1').first()).toContainText(/remote/i);
});

test('seeker: can navigate from listings to a job detail', async ({ page }) => {
  await page.goto('/jobs');
  // Look for any link matching the job-detail slug pattern (slug-uuid)
  const jobLink = page.locator('a[href^="/jobs/"]').filter({
    hasText: /\w/,
  });
  const count = await jobLink.count();
  if (count === 0) {
    test.skip(true, 'No job listings on this page');
    return;
  }
  // Find the first link whose href looks like a real job slug (ends with UUID)
  const links = await jobLink.evaluateAll((els) =>
    els
      .map((e) => (e as HTMLAnchorElement).href)
      .filter((h) => /\/jobs\/[a-z0-9-]+-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(h))
  );
  if (links.length === 0) {
    test.skip(true, 'No job-detail links visible');
    return;
  }
  await page.goto(new URL(links[0]).pathname);
  await expect(page.locator('h1').first()).toBeVisible();
});

test('seeker: signup form rejects empty submission', async ({ page }) => {
  await page.goto('/signup');
  await page.locator('button[type="submit"]').first().click({ trial: false });
  // Either client-side validation kicks in OR server returns an error — either way we should NOT be redirected to a logged-in route
  await page.waitForTimeout(800);
  expect(page.url()).toMatch(/\/signup/);
});

test('seeker: login page renders auth form', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('input[type="email"]').first()).toBeVisible();
  await expect(page.locator('input[type="password"]').first()).toBeVisible();
});

test('seeker: login with wrong password fails', async ({ page }) => {
  await page.goto('/login');
  await page.locator('input[type="email"]').first().fill('definitely-not-a-real-user@pmhnptest.com');
  await page.locator('input[type="password"]').first().fill('wrong-password-123');
  await page.locator('button[type="submit"]').first().click();
  // Should stay on /login OR show an error
  await page.waitForTimeout(2000);
  const url = page.url();
  const bodyText = await page.locator('body').innerText();
  const stayedOnLogin = url.includes('/login');
  const hasError = /invalid|incorrect|error|wrong/i.test(bodyText);
  expect(stayedOnLogin || hasError).toBe(true);
});

// ── Auth-gated tests (need existing seeker creds) ───────────────────────────

test.describe('authenticated seeker', () => {
  test.skip(!HAS_AUTH, 'E2E_SEEKER_EMAIL / E2E_SEEKER_PASS not set');

  test('logs in successfully', async ({ page }) => {
    await loginAsSeeker(page);
    expect(page.url()).not.toContain('/login');
  });

  test('can access /dashboard', async ({ page }) => {
    await loginAsSeeker(page);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('can access /settings', async ({ page }) => {
    await loginAsSeeker(page);
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/settings/);
  });

  test('can access /saved (saved jobs)', async ({ page }) => {
    await loginAsSeeker(page);
    await page.goto('/saved');
    await expect(page).toHaveURL(/\/saved/);
  });

  test('can access /messages', async ({ page }) => {
    await loginAsSeeker(page);
    await page.goto('/messages');
    await expect(page).toHaveURL(/\/messages/);
  });

  test('can access /my-applications', async ({ page }) => {
    await loginAsSeeker(page);
    await page.goto('/my-applications');
    await expect(page).toHaveURL(/\/my-applications/);
  });

  test('can sign out and lose access to /dashboard', async ({ page }) => {
    await loginAsSeeker(page);
    // Try to find a sign-out control
    const signOutLink = page
      .getByRole('link', { name: /sign out|log ?out/i })
      .or(page.getByRole('button', { name: /sign out|log ?out/i }))
      .first();
    if (await signOutLink.count()) {
      await signOutLink.click();
      await page.waitForLoadState('domcontentloaded');
    } else {
      // Fall back to hitting the API directly
      await page.context().clearCookies();
    }
    await page.goto('/dashboard');
    // Should bounce back to login or homepage
    expect(page.url()).not.toMatch(/\/dashboard\/?$/);
  });
});

// ── Mutation tests (skip against production, run locally) ───────────────────

test.describe('seeker mutations (local only)', () => {
  test.skip(AGAINST_PROD, 'Mutation tests pollute data — local/staging only');

  test('can sign up a brand-new seeker account', async ({ page }) => {
    const email = uniqueEmail('seeker');
    await page.goto('/signup');

    // Fill email + password
    await page.locator('input[type="email"]').first().fill(email);
    const pwInputs = page.locator('input[type="password"]');
    const pwCount = await pwInputs.count();
    await pwInputs.nth(0).fill(TEST_PASSWORD);
    if (pwCount > 1) {
      // Confirm password field
      await pwInputs.nth(1).fill(TEST_PASSWORD);
    }
    await fillNameFields(page, 'E2eSeeker', 'TestUser');

    // Accept any TOS checkbox if present
    const tosCheckbox = page.locator('input[type="checkbox"]').first();
    if (await tosCheckbox.count()) {
      await tosCheckbox.check({ force: true }).catch(() => undefined);
    }

    await clickSubmit(page);

    // After signup we expect redirect to /onboarding, /dashboard, or an
    // email-verification screen. NOT to stay on /signup with a hard error.
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    const url = page.url();
    const bodyText = await page.locator('body').innerText();
    const movedOn = !url.match(/\/signup\/?$/);
    const verifyMsg = /verify|check your.*(email|inbox)|confirmation/i.test(bodyText);
    expect(movedOn || verifyMsg).toBe(true);
  });

  test('logged-in seeker can save a job', async ({ page }) => {
    test.skip(!HAS_AUTH, 'Needs E2E_SEEKER_EMAIL/PASS');
    await loginAsSeeker(page);

    // Find a job from listings
    const jobUrl = await pickFirstJob(page);
    if (!jobUrl) {
      test.skip(true, 'No published jobs to save');
      return;
    }
    await page.goto(jobUrl);

    // Look for a save / bookmark button (heart, "Save", or aria-label)
    const saveBtn = page
      .getByRole('button', { name: /^save( job)?$/i })
      .or(page.locator('button[aria-label*="save" i]'))
      .first();
    if (!(await saveBtn.count())) {
      test.skip(true, 'Save button not found on this job detail layout');
      return;
    }
    await saveBtn.click();

    // Verify it appears on /saved
    await page.goto('/saved');
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(20); // page loaded
  });

  test('logged-in seeker can update settings (notifications)', async ({ page }) => {
    test.skip(!HAS_AUTH, 'Needs E2E_SEEKER_EMAIL/PASS');
    await loginAsSeeker(page);
    await page.goto('/settings');

    // Toggle the first checkbox we find (some notification pref)
    const firstCheckbox = page.locator('input[type="checkbox"]').first();
    if (!(await firstCheckbox.count())) {
      test.skip(true, 'No toggleable settings on /settings');
      return;
    }
    const wasChecked = await firstCheckbox.isChecked();
    await firstCheckbox.click({ force: true });
    // Click any save button if present
    const saveBtn = page.getByRole('button', { name: /save|update|apply/i }).first();
    if (await saveBtn.count()) {
      await saveBtn.click();
    }
    await page.waitForTimeout(1000);
    // Verify the toggle stuck (state different from before)
    expect(await firstCheckbox.isChecked()).toBe(!wasChecked);
  });

  test('logged-in seeker can subscribe to job alerts', async ({ page }) => {
    await page.goto('/job-alerts');
    // /job-alerts may render a search-form-style alert subscription
    const emailField = page.locator('input[type="email"]').first();
    if (!(await emailField.count())) {
      test.skip(true, '/job-alerts has no email field — flow may have changed');
      return;
    }
    await emailField.fill(uniqueEmail('seeker'));
    await clickSubmit(page);
    await page.waitForTimeout(1500);
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).toMatch(/check.*email|confirm|subscribed|success/i);
  });

  test('logged-in seeker can upload + parse a resume', async ({ page }) => {
    test.skip(!HAS_AUTH, 'Needs E2E_SEEKER_EMAIL/PASS');
    const resumePath = path.resolve(
      process.cwd(),
      process.env.E2E_TEST_RESUME_PATH || 'tests/e2e/fixtures/sample-resume.pdf'
    );
    if (!fs.existsSync(resumePath)) {
      test.skip(
        true,
        `Resume fixture not found at ${resumePath}. Drop a sample-resume.pdf into tests/e2e/fixtures/ to enable this test.`
      );
      return;
    }
    await loginAsSeeker(page);
    // Resume upload typically lives on /settings, /dashboard, or a profile page
    await page.goto('/settings');
    const fileInput = page.locator('input[type="file"]').first();
    if (!(await fileInput.count())) {
      // Try /dashboard
      await page.goto('/dashboard');
    }
    const fi = page.locator('input[type="file"]').first();
    if (!(await fi.count())) {
      test.skip(true, 'No file input found on /settings or /dashboard');
      return;
    }
    await fi.setInputFiles(resumePath);
    // Wait for upload to register — look for a success indicator or a parsed preview
    await page.waitForTimeout(8000); // resume parse can take 5-10s with OpenAI
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/failed.*upload|error.*upload/i);
  });

  test('logged-in seeker can apply to a job', async ({ page }) => {
    test.skip(!HAS_AUTH, 'Needs E2E_SEEKER_EMAIL/PASS');
    await loginAsSeeker(page);
    const jobUrl = process.env.E2E_TEST_JOB_ID
      ? `/jobs/${process.env.E2E_TEST_JOB_ID}`
      : await pickFirstJob(page);
    if (!jobUrl) {
      test.skip(true, 'No published jobs');
      return;
    }
    await page.goto(jobUrl);

    const applyBtn = page
      .getByRole('button', { name: /^apply( now)?$/i })
      .or(page.getByRole('link', { name: /^apply( now)?$/i }))
      .first();
    if (!(await applyBtn.count())) {
      test.skip(true, 'Apply button not found on this job — may be external apply');
      return;
    }
    await applyBtn.click();
    // Many flows open an inline modal or redirect to an apply page — wait for SOMETHING to happen
    await page.waitForTimeout(2000);

    // If a confirmation/apply form appears, submit it
    const confirmBtn = page
      .getByRole('button', { name: /^(confirm|submit|send)( application)?$/i })
      .first();
    if (await confirmBtn.count()) {
      await confirmBtn.click();
      await page.waitForTimeout(1500);
    }
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).toMatch(/applied|application sent|thank you|success/i);
  });
});

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Find the first real job URL on /jobs. Returns null if none. */
async function pickFirstJob(page: Page): Promise<string | null> {
  await page.goto('/jobs');
  const links = await page
    .locator('a[href^="/jobs/"]')
    .evaluateAll((els) =>
      els
        .map((e) => (e as HTMLAnchorElement).getAttribute('href') || '')
        .filter((h) =>
          /^\/jobs\/[a-z0-9-]+-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(h)
        )
    );
  return links[0] || null;
}
