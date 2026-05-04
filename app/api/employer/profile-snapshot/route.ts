import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

/**
 * GET /api/employer/profile-snapshot
 *
 * Read-only endpoint that returns the employer's most recently used company
 * profile data so the post-job form can pre-fill on mount. Saves the employer
 * from re-typing company name / website / logo / description on every post.
 *
 * Source of truth: the most recent EmployerJob row owned by this user. Why:
 *   - We don't have a separate Company/Profile table — company info lives on
 *     each posting (companyLogoUrl, companyDescription, companyWebsite, etc.)
 *   - "Most recent" matches the employer's intuition — if they updated their
 *     branding on their last post, the next post starts from that.
 *   - Returns null fields gracefully when there's no prior post (first-timer).
 *
 * NOT a config endpoint — this is a "best-effort fill" not a save target.
 * The actual company-profile editor lives at /employer/settings.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !user.email) {
      return NextResponse.json({ found: false }, { status: 401 });
    }

    const profile = await prisma.userProfile.findUnique({
      where: { supabaseId: user.id },
      select: { role: true, company: true },
    });

    if (!profile || profile.role !== 'employer') {
      return NextResponse.json({ found: false, reason: 'not-employer' }, { status: 403 });
    }

    // Pull the most recent post that has any company data populated.
    // Falls through to first row if none — better than returning empty when
    // an early post has the data and later edits stripped it.
    const employerJobs = await prisma.employerJob.findMany({
      where: {
        OR: [
          { userId: user.id },
          { contactEmail: user.email },
        ],
      },
      include: {
        job: {
          select: { employer: true, applyOnPlatform: true, applyLink: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 5, // small fanout so we can find the most-populated record
    });

    // Walk back until we find a row with at least a company name and website.
    // Logo/description might be empty even on the latest post (employer may
    // not have uploaded), so we cherry-pick the best value seen across rows.
    // First-time posters (no employerJobs yet) fall through to the
    // UserProfile.company fallback below so the company name still autofills.
    const best = {
      companyName: '' as string,
      companyWebsite: '' as string,
      companyLogoUrl: '' as string,
      companyDescription: '' as string,
      contactEmail: user.email,
    };

    for (const ej of employerJobs) {
      if (!best.companyName && (ej.employerName || ej.job.employer)) {
        best.companyName = ej.employerName || ej.job.employer;
      }
      if (!best.companyWebsite && ej.companyWebsite) {
        best.companyWebsite = ej.companyWebsite;
      }
      if (!best.companyLogoUrl && ej.companyLogoUrl) {
        best.companyLogoUrl = ej.companyLogoUrl;
      }
      if (!best.companyDescription && ej.companyDescription) {
        best.companyDescription = ej.companyDescription;
      }
    }

    // Fallback for first-time posters: use the company name they entered at
    // signup (UserProfile.company). Logo/website/description aren't on the
    // profile schema yet, so those still need to be entered on the first
    // post — subsequent posts will auto-fill from that one.
    if (!best.companyName && profile.company) {
      best.companyName = profile.company;
    }

    // If we have ANY usable data, return it. Empty result still returns
    // found:false so the client knows to leave fields untouched.
    const hasAnyData = !!(best.companyName || best.companyWebsite || best.companyLogoUrl || best.companyDescription);
    if (!hasAnyData) {
      return NextResponse.json({ found: false });
    }

    return NextResponse.json({
      found: true,
      profile: best,
    });
  } catch (err) {
    logger.error('Error fetching employer profile snapshot', err);
    return NextResponse.json({ found: false, reason: 'server-error' }, { status: 500 });
  }
}
