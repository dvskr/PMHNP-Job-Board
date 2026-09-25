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
import { publicJobsWhere } from '@/lib/filters';
import { logger } from '@/lib/logger';

export interface SiteStats {
    totalJobs: number;
    totalCompanies: number;
    totalSubscribers: number;
}

/**
 * SiteStats plus the two render-time engagement counters. These are NOT
 * persisted in the SiteStat row — it is a fixed-column table and adding
 * columns would need a migration — so they are computed on demand behind
 * the in-module TTL cache below.
 */
export interface ExtendedSiteStats extends SiteStats {
    /** Published jobs created in the last 7 days. */
    jobsAddedThisWeek: number;
    /** Percentage (0-100) of published jobs that display a salary. */
    salaryTransparencyPct: number;
}

/**
 * Used only when the DB is unreachable: "we do not know", expressed as zeros.
 *
 * This used to be { totalJobs: 200, totalCompanies: 500 } — placeholder numbers
 * that nothing on the site could substantiate. Every consumer guards on
 * `> 0` before rendering (the Career Pulse card on the job detail page, the
 * homepage hero strip), so a non-zero placeholder sailed through those guards
 * and shipped "200 Active openings nationwide" as though it were a live count.
 * Zeros make the same guards do what they were written to do: show nothing
 * rather than a fabricated number. This is the policy getExtendedSiteStats
 * already states for its own null return.
 */
const FALLBACK: SiteStats = { totalJobs: 0, totalCompanies: 0, totalSubscribers: 0 };

/** Compute the live numbers. Expensive — call from the cron, not page renders.
 *  Jobs (and the distinct-employer set) are counted with publicJobsWhere(),
 *  the same predicate /jobs results use, so the advertised totals never
 *  exceed what a visitor can actually browse. */
export async function computeSiteStats(): Promise<SiteStats> {
    const jobsWhere = publicJobsWhere();
    const [totalJobs, distinctEmployers, totalSubscribers] = await Promise.all([
        prisma.job.count({ where: jobsWhere }),
        prisma.job.findMany({
            where: jobsWhere,
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

// ─── Render-time engagement counters ────────────────────────────────────────
// Same module-level TTL cache pattern as lib/ai/feature-flags.ts: three
// indexed COUNTs at most once per hour per server instance, matching the
// hourly cadence of the refresh-site-stats cron.

type EngagementStats = Pick<ExtendedSiteStats, 'jobsAddedThisWeek' | 'salaryTransparencyPct'>;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const ENGAGEMENT_CACHE_TTL_MS = 60 * 60 * 1000;
let engagementCache: { value: EngagementStats; cachedAt: number } | null = null;

async function computeEngagementStats(): Promise<EngagementStats> {
    const weekAgo = new Date(Date.now() - WEEK_MS);
    // Same predicate as computeSiteStats. The homepage prints the job total and
    // the salary percentage in ONE sentence, so a bare `{ isPublished: true }`
    // denominator here described a strictly larger population (expired rows +
    // the globally-excluded non-PMHNP rows) than the count printed next to it,
    // and the two numbers could not both be true.
    const jobsWhere = publicJobsWhere();
    const [jobsAddedThisWeek, publishedTotal, publishedWithSalary] = await Promise.all([
        prisma.job.count({ where: { ...jobsWhere, createdAt: { gte: weekAgo } } }),
        prisma.job.count({ where: jobsWhere }),
        prisma.job.count({ where: { ...jobsWhere, displaySalary: { not: null } } }),
    ]);
    const salaryTransparencyPct = publishedTotal > 0
        ? Math.round((100 * publishedWithSalary) / publishedTotal)
        : 0;
    return { jobsAddedThisWeek, salaryTransparencyPct };
}

/**
 * Cached base stats plus the render-time engagement counters.
 *
 * Returns `null` when the DB is unreachable — deliberately NOT the FALLBACK
 * constants, which are placeholders rather than real numbers. Callers should
 * hide their real-stats UI instead of presenting fabricated counts.
 */
export async function getExtendedSiteStats(
    options?: { forceRefresh?: boolean },
): Promise<ExtendedSiteStats | null> {
    try {
        let cached = engagementCache;
        const isStale = !cached || Date.now() - cached.cachedAt >= ENGAGEMENT_CACHE_TTL_MS;
        if (options?.forceRefresh || isStale || !cached) {
            cached = { value: await computeEngagementStats(), cachedAt: Date.now() };
            engagementCache = cached;
        }
        const row = await prisma.siteStat.findFirst({ orderBy: { updatedAt: 'desc' } });
        const base: SiteStats = row
            ? { totalJobs: row.totalJobs, totalCompanies: row.totalCompanies, totalSubscribers: row.totalSubscribers }
            : await computeSiteStats();
        return { ...base, ...cached.value };
    } catch (error) {
        logger.error('getExtendedSiteStats: hiding the stat strip, DB read failed', error);
        return null;
    }
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
    } catch (error) {
        // Never silent: the zeros below make every `> 0` guard hide its
        // stat, which is indistinguishable at the UI layer from a genuinely
        // empty board. The log is the only signal that the DB, not the
        // catalogue, is what went missing.
        logger.error('getSiteStats: falling back to zeros, DB read failed', error);
        return FALLBACK;
    }
}
