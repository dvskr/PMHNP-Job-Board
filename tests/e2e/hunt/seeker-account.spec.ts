/**
 * Bug hunt slice: job seeker account lifecycle (run tag h0902).
 *
 * Journey: /signup validation + fresh signup -> /login (errors, redirects,
 * open-redirect guard) -> password recovery surfaces (/forgot-password,
 * /reset-password, /auth/confirm) -> logged-in seeker (/dashboard,
 * /onboarding/professional, /settings field persistence, notification
 * preferences, profile export, /data-request) -> sign out + auth redirects
 * -> delete account + restore window on a throwaway account.
 *
 * Every page is instrumented with attachErrorCollectors() and each test ends
 * with assertClean() so uncaught errors, hydration warnings and 5xx responses
 * surface in the failure message.
 *
 * Rate-limited endpoints (forgot-password 3/h, delete-account 3/h,
 * restore-account 5/h, data-request 3/h; all per IP) can return 429 when the
 * dev server is shared. Those tests skip on 429 instead of failing so the
 * result reflects product bugs, not infrastructure.
 */
import { test, expect, request as playwrightRequest, type Page, type Locator } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getSeekerCreds, uniqueEmail, TEST_PASSWORD, type AuthCreds } from '../fixtures/auth';
import { attachErrorCollectors, assertClean, type Collected } from './_helpers';

const SEEKER = getSeekerCreds();
const AGAINST_PROD =
  !!process.env.PLAYWRIGHT_BASE_URL && process.env.PLAYWRIGHT_BASE_URL.includes('pmhnphiring.com');
const RUN_TAG = 'h0902';
const STATE_FILE = path.join(os.tmpdir(), `pmhnp-hunt-seeker-account-${process.pid}.json`);
const EMPTY_STATE = { cookies: [], origins: [] };
const NAV_TIMEOUT = 60_000;

/* ── helpers ─────────────────────────────────────────────────────────────── */

async function gotoPage(page: Page, url: string) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
}

async function login(page: Page, creds: AuthCreds, loginPath = '/login') {
  await gotoPage(page, loginPath);
  await page.locator('#login-email').waitFor({ state: 'visible', timeout: NAV_TIMEOUT });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.locator('#login-email').fill(creds.email);
  await page.locator('#login-password').fill(creds.password);
  await page.getByRole('button', { name: /^sign in/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), {
    timeout: NAV_TIMEOUT,
    waitUntil: 'domcontentloaded',
  });
}

async function openSettings(page: Page, tab: 'personal' | 'credentials' | 'account' = 'personal') {
  await gotoPage(page, `/settings?tab=${tab}`);
  await page.getByRole('button', { name: /save changes/i }).waitFor({ state: 'visible', timeout: NAV_TIMEOUT });
}

async function saveSettings(page: Page) {
  const patch = page.waitForResponse(
    (r) => r.url().includes('/api/auth/profile') && r.request().method() === 'PATCH',
    { timeout: NAV_TIMEOUT },
  );
  await page.getByRole('button', { name: /save changes/i }).click();
  const res = await patch;
  return res.status();
}

async function fetchProfile(page: Page): Promise<Record<string, unknown>> {
  const res = await page.request.get('/api/auth/profile');
  expect(res.status(), 'GET /api/auth/profile should be 200 for a logged-in seeker').toBe(200);
  return (await res.json()) as Record<string, unknown>;
}

async function patchProfile(page: Page, data: Record<string, unknown>) {
  const res = await page.request.patch('/api/auth/profile', { data });
  expect(res.status(), `restore PATCH /api/auth/profile failed: ${await res.text()}`).toBe(200);
}

/**
 * The form's own alert box. Next.js also renders an empty
 * `<div role="alert" id="__next-route-announcer__">`, so a bare
 * `[role=alert]` locator is ambiguous; require non-whitespace text.
 */
function alertBox(page: Page): Locator {
  return page.getByRole('alert').filter({ hasText: /\S/ });
}

function isExternalNav(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith('evil.example');
  } catch {
    return false;
  }
}

/** The ToggleRow switch button that belongs to a labelled row on /settings. */
function toggleButtonFor(page: Page, label: string): Locator {
  return page.getByText(label, { exact: true }).locator('xpath=ancestor::div[3]/button');
}

function yearsSelect(page: Page): Locator {
  return page.locator('select:has(option:has-text("Select experience level"))');
}

async function signupSeeker(page: Page, email: string, first = 'Hunt', last = 'Seeker') {
  await gotoPage(page, '/signup');
  await page.locator('#signup-email').waitFor({ state: 'visible', timeout: NAV_TIMEOUT });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.locator('#signup-firstName').fill(first);
  await page.locator('#signup-lastName').fill(last);
  await page.locator('#signup-email').fill(email);
  await page.locator('#signup-password').fill(TEST_PASSWORD);
  await page.locator('#signup-confirmPassword').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: /^create account/i }).click();
  // Either auto-login (redirect away from /signup) or the "Check your email" card.
  await Promise.race([
    page.waitForURL((u) => !u.pathname.startsWith('/signup'), { timeout: NAV_TIMEOUT, waitUntil: 'domcontentloaded' }),
    page.getByText(/check your email/i).waitFor({ state: 'visible', timeout: NAV_TIMEOUT }),
    alertBox(page).first().waitFor({ state: 'visible', timeout: NAV_TIMEOUT }),
  ]);
  const alert = alertBox(page);
  const alertText = (await alert.count()) ? (await alert.first().innerText()).trim() : '';
  const confirmationRequired = await page.getByText(/check your email/i).isVisible().catch(() => false);
  return { url: page.url(), confirmationRequired, alertText };
}

const DASH_RE = /[–—]/; // en dash, em dash
const BANNED_COPY_RE = /founder|pavan/i;

/* ── /signup ─────────────────────────────────────────────────────────────── */

test.describe('signup page', () => {
  test.use({ storageState: EMPTY_STATE });

  test('renders the signup form with both roles and required fields', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await gotoPage(page, '/signup');
    await expect(page.getByRole('heading', { name: /create your account/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /job seeker/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^employer$/i })).toBeVisible();
    for (const id of ['#signup-firstName', '#signup-lastName', '#signup-email', '#signup-password', '#signup-confirmPassword']) {
      await expect(page.locator(id)).toBeVisible();
      await expect(page.locator(id)).toHaveAttribute('required', '');
    }
    await expect(page.getByRole('button', { name: /^create account/i })).toBeVisible();
    assertClean(c, '/signup');
  });

  test('empty submit is blocked by required validation and stays on /signup', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await gotoPage(page, '/signup');
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.getByRole('button', { name: /^create account/i }).click();
    const firstInvalid = page.locator('#signup-firstName');
    const msg = await firstInvalid.evaluate((el) => (el as HTMLInputElement).validationMessage);
    expect(msg, 'first name should report a native required-field message').not.toBe('');
    expect(page.url()).toMatch(/\/signup/);
    assertClean(c, 'empty signup');
  });

  test('invalid email is rejected by native validation', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await gotoPage(page, '/signup');
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.locator('#signup-firstName').fill('Hunt');
    await page.locator('#signup-lastName').fill('Seeker');
    await page.locator('#signup-email').fill('not-an-email');
    await page.locator('#signup-password').fill(TEST_PASSWORD);
    await page.locator('#signup-confirmPassword').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /^create account/i }).click();
    const valid = await page.locator('#signup-email').evaluate((el) => (el as HTMLInputElement).checkValidity());
    expect(valid).toBe(false);
    expect(page.url()).toMatch(/\/signup/);
    assertClean(c, 'invalid email signup');
  });

  test('weak password (under 8 chars) is rejected before any request', async ({ page }) => {
    const c = attachErrorCollectors(page);
    const authCalls: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/auth/v1/signup')) authCalls.push(r.url()); });
    await gotoPage(page, '/signup');
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.locator('#signup-firstName').fill('Hunt');
    await page.locator('#signup-lastName').fill('Seeker');
    await page.locator('#signup-email').fill(uniqueEmail('seeker'));
    await page.locator('#signup-password').fill('short1!');
    await page.locator('#signup-confirmPassword').fill('short1!');
    await page.getByRole('button', { name: /^create account/i }).click();
    const nativeMsg = await page.locator('#signup-password').evaluate((el) => (el as HTMLInputElement).validationMessage);
    const alertShown = await alertBox(page).first().isVisible().catch(() => false);
    expect(nativeMsg !== '' || alertShown, 'expected a minLength or "at least 8 characters" error').toBe(true);
    expect(authCalls, 'no Supabase signup call should be made for a weak password').toEqual([]);
    expect(page.url()).toMatch(/\/signup/);
    assertClean(c, 'weak password signup');
  });

  test('mismatched confirm password shows "Passwords do not match"', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await gotoPage(page, '/signup');
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.locator('#signup-firstName').fill('Hunt');
    await page.locator('#signup-lastName').fill('Seeker');
    await page.locator('#signup-email').fill(uniqueEmail('seeker'));
    await page.locator('#signup-password').fill(TEST_PASSWORD);
    await page.locator('#signup-confirmPassword').fill(TEST_PASSWORD + 'x');
    await page.getByRole('button', { name: /^create account/i }).click();
    await expect(alertBox(page)).toContainText(/passwords do not match/i);
    expect(page.url()).toMatch(/\/signup/);
    assertClean(c, 'mismatched confirm');
  });

  test('copy on /signup, /login and /forgot-password follows the copy rules', async ({ page }) => {
    const c = attachErrorCollectors(page);
    const offenders: string[] = [];
    for (const url of ['/signup', '/login', '/forgot-password']) {
      await gotoPage(page, url);
      const text = await page.locator('main, body').first().innerText();
      for (const line of text.split('\n')) {
        if (DASH_RE.test(line) || BANNED_COPY_RE.test(line)) offenders.push(`${url}: ${line.trim()}`);
      }
    }
    expect(offenders, 'no em/en dashes, "founder" or "Pavan" in visible copy').toEqual([]);
    assertClean(c, 'auth copy scan');
  });
});

/* ── /login ──────────────────────────────────────────────────────────────── */

test.describe('login page', () => {
  test.use({ storageState: EMPTY_STATE });
  test.skip(!SEEKER, 'E2E_SEEKER_EMAIL / E2E_SEEKER_PASS not set');

  test('wrong password shows an inline error and stays on /login', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await gotoPage(page, '/login');
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.locator('#login-email').fill(SEEKER!.email);
    await page.locator('#login-password').fill('definitely-wrong-password-1!');
    await page.getByRole('button', { name: /^sign in/i }).click();
    const alert = alertBox(page);
    await expect(alert).toBeVisible({ timeout: NAV_TIMEOUT });
    const text = (await alert.innerText()).trim();
    expect(text).toMatch(/invalid|incorrect|credentials/i);
    expect(page.url()).toMatch(/\/login/);
    assertClean(c, 'wrong password');
  });

  test('unknown email shows the same generic error (no account enumeration)', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await gotoPage(page, '/login');
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.locator('#login-email').fill(`nobody-${Date.now()}@pmhnptest.com`);
    await page.locator('#login-password').fill('whatever-password-1!');
    await page.getByRole('button', { name: /^sign in/i }).click();
    const alert = alertBox(page);
    await expect(alert).toBeVisible({ timeout: NAV_TIMEOUT });
    const text = (await alert.innerText()).trim();
    expect(text).toMatch(/invalid login credentials/i);
    expect(text).not.toMatch(/no user|not found|does not exist/i);
    assertClean(c, 'unknown email');
  });

  test('correct seeker login lands on /dashboard and the restore probe is not rate limited', async ({ page }) => {
    const c = attachErrorCollectors(page);
    const restoreStatuses: number[] = [];
    page.on('response', (r) => { if (r.url().includes('/api/auth/restore-account')) restoreStatuses.push(r.status()); });
    await login(page, SEEKER!);
    await expect(page).toHaveURL(/\/dashboard/, { timeout: NAV_TIMEOUT });
    await expect.poll(() => restoreStatuses.length, { timeout: 20_000 }).toBeGreaterThan(0);
    // The login handler calls /api/auth/restore-account on EVERY login and
    // ignores the response. It is rate limited to 5/hour per IP, so a 429
    // here means a soft-deleted user logging in from a shared IP would NOT be
    // restored (they land on the dashboard with a suppressed profile).
    expect(restoreStatuses, 'restore-account should answer 400 (not deleted), never 429').not.toContain(429);
    assertClean(c, 'seeker login');
  });

  test('role toggle switches the form to employer mode', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await gotoPage(page, '/login');
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await expect(page.locator('#login-email')).toHaveAttribute('placeholder', 'you@example.com');
    const employerToggle = page.getByRole('button', { name: /^employer$/i });
    await employerToggle.click();
    await expect(page.locator('#login-email')).toHaveAttribute('placeholder', 'hiring@company.com');
    await expect(page.getByText(/work email/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /create one/i })).toHaveAttribute('href', '/signup?role=employer');
    // Prior audit item: the toggle exposes no pressed state to AT.
    const pressed = await employerToggle.getAttribute('aria-pressed');
    test.info().annotations.push({ type: 'a11y', description: `employer toggle aria-pressed=${pressed}` });
    assertClean(c, 'login role toggle');
  });

  test('?redirectTo=/settings is honoured after login', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await login(page, SEEKER!, '/login?redirectTo=%2Fsettings');
    await expect(page).toHaveURL(/\/settings/, { timeout: NAV_TIMEOUT });
    assertClean(c, 'redirectTo settings');
  });

  test('?next=/saved is honoured after login', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await login(page, SEEKER!, '/login?next=%2Fsaved');
    await expect(page).toHaveURL(/\/saved/, { timeout: NAV_TIMEOUT });
    assertClean(c, 'next saved');
  });

  test('external ?redirectTo=https://evil.example is NOT followed', async ({ page }) => {
    const c = attachErrorCollectors(page);
    const externalNav: string[] = [];
    page.on('request', (r) => { if (r.isNavigationRequest() && isExternalNav(r.url())) externalNav.push(r.url()); });
    await login(page, SEEKER!, '/login?redirectTo=https%3A%2F%2Fevil.example%2Fphish');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: NAV_TIMEOUT });
    expect(externalNav).toEqual([]);
    assertClean(c, 'open redirect guard');
  });

  test('protocol-relative ?redirectTo=//evil.example is NOT followed', async ({ page }) => {
    const c = attachErrorCollectors(page);
    const externalNav: string[] = [];
    page.on('request', (r) => { if (r.isNavigationRequest() && isExternalNav(r.url())) externalNav.push(r.url()); });
    await login(page, SEEKER!, '/login?redirectTo=%2F%2Fevil.example');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: NAV_TIMEOUT });
    expect(externalNav).toEqual([]);
    assertClean(c, 'protocol-relative redirect guard');
  });

  test('visiting /login and /signup while already logged in redirects to /dashboard', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await login(page, SEEKER!);
    await gotoPage(page, '/login');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: NAV_TIMEOUT });
    await gotoPage(page, '/signup');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: NAV_TIMEOUT });
    // Already-authenticated + external redirectTo must still stay on-site.
    await gotoPage(page, '/login?redirectTo=https%3A%2F%2Fevil.example');
    await expect(page).toHaveURL(/localhost|127\.0\.0\.1/);
    expect(page.url()).not.toMatch(/evil\.example/);
    assertClean(c, 'login while authenticated');
  });
});

/* ── password recovery + confirm surfaces ────────────────────────────────── */

test.describe('password recovery surfaces', () => {
  test.use({ storageState: EMPTY_STATE });

  test('/forgot-password with the seeker email shows the check-your-email state', async ({ page }) => {
    test.skip(!SEEKER, 'E2E_SEEKER_EMAIL not set');
    const c = attachErrorCollectors(page);
    await gotoPage(page, '/forgot-password');
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.locator('#reset-email').fill(SEEKER!.email);
    const resP = page.waitForResponse((r) => r.url().includes('/api/auth/forgot-password'), { timeout: NAV_TIMEOUT });
    await page.getByRole('button', { name: /send reset link/i }).click();
    const res = await resP;
    test.skip(res.status() === 429, 'forgot-password rate limit (3/h per IP) already consumed on this shared dev server');
    expect(res.status()).toBe(200);
    await expect(page.getByRole('heading', { name: /check your email/i })).toBeVisible();
    await expect(page.getByText(SEEKER!.email)).toBeVisible();
    assertClean(c, 'forgot-password happy');
  });

  test('/forgot-password with garbage input never succeeds silently and never 5xxs', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await gotoPage(page, '/forgot-password');
    await page.waitForLoadState('networkidle').catch(() => undefined);
    // Native validation path
    await page.locator('#reset-email').fill('garbage');
    await page.getByRole('button', { name: /send reset link/i }).click();
    expect(await page.locator('#reset-email').evaluate((el) => (el as HTMLInputElement).checkValidity())).toBe(false);
    // Passes native type=email but fails the server's z.string().email()
    await page.locator('#reset-email').fill('a@b');
    const resP = page.waitForResponse((r) => r.url().includes('/api/auth/forgot-password'), { timeout: NAV_TIMEOUT });
    await page.getByRole('button', { name: /send reset link/i }).click();
    const res = await resP;
    expect([400, 429]).toContain(res.status());
    await expect(page.getByText(/could not send reset email|too many reset attempts/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: /check your email/i })).toHaveCount(0);
    assertClean(c, 'forgot-password garbage');
  });

  test('/reset-password with no token renders the form and fails honestly on submit', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await gotoPage(page, '/reset-password');
    await expect(page.getByRole('heading', { name: /set new password/i })).toBeVisible({ timeout: NAV_TIMEOUT });
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.locator('#reset-password').fill('NewPassw0rd!');
    await page.locator('#reset-confirm').fill('NewPassw0rd!x');
    await page.getByRole('button', { name: /update password/i }).click();
    await expect(page.getByText(/passwords do not match/i)).toBeVisible();
    await page.locator('#reset-confirm').fill('NewPassw0rd!');
    await page.getByRole('button', { name: /update password/i }).click();
    // No session -> Supabase updateUser must fail; the page must not claim success.
    await expect(page.getByText(/session|invalid|expired|error|missing/i).first()).toBeVisible({ timeout: NAV_TIMEOUT });
    await expect(page.getByRole('heading', { name: /password updated/i })).toHaveCount(0);
    assertClean(c, 'reset-password no token');
  });

  test('/reset-password with garbage error params shows the expired-link state', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await gotoPage(page, '/reset-password?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
    await expect(page.getByRole('heading', { name: /link expired/i })).toBeVisible({ timeout: NAV_TIMEOUT });
    await expect(page.getByRole('link', { name: /request new link/i })).toHaveAttribute('href', '/forgot-password');
    await gotoPage(page, '/reset-password?error_code=bogus_code');
    await expect(page.getByText(/invalid or expired reset link/i)).toBeVisible({ timeout: NAV_TIMEOUT });
    assertClean(c, 'reset-password garbage');
  });

  test('/auth/confirm with no params reports an invalid link and bounces to /login', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await gotoPage(page, '/auth/confirm');
    await expect(page.getByText(/invalid or expired link/i)).toBeVisible({ timeout: NAV_TIMEOUT });
    await expect(page).toHaveURL(/\/login/, { timeout: NAV_TIMEOUT });
    assertClean(c, 'auth confirm empty');
  });

  test('/auth/confirm with a garbage hash token reports failure, not success', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await gotoPage(page, '/auth/confirm#access_token=garbage&refresh_token=garbage&type=magiclink');
    await expect(page.getByText(/session expired or invalid|invalid authentication link/i)).toBeVisible({ timeout: NAV_TIMEOUT });
    await expect(page.getByText(/email confirmed/i)).toHaveCount(0);
    assertClean(c, 'auth confirm garbage hash');
  });

  test('/auth/confirm with expired-otp params shows the expired message', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await gotoPage(page, '/auth/confirm?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
    await expect(page.getByText(/this link has expired/i)).toBeVisible({ timeout: NAV_TIMEOUT });
    assertClean(c, 'auth confirm otp expired');
  });

  test('/auth/confirm?code=garbage must not claim "Email confirmed"', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await gotoPage(page, '/auth/confirm?code=this-is-not-a-real-pkce-code');
    // Wait for the exchange to settle (message changes from "Confirming...").
    await expect(page.getByText(/confirming your account/i)).toHaveCount(0, { timeout: NAV_TIMEOUT });
    const message = (await page.locator('p').first().innerText()).trim();
    test.info().annotations.push({ type: 'observed', description: `message="${message}" url=${page.url()}` });
    // A failed code exchange must not be presented as a confirmed email.
    expect(message, 'garbage PKCE code presented as a successful confirmation').not.toMatch(/email confirmed/i);
    assertClean(c, 'auth confirm garbage code');
  });

  test('/email-preferences without a token or with a garbage token shows the invalid-link state', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await gotoPage(page, '/email-preferences');
    await expect(page.getByRole('heading', { name: /invalid link/i })).toBeVisible({ timeout: NAV_TIMEOUT });
    const resP = page.waitForResponse((r) => r.url().includes('/api/email/preferences'), { timeout: NAV_TIMEOUT });
    await gotoPage(page, '/email-preferences?token=garbage-token-h0902');
    const res = await resP;
    expect([400, 404]).toContain(res.status());
    await expect(page.getByRole('heading', { name: /invalid link/i })).toBeVisible({ timeout: NAV_TIMEOUT });
    assertClean(c, 'email-preferences token');
  });
});

/* ── logged-in seeker (shared storage state) ─────────────────────────────── */

test.describe('logged-in seeker', () => {
  test.skip(!SEEKER, 'E2E_SEEKER_EMAIL / E2E_SEEKER_PASS not set');
  test.skip(AGAINST_PROD, 'no mutations against production');

  let original: Record<string, unknown> = {};

  test.beforeAll(async ({ browser, baseURL }) => {
    // browser.newContext() inherits the describe's contextOptions, including the
    // storageState file we are about to write; start from an explicit empty state.
    const ctx = await browser.newContext({ baseURL, storageState: EMPTY_STATE });
    const page = await ctx.newPage();
    await login(page, SEEKER!);
    await ctx.storageState({ path: STATE_FILE });
    const res = await page.request.get('/api/auth/profile');
    if (res.ok()) original = (await res.json()) as Record<string, unknown>;
    await ctx.close();
  });

  test.afterAll(async ({ baseURL }) => {
    if (!fs.existsSync(STATE_FILE) || !original.email) return;
    // Put the shared account back the way we found it.
    const api = await playwrightRequest.newContext({ baseURL, storageState: STATE_FILE });
    const keys = [
      'firstName', 'lastName', 'phone', 'headline', 'bio', 'yearsExperience', 'specialties',
      'preferredWorkMode', 'preferredJobType', 'desiredSalaryMin', 'desiredSalaryMax', 'desiredSalaryType',
      'availableDate', 'openToOffers', 'profileVisible',
    ];
    const data: Record<string, unknown> = {};
    for (const k of keys) data[k] = original[k] ?? null;
    await api.patch('/api/auth/profile', { data }).catch(() => undefined);
    await api.dispose();
    fs.rmSync(STATE_FILE, { force: true });
  });

  test.describe('with session', () => {
    test.use({ storageState: STATE_FILE });

    test('/dashboard renders completeness and an honest recommendations state with no NaN', async ({ page }) => {
      const c = attachErrorCollectors(page);
      await gotoPage(page, '/dashboard');
      await expect(page.getByText(/loading your dashboard/i)).toHaveCount(0, { timeout: NAV_TIMEOUT });
      await expect(page.getByText(/failed to load dashboard/i)).toHaveCount(0);
      const body = await page.locator('body').innerText();
      expect(body).not.toMatch(/\bNaN\b|undefined|Infinity/);
      // Completeness meter (percentage) OR the profile is already 100%.
      const hasPercent = /\d{1,3}%/.test(body);
      expect(hasPercent, 'dashboard should show a completeness percentage').toBe(true);
      const hasRecs = await page.getByRole('heading', { name: /recommended for you/i }).count();
      const hasEmpty = await page.getByText(/no recommendations yet/i).count();
      expect(hasRecs + hasEmpty, 'recommendations section or empty state must render').toBeGreaterThan(0);
      assertClean(c, '/dashboard');
    });

    test('/onboarding/professional either short-circuits to /dashboard or renders the form', async ({ page }) => {
      const c = attachErrorCollectors(page);
      await gotoPage(page, '/onboarding/professional');
      await page.waitForLoadState('networkidle').catch(() => undefined);
      const url = page.url();
      if (/\/dashboard/.test(url)) {
        test.info().annotations.push({ type: 'observed', description: 'profile already searchable, redirected to /dashboard' });
      } else {
        expect(url).toMatch(/\/onboarding\/professional/);
        await expect(page.locator('#headline')).toBeVisible();
        await expect(page.getByRole('button', { name: /skip for now/i })).toBeVisible();
        await page.getByRole('button', { name: /skip for now/i }).click();
        await expect(page).toHaveURL(/\/dashboard/, { timeout: NAV_TIMEOUT });
      }
      assertClean(c, '/onboarding/professional');
    });

    test('settings: first/last name, phone and unicode persist across reload', async ({ page }) => {
      const c = attachErrorCollectors(page);
      await openSettings(page, 'personal');
      const first = `Zoë-${RUN_TAG}`;
      const last = 'Ñuñez Å';
      const phone = '555-0142';
      await page.getByPlaceholder('First name').fill(first);
      await page.getByPlaceholder('Last name').fill(last);
      await page.getByPlaceholder('555-1234').fill(phone);
      expect(await saveSettings(page)).toBe(200);
      await expect(page.getByText(/profile updated/i)).toBeVisible();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /save changes/i }).waitFor({ state: 'visible', timeout: NAV_TIMEOUT });
      await expect(page.getByPlaceholder('First name')).toHaveValue(first);
      await expect(page.getByPlaceholder('Last name')).toHaveValue(last);
      await expect(page.getByPlaceholder('555-1234')).toHaveValue(phone);
      const p = await fetchProfile(page);
      expect(p.firstName).toBe(first);
      expect(p.lastName).toBe(last);
      expect(p.phone).toBe(phone);
      assertClean(c, 'names persist');
    });

    test('settings: script tag in first name is neutralised and never executes', async ({ page }) => {
      const c = attachErrorCollectors(page);
      let dialogSeen = false;
      page.on('dialog', async (d) => { dialogSeen = true; await d.dismiss(); });
      await openSettings(page, 'personal');
      const xss = `<script>alert("${RUN_TAG}")</script>Hunter`;
      await page.getByPlaceholder('First name').fill(xss);
      expect(await saveSettings(page)).toBe(200);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /save changes/i }).waitFor({ state: 'visible', timeout: NAV_TIMEOUT });
      const stored = (await fetchProfile(page)).firstName as string | null;
      test.info().annotations.push({ type: 'observed', description: `stored firstName=${JSON.stringify(stored)}` });
      expect(stored ?? '').not.toMatch(/<script/i);
      expect(dialogSeen).toBe(false);
      expect(await page.locator('script:has-text("h0902")').count()).toBe(0);
      assertClean(c, 'xss name');
    });

    test('settings: whitespace-only first name is not saved as blank without feedback', async ({ page }) => {
      const c = attachErrorCollectors(page);
      await openSettings(page, 'personal');
      await page.getByPlaceholder('First name').fill('     ');
      const status = await saveSettings(page);
      const stored = (await fetchProfile(page)).firstName;
      test.info().annotations.push({ type: 'observed', description: `PATCH ${status}; stored firstName=${JSON.stringify(stored)}` });
      const errorShown = await page.getByText(/required|cannot be empty|enter your/i).first().isVisible().catch(() => false);
      // Either the UI rejects it, or the server keeps a non-blank name.
      expect(errorShown || (typeof stored === 'string' && stored.trim().length > 0),
        `whitespace-only name accepted silently (stored=${JSON.stringify(stored)})`).toBe(true);
      assertClean(c, 'whitespace name');
    });

    test('settings: very long first name (300 chars) is limited with feedback, not silently cut', async ({ page }) => {
      const c = attachErrorCollectors(page);
      await openSettings(page, 'personal');
      const long = 'A'.repeat(300);
      await page.getByPlaceholder('First name').fill(long);
      const status = await saveSettings(page);
      const stored = ((await fetchProfile(page)).firstName as string | null) ?? '';
      test.info().annotations.push({ type: 'observed', description: `PATCH ${status}; stored length=${stored.length}` });
      const maxAttr = await page.getByPlaceholder('First name').getAttribute('maxlength');
      const errorShown = await page.getByText(/too long|maximum|characters/i).first().isVisible().catch(() => false);
      expect(maxAttr !== null || errorShown || stored.length === 300,
        `300-char name silently truncated to ${stored.length} with no maxlength and no message`).toBe(true);
      assertClean(c, 'long name');
    });

    test('settings: headline, bio and years of experience persist', async ({ page }) => {
      const c = attachErrorCollectors(page);
      await openSettings(page, 'personal');
      const headline = `PMHNP-BC ${RUN_TAG} telehealth`;
      const bio = `Bio written by the ${RUN_TAG} hunt: adult and adolescent psychiatry, telehealth first.`;
      await page.getByPlaceholder('e.g. PMHNP-BC | 5 Years Telehealth').fill(headline);
      await page.getByPlaceholder('Brief summary of your experience and goals...').fill(bio);
      await yearsSelect(page).selectOption('7');
      expect(await saveSettings(page)).toBe(200);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /save changes/i }).waitFor({ state: 'visible', timeout: NAV_TIMEOUT });
      await expect(page.getByPlaceholder('e.g. PMHNP-BC | 5 Years Telehealth')).toHaveValue(headline);
      await expect(page.getByPlaceholder('Brief summary of your experience and goals...')).toHaveValue(bio);
      await expect(yearsSelect(page)).toHaveValue('7');
      const p = await fetchProfile(page);
      expect(p.headline).toBe(headline);
      expect(p.bio).toBe(bio);
      expect(p.yearsExperience).toBe(7);
      assertClean(c, 'professional persists');
    });

    test('settings: "New Grad (0)" years of experience persists as 0', async ({ page }) => {
      const c = attachErrorCollectors(page);
      await openSettings(page, 'personal');
      await yearsSelect(page).selectOption('0');
      expect(await saveSettings(page)).toBe(200);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /save changes/i }).waitFor({ state: 'visible', timeout: NAV_TIMEOUT });
      const p = await fetchProfile(page);
      test.info().annotations.push({ type: 'observed', description: `yearsExperience after save=${JSON.stringify(p.yearsExperience)}` });
      expect(p.yearsExperience, 'New Grad (0) should be stored as 0, not dropped to null').toBe(0);
      await expect(yearsSelect(page)).toHaveValue('0');
      assertClean(c, 'new grad zero');
    });

    test('settings: specialty chips persist', async ({ page }) => {
      const c = attachErrorCollectors(page);
      await openSettings(page, 'personal');
      // Normalise: start from the stored value and toggle two known presets on.
      const before = ((await fetchProfile(page)).specialties as string | null) ?? '';
      const chips = ['ADHD', 'Geriatric'];
      for (const chip of chips) {
        const selected = before.split(',').map((s) => s.trim()).includes(chip);
        if (!selected) await page.getByRole('button', { name: chip, exact: true }).click();
      }
      expect(await saveSettings(page)).toBe(200);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /save changes/i }).waitFor({ state: 'visible', timeout: NAV_TIMEOUT });
      const after = ((await fetchProfile(page)).specialties as string | null) ?? '';
      const list = after.split(',').map((s) => s.trim());
      for (const chip of chips) expect(list, `specialties=${after}`).toContain(chip);
      assertClean(c, 'specialties persist');
    });

    test('settings: preferred work mode and job type persist', async ({ page }) => {
      const c = attachErrorCollectors(page);
      await openSettings(page, 'personal');
      await page.getByRole('button', { name: 'Telehealth', exact: true }).click();
      await page.getByRole('button', { name: 'Per Diem', exact: true }).click();
      expect(await saveSettings(page)).toBe(200);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /save changes/i }).waitFor({ state: 'visible', timeout: NAV_TIMEOUT });
      const p = await fetchProfile(page);
      expect(p.preferredWorkMode).toBe('Telehealth');
      expect(p.preferredJobType).toBe('Per Diem');
      assertClean(c, 'job prefs persist');
    });

    test('settings: desired salary min/max persist', async ({ page }) => {
      const c = attachErrorCollectors(page);
      await openSettings(page, 'personal');
      await page.getByRole('button', { name: 'Per Year', exact: true }).click();
      await page.getByPlaceholder('Min').fill('140000');
      await page.getByPlaceholder('Max').fill('185000');
      expect(await saveSettings(page)).toBe(200);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /save changes/i }).waitFor({ state: 'visible', timeout: NAV_TIMEOUT });
      await expect(page.getByPlaceholder('Min')).toHaveValue('140000');
      await expect(page.getByPlaceholder('Max')).toHaveValue('185000');
      const p = await fetchProfile(page);
      expect(p.desiredSalaryMin).toBe(140000);
      expect(p.desiredSalaryMax).toBe(185000);
      expect(p.desiredSalaryType).toBe('yearly');
      assertClean(c, 'salary persists');
    });

    test('settings: "Per Hour" salary type persists across reload', async ({ page }) => {
      const c = attachErrorCollectors(page);
      await openSettings(page, 'personal');
      await page.getByRole('button', { name: 'Per Hour', exact: true }).click();
      // Placeholders switch to hourly hints as soon as the type is selected.
      await expect(page.getByPlaceholder('e.g. 60')).toBeVisible();
      await page.getByPlaceholder('e.g. 60').fill('65');
      await page.getByPlaceholder('e.g. 90').fill('95');
      const patchBodyP = page.waitForRequest((r) => r.url().includes('/api/auth/profile') && r.method() === 'PATCH', { timeout: NAV_TIMEOUT });
      expect(await saveSettings(page)).toBe(200);
      const sentBody = (await patchBodyP).postDataJSON() as Record<string, unknown>;
      test.info().annotations.push({ type: 'observed', description: `PATCH body keys=${Object.keys(sentBody).join(',')}` });
      await expect(page.getByText(/profile updated/i)).toBeVisible();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /save changes/i }).waitFor({ state: 'visible', timeout: NAV_TIMEOUT });
      const p = await fetchProfile(page);
      // The rate-type toggle only updates local state; handleSave never sends
      // desiredSalaryType, so "Per Hour" reverts to "Per Year" after reload
      // and 65/95 are shown as a yearly range.
      expect(p.desiredSalaryType, `desiredSalaryType after saving "Per Hour" (PATCH body keys: ${Object.keys(sentBody).join(',')})`).toBe('hourly');
      await expect(page.getByPlaceholder('e.g. 60')).toBeVisible();
      assertClean(c, 'hourly salary type');
    });

    test('settings: an 800-char professional summary is not silently truncated', async ({ page }) => {
      const c = attachErrorCollectors(page);
      await openSettings(page, 'personal');
      const bioField = page.getByPlaceholder('Brief summary of your experience and goals...');
      // The UI counter allows up to 1000 characters ("x/1000").
      const bio = (`${RUN_TAG} bio sentence number that pads the summary. `).repeat(20).slice(0, 800);
      expect(bio.length).toBe(800);
      await bioField.fill(bio);
      await expect(page.getByText('800/1000')).toBeVisible();
      expect(await saveSettings(page)).toBe(200);
      await expect(page.getByText(/profile updated/i)).toBeVisible();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /save changes/i }).waitFor({ state: 'visible', timeout: NAV_TIMEOUT });
      const stored = ((await fetchProfile(page)).bio as string | null) ?? '';
      test.info().annotations.push({ type: 'observed', description: `stored bio length=${stored.length}` });
      const errorShown = await page.getByText(/too long|maximum|500 characters/i).first().isVisible().catch(() => false);
      expect(errorShown || stored.length === 800,
        `800-char bio accepted with "Profile updated!" but only ${stored.length} chars were stored (UI counter says /1000)`).toBe(true);
      assertClean(c, 'bio truncation');
    });

    test('settings: salary min greater than max is rejected', async ({ page }) => {
      const c = attachErrorCollectors(page);
      await openSettings(page, 'personal');
      await page.getByRole('button', { name: 'Per Year', exact: true }).click();
      await page.getByPlaceholder('Min').fill('200000');
      await page.getByPlaceholder('Max').fill('100000');
      const status = await saveSettings(page);
      const p = await fetchProfile(page);
      test.info().annotations.push({ type: 'observed', description: `PATCH ${status}; stored min=${p.desiredSalaryMin} max=${p.desiredSalaryMax}` });
      const errorShown = await page.getByText(/min.*(greater|exceed|higher).*max|max.*(less|lower).*min|invalid.*range/i).first().isVisible().catch(() => false);
      const storedInverted = (p.desiredSalaryMin as number) === 200000 && (p.desiredSalaryMax as number) === 100000;
      expect(errorShown || !storedInverted, 'inverted salary range (min 200000 > max 100000) saved with "Profile updated!"').toBe(true);
      assertClean(c, 'salary inverted');
    });

    test('settings: custom availability date persists on the same calendar day', async ({ page }) => {
      const c = attachErrorCollectors(page);
      await openSettings(page, 'personal');
      await page.getByRole('button', { name: 'Custom', exact: true }).click();
      const dateInput = page.locator('input[type="date"]').first();
      await dateInput.fill('2027-03-15');
      expect(await saveSettings(page)).toBe(200);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /save changes/i }).waitFor({ state: 'visible', timeout: NAV_TIMEOUT });
      const p = await fetchProfile(page);
      expect(String(p.availableDate)).toMatch(/^2027-03-15/);
      // Mode is derived from the distance to today, so a far-future date must reopen as Custom.
      await expect(page.locator('input[type="date"]').first()).toHaveValue('2027-03-15');
      assertClean(c, 'availability persists');
    });

    test('settings: open-to-offers and profile-visible toggles persist and can be restored', async ({ page }) => {
      const c = attachErrorCollectors(page);
      await openSettings(page, 'personal');
      const before = await fetchProfile(page);
      await toggleButtonFor(page, 'Open to offers').click();
      await toggleButtonFor(page, 'Profile visible to employers').click();
      expect(await saveSettings(page)).toBe(200);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /save changes/i }).waitFor({ state: 'visible', timeout: NAV_TIMEOUT });
      const after = await fetchProfile(page);
      expect(after.openToOffers).toBe(!before.openToOffers);
      expect(after.profileVisible).toBe(!before.profileVisible);
      // restore
      await toggleButtonFor(page, 'Open to offers').click();
      await toggleButtonFor(page, 'Profile visible to employers').click();
      expect(await saveSettings(page)).toBe(200);
      const restored = await fetchProfile(page);
      expect(restored.openToOffers).toBe(before.openToOffers);
      expect(restored.profileVisible).toBe(before.profileVisible);
      assertClean(c, 'toggles persist');
    });

    test('settings: email is locked with an explanation (change-email policy UI)', async ({ page }) => {
      const c = attachErrorCollectors(page);
      await openSettings(page, 'personal');
      const emailInput = page.locator('input[type="email"][disabled]').first();
      await expect(emailInput).toHaveValue(SEEKER!.email);
      await expect(page.getByText(/email cannot be changed/i)).toBeVisible();
      assertClean(c, 'email locked');
    });

    test('settings: account tab shows role, member-since and password reset control', async ({ page }) => {
      const c = attachErrorCollectors(page);
      await openSettings(page, 'account');
      await expect(page.getByText('Account Type')).toBeVisible();
      await expect(page.getByText(/job seeker/i).first()).toBeVisible();
      await expect(page.getByText('Member Since')).toBeVisible();
      const body = await page.locator('body').innerText();
      expect(body).not.toMatch(/Invalid Date|NaN/);
      await expect(page.getByRole('button', { name: /send reset email/i })).toBeEnabled();
      assertClean(c, 'account tab');
    });

    test('settings: delete-account copy matches the 30-day soft-delete behaviour', async ({ page }) => {
      const c = attachErrorCollectors(page);
      await openSettings(page, 'account');
      await expect(page.getByRole('heading', { name: /danger zone/i })).toBeVisible();
      const danger = await page.getByText(/danger zone/i).locator('xpath=..').innerText();
      await page.getByRole('button', { name: /^delete account$/i }).first().click();
      await expect(page.getByRole('heading', { name: /delete account\?/i })).toBeVisible();
      const modalText = await page.getByRole('heading', { name: /delete account\?/i }).locator('xpath=../..').innerText();
      await page.getByRole('button', { name: /^cancel$/i }).click();
      await expect(page.getByRole('heading', { name: /delete account\?/i })).toHaveCount(0);
      // DELETE /api/auth/delete-account soft-deletes with a 30-day restore window
      // and logging in again restores the account. The UI must not tell the
      // user the opposite.
      const copy = `${danger}\n${modalText}`;
      test.info().annotations.push({ type: 'observed', description: copy.replace(/\n+/g, ' | ') });
      expect(copy, 'delete copy claims permanence but the account is restorable for 30 days').not.toMatch(/no going back|cannot be undone/i);
      assertClean(c, 'delete copy');
    });

    test('settings: weekly AI digest preference persists across reload', async ({ page }) => {
      const c = attachErrorCollectors(page);
      await openSettings(page, 'account');
      const digestCard = () => page.getByText('Weekly AI job match digest').locator('xpath=..');
      const target = digestCard().locator('input[type="checkbox"]');
      await expect(target).toBeEnabled({ timeout: NAV_TIMEOUT });
      const before = await target.isChecked();
      const postP = page.waitForResponse((r) => r.url().includes('/api/user/email-preferences/ai-digest') && r.request().method() === 'POST', { timeout: NAV_TIMEOUT });
      await target.click();
      expect((await postP).status()).toBe(200);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /save changes/i }).waitFor({ state: 'visible', timeout: NAV_TIMEOUT });
      const after = digestCard().locator('input[type="checkbox"]');
      await expect(after).toBeEnabled({ timeout: NAV_TIMEOUT });
      await expect(after).toBeChecked({ checked: !before });
      const apiState = await (await page.request.get('/api/user/email-preferences/ai-digest')).json();
      expect(apiState.enabled).toBe(!before);
      // restore
      const restoreP = page.waitForResponse((r) => r.url().includes('/api/user/email-preferences/ai-digest') && r.request().method() === 'POST', { timeout: NAV_TIMEOUT });
      await after.click();
      expect((await restoreP).status()).toBe(200);
      assertClean(c, 'ai digest');
    });

    test('settings: newsletter toggle persists across reload', async ({ page }) => {
      const c = attachErrorCollectors(page);
      await openSettings(page, 'account');
      const toggle = page.getByRole('button', { name: /email newsletter (enabled|disabled)/i });
      await expect(toggle).toBeEnabled({ timeout: NAV_TIMEOUT });
      const before = (await toggle.getAttribute('aria-pressed')) === 'true';
      const postP = page.waitForResponse((r) => r.url().endsWith('/api/newsletter') && r.request().method() === 'POST', { timeout: NAV_TIMEOUT });
      await toggle.click();
      const post = await postP;
      expect(post.status(), `POST /api/newsletter -> ${post.status()} ${await post.text()}`).toBeLessThan(400);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /save changes/i }).waitFor({ state: 'visible', timeout: NAV_TIMEOUT });
      const again = page.getByRole('button', { name: /email newsletter (enabled|disabled)/i });
      await expect(again).toBeEnabled({ timeout: NAV_TIMEOUT });
      await expect(again).toHaveAttribute('aria-pressed', String(!before));
      const status = await (await page.request.get(`/api/newsletter/status?email=${encodeURIComponent(SEEKER!.email)}`)).json();
      expect(status.optIn).toBe(!before);
      // restore
      const restoreP = page.waitForResponse((r) => r.url().endsWith('/api/newsletter') && r.request().method() === 'POST', { timeout: NAV_TIMEOUT });
      await again.click();
      await restoreP;
      assertClean(c, 'newsletter toggle');
    });

    test('settings: credentials tab can add and remove a state license', async ({ page }) => {
      const c = attachErrorCollectors(page);
      await openSettings(page, 'credentials');
      const number = `LIC-${RUN_TAG}-${Date.now()}`;
      await page.getByRole('button', { name: /add license/i }).first().click();
      const typeSelect = page.locator('select:has(option:has-text("Select type"))').first();
      const stateSelect = page.locator('select:has(option:has-text("Select state"))').first();
      await typeSelect.selectOption({ index: 1 });
      await stateSelect.selectOption('TX');
      await page.getByPlaceholder('Enter license number').fill(number);
      const postP = page.waitForResponse((r) => r.url().endsWith('/api/profile/licenses') && r.request().method() === 'POST', { timeout: NAV_TIMEOUT });
      await page.getByRole('button', { name: /^save( license)?$/i }).last().click();
      expect((await postP).status()).toBeLessThan(300);
      await expect(page.getByText(/license added/i)).toBeVisible();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /save changes/i }).waitFor({ state: 'visible', timeout: NAV_TIMEOUT });
      // LicensesSection masks everything but the last four characters
      // (components/settings/LicensesSection.tsx:52 maskNumber), so assert the
      // masked form rather than the raw number.
      const masked = '•'.repeat(number.length - 4) + number.slice(-4);
      await expect(page.getByText(masked, { exact: true })).toBeVisible({ timeout: NAV_TIMEOUT });
      // cleanup via API so the shared account stays tidy
      const list = await (await page.request.get('/api/profile/licenses')).json();
      const rows: Array<{ id: string; licenseNumber: string }> = Array.isArray(list) ? list : list.licenses ?? [];
      for (const row of rows.filter((r) => r.licenseNumber === number)) {
        const del = await page.request.delete(`/api/profile/licenses/${row.id}`);
        expect(del.status()).toBeLessThan(300);
      }
      assertClean(c, 'license add');
    });

    test('cross-origin writes are rejected on the profile sub-resources, not just /api/auth/profile', async ({ page }) => {
      const c = attachErrorCollectors(page);
      await gotoPage(page, '/dashboard');
      const evil = { Origin: 'https://evil.example', Referer: 'https://evil.example/' };

      // Control: the main profile endpoint calls verifyCsrf() and must 403.
      const control = await page.request.patch('/api/auth/profile', {
        headers: evil,
        data: { headline: `csrf-probe-${RUN_TAG}` },
      });
      expect(control.status(), 'PATCH /api/auth/profile should reject a cross-origin write').toBe(403);

      // app/api/profile/licenses/route.ts (and every other app/api/profile/*
      // writer) never calls verifyCsrf, so the same forged-Origin write is
      // accepted. Only the Supabase cookie's SameSite=Lax stands between this
      // and a real cross-site write.
      const probeNumber = `CSRF-${RUN_TAG}-${Date.now()}`;
      const forged = await page.request.post('/api/profile/licenses', {
        headers: evil,
        data: { licenseType: 'RN', licenseNumber: probeNumber, licenseState: 'TX', status: 'active' },
      });
      const forgedStatus = forged.status();
      test.info().annotations.push({ type: 'observed', description: `POST /api/profile/licenses with Origin: https://evil.example -> ${forgedStatus}` });
      if (forgedStatus < 300) {
        // clean up whatever the forged write created before failing
        const list = await (await page.request.get('/api/profile/licenses')).json();
        const rows: Array<{ id: string; licenseNumber: string }> = Array.isArray(list) ? list : list.licenses ?? [];
        for (const row of rows.filter((r) => r.licenseNumber === probeNumber)) {
          await page.request.delete(`/api/profile/licenses/${row.id}`).catch(() => undefined);
        }
      }
      expect(
        forgedStatus,
        `POST /api/profile/licenses accepted a write with Origin: https://evil.example (got ${forgedStatus}); app/api/profile/* has no verifyCsrf()`,
      ).toBe(403);
      assertClean(c, 'profile csrf');
    });

    test('/api/profile/export returns the profile JSON for the seeker', async ({ page }) => {
      const c = attachErrorCollectors(page);
      await gotoPage(page, '/dashboard');
      const res = await page.request.get('/api/profile/export');
      expect(res.status()).toBe(200);
      expect(res.headers()['content-type']).toMatch(/application\/json/);
      const json = await res.json();
      expect(json.personal?.email).toBe(SEEKER!.email);
      for (const key of ['eeo', 'credentials', 'education', 'workExperience', 'preferences', 'meta']) {
        expect(json, `export missing ${key}`).toHaveProperty(key);
      }
      assertClean(c, 'profile export');
    });

    test('/data-request while logged in prefills the email and files an access request', async ({ page }) => {
      const c = attachErrorCollectors(page);
      await gotoPage(page, '/data-request');
      await expect(page.locator('#email')).toHaveValue(SEEKER!.email, { timeout: NAV_TIMEOUT });
      await page.locator('#type').selectOption('access');
      await page.locator('#description').fill(`Automated ${RUN_TAG} hunt request. Safe to close.`);
      const resP = page.waitForResponse((r) => r.url().includes('/api/data-request') && r.request().method() === 'POST', { timeout: NAV_TIMEOUT });
      await page.getByRole('button', { name: /submit/i }).click();
      const res = await resP;
      test.skip(res.status() === 429, 'data-request rate limit (3/h per IP) already consumed on this shared dev server');
      expect(res.status(), await res.text()).toBe(201);
      await expect(page.getByText(/request received/i)).toBeVisible({ timeout: NAV_TIMEOUT });
      assertClean(c, 'data-request');
    });

    test('logged-in copy on /dashboard, /settings and /data-request follows the copy rules', async ({ page }) => {
      const c = attachErrorCollectors(page);
      const offenders: string[] = [];
      const scan = async (label: string) => {
        const text = await page.locator('body').innerText();
        for (const line of text.split('\n')) {
          if (DASH_RE.test(line) || BANNED_COPY_RE.test(line)) offenders.push(`${label}: ${line.trim()}`);
        }
      };
      await gotoPage(page, '/dashboard');
      await expect(page.getByText(/loading your dashboard/i)).toHaveCount(0, { timeout: NAV_TIMEOUT });
      await scan('/dashboard');
      await openSettings(page, 'personal');
      await scan('/settings?tab=personal');
      await openSettings(page, 'account');
      await expect(page.getByRole('button', { name: /email newsletter (enabled|disabled)/i })).toBeEnabled({ timeout: NAV_TIMEOUT });
      await scan('/settings?tab=account');
      await gotoPage(page, '/data-request');
      await scan('/data-request');
      expect(offenders, 'no em/en dashes, "founder" or "Pavan" in visible copy').toEqual([]);
      assertClean(c, 'logged-in copy scan');
    });
  });
});

/* ── sign out + auth redirects ───────────────────────────────────────────── */

test.describe('sign out and auth redirects', () => {
  test.use({ storageState: EMPTY_STATE });
  test.skip(!SEEKER, 'E2E_SEEKER_EMAIL / E2E_SEEKER_PASS not set');

  test('sign out from the user menu clears the session', async ({ page }) => {
    const c = attachErrorCollectors(page);
    await login(page, SEEKER!);
    await page.locator('button.um-trigger').first().click();
    await page.getByRole('button', { name: /sign out/i }).click();
    // UserMenu pushes '/', but signing out from /dashboard also trips that
    // page's own client-side auth guard, so the browser can settle on /login.
    // Either destination means "signed out"; what matters is the session.
    await expect(page).toHaveURL(/localhost:\d+\/(\?.*)?$|\/login/, { timeout: NAV_TIMEOUT });
    const me = await (await page.request.get('/api/auth/me')).json();
    expect(me.id).toBeNull();
    await gotoPage(page, '/dashboard');
    await expect(page).toHaveURL(/\/login/, { timeout: NAV_TIMEOUT });
    assertClean(c, 'sign out');
  });

  test('anonymous /saved renders a sign-in prompt instead of an empty localStorage list', async ({ page }) => {
    // app/saved/page.tsx is localStorage-backed and has no auth gate: an
    // anonymous visitor gets "No saved jobs yet" with no way to sign in from
    // the page body. Marked test.fail() so the suite stays green while the
    // behaviour is documented.
    test.fail(true, 'known: /saved is not auth-gated and offers no inline sign-in');
    const c = attachErrorCollectors(page);
    await gotoPage(page, '/saved');
    await page.waitForLoadState('networkidle').catch(() => undefined);
    const redirected = /\/login/.test(page.url());
    const inlineLogin = await page.locator('main a[href*="/login"]').count();
    test.info().annotations.push({ type: 'observed', description: `url=${page.url()} inlineLoginLinks=${inlineLogin}` });
    expect(redirected || inlineLogin > 0, 'anonymous /saved should redirect or offer sign-in').toBe(true);
    assertClean(c, 'anonymous saved');
  });

  for (const target of ['/dashboard', '/settings', '/messages', '/my-applications']) {
    test(`anonymous ${target} is gated and login returns to ${target}`, async ({ page }) => {
      const c = attachErrorCollectors(page);
      await gotoPage(page, target);
      await page.waitForLoadState('networkidle').catch(() => undefined);
      // Client-side gates (settings/messages) redirect after their profile
      // fetch 401s, so give the URL a moment to settle.
      await page.waitForURL(/\/login/, { timeout: 15_000, waitUntil: 'domcontentloaded' }).catch(() => undefined);
      let url = new URL(page.url());
      let gate: 'redirect' | 'inline' | 'open' = 'redirect';
      if (!url.pathname.startsWith('/login')) {
        // Some surfaces render an inline sign-in prompt in the page body
        // (not the header) instead of redirecting.
        const inlineLogin = page.locator('main a[href*="/login"], a[href*="/login?"]').first();
        if (await inlineLogin.count()) {
          gate = 'inline';
          const href = await inlineLogin.getAttribute('href');
          test.info().annotations.push({ type: 'observed', description: `${target} stayed at ${url.pathname}; inline login href=${href}` });
          await inlineLogin.click();
          await page.waitForURL(/\/login/, { timeout: NAV_TIMEOUT, waitUntil: 'domcontentloaded' });
          url = new URL(page.url());
        } else {
          gate = 'open';
          test.info().annotations.push({ type: 'observed', description: `${target} rendered for an anonymous visitor at ${url.pathname} with no sign-in prompt` });
        }
      }
      expect(gate, `${target} is reachable anonymously (no redirect, no inline sign-in prompt)`).not.toBe('open');
      test.info().annotations.push({ type: 'observed', description: `gate=${gate} login url=${url.pathname}${url.search}` });
      await page.locator('#login-email').waitFor({ state: 'visible', timeout: NAV_TIMEOUT });
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await page.locator('#login-email').fill(SEEKER!.email);
      await page.locator('#login-password').fill(SEEKER!.password);
      await page.getByRole('button', { name: /^sign in/i }).click();
      await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: NAV_TIMEOUT, waitUntil: 'domcontentloaded' });
      expect(new URL(page.url()).pathname, `after login the user should be returned to ${target} (login url was ${url.pathname}${url.search})`).toBe(target);
      assertClean(c, `gate ${target}`);
    });
  }
});

/* ── fresh account: signup, edge inputs, delete + restore ─────────────────── */

test.describe('fresh seeker account lifecycle', () => {
  test.use({ storageState: EMPTY_STATE });
  test.skip(AGAINST_PROD, 'no mutations against production');

  test('fresh signup records the post-signup state (auto-login vs confirmation required)', async ({ page }) => {
    const c = attachErrorCollectors(page);
    const email = uniqueEmail('seeker');
    const result = await signupSeeker(page, email);
    test.info().annotations.push({ type: 'observed', description: JSON.stringify(result) });
    expect(result.alertText, 'signup should not error').toBe('');
    if (result.confirmationRequired) {
      await expect(page.getByText(email)).toBeVisible();
      await expect(page.getByRole('button', { name: /resend/i })).toBeVisible();
    } else {
      expect(result.url).toMatch(/\/onboarding\/professional|\/dashboard/);
      const me = await (await page.request.get('/api/auth/me')).json();
      expect(me.email).toBe(email);
      expect(me.role).toBe('job_seeker');
    }
    assertClean(c, 'fresh signup');
  });

  test('whitespace-only names are rejected at signup', async ({ page }) => {
    const c = attachErrorCollectors(page);
    const email = uniqueEmail('seeker');
    const result = await signupSeeker(page, email, '   ', '   ');
    test.info().annotations.push({ type: 'observed', description: JSON.stringify(result) });
    const stillOnSignup = /\/signup/.test(result.url) && !result.confirmationRequired;
    expect(stillOnSignup && result.alertText !== '', `whitespace-only names accepted: ${JSON.stringify(result)}`).toBe(true);
    assertClean(c, 'whitespace signup');
  });

  test('soft-deleted account whose restore probe fails still gets full access (no deletedAt gate)', async ({ page }) => {
    const c = attachErrorCollectors(page);
    const email = uniqueEmail('seeker');
    const creds = { email, password: TEST_PASSWORD };
    const result = await signupSeeker(page, email, 'Ghost', 'Account');
    test.skip(result.confirmationRequired, 'signup requires email confirmation; cannot log the fresh account in');
    expect(result.alertText).toBe('');

    const del = await page.request.delete('/api/auth/delete-account');
    test.skip(del.status() === 429, 'delete-account rate limit (3/h per IP) already consumed on this shared dev server');
    expect(del.status(), await del.text()).toBe(200);
    await page.context().clearCookies();

    // Simulate the restore probe failing (it is rate limited to 5/h per IP and
    // LoginContent ignores its result). The login must not proceed as if the
    // account were healthy: nothing in requireAuth / middleware / /api/auth/me
    // checks deletedAt, so the user keeps full access while purge-soft-deleted
    // hard-deletes them 30 days later.
    await page.route('**/api/auth/restore-account', (route) => route.fulfill({ status: 429, contentType: 'application/json', body: '{"error":"Too many requests"}' }));
    await login(page, creds);
    await expect(page).toHaveURL(/\/dashboard|\/onboarding/, { timeout: NAV_TIMEOUT });
    const profile = await fetchProfile(page);
    const me = await (await page.request.get('/api/auth/me')).json();
    test.info().annotations.push({ type: 'observed', description: `deletedAt=${profile.deletedAt} purgeAt=${profile.purgeAt} emailSuppressed=${profile.emailSuppressed} me.id=${me.id}` });
    await gotoPage(page, '/settings?tab=account');
    const settingsOpen = await page.getByRole('button', { name: /save changes/i }).isVisible().catch(() => false);
    const warned = await page.getByText(/scheduled for deletion|restore your account|account deleted/i).first().isVisible().catch(() => false);
    expect(
      !(profile.deletedAt && settingsOpen && !warned),
      `account is soft-deleted (deletedAt=${profile.deletedAt}, purgeAt=${profile.purgeAt}) yet /dashboard and /settings work normally with no restore prompt`,
    ).toBe(true);
    assertClean(c, 'deleted account access');
  });

  test('delete account soft-deletes, blocks the session, and re-login restores it', async ({ page }) => {
    const c = attachErrorCollectors(page);
    const email = uniqueEmail('seeker');
    const creds = { email, password: TEST_PASSWORD };
    const result = await signupSeeker(page, email, 'Delete', 'Me');
    test.skip(result.confirmationRequired, 'signup requires email confirmation; cannot log the fresh account in');
    expect(result.alertText).toBe('');

    await openSettings(page, 'account');
    await page.getByRole('button', { name: /^delete account$/i }).first().click();
    const delP = page.waitForResponse((r) => r.url().includes('/api/auth/delete-account'), { timeout: NAV_TIMEOUT });
    await page.getByRole('button', { name: /^delete account$/i }).last().click();
    const del = await delP;
    test.skip(del.status() === 429, 'delete-account rate limit (3/h per IP) already consumed on this shared dev server');
    expect(del.status(), await del.text()).toBe(200);
    const body = await del.json();
    expect(body.graceDays).toBe(30);
    await expect(page).toHaveURL(/\/$/, { timeout: NAV_TIMEOUT });

    // Session is gone
    await gotoPage(page, '/dashboard');
    await expect(page).toHaveURL(/\/login/, { timeout: NAV_TIMEOUT });

    // Re-login inside the grace window restores the account
    const restoreStatuses: number[] = [];
    page.on('response', (r) => { if (r.url().includes('/api/auth/restore-account')) restoreStatuses.push(r.status()); });
    await login(page, creds);
    await expect.poll(() => restoreStatuses.length, { timeout: 20_000 }).toBeGreaterThan(0);
    test.info().annotations.push({ type: 'observed', description: `restore-account statuses=${restoreStatuses.join(',')}` });
    expect(restoreStatuses, 'restore-account must succeed (200) for a soft-deleted account').toContain(200);
    const profile = await fetchProfile(page);
    expect(profile.deletedAt ?? null).toBeNull();
    expect(profile.email).toBe(email);
    assertClean(c, 'delete + restore');
  });
});
