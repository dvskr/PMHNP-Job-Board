/**
 * Cached site-wide counters (jobs / companies / subscribers).
 *
 * The homepage previously ran a `job.count` AND a `findMany({ distinct:
 * ['employer'] })` on every render + every metadata generation — expensive
 * aggregates on the hottest, most-crawled page. This caches the numbers in the
 * `SiteStat` singleton row, refreshed by the refresh-site-stats cron, so page
 * loads do a single cheap row read instead.
 *
 * Reads fall back to a live compute if the row hasn't been populated yet (e.g.
 * before the cron's first run), and to fixed defaults if the DB is unreachable.
 */
import { prisma } from '@/lib/prisma';

export interface SiteStats {
    totalJobs: number;
    totalCompanies: number;
    totalSubscribers: number;
}

/** Used only when the DB is unreachable — keeps the homepage rendering. */
const FALLBACK: SiteStats = { totalJobs: 200, totalCompanies: 500, totalSubscribers: 0 };

/** Compute the live numbers. Expensive — call from the cron, not page renders. */
export async function computeSiteStats(): Promise<SiteStats> {
    const [totalJobs, distinctEmployers, totalSubscribers] = await Promise.all([
        prisma.job.count({ where: { isPublished: true } }),
        prisma.job.findMany({
            where: { isPublished: true },
            distinct: ['employer'],
            select: { employer: true },
        }),
        prisma.emailLead.count({ where: { newsletterOptIn: true, isSuppressed: false } }),
    ]);
    return { totalJobs, totalCompanies: distinctEmployers.length, totalSubscribers };
}

/** Compute + persist the numbers into the SiteStat singleton row. */
export async function refreshSiteStats(): Promise<SiteStats> {
    const stats = await computeSiteStats();
    const existing = await prisma.siteStat.findFirst({ orderBy: { updatedAt: 'desc' } });
    if (existing) {
        await prisma.siteStat.update({ where: { id: existing.id }, data: stats });
    } else {
        await prisma.siteStat.create({ data: stats });
    }
    return stats;
}

/** Read the cached numbers for display. Falls back to live compute if the row
 *  isn't populated yet, and to fixed defaults if the DB is down. */
export async function getSiteStats(): Promise<SiteStats> {
    try {
        const row = await prisma.siteStat.findFirst({ orderBy: { updatedAt: 'desc' } });
        if (row) {
            return {
                totalJobs: row.totalJobs,
                totalCompanies: row.totalCompanies,
                totalSubscribers: row.totalSubscribers,
            };
        }
        return await computeSiteStats();
    } catch {
        return FALLBACK;
    }
}
