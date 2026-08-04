/**
 * GET /api/cron/recommendation-deadman
 *
 * Dead-man tripwire for the candidate recommendation pipeline (distribution
 * audit A5). The recommendations-daily Inngest cron (lib/inngest/functions/
 * recommendations.ts) writes a fresh candidate_recommendations batch every day
 * at 09:00 UTC. When that pipeline silently dies (it has, in prod), nothing
 * alerted — dashboards just fell back to rule-based recs and the paid AI
 * surface degraded invisibly.
 *
 * Trip condition: the NEWEST candidate_recommendations row is older than
 * STALE_AFTER_HOURS while candidate embeddings exist. Requiring embeddings
 * prevents false alarms in the empty-pipeline case (no eligible candidates
 * means no batches is correct, not broken).
 *
 * Modeled on app/api/cron/embedding-drift-check/route.ts, including its
 * Discord alert helper (sendCronFailureAlert has the right 30-minute dedupe
 * window so a sustained outage doesn't spam).
 *
 * Common causes when this trips:
 *   - INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY unset or rotated in Vercel env.
 *   - The recommendations-daily function erroring out in the Inngest
 *     dashboard (check its run history first).
 *   - A schema/selector change that makes every candidate ineligible.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { verifyCronOrAdmin } from '@/lib/auth/verify-cron-or-admin';
import { sendCronFailureAlert } from '@/lib/discord-notifier';
import { withCronTracking } from '@/lib/cron/track';

// The daily batch lands at 09:00 UTC; 48h means one fully-missed day plus
// slack for a late run before we page. Tighter than 48h would false-positive
// on a single slow/retried run; looser would hide a real outage for days.
const STALE_AFTER_HOURS = 48;

export async function GET(req: Request): Promise<NextResponse> {
    const log = logger.withContext({ cron: 'recommendation-deadman' });

    const authError = await verifyCronOrAdmin(req);
    if (authError) return authError;

    try {
        return await withCronTracking('recommendation-deadman', async () => {
            const [newest, embeddedCandidates] = await Promise.all([
                prisma.candidateRecommendation.findFirst({
                    orderBy: { createdAt: 'desc' },
                    select: { createdAt: true },
                }),
                prisma.candidateEmbedding.count(),
            ]);

            const newestAgeHours = newest
                ? Math.round((Date.now() - newest.createdAt.getTime()) / (60 * 60 * 1000))
                : null;

            // Embeddings exist (there ARE candidates to recommend for) but the
            // newest batch is stale or the table is empty → pipeline is dead.
            const shouldAlert =
                embeddedCandidates > 0 &&
                (newestAgeHours === null || newestAgeHours > STALE_AFTER_HOURS);

            log.info('Recommendation dead-man snapshot', {
                newestAgeHours,
                embeddedCandidates,
                staleAfterHours: STALE_AFTER_HOURS,
            });

            if (shouldAlert) {
                const staleness = newestAgeHours === null
                    ? 'candidate_recommendations is EMPTY'
                    : `newest candidate_recommendations row is ${newestAgeHours}h old (threshold ${STALE_AFTER_HOURS}h)`;
                const summary =
                    `Recommendation pipeline dead-man tripped: ${staleness} while ` +
                    `${embeddedCandidates} candidate embeddings exist. ` +
                    `Check the Inngest dashboard run history for recommendations-daily ` +
                    `and verify INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY in Vercel env.`;
                await sendCronFailureAlert('recommendation-deadman', new Error(summary), {
                    newestAgeHours: newestAgeHours ?? undefined,
                    embeddedCandidates,
                });
                log.warn('Recommendation pipeline stale — alert sent');
            }

            return {
                response: NextResponse.json({
                    ok: true,
                    newestAgeHours,
                    embeddedCandidates,
                    staleAfterHours: STALE_AFTER_HOURS,
                    alerted: shouldAlert,
                }),
                metrics: {
                    newestAgeHours,
                    embeddedCandidates,
                    alerted: shouldAlert,
                },
            };
        });
    } catch (err) {
        log.error('recommendation-deadman failed', err);
        await sendCronFailureAlert('recommendation-deadman', err).catch(() => {});
        return NextResponse.json({ error: 'deadman check failed' }, { status: 500 });
    }
}
