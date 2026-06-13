import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { verifyCronOrAdmin } from '@/lib/auth/verify-cron-or-admin';
import { sendCronFailureAlert, sendDiscordMessage } from '@/lib/discord-notifier';
import { withCronTracking } from '@/lib/cron/track';

export const maxDuration = 60;

/**
 * Daily DSAR (Data Subject Access Request) watchdog.
 *
 * The /api/data-request endpoint auto-executes 'deletion' and 'access'
 * requests, but the other GDPR/CCPA types (correction, portability, object,
 * restrict, opt_out_sale) require a human to act and just sit at
 * status='in_progress'/'received'. Nothing else reads the data_requests table,
 * so those would silently miss their regulatory deadline (dueBy).
 *
 * This cron surfaces every still-open request — loudly for any that are overdue
 * or due within 3 days — via Discord so they can't fall through the cracks.
 */
const DUE_SOON_DAYS = 3;

export async function GET(request: NextRequest) {
    const authError = await verifyCronOrAdmin(request);
    if (authError) return authError;

    try {
        return await withCronTracking('dsar-overdue', async () => {
            const now = new Date();
            const dueSoonCutoff = new Date(now.getTime() + DUE_SOON_DAYS * 24 * 60 * 60 * 1000);

            const open = await prisma.dataRequest.findMany({
                where: { status: { notIn: ['completed', 'rejected'] } },
                orderBy: { dueBy: 'asc' },
                select: { id: true, type: true, status: true, jurisdiction: true, dueBy: true, createdAt: true },
            });

            const overdue = open.filter((r) => r.dueBy.getTime() < now.getTime());
            const dueSoon = open.filter((r) => r.dueBy.getTime() >= now.getTime() && r.dueBy.getTime() < dueSoonCutoff.getTime());

            // Only ping Discord when there's something a human must act on —
            // don't post a "0 open" message every day.
            if (overdue.length > 0 || dueSoon.length > 0) {
                const fmt = (r: typeof open[number]) =>
                    `• \`${r.type}\` (${r.jurisdiction ?? 'n/a'}) — due ${r.dueBy.toISOString().slice(0, 10)} — status ${r.status} — id ${r.id.slice(0, 8)}`;
                const lines: string[] = [];
                if (overdue.length) {
                    lines.push(`🚨 **${overdue.length} OVERDUE DSAR${overdue.length > 1 ? 's' : ''}** (past regulatory deadline):`);
                    lines.push(...overdue.slice(0, 15).map(fmt));
                }
                if (dueSoon.length) {
                    lines.push(`⚠️ **${dueSoon.length} DSAR${dueSoon.length > 1 ? 's' : ''} due within ${DUE_SOON_DAYS} days**:`);
                    lines.push(...dueSoon.slice(0, 15).map(fmt));
                }
                lines.push(`(${open.length} total open requests — review in the data_requests table.)`);
                await sendDiscordMessage(lines.join('\n'));
            }

            logger.info('dsar-overdue complete', { open: open.length, overdue: overdue.length, dueSoon: dueSoon.length });

            return {
                response: NextResponse.json({
                    success: true,
                    open: open.length,
                    overdue: overdue.length,
                    dueSoon: dueSoon.length,
                    timestamp: now.toISOString(),
                }),
                metrics: { open: open.length, overdue: overdue.length, dueSoon: dueSoon.length },
            };
        });
    } catch (err) {
        await sendCronFailureAlert('dsar-overdue', err);
        logger.error('Cron dsar-overdue error', err);
        return NextResponse.json({ error: 'DSAR overdue check failed' }, { status: 500 });
    }
}
