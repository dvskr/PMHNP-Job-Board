/**
 * The newsletter opt-in and job-highlights alert a seeker chose at signup.
 *
 * ── WHY THIS IS NOT INLINE IN THE SIGNUP ROUTE ─────────────────────────────
 *
 * It used to be, and the preferences were lost on essentially every signup.
 *
 * SignUpForm calls supabase.auth.signUp() and then POSTs /api/auth/profile
 * with the role, company and these opt-ins. That POST authenticates from the
 * session cookie. When the Supabase project requires email confirmation, and
 * this one does, signUp() returns a user but NO session, so there is no
 * cookie yet and the POST answers 401 every time. The form caught that and
 * showed "we could not save your email preferences", which is how an
 * employer came to report a pop-up about email preferences at the final step
 * of signup.
 *
 * lib/auth/ensure-profile.ts already solved the same problem for role and
 * company in 2026-05: stash them in auth user_metadata at signUp and read
 * them back when the profile is actually created, on the first authenticated
 * request after confirmation. The opt-ins were never added to that set, so
 * they stayed on the broken path. This is the shared write both callers use,
 * so the two can no longer drift.
 *
 * ── IDEMPOTENT ON PURPOSE ──────────────────────────────────────────────────
 *
 * Both callers may run for the same person: the POST if a session somehow
 * exists, and ensure-profile on first sign-in. Running twice must not create
 * two alerts or re-subscribe someone who has since opted out, so the lead is
 * an upsert that does not touch an existing row's subscription state, and the
 * alert is created only when the address has none.
 */

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { syncToBeehiiv } from '@/lib/beehiiv';

export interface SignupPreferences {
  email: string;
  role: 'employer' | 'job_seeker';
  wantJobHighlights: boolean;
  /** 'daily' | 'weekly'; anything else falls back to daily. */
  highlightsFrequency?: string | null;
  newsletterOptIn: boolean;
}

/**
 * Apply a seeker's signup opt-ins. Never throws: a failure here must not cost
 * someone their account, which is the whole reason the original code caught
 * and swallowed its own errors.
 */
export async function applySignupPreferences(prefs: SignupPreferences): Promise<void> {
  const email = prefs.email.trim().toLowerCase();
  if (!email) return;

  // Employers get neither: job highlights are a seeker product, and the
  // employer lead list is written by a different path.
  if (prefs.role !== 'job_seeker') return;

  try {
    await prisma.emailLead.upsert({
      where: { email },
      // Deliberately empty. A returning address may have unsubscribed or been
      // suppressed since, and signing up again must not quietly re-subscribe
      // them; the account itself does not depend on this row.
      update: {},
      create: {
        email,
        source: 'signup',
        isSubscribed: true,
        newsletterOptIn: !!prefs.newsletterOptIn,
      },
    });
    if (prefs.newsletterOptIn) syncToBeehiiv(email, { utmSource: 'signup' });
  } catch (err) {
    logger.error('[signup-preferences] could not write the email lead', err, { email });
    // Keep going: the alert below has its own try, and a missing lead must
    // not also cost them the alert they asked for.
  }

  if (!prefs.wantJobHighlights) return;

  try {
    // One alert per address. A second would mean two digests a day for a
    // person who asked for one.
    const existing = await prisma.jobAlert.findFirst({ where: { email }, select: { id: true } });
    if (existing) return;

    await prisma.jobAlert.create({
      data: {
        email,
        name: 'Job Highlights',
        keyword: null,
        location: null,
        mode: null,
        jobType: null,
        minSalary: null,
        maxSalary: null,
        frequency: prefs.highlightsFrequency === 'weekly' ? 'weekly' : 'daily',
        isActive: true,
        token: crypto.randomUUID(),
      },
    });
    logger.info('[signup-preferences] job highlights alert created', { email });
  } catch (err) {
    logger.error('[signup-preferences] could not create the job alert', err, { email });
  }
}
