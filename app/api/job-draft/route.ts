/**
 * /api/job-draft — Auth-anchored job-post drafts.
 *
 * 2026-05-14 cutover: replaced the email-token model with an
 * authenticated, dashboard-visible "your unfinished post" pattern
 * (mirrors LinkedIn / Indeed):
 *
 *   POST   → auto-save: upsert the calling employer's single draft
 *   GET    → fetch the calling employer's draft (or back-compat token
 *            lookup when ?token=X is provided)
 *   DELETE → wipe the calling employer's draft (used by Clear /
 *            successful post)
 *
 * Architecture decisions:
 *   - ONE draft per user. Auto-save overwrites in place. Reflects
 *     LinkedIn's behavior — the form is "live state", not a saved
 *     collection. Lowers cognitive load and avoids "which draft am
 *     I editing?" confusion.
 *   - Body sanitized at the boundary. We accept arbitrary form-shape
 *     JSON but limit total payload size to MAX_BODY_BYTES so a
 *     malicious client can't push megabytes of garbage.
 *   - Email-token GET stays for back-compat with any live email
 *     links from before the cutover. Returns the same shape.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { logger } from '@/lib/logger';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { createClient } from '@/lib/supabase/server';

const MAX_BODY_BYTES = 200_000; // 200 KB — generous for a JD plus form metadata.

async function getEmployerUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const profile = await prisma.userProfile.findUnique({ where: { supabaseId: user.id } });
  if (!profile || (profile.role !== 'employer' && profile.role !== 'admin')) return null;
  return user.id;
}

function thirtyDaysFromNow(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d;
}

// POST — upsert the current employer's draft. Idempotent; new every
// 2-3 seconds during active typing thanks to the page's debounced
// auto-save effect.
export async function POST(request: NextRequest) {
  // Auto-save fires every few seconds during active typing — the `postJob`
  // bucket (3 req/min) was for the once-per-session real job submission
  // and caused legitimate auto-saves to 429. `general` (60 req/min) is the
  // right shape: prevents abuse, doesn't punish actual usage.
  const rateLimitResult = await rateLimit(request, 'drafts', RATE_LIMITS.general);
  if (rateLimitResult) return rateLimitResult;

  const userId = await getEmployerUserId();
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  let body: { formData?: Record<string, unknown>; email?: string };
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Draft too large' }, { status: 413 });
    }
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.formData || typeof body.formData !== 'object') {
    return NextResponse.json({ error: 'Missing formData' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email : null;

  try {
    const draft = await prisma.jobDraft.upsert({
      where: { userId },
      update: {
        formData: body.formData as Prisma.InputJsonValue,
        email,
        expiresAt: thirtyDaysFromNow(),
      },
      create: {
        userId,
        email,
        formData: body.formData as Prisma.InputJsonValue,
        expiresAt: thirtyDaysFromNow(),
      },
      select: { id: true, updatedAt: true },
    });
    return NextResponse.json({
      success: true,
      id: draft.id,
      savedAt: draft.updatedAt.toISOString(),
    });
  } catch (err) {
    logger.error('Failed to save job draft', err);
    return NextResponse.json({ error: 'Save failed' }, { status: 500 });
  }
}

// GET — two modes:
//   1. ?token=X  → back-compat for legacy email-link resume flow
//   2. (no params) → current authenticated user's draft
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');

  if (token) {
    try {
      const draft = await prisma.jobDraft.findUnique({ where: { resumeToken: token } });
      if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
      if (new Date() > new Date(draft.expiresAt)) {
        await prisma.jobDraft.delete({ where: { id: draft.id } }).catch(() => {});
        return NextResponse.json({ error: 'Draft has expired' }, { status: 410 });
      }
      return NextResponse.json({
        success: true,
        formData: draft.formData,
        email: draft.email,
        expiresAt: draft.expiresAt,
      });
    } catch (err) {
      logger.error('Error retrieving draft by token', err);
      return NextResponse.json({ error: 'Failed to retrieve draft' }, { status: 500 });
    }
  }

  // Auth-anchored path.
  const userId = await getEmployerUserId();
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  try {
    const draft = await prisma.jobDraft.findUnique({
      where: { userId },
      select: { id: true, formData: true, email: true, updatedAt: true, expiresAt: true },
    });
    if (!draft) {
      return NextResponse.json({ success: true, draft: null });
    }
    if (new Date() > new Date(draft.expiresAt)) {
      await prisma.jobDraft.delete({ where: { id: draft.id } }).catch(() => {});
      return NextResponse.json({ success: true, draft: null });
    }
    return NextResponse.json({
      success: true,
      draft: {
        id: draft.id,
        formData: draft.formData,
        email: draft.email,
        savedAt: draft.updatedAt.toISOString(),
        expiresAt: draft.expiresAt.toISOString(),
      },
    });
  } catch (err) {
    logger.error('Error retrieving employer draft', err);
    return NextResponse.json({ error: 'Failed to retrieve draft' }, { status: 500 });
  }
}

// DELETE — auth-anchored. Used by the form's Clear button + the
// successful-post path in the preview page. (Token-based delete from
// the old flow is dropped; nothing in production was calling it.)
export async function DELETE() {
  const userId = await getEmployerUserId();
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  try {
    const result = await prisma.jobDraft.deleteMany({ where: { userId } });
    return NextResponse.json({ success: true, deleted: result.count });
  } catch (err) {
    logger.error('Failed to delete job draft', err);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
}
