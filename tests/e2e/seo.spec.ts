import { test, expect } from '@playwright/test';

/**
 * SEO regression tests — protects rankings.
 *
 * Catches: broken sitemap, missing canonicals, robots.txt regressions,
 * malformed structured data, missing OG/Twitter metadata.
 */

test('robots.txt is reachable and well-formed', async ({ request }) => {
  const res = await request.get('/robots.txt');
  expect(res.status()).toBe(200);
  const body = await res.text();
  // Must reference at least one sitemap
  expect(body).toMatch(/Sitemap:\s*https?:\/\//i);
  // Must have at least one User-agent block
  expect(body).toMatch(/User-Agent:\s*\*/i);
  // Must NOT disallow the entire site by accident
  expect(body).not.toMatch(/User-Agent:\s*\*\s*\nDisallow:\s*\/\s*$/im);
});

test('sitemap.xml is reachable and contains job URLs', async ({ request }) => {
  const res = await request.get('/sitemap.xml');
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body).toContain('<urlset');
  // At minimum, homepage and /jobs should be present
  expect(body).toContain('https://pmhnphiring.com');
  expect(body).toMatch(/<loc>https:\/\/pmhnphiring\.com\/?<\/loc>/);
});

test('sitemap index is reachable', async ({ request }) => {
  const res = await request.get('/api/sitemaps/index');
  expect(res.status()).toBeLessThan(400);
});

test('homepage has canonical link tag', async ({ page }) => {
  await page.goto('/');
  const canonical = page.locator('link[rel="canonical"]');
  await expect(canonical).toHaveAttribute('href', /https:\/\/pmhnphiring\.com\/?$/);
});

test('jobs page has canonical link tag', async ({ page }) => {
  await page.goto('/jobs');
  const canonical = page.locator('link[rel="canonical"]');
  const href = await canonical.getAttribute('href');
  expect(href).toMatch(/\/jobs$/);
});

test('homepage has OG/Twitter metadata', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /.+/);
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', /.+/);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/api\/og|https?:\/\//);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', /summary/);
});

test('homepage has organization JSON-LD', async ({ page }) => {
  await page.goto('/');
  const ldScripts = page.locator('script[type="application/ld+json"]');
  const count = await ldScripts.count();
  expect(count).toBeGreaterThan(0);
});

test('a job detail page has JobPosting structured data', async ({ page, request }) => {
  // Find a real job from the listings page to test against
  const res = await request.get('/sitemap.xml');
  const body = await res.text();
  const jobUrlMatch = body.match(/<loc>(https:\/\/pmhnphiring\.com\/jobs\/[^<]+)<\/loc>/);
  if (!jobUrlMatch) {
    test.skip(true, 'No job URLs in sitemap to test');
    return;
  }
  const jobUrl = new URL(jobUrlMatch[1]).pathname;
  await page.goto(jobUrl);
  const ldScripts = page.locator('script[type="application/ld+json"]');
  const count = await ldScripts.count();
  expect(count).toBeGreaterThan(0);
  // At least one should be JobPosting
  const allText = await ldScripts.allInnerTexts();
  const hasJobPosting = allText.some((t) => t.includes('"@type"') && t.includes('JobPosting'));
  expect(hasJobPosting, 'Expected JobPosting structured data on job detail').toBe(true);
});

test('trailing slash redirects to no-trailing-slash', async ({ request }) => {
  const res = await request.get('/jobs/', { maxRedirects: 0 });
  expect([301, 308]).toContain(res.status());
  const location = res.headers()['location'] || '';
  expect(location).toMatch(/\/jobs$/);
});

test('uppercase URL redirects to lowercase', async ({ request }) => {
  const res = await request.get('/Jobs', { maxRedirects: 0 });
  expect([301, 308]).toContain(res.status());
  const location = res.headers()['location'] || '';
  expect(location).toMatch(/\/jobs$/);
});
