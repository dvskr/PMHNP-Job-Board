/**
 * rejected_jobs retention cron.
 *
 * The table grows continuously (mostly `duplicate_*` rows from per-run dedup
 * tracking) and was unbounded. After 2026-05-06 we have aggregate counts on
 * `source_stats.rejected_by_reason`, so the per-row history only needs to live
 * long enough to support spot-check audits and the occasional regex
 * re-classification — 30 days is plenty.
 *
 * Forward-only delete; recoverable from Supabase point-in-time backups if the
 * retention window ever needs to be extended retroactively.
 *
 * 2026-08-13 — timeout fix. The original implementation issued ONE unbounded
 * `deleteMany({ where: { createdAt: { lt: cutoff } } })`. Once the backlog grew
 * past what a single statement could clear inside the function window, every
 * invocation was killed mid-delete: cron_runs recorded a start row for every
 * run and never a finish, so nothing was ever reclaimed and the failure was
 * invisible (no finished_at, no duration, no error). The delete is now chopped
 * into fixed-size batches with a hard cap on batches per invocation and a
 * wall-clock budget well inside maxDuration, so the handler always returns
 * under its own power and withCronTracking always gets to write the finish row.
 *
 * Idempotent + resumable by construction: the predicate is a time window, not
 * an offset or a cursor, so a partial run leaves the remainder matching the
 * same predicate and the next invocation picks it up. Repeated invocations
 * converge; a run with nothing to do deletes 0 rows and reports hasMore:false.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { verifyCronOrAdmin } from '@/lib/auth/verify-cron-or-admin';
import { sendCronFailureAlert } from '@/lib/discord-notifier';
import { withCronTracking } from '@/lib/cron/track';

export const maxDuration = 300; // 5 minutes — matches the other purge crons; the
// internal TIME_BUDGET_MS below is the real stop, this is only headroom so the
// budget can actually be honoured instead of the platform killing us first.

const RETENTION_DAYS = 30;

/**
 * Rows per DELETE. Small enough that each statement is a short transaction
 * (the batch-selection index scan alone measures in the tens of milliseconds),
 * so we never hold a long write transaction against a live table.
 */
const BATCH_SIZE = 5_000;

/**
 * Hard cap on batches per invocation. This, not the clock, is the primary
 * bound: it keeps one run's write volume (and the WAL/bloat it generates on a
 * shared database) predictable regardless of how fast the database happens to
 * be. Leftovers roll into the next scheduled run.
 */
const MAX_BATCHES = 100;

/** Wall-clock backstop, comfortably inside maxDuration so the finish row is always written. */
const TIME_BUDGET_MS = 240_000;

/** Breathing room between batches so a drain burst doesn't starve live traffic. */
const BATCH_PAUSE_MS = 50;

type StopReason = 'drained' | 'batch-cap' | 'time-budget';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Delete one batch of expired rows, oldest first.
 *
 * The subquery + LIMIT is what bounds the statement: Postgres range-scans
 * `rejected_jobs_created_at_idx`, stops at BATCH_SIZE, and the outer delete
 * resolves those ids by primary key. Returns the number of rows deleted.
 *
 * FOR UPDATE SKIP LOCKED so an overlapping invocation (admin "Trigger
 * manually" from /admin/cron while the scheduled run is in flight) walks past
 * the rows the other run already claimed instead of blocking on them and
 * burning its whole time budget waiting.
 */
async function deleteBatch(cutoff: Date, limit: number): Promise<number> {
    return prisma.$executeRaw`
        DELETE FROM rejected_jobs
        WHERE id IN (
            SELECT id FROM rejected_jobs
            WHERE created_at < ${cutoff}
            ORDER BY created_at ASC
            LIMIT ${limit}
            FOR UPDATE SKIP LOCKED
        )
    `;
}

export async function GET(request: NextRequest) {
    const authError = await verifyCronOrAdmin(request);
    if (authError) return authError;

    try {
        return await withCronTracking('cleanup-rejected-jobs', async () => {
            const startedAt = Date.now();
            const cutoff = new Date(startedAt - RETENTION_DAYS * 24 * 60 * 60 * 1000);

            let deleted = 0;
            let batches = 0;
            let slowestBatchMs = 0;
            let stopReason: StopReason = 'batch-cap';

            while (batches < MAX_BATCHES) {
                const elapsed = Date.now() - startedAt;
                // Two conditions, not one. Testing only `elapsed >= budget`
                // lets a batch START at 239s and then run to the connection's
                // statement timeout, pushing the handler past maxDuration: the
                // platform kills it, no finish row is written, and we are back
                // to the silent failure this fix exists to remove. So we also
                // refuse to start a batch that a run as slow as the slowest one
                // seen so far would not finish inside the budget. On a healthy
                // database this never binds (batches are far faster than the
                // remaining budget); on a degrading one it lands us safely.
                if (elapsed >= TIME_BUDGET_MS || elapsed + slowestBatchMs >= TIME_BUDGET_MS) {
                    stopReason = 'time-budget';
                    break;
                }

                const batchStartedAt = Date.now();
                const batchDeleted = await deleteBatch(cutoff, BATCH_SIZE);
                slowestBatchMs = Math.max(slowestBatchMs, Date.now() - batchStartedAt);
                batches++;
                deleted += batchDeleted;

                // Drained only on an empty batch, never on a merely short one:
                // SKIP LOCKED can shorten a batch while rows still remain, and
                // reporting hasMore:false there would be a lie. One extra empty
                // DELETE is cheap (index scan finds nothing) and buys an honest
                // answer. Nothing can re-enter the window behind us either:
                // inserts always land at now(), which is newer than the cutoff.
                if (batchDeleted === 0) {
                    stopReason = 'drained';
                    break;
                }

                await sleep(BATCH_PAUSE_MS);
            }

            const hasMore = stopReason !== 'drained';
            const elapsedMs = Date.now() - startedAt;

            // Deliberately no COUNT(*) of the remainder: on a backlog this deep
            // that scan costs more than the work we came to do. `hasMore` falls
            // out of the last batch instead, and errs toward "true" — the only
            // way it reads false is a DELETE that matched nothing.
            logger.info('cleanup-rejected-jobs complete', {
                deleted,
                batches,
                hasMore,
                stopReason,
                slowestBatchMs,
                elapsedMs,
            });

            return {
                response: NextResponse.json({
                    success: true,
                    deleted,
                    batches,
                    batchSize: BATCH_SIZE,
                    hasMore,
                    stopReason,
                    retentionDays: RETENTION_DAYS,
                    cutoff: cutoff.toISOString(),
                    slowestBatchMs,
                    elapsedMs,
                    timestamp: new Date().toISOString(),
                }),
                metrics: {
                    deleted,
                    batches,
                    batchSize: BATCH_SIZE,
                    hasMore,
                    stopReason,
                    retentionDays: RETENTION_DAYS,
                    // Real per-batch write cost, which could only be estimated
                    // before the first live run. Watch this to know whether the
                    // batch cap or the clock is the binding constraint.
                    slowestBatchMs,
                    elapsedMs,
                },
            };
        });
    } catch (error) {
        await sendCronFailureAlert('cleanup-rejected-jobs', error);
        logger.error('Cron cleanup-rejected-jobs error', error);
        return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
    }
}
