/**
 * POST /api/resume-studio/tailor
 *
 * AI resume tailoring against one specific job posting (resume studio).
 * Requires exactly one resume source (`documentId` owner-scoped, or `text`)
 * AND exactly one job source (`jobId` for a published job on this site, or
 * raw `jobText`). Returns the structured alignment produced by the registry
 * prompt `resume_tailoring` (fit summary, keyword alignment, tailored
 * summary and bullets, gaps to address).
 *
 * Gates, in order: rate limit, auth + profile, feature flag
 * ai.candidate.resume_tailoring, daily quota (AI_DAILY_CAPS.resume_tailoring).
 * Every successful run persists a ResumeAnalysis row (kind 'resume_tailoring',
 * with jobId when a site job was targeted).
 *
 * Returns: { tailoring, usage, meta } on success.
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
import { loadPrompt } from '@/lib/ai/prompts/registry';
import { isAiFeatureEnabled } from '@/lib/ai/feature-flags';
import { reserveDailyQuota, releaseDailyQuota } from '@/lib/resume-studio/ai-quota';
import { htmlToReadableText, sanitizeText } from '@/lib/sanitize';
import { parseSections, sectionsToText } from '@/lib/resume-studio/sections';

// gpt-5.4 tailoring with 8k output budget can run long; match the task's
// 120s provider timeout plus fallback headroom.
export const maxDuration = 180;

/** Same truncation the resume parser applies — stays within token limits. */
const MAX_RESUME_CHARS = 12_000;
/** Posting text budget — title, employer, and description comfortably fit. */
const MAX_JOB_CHARS = 8_000;
/** Below these the model has nothing real to align. */
const MIN_RESUME_CHARS = 50;
const MIN_JOB_CHARS = 20;

const requestSchema = z.object({
  documentId: z.string().min(1).max(64).optional(),
  // Generous zod ceilings — oversized input is clamped below, not rejected.
  text: z.string().min(1).max(100_000).optional(),
  jobId: z.string().min(1).max(64).optional(),
  jobText: z.string().min(1).max(100_000).optional(),
});

type ParsedRequest = z.infer<typeof requestSchema>;

/** Mirrors the JSON structure declared in lib/ai/prompts/resume_tailoring/v1.json. */
const tailoringSchema = z.object({
  fitSummary: z.string(),
  keywordAlignment: z.array(z.object({
    keyword: z.string(),
    presentInResume: z.boolean(),
    suggestion: z.string(),
  })),
  tailoredSummary: z.string(),
  tailoredBullets: z.array(z.object({
    original: z.string(),
    tailored: z.string(),
    rationale: z.string(),
  })),
  gapsToAddress: z.array(z.object({
    gap: z.string(),
    mitigation: z.string(),
  })),
});

type ResumeTailoring = z.infer<typeof tailoringSchema>;

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
  const rateLimitResult = await rateLimit(request, 'resume-studio:tailor', { limit: 10, windowSeconds: 60 });
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
    logger.warn('Resume tailoring auth failed', { error: err });
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
  if (!!parsed.jobId === !!parsed.jobText) {
    return NextResponse.json(
      { error: 'Provide exactly one of jobId or jobText.' },
      { status: 400 },
    );
  }

  const tenant = { type: 'candidate' as const, id: userId };
  const flagOn = await isAiFeatureEnabled('ai.candidate.resume_tailoring', tenant);
  if (!flagOn) {
    return NextResponse.json({ error: 'Feature not available' }, { status: 403 });
  }

  // Atomically reserve one unit of today's quota BEFORE the model call, so
  // concurrent requests cannot all slip past a read-only count (TOCTOU).
  const reservation = await reserveDailyQuota(userId, 'resume_tailoring');
  if (!reservation.allowed) {
    return NextResponse.json(
      {
        error: 'Daily limit reached',
        message: `You have used all ${reservation.snapshot.cap} AI tailoring runs for today. Your limit resets at midnight Central Time.`,
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

    let jobText: string;
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
    } else {
      jobText = sanitizeText(parsed.jobText ?? '', MAX_JOB_CHARS);
    }

    if (resumeText.trim().length < MIN_RESUME_CHARS) {
      return NextResponse.json(
        { error: 'The resume text is too short to tailor. Add more content and try again.' },
        { status: 400 },
      );
    }
    if (jobText.trim().length < MIN_JOB_CHARS) {
      return NextResponse.json(
        { error: 'The job posting text is too short to tailor against.' },
        { status: 400 },
      );
    }

    // Tailoring is (resume x posting)-specific and iterative, so the task
    // registry sets cacheTtlSeconds: 0 — no cacheKey is passed (a key with a
    // zero TTL only spends a guaranteed-miss Redis GET).
    const prompt = await loadPrompt('resume_tailoring');
    const response = await complete<ResumeTailoring>({
      task: 'resume_tailoring',
      tenant,
      promptId: prompt.id,
      promptVersion: prompt.version,
      outputSchema: tailoringSchema,
      messages: prompt.render({ resumeText, jobText }),
    });

    const tailoring = response.parsed;
    if (!tailoring) {
      // Defensive — the gateway throws invalid_output before reaching here.
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
        kind: 'resume_tailoring',
        jobId,
        inputHash: sha256(`${resumeText}\n${jobText}`),
        result: tailoring as unknown as Prisma.InputJsonValue,
      },
    });

    // usage already reflects the post-reservation count.
    return NextResponse.json({
      tailoring,
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
      logger.warn('Resume tailoring gateway error', { code: err.code });
      // Hourly AI rate limit is distinct from the daily quota; 429 means
      // "daily quota" exclusively, so map rate_limited to 503.
      const status =
        err.code === 'rate_limited' ? 503 :
        err.code === 'provider_not_configured' ? 503 :
        502;
      return NextResponse.json({ error: 'AI service temporarily unavailable. Please try again.' }, { status });
    }
    console.error('Resume tailoring failed:', err);
    return NextResponse.json({ error: 'Unexpected error tailoring the resume.' }, { status: 500 });
  } finally {
    if (releaseOnFailure) await releaseDailyQuota(userId, 'resume_tailoring');
  }
}
