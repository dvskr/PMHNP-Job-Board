import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import { config } from '@/lib/config';
import { buildQuotaKeys, rawDomainFromEmail, FREE_EMAIL_DOMAINS } from '@/lib/employer-quota';

// Imported, not re-declared: a third local copy of this list is exactly how
// the preview and the gate drifted apart in the first place.

/**
 * GET /api/employer/free-quota-status
 *
 * Read-only quota check used by the post-job preview UI to render the right
 * duration ("30-day free trial" vs "60-day paid listing") before the user
 * clicks submit. Mirrors the gate logic in /api/jobs/post-free without
 * actually consuming a freebie.
 *
 * Returns:
 *   - eligible: whether the user can post AT ALL (auth + role + non-free-email-domain)
 *   - willBeFree: true if their next post will fall under the free quota
 *   - remaining: how many free posts the domain has left
 *   - durationDays: 30 if next post is free, 60 if paid
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !user.email) {
      return NextResponse.json({ eligible: false, reason: 'unauthenticated' });
    }

    const profile = await prisma.userProfile.findUnique({
      where: { supabaseId: user.id },
      select: { role: true },
    });

    if (!profile || profile.role !== 'employer') {
      return NextResponse.json({ eligible: false, reason: 'not-employer' });
    }

    // Same derivation as the gate and the checkout guard: one helper, one
    // behavior, no raw split('@')[1] edge divergence.
    const signupDomain = rawDomainFromEmail(user.email);
    if (!signupDomain || FREE_EMAIL_DOMAINS.includes(signupDomain)) {
      return NextResponse.json({ eligible: false, reason: 'free-email-provider' });
    }

    // MUST mirror the gate in /api/jobs/post-free exactly. It previously
    // counted quotaDomain only, so an account that had changed its email
    // domain was told "your first post is free", filled in the whole form,
    // and was refused at submit. Same predicate, same keys.
    const quotaKeys = buildQuotaKeys({ userId: user.id, signupEmail: user.email });
    const used = await prisma.employerJob.count({
      where: {
        paymentStatus: 'free',
        OR: [
          { quotaKeys: { hasSome: quotaKeys } },
          { quotaDomain: signupDomain },
        ],
      },
    });
    const remaining = Math.max(0, config.freePostsPerEmail - used);
    const willBeFree = remaining > 0;

    return NextResponse.json({
      eligible: true,
      willBeFree,
      remaining,
      limit: config.freePostsPerEmail,
      durationDays: willBeFree ? config.freeDurationDays : config.durationDays,
      paidDurationDays: config.durationDays,
      freeDurationDays: config.freeDurationDays,
    });
  } catch (err) {
    return NextResponse.json(
      { eligible: false, reason: 'server-error', error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}
