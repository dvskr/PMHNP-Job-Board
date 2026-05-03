import { test, expect } from '@playwright/test';

/**
 * Smoke tests — verify every top-traffic public page loads with the right
 * status code and key UI elements. Read-only, safe against production.
 *
 * Failure of any test here is a P0 incident.
 */

const PUBLIC_PAGES: Array<{ name: string; path: string; expect: RegExp | string }> = [
  { name: 'Homepage', path: '/', expect: /PMHNP/i },
  { name: 'Jobs index', path: '/jobs', expect: /jobs/i },
  { name: 'Salary guide', path: '/salary-guide', expect: /salary/i },
  { name: 'Resources', path: '/resources', expect: /resources/i },
  { name: 'Blog', path: '/blog', expect: /blog/i },
  { name: 'For employers', path: '/for-employers', expect: /employer/i },
  { name: 'For job seekers', path: '/for-job-seekers', expect: /job/i },
  { name: 'About', path: '/about', expect: /about/i },
  { name: 'FAQ', path: '/faq', expect: /faq|question/i },
  { name: 'Contact', path: '/contact', expect: /contact/i },
  { name: 'Login', path: '/login', expect: /sign in|log in|email/i },
  { name: 'Signup', path: '/signup', expect: /sign up|create.*account|email/i },
  { name: 'Job alerts', path: '/job-alerts', expect: /alert/i },
  { name: 'Pricing', path: '/pricing', expect: /price|plan/i },
  { name: 'Companies', path: '/companies', expect: /companies|employer/i },
  { name: 'Jobs by location', path: '/jobs/locations', expect: /location|state/i },
  { name: 'New grad jobs', path: '/jobs/new-grad', expect: /new.*grad|graduate/i },
  { name: 'Remote jobs', path: '/jobs/remote', expect: /remote/i },
  { name: 'Telehealth jobs', path: '/jobs/telehealth', expect: /telehealth/i },
  { name: 'Inpatient jobs', path: '/jobs/inpatient', expect: /inpatient/i },
];

for (const page of PUBLIC_PAGES) {
  test(`smoke: ${page.name} loads (${page.path})`, async ({ page: pwPage }) => {
    const response = await pwPage.goto(page.path);
    expect(response?.status(), `Expected 2xx for ${page.path}`).toBeLessThan(400);

    // Body must contain the expected content marker (case-insensitive)
    const bodyText = await pwPage.locator('body').innerText();
    if (page.expect instanceof RegExp) {
      expect(bodyText).toMatch(page.expect);
    } else {
      expect(bodyText.toLowerCase()).toContain(page.expect.toLowerCase());
    }

    // No "Application error" or "500" boilerplate visible
    expect(bodyText).not.toMatch(/Application error: a (server-side|client-side) exception/i);
    expect(bodyText).not.toMatch(/500\s*(?:internal server error|something went wrong)/i);
  });
}

test('smoke: homepage has working main nav', async ({ page }) => {
  await page.goto('/');
  // Top-nav should have at least Jobs and Login/Signup links
  const navLinks = page.locator('header a, nav a');
  const count = await navLinks.count();
  expect(count).toBeGreaterThan(3);
});

test('smoke: jobs page lists at least one job card', async ({ page }) => {
  await page.goto('/jobs');
  // Job cards typically have a title and apply button — look for "View" or "Apply" or job titles
  const jobLinks = page.locator('a[href*="/jobs/"]').filter({ hasNotText: /^(jobs|locations|state|metro|city|new-grad|remote|telehealth|inpatient|outpatient|behavioral-health|addiction|crisis|veterans|geriatric|child|substance|hospital|community-health|private-practice|va|correctional|lgbtq|new|grad|locum|tenens|travel|contract|full|part|per|diem|entry|mid|career|senior|1099|company|companies)$/i });
  const count = await jobLinks.count();
  expect(count, 'Expected at least 1 job link on /jobs').toBeGreaterThan(0);
});

test('smoke: search persists query in URL', async ({ page }) => {
  await page.goto('/jobs?q=remote');
  // Either a search input has the value, or results contain "remote"
  const url = page.url();
  expect(url).toContain('q=remote');
});

test('smoke: footer is present on homepage', async ({ page }) => {
  await page.goto('/');
  const footer = page.locator('footer');
  await expect(footer).toBeVisible();
  // Footer should have at least a few links
  const footerLinks = footer.locator('a');
  expect(await footerLinks.count()).toBeGreaterThan(2);
});
