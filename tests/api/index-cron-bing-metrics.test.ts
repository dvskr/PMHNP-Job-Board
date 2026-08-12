/**
 * Cron metrics must tell the truth about Bing.
 *
 * Before this fix both indexing crons collapsed Bing into two buckets
 * (submitted / failed) with no reason attached, so a daily-quota cap showed up
 * as a flat "500 failed" every run and looked like an unexplained outage. URLs
 * that were never sent must be reported as `skipped`, separately from URLs Bing
 * actually rejected, with a one-line reason an operator can act on.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { NextRequest } from 'next/server';
import { PSEO_INDEXING_CATEGORIES } from '@/lib/pseo/jobs-segments-edge';
import { CITIES } from '@/lib/pseo/city-data/cities';

// Each test dynamically imports a cron route, which pulls a heavy dependency
// graph (search indexing, pSEO city data, Prisma client). In isolation the
// whole file runs in about 5s, but under full-suite parallelism that first
// import alone can exceed the 5s default and fail a test whose assertions are
// pure. Every await inside these tests is mocked, so there is no network or
// database call to hide behind this: the budget covers module loading only.
vi.setConfig({ testTimeout: 30_000 });

const mockAllBatch = vi.fn();
const mockBingBatch = vi.fn();
const mockIndexNow = vi.fn();

// Keep the real summarizeBingResults: the routes' honesty depends on it, so
// stubbing it would test nothing.
vi.mock('@/lib/search-indexing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/search-indexing')>();
  return {
    ...actual,
    pingAllSearchEnginesBatch: mockAllBatch,
    pingBingBatch: mockBingBatch,
    pingIndexNow: mockIndexNow,
  };
});

const mockJobFindMany = vi.fn();
const mockPseoFindMany = vi.fn();
const mockPseoUpsert = vi.fn().mockResolvedValue({});

vi.mock('@/lib/prisma', () => ({
  prisma: {
    job: { findMany: mockJobFindMany },
    pseoStats: { findMany: mockPseoFindMany, upsert: mockPseoUpsert },
    cronRun: {
      create: vi.fn().mockResolvedValue({ id: 'cron-run-test' }),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock('@/lib/discord-notifier', () => ({
  sendCronFailureAlert: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/auth/verify-cron-or-admin', () => ({
  verifyCronOrAdmin: vi.fn().mockResolvedValue(null),
}));

const read = (rel: string): string =>
  fs.readFileSync(path.resolve(__dirname, '../../', rel), 'utf8');

const QUOTA_REASON =
  'Bing daily quota exhausted: 2 of 5 URLs submitted, 3 deferred to the next run';

/** Two accepted, three never sent. Fictional fixtures only. */
const bingRowsWithSkips = [
  { engine: 'Bing', url: 'https://pmhnphiring.com/jobs/a', success: true },
  { engine: 'Bing', url: 'https://pmhnphiring.com/jobs/b', success: true },
  { engine: 'Bing', url: 'https://pmhnphiring.com/jobs/c', success: false, skipped: true, error: QUOTA_REASON },
  { engine: 'Bing', url: 'https://pmhnphiring.com/jobs/d', success: false, skipped: true, error: QUOTA_REASON },
  { engine: 'Bing', url: 'https://pmhnphiring.com/jobs/e', success: false, skipped: true, error: QUOTA_REASON },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockPseoUpsert.mockResolvedValue({});
});

describe('index-urls: Bing metrics separate skipped from failed', () => {
  beforeEach(() => {
    mockJobFindMany.mockResolvedValue([
      { id: 'aaa-111', title: 'PMHNP Telehealth', sourceType: 'employer' },
    ]);
  });

  it('reports submitted, failed and skipped as three distinct counts with a reason', async () => {
    mockAllBatch.mockResolvedValue({ google: [], bing: bingRowsWithSkips, indexNow: [] });

    const { GET } = await import('@/app/api/cron/index-urls/route');
    const body = await (
      await GET(new NextRequest('http://localhost:3000/api/cron/index-urls'))
    ).json();

    expect(body.bing.submitted).toBe(2);
    // The old code reported this as failed: 3. That was the lie.
    expect(body.bing.failed).toBe(0);
    expect(body.bing.skipped).toBe(3);
    expect(body.bing.reason).toBe(QUOTA_REASON);
  });

  it('still reports genuine rejections as failures, not as skips', async () => {
    mockAllBatch.mockResolvedValue({
      google: [],
      bing: [
        { engine: 'Bing', url: 'https://pmhnphiring.com/jobs/a', success: false, error: 'HTTP 401: invalid api key' },
      ],
      indexNow: [],
    });

    const { GET } = await import('@/app/api/cron/index-urls/route');
    const body = await (
      await GET(new NextRequest('http://localhost:3000/api/cron/index-urls'))
    ).json();

    expect(body.bing.failed).toBe(1);
    expect(body.bing.skipped).toBe(0);
    expect(body.bing.reason).toContain('401');
  });

  it('omits the reason on a clean Bing run', async () => {
    mockAllBatch.mockResolvedValue({
      google: [],
      bing: [{ engine: 'Bing', url: 'https://pmhnphiring.com/jobs/a', success: true }],
      indexNow: [],
    });

    const { GET } = await import('@/app/api/cron/index-urls/route');
    const body = await (
      await GET(new NextRequest('http://localhost:3000/api/cron/index-urls'))
    ).json();

    expect(body.bing).toMatchObject({ submitted: 1, failed: 0, skipped: 0 });
    expect(body.bing.reason).toBeUndefined();
  });
});

describe('index-pseo: quota-skipped URLs are not marked as submitted', () => {
  const category = PSEO_INDEXING_CATEGORIES[0];
  const bigCities = CITIES.filter((c) => c.population >= 10000).slice(0, 5);

  beforeEach(() => {
    // First findMany: the quality-gated category-city rows. Second: the
    // 7-day "already submitted" dedupe set (empty).
    mockPseoFindMany
      .mockResolvedValueOnce(
        bigCities.map((c) => ({ categorySlug: category, locationSlug: c.slug, totalJobs: 10 }))
      )
      .mockResolvedValueOnce([]);
    mockIndexNow.mockResolvedValue([]);
  });

  it('does not write a dedupe row for a URL Bing never sent', async () => {
    // Accept the first two scored URLs, defer the rest.
    mockBingBatch.mockImplementation(async (urls: string[]) =>
      urls.map((url, i) =>
        i < 2
          ? { engine: 'Bing', url, success: true }
          : { engine: 'Bing', url, success: false, skipped: true, error: QUOTA_REASON }
      )
    );

    const { GET } = await import('@/app/api/cron/index-pseo/route');
    const body = await (
      await GET(new NextRequest('http://localhost:3000/api/cron/index-pseo'))
    ).json();

    const submittedUrls = (mockBingBatch.mock.calls[0][0] as string[]).slice(0, 2);

    // Only the two URLs that actually reached Bing get burned into the 7-day
    // dedupe window. Burning the deferred ones would hide them for a week
    // without a single attempt.
    expect(mockPseoUpsert).toHaveBeenCalledTimes(2);
    const upsertedSlugs = mockPseoUpsert.mock.calls.map(
      (c) => c[0].where.type_categorySlug_locationSlug.locationSlug
    );
    for (const url of submittedUrls) {
      expect(upsertedSlugs).toContain(url.split('/city/')[1]);
    }

    expect(body.bing).toMatchObject({ submitted: 2, failed: 0 });
    expect(body.bing.skipped).toBe(bigCities.length - 2);
    expect(body.bing.reason).toBe(QUOTA_REASON);
  });
});

describe('source locks', () => {
  it('the Bing client bounds each batch by both the 500 cap and the remaining quota', () => {
    const src = read('lib/search-indexing.ts');
    const start = src.indexOf('export async function pingBingBatch');
    const body = src.slice(start, src.indexOf('export interface BingSubmissionSummary'));

    // The old hardcoded slice must be gone.
    expect(body).not.toMatch(/const batchSize = 500/);
    expect(body).toMatch(/Math\.min\(BING_MAX_URLS_PER_BATCH, remaining\)/);
    // The quota must actually be consulted before submitting.
    expect(body).toMatch(/getBingRemainingQuota\(apiKey\)/);
    // Untried URLs must be deferred, not re-attempted.
    expect(body).toMatch(/deferRest\(/);
  });

  it('both indexing crons record bingSkipped in cron metrics', () => {
    for (const route of ['app/api/cron/index-urls/route.ts', 'app/api/cron/index-pseo/route.ts']) {
      const src = read(route);
      expect(src).toMatch(/summarizeBingResults/);
      expect(src).toMatch(/bingSkipped: bing\.skipped/);
      expect(src).toMatch(/bingReason: bing\.reason/);
    }
  });
});
