import { test, expect } from '@playwright/test';

/**
 * Regression tests — verify each fix shipped in commit d916ec2 still works.
 * Order matches the original log audit findings (2026-05-02).
 *
 * If any of these starts failing, look at the corresponding source file:
 *   - app/api/og/{route,city/route}.tsx
 *   - next.config.ts (redirects)
 *   - middleware.ts (410 logic)
 *   - app/api/resume/parse/route.ts
 *   - app/robots.ts
 */

test.describe('Fix 1: /api/og edge caching', () => {
  test('returns expected Cache-Control header', async ({ request }) => {
    const res = await request.get('/api/og?title=regression-test');
    expect(res.status()).toBe(200);
    const cacheControl = res.headers()['cache-control'] || '';
    expect(cacheControl).toContain('s-maxage=2592000');
    expect(cacheControl).toContain('stale-while-revalidate=86400');
  });

  test('serves cached on repeat (HIT after warmup)', async ({ request }) => {
    const url = '/api/og?title=cache-warmup-' + Date.now();
    // First call warms the cache
    await request.get(url);
    // Subsequent calls should HIT
    let hitCount = 0;
    for (let i = 0; i < 5; i++) {
      const res = await request.get(url);
      const xCache = (res.headers()['x-vercel-cache'] || '').toUpperCase();
      if (xCache === 'HIT') hitCount++;
    }
    // Allow for 1 cold start, but most should HIT
    expect(hitCount, 'Expected at least 3 of 5 repeat calls to HIT cache').toBeGreaterThanOrEqual(3);
  });
});

test.describe('Fix 2: crawler-trap redirects', () => {
  const REDIRECTS: Array<{ from: string; toContains: string }> = [
    { from: '/jobs/locations/city/boston-ma', toContains: '/jobs/city/boston-ma' },
    { from: '/salary-guide/city/venice-fl', toContains: '/salary-guide' },
    { from: '/register', toContains: '/signup' },
    { from: '/states', toContains: '/jobs/locations' },
    { from: '/locations', toContains: '/jobs/locations' },
    { from: '/employers', toContains: '/for-employers' },
    { from: '/alerts', toContains: '/job-alerts' },
  ];

  for (const r of REDIRECTS) {
    test(`${r.from} → ${r.toContains}`, async ({ request }) => {
      const res = await request.get(r.from, { maxRedirects: 0 });
      expect([301, 308]).toContain(res.status());
      const location = res.headers()['location'] || '';
      expect(location).toContain(r.toContains);
    });
  }
});

test.describe('Fix 3: empty-company 410 Gone', () => {
  // These slugs were 404ing in the original audit. After the fix, they should
  // either return 410 (company exists, no jobs) OR 200 (company has jobs again).
  // 404 = regression.
  const KNOWN_EMPTY_COMPANIES = [
    'ennoble%20care',
    'amergis%20staffing',
    'valley%20behavioral',
    'summit%20primary%20care',
    'renew%20mental',
  ];

  test('at least one known-empty company returns 410', async ({ request }) => {
    const statuses: number[] = [];
    for (const slug of KNOWN_EMPTY_COMPANIES) {
      const res = await request.get(`/companies/${slug}`, { maxRedirects: 0 });
      statuses.push(res.status());
    }
    // Acceptable: any mix of 200 (has jobs now) and 410 (empty). Reject 404.
    const has404 = statuses.includes(404);
    expect(
      has404,
      `Companies should return 200 or 410, not 404. Got: ${statuses.join(', ')}`
    ).toBe(false);
    // At least one should be 410 OR all 200 (means data filled in — also fine)
    const has410 = statuses.includes(410);
    const all200 = statuses.every((s) => s === 200);
    expect(has410 || all200).toBe(true);
  });
});

test.describe('Fix 4: /api/resume/parse error handling', () => {
  test('rejects unauthenticated request with 401', async ({ request }) => {
    const res = await request.post('/api/resume/parse', {
      data: { resumeUrl: 'fake/path.pdf' },
    });
    // Should be 401 (unauthenticated), NOT 500 (the old broken behavior)
    expect(res.status()).toBe(401);
  });

  test('does not return 500 on bad payload', async ({ request }) => {
    const res = await request.post('/api/resume/parse', {
      data: { invalid: 'payload' },
    });
    // Auth runs first (401). If somehow auth passes, validation gives 400.
    // 500 is unacceptable — that's what we fixed.
    expect(res.status()).not.toBe(500);
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('Fix 5: robots.txt crawl-delay', () => {
  test('PerplexityBot has crawl-delay', async ({ request }) => {
    const res = await request.get('/robots.txt');
    const body = await res.text();
    // Find the PerplexityBot block and check it has Crawl-delay
    const perplexityBlock = body.match(/User-Agent:\s*PerplexityBot[\s\S]*?(?=User-Agent:|$)/i);
    expect(perplexityBlock, 'PerplexityBot block missing from robots.txt').toBeTruthy();
    expect(perplexityBlock![0]).toMatch(/Crawl-delay:\s*\d+/i);
  });

  test('AhrefsBot has crawl-delay', async ({ request }) => {
    const res = await request.get('/robots.txt');
    const body = await res.text();
    const ahrefsBlock = body.match(/User-Agent:\s*AhrefsBot[\s\S]*?(?=User-Agent:|$)/i);
    expect(ahrefsBlock, 'AhrefsBot block missing from robots.txt').toBeTruthy();
    expect(ahrefsBlock![0]).toMatch(/Crawl-delay:\s*\d+/i);
  });
});

test.describe('Fix 6: 410 vs 404 for deleted jobs', () => {
  test('synthetic deleted-job slug returns 410, not 404', async ({ request }) => {
    // Construct a slug with a UUID that almost certainly doesn't exist
    const fakeUuid = '00000000-0000-4000-8000-000000000000';
    const res = await request.get(`/jobs/test-deleted-job-${fakeUuid}`, {
      maxRedirects: 0,
    });
    // Middleware should return 410 for non-existent UUIDs in /jobs/[slug]
    expect(res.status()).toBe(410);
  });
});
