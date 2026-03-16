import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';

type EmployerJobWithJob = {
  editToken: string;
  paymentStatus: string | null;
  job: {
    id: string;
    title: string;
    slug: string | null;
    isPublished: boolean;
    isFeatured: boolean;
    viewCount: number;
    applyClickCount: number;
    createdAt: Date;
    expiresAt: Date | null;
    _count: { jobApplications: number };
  };
};

function maskEmail(email: string): string {
  const [username, domain] = email.split('@');
  if (!username || !domain) return email;

  const visibleChars = Math.min(3, Math.floor(username.length / 2));
  const masked = username.substring(0, visibleChars) + '***';
  return `${masked}@${domain}`;
}

export async function GET(request: NextRequest) {
  // Rate limiting to prevent brute-force token guessing
  const rateLimitResult = await rateLimit(request, 'employer-dashboard', {
    limit: 15,
    windowSeconds: 60,
  });
  if (rateLimitResult) return rateLimitResult;

  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Dashboard not found' },
        { status: 404 }
      );
    }

    // Find the EmployerJob by dashboardToken
    const employerJob = await prisma.employerJob.findUnique({
      where: { dashboardToken: token },
      select: {
        contactEmail: true,
        employerName: true,
      },
    });

    if (!employerJob) {
      // Return same error for missing/invalid tokens to prevent enumeration
      return NextResponse.json(
        { success: false, error: 'Dashboard not found' },
        { status: 404 }
      );
    }

    // Find all EmployerJobs with the same contactEmail
    const allEmployerJobs = (await prisma.employerJob.findMany({
      where: { contactEmail: employerJob.contactEmail },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            slug: true,
            isPublished: true,
            isFeatured: true,
            viewCount: true,
            applyClickCount: true,
            createdAt: true,
            expiresAt: true,
            _count: { select: { jobApplications: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })) as unknown as EmployerJobWithJob[];

    // Format the response (exclude editToken to prevent leaking sensitive data)
    const jobs = allEmployerJobs.map((ej: EmployerJobWithJob) => ({
      id: ej.job.id,
      title: ej.job.title,
      slug: ej.job.slug,
      isPublished: ej.job.isPublished,
      isFeatured: ej.job.isFeatured,
      viewCount: ej.job.viewCount,
      applyClickCount: ej.job.applyClickCount,
      applicantCount: ej.job._count.jobApplications,
      createdAt: ej.job.createdAt,
      expiresAt: ej.job.expiresAt,
      paymentStatus: ej.paymentStatus,
    }));

    return NextResponse.json({
      success: true,
      employerEmail: maskEmail(employerJob.contactEmail),
      employerName: employerJob.employerName,
      jobs,
    });
  } catch (error) {
    logger.error('Error fetching employer dashboard:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch dashboard data' },
      { status: 500 }
    );
  }
}

