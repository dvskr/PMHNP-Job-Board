/**
 * POST /api/profile/clear
 *
 * Resets the authenticated user's profile to a near-blank state.
 * Preserves only:
 *   - firstName (user request)
 *   - System / immutable fields: id, supabaseId, email, role, createdAt,
 *     updatedAt, companyId, lifecycle timestamps (deletedAt, purgeAt, etc.)
 *   - File references that have storage backing: avatarUrl, resumeUrl,
 *     resumeParseStatus, resumeParsedAt (use the dedicated delete
 *     endpoints to remove the actual files)
 *   - Activity history outside the candidate-profile scope
 *     (jobApplications, conversations, savedCandidates, employerJobs,
 *     telemetry) — these aren't "profile info" the user is editing here
 *
 * Hard-deletes all rows in:
 *   - CandidateLicense
 *   - CandidateCertification
 *   - CandidateEducation
 *   - CandidateWorkExperience
 *   - CandidateScreeningAnswer
 *   - CandidateOpenEndedResponse
 *   - CandidateReference
 *
 * Wrapped in a single Prisma transaction so a partial failure rolls back.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  // Tight rate limit — this is destructive and idempotent enough that
  // a runaway client shouldn't be able to hammer it.
  const rl = await rateLimit(request, 'profile:clear', { limit: 5, windowSeconds: 60 });
  if (rl) return rl;

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const profile = await prisma.userProfile.findUnique({
      where: { supabaseId: user.id },
      select: { id: true },
    });
    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Interactive transaction (callback form) so the embedding delete can
    // run alongside the Prisma model deletes — candidate_embeddings is a
    // raw pgvector table outside the Prisma schema, so it needs $execute
    // RawUnsafe and can't ride in the array form of $transaction.
    await prisma.$transaction(async (tx) => {
      await tx.candidateLicense.deleteMany({ where: { userId: profile.id } });
      await tx.candidateCertification.deleteMany({ where: { userId: profile.id } });
      await tx.candidateEducation.deleteMany({ where: { userId: profile.id } });
      await tx.candidateWorkExperience.deleteMany({ where: { userId: profile.id } });
      await tx.candidateScreeningAnswer.deleteMany({ where: { userId: profile.id } });
      await tx.candidateOpenEndedResponse.deleteMany({ where: { userId: profile.id } });
      await tx.candidateReference.deleteMany({ where: { userId: profile.id } });

      // Drop the candidate's vector embedding so they stop appearing in
      // employer AI Match the moment the clear succeeds. Without this the
      // stale row would keep matching searches and hydration would return
      // a now-blank profile to employers who'd already paid an Unlock to
      // see it. No-op if the row doesn't exist.
      await tx.$executeRawUnsafe(
        `DELETE FROM candidate_embeddings WHERE supabase_id = $1`,
        user.id,
      );

      await tx.userProfile.update({
        where: { supabaseId: user.id },
        data: {
          // ── Identity (clear all but firstName) ──────────────
          lastName: null,
          phone: null,
          company: null,
          headline: null,
          bio: null,
          linkedinUrl: null,

          // ── Professional ──────────────────────────────────
          yearsExperience: null,
          certifications: null,
          licenseStates: null,
          specialties: null,
          skills: [],

          // ── Job preferences ───────────────────────────────
          preferredWorkMode: null,
          preferredJobType: null,
          desiredSalaryMin: null,
          desiredSalaryMax: null,
          desiredSalaryType: null,
          availableDate: null,

          // ── Visibility booleans → reset to schema defaults ─
          openToOffers: true,
          profileVisible: true,

          // ── Address ───────────────────────────────────────
          addressLine1: null,
          addressLine2: null,
          city: null,
          state: null,
          zipCode: null,
          country: 'US',

          // ── EEO / sensitive ───────────────────────────────
          workAuthorized: null,
          requiresSponsorship: null,
          veteranStatus: null,
          disabilityStatus: null,
          raceEthnicity: null,
          gender: null,
          sensitiveDataConsent: false,
          sensitiveDataConsentAt: null,

          // ── Federal registrations ─────────────────────────
          npiNumber: null,
          deaNumber: null,
          deaExpirationDate: null,

          // ── Resume parse status (file ref left intact) ────
          // The resume file itself is preserved — use DELETE
          // /api/profile/resume to remove it. We do clear the
          // "completed" status so the next upload re-runs the
          // review-then-apply flow.
          resumeParseStatus: null,
          resumeParsedAt: null,
        },
      });
    });

    logger.info('Profile cleared by user', {
      userId: user.id,
      profileId: profile.id,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('Profile clear failed', err);
    return NextResponse.json({ error: 'Failed to clear profile' }, { status: 500 });
  }
}
