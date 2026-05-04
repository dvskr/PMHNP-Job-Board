import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import { config } from '@/lib/config';

const FREE_EMAIL_DOMAINS = [
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
  'aol.com', 'icloud.com', 'mail.com', 'protonmail.com',
  'ymail.com', 'live.com', 'msn.com', 'googlemail.com',
];

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

    const signupDomain = user.email.toLowerCase().split('@')[1];
    if (!signupDomain || FREE_EMAIL_DOMAINS.includes(signupDomain)) {
      return NextResponse.json({ eligible: false, reason: 'free-email-provider' });
    }

    const used = await prisma.employerJob.count({
      where: { quotaDomain: signupDomain, paymentStatus: 'free' },
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
