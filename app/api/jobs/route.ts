import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { Job } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    
    const search = searchParams.get('search');
    const location = searchParams.get('location');
    const jobType = searchParams.get('jobType');
    const mode = searchParams.get('mode');
    const minSalary = searchParams.get('minSalary');
    const maxSalary = searchParams.get('maxSalary');
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

