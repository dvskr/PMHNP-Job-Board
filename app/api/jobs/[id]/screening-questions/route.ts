import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/jobs/[id]/screening-questions
 * Returns the screening questions for a job (public, used by the apply form).
 * Only returns questions for jobs with applyOnPlatform=true.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;

  if (!jobId) {
    return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
  }

  // Verify the job exists and accepts platform applications
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      applyOnPlatform: true,
      isPublished: true,
    },
  });

  if (!job || !job.isPublished || !job.applyOnPlatform) {
    return NextResponse.json({ questions: [] });
  }

  const questions = await prisma.jobScreeningQuestion.findMany({
    where: { jobId },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      questionText: true,
      questionType: true,
      options: true,
      isRequired: true,
      // Note: we do NOT expose isKnockout or knockoutAnswer to candidates
    },
  });

  return NextResponse.json({ questions });
}
