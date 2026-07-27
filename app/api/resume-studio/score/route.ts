/**
 * POST /api/resume-studio/score
 *
 * Deterministic (zero-AI) resume scoring for the resume studio. Runs the
 * PMHNP rubric in lib/resume-score/score.ts against either:
 *   - a saved ResumeDocument (owner-scoped, `documentId`), or
 *   - raw pasted text (`text`).
 * Exactly one of the two must be provided.
 *
 * No quota applies — the rubric is pure computation, so the only ceiling is
 * the per-IP rate limit. Every run is persisted as a ResumeAnalysis row
 * (kind 'ats_score') so the studio can show score history.
 *
 * Returns: { score: ResumeScoreResult } on success.
 */
import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';
import { sanitizeText } from '@/lib/sanitize';
import { parseSections, sectionsToText } from '@/lib/resume-studio/sections';
import { scoreResumeText } from '@/lib/resume-score/score';

/** The rubric is O(n) over the text; 50k chars is far beyond any real resume. */
const MAX_SCORE_TEXT_CHARS = 50_000;

const requestSchema = z.object({
  documentId: z.string().min(1).max(64).optional(),
  // Generous zod ceiling — oversized input is clamped to
  // MAX_SCORE_TEXT_CHARS below rather than rejected.
  text: z.string().min(1).max(200_000).optional(),
});

type ParsedRequest = z.infer<typeof requestSchema>;

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
  const rateLimitResult = await rateLimit(request, 'resume-studio:score', { limit: 30, windowSeconds: 60 });
  if (rateLimitResult) return rateLimitResult;

  let profileId: string;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    const profile = await prisma.userProfile.findUnique({ where: { supabaseId: user.id } });
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    profileId = profile.id;
  } catch (err) {
    logger.warn('Resume score auth failed', { error: err });
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

  try {
    let resumeText: string;
    let documentId: string | null = null;
    if (parsed.documentId) {
      const doc = await prisma.resumeDocument.findFirst({
        where: { id: parsed.documentId, userId: profileId },
      });
      if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
      documentId = doc.id;
      resumeText = sectionsToText(parseSections(doc.sections)).slice(0, MAX_SCORE_TEXT_CHARS);
    } else {
      resumeText = sanitizeText(parsed.text ?? '', MAX_SCORE_TEXT_CHARS);
    }

    if (resumeText.trim().length === 0) {
      return NextResponse.json({ error: 'There is no resume text to score.' }, { status: 400 });
    }

    const score = scoreResumeText(resumeText);

    // Deterministic scoring can be re-run freely (no AI, no quota), so bound
    // per-user row growth by deduping on identical content: refresh the
    // existing row's timestamp instead of appending a new one when the same
    // resume text is scored again.
    const inputHash = sha256(resumeText);
    const existing = await prisma.resumeAnalysis.findFirst({
      where: { userId: profileId, kind: 'ats_score', inputHash },
      select: { id: true },
    });
    if (existing) {
      await prisma.resumeAnalysis.update({
        where: { id: existing.id },
        data: { documentId, result: score as unknown as Prisma.InputJsonValue },
      });
    } else {
      await prisma.resumeAnalysis.create({
        data: {
          userId: profileId,
          documentId,
          kind: 'ats_score',
          inputHash,
          result: score as unknown as Prisma.InputJsonValue,
        },
      });
    }

    return NextResponse.json({ score });
  } catch (err) {
    console.error('Resume score failed:', err);
    return NextResponse.json({ error: 'Failed to score the resume.' }, { status: 500 });
  }
}
