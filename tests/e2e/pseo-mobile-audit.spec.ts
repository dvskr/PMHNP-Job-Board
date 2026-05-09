import { test, expect, Page, ConsoleMessage } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const MOBILE_VIEWPORT = { width: 375, height: 812 };
const OUT_DIR = path.resolve(__dirname, '../../tmp/mobile-audit');

const PAGES = [
  {
    name: 'remote-city-houston-tx',
    url: 'http://localhost:3000/jobs/remote/city/houston-tx',
    label: 'Remote/City – Houston TX',
  },
  {
    name: 'remote-city-dallas-tx',
    url: 'http://localhost:3000/jobs/remote/city/dallas-tx',
    label: 'Remote/City – Dallas TX',
  },
  {
    name: 'telehealth-california',
    url: 'http://localhost:3000/jobs/telehealth/california',
    label: 'Telehealth/State – California',
  },
  {
    name: 'new-grad-city-new-york-ny',
    url: 'http://localhost:3000/jobs/new-grad/city/new-york-ny',
    label: 'New-Grad/City – New York NY',
  },
];

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function captureConsoleErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  page.on('pageerror', (err: Error) => {
    errors.push(`[pageerror] ${err.message}`);
  });
  return errors;
}

async function detectHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const body = document.body;
    const html = document.documentElement;
    const docWidth = Math.max(body.scrollWidth, html.scrollWidth);
    return docWidth > window.innerWidth;
  });
}

async function auditPage(
  page: Page,
  url: string,
  name: string
): Promise<Record<string, boolean | string>> {
  const results: Record<string, boolean | string> = {};
  const consoleErrors: string[] = [];

  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err: Error) => {
    consoleErrors.push(`[pageerror] ${err.message}`);
  });

  await page.goto(url, { waitUntil: 'networkidle' });

  // H1
  const h1 = page.locator('h1').first();
  results['H1 visible'] = await h1.isVisible();

  // Hero / intro section
  const heroSelectors = [
    '[data-testid="hero"]',
    '[data-testid="category-hero"]',
    'section:first-of-type',
    '.hero',
    'header + section',
  ];
  let heroVisible = false;
  for (const sel of heroSelectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 2000 })) {
        heroVisible = true;
        break;
      }
    } catch {
      // continue
    }
  }
  results['Hero/intro visible'] = heroVisible;

  // Jobs list / cards
  const jobCardSelectors = [
    '[data-testid="job-card"]',
    '[data-testid="job-listing"]',
    '.job-card',
    'article',
    '[class*="JobCard"]',
    '[class*="job-card"]',
    'a[href*="/jobs/"]',
  ];
  let jobsVisible = false;
  for (const sel of jobCardSelectors) {
    try {
      const count = await page.locator(sel).count();
      if (count > 0) {
        jobsVisible = true;
        break;
      }
    } catch {
      // continue
    }
  }
  results['Jobs list/cards present'] = jobsVisible;

  // FAQ accordion
  const faqSelectors = [
    '[data-testid="faq"]',
    '[data-testid="faq-section"]',
    '#faq',
    '.faq',
    'details',
    '[class*="FAQ"]',
    '[class*="faq"]',
    'section:has(> h2)',
  ];
  let faqSection = null;
  for (const sel of faqSelectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 2000 })) {
        faqSection = el;
        break;
      }
    } catch {
      // continue
    }
  }
  results['FAQ section visible'] = faqSection !== null;

  // FAQ accordion expand test
  let faqExpandWorks = false;
  try {
    // Try <details> elements first
    const details = page.locator('details').first();
    const detailsCount = await page.locator('details').count();
    if (detailsCount > 0) {
      const isOpen = await details.evaluate((el) => (el as HTMLDetailsElement).open);
      if (!isOpen) {
        await details.locator('summary').click();
        await page.waitForTimeout(300);
      }
      faqExpandWorks = await details.evaluate((el) => (el as HTMLDetailsElement).open);
    } else {
      // Try button-based accordion
      const accordionBtn = page.locator('button[aria-expanded]').first();
      const btnCount = await page.locator('button[aria-expanded]').count();
      if (btnCount > 0) {
        const expanded = await accordionBtn.getAttribute('aria-expanded');
        if (expanded === 'false') {
          await accordionBtn.click();
          await page.waitForTimeout(300);
        }
        const newExpanded = await accordionBtn.getAttribute('aria-expanded');
        faqExpandWorks = newExpanded === 'true';
      }
    }
  } catch {
    faqExpandWorks = false;
  }
  results['FAQ accordion expands'] = faqExpandWorks;

  // Related / internal links section
  const relatedSelectors = [
    '[data-testid="related-links"]',
    '[data-testid="internal-links"]',
    '[data-testid="related"]',
    '.related-links',
    'nav[aria-label*="related" i]',
    'section:has(a[href^="/jobs"])',
  ];
  let relatedVisible = false;
  for (const sel of relatedSelectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 2000 })) {
        relatedVisible = true;
        break;
      }
    } catch {
      // continue
    }
  }
  // Fallback: check for multiple internal links
  if (!relatedVisible) {
    const internalLinks = await page.locator('a[href^="/jobs"]').count();
    relatedVisible = internalLinks >= 3;
  }
  results['Related/internal links present'] = relatedVisible;

  // Breadcrumbs
  const breadcrumbSelectors = [
    '[data-testid="breadcrumb"]',
    '[aria-label="breadcrumb"]',
    'nav[aria-label*="bread" i]',
    '.breadcrumb',
    '[class*="breadcrumb" i]',
    'ol > li > a[href="/"]',
  ];
  let breadcrumbVisible = false;
  for (const sel of breadcrumbSelectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 2000 })) {
        breadcrumbVisible = true;
        break;
      }
    } catch {
      // continue
    }
  }
  results['Breadcrumbs visible'] = breadcrumbVisible;

  // Footer
  const footer = page.locator('footer').first();
  results['Footer visible'] = await footer.isVisible().catch(() => false);

  // Horizontal overflow
  const hasOverflow = await detectHorizontalOverflow(page);
  results['No horizontal overflow'] = !hasOverflow;

  // Console errors
  results['Console errors'] = consoleErrors.length > 0
    ? consoleErrors.slice(0, 3).join(' | ')
    : 'none';

  // Full-page screenshot
  ensureDir(OUT_DIR);
  const screenshotPath = path.join(OUT_DIR, `pseo-${name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  results['screenshot'] = screenshotPath;

  return results;
};

test.use({
  viewport: MOBILE_VIEWPORT,
});

for (const pg of PAGES) {
  test(`Mobile audit: ${pg.label}`, async ({ page }) => {
    test.setTimeout(60_000);
    const results = await auditPage(page, pg.url, pg.name);

    console.log(`\n=== ${pg.label} ===`);
    for (const [key, val] of Object.entries(results)) {
      if (key !== 'screenshot') {
        const icon = val === true ? 'PASS' : val === false ? 'FAIL' : 'INFO';
        console.log(`  [${icon}] ${key}: ${val}`);
      }
    }
    console.log(`  Screenshot: ${results['screenshot']}`);

    // Soft assertions — report but don't fail test run
    expect(results['H1 visible']).toBe(true);
    expect(results['Footer visible']).toBe(true);
    expect(results['No horizontal overflow']).toBe(true);
  });
}

test('Side-by-side layout consistency: state vs city page', async ({ page }) => {
  test.setTimeout(90_000);

  // Capture key metrics for state page
  await page.goto('http://localhost:3000/jobs/telehealth/california', { waitUntil: 'networkidle' });
  const stateH1 = await page.locator('h1').first().textContent().catch(() => '');
  const stateBodyWidth = await page.evaluate(() => document.body.scrollWidth);
  const stateViewportWidth = await page.evaluate(() => window.innerWidth);
  const stateOverflow = stateBodyWidth > stateViewportWidth;
  await page.screenshot({
    path: path.join(OUT_DIR, 'pseo-state-telehealth-california.png'),
    fullPage: true,
  });

  // Capture key metrics for city page
  await page.goto('http://localhost:3000/jobs/remote/city/houston-tx', { waitUntil: 'networkidle' });
  const cityH1 = await page.locator('h1').first().textContent().catch(() => '');
  const cityBodyWidth = await page.evaluate(() => document.body.scrollWidth);
  const cityViewportWidth = await page.evaluate(() => window.innerWidth);
  const cityOverflow = cityBodyWidth > cityViewportWidth;
  await page.screenshot({
    path: path.join(OUT_DIR, 'pseo-city-remote-houston-tx.png'),
    fullPage: true,
  });

  console.log('\n=== Layout Consistency Check ===');
  console.log(`State H1: "${stateH1?.trim()}"`);
  console.log(`City H1:  "${cityH1?.trim()}"`);
  console.log(`State overflow: ${stateOverflow}`);
  console.log(`City overflow:  ${cityOverflow}`);

  expect(stateOverflow).toBe(false);
  expect(cityOverflow).toBe(false);
});
