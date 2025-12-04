import { prisma } from '@/lib/prisma';
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
    console.error('Error fetching stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}

