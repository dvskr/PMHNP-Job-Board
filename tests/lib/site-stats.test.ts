/**
 * SiteStat wiring — the homepage now reads cached counters from the SiteStat
 * singleton (refreshed by the refresh-site-stats cron) instead of running a
 * COUNT + distinct-employer query on every render. These tests lock in:
 *  - reads use the cached row when present (no live aggregate),
 *  - reads fall back to a live compute when the row is empty,
 *  - refresh computes + upserts the singleton row.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    siteStat: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    job: { count: vi.fn(), findMany: vi.fn() },
    emailLead: { count: vi.fn() },
  },
}));

beforeEach(() => vi.clearAllMocks());

describe('getSiteStats', () => {
  it('returns the cached SiteStat row without running aggregates', async () => {
    vi.mocked(prisma.siteStat.findFirst).mockResolvedValue({ id: 's1', totalJobs: 1234, totalCompanies: 88, totalSubscribers: 4200 } as never);
    const { getSiteStats } = await import('@/lib/site-stats');
    const stats = await getSiteStats();
    expect(stats).toEqual({ totalJobs: 1234, totalCompanies: 88, totalSubscribers: 4200 });
    expect(prisma.job.count).not.toHaveBeenCalled();
    expect(prisma.job.findMany).not.toHaveBeenCalled();
  });

  it('falls back to a live compute when no snapshot exists yet', async () => {
    vi.mocked(prisma.siteStat.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.job.count).mockResolvedValue(500 as never);
    vi.mocked(prisma.job.findMany).mockResolvedValue([{ employer: 'A' }, { employer: 'B' }] as never);
    vi.mocked(prisma.emailLead.count).mockResolvedValue(99 as never);
    const { getSiteStats } = await import('@/lib/site-stats');
    const stats = await getSiteStats();
    expect(stats).toEqual({ totalJobs: 500, totalCompanies: 2, totalSubscribers: 99 });
  });

  // The fallback used to be { totalJobs: 200, totalCompanies: 500 }. Every
  // consumer guards on `> 0` before rendering, so those placeholders sailed
  // through the guards and the job detail page shipped "200 Active openings
  // nationwide" as a live count while the DB was down. Zeros mean "unknown"
  // and let the existing guards hide the stat.
  it('returns zeros, never fabricated placeholder counts, if the DB throws', async () => {
    vi.mocked(prisma.siteStat.findFirst).mockRejectedValue(new Error('db down'));
    const { getSiteStats } = await import('@/lib/site-stats');
    const stats = await getSiteStats();
    expect(stats).toEqual({ totalJobs: 0, totalCompanies: 0, totalSubscribers: 0 });
  });
});

describe('refreshSiteStats', () => {
  beforeEach(() => {
    vi.mocked(prisma.job.count).mockResolvedValue(777 as never);
    vi.mocked(prisma.job.findMany).mockResolvedValue([{ employer: 'X' }, { employer: 'Y' }, { employer: 'Z' }] as never);
    vi.mocked(prisma.emailLead.count).mockResolvedValue(150 as never);
  });

  it('creates the singleton row when none exists', async () => {
    vi.mocked(prisma.siteStat.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.siteStat.create).mockResolvedValue({} as never);
    const { refreshSiteStats } = await import('@/lib/site-stats');
    const stats = await refreshSiteStats();
    expect(stats).toEqual({ totalJobs: 777, totalCompanies: 3, totalSubscribers: 150 });
    expect(prisma.siteStat.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { totalJobs: 777, totalCompanies: 3, totalSubscribers: 150 } }),
    );
    expect(prisma.siteStat.update).not.toHaveBeenCalled();
  });

  it('updates the existing singleton row', async () => {
    vi.mocked(prisma.siteStat.findFirst).mockResolvedValue({ id: 'existing' } as never);
    vi.mocked(prisma.siteStat.update).mockResolvedValue({} as never);
    const { refreshSiteStats } = await import('@/lib/site-stats');
    await refreshSiteStats();
    expect(prisma.siteStat.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'existing' }, data: { totalJobs: 777, totalCompanies: 3, totalSubscribers: 150 } }),
    );
    expect(prisma.siteStat.create).not.toHaveBeenCalled();
  });
});

describe('getExtendedSiteStats', () => {
  // The SiteStat row is fixed-column (no migration wanted), so the two
  // engagement counters are computed at read time behind an in-module TTL
  // cache. forceRefresh bypasses that cache for test isolation.
  it('combines the cached snapshot with fresh engagement counts', async () => {
    vi.mocked(prisma.siteStat.findFirst).mockResolvedValue({ id: 's1', totalJobs: 1234, totalCompanies: 88, totalSubscribers: 4200 } as never);
    vi.mocked(prisma.job.count)
      .mockResolvedValueOnce(12 as never)   // published, created in last 7d
      .mockResolvedValueOnce(400 as never)  // published total
      .mockResolvedValueOnce(300 as never); // published with displaySalary
    const { getExtendedSiteStats } = await import('@/lib/site-stats');
    const stats = await getExtendedSiteStats({ forceRefresh: true });
    expect(stats).toEqual({
      totalJobs: 1234,
      totalCompanies: 88,
      totalSubscribers: 4200,
      jobsAddedThisWeek: 12,
      salaryTransparencyPct: 75,
    });
  });

  it('rounds the salary transparency percentage', async () => {
    vi.mocked(prisma.siteStat.findFirst).mockResolvedValue({ id: 's1', totalJobs: 3, totalCompanies: 2, totalSubscribers: 0 } as never);
    vi.mocked(prisma.job.count)
      .mockResolvedValueOnce(1 as never)
      .mockResolvedValueOnce(3 as never)
      .mockResolvedValueOnce(2 as never); // 2/3 → 66.67 → 67
    const { getExtendedSiteStats } = await import('@/lib/site-stats');
    const stats = await getExtendedSiteStats({ forceRefresh: true });
    expect(stats?.salaryTransparencyPct).toBe(67);
  });

  it('serves engagement counts from the in-memory cache within the TTL', async () => {
    vi.mocked(prisma.siteStat.findFirst).mockResolvedValue({ id: 's1', totalJobs: 10, totalCompanies: 2, totalSubscribers: 1 } as never);
    vi.mocked(prisma.job.count)
      .mockResolvedValueOnce(5 as never)
      .mockResolvedValueOnce(10 as never)
      .mockResolvedValueOnce(4 as never);
    const { getExtendedSiteStats } = await import('@/lib/site-stats');
    await getExtendedSiteStats({ forceRefresh: true }); // primes the cache
    vi.mocked(prisma.job.count).mockClear();
    const second = await getExtendedSiteStats();
    expect(prisma.job.count).not.toHaveBeenCalled();
    expect(second?.salaryTransparencyPct).toBe(40);
  });

  // The homepage prints the job total and the salary percentage in one
  // sentence, so both have to come from the SAME population. A bare
  // { isPublished: true } denominator counted expired and globally-excluded
  // rows the advertised total does not include.
  it('counts engagement stats with publicJobsWhere, not a bare isPublished', async () => {
    const { publicJobsWhere } = await import('@/lib/filters');
    vi.mocked(prisma.siteStat.findFirst).mockResolvedValue({ id: 's1', totalJobs: 10, totalCompanies: 2, totalSubscribers: 1 } as never);
    vi.mocked(prisma.job.count).mockResolvedValue(5 as never);
    const { getExtendedSiteStats } = await import('@/lib/site-stats');
    await getExtendedSiteStats({ forceRefresh: true });

    const expectedExclusions = (publicJobsWhere().AND as unknown[]).length;
    const calls = vi.mocked(prisma.job.count).mock.calls;
    expect(calls).toHaveLength(3);
    for (const [arg] of calls) {
      const where = (arg as { where: { isPublished?: boolean; AND?: unknown[] } }).where;
      expect(where.isPublished).toBe(true);
      expect(where.AND).toHaveLength(expectedExclusions);
    }
  });

  it('returns null instead of fabricated numbers when the DB is down', async () => {
    vi.mocked(prisma.job.count).mockRejectedValue(new Error('db down'));
    const { getExtendedSiteStats } = await import('@/lib/site-stats');
    expect(await getExtendedSiteStats({ forceRefresh: true })).toBeNull();
  });
});
