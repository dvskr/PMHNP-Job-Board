/**
 * POST /api/resume-studio/review
 *
 * AI deep review of a resume (resume studio). Consumes either a saved
 * ResumeDocument (owner-scoped, `documentId`) or raw pasted text (`text`),
 * exactly one of the two, and returns the structured critique produced by
 * the registry prompt `resume_review` (overall assessment, strengths, gaps,
 * rewritten bullets, section notes, ATS tips).
 *
 * Gates, in order: rate limit, auth + profile, feature flag
 * ai.candidate.resume_review, daily quota (AI_DAILY_CAPS.resume_review).
 * Every successful run persists a ResumeAnalysis row (kind 'resume_review').
 *
 * Returns: { review, usage, meta } on success.
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
import { sanitizeText } from '@/lib/sanitize';
import { parseSections, sectionsToText } from '@/lib/resume-studio/sections';

// gpt-5.4 reviews with 8k output budget can run long; match the task's
// 120s provider timeout plus fallback headroom.
export const maxDuration = 180;

/** Same truncation the resume parser applies — stays within token limits. */
const MAX_RESUME_CHARS = 12_000;
/** Below this the model has nothing real to critique. */
const MIN_RESUME_CHARS = 50;

const requestSchema = z.object({
  documentId: z.string().min(1).max(64).optional(),
  // Generous zod ceiling — oversized input is clamped to MAX_RESUME_CHARS
  // below rather than rejected.
  text: z.string().min(1).max(100_000).optional(),
});

type ParsedRequest = z.infer<typeof requestSchema>;

/** Mirrors the JSON structure declared in lib/ai/prompts/resume_review/v1.json. */
const reviewSchema = z.object({
  overallAssessment: z.string(),
  strengths: z.array(z.string()),
  gaps: z.array(z.object({
    area: z.string(),
    why: z.string(),
    fix: z.string(),
  })),
  rewrittenBullets: z.array(z.object({
    original: z.string(),
    improved: z.string(),
    rationale: z.string(),
  })),
  sectionNotes: z.array(z.object({
    section: z.string(),
    note: z.string(),
  })),
  atsTips: z.array(z.string()),
});

type ResumeReview = z.infer<typeof reviewSchema>;

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
  const rateLimitResult = await rateLimit(request, 'resume-studio:review', { limit: 10, windowSeconds: 60 });
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
    logger.warn('Resume review auth failed', { error: err });
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

  const tenant = { type: 'candidate' as const, id: userId };
  const flagOn = await isAiFeatureEnabled('ai.candidate.resume_review', tenant);
  if (!flagOn) {
    return NextResponse.json({ error: 'Feature not available' }, { status: 403 });
  }

  // Atomically reserve one unit of today's quota BEFORE the model call, so
  // concurrent requests cannot all slip past a read-only count (TOCTOU).
  const reservation = await reserveDailyQuota(userId, 'resume_review');
  if (!reservation.allowed) {
    return NextResponse.json(
      {
        error: 'Daily limit reached',
        message: `You have used all ${reservation.snapshot.cap} AI resume reviews for today. Your limit resets at midnight Central Time.`,
        usage: reservation.snapshot,
      },
      { status: 429 },
    );
  }
  const usage = reservation.snapshot;

  // Any failure past this point must return the reserved unit so an outage
  // never burns the candidate's tiny free allowance.
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

    if (resumeText.trim().length < MIN_RESUME_CHARS) {
      return NextResponse.json(
        { error: 'The resume text is too short to review. Add more content and try again.' },
        { status: 400 },
      );
    }

    const prompt = await loadPrompt('resume_review');
    const response = await complete<ResumeReview>({
      task: 'resume_review',
      tenant,
      promptId: prompt.id,
      promptVersion: prompt.version,
      cacheKey: ['review', prompt.version, sha256(resumeText)],
      outputSchema: reviewSchema,
      messages: prompt.render({ resumeText }),
    });

    const review = response.parsed;
    if (!review) {
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
        kind: 'resume_review',
        inputHash: sha256(resumeText),
        result: review as unknown as Prisma.InputJsonValue,
      },
    });

    // usage already reflects the post-reservation count.
    return NextResponse.json({
      review,
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
      logger.warn('Resume review gateway error', { code: err.code });
      // The per-tenant hourly AI rate limit is distinct from the daily
      // quota; map it to 503 so 429 means "daily quota" exclusively.
      const status =
        err.code === 'rate_limited' ? 503 :
        err.code === 'provider_not_configured' ? 503 :
        502;
      return NextResponse.json({ error: 'AI service temporarily unavailable. Please try again.' }, { status });
    }
    console.error('Resume review failed:', err);
    return NextResponse.json({ error: 'Unexpected error generating the review.' }, { status: 500 });
  } finally {
    if (releaseOnFailure) await releaseDailyQuota(userId, 'resume_review');
  }
}
