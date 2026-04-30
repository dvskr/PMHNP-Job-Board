import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireApiAdmin } from '@/lib/auth/require-api-admin';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/admin/health
 *
 * Aggregated read-only view of the job-health detection system.
 * Surfaces what Sprints 1–5 produce so admins can monitor:
 *   • Catalog top-line (total / published / unpublished / dead-suspected)
 *   • Per-source breakdown (published, dead-suspected, last seen)
 *   • Vote outcome distribution (last 7 days from job_health_checks)
 *   • Recent flips (jobs unpublished in last 24h, with reason)
 *   • Source-presence health (consecutive-missing distribution)
 *   • Soft-404 pattern hits (last 7 days)
 *
 * Heavy queries are scoped to small windows (24h / 7d) and grouped on the
 * DB side so the payload stays small and the page stays snappy.
 */
export async function GET() {
    const authError = await requireApiAdmin();
    if (authError) return authError;

    try {
        const now = new Date();
        const day = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const week = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        // ── Catalog top-line ──────────────────────────────────────────
        const [
            totalJobs,
            publishedJobs,
            manuallyUnpublished,
            unpublishedLast24h,
            unpublishedLast7d,
            deadSuspectedPublished,
        ] = await Promise.all([
            prisma.job.count(),
            prisma.job.count({ where: { isPublished: true } }),
            prisma.job.count({ where: { isManuallyUnpublished: true } }),
            prisma.job.count({
                where: {
                    isPublished: false,
                    isManuallyUnpublished: false,
                    updatedAt: { gte: day },
                },
            }),
            prisma.job.count({
                where: {
                    isPublished: false,
                    isManuallyUnpublished: false,
                    updatedAt: { gte: week },
                },
            }),
            prisma.job.count({
                where: {
                    isPublished: true,
                    healthConsecutiveMissing: { gte: 3 },
                },
            }),
        ]);

        // ── Per-source breakdown ──────────────────────────────────────
        const sourceGroups = await prisma.job.groupBy({
            by: ['sourceProvider'],
            _count: { _all: true },
        });
        const sourcePublished = await prisma.job.groupBy({
            by: ['sourceProvider'],
            where: { isPublished: true },
            _count: { _all: true },
        });
        const sourceDeadSuspected = await prisma.job.groupBy({
            by: ['sourceProvider'],
            where: {
                isPublished: true,
                healthConsecutiveMissing: { gte: 3 },
            },
            _count: { _all: true },
        });

        const publishedMap = new Map(
            sourcePublished.map((g) => [g.sourceProvider ?? 'unknown', g._count._all]),
        );
        const deadMap = new Map(
            sourceDeadSuspected.map((g) => [g.sourceProvider ?? 'unknown', g._count._all]),
        );

        const sources = sourceGroups
            .map((g) => {
                const key = g.sourceProvider ?? 'unknown';
                return {
                    source: key,
                    total: g._count._all,
                    published: publishedMap.get(key) ?? 0,
                    deadSuspected: deadMap.get(key) ?? 0,
                };
            })
            .sort((a, b) => b.published - a.published);

        // ── Vote / outcome distribution (last 7d, grouped by outcome) ─
        const outcomeCounts = await prisma.jobHealthCheck.groupBy({
            by: ['outcome'],
            where: { checkedAt: { gte: week } },
            _count: { _all: true },
            orderBy: { _count: { outcome: 'desc' } },
        });

        // ── Soft-404 pattern hits (last 7d) ───────────────────────────
        const softPatternHits = await prisma.jobHealthCheck.groupBy({
            by: ['softPatternId'],
            where: {
                checkedAt: { gte: week },
                outcome: 'soft_404',
                softPatternId: { not: null },
            },
            _count: { _all: true },
            orderBy: { _count: { softPatternId: 'desc' } },
            take: 15,
        });

        // ── Source-presence (consecutive-missing) distribution ───────
        const presenceBuckets = await prisma.$queryRaw<
            { bucket: string; n: bigint }[]
        >`
            SELECT
              CASE
                WHEN health_consecutive_missing = 0 THEN '0 (alive)'
                WHEN health_consecutive_missing = 1 THEN '1 missing'
                WHEN health_consecutive_missing = 2 THEN '2 missing'
                WHEN health_consecutive_missing >= 3 THEN '3+ missing (dead-suspected)'
                ELSE 'unknown'
              END AS bucket,
              COUNT(*)::bigint AS n
            FROM jobs
            WHERE is_published = true
            GROUP BY bucket
            ORDER BY bucket;
        `;

        // ── Recent flips (last 24h) ──────────────────────────────────
        const recentFlips = await prisma.job.findMany({
            where: {
                isPublished: false,
                isManuallyUnpublished: false,
                updatedAt: { gte: day },
            },
            select: {
                id: true,
                title: true,
                employer: true,
                sourceProvider: true,
                updatedAt: true,
                healthConsecutiveMissing: true,
                healthChecks: {
                    orderBy: { checkedAt: 'desc' },
                    take: 1,
                    select: {
                        outcome: true,
                        checkType: true,
                        httpStatus: true,
                        softPatternId: true,
                        checkedAt: true,
                    },
                },
            },
            orderBy: { updatedAt: 'desc' },
            take: 25,
        });

        // ── Health-check throughput (last 7d, by check_type) ──────────
        const checkTypeCounts = await prisma.jobHealthCheck.groupBy({
            by: ['checkType'],
            where: { checkedAt: { gte: week } },
            _count: { _all: true },
        });

        const lastCheck = await prisma.jobHealthCheck.findFirst({
            orderBy: { checkedAt: 'desc' },
            select: { checkedAt: true },
        });

        return NextResponse.json({
            success: true,
            generatedAt: now.toISOString(),
            catalog: {
                total: totalJobs,
                published: publishedJobs,
                unpublished: totalJobs - publishedJobs,
                manuallyUnpublished,
                unpublishedLast24h,
                unpublishedLast7d,
                deadSuspectedPublished,
            },
            sources,
            outcomes: outcomeCounts.map((o) => ({
                outcome: o.outcome,
                count: o._count._all,
            })),
            softPatternHits: softPatternHits.map((p) => ({
                patternId: p.softPatternId,
                count: p._count._all,
            })),
            presenceBuckets: presenceBuckets.map((b) => ({
                bucket: b.bucket,
                count: Number(b.n),
            })),
            recentFlips: recentFlips.map((j) => ({
                id: j.id,
                title: j.title,
                employer: j.employer,
                sourceProvider: j.sourceProvider,
                updatedAt: j.updatedAt.toISOString(),
                consecutiveMissing: j.healthConsecutiveMissing,
                lastCheck: j.healthChecks[0]
                    ? {
                          outcome: j.healthChecks[0].outcome,
                          checkType: j.healthChecks[0].checkType,
                          httpStatus: j.healthChecks[0].httpStatus,
                          softPatternId: j.healthChecks[0].softPatternId,
                          checkedAt: j.healthChecks[0].checkedAt.toISOString(),
                      }
                    : null,
            })),
            checkThroughput: checkTypeCounts.map((c) => ({
                checkType: c.checkType,
                count: c._count._all,
            })),
            lastCheckAt: lastCheck?.checkedAt.toISOString() ?? null,
        });
    } catch (error) {
        logger.error('[Admin Health] Failed to load job-health dashboard data', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to fetch health data',
            },
            { status: 500 },
        );
    }
}
