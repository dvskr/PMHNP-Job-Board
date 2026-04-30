import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

/**
 * GET /api/job-alerts/confirm?token=<confirmation_token>
 *
 * Closes the double-opt-in loop: looks up the alert by confirmation
 * token, marks it confirmed + active, clears the token so the link
 * can't be replayed, then redirects to a friendly /job-alerts/confirmed
 * page.
 *
 * Idempotent — clicking a stale (already-consumed) link redirects to
 * the confirmed page anyway so users don't see an error.
 */
export async function GET(request: NextRequest) {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');
    const base = process.env.NEXT_PUBLIC_BASE_URL || `${url.protocol}//${url.host}`;

    if (!token) {
        return NextResponse.redirect(`${base}/job-alerts/confirmed?status=missing`, 302);
    }

    try {
        const alert = await prisma.jobAlert.findUnique({
            where: { confirmationToken: token },
            select: { id: true, confirmedAt: true, token: true },
        });

        if (!alert) {
            // Maybe already-confirmed (token was cleared) — try the
            // public unsubscribe token as a fallback so the link from
            // a *previous* email also lands on the success page.
            const fallback = await prisma.jobAlert.findUnique({
                where: { token },
                select: { confirmedAt: true },
            });
            if (fallback?.confirmedAt) {
                return NextResponse.redirect(`${base}/job-alerts/confirmed?status=ok`, 302);
            }
            return NextResponse.redirect(`${base}/job-alerts/confirmed?status=invalid`, 302);
        }

        if (!alert.confirmedAt) {
            await prisma.jobAlert.update({
                where: { id: alert.id },
                data: {
                    isActive: true,
                    confirmedAt: new Date(),
                    confirmationToken: null,
                },
            });
        }

        return NextResponse.redirect(`${base}/job-alerts/confirmed?status=ok`, 302);
    } catch (err) {
        logger.error('Job alert confirm failed', err);
        return NextResponse.redirect(`${base}/job-alerts/confirmed?status=error`, 302);
    }
}
