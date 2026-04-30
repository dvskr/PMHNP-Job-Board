import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';

export async function GET(request: NextRequest) {
  try {
    // Rate limiting — 60 req/min (used by homepage, needs to be generous)
    const rateLimitResult = await rateLimit(request, 'stats', { limit: 60, windowSeconds: 60 });
    if (rateLimitResult) return rateLimitResult;

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [totalJobs, totalSubscribers, companyGroups, newJobsToday, newJobsThisWeek, stateGroups] =
      await Promise.all([
        prisma.job.count({ where: { isPublished: true } }),
        prisma.emailLead.count(),
        prisma.job.groupBy({
          by: ['employer'],
          where: { isPublished: true },
        }),
        // User-facing "NEW TODAY" / "NEW THIS WEEK" homepage badges use
        // originalPostedAt — consistent with the lib/filters.ts standard.
        // A job ingested today but posted 30 days ago by the source is
        // NOT "new today" from the user's perspective.
        prisma.job.count({
          where: { isPublished: true, originalPostedAt: { gte: oneDayAgo } },
        }),
        prisma.job.count({
          where: { isPublished: true, originalPostedAt: { gte: oneWeekAgo } },
        }),
        prisma.job.groupBy({
          by: ['state'],
          where: { isPublished: true, state: { not: null } },
        }),
      ]);

    const totalCompanies = companyGroups.length;
    const statesCovered = stateGroups.length;

    // If no new jobs today, fall back to this week
    const newJobsCount = newJobsToday > 0 ? newJobsToday : newJobsThisWeek;
    const newJobsLabel = newJobsToday > 0 ? 'NEW TODAY' : 'NEW THIS WEEK';

    return NextResponse.json(
      {
        totalJobs,
        totalSubscribers,
        totalCompanies,
        newJobsCount,
        newJobsLabel,
        statesCovered,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        },
      }
    );
  } catch (error) {
    logger.error('Error fetching stats:', error);
    return NextResponse.json(
      {
        totalJobs: 0,
        totalSubscribers: 0,
        totalCompanies: 0,
        newJobsCount: 0,
        newJobsLabel: 'NEW TODAY',
        statesCovered: 50,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        },
      }
    );
  }
}
