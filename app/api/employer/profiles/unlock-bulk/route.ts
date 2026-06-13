/**
 * POST /api/employer/profiles/unlock-bulk
 *
 * Bulk-unlock companion to /api/employer/candidates/[id]. Accepts a
 * list of candidate IDs, runs the same per-unlock gate (canUnlockCandidate)
 * for each, and returns a partial-success result so the UI can show
 * "17 unlocked, 3 failed" rather than rolling back the whole batch.
 *
 * Design:
 *   - Authentication mirrors the single-unlock endpoint.
 *   - We never bulk-bypass the per-posting unlock cap — each ID still
 *     consumes one slot from the active posting allowance.
 *   - The unique constraint on ProfileView (viewerId, candidateId)
 *     makes the upsert idempotent: re-running with the same IDs after
 *     a partial failure is safe — already-unlocked IDs come back in
 *     `unlocked` without re-charging.
 *
 * Response shape:
 *   {
 *     unlocked: { candidateId: string }[],
 *     failed:   { candidateId: string, reason: string, message: string }[],
 *     allowanceRemaining: number | null,
 *   }
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { canUnlockCandidate, getEmployerTier } from '@/lib/tier-limits';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

const requestSchema = z.object({
  candidateIds: z.array(z.string().min(1)).min(1).max(100),
  // Optional: explicit posting to attribute the unlocks to. Without
  // this, canUnlockCandidate() picks "newest active posting with
  // headroom" — which can differ from the posting the user has
  // selected in the UI, causing the displayed counter to look stuck
  // (unlocks happen, just on a different posting's quota).
  postingId: z.string().min(1).optional(),
});

// Per-call upper bound. The UI gates this at the credit balance, but we
// still enforce server-side so a malicious client can't pass 10k IDs.
const MAX_BATCH = 100;

const REASON_MESSAGES: Record<string, string> = {
  daily_cap: 'Daily unlock cap reached. Try again tomorrow.',
  posting_cap: 'No more unlock credits remaining on your active postings.',
  no_posting: 'You need at least one active job posting to unlock candidates.',
  not_found: 'Candidate not found or no longer accepting offers.',
  already_unlocked: 'Already unlocked.',
};

export async function POST(req: NextRequest) {
  const rateLimitResult = await rateLimit(req, 'employer:unlock-bulk', RATE_LIMITS.employer);
  if (rateLimitResult) return rateLimitResult;

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const viewerProfile = await prisma.userProfile.findUnique({
    where: { supabaseId: user.id },
    select: { role: true },
  });
  if (!viewerProfile || (viewerProfile.role !== 'employer' && viewerProfile.role !== 'admin')) {
    return NextResponse.json({ error: 'Forbidden — employer or admin only' }, { status: 403 });
  }

  let parsed: z.infer<typeof requestSchema>;
  try {
    parsed = requestSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid request', details: err instanceof Error ? err.message : 'unknown' },
      { status: 400 },
    );
  }

  const candidateIds = Array.from(new Set(parsed.candidateIds)).slice(0, MAX_BATCH);
  const isAdmin = viewerProfile.role === 'admin';
  const tier = isAdmin ? null : await getEmployerTier(user.id);

  // Security guard: only honor a client-supplied postingId that's actually
  // owned by this employer AND currently active — otherwise charges could be
  // attributed to another account's posting. Verify once (same id for the whole
  // batch); fall back to the auto-picker if it doesn't check out. Mirrors the
  // single-unlock endpoint (candidates/[id]/route.ts).
  let verifiedPostingId: string | undefined;
  if (parsed.postingId && !isAdmin) {
    const ownsPosting = await prisma.employerJob.findFirst({
      where: {
        id: parsed.postingId,
        OR: [
          { userId: user.id },
          { userId: null, contactEmail: user.email ?? '' },
        ],
        job: { isPublished: true, expiresAt: { gt: new Date() } },
      },
      select: { id: true },
    });
    verifiedPostingId = ownsPosting ? parsed.postingId : undefined;
  }

  const unlocked: { candidateId: string }[] = [];
  const failed: { candidateId: string; reason: string; message: string }[] = [];

  for (const candidateId of candidateIds) {
    try {
      // Already-unlocked check — idempotent re-runs come back in `unlocked`.
      const existing = await prisma.profileView.findUnique({
        where: { viewerId_candidateId: { viewerId: user.id, candidateId } },
      });
      if (existing) {
        unlocked.push({ candidateId });
        continue;
      }

      // Privacy gate — candidate must still be visible + open to offers.
      const candidate = await prisma.userProfile.findFirst({
        where: {
          supabaseId: candidateId,
          profileVisible: true,
          openToOffers: true,
          role: 'job_seeker',
        },
        select: { supabaseId: true },
      });
      if (!candidate) {
        failed.push({ candidateId, reason: 'not_found', message: REASON_MESSAGES.not_found });
        continue;
      }

      // Per-unlock gate. Admins bypass.
      let chargePostingId: string | undefined;
      if (!isAdmin && tier) {
        const unlockCheck = await canUnlockCandidate(user.id, tier);
        if (!unlockCheck.allowed) {
          const reason = unlockCheck.reason || 'posting_cap';
          failed.push({ candidateId, reason, message: REASON_MESSAGES[reason] || REASON_MESSAGES.posting_cap });
          continue;
        }
        // Honor the client's selected posting only after it's been verified as
        // owned + active above; otherwise fall back to canUnlockCandidate's pick.
        chargePostingId = verifiedPostingId ?? unlockCheck.postingId;
      }

      await prisma.profileView.upsert({
        where: { viewerId_candidateId: { viewerId: user.id, candidateId } },
        update: { viewedAt: new Date() },
        create: {
          viewerId: user.id,
          candidateId,
          employerJobId: chargePostingId || null,
        },
      });
      unlocked.push({ candidateId });
    } catch (err) {
      logger.warn('Bulk-unlock per-candidate error', { candidateId, error: err });
      failed.push({ candidateId, reason: 'error', message: 'Unexpected error — try again.' });
    }
  }

  // Best-effort allowance snapshot for the UI to show "N credits left".
  let allowanceRemaining: number | null = null;
  if (!isAdmin && tier) {
    const post = await canUnlockCandidate(user.id, tier);
    if (typeof post.used === 'number' && typeof post.limit === 'number') {
      allowanceRemaining = Math.max(0, post.limit - post.used);
    }
  }

  return NextResponse.json({ unlocked, failed, allowanceRemaining });
}
