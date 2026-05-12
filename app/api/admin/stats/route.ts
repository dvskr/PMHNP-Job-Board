import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getIngestionStats } from '@/lib/ingestion-service';
import { logger } from '@/lib/logger';
import { requireApiAdmin } from '@/lib/auth/require-api-admin';

/**
 * GET handler for admin statistics
 * Provides comprehensive metrics about the job board
 */
export async function GET() {
  // Verify admin session
  const authError = await requireApiAdmin();
  if (authError) return authError;

  try {
    logger.info('[Admin Stats] Fetching comprehensive statistics');

    // Get basic ingestion stats
    const stats = await getIngestionStats();

    // Jobs by source with detailed counts
    const bySource = await prisma.job.groupBy({
      by: ['sourceProvider'],
      where: { isPublished: true },
      _count: true,
    });

    // Jobs added per day (last 7 days)
    //
    // H10 fix: previously `findMany` pulled every job from the last 7
    // days into Node memory and reduced in JavaScript. On an active
    // ingest pipeline that's thousands of rows pulled across the wire
    // on every admin dashboard load. Now the aggregation runs as a
    // single `date_trunc('day', ...) GROUP BY 1` in Postgres and
    // returns at most 8 rows.
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const jobsByDayRows = await prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
      SELECT
        date_trunc('day', "created_at") AT TIME ZONE 'UTC' AS day,
        COUNT(*)::bigint AS count
      FROM "jobs"
      WHERE "created_at" >= ${sevenDaysAgo}
        AND "is_published" = true
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    const jobsByDay: Record<string, number> = {};
    for (const row of jobsByDayRows) {
      const day = row.day.toISOString().split('T')[0];
      if (day) jobsByDay[day] = Number(row.count);
    }

    // Top employers by job count
    const allEmployers = await prisma.job.groupBy({
      by: ['employer'],
      where: {
        isPublished: true,
      },
      _count: true,
      orderBy: {
        _count: {
          employer: 'desc'
        }
      },
    });

    // Filter out null employers and take top 10
    const topEmployers = allEmployers
      .filter((e: typeof allEmployers[number]) => e.employer !== null)
      .slice(0, 10);

    // Additional useful metrics
    const totalJobs = await prisma.job.count();
    const publishedJobs = await prisma.job.count({
      where: { isPublished: true }
    });
    const unpublishedJobs = totalJobs - publishedJobs;

    // Job types distribution
    const jobTypeDistribution = await prisma.job.groupBy({
      by: ['jobType'],
      where: { isPublished: true },
      _count: true,
    });

    // Work mode distribution
    const modeDistribution = await prisma.job.groupBy({
      by: ['mode'],
      where: { isPublished: true },
      _count: true,
    });

    // Featured jobs count
    const featuredCount = await prisma.job.count({
      where: {
        isPublished: true,
        isFeatured: true,
      },
    });

    logger.info('[Admin Stats] Successfully fetched all statistics');

    return NextResponse.json({
      success: true,
      totalActive: stats.totalActive,
      addedLast24h: stats.addedLast24h,
      bySource: Object.fromEntries(
        bySource.map((s: typeof bySource[number]) => [s.sourceProvider || 'unknown', s._count])
      ),
      jobsByDay,
      topEmployers: topEmployers.map((e: typeof topEmployers[number]) => ({
        employer: e.employer,
        count: e._count
      })),
      additionalMetrics: {
        totalJobs,
        publishedJobs,
        unpublishedJobs,
        featuredJobs: featuredCount,
        jobTypeDistribution: Object.fromEntries(
          jobTypeDistribution.map((jt: typeof jobTypeDistribution[number]) => [jt.jobType || 'unspecified', jt._count])
        ),
        modeDistribution: Object.fromEntries(
          modeDistribution.map((m: typeof modeDistribution[number]) => [m.mode || 'unspecified', m._count])
        ),
      },
      lastUpdated: new Date().toISOString(),
    });

  } catch (error) {
    logger.error('[Admin Stats] Error fetching statistics', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch statistics',
        lastUpdated: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

