/**
 * POST /api/resume-studio/cover-letter
 *
 * AI cover letter generation (resume studio). Requires exactly one resume
 * source (`documentId` owner-scoped, or `text`) AND exactly one job source
 * (`jobId` for a published job on this site, or raw `jobText`), plus an
 * optional `tone` (professional | warm | direct, default professional).
 *
 * The `cover_letter` task is text-mode with no registry prompt — the system
 * and user messages are built inline here. The letter is grounded ONLY in
 * facts present in the resume; fabricating experience is forbidden by the
 * prompt contract.
 *
 * Gates, in order: rate limit, auth + profile, feature flag
 * ai.candidate.cover_letter, daily quota (AI_DAILY_CAPS.cover_letter).
 * Every successful run persists a ResumeAnalysis row (kind 'cover_letter',
 * with jobId when a site job was targeted).
 *
 * Returns: { coverLetter, usage, meta } on success.
 */
import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';
import { complete } from '@/lib/ai/gateway';
import { AiGatewayError } from '@/lib/ai/types';
import { isAiFeatureEnabled } from '@/lib/ai/feature-flags';
import { reserveDailyQuota, releaseDailyQuota } from '@/lib/resume-studio/ai-quota';
import { htmlToReadableText, sanitizeText } from '@/lib/sanitize';
import { parseSections, sectionsToText } from '@/lib/resume-studio/sections';

// Text-mode generation is faster than the JSON review tasks; 120s covers
// the task's provider timeout with headroom for one fallback attempt.
export const maxDuration = 120;

/** Same truncation the resume parser applies — stays within token limits. */
const MAX_RESUME_CHARS = 12_000;
/** Posting text budget — title, employer, and description comfortably fit. */
const MAX_JOB_CHARS = 8_000;
/** Below these the model has nothing real to write from. */
const MIN_RESUME_CHARS = 50;
const MIN_JOB_CHARS = 20;

const requestSchema = z.object({
  documentId: z.string().min(1).max(64).optional(),
  // Generous zod ceilings — oversized input is clamped below, not rejected.
  text: z.string().min(1).max(100_000).optional(),
  jobId: z.string().min(1).max(64).optional(),
  jobText: z.string().min(1).max(100_000).optional(),
  tone: z.enum(['professional', 'warm', 'direct']).optional().default('professional'),
});

type ParsedRequest = z.infer<typeof requestSchema>;

const TONE_INSTRUCTIONS: Record<ParsedRequest['tone'], string> = {
  professional:
    'Write in a polished professional tone: confident, measured, and formal without being stiff.',
  warm:
    'Write in a warm personable tone: friendly and human while staying professional, with genuine enthusiasm for the role.',
  direct:
    'Write in a direct tone: brief, plainspoken sentences that lead with qualifications and results.',
};

function buildSystemPrompt(tone: ParsedRequest['tone'], hasPosting: boolean): string {
  const postingRule = hasPosting
    ? `- Directly address the key requirements in the posting, connecting them to the candidate's real experience. When the posting requires something the resume does not evidence, do not claim it.`
    : `- No specific job posting was provided, so write a strong general PMHNP cover letter that highlights the candidate's most compelling real qualifications and can be lightly adapted per application. Do not invent an employer name or a specific role the resume does not support.`;
  return `You are an expert PMHNP career coach writing a cover letter for a psychiatric mental health nurse practitioner.${hasPosting ? ' The candidate is applying to a specific job posting.' : ''}

Write a one page cover letter, roughly 250 to 350 words.

Rules:
- Ground every statement ONLY in facts present in the resume. Never invent experience, metrics, licenses, certifications, employers, or dates the resume does not contain.
${postingRule}
- ${TONE_INSTRUCTIONS[tone]}
- Use complete sentences and a standard letter structure: greeting, body paragraphs, and a sign off with the candidate's name as it appears on the resume.${hasPosting ? '' : ' Address it generically (for example, "Dear Hiring Manager").'}
- Never use em dashes or en dashes. Use commas, colons, or periods instead.
- Return ONLY the letter text. No preamble, no explanations, no subject line.`;
}

function buildUserMessage(resumeText: string, jobText: string): string {
  return jobText.trim().length > 0
    ? `=== RESUME ===\n${resumeText}\n\n=== JOB POSTING ===\n${jobText}`
    : `=== RESUME ===\n${resumeText}\n\n(No specific job posting was provided. Write a general cover letter.)`;
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function zodIssueDetails(err: unknown): string[] | undefined {
  if (err && typeof err === 'object' && 'issues' in err) {
    const issues = (err as { issues?: Array<{ path?: unknown[]; message?: string }> }).issues;
    if (Array.isArray(issues)) {
      return issues
        .map((i) => {
          const path = Array.isArray(i.path) && i.path.length > 0 ? i.path.join('.') : 'request';
          return `${path}: ${i.message ?? 'invalid'}`;
        })
        .slice(0, 5);
    }
  }
  return undefined;
}

export async function POST(request: NextRequest) {
  const rateLimitResult = await rateLimit(request, 'resume-studio:cover-letter', { limit: 10, windowSeconds: 60 });
  if (rateLimitResult) return rateLimitResult;

  let userId: string;
  let profileId: string;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    const profile = await prisma.userProfile.findUnique({ where: { supabaseId: user.id } });
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    userId = user.id;
    profileId = profile.id;
  } catch (err) {
    logger.warn('Cover letter auth failed', { error: err });
    return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
  }

  let parsed: ParsedRequest;
  try {
    const body = await request.json();
    parsed = requestSchema.parse(body);
  } catch (err) {
    return NextResponse.json(
      {
        error: 'Invalid request',
        details: zodIssueDetails(err) ?? [err instanceof Error ? err.message : 'unknown'],
      },
      { status: 400 },
    );
  }

  if (!!parsed.documentId === !!parsed.text) {
    return NextResponse.json(
      { error: 'Provide exactly one of documentId or text.' },
      { status: 400 },
    );
  }
  // A job source is OPTIONAL: with a posting we tailor the letter, without one
  // we write a general letter (the UI offers both). Reject only the ambiguous
  // case where BOTH a jobId and jobText are given.
  if (parsed.jobId && parsed.jobText) {
    return NextResponse.json(
      { error: 'Provide at most one of jobId or jobText.' },
      { status: 400 },
    );
  }

  const tenant = { type: 'candidate' as const, id: userId };
  const flagOn = await isAiFeatureEnabled('ai.candidate.cover_letter', tenant);
  if (!flagOn) {
    return NextResponse.json({ error: 'Feature not available' }, { status: 403 });
  }

  // Atomically reserve one unit of today's quota BEFORE the model call, so
  // concurrent requests cannot all slip past a read-only count (TOCTOU).
  const reservation = await reserveDailyQuota(userId, 'cover_letter');
  if (!reservation.allowed) {
    return NextResponse.json(
      {
        error: 'Daily limit reached',
        message: `You have used all ${reservation.snapshot.cap} AI cover letters for today. Your limit resets at midnight Central Time.`,
        usage: reservation.snapshot,
      },
      { status: 429 },
    );
  }
  const usage = reservation.snapshot;

  let releaseOnFailure = true;
  try {
    let resumeText: string;
    let documentId: string | null = null;
    if (parsed.documentId) {
      const doc = await prisma.resumeDocument.findFirst({
        where: { id: parsed.documentId, userId: profileId },
      });
      if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
      documentId = doc.id;
      resumeText = sectionsToText(parseSections(doc.sections)).slice(0, MAX_RESUME_CHARS);
    } else {
      resumeText = sanitizeText(parsed.text ?? '', MAX_RESUME_CHARS);
    }

    // Job source is optional. With a posting we tailor; without one we write
    // a general letter.
    let jobText = '';
    let jobId: string | null = null;
    if (parsed.jobId) {
      const job = await prisma.job.findUnique({ where: { id: parsed.jobId } });
      if (!job || !job.isPublished) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }
      jobId = job.id;
      // Descriptions are stored HTML — normalize to readable plain text so
      // the model is not fed markup.
      jobText = [
        `Title: ${job.title}`,
        `Employer: ${job.employer}`,
        '',
        htmlToReadableText(job.description),
      ].join('\n').slice(0, MAX_JOB_CHARS);
    } else if (parsed.jobText) {
      jobText = sanitizeText(parsed.jobText, MAX_JOB_CHARS);
    }

    if (resumeText.trim().length < MIN_RESUME_CHARS) {
      return NextResponse.json(
        { error: 'The resume text is too short to write a letter from. Add more content and try again.' },
        { status: 400 },
      );
    }
    // A posting, when supplied, must have enough text to tailor against; a
    // blank posting is allowed and yields a general letter.
    const hasPosting = jobText.trim().length > 0;
    if (hasPosting && jobText.trim().length < MIN_JOB_CHARS) {
      return NextResponse.json(
        { error: 'The job posting text is too short to write a letter for. Add more, or leave it blank for a general letter.' },
        { status: 400 },
      );
    }

    // Text-mode task, no registry prompt and no output schema — the raw
    // content IS the letter. promptId/promptVersion ride along for the
    // ai_call_log audit trail only.
    const response = await complete<string>({
      task: 'cover_letter',
      tenant,
      promptId: 'cover_letter',
      promptVersion: 'v1',
      messages: [
        { role: 'system', content: buildSystemPrompt(parsed.tone, hasPosting) },
        { role: 'user', content: buildUserMessage(resumeText, jobText) },
      ],
    });

    const coverLetter = response.content.trim();
    if (coverLetter.length === 0) {
      return NextResponse.json(
        { error: 'AI service temporarily unavailable. Please try again.' },
        { status: 502 },
      );
    }

    // The generation succeeded: keep the reservation.
    releaseOnFailure = false;

    await prisma.resumeAnalysis.create({
      data: {
        userId: profileId,
        documentId,
        kind: 'cover_letter',
        jobId,
        inputHash: sha256(`${resumeText}\n${jobText}`),
        result: { tone: parsed.tone, coverLetter } as unknown as Prisma.InputJsonValue,
      },
    });

    // usage already reflects the post-reservation count.
    return NextResponse.json({
      coverLetter,
      usage,
      meta: {
        model: response.model,
        latencyMs: response.latencyMs,
        cacheHit: response.cacheHit,
        fallbackUsed: response.fallbackUsed,
      },
    });
  } catch (err) {
    if (err instanceof AiGatewayError) {
      logger.warn('Cover letter gateway error', { code: err.code });
      // Hourly AI rate limit is distinct from the daily quota; 429 means
      // "daily quota" exclusively, so map rate_limited to 503.
      const status =
        err.code === 'rate_limited' ? 503 :
        err.code === 'provider_not_configured' ? 503 :
        502;
      return NextResponse.json({ error: 'AI service temporarily unavailable. Please try again.' }, { status });
    }
    console.error('Cover letter generation failed:', err);
    return NextResponse.json({ error: 'Unexpected error generating the cover letter.' }, { status: 500 });
  } finally {
    if (releaseOnFailure) await releaseDailyQuota(userId, 'cover_letter');
  }
}
