/**
 * pSEO Health & Coverage Monitor
 * 
 * GET /api/pseo/health
 * 
 * Returns aggregated stats across all pSEO page types:
 * - Total pages by type (category×city, setting×state, etc.)
 * - Coverage: pages with >0 jobs vs total
 * - Average job count per page
 * - Zero-job page count (potential deindex candidates)
 * - Last stats refresh timestamp
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireApiAdmin } from '@/lib/auth/require-api-admin';

// Admin-gated, so it cannot be cached: the response is per-session by
// definition and the guard reads cookies. `revalidate = 3600` used to sit
// here from when the route was anonymous.
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // This is the data source behind /admin/seo-health and returns nothing a
  // visitor needs: live job totals, per-category coverage and zero-job page
  // counts. It was readable by anyone, which also made it an unauthenticated
  // way to run several groupBy aggregates over jobs and pseo_stats on demand.
  const authError = await requireApiAdmin(request);
  if (authError) return authError;

  try {
    // 1. Category × City stats (the big one: ~115K pages)
    const categoryCityStats = await prisma.pseoStats.groupBy({
      by: ['categorySlug'],
      where: { type: 'category-city' },
      _count: { id: true },
      _sum: { totalJobs: true },
      _avg: { totalJobs: true },
    });

    const categoryCityZero = await prisma.pseoStats.count({
      where: { type: 'category-city', totalJobs: 0 },
    });

    const categoryCityTotal = await prisma.pseoStats.count({
      where: { type: 'category-city' },
    });

    const categoryCityWithJobs = await prisma.pseoStats.count({
      where: { type: 'category-city', totalJobs: { gt: 0 } },
    });

    // 2. Last refresh timestamp
    const lastRefresh = await prisma.pseoStats.aggregate({
      _max: { updatedAt: true },
    });

    // 3. Total live jobs (for comparison)
    const totalLiveJobs = await prisma.job.count({
      where: { isPublished: true },
    });

    // 4. Coverage by category
    const coverageByCategory = categoryCityStats.map(cat => ({
      category: cat.categorySlug,
      totalPages: cat._count.id,
      totalJobsListed: cat._sum.totalJobs || 0,
      avgJobsPerPage: Math.round((cat._avg.totalJobs || 0) * 10) / 10,
    }));

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      overview: {
        totalLiveJobs,
        lastStatsRefresh: lastRefresh._max.updatedAt?.toISOString() || 'never',
      },
      categoryCityPages: {
        total: categoryCityTotal,
        withJobs: categoryCityWithJobs,
        zeroJobs: categoryCityZero,
        coveragePercent: categoryCityTotal > 0
          ? Math.round((categoryCityWithJobs / categoryCityTotal) * 100 * 10) / 10
          : 0,
      },
      coverageByCategory: coverageByCategory.sort((a, b) => b.totalJobsListed - a.totalJobsListed),
    });
  } catch (error) {
    console.error('[pseo/health] Error:', error);
    return NextResponse.json(
      { status: 'error', message: 'Failed to fetch pSEO health stats' },
      { status: 500 }
    );
  }
}
