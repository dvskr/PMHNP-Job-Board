import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';

type EmployerJobWithJob = {
  editToken: string;
  paymentStatus: string | null;
  job: {
    id: string;
    title: string;
    isPublished: boolean;
    isFeatured: boolean;
    viewCount: number;
    applyClickCount: number;
    createdAt: Date;
    expiresAt: Date | null;
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
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Token is required' },
        { status: 400 }
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
      return NextResponse.json(
        { success: false, error: 'Invalid dashboard token' },
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
            isPublished: true,
            isFeatured: true,
            viewCount: true,
            applyClickCount: true,
            createdAt: true,
            expiresAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })) as unknown as EmployerJobWithJob[];

    // Format the response
    const jobs = allEmployerJobs.map((ej: EmployerJobWithJob) => ({
      id: ej.job.id,
      title: ej.job.title,
      isPublished: ej.job.isPublished,
      isFeatured: ej.job.isFeatured,
      viewCount: ej.job.viewCount,
      applyClickCount: ej.job.applyClickCount,
      createdAt: ej.job.createdAt,
      expiresAt: ej.job.expiresAt,
      editToken: ej.editToken,
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

