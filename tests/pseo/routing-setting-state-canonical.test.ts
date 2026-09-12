/**
 * Setting × state pSEO routing regressions.
 *
 *  1. getStats trusted pseoStats.totalJobs with no freshness check. That count
 *     drives the <title>, the OG title, the noindex gate and the 0-job
 *     notFound(), so a stalled aggregator cron published SERP counts the page
 *     could not back up: the sitemap already drops rows past the shared
 *     staleness window, so page and sitemap disagreed.
 *
 *  2. resolveStateSlug also accepts the 2-letter code, and the template
 *     self-canonicalled whatever raw param it was handed. /jobs/remote/ny and
 *     /jobs/remote/new-york both returned 200 with their own self-canonical,
 *     making every setting × state combination indexable twice.
 *     /jobs/state/[state] already 308s the alias away; this template did not.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PSEO_STALENESS_HOURS } from '@/lib/pseo/sitemap-thresholds';

const db = vi.hoisted(() => ({
  pseoStats: { findUnique: vi.fn(), findMany: vi.fn() },
  job: { count: vi.fn(), aggregate: vi.fn(), groupBy: vi.fn(), findMany: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ prisma: db }));

import { buildSettingStateMetadata } from '@/lib/pseo/setting-state-template';

const HOUR_MS = 60 * 60 * 1000;
const freshRow = (totalJobs: number) => ({
  totalJobs,
  rawAvgSalary: 150,
  updatedAt: new Date(Date.now() - HOUR_MS),
});
const staleRow = (totalJobs: number) => ({
  totalJobs,
  rawAvgSalary: 150,
  updatedAt: new Date(Date.now() - (PSEO_STALENESS_HOURS + 4) * HOUR_MS),
});

beforeEach(() => {
  db.pseoStats.findUnique.mockReset();
  db.pseoStats.findMany.mockReset().mockResolvedValue([]);
  db.job.count.mockReset().mockResolvedValue(0);
  db.job.aggregate.mockReset().mockResolvedValue({ _avg: { minSalary: null, maxSalary: null } });
  db.job.groupBy.mockReset().mockResolvedValue([]);
  db.job.findMany.mockReset().mockResolvedValue([]);
});

describe('setting × state metadata only trusts a fresh pseoStats row', () => {
  it('uses the aggregated count while the row is inside the staleness window', async () => {
    db.pseoStats.findUnique.mockResolvedValue(freshRow(12));

    const meta = await buildSettingStateMetadata('remote', 'new-york', 1);

    expect(meta.title).toContain('12');
    expect(db.job.count).not.toHaveBeenCalled();
  });

  it('falls back to the live count when the row is past the staleness window', async () => {
    db.pseoStats.findUnique.mockResolvedValue(staleRow(99));
    db.job.count.mockResolvedValue(4);

    const meta = await buildSettingStateMetadata('remote', 'new-york', 1);

    expect(db.job.count).toHaveBeenCalled();
    expect(meta.title).toContain('4');
    expect(meta.title).not.toContain('99');
    expect(String(meta.openGraph?.title ?? '')).not.toContain('99');
  });

  it('noindexes a stale row whose live count has collapsed below the thin-page floor', async () => {
    db.pseoStats.findUnique.mockResolvedValue(staleRow(99));
    db.job.count.mockResolvedValue(0);

    const meta = await buildSettingStateMetadata('remote', 'new-york', 1);

    expect(meta.title).toContain('0');
    expect(meta.robots).toEqual({ index: false, follow: true });
  });
});

describe('setting × state canonical never points at the state-code alias', () => {
  it('canonicals /jobs/remote/ny to the hyphenated state slug', async () => {
    db.pseoStats.findUnique.mockResolvedValue(freshRow(12));

    const meta = await buildSettingStateMetadata('remote', 'ny', 1);

    expect(meta.alternates?.canonical).toBe('https://pmhnphiring.com/jobs/remote/new-york');
  });

  it('looks the pseoStats row up by the canonical locationSlug, not the alias', async () => {
    db.pseoStats.findUnique.mockResolvedValue(freshRow(12));

    await buildSettingStateMetadata('telehealth', 'ca', 1);

    expect(db.pseoStats.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          type_categorySlug_locationSlug: {
            type: 'setting-state',
            categorySlug: 'telehealth',
            locationSlug: 'california',
          },
        },
      }),
    );
  });

  it('canonical is unchanged when the slug is already canonical', async () => {
    db.pseoStats.findUnique.mockResolvedValue(freshRow(12));

    const meta = await buildSettingStateMetadata('remote', 'new-york', 1);

    expect(meta.alternates?.canonical).toBe('https://pmhnphiring.com/jobs/remote/new-york');
  });
});

describe('setting × state page redirects the alias instead of rendering it', () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), 'lib/pseo/setting-state-template.tsx'),
    'utf8',
  );

  it('308s a non-canonical state slug to the canonical one', () => {
    expect(src).toContain('const canonicalStateSlug = stateToSlug(stateName!)');
    expect(src).toMatch(/if \(stateSlug !== canonicalStateSlug\) \{/);
    expect(src).toContain('permanentRedirect');
  });

  it('carries the page number through the redirect so page > 1 is not dropped', () => {
    expect(src).toContain('${page > 1 ? `?page=${page}` : \'\'}');
  });

  it('builds basePath from the canonical slug, never the raw param', () => {
    expect(src).not.toContain('const basePath = `/jobs/${config.slug}/${stateSlug}`');
    expect(src).toContain('const basePath = `/jobs/${config.slug}/${canonicalStateSlug}`');
  });
});
