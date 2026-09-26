import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireApiAdmin } from '@/lib/auth/require-api-admin';
import { createClient } from '@/lib/supabase/server';
import { executeBroadcast } from '@/lib/broadcast-sender';
import { isOutboundPaused, OUTBOUND_PAUSED_MESSAGE } from '@/lib/outbound-kill-switch';

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
 * Addresses that must not be in ANY broadcast audience: hand unsubscribes
 * (isSubscribed=false, what the footer link writes) plus hard suppressions.
 *
 * The account-based segments used to be built from UserProfile alone, so a
 * person with an account who clicked Unsubscribe in a broadcast stayed in the
 * next job_seekers / employers / all audience. The send loop refuses them now,
 * but an audience built from consenting addresses is what makes the count the
 * admin approves match the mail that actually goes out.
 */
async function loadOptedOutEmails(): Promise<Set<string>> {
    const rows = await prisma.emailLead.findMany({
        where: { OR: [{ isSubscribed: false }, { isSuppressed: true }] },
        select: { email: true },
    });
    return new Set(rows.map((r) => r.email.toLowerCase()));
}

/**
 * POST /api/admin/email/send
 * Create and execute an email broadcast.
 *
 * Body: { subject, body, audience, customEmails? }
 */
export async function POST(req: NextRequest) {
    // Passed explicitly so the send gets its own rate-limit bucket: a bulk
    // broadcast is the last admin endpoint that should run unthrottled.
    const authError = await requireApiAdmin(req);
    if (authError) return authError;

    // Emergency brake: while it is engaged, nothing leaves, and the admin gets
    // the reason instead of a broadcast that fails recipient by recipient.
    if (isOutboundPaused()) {
        return NextResponse.json(
            { success: false, error: OUTBOUND_PAUSED_MESSAGE },
            { status: 503 }
        );
    }

    try {
        const { subject, body, audience, customEmails } = await req.json();

        if (!subject || !body || !audience) {
            return NextResponse.json(
                { success: false, error: 'subject, body, and audience are required' },
                { status: 400 }
            );
        }

        // ── Build recipient list based on audience segment ──
        let recipients: Array<{ email: string; firstName?: string | null }> = [];

        switch (audience) {
            case 'self': {
                // Test send: the signed-in admin, resolved from their own
                // session. This used to be a hard-coded personal address in the
                // client bundle, which shipped one person's inbox to every
                // visitor of the admin page and sent every admin's test there.
                const supabase = await createClient();
                const { data: { user } } = await supabase.auth.getUser();
                if (!user?.email) {
                    return NextResponse.json(
                        { success: false, error: 'No email on the signed-in account' },
                        { status: 401 }
                    );
                }
                recipients = [{ email: user.email.toLowerCase() }];
                break;
            }
            case 'job_seekers': {
                const optedOut = await loadOptedOutEmails();
                const users = await prisma.userProfile.findMany({
                    where: { role: 'job_seeker', emailSuppressed: false },
                    select: { email: true, firstName: true },
                });
                recipients = users.filter((u) => !optedOut.has(u.email.toLowerCase()));
                break;
            }
            case 'employers': {
                const optedOut = await loadOptedOutEmails();
                const users = await prisma.userProfile.findMany({
                    where: { role: 'employer', emailSuppressed: false },
                    select: { email: true, firstName: true },
                });
                recipients = users.filter((u) => !optedOut.has(u.email.toLowerCase()));
                break;
            }
            case 'subscribers': {
                const leads = await prisma.emailLead.findMany({
                    where: { isSubscribed: true, isSuppressed: false },
                    select: { email: true },
                });
                recipients = leads.map(l => ({ email: l.email }));
                break;
            }
            case 'newsletter': {
                const leads = await prisma.emailLead.findMany({
                    where: { isSubscribed: true, isSuppressed: false, newsletterOptIn: true },
                    select: { email: true },
                });
                recipients = leads.map(l => ({ email: l.email }));
                break;
            }
            case 'custom': {
                if (!customEmails || !Array.isArray(customEmails) || customEmails.length === 0) {
                    return NextResponse.json(
                        { success: false, error: 'customEmails array is required for custom audience' },
                        { status: 400 }
                    );
                }
                recipients = customEmails.map((e: string) => ({ email: e.trim().toLowerCase() }));
                break;
            }
            case 'all':
            default: {
                const [users, leads, optedOut] = await Promise.all([
                    // Excludes the automated sender profile (role 'system',
                    // lib/system-messages.ts): a platform identity, not a
                    // person, and never a broadcast recipient.
                    prisma.userProfile.findMany({ where: MAILABLE_USER_PROFILES, select: { email: true, firstName: true } }),
                    prisma.emailLead.findMany({ where: { isSubscribed: true, isSuppressed: false }, select: { email: true } }),
                    loadOptedOutEmails(),
                ]);
                const seen = new Set<string>();
                for (const u of users) {
                    const key = u.email.toLowerCase();
                    if (optedOut.has(key)) continue;
                    if (!seen.has(key)) { seen.add(key); recipients.push(u); }
                }
                for (const l of leads) {
                    const key = l.email.toLowerCase();
                    if (!seen.has(key)) { seen.add(key); recipients.push({ email: l.email }); }
                }
                break;
            }
        }

        if (recipients.length === 0) {
            return NextResponse.json(
                { success: false, error: 'No recipients found for this audience' },
                { status: 400 }
            );
        }

        // ── Create broadcast + recipients in DB ──
        const broadcast = await prisma.emailBroadcast.create({
            data: {
                subject,
                body,
                audience,
                audienceCount: recipients.length,
                status: 'sending',
                recipients: {
                    create: recipients.map(r => ({
                        email: r.email,
                        firstName: r.firstName || null,
                    })),
                },
            },
        });

        // ── Execute send (fire-and-forget for large lists) ──
        // For small lists, we send synchronously and return the result.
        // For large lists (>50), we start the send in the background.
        if (recipients.length <= 50) {
            const result = await executeBroadcast(broadcast.id);
            return NextResponse.json({
                success: true,
                ...result,
            });
        }

        // Fire-and-forget for large audiences
        executeBroadcast(broadcast.id).catch(err => {
            console.error(`[Broadcast ${broadcast.id}] Background send error:`, err);
        });

        return NextResponse.json({
            success: true,
            broadcastId: broadcast.id,
            message: `Broadcasting to ${recipients.length} recipients in the background. Check the History tab for progress.`,
            total: recipients.length,
            status: 'sending',
        });
    } catch (error) {
        console.error('[Admin Email Send] Error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to send broadcast' },
            { status: 500 }
        );
    }
}
