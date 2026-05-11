/**
 * Post-signup interstitial that captures the four fields the candidate
 * embedder needs (headline + specialties + yearsExperience + bio) so the
 * profile is reachable by employer AI Match the moment it's saved.
 *
 * Background: 86% of prod candidate profiles were too sparse for the
 * embedder (text < 20 chars after concatenation), because signup only
 * collects email + password + first/last name. Forcing this single screen
 * post-signup closes that gap for new users; existing sparse users get the
 * same nudge from the dashboard's searchability callout.
 *
 * Skippable on purpose — friction here costs us signups, and incomplete
 * profiles still benefit the rest of the product (saved jobs, alerts).
 * If the user skips, the dashboard callout keeps the door open.
 *
 * Redirects:
 *   - not authed                                       -> /login?next=/onboarding/professional
 *   - employer / admin                                 -> /employer/dashboard | /admin/jobs
 *   - profile already searchable (returning user)      -> /dashboard
 */
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { isProfileSearchable } from '@/lib/profile-searchable';
import OnboardingProfessionalForm from './OnboardingProfessionalForm';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Complete your profile | PMHNP Hiring',
    description: 'A few details so employers can find you in AI Match.',
    robots: { index: false, follow: false },
};

export default async function OnboardingProfessionalPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        redirect('/login?next=/onboarding/professional');
    }

    const profile = await prisma.userProfile.findUnique({
        where: { supabaseId: user.id },
        select: {
            role: true,
            headline: true,
            yearsExperience: true,
            certifications: true,
            licenseStates: true,
            specialties: true,
            skills: true,
            bio: true,
            resumeUrl: true,
            resumeParseStatus: true,
        },
    });

    if (profile?.role === 'admin') redirect('/admin/jobs');
    if (profile?.role === 'employer') redirect('/employer/dashboard');

    // Returning users with a searchable profile shouldn't get re-prompted.
    // The dashboard's amber callout handles users who slipped through.
    if (profile && isProfileSearchable(profile).searchable) {
        redirect('/dashboard');
    }

    return (
        <OnboardingProfessionalForm
            initial={{
                headline: profile?.headline ?? '',
                bio: profile?.bio ?? '',
                specialties: profile?.specialties ?? '',
                yearsExperience: profile?.yearsExperience ?? null,
                resumeUrl: profile?.resumeUrl ?? null,
                resumeParseStatus: profile?.resumeParseStatus ?? null,
            }}
        />
    );
}
