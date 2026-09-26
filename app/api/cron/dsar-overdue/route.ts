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

/**
 * Discord rejects a webhook whose `content` exceeds 2000 characters. Left
 * unguarded, 30 open requests (up to 33 lines of ~90 characters) pushed the
 * joined message past the cap, the webhook answered 400, sendDiscordMessage
 * logged and returned false, and this cron still reported success: the loudest
 * regulatory alarm in the system went silent exactly when it had the most to
 * say. 1900 leaves room for the chunk counter suffix.
 */
const DISCORD_CONTENT_LIMIT = 1900;

/**
 * Split pre-formatted lines into messages that fit Discord's content cap.
 *
 * Splits on line boundaries so an entry is never cut in half. A single line
 * longer than the cap (not possible with the formatter below, but cheap to
 * defend) is hard-truncated rather than dropped.
 */
function chunkLines(lines: string[], limit: number): string[] {
    const chunks: string[] = [];
    let current = '';
    for (const line of lines) {
        const safeLine = line.length > limit ? `${line.slice(0, limit - 3)}...` : line;
        const candidate = current ? `${current}\n${safeLine}` : safeLine;
        if (candidate.length > limit) {
            if (current) chunks.push(current);
            current = safeLine;
        } else {
            current = candidate;
        }
    }
    if (current) chunks.push(current);
    return chunks;
}

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
            let chunksSent = 0;
            let chunksTotal = 0;
            if (overdue.length > 0 || dueSoon.length > 0) {
                const fmt = (r: typeof open[number]) =>
                    `• \`${r.type}\` (${r.jurisdiction ?? 'n/a'}): due ${r.dueBy.toISOString().slice(0, 10)}, status ${r.status}, id ${r.id.slice(0, 8)}`;
                const lines: string[] = [];
                if (overdue.length) {
                    lines.push(`🚨 **${overdue.length} OVERDUE DSAR${overdue.length > 1 ? 's' : ''}** (past regulatory deadline):`);
                    lines.push(...overdue.slice(0, 15).map(fmt));
                }
                if (dueSoon.length) {
                    lines.push(`⚠️ **${dueSoon.length} DSAR${dueSoon.length > 1 ? 's' : ''} due within ${DUE_SOON_DAYS} days**:`);
                    lines.push(...dueSoon.slice(0, 15).map(fmt));
                }
                lines.push(`(${open.length} total open requests. Review them in the data_requests table.)`);

                const chunks = chunkLines(lines, DISCORD_CONTENT_LIMIT);
                chunksTotal = chunks.length;
                for (const [i, chunk] of chunks.entries()) {
                    const suffix = chunks.length > 1 ? `\n_(${i + 1}/${chunks.length})_` : '';
                    // sendDiscordMessage answers false on a webhook rejection
                    // instead of throwing. Discarding that boolean is what made
                    // this watchdog fail silently.
                    if (await sendDiscordMessage(`${chunk}${suffix}`)) chunksSent++;
                }

                if (chunksSent < chunksTotal) {
                    // Deliberately not thrown: a throw routes to
                    // sendCronFailureAlert, which is the same Discord webhook
                    // that just refused us. Log it and record the shortfall on
                    // the cron_run row so the gap is visible after the fact.
                    logger.error(
                        'dsar-overdue: Discord did not accept the full alert',
                        new Error(`delivered ${chunksSent} of ${chunksTotal} chunks`),
                        { open: open.length, overdue: overdue.length, dueSoon: dueSoon.length },
                    );
                }
            }

            logger.info('dsar-overdue complete', { open: open.length, overdue: overdue.length, dueSoon: dueSoon.length });

            return {
                response: NextResponse.json({
                    success: true,
                    open: open.length,
                    overdue: overdue.length,
                    dueSoon: dueSoon.length,
                    alertChunksSent: chunksSent,
                    alertChunksTotal: chunksTotal,
                    alertDelivered: chunksSent === chunksTotal,
                    timestamp: now.toISOString(),
                }),
                metrics: {
                    open: open.length,
                    overdue: overdue.length,
                    dueSoon: dueSoon.length,
                    alertChunksSent: chunksSent,
                    alertChunksTotal: chunksTotal,
                },
            };
        });
    } catch (err) {
        await sendCronFailureAlert('dsar-overdue', err);
        logger.error('Cron dsar-overdue error', err);
        return NextResponse.json({ error: 'DSAR overdue check failed' }, { status: 500 });
    }
}
