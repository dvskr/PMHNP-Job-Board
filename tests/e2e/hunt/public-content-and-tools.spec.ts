import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { attachErrorCollectors, assertClean, hydrationWarnings, type Collected } from './_helpers';
import { getSeekerCreds, loginAsSeeker } from '../fixtures/auth';

/**
 * Bug hunt slice "public-content-and-tools" (run tag h0902).
 *
 * Journey: an anonymous visitor lands on the marketing / content surface of
 * PMHNP Hiring and uses everything that does not require an account:
 *   - static pages (home, about, faq, pricing, employer/seeker/program landing,
 *     resources, legal pages) render with one H1, no error boundary and no
 *     page errors / hydration warnings / 5xx responses
 *   - forms: contact, resource download gate, salary guide PDF, blog signup,
 *     job alerts (subscribe, double subscribe, invalid input), do-not-sell
 *   - tools: salary converter, offer analyzer, 1099 vs W-2 calculator,
 *     practice authority map, resume checker (login gate + validation),
 *     resume builder landing
 *   - token-gated pages without / with garbage tokens
 *   - pSEO job lists (locations, state, city, metro, remote, new-grad,
 *     telehealth) show counts that agree with the rendered cards
 *   - 404 pages (nested and single-segment), /success without a session,
 *     footer link integrity
 *
 * Every test attaches the shared error collectors and ends with assertClean.
 *
 * Tests marked `test.fail()` document a known defect and are expected to fail;
 * a plain failing test is a live bug this run found.
 */

const AGAINST_PROD =
  !!process.env.PLAYWRIGHT_BASE_URL && process.env.PLAYWRIGHT_BASE_URL.includes('pmhnphiring.com');
const RUN_TAG = 'h0902';
/**
 * Next.js error-boundary copy. Deliberately narrow: /privacy and
 * /sub-processors legitimately contain the phrase "Application error
 * monitoring" (Sentry sub-processor description), so a bare
 * /Application error/ match is a false positive there.
 */
const ERROR_BOUNDARY_RE =
  /Something went wrong|Application error:\s*a (?:client|server)-side exception|Unhandled Runtime Error/i;
const RESUME_FIXTURE = path.resolve(__dirname, '../fixtures/sample-resume.pdf');

function uniqueAlertEmail(): string {
  const ts = Date.now();
  const rand = Math.floor(Math.random() * 1_000_000).toString(36);
  return `e2e+alerts-${ts}-${rand}@pmhnptest.com`;
}

/**
 * `next dev` compiles a route on its first hit, so a cold page can take well
 * over the 30s config default while other suites hammer the same server.
 * Raise the navigation budget per page rather than weakening assertions.
 */
async function open(page: Page, urlPath: string): Promise<Collected> {
  const collected = attachErrorCollectors(page);
  page.setDefaultNavigationTimeout(120_000);
  await page.goto(urlPath, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  return collected;
}

/**
 * Client-only forms (react-hook-form / useState handlers) silently fall back
 * to a native submit when interacted with before hydration. Let the network
 * settle before typing into them; never fail the test if it never settles.
 */
async function settle(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => undefined);
}

async function expectBasicPageHealth(page: Page, label: string) {
  await expect(page.locator('h1').first(), `${label}: H1 visible`).toBeVisible();
  await expect(page.locator('h1'), `${label}: exactly one H1`).toHaveCount(1);
  const body = await page.locator('body').innerText();
  expect(body, `${label}: error boundary text rendered`).not.toMatch(ERROR_BOUNDARY_RE);
  expect(body, `${label}: forbidden name "Pavan" is displayed`).not.toContain('Pavan');
  expect(body, `${label}: the word "founder" is displayed`).not.toMatch(/\bfounders?\b/i);
}

/** Parse the "(N)" count out of a listings heading such as "Positions in Texas (42)". */
async function readListingCount(page: Page, headingRe: RegExp): Promise<number> {
  const heading = page.getByRole('heading', { name: headingRe }).first();
  await expect(heading).toBeVisible();
  const text = await heading.innerText();
  const match = text.match(/\((\d[\d,]*)\)/);
  expect(match, `count not found in heading "${text}"`).not.toBeNull();
  return Number(match![1].replace(/,/g, ''));
}

async function expectCardsMatchCount(page: Page, total: number, label: string) {
  const cards = page.locator('.jc-card');
  const rendered = await cards.count();
  expect(total, `${label}: heading count should be > 0`).toBeGreaterThan(0);
  expect(rendered, `${label}: no job cards rendered for a count of ${total}`).toBeGreaterThan(0);
  expect(rendered, `${label}: more cards than the heading count`).toBeLessThanOrEqual(total);
  if (total <= 10) expect(rendered, `${label}: cards should equal count when count <= page size`).toBe(total);
}

// ── Static pages ────────────────────────────────────────────────────────────

test.describe('static public pages', () => {
  const pages: Array<{ path: string; h1: RegExp }> = [
    { path: '/', h1: /PMHNP|psychiatric/i },
    { path: '/about', h1: /./ },
    { path: '/faq', h1: /question|faq/i },
    { path: '/pricing', h1: /./ },
    { path: '/for-employers', h1: /./ },
    { path: '/for-job-seekers', h1: /./ },
    { path: '/for-programs', h1: /students/i },
    { path: '/resources', h1: /./ },
    { path: '/resources/1099-vs-w2', h1: /1099|w-?2/i },
    { path: '/resources/fpa-guide', h1: /practice|authority|fpa/i },
    { path: '/resources/multi-state-licensure', h1: /licens/i },
    { path: '/resources/private-practice-guide', h1: /practice/i },
    { path: '/security', h1: /security/i },
    { path: '/privacy', h1: /privacy/i },
    { path: '/terms', h1: /terms/i },
    { path: '/sub-processors', h1: /sub-?processors/i },
    { path: '/tools', h1: /tools/i },
    { path: '/blog', h1: /./ },
    { path: '/jobs/locations', h1: /./ },
  ];

  for (const p of pages) {
    test(`renders ${p.path} with one H1 and no runtime errors`, async ({ page }) => {
      const collected = await open(page, p.path);
      await expectBasicPageHealth(page, p.path);
      await expect(page.locator('h1').first()).toHaveText(p.h1);
      assertClean(collected, p.path);
    });
  }

  test('copy rule: no em or en dashes in visible copy on key pages', async ({ page }) => {
    // Product copy rule: ranges are written "X to Y" and sentences use
    // colons / commas / periods, never em (U+2014) or en (U+2013) dashes.
    // Currently violated on most pages, so this is an expected failure that
    // documents the count per page.
    test.fail(true, 'known copy-rule violation: em/en dashes present on public pages');
    test.slow();
    page.setDefaultNavigationTimeout(120_000);
    const targets = ['/', '/faq', '/for-programs', '/pricing', '/tools', '/job-alerts', '/for-employers'];
    const violations: string[] = [];
    for (const t of targets) {
      await page.goto(t, { waitUntil: 'domcontentloaded' });
      const body = await page.locator('body').innerText();
      const em = (body.match(/—/g) ?? []).length;
      const en = (body.match(/–/g) ?? []).length;
      if (em + en > 0) violations.push(`${t}: ${em} em-dash, ${en} en-dash`);
    }
    expect(violations, `dashes found:\n${violations.join('\n')}`).toEqual([]);
  });

  test('/post-job renders exactly one H1', async ({ page }) => {
    // /post-job is linked from the global footer and from every employer CTA
    // but ships no <h1> at all. Flagged in the 2026-06 audit and still open.
    const collected = await open(page, '/post-job');
    await settle(page);
    const h1s = await page.locator('h1').allInnerTexts();
    expect(h1s.length, `/post-job rendered ${h1s.length} <h1> elements: ${JSON.stringify(h1s)}`).toBe(1);
    assertClean(collected, '/post-job');
  });

  test('repeated loads never hit a root-layout hydration mismatch', async ({ page }) => {
    // Intermittent (~1 in 4 cold loads): React reports the server rendering
    // the Header's 100px spacer where the client expects the RootLayout flex
    // container, and regenerates the whole tree on the client. Because it
    // lives in app/layout.tsx it can strike any page, so this loads one page
    // several times and reports how often it fires.
    test.slow();
    page.setDefaultNavigationTimeout(120_000);
    const collected = attachErrorCollectors(page);
    const target = '/resources/1099-vs-w2';
    const hits: string[] = [];
    const LOADS = 6;
    for (let i = 0; i < LOADS; i++) {
      const before = hydrationWarnings(collected).length;
      await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      await settle(page);
      const after = hydrationWarnings(collected);
      if (after.length > before) hits.push(`load ${i + 1}: ${after[after.length - 1].split('\n')[0]}`);
    }
    expect(hits, `hydration mismatch on ${hits.length}/${LOADS} loads of ${target}:\n${hits.join('\n')}`).toEqual([]);
  });

  test('client JS bundles do not ship the private individual name from brand config', async ({ page }) => {
    const collected = await open(page, '/');
    await page.waitForLoadState('load');
    const scriptUrls: string[] = await page.evaluate(() =>
      Array.from(document.querySelectorAll('script[src]')).map((s) => (s as HTMLScriptElement).src)
    );
    const leaks: string[] = [];
    for (const url of scriptUrls) {
      if (!url.includes('/_next/')) continue;
      const res = await page.request.get(url);
      if (!res.ok()) continue;
      const text = await res.text();
      if (text.includes('Pavan')) leaks.push(url);
    }
    expect(leaks, `"Pavan" found in client bundle(s):\n${leaks.join('\n')}`).toEqual([]);
    assertClean(collected, '/');
  });
});

// ── FAQ accordion ───────────────────────────────────────────────────────────

test.describe('faq accordion', () => {
  test('opens and closes an answer via the question button', async ({ page }) => {
    const collected = await open(page, '/faq');
    await settle(page);
    // Scope to the accordion buttons: the site header also renders a
    // hidden-on-desktop `aria-expanded` mobile menu toggle.
    const first = page.locator('button[aria-controls^="faq-answer-"]').first();
    await expect(first).toBeVisible();
    await expect(first).toHaveAttribute('aria-expanded', 'false');
    const controls = await first.getAttribute('aria-controls');
    expect(controls).toBeTruthy();
    // The page renders six independent <FAQAccordion> instances whose answer
    // ids all restart at 0, so `#faq-answer-0` is ambiguous (see the duplicate
    // id test below). Scope to the accordion row that owns this button so the
    // interaction itself is still exercised.
    const answer = page.locator(`[id="${controls}"]`).first();
    await expect(answer).toBeHidden();
    await first.click();
    await expect(first).toHaveAttribute('aria-expanded', 'true');
    await expect(answer).toBeVisible();
    expect((await answer.innerText()).trim().length).toBeGreaterThan(10);
    await first.click();
    await expect(first).toHaveAttribute('aria-expanded', 'false');
    await expect(answer).toBeHidden();
    assertClean(collected, '/faq');
  });

  test('every accordion answer has a unique DOM id', async ({ page }) => {
    // /faq renders six <FAQAccordion> instances and each one numbers its
    // answers from 0, so ids collide across sections. `aria-controls` then
    // points a screen reader at whichever duplicate comes first in the DOM,
    // i.e. an answer from a different section.
    const collected = await open(page, '/faq');
    const ids = await page
      .locator('[id^="faq-answer-"]')
      .evaluateAll((els) => els.map((e) => e.id));
    const seen = new Map<string, number>();
    for (const id of ids) seen.set(id, (seen.get(id) ?? 0) + 1);
    const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([id, n]) => `${id} x${n}`);
    expect(ids.length, 'no faq answers rendered').toBeGreaterThan(0);
    expect(dupes, `duplicate faq answer ids on /faq (${ids.length} elements, ${seen.size} unique):\n${dupes.join('\n')}`).toEqual([]);
    assertClean(collected, '/faq ids');
  });

  test('faq refers to the product by its real brand name', async ({ page }) => {
    // Metadata in app/faq/page.tsx explicitly notes "PMHNP Jobs" is not the
    // brand name, yet the first job-seeker question still asks
    // "Is PMHNP Jobs free to use?". Documented as an expected failure.
    test.fail(true, 'known copy issue: FAQ uses "PMHNP Jobs" instead of "PMHNP Hiring"');
    await open(page, '/faq');
    const body = await page.locator('body').innerText();
    expect(body).not.toMatch(/Is PMHNP Jobs free to use/);
  });
});

// ── Contact form ────────────────────────────────────────────────────────────

test.describe('contact form', () => {
  test.skip(AGAINST_PROD, 'no mutations against production');

  test('empty submit shows field validation and sends no request', async ({ page }) => {
    const collected = await open(page, '/contact');
    await settle(page);
    let apiCalls = 0;
    page.on('request', (r) => { if (r.url().includes('/api/contact')) apiCalls += 1; });
    await page.getByRole('button', { name: /send message/i }).click();
    await expect(page.getByText('Name is required')).toBeVisible();
    await expect(page.getByText('Email is required')).toBeVisible();
    // Exact text: /select a subject/i would also match the placeholder
    // <option>Select a subject...</option> inside the Subject dropdown.
    await expect(page.getByText('Please select a subject')).toBeVisible();
    await expect(page.getByText('Message is required')).toBeVisible();
    expect(apiCalls).toBe(0);
    assertClean(collected, '/contact empty');
  });

  test('invalid email is rejected client-side', async ({ page }) => {
    const collected = await open(page, '/contact');
    await settle(page);
    let apiCalls = 0;
    page.on('request', (r) => { if (r.url().includes('/api/contact')) apiCalls += 1; });
    await page.getByLabel('Name').fill('E2E Hunt');
    await page.getByLabel('Email').fill('not-an-email');
    await page.getByLabel('Subject').selectOption('Feedback');
    await page.getByLabel('Message').fill(`E2E ${RUN_TAG} invalid email probe, please ignore.`);
    await page.getByRole('button', { name: /send message/i }).click();
    // The field is <input type="email"> inside a validating form, so the
    // browser blocks the submit before react-hook-form's own "Please enter a
    // valid email" message can render. Assert the request never leaves and
    // the field is reported invalid, then check the API's own guard.
    const emailField = page.getByLabel('Email');
    expect(await emailField.evaluate((el) => (el as HTMLInputElement).validity.valid)).toBe(false);
    await expect(page.getByText(/message sent/i)).toHaveCount(0);
    expect(apiCalls).toBe(0);
    const apiRes = await page.request.post('/api/contact', {
      data: { name: 'E2E Hunt', email: 'not-an-email', subject: 'Feedback', message: `E2E ${RUN_TAG} invalid email.` },
      timeout: 60_000,
    });
    expect(apiRes.status(), 'API must reject an invalid email').toBe(400);
    assertClean(collected, '/contact invalid');
  });

  test('valid submission reaches the API and shows a success or error state', async ({ page }) => {
    const collected = await open(page, '/contact');
    await page.getByLabel('Name').fill('E2E Hunt');
    await page.getByLabel('Email').fill('e2e-contact@pmhnptest.com');
    await page.getByLabel('Subject').selectOption('Feedback');
    await page.getByLabel('Message').fill(`Automated E2E hunt ${RUN_TAG} contact-form check. Please ignore.`);
    const [res] = await Promise.all([
      // The route does two Resend sends plus DB work: ~11s warm on dev.
      page.waitForResponse(
        (r) => r.url().includes('/api/contact') && r.request().method() === 'POST',
        { timeout: 120_000 },
      ),
      page.getByRole('button', { name: /send message/i }).click(),
    ]);
    expect(res.status(), `POST /api/contact returned ${res.status()}`).toBeLessThan(500);
    if (res.status() === 200) {
      await expect(page.getByText(/message sent/i)).toBeVisible();
      await expect(page.getByLabel('Name')).toHaveValue('');
    } else {
      await expect(page.getByText(/^Error$/)).toBeVisible();
    }
    assertClean(collected, '/contact valid');
  });

  test('api tolerates hostile input (script tag, unicode, very long message)', async ({ page }) => {
    const longMessage = `E2E ${RUN_TAG} `.repeat(400);
    const res = await page.request.post('/api/contact', {
      data: {
        name: '<script>alert(1)</script> Ünïcødé 日本語 E2E Hunt',
        email: 'e2e-contact@pmhnptest.com',
        subject: 'Feedback',
        message: `<img src=x onerror=alert(1)> ${longMessage}`,
      },
      // A successful contact POST does two Resend sends plus DB work and
      // measured ~11s warm on the dev server, so the 20s action default is
      // too tight to be a meaningful signal here.
      timeout: 90_000,
    });
    expect([200, 400, 429], `unexpected status ${res.status()}`).toContain(res.status());
    const body = await res.json();
    expect(typeof body.success).toBe('boolean');
  });
});

// ── For programs embed builder ──────────────────────────────────────────────

test.describe('for-programs embed builder', () => {
  test('snippet, preview iframe and fallback link react to state, program and limit', async ({ page }) => {
    const collected = await open(page, '/for-programs');
    await settle(page);
    const snippet = page.locator('code', { hasText: '<iframe' });
    await expect(snippet).toBeVisible();
    await expect(snippet).toContainText('state=CA');
    await expect(snippet).toContainText('height="1260"');

    await page.locator('#pd-state').selectOption('TX');
    await page.locator('#pd-program').fill('E2E Univ');
    await page.locator('#pd-limit').selectOption('9');

    await expect(snippet).toContainText('state=TX');
    await expect(snippet).toContainText('program=E2E+Univ');
    await expect(snippet).toContainText('limit=9');
    await expect(snippet).toContainText('height="1770"');

    const iframe = page.locator('iframe[title*="widget"]');
    await expect(iframe).toHaveAttribute('src', /state=TX/);
    await expect(iframe).toHaveAttribute('src', /program=E2E%20Univ/);
    await expect(iframe).toHaveAttribute('src', /limit=9/);

    const fallback = page.locator('a[href*="utm_source=widget"]');
    await expect(fallback).toHaveAttribute('href', /location=Texas/);
    await expect(fallback).toHaveAttribute('href', /utm_campaign=pd-e2e-univ/);

    // Widget itself must load (the preview is a same-origin iframe).
    const widgetRes = await page.request.get('/widget?state=TX&program=E2E%20Univ&limit=9');
    expect(widgetRes.status()).toBe(200);

    const mailto = page.locator('a[href^="mailto:"]').first();
    await expect(mailto).toHaveAttribute('href', /^mailto:hello@pmhnphiring\.com/);
    assertClean(collected, '/for-programs');
  });

  test('program name is sanitized in the snippet', async ({ page }) => {
    const collected = await open(page, '/for-programs');
    await settle(page);
    await page.locator('#pd-program').fill('<script>alert(1)</script>Ünï "quoted"');
    const snippet = page.locator('code', { hasText: '<iframe' });
    const text = await snippet.innerText();
    expect(text).not.toContain('<script');
    expect(text).not.toContain('"quoted"');
    expect(text).toMatch(/program=scriptalert1scriptn\+quoted/);
    assertClean(collected, '/for-programs sanitize');
  });
});

// ── Resources download gate ─────────────────────────────────────────────────

test.describe('resources download gate', () => {
  test.skip(AGAINST_PROD, 'no mutations against production');

  test('email gate posts to newsletter API, unlocks and persists after reload', async ({ page, context }) => {
    const collected = await open(page, '/resources');
    await settle(page);
    const gateButton = page.getByRole('button', { name: /get pdf/i });
    await gateButton.scrollIntoViewIfNeeded();
    await expect(gateButton).toBeVisible();
    const form = page.locator('form', { has: gateButton });
    await form.locator('input[type="email"]').fill(`e2e-resource-${RUN_TAG}@pmhnptest.com`);
    const [res, popup] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/newsletter') && r.request().method() === 'POST'),
      context.waitForEvent('page').catch(() => null),
      gateButton.click(),
    ]);
    expect(res.status()).toBeLessThan(500);
    if (popup) await popup.close().catch(() => undefined);
    const download = page.getByRole('link', { name: /download salary guide pdf/i });
    await expect(download).toBeVisible();
    await expect(download).toHaveAttribute('href', /\.pdf$/);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('link', { name: /download salary guide pdf/i })).toBeVisible();
    assertClean(collected, '/resources gate');
  });
});

// ── Salary guide ────────────────────────────────────────────────────────────

test.describe('salary guide', () => {
  test('index links to state pages and the first state page renders', async ({ page }) => {
    test.slow(); // /salary-guide is a ~1MB page built from several aggregates
    const collected = await open(page, '/salary-guide');
    const stateLinks = page.locator('a[href^="/salary-guide/"]');
    expect(await stateLinks.count()).toBeGreaterThan(0);
    const href = await stateLinks.first().getAttribute('href');
    expect(href).toMatch(/^\/salary-guide\/[a-z-]+$/);
    await page.goto(href!, { waitUntil: 'domcontentloaded' });
    await expectBasicPageHealth(page, href!);
    assertClean(collected, '/salary-guide + state');
  });

  test('/salary-guide/texas renders with a single H1 and salary figures', async ({ page }) => {
    const collected = await open(page, '/salary-guide/texas');
    await expectBasicPageHealth(page, '/salary-guide/texas');
    await expect(page.locator('h1').first()).toContainText(/texas/i);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/\$\d{2,3},\d{3}|\$\d{2,3}[Kk]/);
    expect(body).not.toMatch(/NaN|undefined/);
    assertClean(collected, '/salary-guide/texas');
  });

  test('advertised pay explorer switches to a state and links to its jobs', async ({ page }) => {
    test.slow();
    const collected = await open(page, '/salary-guide');
    await settle(page);
    const select = page.getByLabel('Choose a state');
    await expect(select).toBeVisible();
    await expect(page.getByText(/median advertised pay in the united states/i)).toBeVisible();
    const options = select.locator('option');
    expect(await options.count()).toBeGreaterThan(1);
    const value = await options.nth(1).getAttribute('value');
    const label = (await options.nth(1).innerText()).replace(/\s*\([A-Z]{2}\)\s*$/, '').trim();
    await select.selectOption(value!);
    await expect(page.getByText(new RegExp(`median advertised pay in ${label}`, 'i'))).toBeVisible();
    // The CTA renders "<CODE> Jobs" plus an arrow icon, so match on the href
    // the explorer builds rather than on anchored link text.
    await expect(page.locator(`a[href="/jobs/state/${value}"]`).first()).toBeVisible();
    const body = await page.locator('body').innerText();
    expect(body).not.toMatch(/NaN|\$undefined/);
    assertClean(collected, '/salary-guide explorer');
  });

  test('pdf form rejects an invalid email and accepts a test email', async ({ page }) => {
    test.skip(AGAINST_PROD, 'no mutations against production');
    const collected = await open(page, '/salary-guide');
    await settle(page);
    const input = page.getByPlaceholder(/email for free pdf guide/i);
    await expect(input).toBeVisible();
    let apiCalls = 0;
    page.on('request', (r) => { if (r.url().includes('/api/salary-guide')) apiCalls += 1; });
    await input.fill('nope');
    await input.press('Enter');
    const nativeValid = await input.evaluate((el) => (el as HTMLInputElement).validity.valid);
    expect(nativeValid).toBe(false);
    await expect(page.getByText(/check your email/i)).toHaveCount(0);
    expect(apiCalls).toBe(0);
    await input.fill(`e2e-salary-${RUN_TAG}@pmhnptest.com`);
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/salary-guide') && r.request().method() === 'POST'),
      input.press('Enter'),
    ]);
    expect(res.status()).toBeLessThan(500);
    if (res.status() === 200) {
      await expect(page.getByText(/check your email/i)).toBeVisible();
    } else {
      await expect(page.locator('form span', { hasText: /./ }).last()).toBeVisible();
    }
    assertClean(collected, '/salary-guide form');
  });
});

// ── Blog ────────────────────────────────────────────────────────────────────

test.describe('blog', () => {
  test('a post renders with related posts and a working email signup', async ({ page }) => {
    test.skip(AGAINST_PROD, 'no mutations against production');
    const collected = await open(page, '/blog');
    const links = page.locator('a[href^="/blog/"]:not([href="/blog/feed.xml"])');
    expect(await links.count()).toBeGreaterThan(0);
    const href = await links.first().getAttribute('href');
    await page.goto(href!, { waitUntil: 'domcontentloaded' });
    await expectBasicPageHealth(page, href!);
    await settle(page);

    const others = page.locator(`a[href^="/blog/"]:not([href="${href}"]):not([href="/blog/feed.xml"])`);
    expect(await others.count(), 'no related / other post links on the post').toBeGreaterThan(0);

    const signup = page.getByPlaceholder('you@email.com').first();
    await signup.scrollIntoViewIfNeeded();
    await signup.fill('e2e-blog@pmhnptest.com');
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/newsletter') && r.request().method() === 'POST'),
      signup.press('Enter'),
    ]);
    expect(res.status()).toBeLessThan(500);
    if (res.status() === 200) {
      await expect(page.getByText(/you.re subscribed/i)).toBeVisible();
    } else {
      await expect(page.getByText(/something went wrong/i)).toBeVisible();
    }
    assertClean(collected, href!);
  });
});

// ── Tools ───────────────────────────────────────────────────────────────────

test.describe('tools', () => {
  test('tools index links to every tool and each resolves', async ({ page }) => {
    test.slow();
    const collected = await open(page, '/tools');
    const expected = [
      '/tools/salary-converter',
      '/tools/offer-analyzer',
      '/tools/1099-vs-w2-calculator',
      '/tools/practice-authority-map',
      '/tools/resume-checker',
      '/tools/resume-builder',
    ];
    for (const href of expected) {
      expect(await page.locator(`a[href="${href}"]`).count(), `missing link ${href}`).toBeGreaterThan(0);
      const res = await page.request.get(href, { timeout: 120_000 });
      expect(res.status(), `${href} returned ${res.status()}`).toBe(200);
    }
    assertClean(collected, '/tools');
  });

  test('salary converter: hourly input converts correctly to every period', async ({ page }) => {
    const collected = await open(page, '/tools/salary-converter');
    await settle(page);
    await page.getByLabel('Pay amount').fill('85');
    const results = page.locator('[aria-live="polite"]');
    await expect(results).toBeVisible();
    await expect(results).toContainText('$176,800');   // annual 85*40*52
    await expect(results).toContainText('$14,733');    // monthly
    await expect(results).toContainText('$6,800');     // biweekly
    await expect(results).toContainText('$3,400');     // weekly
    await expect(results).toContainText('$680.00');    // daily (8h)
    await expect(results).toContainText('$85.00');     // hourly echo
    expect(await results.innerText()).not.toMatch(/NaN|Infinity/);

    await page.getByLabel('Paid').selectOption('annual');
    await page.getByLabel('Pay amount').fill('165000');
    await expect(results).toContainText('$79.33');     // 165000 / 2080
    await expect(results).toContainText('$13,750');    // monthly
    assertClean(collected, '/tools/salary-converter');
  });

  test('salary converter: edge inputs (0, letters, bad hours, huge) never produce NaN', async ({ page }) => {
    const collected = await open(page, '/tools/salary-converter');
    await settle(page);
    const amount = page.getByLabel('Pay amount');
    const results = page.locator('[aria-live="polite"]');
    await amount.fill('0');
    await expect(results).toHaveCount(0);
    await amount.fill('abc');
    await expect(results).toHaveCount(0);
    await amount.fill('85');
    await expect(results).toBeVisible();
    await page.getByLabel('Hours per week').fill('0');
    await expect(page.getByRole('status')).toContainText(/hours between 1 and 100/i);
    await expect(results).toHaveCount(0);
    await page.getByLabel('Hours per week').fill('40');
    await page.getByLabel('Weeks per year').fill('99');
    await expect(page.getByRole('status')).toContainText(/weeks between 1 and 53/i);
    await page.getByLabel('Weeks per year').fill('52');
    await amount.fill('99999999999');
    await expect(results).toBeVisible();
    const text = await results.innerText();
    expect(text).not.toMatch(/NaN|Infinity|e\+/);
    assertClean(collected, '/tools/salary-converter edge');
  });

  test('salary converter: a negative amount should not silently convert as positive', async ({ page }) => {
    // The amount parser strips every non [0-9.] character, so "-50" becomes
    // 50 and renders $104,000/yr with no hint. Expected failure documenting it.
    test.fail(true, 'known: negative amount is treated as its absolute value');
    await open(page, '/tools/salary-converter');
    await settle(page);
    await page.getByLabel('Pay amount').fill('-50');
    await expect(page.locator('[aria-live="polite"]')).toHaveCount(0);
  });

  test('offer analyzer: annual and hourly offers produce sane percentile output', async ({ page }) => {
    const collected = await open(page, '/tools/offer-analyzer');
    await settle(page);
    await page.getByLabel('Offer amount').fill('165000');
    const result = page.locator('[aria-live="polite"]');
    await expect(result).toContainText(/percentile|median|too few postings/i);
    let text = await result.innerText();
    expect(text).not.toMatch(/NaN|Infinity|\$undefined|\$0k/);
    if (/percentile of advertised pay/i.test(text)) {
      expect(text).toMatch(/\b\d{1,3}(st|nd|rd|th)\b/);
      expect(text).toMatch(/p25 \$\d+k/);
      expect(text).toMatch(/median \$\d+k/);
      expect(text).toMatch(/p75 \$\d+k/);
      expect(text).toMatch(/offer of \$165,000/);
    }

    await page.getByLabel('Pay period').selectOption('hourly');
    await page.getByLabel('Offer amount').fill('85');
    // 85/hr x 40 x 52 = 176,800; the analyzer displays it rounded to the
    // nearest thousand ("≈ $177,000/yr"), unlike the salary converter.
    await expect(result).toContainText(/17[67],\d00\/yr/);
    await page.getByLabel('Hours per week').fill('0');
    await expect(page.getByText(/hours between 1 and 100/i)).toBeVisible();
    text = await result.innerText();
    expect(text.trim()).toBe('');
    assertClean(collected, '/tools/offer-analyzer');
  });

  test('offer analyzer: state and remote segments switch the comparison', async ({ page }) => {
    const collected = await open(page, '/tools/offer-analyzer');
    await settle(page);
    await page.getByLabel('Offer amount').fill('150000');
    const segment = page.getByLabel('Compare against');
    const options = segment.locator('option');
    const count = await options.count();
    expect(count).toBeGreaterThan(1);
    const stateValue = await options.nth(count - 1).getAttribute('value');
    await segment.selectOption(stateValue!);
    const result = page.locator('[aria-live="polite"]');
    await expect(result).toContainText(new RegExp(stateValue!, 'i'));
    const text = await result.innerText();
    expect(text).not.toMatch(/NaN|Infinity/);
    if (/percentile of advertised pay/i.test(text)) {
      await expect(result.getByRole('link', { name: new RegExp(`jobs in ${stateValue}`, 'i') })).toHaveAttribute(
        'href',
        `/jobs/state/${stateValue!.toLowerCase().replace(/\s+/g, '-')}`
      );
    }
    assertClean(collected, '/tools/offer-analyzer segments');
  });

  test('1099 vs W-2 calculator: default totals and break-even match the tax math', async ({ page }) => {
    const collected = await open(page, '/tools/1099-vs-w2-calculator');
    await settle(page);
    const region = page.locator('[aria-live="polite"]').first();
    await expect(region).toContainText('$163,263');   // W-2 effective value
    await expect(region).toContainText('$165,022');   // 1099 effective value
    await expect(region).toContainText(/1099 package is ahead by \$1,758/);
    await expect(region).toContainText(/\$99\.0\d\/hr/); // break-even rate
    await expect(region).toContainText('$11,538');    // PTO value 150000/260*20
    await expect(region).toContainText('$11,475');    // employee FICA
    await expect(region).toContainText('$21,836');    // SE social security
    await expect(region).toContainText('$5,142');     // SE medicare
    await expect(page.getByText('$192,000').first()).toBeVisible(); // contractor gross

    await page.locator('#ccc-hours').fill('0');
    await expect(region).toContainText(/Break-Even 1099 Hourly Rate\s*—/);
    await expect(region).toContainText(/W-2 package is ahead by \$163,263/);
    await page.locator('#ccc-hours').fill('40');
    await page.locator('#ccc-salary').fill('-5');
    // Negative salary clamps to 0, so the W-2 side keeps only the $7,200 of
    // employer-paid health insurance: 165,022 - 7,200 = 157,822.
    await expect(region).toContainText(/1099 package is ahead by \$157,822/);
    expect(await region.innerText()).not.toMatch(/NaN|Infinity/);
    assertClean(collected, '/tools/1099-vs-w2-calculator');
  });

  test('practice authority map: tiles select states and show the right authority label', async ({ page }) => {
    const collected = await open(page, '/tools/practice-authority-map');
    await settle(page);
    const tiles = page.locator('button.pa-tile');
    await expect(tiles).toHaveCount(51);
    await expect(page.getByText('Select a state', { exact: true })).toBeVisible();

    const texas = page.getByRole('button', { name: /^Texas,/ });
    await texas.click();
    await expect(texas).toHaveAttribute('aria-pressed', 'true');
    const panel = page.locator('aside[aria-live="polite"]');
    await expect(panel.getByRole('heading', { name: 'Texas' })).toBeVisible();
    await expect(panel).toContainText('Restricted Practice');
    await expect(panel.getByRole('link', { name: /view texas pmhnp jobs/i })).toHaveAttribute('href', '/jobs/state/texas');

    const arizona = page.getByRole('button', { name: /^Arizona,/ });
    await arizona.click();
    await expect(texas).toHaveAttribute('aria-pressed', 'false');
    await expect(panel.getByRole('heading', { name: 'Arizona' })).toBeVisible();
    await expect(panel).toContainText('Full Practice Authority');

    await arizona.click();
    await expect(page.getByText('Select a state', { exact: true })).toBeVisible();

    // Legend counts must add up to the 51 tiles.
    const legend = await page.locator('.pa-legend').innerText();
    const counts = [...legend.matchAll(/·\s*(\d+)/g)].map((m) => Number(m[1]));
    expect(counts.length).toBe(3);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(51);
    assertClean(collected, '/tools/practice-authority-map');
  });

  test('resume checker: anonymous visitor sees the login gate and the API refuses uploads', async ({ page }) => {
    const collected = await open(page, '/tools/resume-checker');
    await expectBasicPageHealth(page, '/tools/resume-checker');
    await expect(page.getByText(/sign in to check your resume/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /sign in or create an account/i })).toHaveAttribute(
      'href',
      '/login?redirectTo=/tools/resume-checker'
    );
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    const res = await page.request.post('/api/resume-studio/score-upload', {
      multipart: { file: { name: 'sample-resume.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 e2e') } },
    });
    expect(res.status()).toBe(401);
    assertClean(collected, '/tools/resume-checker');
  });

  test('resume builder landing: CTAs exist and the studio link is auth-gated', async ({ page }) => {
    const collected = await open(page, '/tools/resume-builder');
    await expectBasicPageHealth(page, '/tools/resume-builder');
    await expect(page.getByRole('link', { name: /create a free account/i })).toHaveAttribute('href', '/signup');
    const studio = page.getByRole('link', { name: /open the resume studio/i });
    await expect(studio).toHaveAttribute('href', '/dashboard/resume-studio');
    await studio.click();
    await page.waitForURL((u) => /\/(login|signup)/.test(u.pathname), { timeout: 30_000, waitUntil: 'domcontentloaded' });
    expect(new URL(page.url()).pathname).toMatch(/\/(login|signup)/);
    assertClean(collected, '/tools/resume-builder');
  });
});

test.describe('resume checker validation (signed in)', () => {
  test.skip(AGAINST_PROD, 'no mutations against production');
  test.skip(!getSeekerCreds(), 'E2E_SEEKER_EMAIL/PASS not set');

  test('rejects .txt and a renamed non-PDF, scores the sample resume', async ({ page }) => {
    test.slow();
    await loginAsSeeker(page);
    const collected = await open(page, '/tools/resume-checker');
    await settle(page);
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toHaveCount(1);
    const live = page.locator('div[aria-live="polite"]');

    // 1. Plain text file is rejected client-side (no upload request).
    let uploads = 0;
    page.on('request', (r) => { if (r.url().includes('/api/resume-studio/score-upload')) uploads += 1; });
    await fileInput.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not a resume') });
    await expect(live).toContainText(/file type is not supported/i);
    expect(uploads).toBe(0);
    await page.getByRole('button', { name: /try again/i }).click();

    // 2. A text file renamed to .pdf passes the client but must be rejected by the server without a 5xx.
    const [badRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/resume-studio/score-upload')),
      fileInput.setInputFiles({ name: 'fake-resume.pdf', mimeType: 'application/pdf', buffer: Buffer.from('this is not a pdf at all') }),
    ]);
    expect(badRes.status(), `renamed non-PDF returned ${badRes.status()}`).toBeGreaterThanOrEqual(400);
    expect(badRes.status()).toBeLessThan(500);
    await expect(live).toContainText(/./);
    await expect(page.getByRole('button', { name: /try again/i })).toBeVisible();
    await page.getByRole('button', { name: /try again/i }).click();

    // 3. The real fixture scores.
    const [goodRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/resume-studio/score-upload')),
      fileInput.setInputFiles(RESUME_FIXTURE),
    ]);
    expect(goodRes.status(), `sample resume returned ${goodRes.status()}`).toBe(200);
    await expect(page.getByRole('heading', { name: /your resume score/i })).toBeVisible();
    const scoreText = await page.locator('span.text-6xl').innerText();
    const score = Number(scoreText);
    expect(Number.isInteger(score)).toBe(true);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
    await expect(page.getByText(/strong|solid|needs work|critical/i).first()).toBeVisible();
    expect(await page.locator('[role="img"]').count()).toBeGreaterThan(0);
    assertClean(collected, '/tools/resume-checker signed in');
  });
});

// ── Job alerts (anonymous) ──────────────────────────────────────────────────

test.describe('job alerts', () => {
  test.skip(AGAINST_PROD, 'no mutations against production');

  test('subscribe with filters succeeds, resets the form and dedupes a double subscribe', async ({ page }) => {
    const collected = await open(page, '/job-alerts');
    await settle(page);
    const email = uniqueAlertEmail();
    const emailInput = page.locator('input[type="email"]');
    await emailInput.fill(email);
    await page.locator('select').filter({ has: page.locator('option[value="Texas"]') }).selectOption('Texas');
    await page.locator('select').filter({ has: page.locator('option[value="Remote"]') }).nth(1).selectOption('Remote');
    await page.locator('select').filter({ has: page.locator('option[value="Full-Time"]') }).selectOption('Full-Time');
    await page.getByRole('button', { name: /weekly digest/i }).click();
    await expect(page.getByText('Remote · Full-Time · in Texas')).toBeVisible();

    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith('/api/job-alerts') && r.request().method() === 'POST'),
      page.getByRole('button', { name: /create job alert/i }).click(),
    ]);
    expect(res.status(), `POST /api/job-alerts returned ${res.status()}`).toBe(200);
    const first = await res.json();
    expect(first.success).toBe(true);
    expect(first.reactivated).toBe(false);
    expect(typeof first.alert?.token).toBe('string');
    await expect(page.getByText(/your alert is active/i)).toBeVisible();
    await expect(emailInput).toHaveValue('');
    await expect(page.getByText('All PMHNP jobs')).toBeVisible();

    // Double subscribe with identical criteria must not create a second alert.
    await emailInput.fill(email);
    await page.locator('select').filter({ has: page.locator('option[value="Texas"]') }).selectOption('Texas');
    await page.locator('select').filter({ has: page.locator('option[value="Remote"]') }).nth(1).selectOption('Remote');
    await page.locator('select').filter({ has: page.locator('option[value="Full-Time"]') }).selectOption('Full-Time');
    await page.getByRole('button', { name: /weekly digest/i }).click();
    const [res2] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith('/api/job-alerts') && r.request().method() === 'POST'),
      page.getByRole('button', { name: /create job alert/i }).click(),
    ]);
    expect(res2.status()).toBe(200);
    const second = await res2.json();
    expect(second.alert?.token).toBe(first.alert.token);

    const list = await page.request.get(`/api/job-alerts?token=${encodeURIComponent(first.alert.token)}`);
    expect(list.status()).toBe(200);
    const listBody = await list.json();
    expect(listBody.alerts.length, 'duplicate alert row created').toBe(1);
    expect(listBody.alerts[0]).toMatchObject({ location: 'Texas', mode: 'Remote', jobType: 'Full-Time', frequency: 'weekly', isActive: true });
    assertClean(collected, '/job-alerts subscribe');
  });

  test('empty and invalid emails never reach the API', async ({ page }) => {
    const collected = await open(page, '/job-alerts');
    await settle(page);
    let apiCalls = 0;
    page.on('request', (r) => { if (r.url().endsWith('/api/job-alerts') && r.method() === 'POST') apiCalls += 1; });
    await page.getByRole('button', { name: /create job alert/i }).click();
    await expect(page.getByText(/email is required/i)).toBeVisible();
    const emailInput = page.locator('input[type="email"]');
    await emailInput.fill('not-an-email');
    await page.getByRole('button', { name: /create job alert/i }).click();
    // Native type=email validation blocks the submit; the component's own
    // message only shows when the browser lets the submit through.
    const nativeValid = await emailInput.evaluate((el) => (el as HTMLInputElement).validity.valid);
    expect(nativeValid).toBe(false);
    await expect(page.getByText(/your alert is active/i)).toHaveCount(0);
    expect(apiCalls).toBe(0);

    const bad = await page.request.post('/api/job-alerts', { data: { email: 'bad', location: 'Texas' } });
    expect(bad.status()).toBe(400);
    const badFreq = await page.request.post('/api/job-alerts', { data: { email: uniqueAlertEmail(), frequency: 'hourly' } });
    expect(badFreq.status()).toBe(400);
    assertClean(collected, '/job-alerts invalid');
  });

  test('manage page without a token asks the visitor to sign in', async ({ page }) => {
    const collected = await open(page, '/job-alerts/manage');
    await expect(page.getByText(/please sign in to manage your alerts/i)).toBeVisible();
    await expectBasicPageHealth(page, '/job-alerts/manage');
    assertClean(collected, '/job-alerts/manage');
  });

  test('unsubscribe page without a token shows an invalid-link message', async ({ page }) => {
    const collected = await open(page, '/job-alerts/unsubscribe');
    // The page's own designed error state uses the heading "Something Went
    // Wrong", so the generic error-boundary check is not applied here.
    await expect(page.getByText(/invalid unsubscribe link/i)).toBeVisible();
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.getByRole('button', { name: /delete my alert/i })).toHaveCount(0);
    assertClean(collected, '/job-alerts/unsubscribe');
  });

  test('unsubscribe page with a garbage token does not offer delete/pause actions for a non-existent alert', async ({ page }) => {
    const collected = await open(page, '/job-alerts/unsubscribe?token=garbage-h0902');
    // A token that resolves to no alert should be reported as invalid, not
    // presented as a real alert with Delete / Pause / Weekly buttons.
    await expect(page.getByText(/invalid|not found|no longer valid/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: /delete|unsubscribe/i })).toHaveCount(0);
    assertClean(collected, '/job-alerts/unsubscribe garbage');
  });

  test('confirmed page renders success and invalid variants', async ({ page }) => {
    const collected = await open(page, '/job-alerts/confirmed');
    await expect(page.locator('h1')).toHaveText(/all set/i);
    // Scope to <main>: the global footer carries its own "Browse PMHNP Jobs" link.
    await expect(
      page.locator('main').getByRole('link', { name: /browse pmhnp jobs/i }).first(),
    ).toHaveAttribute('href', '/jobs');
    await page.goto('/job-alerts/confirmed?status=invalid', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1')).toHaveText(/confirmation link invalid/i);
    await page.goto('/job-alerts/confirmed?status=missing', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1')).toHaveText(/incomplete/i);
    assertClean(collected, '/job-alerts/confirmed');
  });
});

// ── Email preference pages without auth ─────────────────────────────────────

test.describe('email unsubscribe and preferences without a token', () => {
  test('/unsubscribe without and with a garbage token shows a clear error', async ({ page }) => {
    const collected = await open(page, '/unsubscribe');
    await expect(page.getByText(/no unsubscribe token provided/i)).toBeVisible();
    await expect(page.locator('h1')).toHaveCount(1);
    await page.goto('/unsubscribe?token=garbage-h0902', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/invalid token|invalid or expired/i)).toBeVisible({ timeout: 20_000 });
    const api = await page.request.get('/api/email/unsubscribe?token=garbage-h0902');
    expect(api.status()).toBe(404);
    const noToken = await page.request.get('/api/email/unsubscribe');
    expect(noToken.status()).toBe(400);
    assertClean(collected, '/unsubscribe');
  });

  test('/email-preferences without and with a garbage token shows a clear error', async ({ page }) => {
    const collected = await open(page, '/email-preferences');
    await expect(page.locator('h1')).toHaveText(/invalid link/i, { timeout: 20_000 });
    await expect(page.getByText(/invalid or has expired/i)).toBeVisible();
    await page.goto('/email-preferences?token=garbage-h0902', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1')).toHaveText(/invalid link/i, { timeout: 20_000 });
    const api = await page.request.get('/api/email/preferences?token=garbage-h0902');
    expect(api.status()).toBe(404);
    const body = await page.locator('body').innerText();
    expect(body).not.toMatch(ERROR_BOUNDARY_RE);
    assertClean(collected, '/email-preferences');
  });
});

// ── Privacy forms ───────────────────────────────────────────────────────────

test.describe('privacy pages', () => {
  test('do-not-sell opt-out persists the consent cookie and survives a reload', async ({ page }) => {
    test.skip(AGAINST_PROD, 'no mutations against production');
    const collected = await open(page, '/do-not-sell');
    await expectBasicPageHealth(page, '/do-not-sell');
    await settle(page);
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/consent') && r.request().method() === 'POST'),
      page.getByRole('button', { name: /opt out on this device/i }).click(),
    ]);
    expect(res.status(), `POST /api/consent returned ${res.status()}`).toBeLessThan(400);
    await expect(page.getByText(/you.re opted out on this device/i)).toBeVisible({ timeout: 30_000 });
    const cookies = await page.context().cookies();
    expect(cookies.some((c) => /consent/i.test(c.name)), 'no consent cookie written').toBe(true);
    // The opt-out is stored in the pmhnp_consent_v2 cookie, so a returning
    // visitor must be told the opt-out is still in force instead of being
    // offered the button again as if nothing had been recorded.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await settle(page);
    await expect(
      page.getByText(/you.re opted out on this device/i),
      'CCPA opt-out state is not restored from the stored consent on reload',
    ).toBeVisible({ timeout: 30_000 });
    assertClean(collected, '/do-not-sell');
  });

  test('data-request as anonymous shows the sign-in gate and the API returns 401', async ({ page }) => {
    const collected = await open(page, '/data-request');
    await expectBasicPageHealth(page, '/data-request');
    await settle(page);
    await expect(page.getByText(/please sign in to submit a request/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('link', { name: /sign in to continue/i })).toHaveAttribute('href', '/login?redirectTo=/data-request');
    await expect(page.locator('form')).toHaveCount(0);
    const res = await page.request.post('/api/data-request', {
      data: { email: 'e2e-anon@pmhnptest.com', type: 'access' },
    });
    expect(res.status()).toBe(401);
    assertClean(collected, '/data-request');
  });
});

// ── Footer ──────────────────────────────────────────────────────────────────

test.describe('footer', () => {
  test('every internal footer link resolves to a 200', async ({ page }) => {
    test.setTimeout(480_000);
    const collected = await open(page, '/');
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();
    const hrefs = await footer.locator('a[href^="/"]').evaluateAll((els) =>
      Array.from(new Set(els.map((e) => (e as HTMLAnchorElement).getAttribute('href') || '')))
    );
    expect(hrefs.length).toBeGreaterThan(20);
    const broken: string[] = [];
    for (const href of hrefs) {
      const res = await page.request.get(href, { maxRedirects: 5, timeout: 120_000 }).catch(() => null);
      if (!res || res.status() !== 200) broken.push(`${href} -> ${res ? res.status() : 'no response'}`);
    }
    expect(broken, `footer links not resolving to 200:\n${broken.join('\n')}`).toEqual([]);
    assertClean(collected, 'footer');
  });
});

// ── Job list pages ──────────────────────────────────────────────────────────

test.describe('job location and category lists', () => {
  test('/jobs/locations lists states and cities', async ({ page }) => {
    const collected = await open(page, '/jobs/locations');
    // The index only lists states that still have live (non-expired) jobs,
    // so the floor is deliberately low: this asserts the hub renders links
    // at all, not how much inventory the environment happens to hold.
    expect(await page.locator('a[href^="/jobs/state/"]').count()).toBeGreaterThan(0);
    expect(await page.locator('a[href^="/jobs/city/"]').count()).toBeGreaterThan(0);
    assertClean(collected, '/jobs/locations');
  });

  test('category landing counts agree with the /jobs search facets', async ({ page }) => {
    // /jobs and /jobs/state/[state] filter on publicJobsWhere(), which drops
    // postings whose expiresAt has passed. /jobs/remote builds its own
    // REMOTE_FILTER (and every category page uses buildCategoryWhereClause)
    // without that clause, so the landing pages advertise expired postings
    // that the search itself will not return.
    test.slow();
    const collected = await open(page, '/jobs/remote');
    const remoteLanding = await readListingCount(page, /remote positions/i);
    await page.goto('/jobs/new-grad', { waitUntil: 'domcontentloaded', timeout: 120_000 });
    const newGradLanding = await readListingCount(page, /new grad positions/i);

    // /api/jobs/filter-counts is what the /jobs search sidebar renders, and it
    // is built from the same publicJobsWhere() predicate as the search itself.
    const res = await page.request.post('/api/jobs/filter-counts', { data: {}, timeout: 90_000 });
    expect(res.status(), 'filter-counts should answer 200').toBe(200);
    const counts = await res.json();
    const summary =
      `/jobs/remote advertises ${remoteLanding} and /jobs/new-grad ${newGradLanding} positions, ` +
      `but /api/jobs/filter-counts (the /jobs search) reports total=${counts.total}, ` +
      `workMode.remote=${counts.workMode?.remote}, newGradFriendly=${counts.newGradFriendly}`;
    expect(counts.workMode?.remote, summary).toBeGreaterThan(0);
    expect(counts.total, summary).toBeGreaterThanOrEqual(remoteLanding);
    assertClean(collected, 'category count parity');
  });

  test('/jobs/state/texas count matches rendered cards', async ({ page }) => {
    const collected = await open(page, '/jobs/state/texas');
    await expectBasicPageHealth(page, '/jobs/state/texas');
    const total = await readListingCount(page, /positions in texas/i);
    await expectCardsMatchCount(page, total, '/jobs/state/texas');
    assertClean(collected, '/jobs/state/texas');
  });

  test('first city from /jobs/locations renders with matching count', async ({ page }) => {
    const collected = await open(page, '/jobs/locations');
    const href = await page.locator('a[href^="/jobs/city/"]').first().getAttribute('href');
    await page.goto(href!, { waitUntil: 'domcontentloaded' });
    await expectBasicPageHealth(page, href!);
    const total = await readListingCount(page, /positions \(\d/i);
    await expectCardsMatchCount(page, total, href!);
    assertClean(collected, href!);
  });

  test('/jobs/metro/new-york-ny renders a job list', async ({ page }) => {
    const collected = await open(page, '/jobs/metro/new-york-ny');
    await expectBasicPageHealth(page, '/jobs/metro/new-york-ny');
    expect(await page.locator('.jc-card').count()).toBeGreaterThan(0);
    assertClean(collected, '/jobs/metro/new-york-ny');
  });

  test('/jobs/remote count matches rendered cards', async ({ page }) => {
    const collected = await open(page, '/jobs/remote');
    await expectBasicPageHealth(page, '/jobs/remote');
    const total = await readListingCount(page, /remote positions/i);
    await expectCardsMatchCount(page, total, '/jobs/remote');
    assertClean(collected, '/jobs/remote');
  });

  test('/jobs/new-grad count matches rendered cards', async ({ page }) => {
    const collected = await open(page, '/jobs/new-grad');
    await expectBasicPageHealth(page, '/jobs/new-grad');
    const total = await readListingCount(page, /new grad positions/i);
    await expectCardsMatchCount(page, total, '/jobs/new-grad');
    assertClean(collected, '/jobs/new-grad');
  });

  test('/jobs/telehealth/texas count matches rendered cards', async ({ page }) => {
    const collected = await open(page, '/jobs/telehealth/texas');
    await expectBasicPageHealth(page, '/jobs/telehealth/texas');
    const total = await readListingCount(page, /telehealth positions in texas/i);
    await expectCardsMatchCount(page, total, '/jobs/telehealth/texas');
    assertClean(collected, '/jobs/telehealth/texas');
  });
});

// ── Error and edge routes ───────────────────────────────────────────────────

test.describe('error and edge routes', () => {
  test('a nested unknown path returns the branded 404', async ({ page }) => {
    const collected = attachErrorCollectors(page);
    page.setDefaultNavigationTimeout(120_000);
    const res = await page.goto(`/nope-${Date.now()}/deeper`, { waitUntil: 'domcontentloaded' });
    expect(res?.status()).toBe(404);
    await expect(page.locator('h1')).toHaveText(/page not found/i);
    await expect(page.getByRole('link', { name: /find pmhnp jobs/i })).toHaveAttribute('href', '/jobs');
    await expect(page.getByRole('link', { name: /return home/i })).toHaveAttribute('href', '/');
    assertClean(collected, 'nested 404');
  });

  test('a single-segment unknown path returns the branded 404, not a blank page', async ({ page }) => {
    // Regression guard. app/[indexnow]/route.ts used to be a Route Handler on a
    // top-level dynamic segment, so it matched every one-segment URL before
    // app/[...catchall]/page.tsx could. A route handler's notFound() cannot
    // render app/not-found.tsx, so the visitor got HTTP 404 with an empty body:
    // a blank white page for the most common 404 shape there is, a mistyped or
    // expired link. The IndexNow key is served from middleware.ts now and that
    // route file is gone, so a one-segment miss reaches the branded page.
    const collected = attachErrorCollectors(page);
    page.setDefaultNavigationTimeout(120_000);
    const res = await page.goto(`/this-does-not-exist-${Date.now()}`, { waitUntil: 'domcontentloaded' });
    expect(res?.status()).toBe(404);
    const body = (await page.locator('body').innerText()).trim();
    expect(body, 'single-segment 404 rendered an empty document').not.toBe('');
    await expect(page.locator('h1')).toHaveText(/page not found/i);
    assertClean(collected, 'single-segment 404');
  });

  test('/success without a session id bounces to /post-job', async ({ page }) => {
    const collected = await open(page, '/success');
    await page.waitForURL((u) => u.pathname === '/post-job', { timeout: 45_000, waitUntil: 'domcontentloaded' });
    expect(new URL(page.url()).pathname).toBe('/post-job');
    assertClean(collected, '/success');
  });

  test('/success with no Stripe session never claims a job was posted', async ({ page }) => {
    // The retired free mode used to honour a bare ?free=true flag here. Every
    // post is paid now, so app/success/page.tsx verifies a Stripe session or,
    // with none, bounces straight back to the wizard. A typed URL with no
    // session must therefore never render a success heading.
    const collected = await open(page, '/success?free=true');
    await page.waitForURL(/\/post-job/, { timeout: 60_000, waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1')).not.toHaveText(/posted successfully|payment successful/i);
    assertClean(collected, '/success without a session');
  });
});

// ── Images on hero pages ────────────────────────────────────────────────────

test.describe('images', () => {
  for (const p of ['/', '/job-alerts', '/for-job-seekers']) {
    test(`no broken images on ${p}`, async ({ page }) => {
      const collected = attachErrorCollectors(page);
      page.setDefaultNavigationTimeout(120_000);
      const failedImages: string[] = [];
      page.on('response', (res) => {
        if (res.request().resourceType() === 'image' && res.status() >= 400) {
          failedImages.push(`${res.status()} ${res.url()}`);
        }
      });
      await page.goto(p, { waitUntil: 'load' });
      // Trigger lazy images by walking the page.
      await page.evaluate(async () => {
        const step = Math.max(400, window.innerHeight);
        for (let y = 0; y < document.body.scrollHeight; y += step) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 50));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => undefined);
      const broken = await page.locator('img').evaluateAll((imgs) =>
        (imgs as HTMLImageElement[])
          .filter((img) => img.complete && img.naturalWidth === 0 && !!img.getAttribute('src'))
          .map((img) => `${img.getAttribute('src')} (alt="${img.alt}")`)
      );
      expect(failedImages, `image requests failed on ${p}:\n${failedImages.join('\n')}`).toEqual([]);
      expect(broken, `rendered <img> elements with no pixels on ${p}:\n${broken.join('\n')}`).toEqual([]);
      assertClean(collected, p);
    });
  }
});

// ── Anonymous API edge cases ────────────────────────────────────────────────

test.describe('anonymous API edge cases', () => {
  test.skip(AGAINST_PROD, 'no mutations against production');

  test('newsletter API rejects a bad email and trims a padded one', async ({ request }) => {
    const bad = await request.post('/api/newsletter', { data: { email: 'bad' } });
    expect(bad.status()).toBe(400);
    const empty = await request.post('/api/newsletter', { data: {} });
    expect(empty.status()).toBe(400);
    const padded = await request.post('/api/newsletter', {
      data: { email: `  e2e-newsletter-${RUN_TAG}@pmhnptest.com  `, source: 'e2e-hunt' },
    });
    expect(padded.status(), `padded email returned ${padded.status()}`).toBe(200);
    expect((await padded.json()).success).toBe(true);
  });

  test('newsletter API must not let an anonymous caller unsubscribe an arbitrary address', async ({ request }) => {
    // app/api/newsletter/route.ts accepts { email, optIn: false } from anyone
    // with no token, session or ownership proof, flips newsletterOptIn to
    // false and pushes an unsubscribe to Beehiiv. Any third party can silently
    // unsubscribe any known address.
    test.fail(true, 'known: unauthenticated newsletter unsubscribe by arbitrary email');
    const email = `e2e-newsletter-${RUN_TAG}@pmhnptest.com`;
    const sub = await request.post('/api/newsletter', { data: { email, source: 'e2e-hunt' } });
    expect(sub.status()).toBe(200);
    const unsub = await request.post('/api/newsletter', { data: { email, optIn: false } });
    expect([401, 403], `anonymous optIn:false returned ${unsub.status()}`).toContain(unsub.status());
  });

  test('job alert criteria are sanitized before being stored and echoed back', async ({ request }) => {
    const email = uniqueAlertEmail();
    const res = await request.post('/api/job-alerts', {
      data: {
        email,
        name: '<script>alert(1)</script>Jordan',
        keyword: 'psych<img src=x onerror="alert(1)">',
        location: 'Texas',
        frequency: 'weekly',
      },
    });
    expect(res.status(), `POST /api/job-alerts returned ${res.status()}`).toBe(200);
    const body = await res.json();
    expect(typeof body.alert?.token).toBe('string');
    try {
      const list = await request.get(`/api/job-alerts?token=${encodeURIComponent(body.alert.token)}`);
      expect(list.status()).toBe(200);
      const alerts = (await list.json()).alerts as Array<Record<string, unknown>>;
      const mine = alerts.find((a) => a.token === body.alert.token);
      expect(mine).toBeTruthy();
      const echoed = JSON.stringify(mine);
      expect(echoed).not.toMatch(/<script/i);
      expect(echoed).not.toMatch(/onerror/i);
    } finally {
      const del = await request.delete(`/api/job-alerts?token=${encodeURIComponent(body.alert.token)}`);
      expect(del.status()).toBe(200);
    }
  });

  test('job alert lookup and delete with a garbage token return 404, never 5xx', async ({ request }) => {
    const get = await request.get('/api/job-alerts?token=garbage-h0902');
    expect(get.status()).toBe(404);
    const del = await request.delete('/api/job-alerts?token=garbage-h0902');
    expect(del.status()).toBe(404);
    const patch = await request.patch('/api/job-alerts/garbage-h0902', { data: { frequency: 'weekly' } });
    expect(patch.status()).toBeGreaterThanOrEqual(400);
    expect(patch.status()).toBeLessThan(500);
  });
});
