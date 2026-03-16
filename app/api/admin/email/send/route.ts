import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireApiAdmin } from '@/lib/auth/require-api-admin';
import { executeBroadcast } from '@/lib/broadcast-sender';

/**
 * POST /api/admin/email/send
 * Create and execute an email broadcast.
 *
 * Body: { subject, body, audience, customEmails? }
 */
export async function POST(req: Request) {
    const authError = await requireApiAdmin();
    if (authError) return authError;

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
            case 'job_seekers': {
                recipients = await prisma.userProfile.findMany({
                    where: { role: 'job_seeker' },
                    select: { email: true, firstName: true },
                });
                break;
            }
            case 'employers': {
                recipients = await prisma.userProfile.findMany({
                    where: { role: 'employer' },
                    select: { email: true, firstName: true },
                });
                break;
            }
            case 'subscribers': {
                const leads = await prisma.emailLead.findMany({
                    where: { isSubscribed: true },
                    select: { email: true },
                });
                recipients = leads.map(l => ({ email: l.email }));
                break;
            }
            case 'newsletter': {
                const leads = await prisma.emailLead.findMany({
                    where: { isSubscribed: true, newsletterOptIn: true },
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
                const [users, leads] = await Promise.all([
                    prisma.userProfile.findMany({ select: { email: true, firstName: true } }),
                    prisma.emailLead.findMany({ where: { isSubscribed: true }, select: { email: true } }),
                ]);
                const seen = new Set<string>();
                for (const u of users) {
                    const key = u.email.toLowerCase();
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
