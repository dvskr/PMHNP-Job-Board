import type { Prisma } from '@prisma/client';
import { GLOBAL_EXCLUSIONS } from '@/lib/filters';

/**
 * Dead-link gate (S6, audit 2026-05-31).
 *
 * `healthConsecutiveMissing` is incremented by the check-dead-links cron each
 * time a job's source listing returns missing/404. It was written but never
 * used to gate visibility ("shadow mode"), so jobs whose apply link had been
 * dead for many consecutive checks stayed `isPublished=true` and kept appearing
 * in the sitemaps — Googlebot crawls them, hits a dead end, and the URL becomes
 * a soft-404 / low-quality signal. We exclude jobs at or above this many
 * consecutive misses from indexable surfaces (sitemaps), without unpublishing
 * them outright (a separate decision owned by the health pipeline).
 */
export const DEAD_LINK_MISS_THRESHOLD = 5;

/**
 * Prisma `where` for jobs that should appear in indexable surfaces (sitemaps):
 * published, not expired, and not flagged as a repeated dead link.
 *
 * `now` is injectable for deterministic tests.
 *
 * `expiryBufferDays` (GSC Fix, 2026-07 audit): the job-detail sitemaps pass 7
 * so jobs within a week of expiry stop being advertised — Google's median
 * index latency exceeds the remaining lifetime of a near-expiry job, so
 * advertising it spends crawl budget on a URL that will 410 before it earns
 * an impression. Applies ONLY to the job-detail sitemap surfaces; aggregate
 * counts (city/company gates) deliberately keep the unbuffered view so they
 * stay consistent with the page-level render gates.
 *
 * GLOBAL_EXCLUSIONS (hunt 2026-09-03): this predicate used to carry the expiry
 * and health gates but NOT the site-wide non-PMHNP exclusions, so the sitemaps,
 * /feed.xml and /feeds/jobs.xml advertised the MD-Psychiatrist and
 * off-specialty NP postings that publicJobsWhere() hides from every browse
 * surface. A PMHNP job board must not syndicate a URL no visitor can reach
 * through its own listings. The exclusions live in an `AND` array while the
 * expiry stays in the top-level `OR`, which is the shape app/sitemap.ts already
 * spreads and merges (its own `AND: NOT_EXCLUDED` overrides with the identical
 * array).
 */
export function activeIndexableJobWhere(
    now: Date = new Date(),
    options?: { expiryBufferDays?: number },
): Prisma.JobWhereInput {
    const bufferMs = (options?.expiryBufferDays ?? 0) * 24 * 60 * 60 * 1000;
    const expiryHorizon = bufferMs > 0 ? new Date(now.getTime() + bufferMs) : now;
    return {
        isPublished: true,
        healthConsecutiveMissing: { lt: DEAD_LINK_MISS_THRESHOLD },
        OR: [
            { expiresAt: null },
            { expiresAt: { gt: expiryHorizon } },
        ],
        AND: GLOBAL_EXCLUSIONS.map((exclusion): Prisma.JobWhereInput => ({ NOT: exclusion })),
    };
}
