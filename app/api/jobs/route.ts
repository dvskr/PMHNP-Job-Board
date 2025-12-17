import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    
    const search = searchParams.get('search');
    const location = searchParams.get('location');
    const jobType = searchParams.get('jobType');
    const mode = searchParams.get('mode');
    const minSalary = searchParams.get('minSalary');
    const maxSalary = searchParams.get('maxSalary');
    const state = searchParams.get('state');
    const isRemote = searchParams.get('isRemote');
    const page = parseInt(searchParams.get('page') || '1');

    const whereClause: any = {
      isPublished: true,
    };

    if (search) {
      whereClause.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { employer: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (location) {
      whereClause.location = { contains: location, mode: 'insensitive' };
    }

    if (jobType) {
      whereClause.jobType = jobType;
    }

    if (mode) {
      whereClause.mode = mode;
    }

    if (minSalary) {
      whereClause.minSalary = { gte: parseInt(minSalary) };
    }

    if (maxSalary) {
      whereClause.maxSalary = { lte: parseInt(maxSalary) };
    }

    if (state) {
      // Match either state name or state code
      // If OR already exists (from search), combine with AND
      if (whereClause.OR) {
        whereClause.AND = [
          { OR: whereClause.OR },
          {
            OR: [
              { state: { equals: state, mode: 'insensitive' } },
              { stateCode: { equals: state.toUpperCase() } },
            ],
          },
        ];
        delete whereClause.OR;
      } else {
        whereClause.OR = [
          { state: { equals: state, mode: 'insensitive' } },
          { stateCode: { equals: state.toUpperCase() } },
        ];
      }
    }

    if (isRemote === 'true') {
      whereClause.isRemote = true;
    }

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where: whereClause,
        orderBy: [
          { isFeatured: 'desc' },
          { createdAt: 'desc' },
        ],
        take: 20,
        skip: (page - 1) * 20,
      }),
      prisma.job.count({ where: whereClause }),
    ]);

    return NextResponse.json({ jobs, total });
  } catch (error) {
    console.error('Error fetching jobs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch jobs' },
      { status: 500 }
    );
  }
}

