import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const [totalJobs, totalSubscribers, companyGroups] = await Promise.all([
      prisma.job.count({ where: { isPublished: true } }),
      prisma.emailLead.count(),
      prisma.job.groupBy({
        by: ['employer'],
        where: { isPublished: true },
      }),
    ]);

    const totalCompanies = companyGroups.length;

    return NextResponse.json({
      totalJobs,
      totalSubscribers,
      totalCompanies,
    });
  } catch (error) {
    logger.error('Error fetching stats:', error);
    // Return zeros instead of error to prevent UI breaking
    return NextResponse.json({
      totalJobs: 0,
      totalSubscribers: 0,
      totalCompanies: 0,
    }, {
      status: 200, // Return 200 with empty data instead of 500
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      },
    });
  }
}

