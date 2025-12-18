import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { buildWhereClause, parseFiltersFromParams } from '@/lib/filters';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const skip = (page - 1) * limit;

    // Parse filters from URL
    const filters = parseFiltersFromParams(searchParams);
    const where = buildWhereClause(filters);

    // Get jobs
    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        orderBy: [
          { isFeatured: 'desc' },
          { createdAt: 'desc' },
        ],
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          employer: true,
          location: true,
          city: true,
          state: true,
          jobType: true,
          isRemote: true,
          isHybrid: true,
          // Salary fields
          displaySalary: true,           // For display
          normalizedMinSalary: true,     // For filtering
          normalizedMaxSalary: true,     // For filtering
          salaryPeriod: true,            // For context
          // Other fields
          description: true,
          descriptionSummary: true,      // For JobCard preview
          createdAt: true,
          isFeatured: true,
          isVerifiedEmployer: true,      // For JobCard badge
          mode: true,                    // For JobCard work mode display
        },
      }),
      prisma.job.count({ where }),
    ]);

    return NextResponse.json({
      jobs,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Error fetching jobs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch jobs' },
      { status: 500 }
    );
  }
}

