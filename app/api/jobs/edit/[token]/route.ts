import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const resolvedParams = await params;
    const token = resolvedParams.token;

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      );
    }

    const employerJob = await prisma.employerJob.findFirst({
      where: { editToken: token },
      include: { job: true },
    });

    if (!employerJob) {
      return NextResponse.json(
        { error: 'Invalid or expired edit token' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      job: employerJob.job,
      employerJob: {
        id: employerJob.id,
        employerName: employerJob.employerName,
        contactEmail: employerJob.contactEmail,
        companyWebsite: employerJob.companyWebsite,
        paymentStatus: employerJob.paymentStatus,
      },
    });
  } catch (error) {
    console.error('Error fetching job for edit:', error);
    return NextResponse.json(
      { error: 'Failed to fetch job' },
      { status: 500 }
    );
  }
}

