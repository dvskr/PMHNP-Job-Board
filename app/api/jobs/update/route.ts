import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { sanitizeJobPosting, sanitizeUrl, sanitizeEmail, sanitizeText, normalizeContentWhitespace } from '@/lib/sanitize';
import { summarizeForMeta } from '@/lib/description-cleaner';
import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { inngest } from '@/lib/inngest/client';

interface ScreeningQuestionInput {
  text: string;
  type: string;
  options?: string[];
  required?: boolean;
  knockout?: boolean;
  knockoutAnswer?: string;
}

interface UpdateJobData {
  title: string;
  location: string;
  mode: string;
  jobType: string;
  description: string;
  applyLink: string | null;
  minSalary?: number | null;
  maxSalary?: number | null;
  salaryPeriod?: string | null;
  companyWebsite?: string | null;
  contactEmail?: string;
  // New editable fields — mirror the post-job inputs
  applyOnPlatform?: boolean;
  benefits?: string[];
  setting?: string | null;
  population?: string | null;
  companyLogoUrl?: string | null;
  screeningQuestions?: ScreeningQuestionInput[];
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

    // Apply-on-platform: clear applyLink when switching to in-platform.
    const applyOnPlatform = rawJobData.applyOnPlatform === true;

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
        applyLink: applyOnPlatform ? null : jobData.applyLink,
        applyOnPlatform,
        minSalary: jobData.minSalary ? Math.round(jobData.minSalary) : null,
        maxSalary: jobData.maxSalary ? Math.round(jobData.maxSalary) : null,
        salaryPeriod: jobData.salaryPeriod || null,
        benefits: Array.isArray(rawJobData.benefits) ? rawJobData.benefits : undefined,
        setting: rawJobData.setting !== undefined ? (rawJobData.setting || null) : undefined,
        population: rawJobData.population !== undefined ? (rawJobData.population || null) : undefined,
        updatedAt: new Date(),
      },
    });

    // C1: an employer edit changes content-bearing fields (title, description,
    // setting, population) — refresh the semantic-search embedding so it stays in
    // sync with the edited text. Fire-and-forget; the Inngest handler skips the
    // job if it's unpublished. Never block the response on this.
    inngest.send({
      name: 'embedding.refresh.job',
      data: { jobId: updatedJob.id },
    }).catch((err) => {
      logger.warn('inngest.send embedding.refresh.job failed (employer edit)', { error: String(err) });
    });

    // Update employer-level fields (contact email, website, logo)
    if (
      jobData.contactEmail
      || jobData.companyWebsite
      || rawJobData.companyLogoUrl !== undefined
    ) {
      await prisma.employerJob.update({
        where: { id: employerJob.id },
        data: {
          contactEmail: jobData.contactEmail || employerJob.contactEmail,
          companyWebsite: jobData.companyWebsite || employerJob.companyWebsite,
          ...(rawJobData.companyLogoUrl !== undefined
            ? { companyLogoUrl: rawJobData.companyLogoUrl ? sanitizeUrl(rawJobData.companyLogoUrl) : null }
            : {}),
        },
      });
    }

    // Replace screening questions wholesale when the client sends an array.
    // `undefined` => leave existing questions alone; `[]` => clear them.
    if (Array.isArray(rawJobData.screeningQuestions)) {
      await prisma.jobScreeningQuestion.deleteMany({
        where: { jobId: employerJob.jobId },
      });
      const questions = rawJobData.screeningQuestions.slice(0, 5);
      const validTypes = ['boolean', 'text', 'select', 'number'];
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (!q?.text || typeof q.text !== 'string') continue;
        await prisma.jobScreeningQuestion.create({
          data: {
            jobId: employerJob.jobId,
            questionText: sanitizeText(q.text, 200),
            questionType: validTypes.includes(q.type) ? q.type : 'boolean',
            options: Array.isArray(q.options)
              ? q.options.map((o: string) => sanitizeText(String(o), 100)).slice(0, 10)
              : [],
            isRequired: !!q.required,
            isKnockout: !!q.knockout,
            knockoutAnswer: q.knockoutAnswer ? sanitizeText(String(q.knockoutAnswer), 100) : null,
            sortOrder: i,
          },
        });
      }
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

