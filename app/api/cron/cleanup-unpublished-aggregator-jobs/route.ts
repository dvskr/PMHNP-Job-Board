/**
 * Unpublished aggregator-job retention cron.
 *
 * Aggregator rows that get unpublished (source vanished, dead link, quality
 * gate, freshness decay) used to sit in `jobs` forever. The one-time purge
 * (tmp/delete-unpublished-aggregator-jobs.ts, ran 2026-08-10) cleared the
 * historical backlog; this cron keeps the estate drained going forward on the
 * SAME selection contract, plus a 30-day hold.
 *
 * WHY `updated_at` IS A SOUND "LAST TOUCH" SIGNAL: the job page's view-count
 * bump moved to raw SQL on 2026-08-07 (app/jobs/[slug]/page.tsx), and the one
 * remaining Prisma-side viewCount increment (GET /api/jobs/[id]) is gated to
 * isPublished: true rows, so page views never bump @updatedAt on a row this
 * predicate can match; the only writers left on an unpublished aggregator row
 * are pipeline decisions. And a revived job is republished, which drops it
 * out of the is_published = false predicate entirely. Therefore updated_at on
 * a row this predicate matches is effectively the row's unpublish time.
 *
 * WHY 30 DAYS: deliberate SEO behavior, not caution theater. An unpublished
 * row serves a 410 tombstone (app/jobs/[slug] + the middleware job-410
 * handler), and holding the row 30 days lets crawlers process the gone signal
 * before the URL decays to 404. Delete too early and Google is still
 * recrawling a URL we can no longer answer for by name.
 *
 * SELECTION GUARDS, the contract inherited from the one-time purge script.
 * Do not widen any of these:
 *   - is_published = false
 *   - employer_jobs relation ABSENT AND source_type <> 'employer'. Both
 *     checks, defense in depth: a handful of legacy employer rows lack the
 *     relation, and either signal alone must be enough to protect a row.
 *   - source_type IS NOT NULL: unknown provenance is kept.
 *   - rows with ANY on-platform application are KEPT: deleting them would
 *     cascade away candidates' application history. Skipped rows surface in
 *     metrics as protectedApplications so the guard is visible in cron_runs.
 *   - saved_jobs has NO FK to jobs, so matching bookmark rows are deleted in
 *     the same transaction as each job batch, scoped to the ids the batch
 *     actually removed (bookmarksDeleted in metrics).
 *
 * Everything else is covered at the DB level: cascades on apply clicks, view
 * events, health checks, embeddings, recommendations, screening questions and
 * reports; SetNull on conversations/messages.
 *
 * Batching follows cleanup-rejected-jobs: fixed-size batches selected by a
 * raw-SQL LIMIT subquery, a hard batch cap, and a wall-clock budget that
 * refuses to START a batch it cannot finish, so the handler always returns
 * under its own power and withCronTracking always writes the finish row.
 * Idempotent + resumable by construction: the predicate is a time window, not
 * a cursor or offset, so a truncated run leaves the remainder matching the
 * same predicate and repeated invocations converge.
 *
 * ?dryRun=1 reports exactly what a real run would delete (count + breakdown
 * by sourceProvider) and writes nothing, not even a cron_runs row.
 */
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { verifyCronOrAdmin } from '@/lib/auth/verify-cron-or-admin';
import { sendCronFailureAlert } from '@/lib/discord-notifier';
import { withCronTracking } from '@/lib/cron/track';

export const maxDuration = 300; // 5 minutes of headroom; TIME_BUDGET_MS below
// is the real stop, this only guarantees the budget can be honoured instead
// of the platform killing the run first.

const CRON_NAME = 'cleanup-unpublished-aggregator-jobs';

const RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Rows per batch. Deliberately far smaller than cleanup-rejected-jobs: each
 * job delete fans out through FK cascades (view events, apply clicks, health
 * checks, embeddings, recommendations, screening questions, reports), so the
 * per-row write cost is a multiple of a flat rejected_jobs delete. 500 keeps
 * each statement a short transaction on the pooler.
 */
const BATCH_SIZE = 500;

/**
 * Hard cap on batches per invocation; the primary bound on one run's write
 * volume. The cap times BATCH_SIZE is orders of magnitude above the steady
 * daily accumulation, so even the backlog left by a multi-week outage
 * converges within a run or two. Leftovers roll into the next daily run.
 */
const MAX_BATCHES = 20;

/** Wall-clock backstop, comfortably inside maxDuration so the finish row is always written. */
const TIME_BUDGET_MS = 240_000;

/** Breathing room between batches so a drain burst doesn't starve live traffic. */
const BATCH_PAUSE_MS = 50;

type StopReason = 'drained' | 'batch-cap' | 'time-budget';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Prisma-side mirror of the raw-SQL selection guards. Used by the dry-run
 * report and the protectedApplications metric; the delete itself carries the
 * same predicate inline in SQL. Keep the two in lockstep.
 */
function purgePredicate(cutoff: Date): Prisma.JobWhereInput {
    return {
        isPublished: false,
        employerJobs: { is: null },
        NOT: { sourceType: 'employer' },
        sourceType: { not: null },
        jobApplications: { none: {} },
        updatedAt: { lt: cutoff },
    };
}

/** Rows the application guard is protecting: same window, but WITH applications. */
function protectedPredicate(cutoff: Date): Prisma.JobWhereInput {
    return {
        ...purgePredicate(cutoff),
        jobApplications: { some: {} },
    };
}

interface BatchResult {
    jobsDeleted: number;
    bookmarksDeleted: number;
}

/**
 * Upper bound for one batch transaction. Prisma's interactive-transaction
 * default (5s) is too tight for a cascade-heavy 500-row delete on a bad day;
 * this stays far inside TIME_BUDGET_MS so a stuck batch surfaces as one
 * failed run, not a platform kill.
 */
const BATCH_TX_TIMEOUT_MS = 120_000;

/**
 * Delete one batch of expired rows (oldest unpublish first) together with
 * their bookmark rows, atomically, in one short transaction of three
 * statements:
 *
 *   1. Lock up to LIMIT candidates: FOR UPDATE SKIP LOCKED.
 *   2. DELETE the locked rows, RE-ASSERTING every selection guard, and
 *      RETURNING the ids actually removed.
 *   3. DELETE saved_jobs rows for exactly the ids step 2 removed.
 *
 * Step 2 re-asserts the guards instead of trusting the locked selection,
 * mirroring how the one-time purge script re-asserted them inside deleteMany.
 * Under READ COMMITTED the selection's NOT EXISTS subqueries read the
 * statement's snapshot, and its FOR UPDATE only conflicts with lockers still
 * in flight, so an application INSERT that commits in the gap between the
 * selection's snapshot and its lock of that row is invisible to both; delete
 * on the selection alone and the FK cascade silently destroys that committed
 * application. Step 2 runs on a FRESH snapshot taken while we already hold
 * the row locks: it sees every application committed before it, and no new
 * application can attach ahead of it because the FK check's KEY SHARE lock
 * conflicts with our FOR UPDATE and queues behind the transaction. The
 * applications guard therefore holds at delete time, not just at selection
 * time. The re-check can only shrink the batch: a row it excludes stays in
 * place and keeps its bookmarks (step 3 is scoped to the RETURNING set, so it
 * can never orphan-delete bookmarks of a surviving job).
 *
 * The other lock semantics carry over from the selection:
 *   - SKIP LOCKED: an overlapping invocation (admin "Trigger manually" while
 *     the scheduled run is in flight) walks past rows the other run claimed
 *     instead of blocking out its time budget; an in-flight application
 *     INSERT's KEY SHARE lock likewise makes us skip that job this run.
 *   - A concurrently republished row is a new row version, fails the
 *     EvalPlanQual re-check FOR UPDATE performs at lock time, and drops out.
 *
 * No dedicated updated_at index: the is_published index narrows the scan to
 * the unpublished slice first and the residual filter + sort over that slice
 * is small. Revisit only if the unpublished estate grows by orders of
 * magnitude.
 */
async function deleteBatch(cutoff: Date, limit: number): Promise<BatchResult> {
    return prisma.$transaction(
        async (tx) => {
            const doomed = await tx.$queryRaw<Array<{ id: string }>>`
                SELECT id FROM jobs
                WHERE is_published = false
                  AND source_type IS NOT NULL
                  AND source_type <> 'employer'
                  AND NOT EXISTS (SELECT 1 FROM employer_jobs ej WHERE ej.job_id = jobs.id)
                  AND NOT EXISTS (SELECT 1 FROM job_applications ja WHERE ja.job_id = jobs.id)
                  AND updated_at < ${cutoff}
                ORDER BY updated_at ASC
                LIMIT ${limit}
                FOR UPDATE SKIP LOCKED
            `;
            if (doomed.length === 0) {
                return { jobsDeleted: 0, bookmarksDeleted: 0 };
            }

            const doomedIds = doomed.map((row) => row.id);
            const deletedRows = await tx.$queryRaw<Array<{ id: string }>>`
                DELETE FROM jobs
                WHERE id IN (${Prisma.join(doomedIds)})
                  AND is_published = false
                  AND source_type IS NOT NULL
                  AND source_type <> 'employer'
                  AND NOT EXISTS (SELECT 1 FROM employer_jobs ej WHERE ej.job_id = jobs.id)
                  AND NOT EXISTS (SELECT 1 FROM job_applications ja WHERE ja.job_id = jobs.id)
                  AND updated_at < ${cutoff}
                RETURNING id
            `;
            if (deletedRows.length === 0) {
                return { jobsDeleted: 0, bookmarksDeleted: 0 };
            }

            const deletedIds = deletedRows.map((row) => row.id);
            const bookmarksDeleted = await tx.$executeRaw`
                DELETE FROM saved_jobs
                WHERE job_id IN (${Prisma.join(deletedIds)})
            `;

            return { jobsDeleted: deletedIds.length, bookmarksDeleted };
        },
        { timeout: BATCH_TX_TIMEOUT_MS },
    );
}

/**
 * ?dryRun=1: report exactly what a real run would delete, write NOTHING.
 * Deliberately outside withCronTracking so a dry run leaves no cron_runs row
 * either; it is a pure read for the operator.
 */
async function dryRunReport(cutoff: Date): Promise<NextResponse> {
    const where = purgePredicate(cutoff);

    const [grouped, protectedApplications, doomed] = await Promise.all([
        prisma.job.groupBy({
            by: ['sourceProvider'],
            where,
            _count: { _all: true },
        }),
        prisma.job.count({ where: protectedPredicate(cutoff) }),
        prisma.job.findMany({ where, select: { id: true } }),
    ]);

    // saved_jobs has no relation to Job in the Prisma schema (no FK), so the
    // bookmark count has to go through explicit ids.
    const bookmarksToDelete = doomed.length
        ? await prisma.savedJob.count({ where: { jobId: { in: doomed.map((j) => j.id) } } })
        : 0;

    const byProvider = Object.fromEntries(
        [...grouped]
            .sort((a, b) => b._count._all - a._count._all)
            .map((g) => [g.sourceProvider ?? 'unknown', g._count._all]),
    );

    logger.info('cleanup-unpublished-aggregator-jobs dry run', {
        wouldDelete: doomed.length,
        protectedApplications,
        bookmarksToDelete,
    });

    return NextResponse.json({
        success: true,
        dryRun: true,
        wouldDelete: doomed.length,
        byProvider,
        protectedApplications,
        bookmarksToDelete,
        retentionDays: RETENTION_DAYS,
        cutoff: cutoff.toISOString(),
        timestamp: new Date().toISOString(),
    });
}

export async function GET(request: NextRequest) {
    const authError = await verifyCronOrAdmin(request);
    if (authError) return authError;

    // new URL(), not request.nextUrl: works identically for the Vercel cron
    // invocation and plain Request objects in tests.
    const isDryRun = new URL(request.url).searchParams.get('dryRun') === '1';

    try {
        if (isDryRun) {
            return await dryRunReport(new Date(Date.now() - RETENTION_DAYS * DAY_MS));
        }

        return await withCronTracking(CRON_NAME, async () => {
            const startedAt = Date.now();
            const cutoff = new Date(startedAt - RETENTION_DAYS * DAY_MS);

            let deleted = 0;
            let bookmarksDeleted = 0;
            let batches = 0;
            let slowestBatchMs = 0;
            let stopReason: StopReason = 'batch-cap';

            while (batches < MAX_BATCHES) {
                const elapsed = Date.now() - startedAt;
                // Two conditions, not one: `elapsed >= budget` alone would let
                // a batch START at 239s and run into the connection's
                // statement timeout, pushing the handler past maxDuration and
                // losing the finish row. So we also refuse to start a batch
                // that a run as slow as the slowest observed one would not
                // finish inside the budget.
                if (elapsed >= TIME_BUDGET_MS || elapsed + slowestBatchMs >= TIME_BUDGET_MS) {
                    stopReason = 'time-budget';
                    break;
                }

                const batchStartedAt = Date.now();
                const batch = await deleteBatch(cutoff, BATCH_SIZE);
                slowestBatchMs = Math.max(slowestBatchMs, Date.now() - batchStartedAt);
                batches++;
                deleted += batch.jobsDeleted;
                bookmarksDeleted += batch.bookmarksDeleted;

                // Drained only on an empty batch, never on a merely short one:
                // SKIP LOCKED can shorten a batch while rows remain, and
                // reporting hasMore:false there would be a lie. One extra
                // empty DELETE is cheap and buys an honest answer.
                if (batch.jobsDeleted === 0) {
                    stopReason = 'drained';
                    break;
                }

                await sleep(BATCH_PAUSE_MS);
            }

            const hasMore = stopReason !== 'drained';

            // Guard visibility: rows inside the window this run left alone
            // because a candidate applied on-platform. One cheap count over
            // the unpublished slice, recorded every run so the protection is
            // auditable in cron_runs rather than silently assumed.
            const protectedApplications = await prisma.job.count({
                where: protectedPredicate(cutoff),
            });

            const elapsedMs = Date.now() - startedAt;

            logger.info('cleanup-unpublished-aggregator-jobs complete', {
                deleted,
                bookmarksDeleted,
                protectedApplications,
                batches,
                hasMore,
                stopReason,
                slowestBatchMs,
                elapsedMs,
            });

            return {
                response: NextResponse.json({
                    success: true,
                    dryRun: false,
                    deleted,
                    bookmarksDeleted,
                    protectedApplications,
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
                    bookmarksDeleted,
                    protectedApplications,
                    batches,
                    batchSize: BATCH_SIZE,
                    hasMore,
                    stopReason,
                    retentionDays: RETENTION_DAYS,
                    slowestBatchMs,
                    elapsedMs,
                },
            };
        });
    } catch (error) {
        await sendCronFailureAlert(CRON_NAME, error);
        logger.error('Cron cleanup-unpublished-aggregator-jobs error', error);
        return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
    }
}
