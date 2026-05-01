import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { sanitizeJobPosting, sanitizeUrl, sanitizeEmail, normalizeContentWhitespace } from '@/lib/sanitize';
import { summarizeForMeta } from '@/lib/description-cleaner';
import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

interface UpdateJobData {
  title: string;
  location: string;
  mode: string;
  jobType: string;
  description: string;
  applyLink: string;
  minSalary?: number | null;
  maxSalary?: number | null;
  salaryPeriod?: string | null;
  companyWebsite?: string | null;
  contactEmail?: string;
}

interface UpdateRequestBody {
  token: string;
  jobData: UpdateJobData;
}

export async function POST(request: NextRequest) {
    // Rate limiting
    const rateLimitResult = await rateLimit(request, 'jobs-update', RATE_LIMITS.general);
    if (rateLimitResult) return rateLimitResult;

  try {
    const body: UpdateRequestBody = await request.json();
    const { token, jobData: rawJobData } = body;

    // Sanitize job data. Description is whitespace-normalized first so Quill-
    // emitted &nbsp; / U+00A0 between words doesn't make the body line-break
    // mid-character at render time (root cause reported by employers).
    const normalizedRawJobData = {
      ...rawJobData,
      description: normalizeContentWhitespace(rawJobData.description ?? ''),
    };
    const jobData = {
      ...normalizedRawJobData,
      title: sanitizeJobPosting({ ...normalizedRawJobData, employer: '' } as any).title,
      location: sanitizeJobPosting({ ...normalizedRawJobData, employer: '' } as any).location,
      description: sanitizeJobPosting({ ...normalizedRawJobData, employer: '' } as any).description,
      applyLink: rawJobData.applyLink ? sanitizeUrl(rawJobData.applyLink) : null,
      contactEmail: rawJobData.contactEmail ? sanitizeEmail(rawJobData.contactEmail) : undefined,
      companyWebsite: rawJobData.companyWebsite ? sanitizeUrl(rawJobData.companyWebsite) : undefined,
    };

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      );
    }

    // Verify token
    const employerJob = await prisma.employerJob.findFirst({
      where: { editToken: token },
    });

    if (!employerJob) {
      return NextResponse.json(
        { error: 'Invalid or expired edit token' },
        { status: 401 }
      );
    }

    // Update job
    const updatedJob = await prisma.job.update({
      where: { id: employerJob.jobId },
      data: {
        title: jobData.title,
        location: jobData.location,
        mode: jobData.mode,
        jobType: jobData.jobType,
        description: jobData.description,
        descriptionSummary: summarizeForMeta(jobData.description),
        applyLink: jobData.applyLink,
        minSalary: jobData.minSalary ? Math.round(jobData.minSalary) : null,
        maxSalary: jobData.maxSalary ? Math.round(jobData.maxSalary) : null,
        salaryPeriod: jobData.salaryPeriod || null,
        updatedAt: new Date(),
      },
    });

    // Update employer job if contact info changed. Free-post quota is now
    // anchored on userId (audit #26 follow-up), so editing contactEmail no
    // longer affects the freebie count — no longer need a special-case block.
    if (jobData.contactEmail || jobData.companyWebsite) {
      await prisma.employerJob.update({
        where: { id: employerJob.id },
        data: {
          contactEmail: jobData.contactEmail || employerJob.contactEmail,
          companyWebsite: jobData.companyWebsite || employerJob.companyWebsite,
        },
      });
    }

    return NextResponse.json({
      success: true,
      job: updatedJob,
    });
  } catch (error) {
    console.error('Error updating job:', error);
    return NextResponse.json(
      { error: 'Failed to update job' },
      { status: 500 }
    );
  }
}

// Unpublish job endpoint
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      );
    }

    // Verify token
    const employerJob = await prisma.employerJob.findFirst({
      where: { editToken: token },
    });

    if (!employerJob) {
      return NextResponse.json(
        { error: 'Invalid or expired edit token' },
        { status: 401 }
      );
    }

    // Unpublish job (soft delete)
    await prisma.job.update({
      where: { id: employerJob.jobId },
      data: {
        isPublished: false,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Job unpublished successfully',
    });
  } catch (error) {
    logger.error('Error unpublishing job:', error);
    return NextResponse.json(
      { error: 'Failed to unpublish job' },
      { status: 500 }
    );
  }
}

