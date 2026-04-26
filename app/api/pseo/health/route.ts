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
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const revalidate = 3600; // Cache for 1 hour

export async function GET() {
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
