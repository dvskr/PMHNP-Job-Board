/**
 * GET /api/cron/embedding-drift-check
 *
 * Daily trip-wire that catches silent regressions in the candidate
 * embedding pipeline. Compares the number of profiles that SHOULD have
 * embeddings (visible job_seeker profiles whose concatenated embedder
 * text is ≥ 20 chars — same threshold as the embedder skips at) against
 * the number that DO have embeddings.
 *
 * If the drift exceeds DRIFT_THRESHOLD_PCT we send a Discord alert. The
 * alert is throttled to once per 30 minutes per the
 * sendCronFailureAlert helper, so a sustained outage doesn't spam.
 *
 * Common ways drift can creep in even with the auto-refresh wired up:
 *   - INNGEST_EVENT_KEY unset in Vercel env → inngest.send() no-ops
 *     silently and new edits never enqueue.
 *   - Inngest dashboard outage / quota exhaustion.
 *   - A schema change adds an embedder-relevant field that nothing in
 *     the API layer fires the event for.
 *   - A bulk DB operation (e.g. backfill restoring profileVisible=true
 *     on a batch) doesn't go through the API layer.
 *
 * When alerted: run the manual backfill once to catch up.
 *   npm run backfill:embeddings -- --env=prod --candidates
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { verifyCronOrAdmin } from '@/lib/auth/verify-cron-or-admin';
import { sendCronFailureAlert } from '@/lib/discord-notifier';

// Above this %, we alert. 15% gives the auto-refresh ~30s of breathing
// room (Inngest throttle window) for several concurrent edits without
// firing a false positive, while still catching real drift inside a day.
const DRIFT_THRESHOLD_PCT = 15;

// Below this absolute count, percentages are meaningless. Don't alert
// if there are only a handful of eligible profiles (early days, after
// a cleanup, etc.).
const MIN_ELIGIBLE_FOR_ALERT = 25;

interface DriftRow {
    eligible_total: number;
    embedded_total: number;
    eligible_and_embedded: number;
}

export async function GET(req: Request): Promise<NextResponse> {
    const log = logger.withContext({ cron: 'embedding-drift-check' });

    const authError = await verifyCronOrAdmin(req);
    if (authError) return authError;

    try {
        // The embedder builds text from headline + yearsExperience +
        // certifications + licenseStates + specialties + skills + bio
        // (lib/ai/vector-search.ts:buildCandidateEmbeddingText). We don't
        // re-implement that exactly in SQL — instead we approximate
        // "eligible" as "has at least one of the heavy fields populated."
        // A 1-char headline still gets rejected by the 20-char gate but
        // that's a much smaller class than profiles with literally
        // nothing in them.
        const [row] = await prisma.$queryRawUnsafe<DriftRow[]>(`
            WITH eligible AS (
                SELECT up.supabase_id
                FROM user_profiles up
                WHERE up.profile_visible = true
                  AND up.deleted_at IS NULL
                  AND up.role = 'job_seeker'
                  AND up.open_to_offers = true
                  AND (
                    LENGTH(COALESCE(up.headline, '')) +
                    LENGTH(COALESCE(up.bio, '')) +
                    LENGTH(COALESCE(up.specialties, '')) +
                    LENGTH(COALESCE(up.certifications, '')) +
                    LENGTH(COALESCE(up.license_states, ''))
                  ) >= 20
            )
            SELECT
                (SELECT COUNT(*) FROM eligible)::int                          AS eligible_total,
                (SELECT COUNT(*) FROM candidate_embeddings)::int              AS embedded_total,
                (SELECT COUNT(*)::int FROM eligible e
                   WHERE EXISTS (
                     SELECT 1 FROM candidate_embeddings ce
                     WHERE ce.supabase_id = e.supabase_id
                   )
                ) AS eligible_and_embedded;
        `);

        const eligible = row?.eligible_total ?? 0;
        const embedded = row?.embedded_total ?? 0;
        const overlap = row?.eligible_and_embedded ?? 0;
        const missing = Math.max(0, eligible - overlap);
        const driftPct = eligible > 0 ? Math.round((missing / eligible) * 100) : 0;

        log.info('Embedding drift snapshot', {
            eligible_total: eligible,
            embedded_total: embedded,
            eligible_and_embedded: overlap,
            missing,
            driftPct,
            thresholdPct: DRIFT_THRESHOLD_PCT,
        });

        const shouldAlert =
            eligible >= MIN_ELIGIBLE_FOR_ALERT && driftPct > DRIFT_THRESHOLD_PCT;

        if (shouldAlert) {
            // Reuse the cron-failure pipe — it has the right dedupe
            // window (30 min) and sanitization so we won't spam if the
            // drift sticks around between runs.
            const summary =
                `Embedding drift ${driftPct}% (${missing}/${eligible} eligible profiles unembedded). ` +
                `Embedded rows total: ${embedded}. ` +
                `Run: npm run backfill:embeddings -- --env=prod --candidates`;
            await sendCronFailureAlert('embedding-drift-check', new Error(summary), {
                eligible,
                embedded,
                missing,
                driftPct,
            });
            log.warn('Embedding drift exceeded threshold — alert sent');
        }

        return NextResponse.json({
            ok: true,
            eligible,
            embedded,
            overlap,
            missing,
            driftPct,
            thresholdPct: DRIFT_THRESHOLD_PCT,
            alerted: shouldAlert,
        });
    } catch (err) {
        log.error('embedding-drift-check failed', err);
        await sendCronFailureAlert('embedding-drift-check', err).catch(() => {});
        return NextResponse.json({ error: 'drift check failed' }, { status: 500 });
    }
}
