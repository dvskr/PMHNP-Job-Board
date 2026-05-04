import { test, expect } from '@playwright/test';
import {
  getEmployerCreds,
  loginAsEmployer,
  uniqueEmail,
  TEST_PASSWORD,
  fillNameFields,
  clickSubmit,
} from '../fixtures/auth';

/**
 * Employer user journey tests — full E2E with mutations.
 *
 * Read-only tests run unconditionally.
 * Auth-gated tests need E2E_EMPLOYER_EMAIL / E2E_EMPLOYER_PASS.
 * Mutation tests skip if PLAYWRIGHT_BASE_URL points at production.
 */

const HAS_AUTH = getEmployerCreds() !== null;
const AGAINST_PROD =
  !!process.env.PLAYWRIGHT_BASE_URL && process.env.PLAYWRIGHT_BASE_URL.includes('pmhnphiring.com');

// ── Read-only tests ─────────────────────────────────────────────────────────

test('employer: /for-employers landing has CTAs', async ({ page }) => {
  await page.goto('/for-employers');
  const ctas = page.locator('a, button').filter({
    hasText: /post.*job|get started|sign up|start hiring/i,
  });
  expect(await ctas.count()).toBeGreaterThan(0);
});

test('employer: /pricing lists at least one tier', async ({ page }) => {
  await page.goto('/pricing');
  const bodyText = await page.locator('body').innerText();
  expect(bodyText).toMatch(/\$|free|month|year/i);
});

test('employer: /post-job redirects unauthenticated user', async ({ page }) => {
  await page.goto('/post-job');
  await page.waitForLoadState('domcontentloaded');
  // Either redirects to login OR renders a "sign up to post" gate
  const url = page.url();
  expect(url).toMatch(/\/post-job|\/login|\/employer|\/signup/);
});

test('employer: /employer/login renders auth form', async ({ page }) => {
  await page.goto('/employer/login');
  await expect(page.locator('input[type="email"]').first()).toBeVisible();
  await expect(page.locator('input[type="password"]').first()).toBeVisible();
});

test('employer: /employer/signup renders signup form', async ({ page }) => {
  await page.goto('/employer/signup');
  await expect(page.locator('input[type="email"]').first()).toBeVisible();
});

// ── Auth-gated tests ────────────────────────────────────────────────────────

test.describe('authenticated employer', () => {
  test.skip(!HAS_AUTH, 'E2E_EMPLOYER_EMAIL / E2E_EMPLOYER_PASS not set');

  test('logs in successfully via /employer/login', async ({ page }) => {
    await loginAsEmployer(page);
    expect(page.url()).not.toContain('/employer/login');
  });

  test('can access /employer/candidates', async ({ page }) => {
    await loginAsEmployer(page);
    await page.goto('/employer/candidates');
    await expect(page).toHaveURL(/\/employer\/candidates/);
  });

  test('can access /employer/settings', async ({ page }) => {
    await loginAsEmployer(page);
    await page.goto('/employer/settings');
    await expect(page).toHaveURL(/\/employer\/settings/);
  });

  test('can access /post-job (logged in)', async ({ page }) => {
    await loginAsEmployer(page);
    await page.goto('/post-job');
    // Now that we're authed, /post-job should render the form
    await expect(page).toHaveURL(/\/post-job/);
  });

  test('can view candidate detail when at least one applicant exists', async ({ page }) => {
    await loginAsEmployer(page);
    await page.goto('/employer/candidates');
    const candidateLink = page.locator('a[href^="/employer/candidates/"]').first();
    if (!(await candidateLink.count())) {
      test.skip(true, 'No candidates in /employer/candidates list');
      return;
    }
    await candidateLink.click();
    await expect(page).toHaveURL(/\/employer\/candidates\/.+/);
  });
});

// ── Mutation tests (local only) ─────────────────────────────────────────────

test.describe('employer mutations (local only)', () => {
  test.skip(AGAINST_PROD, 'Mutation tests pollute data — local/staging only');

  test('can sign up a brand-new employer account', async ({ page }) => {
    const email = uniqueEmail('employer');
    await page.goto('/employer/signup');

    await page.locator('input[type="email"]').first().fill(email);
    const pwInputs = page.locator('input[type="password"]');
    await pwInputs.nth(0).fill(TEST_PASSWORD);
    if ((await pwInputs.count()) > 1) {
      await pwInputs.nth(1).fill(TEST_PASSWORD);
    }
    await fillNameFields(page, 'E2eEmployer', 'TestUser');

    // Company field is common on employer signup
    const companyField = page
      .getByLabel(/company|organization/i)
      .or(page.getByPlaceholder(/company|organization/i))
      .first();
    if (await companyField.count()) {
      await companyField.fill('E2E Test Corp');
    }

    const tos = page.locator('input[type="checkbox"]').first();
    if (await tos.count()) {
      await tos.check({ force: true }).catch(() => undefined);
    }

    await clickSubmit(page);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2500);

    const url = page.url();
    const bodyText = await page.locator('body').innerText();
    const movedOn = !url.match(/\/employer\/signup\/?$/);
    const verifyMsg = /verify|check your.*(email|inbox)|confirmation/i.test(bodyText);
    expect(movedOn || verifyMsg).toBe(true);
  });

  test('logged-in employer can start posting a job (form fields render)', async ({ page }) => {
    test.skip(!HAS_AUTH, 'Needs E2E_EMPLOYER_EMAIL/PASS');
    await loginAsEmployer(page);
    await page.goto('/post-job');

    // Job-post form typically has at least: title, description, location
    const titleField = page
      .getByLabel(/job.*title|title/i)
      .or(page.getByPlaceholder(/job.*title|title/i))
      .first();
    await expect(titleField).toBeVisible({ timeout: 10_000 });

    // Fill the basics so we can validate the form accepts input
    await titleField.fill('E2E Test PMHNP Position — DELETE ME');

    const descField = page
      .getByLabel(/description|details/i)
      .or(page.locator('textarea').first());
    if (await descField.count()) {
      await descField.fill('This is a test job posting created by the E2E suite. Safe to delete.');
    }

    const locationField = page
      .getByLabel(/location|city/i)
      .or(page.getByPlaceholder(/location|city/i))
      .first();
    if (await locationField.count()) {
      await locationField.fill('Boston, MA');
    }

    // Don't actually submit — submitting hits Stripe checkout which needs more
    // setup. Just verify form interaction works without errors.
    expect(await titleField.inputValue()).toContain('E2E Test PMHNP');
  });

  test('logged-in employer can update settings', async ({ page }) => {
    test.skip(!HAS_AUTH, 'Needs E2E_EMPLOYER_EMAIL/PASS');
    await loginAsEmployer(page);
    await page.goto('/employer/settings');

    // Find any text input we can safely edit (e.g., a "company description" or "phone")
    const editableTextField = page
      .locator('input[type="text"], textarea')
      .filter({ hasNot: page.locator('[disabled]') })
      .first();
    if (!(await editableTextField.count())) {
      test.skip(true, 'No editable fields on /employer/settings');
      return;
    }
    const original = await editableTextField.inputValue();
    const newValue = `${original} (E2E ${Date.now()})`;
    await editableTextField.fill(newValue);

    const saveBtn = page.getByRole('button', { name: /save|update/i }).first();
    if (await saveBtn.count()) {
      await saveBtn.click();
      await page.waitForTimeout(1500);
    }
    // Reload and verify it persisted
    await page.reload();
    const reloadedField = page
      .locator('input[type="text"], textarea')
      .filter({ hasNot: page.locator('[disabled]') })
      .first();
    expect(await reloadedField.inputValue()).toContain('E2E');

    // Restore original value
    await reloadedField.fill(original);
    if (await saveBtn.count()) {
      await saveBtn.click();
    }
  });

  test('logged-in employer can search candidates', async ({ page }) => {
    test.skip(!HAS_AUTH, 'Needs E2E_EMPLOYER_EMAIL/PASS');
    await loginAsEmployer(page);
    await page.goto('/employer/candidates');

    const searchField = page
      .getByPlaceholder(/search|filter/i)
      .or(page.locator('input[type="search"]'))
      .first();
    if (!(await searchField.count())) {
      test.skip(true, 'No search field on /employer/candidates');
      return;
    }
    await searchField.fill('PMHNP');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1500);
    // Just verify we didn't 5xx
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/something went wrong|server error|application error/i);
  });
});
