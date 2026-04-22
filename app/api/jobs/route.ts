import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { buildWhereClause, parseFiltersFromParams } from '@/lib/filters';
import { logger } from '@/lib/logger';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export async function GET(request: NextRequest) {
  try {
    // Rate limiting — 30 req/min to prevent mass scraping
    const rateLimitResult = await rateLimit(request, 'jobs-list', { limit: 30, windowSeconds: 60 });
    if (rateLimitResult) return rateLimitResult;

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
            salaryRange: true,
            description: true,
            descriptionSummary: true,
            createdAt: true,
            isFeatured: true,
            isVerifiedEmployer: true,
            mode: true,
            originalPostedAt: true,
            employerJobs: { select: { companyLogoUrl: true } },
          },
        });
        const jobsWithLogo = jobs.map(j => ({ ...j, companyLogoUrl: j.employerJobs?.companyLogoUrl || null, employerJobs: undefined }));
        return NextResponse.json({ jobs: jobsWithLogo, total: jobsWithLogo.length, page: 1, totalPages: 1 });
      }
    }

    const page = parseInt(searchParams.get('page') || '1');
    const rawLimit = parseInt(searchParams.get('limit') || '20');
    // Security: Cap limit to 50 max to prevent mass data extraction
    // (a scraper could request limit=100000 and get everything in one call)
    const limit = Math.min(Math.max(1, rawLimit), 50);
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
        { originalPostedAt: { sort: 'desc', nulls: 'last' } },
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
          displaySalary: true,
          normalizedMinSalary: true,
          normalizedMaxSalary: true,
          salaryPeriod: true,
          salaryRange: true,
          // Other fields
          description: true,
          descriptionSummary: true,
          createdAt: true,
          isFeatured: true,
          isVerifiedEmployer: true,
          mode: true,
          originalPostedAt: true,
          // NOTE: applyLink intentionally excluded from listing API
          // to prevent mass link harvesting by scrapers.
          // Apply links are only exposed on individual job detail pages.
          employerJobs: { select: { companyLogoUrl: true } },
        },
      }),
      prisma.job.count({ where }),
    ]);

    // Map employer logo onto job objects
    const jobsWithLogo = jobs.map(j => ({ ...j, companyLogoUrl: j.employerJobs?.companyLogoUrl || null, employerJobs: undefined }));

    // Search relevance re-ranking: when search is active and sort is "best",
    // promote title matches above employer/location-only matches
    if (sort === 'best' && filters.search) {
      const q = filters.search.toLowerCase();
      jobsWithLogo.sort((a, b) => {
        const aTitle = a.title.toLowerCase().includes(q) ? 2 : 0;
        const bTitle = b.title.toLowerCase().includes(q) ? 2 : 0;
        const aEmployer = a.employer.toLowerCase().includes(q) ? 1 : 0;
        const bEmployer = b.employer.toLowerCase().includes(q) ? 1 : 0;
        const aScore = aTitle + aEmployer + (a.isFeatured ? 0.5 : 0);
        const bScore = bTitle + bEmployer + (b.isFeatured ? 0.5 : 0);
        return bScore - aScore; // Higher relevance first
      });
    }

    return NextResponse.json({
      jobs: jobsWithLogo,
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

