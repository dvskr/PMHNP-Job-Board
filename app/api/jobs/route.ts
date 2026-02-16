import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { buildWhereClause, parseFiltersFromParams } from '@/lib/filters';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // If specific IDs are requested, return exactly those jobs (for saved/applied pages)
    const idsParam = searchParams.get('ids');
    if (idsParam) {
      const ids = idsParam.split(',').filter(Boolean);
      if (ids.length > 0) {
        const jobs = await prisma.job.findMany({
          where: { id: { in: ids }, isPublished: true },
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
            displaySalary: true,
            normalizedMinSalary: true,
            normalizedMaxSalary: true,
            salaryPeriod: true,
            description: true,
            descriptionSummary: true,
            createdAt: true,
            isFeatured: true,
            isVerifiedEmployer: true,
            mode: true,
            originalPostedAt: true,
          },
        });
        return NextResponse.json({ jobs, total: jobs.length, page: 1, totalPages: 1 });
      }
    }

    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const skip = (page - 1) * limit;

    // Parse filters from URL
    const filters = parseFiltersFromParams(searchParams);
    const where = buildWhereClause(filters);

    // Parse sort option
    const sort = searchParams.get('sort') || 'best';
    let orderBy: Record<string, unknown>[] = [
      { isFeatured: 'desc' },
      { qualityScore: 'desc' },
      { originalPostedAt: 'desc' },
      { createdAt: 'desc' },
    ];
    if (sort === 'newest') {
      orderBy = [
        { isFeatured: 'desc' },
        { originalPostedAt: 'desc' },
        { createdAt: 'desc' },
      ];
    } else if (sort === 'salary') {
      orderBy = [
        { normalizedMaxSalary: { sort: 'desc', nulls: 'last' } },
        { normalizedMinSalary: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
      ];
    }

    // Get jobs
    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        orderBy,
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
          originalPostedAt: true,        // Crucial for correct date display
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
    logger.error('Error fetching jobs', error);
    return NextResponse.json(
      { error: 'Failed to fetch jobs' },
      { status: 500 }
    );
  }
}

