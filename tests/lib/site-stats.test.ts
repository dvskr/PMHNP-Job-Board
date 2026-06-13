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

  it('returns safe defaults if the DB throws', async () => {
    vi.mocked(prisma.siteStat.findFirst).mockRejectedValue(new Error('db down'));
    const { getSiteStats } = await import('@/lib/site-stats');
    const stats = await getSiteStats();
    expect(stats.totalJobs).toBeGreaterThan(0);
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
