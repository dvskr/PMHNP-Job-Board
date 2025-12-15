import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface ClickAnalytics {
  summary: {
    totalClicks: number;
    uniqueJobs: number;
    avgClicksPerJob: number;
  };
  bySource: Array<{
    source: string;
    clicks: number;
    jobs: number;
    avgPerJob: number;
  }>;
  byDay: Array<{
    date: string;
    clicks: number;
  }>;
  topJobs: Array<{
    jobId: string;
    title: string;
    employer: string;
    clicks: number;
  }>;
}

/**
 * GET /api/analytics/clicks
 * Returns apply click analytics
 * 
 * Query params:
 * - days: number of days to look back (default: 30)
 * - source: filter by specific source (optional)
 * - groupBy: grouping option (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '30', 10);
    const sourceFilter = searchParams.get('source');

    // Validate days parameter
    if (days < 1 || days > 365) {
      return NextResponse.json(
        { error: 'Days must be between 1 and 365' },
        { status: 400 }
      );
    }

    // Calculate date range
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    // Build where clause
    const whereClause: any = {
      timestamp: {
        gte: startDate,
      },
    };

    if (sourceFilter) {
      whereClause.source = sourceFilter;
    }

    // 1. Summary Statistics
    const totalClicks = await prisma.applyClick.count({
      where: whereClause,
    });

    const uniqueJobs = await prisma.applyClick.findMany({
      where: whereClause,
      select: { jobId: true },
      distinct: ['jobId'],
    });

    const avgClicksPerJob = uniqueJobs.length > 0 
      ? totalClicks / uniqueJobs.length 
      : 0;

    // 2. Clicks by Source
    const clicksBySource = await prisma.applyClick.groupBy({
      by: ['source'],
      where: whereClause,
      _count: {
        id: true,
      },
    });

    // Get job counts by source for the same period
    const sourceStats = await Promise.all(
      clicksBySource.map(async (item) => {
        const source = item.source || 'unknown';
        
        // Count unique jobs for this source
        const uniqueJobsForSource = await prisma.applyClick.findMany({
          where: {
            ...whereClause,
            source,
          },
          select: { jobId: true },
          distinct: ['jobId'],
        });

        const clicks = item._count.id;
        const jobs = uniqueJobsForSource.length;
        const avgPerJob = jobs > 0 ? clicks / jobs : 0;

        return {
          source,
          clicks,
          jobs,
          avgPerJob: parseFloat(avgPerJob.toFixed(2)),
        };
      })
    );

    // Sort by clicks descending
    const bySource = sourceStats.sort((a, b) => b.clicks - a.clicks);

    // 3. Clicks by Day
    const clicksRaw = await prisma.applyClick.findMany({
      where: whereClause,
      select: {
        timestamp: true,
      },
    });

    // Group by date
    const clicksByDay = new Map<string, number>();
    clicksRaw.forEach(click => {
      const date = click.timestamp.toISOString().split('T')[0];
      clicksByDay.set(date, (clicksByDay.get(date) || 0) + 1);
    });

    // Convert to array and sort by date
    const byDay = Array.from(clicksByDay.entries())
      .map(([date, clicks]) => ({ date, clicks }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // 4. Top Jobs by Clicks
    const topJobsData = await prisma.applyClick.groupBy({
      by: ['jobId'],
      where: whereClause,
      _count: {
        id: true,
      },
      orderBy: {
        _count: {
          id: 'desc',
        },
      },
      take: 10,
    });

    // Get job details for top jobs
    const topJobs = await Promise.all(
      topJobsData.map(async (item) => {
        const job = await prisma.job.findUnique({
          where: { id: item.jobId },
          select: {
            id: true,
            title: true,
            employer: true,
          },
        });

        return {
          jobId: item.jobId,
          title: job?.title || 'Unknown',
          employer: job?.employer || 'Unknown',
          clicks: item._count.id,
        };
      })
    );

    // Build response
    const analytics: ClickAnalytics = {
      summary: {
        totalClicks,
        uniqueJobs: uniqueJobs.length,
        avgClicksPerJob: parseFloat(avgClicksPerJob.toFixed(2)),
      },
      bySource,
      byDay,
      topJobs,
    };

    return NextResponse.json(analytics);
  } catch (error) {
    console.error('[API] Error getting click analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch click analytics' },
      { status: 500 }
    );
  }
}

