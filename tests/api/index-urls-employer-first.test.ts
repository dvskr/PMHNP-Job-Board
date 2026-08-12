/**
 * Workstream B regression locks: search-engine plumbing for paid distribution.
 *
 * B1: pingAllSearchEnginesBatch fills the Google Indexing API daily slice in
 * array order (first 100 URLs). The index-urls cron used to order purely by
 * recency, so on busy ingest days scraped churn crowded employer-posted
 * (paying) jobs out of the quota. Employer URLs must sit at the FRONT of the
 * submission list, with the total attempt count unchanged.
 *
 * B2: IndexNow failures were invisible. INDEXNOW_API_KEY is unset in prod,
 * pingIndexNow returned failure rows without logging, and the cron still
 * reported a green run. Total IndexNow failure must now alert the same
 * Discord channel the cron's catch block uses, and the failure must surface
 * in the summary payload.
 */
import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';

const mockBatch = vi.fn();
// Spread the real module: the route also imports summarizeBingResults, and a
// partial mock silently turns that into a 500 at runtime.
vi.mock('@/lib/search-indexing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/search-indexing')>();
  return { ...actual, pingAllSearchEnginesBatch: mockBatch };
});

const mockCronAlert = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/discord-notifier', () => ({
  sendCronFailureAlert: mockCronAlert,
}));

vi.mock('@/lib/auth/verify-cron-or-admin', () => ({
  verifyCronOrAdmin: vi.fn().mockResolvedValue(null),
}));

const read = (rel: string): string =>
  fs.readFileSync(path.resolve(__dirname, '../../', rel), 'utf8');

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/cron/index-urls');
}

// Fictional fixtures only. createdAt-desc order from the DB puts the employer
// post LAST — exactly the losing position the fix must reverse.
const scrapedNewest = { id: 'scr-aaa-111', title: 'PMHNP Telehealth', sourceType: 'scraped' };
const scrapedNewer = { id: 'scr-bbb-222', title: 'PMHNP Outpatient', sourceType: null };
const employerOldest = { id: 'emp-ccc-333', title: 'PMHNP Private Practice', sourceType: 'employer' };

describe('B1: employer-posted jobs claim the Google slice first', () => {
  it('submits employer URLs at the front of the batch, total count unchanged', async () => {
    vi.mocked(prisma.job.findMany).mockResolvedValue(
      [scrapedNewest, scrapedNewer, employerOldest] as never
    );
    mockBatch.mockResolvedValue({ google: [], bing: [], indexNow: [] });

    const { GET } = await import('@/app/api/cron/index-urls/route');
    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    expect(mockBatch).toHaveBeenCalledOnce();
    const urls = mockBatch.mock.calls[0][0] as string[];
    expect(urls).toHaveLength(3);
    // Employer post first despite being the oldest by createdAt.
    expect(urls[0]).toContain('emp-ccc-333');
    // Scraped jobs keep their relative recency order behind it.
    expect(urls[1]).toContain('scr-aaa-111');
    expect(urls[2]).toContain('scr-bbb-222');
  });

  it('reports the employer count in the summary payload', async () => {
    vi.mocked(prisma.job.findMany).mockResolvedValue(
      [scrapedNewest, employerOldest] as never
    );
    mockBatch.mockResolvedValue({ google: [], bing: [], indexNow: [] });

    const { GET } = await import('@/app/api/cron/index-urls/route');
    const body = await (await GET(makeRequest())).json();

    expect(body.jobCount).toBe(2);
    expect(body.employerJobCount).toBe(1);
  });
});

describe('B2: IndexNow failures are visible', () => {
  it('alerts Discord and surfaces the error when every IndexNow submission fails', async () => {
    vi.mocked(prisma.job.findMany).mockResolvedValue([employerOldest] as never);
    mockBatch.mockResolvedValue({
      google: [{ engine: 'Google', url: 'u', success: true }],
      bing: [],
      indexNow: [
        { engine: 'IndexNow', url: 'u', success: false, error: 'INDEXNOW_API_KEY / INDEXNOW_KEY not set' },
      ],
    });

    const { GET } = await import('@/app/api/cron/index-urls/route');
    const body = await (await GET(makeRequest())).json();

    expect(body.indexNow.failed).toBe(1);
    expect(body.indexNow.error).toContain('not set');
    expect(mockCronAlert).toHaveBeenCalledOnce();
    expect(String(mockCronAlert.mock.calls[0][0])).toContain('IndexNow');
  });

  it('does NOT alert when IndexNow partially succeeds (normal flake)', async () => {
    vi.mocked(prisma.job.findMany).mockResolvedValue([employerOldest, scrapedNewest] as never);
    mockBatch.mockResolvedValue({
      google: [],
      bing: [],
      indexNow: [
        { engine: 'IndexNow', url: 'u1', success: true },
        { engine: 'IndexNow', url: 'u2', success: false, error: '429: too many requests' },
      ],
    });

    const { GET } = await import('@/app/api/cron/index-urls/route');
    const body = await (await GET(makeRequest())).json();

    expect(body.indexNow.submitted).toBe(1);
    expect(body.indexNow.failed).toBe(1);
    expect(mockCronAlert).not.toHaveBeenCalled();
  });
});

describe('source locks', () => {
  it('the cron selects sourceType and partitions employer jobs to the front', () => {
    const src = read('app/api/cron/index-urls/route.ts');
    expect(src).toMatch(/sourceType:\s*true/);
    expect(src).toMatch(/sourceType === 'employer'/);
    expect(src).toMatch(/\[\.\.\.employerJobs,\s*\.\.\.scrapedJobs\]/);
    // URLs must be built from the partitioned list, not the raw query order.
    expect(src).toMatch(/orderedJobs\.map/);
  });

  it('pingIndexNow logs missing-key and rejection through lib/logger, not silently', () => {
    const src = read('lib/search-indexing.ts');
    const start = src.indexOf('export async function pingIndexNow');
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf('export async function', start + 10);
    const body = src.slice(start, end === -1 ? undefined : end);
    expect(body).toMatch(/logger\.warn\('\[IndexNow\]/);
    expect(body).toMatch(/logger\.error\('\[IndexNow\]/);
  });
});
