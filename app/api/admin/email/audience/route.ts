import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireApiAdmin } from '@/lib/auth/require-api-admin';

import { SYSTEM_PROFILE_ROLE } from '@/lib/system-messages';

/**
 * Real people only: never the automated platform sender profile, and never an
 * account that has been hard-suppressed (bounce, complaint, soft-delete).
 */
const MAILABLE_USER_PROFILES = {
    role: { not: SYSTEM_PROFILE_ROLE },
    emailSuppressed: false,
} as const;

/**
 * Addresses excluded from every audience: hand unsubscribes
 * (isSubscribed=false, what the footer link writes) plus hard suppressions.
 *
 * Kept in step with /api/admin/email/send, which applies the same filter when
 * it materializes the recipient rows. A count that includes people the sender
 * will refuse is a count the admin cannot act on.
 */
async function loadOptedOutEmails(): Promise<Set<string>> {
    const rows = await prisma.emailLead.findMany({
        where: { OR: [{ isSubscribed: false }, { isSuppressed: true }] },
        select: { email: true },
    });
    return new Set(rows.map((r) => r.email.toLowerCase()));
}

/**
 * GET /api/admin/email/audience?segment=all|job_seekers|employers|subscribers|newsletter
 * Returns the count and a sample of users matching the given segment.
 */
export async function GET(req: Request) {
    const authError = await requireApiAdmin();
    if (authError) return authError;

    const { searchParams } = new URL(req.url);
    const segment = searchParams.get('segment') || 'all';

    try {
        let count = 0;
        let sample: Array<{ email: string; firstName?: string | null }> = [];

        switch (segment) {
            case 'job_seekers': {
                const [users, optedOut] = await Promise.all([
                    prisma.userProfile.findMany({
                        where: { role: 'job_seeker', emailSuppressed: false },
                        select: { email: true, firstName: true },
                        orderBy: { createdAt: 'desc' },
                    }),
                    loadOptedOutEmails(),
                ]);
                const mailable = users.filter(u => !optedOut.has(u.email.toLowerCase()));
                count = mailable.length;
                sample = mailable.slice(0, 5);
                break;
            }
            case 'employers': {
                const [users, optedOut] = await Promise.all([
                    prisma.userProfile.findMany({
                        where: { role: 'employer', emailSuppressed: false },
                        select: { email: true, firstName: true },
                        orderBy: { createdAt: 'desc' },
                    }),
                    loadOptedOutEmails(),
                ]);
                const mailable = users.filter(u => !optedOut.has(u.email.toLowerCase()));
                count = mailable.length;
                sample = mailable.slice(0, 5);
                break;
            }
            case 'subscribers': {
                const leads = await prisma.emailLead.findMany({
                    where: { isSubscribed: true, isSuppressed: false },
                    select: { email: true },
                    orderBy: { createdAt: 'desc' },
                });
                count = leads.length;
                sample = leads.slice(0, 5).map(l => ({ email: l.email }));
                break;
            }
            case 'newsletter': {
                const leads = await prisma.emailLead.findMany({
                    where: { isSubscribed: true, isSuppressed: false, newsletterOptIn: true },
                    select: { email: true },
                    orderBy: { createdAt: 'desc' },
                });
                count = leads.length;
                sample = leads.slice(0, 5).map(l => ({ email: l.email }));
                break;
            }
            case 'all':
            default: {
                // Union of all user profiles + email leads (deduplicated)
                const [users, leads, optedOut] = await Promise.all([
                    // MAILABLE_USER_PROFILES excludes the automated sender
                    // profile (role 'system', lib/system-messages.ts). It is a
                    // platform identity, not a person, and must never land in a
                    // broadcast audience.
                    prisma.userProfile.findMany({ where: MAILABLE_USER_PROFILES, select: { email: true, firstName: true } }),
                    prisma.emailLead.findMany({ where: { isSubscribed: true, isSuppressed: false }, select: { email: true } }),
                    loadOptedOutEmails(),
                ]);
                const seen = new Set<string>();
                const all: Array<{ email: string; firstName?: string | null }> = [];
                for (const u of users) {
                    const key = u.email.toLowerCase();
                    if (optedOut.has(key)) continue;
                    if (!seen.has(key)) { seen.add(key); all.push(u); }
                }
                for (const l of leads) {
                    const key = l.email.toLowerCase();
                    if (!seen.has(key)) { seen.add(key); all.push({ email: l.email }); }
                }
                count = all.length;
                sample = all.slice(0, 5);
                break;
            }
        }

        return NextResponse.json({ success: true, segment, count, sample });
    } catch (error) {
        console.error('[Admin Email Audience] Error:', error);
        return NextResponse.json({ success: false, error: 'Failed to get audience' }, { status: 500 });
    }
}
