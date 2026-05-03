import { Page, expect } from '@playwright/test';

/**
 * Shared auth helpers for E2E tests.
 *
 * All helpers expect a fresh page. They navigate to the login URL, fill in
 * the form, click submit, and wait for the post-login redirect.
 *
 * If credentials are missing the caller should `test.skip()` first — these
 * helpers throw rather than silently no-op so a misconfigured test fails loud.
 */

export interface AuthCreds {
  email: string;
  password: string;
}

export function getSeekerCreds(): AuthCreds | null {
  const email = process.env.E2E_SEEKER_EMAIL;
  const password = process.env.E2E_SEEKER_PASS;
  return email && password ? { email, password } : null;
}

export function getEmployerCreds(): AuthCreds | null {
  const email = process.env.E2E_EMPLOYER_EMAIL;
  const password = process.env.E2E_EMPLOYER_PASS;
  return email && password ? { email, password } : null;
}

export function getAdminCreds(): AuthCreds | null {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASS;
  return email && password ? { email, password } : null;
}

export async function loginAtPath(page: Page, path: string, creds: AuthCreds) {
  await page.goto(path);
  await page.locator('input[type="email"]').first().fill(creds.email);
  await page.locator('input[type="password"]').first().fill(creds.password);
  await page.locator('button[type="submit"]').first().click();
  // Wait until we leave the login page (or hit a known post-login route)
  await page.waitForURL((url) => !url.pathname.startsWith(path), {
    timeout: 20_000,
    waitUntil: 'domcontentloaded',
  });
}

export async function loginAsSeeker(page: Page) {
  const creds = getSeekerCreds();
  if (!creds) throw new Error('E2E_SEEKER_EMAIL/PASS not set');
  await loginAtPath(page, '/login', creds);
}

export async function loginAsEmployer(page: Page) {
  const creds = getEmployerCreds();
  if (!creds) throw new Error('E2E_EMPLOYER_EMAIL/PASS not set');
  await loginAtPath(page, '/employer/login', creds);
}

export async function loginAsAdmin(page: Page) {
  const creds = getAdminCreds();
  if (!creds) throw new Error('E2E_ADMIN_EMAIL/PASS not set');
  // Admins use the same /login flow; role check happens server-side
  await loginAtPath(page, '/login', creds);
}

/**
 * Generate a unique test email so each signup test gets a fresh account.
 * Format: `e2e+<role>-<timestamp>-<rand>@pmhnptest.com` — easy to spot in
 * the user table and easy to bulk-delete later.
 */
export function uniqueEmail(role: 'seeker' | 'employer' | 'admin'): string {
  const ts = Date.now();
  const rand = Math.floor(Math.random() * 1_000_000).toString(36);
  return `e2e+${role}-${ts}-${rand}@pmhnptest.com`;
}

/** Strong-enough password that passes most validators */
export const TEST_PASSWORD = 'E2eTest1!Strong';

/**
 * Fill any visible "name" / "first name" / "last name" inputs with the
 * provided values. Tolerant of different field labels across signup forms.
 */
export async function fillNameFields(page: Page, firstName: string, lastName: string) {
  // Try common label patterns. Skip silently if the form doesn't have them.
  const firstNameField = page
    .getByLabel(/first.*name/i)
    .or(page.getByPlaceholder(/first.*name/i))
    .first();
  if (await firstNameField.count().catch(() => 0)) {
    await firstNameField.fill(firstName).catch(() => undefined);
  }

  const lastNameField = page
    .getByLabel(/last.*name/i)
    .or(page.getByPlaceholder(/last.*name/i))
    .first();
  if (await lastNameField.count().catch(() => 0)) {
    await lastNameField.fill(lastName).catch(() => undefined);
  }
}

/**
 * Click whatever the form's primary submit/CTA is. Tries `button[type=submit]`
 * first, then a button with "Sign up" / "Create account" / "Continue" text.
 */
export async function clickSubmit(page: Page) {
  const submit = page.locator('button[type="submit"]').first();
  if (await submit.count()) {
    await submit.click();
    return;
  }
  await page
    .getByRole('button', { name: /sign up|create account|continue|submit/i })
    .first()
    .click();
}
