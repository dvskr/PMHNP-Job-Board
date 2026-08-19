/**
 * cleanup-unpublished-aggregator-jobs: retention cron for unpublished
 * aggregator rows, built on the batched-delete pattern proven by
 * cleanup-rejected-jobs. These tests pin the properties the cron's safety
 * depends on:
 *
 *   1. selection contract  — every batch carries EVERY guard from the
 *                            one-time purge script (aggregator only,
 *                            provenance known, no employer relation, rows
 *                            with applications kept, bookmarks cleaned in the
 *                            same transaction) plus the 30-day updated_at
 *                            hold — and the DELETE itself re-asserts every
 *                            guard on a fresh snapshot, so the applications
 *                            guard holds at delete time, not just at
 *                            selection time.
 *   2. batch bounding      — a run can never issue an unbounded delete, and
 *                            terminates after a fixed number of batches or
 *                            the wall-clock budget no matter the backlog.
 *   3. resumable/idempotent — the predicate is a time window with no cursor
 *                            or offset; repeated invocations converge.
 *   4. guard visibility    — protectedApplications and bookmarksDeleted are
 *                            recorded in cron_runs, never silently assumed.
 *   5. dry run             — ?dryRun=1 reports what would be deleted and
 *                            writes nothing, not even a cron_runs row.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const BATCH_SIZE = 500;
const MAX_BATCHES = 20;

// File-local prisma mock: the shared tests/setup.ts mock has no $queryRaw,
// $transaction or groupBy surface, and this file must not mutate a shared
// fixture.
vi.mock('@/lib/prisma', () => ({
    prisma: {
        $transaction: vi.fn(),
        job: {
            count: vi.fn(),
            groupBy: vi.fn(),
            findMany: vi.fn(),
        },
        savedJob: {
            count: vi.fn(),
        },
        cronRun: {
            create: vi.fn().mockResolvedValue({ id: 'cron-run-test' }),
            update: vi.fn().mockResolvedValue({}),
        },
    },
}));
vi.mock('@/lib/auth/verify-cron-or-admin', () => ({
    verifyCronOrAdmin: vi.fn().mockResolvedValue(null), // authorized
}));
vi.mock('@/lib/discord-notifier', () => ({
    sendCronFailureAlert: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/logger', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { prisma } from '@/lib/prisma';

// Heavy module graphs (cron routes, prisma, search indexing) can push the
// FIRST dynamic import past the 5s default under full-suite parallelism, and
// these assertions are pure. Budget covers module loading only; every await
// in the tests themselves is mocked. Same treatment as
// tests/api/index-cron-bing-metrics.test.ts.
vi.setConfig({ testTimeout: 30_000 });

const transaction = vi.mocked(prisma.$transaction);
const cronRunCreate = vi.mocked(prisma.cronRun.create);
const cronRunUpdate = vi.mocked(prisma.cronRun.update);

/**
 * The transaction client the route sees inside deleteBatch. Each batch is:
 * SELECT ... FOR UPDATE SKIP LOCKED ($queryRaw), DELETE FROM jobs ...
 * RETURNING id ($queryRaw), DELETE FROM saved_jobs ($executeRaw).
 */
const txQueryRaw = vi.fn();
const txExecuteRaw = vi.fn();

function installTransactionMock() {
    transaction.mockImplementation((async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ $queryRaw: txQueryRaw, $executeRaw: txExecuteRaw })) as never);
}

/**
 * One scripted batch: `jobs` rows come back from the locking selection,
 * `deletedJobs` of them survive the delete-time re-check (defaults to all),
 * and `bookmarks` bookmark rows are removed alongside.
 */
interface ScriptedBatch {
    jobs: number;
    bookmarks: number;
    deletedJobs?: number;
}

let idSeq = 0;
let pendingDeleted: Array<{ id: string }> = [];
let pendingBookmarks = 0;

/**
 * Script the batches a run will see, in order; `fallback` serves once the
 * queue is exhausted (an endless supply of identical batches when the queue
 * starts empty).
 */
function scriptBatches(queue: ScriptedBatch[], fallback: ScriptedBatch = { jobs: 0, bookmarks: 0 }) {
    txQueryRaw.mockImplementation((async (strings: TemplateStringsArray) => {
        const sql = strings.join('?');
        if (/SELECT id FROM jobs/i.test(sql)) {
            const batch = queue.shift() ?? fallback;
            const ids = Array.from({ length: batch.jobs }, () => ({ id: `job-${idSeq++}` }));
            pendingDeleted = ids.slice(0, batch.deletedJobs ?? batch.jobs);
            pendingBookmarks = batch.bookmarks;
            return ids;
        }
        // DELETE FROM jobs ... RETURNING id
        return pendingDeleted;
    }) as never);
    txExecuteRaw.mockImplementation((async () => pendingBookmarks) as never);
}

/** Calls of the given statement kind, as normalized SQL strings. */
function statementCalls(pattern: RegExp, mock: typeof txQueryRaw = txQueryRaw) {
    return mock.mock.calls
        .map((call) => ({
            sql: (call[0] as unknown as string[]).join('?').replace(/\s+/g, ' ').trim(),
            params: call.slice(1),
        }))
        .filter((c) => pattern.test(c.sql));
}

const SELECTION = /SELECT id FROM jobs/i;
const JOB_DELETE = /DELETE FROM jobs/i;

function req(query = ''): Request {
    return new Request(
        `https://example.com/api/cron/cleanup-unpublished-aggregator-jobs${query}`,
        { headers: { authorization: 'Bearer test' } },
    );
}

async function run(query = ''): Promise<Response> {
    const { GET } = await import('@/app/api/cron/cleanup-unpublished-aggregator-jobs/route');
    return GET(req(query) as never);
}

/** Make the inter-batch pause resolve immediately so a full-cap run is instant. */
function stubImmediateTimers() {
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void) => {
        fn();
        return 0;
    }) as never);
}

/** metrics blob handed to cron_runs on the successful finish update. */
function recordedMetrics(): Record<string, unknown> {
    const finish = cronRunUpdate.mock.calls.find(
        (c) => (c[0] as { data?: { success?: boolean } }).data?.success === true,
    );
    expect(finish, 'expected a success update on cron_runs').toBeDefined();
    return (finish![0] as { data: { metrics: Record<string, unknown> } }).data.metrics;
}

describe('cleanup-unpublished-aggregator-jobs cron', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        idSeq = 0;
        pendingDeleted = [];
        pendingBookmarks = 0;
        installTransactionMock();
        cronRunCreate.mockResolvedValue({ id: 'cron-run-test' } as never);
        cronRunUpdate.mockResolvedValue({} as never);
        vi.mocked(prisma.job.count).mockResolvedValue(0 as never);
        vi.mocked(prisma.job.groupBy).mockResolvedValue([] as never);
        vi.mocked(prisma.job.findMany).mockResolvedValue([] as never);
        vi.mocked(prisma.savedJob.count).mockResolvedValue(0 as never);
        stubImmediateTimers();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('selection contract', () => {
        it('the locking selection carries every guard, the LIMIT, and the updated_at cutoff', async () => {
            scriptBatches([{ jobs: 0, bookmarks: 0 }]);

            await run();

            const selections = statementCalls(SELECTION);
            expect(selections.length).toBeGreaterThan(0);
            const { sql, params } = selections[0];
            // Aggregator-only contract from the one-time purge script.
            expect(sql).toMatch(/is_published = false/i);
            expect(sql).toMatch(/source_type IS NOT NULL/i);
            expect(sql).toMatch(/source_type <> 'employer'/i);
            expect(sql).toMatch(/NOT EXISTS \(\s*SELECT 1 FROM employer_jobs/i);
            // Rows with on-platform applications are kept.
            expect(sql).toMatch(/NOT EXISTS \(\s*SELECT 1 FROM job_applications/i);
            // Bounded and time-windowed.
            expect(sql).toMatch(/LIMIT \?/i);
            expect(sql).toMatch(/updated_at < \?/i);
            // Overlapping runs (scheduled + admin manual trigger) must step
            // around each other instead of blocking out the time budget.
            expect(sql).toMatch(/FOR UPDATE SKIP LOCKED/i);

            const [cutoff, limit] = params;
            expect(limit).toBe(BATCH_SIZE);
            expect(cutoff).toBeInstanceOf(Date);
            // 30-day hold on updated_at, measured back from now.
            const ageDays = (Date.now() - (cutoff as Date).getTime()) / 86_400_000;
            expect(ageDays).toBeGreaterThan(29.9);
            expect(ageDays).toBeLessThan(30.1);
        });

        it('the DELETE re-asserts every guard on a fresh snapshot, so the guards hold at delete time', async () => {
            scriptBatches([{ jobs: 3, bookmarks: 1 }, { jobs: 0, bookmarks: 0 }]);

            await run();

            const deletes = statementCalls(JOB_DELETE);
            expect(deletes.length).toBe(1);
            const { sql, params } = deletes[0];
            // Every selection guard again, inside the DELETE itself: an
            // application committed between the selection's snapshot and its
            // row lock is invisible to the selection, and only a delete-time
            // re-check on a fresh snapshot keeps that row (and its
            // candidate's application history) alive.
            expect(sql).toMatch(/is_published = false/i);
            expect(sql).toMatch(/source_type IS NOT NULL/i);
            expect(sql).toMatch(/source_type <> 'employer'/i);
            expect(sql).toMatch(/NOT EXISTS \(\s*SELECT 1 FROM employer_jobs/i);
            expect(sql).toMatch(/NOT EXISTS \(\s*SELECT 1 FROM job_applications/i);
            expect(sql).toMatch(/updated_at < \?/i);
            expect(sql).toMatch(/RETURNING id/i);
            // Scoped to the locked batch, and the same cutoff as the selection.
            expect(params.some((p) => p instanceof Date)).toBe(true);
        });

        it('selection, jobs delete and bookmark delete all run inside one transaction per batch', async () => {
            scriptBatches([{ jobs: 2, bookmarks: 1 }, { jobs: 0, bookmarks: 0 }]);

            await run();

            // 2 batches attempted => 2 transactions; the statements above ran
            // through the transaction client, never the root client.
            expect(transaction).toHaveBeenCalledTimes(2);
            expect(statementCalls(SELECTION).length).toBe(2);
            expect(statementCalls(JOB_DELETE).length).toBe(1);
            expect(txExecuteRaw).toHaveBeenCalledTimes(1);
        });

        it('bookmark cleanup targets exactly the ids the DELETE actually removed', async () => {
            // Selection locks 3 rows; the delete-time re-check protects one
            // (an application landed after selection), so only 2 are removed.
            scriptBatches([{ jobs: 3, deletedJobs: 2, bookmarks: 2 }, { jobs: 0, bookmarks: 0 }]);

            const body = await (await run()).json();

            // Metrics count actual deletes, not the selection size.
            expect(body.deleted).toBe(2);
            expect(body.bookmarksDeleted).toBe(2);

            // The saved_jobs DELETE received exactly the surviving batch's
            // deleted ids: it can never orphan-delete bookmarks of a job the
            // re-check kept.
            const bookmarkCalls = statementCalls(/DELETE FROM saved_jobs/i, txExecuteRaw);
            expect(bookmarkCalls.length).toBe(1);
            const joined = bookmarkCalls[0].params[0] as { values: string[] };
            expect(joined.values).toEqual(['job-0', 'job-1']);
        });

        it('does not touch saved_jobs when the re-check protects the whole batch', async () => {
            scriptBatches([{ jobs: 2, deletedJobs: 0, bookmarks: 0 }]);

            const body = await (await run()).json();

            expect(body.deleted).toBe(0);
            expect(txExecuteRaw).not.toHaveBeenCalled();
        });
    });

    describe('batch bounding', () => {
        it('stops at the batch cap against an effectively infinite backlog', async () => {
            // Every batch comes back full => the backlog never runs dry.
            scriptBatches([], { jobs: BATCH_SIZE, bookmarks: 3 });

            const res = await run();
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(statementCalls(SELECTION).length).toBe(MAX_BATCHES);
            expect(body.batches).toBe(MAX_BATCHES);
            expect(body.deleted).toBe(BATCH_SIZE * MAX_BATCHES);
            expect(body.bookmarksDeleted).toBe(3 * MAX_BATCHES);
            expect(body.stopReason).toBe('batch-cap');
            expect(body.hasMore).toBe(true);
        });

        it('stops on the wall-clock budget before the batch cap when the database is slow', async () => {
            const base = Date.UTC(2026, 7, 19, 4, 30, 0);
            let batchesRun = 0;
            scriptBatches([], { jobs: BATCH_SIZE, bookmarks: 1 });
            const inner = txQueryRaw.getMockImplementation()!;
            txQueryRaw.mockImplementation((async (...args: unknown[]) => {
                const sql = (args[0] as unknown as string[]).join('?');
                if (/SELECT id FROM jobs/i.test(sql)) batchesRun++;
                return inner(...(args as [never]));
            }) as never);
            // Clock jumps past the 240s budget once the first batch has run,
            // so the guard trips at the top of the second iteration.
            vi.spyOn(Date, 'now').mockImplementation(() => base + (batchesRun >= 1 ? 250_000 : 0));

            const res = await run();
            const body = await res.json();

            expect(statementCalls(SELECTION).length).toBe(1);
            expect(body.batches).toBe(1);
            expect(body.deleted).toBe(BATCH_SIZE);
            expect(body.stopReason).toBe('time-budget');
            expect(body.hasMore).toBe(true);
            // The point of the budget: we return under our own power, so the
            // finish row gets written instead of the platform killing the run.
            expect(cronRunUpdate).toHaveBeenCalledWith(
                expect.objectContaining({ data: expect.objectContaining({ success: true }) }),
            );
        });

        it('refuses to START a batch the slowest observed batch would run past the budget', async () => {
            // The overshoot hole: checking only "elapsed >= budget" lets a
            // batch begin at 239s and run to the connection's statement
            // timeout, pushing the handler past maxDuration. The platform
            // kills it and no finish row is written.
            const base = Date.UTC(2026, 7, 19, 4, 30, 0);
            let batchesRun = 0;
            scriptBatches([], { jobs: BATCH_SIZE, bookmarks: 0 });
            const inner = txQueryRaw.getMockImplementation()!;
            txQueryRaw.mockImplementation((async (...args: unknown[]) => {
                const sql = (args[0] as unknown as string[]).join('?');
                if (/SELECT id FROM jobs/i.test(sql)) batchesRun++;
                return inner(...(args as [never]));
            }) as never);
            // Each batch costs 200s. After one, elapsed is 200s: still inside
            // the 240s budget, so an elapsed-only guard would start a second
            // batch that finishes at 400s.
            vi.spyOn(Date, 'now').mockImplementation(() => base + batchesRun * 200_000);

            const body = await (await run()).json();

            expect(statementCalls(SELECTION).length).toBe(1);
            expect(body.stopReason).toBe('time-budget');
            expect(body.hasMore).toBe(true);
            expect(body.slowestBatchMs).toBe(200_000);
            expect(recordedMetrics().slowestBatchMs).toBe(200_000);
        });

        it('does not stop early when batches are fast: the cap is still the binding limit', async () => {
            // Guards the predictive check against over-firing. Real clock, so
            // each batch costs ~0ms and the run must reach the batch cap.
            scriptBatches([], { jobs: BATCH_SIZE, bookmarks: 0 });

            const body = await (await run()).json();

            expect(statementCalls(SELECTION).length).toBe(MAX_BATCHES);
            expect(body.stopReason).toBe('batch-cap');
        });

        it('stops when a batch comes back empty', async () => {
            scriptBatches([
                { jobs: BATCH_SIZE, bookmarks: 4 },
                { jobs: BATCH_SIZE, bookmarks: 0 },
                { jobs: 137, bookmarks: 2 },
                { jobs: 0, bookmarks: 0 },
            ]);

            const res = await run();
            const body = await res.json();

            expect(statementCalls(SELECTION).length).toBe(4);
            expect(body.batches).toBe(4);
            expect(body.deleted).toBe(BATCH_SIZE * 2 + 137);
            expect(body.bookmarksDeleted).toBe(6);
            expect(body.stopReason).toBe('drained');
            expect(body.hasMore).toBe(false);
        });

        it('does not claim drained on a merely short batch: SKIP LOCKED can shorten one while rows remain', async () => {
            // A concurrent run holds some rows, so batch 1 comes back short
            // even though the window still has plenty left (batch 2 is full).
            scriptBatches([
                { jobs: 137, bookmarks: 1 },
                { jobs: BATCH_SIZE, bookmarks: 0 },
                { jobs: 0, bookmarks: 0 },
            ]);

            const body = await (await run()).json();

            expect(statementCalls(SELECTION).length).toBe(3);
            expect(body.deleted).toBe(137 + BATCH_SIZE);
            expect(body.stopReason).toBe('drained');
            expect(body.hasMore).toBe(false);
        });

        it('reports hasMore when the cap lands exactly on a short batch', async () => {
            // Short batches all the way to the cap: still bounded, still honest.
            scriptBatches([], { jobs: 1, bookmarks: 0 });

            const body = await (await run()).json();

            expect(statementCalls(SELECTION).length).toBe(MAX_BATCHES);
            expect(body.deleted).toBe(MAX_BATCHES);
            expect(body.stopReason).toBe('batch-cap');
            expect(body.hasMore).toBe(true);
        });
    });

    describe('resumable / idempotent', () => {
        it('carries no cursor or offset: each batch re-reads the same time-window predicate', async () => {
            scriptBatches([], { jobs: BATCH_SIZE, bookmarks: 0 });

            await run();

            const selections = statementCalls(SELECTION);
            expect(selections.length).toBeGreaterThan(1);
            // Identical statement every batch: progress comes from the rows
            // being gone, not from a moving offset a killed run would lose.
            expect(selections[1].sql).toBe(selections[0].sql);
            expect(selections[0].sql).not.toMatch(/OFFSET/i);
            expect(selections[1].params).toEqual(selections[0].params);
        });

        it('a truncated run leaves the remainder for the next invocation, which converges', async () => {
            // Run 1: backlog deeper than one invocation can clear.
            scriptBatches([], { jobs: BATCH_SIZE, bookmarks: 0 });
            const first = await (await run()).json();
            expect(first.hasMore).toBe(true);
            expect(first.deleted).toBe(BATCH_SIZE * MAX_BATCHES);

            // Run 2: same predicate, remainder still matches, and it drains.
            vi.clearAllMocks();
            installTransactionMock();
            cronRunCreate.mockResolvedValue({ id: 'cron-run-test-2' } as never);
            vi.mocked(prisma.job.count).mockResolvedValue(0 as never);
            scriptBatches([
                { jobs: BATCH_SIZE, bookmarks: 2 },
                { jobs: 42, bookmarks: 0 },
                { jobs: 0, bookmarks: 0 },
            ]);

            const second = await (await run()).json();
            expect(second.deleted).toBe(BATCH_SIZE + 42);
            expect(second.hasMore).toBe(false);
            expect(second.stopReason).toBe('drained');
        });

        it('is a successful no-op when nothing is in the window', async () => {
            scriptBatches([], { jobs: 0, bookmarks: 0 });

            const res = await run();
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.success).toBe(true);
            expect(body.deleted).toBe(0);
            expect(body.bookmarksDeleted).toBe(0);
            expect(body.batches).toBe(1);
            expect(body.hasMore).toBe(false);
            // An empty selection never issues a DELETE at all.
            expect(statementCalls(JOB_DELETE).length).toBe(0);
            expect(txExecuteRaw).not.toHaveBeenCalled();
            // Idempotent: a second immediate invocation is the same no-op.
            vi.clearAllMocks();
            installTransactionMock();
            cronRunCreate.mockResolvedValue({ id: 'cron-run-test-2' } as never);
            vi.mocked(prisma.job.count).mockResolvedValue(0 as never);
            scriptBatches([], { jobs: 0, bookmarks: 0 });
            const again = await (await run()).json();
            expect(again.deleted).toBe(0);
            expect(again.hasMore).toBe(false);
        });
    });

    describe('guard visibility / metrics shape', () => {
        it('records protectedApplications and bookmarksDeleted so the guards show up in cron_runs', async () => {
            scriptBatches([
                { jobs: BATCH_SIZE, bookmarks: 7 },
                { jobs: 41, bookmarks: 2 },
                { jobs: 0, bookmarks: 0 },
            ]);
            // Three rows in the window are being protected by the
            // applications guard this run.
            vi.mocked(prisma.job.count).mockResolvedValue(3 as never);

            const body = await (await run()).json();

            expect(body.deleted).toBe(BATCH_SIZE + 41);
            expect(body.bookmarksDeleted).toBe(9);
            expect(body.protectedApplications).toBe(3);
            // The protected count is the same window WITH applications.
            expect(prisma.job.count).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        isPublished: false,
                        sourceType: { not: null },
                        NOT: { sourceType: 'employer' },
                        employerJobs: { is: null },
                        jobApplications: { some: {} },
                        updatedAt: expect.objectContaining({ lt: expect.any(Date) }),
                    }),
                }),
            );

            const metrics = recordedMetrics();
            expect(metrics).toMatchObject({
                deleted: BATCH_SIZE + 41,
                bookmarksDeleted: 9,
                protectedApplications: 3,
                batches: 3,
                batchSize: BATCH_SIZE,
                hasMore: false,
                stopReason: 'drained',
                retentionDays: 30,
            });
            expect(typeof metrics.elapsedMs).toBe('number');
        });

        it('records a finished run with duration, so a killed run is distinguishable', async () => {
            scriptBatches([{ jobs: 0, bookmarks: 0 }]);

            await run();

            expect(cronRunCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        name: 'cleanup-unpublished-aggregator-jobs',
                        success: false,
                    }),
                }),
            );
            const finish = cronRunUpdate.mock.calls.find(
                (c) => (c[0] as { data?: { success?: boolean } }).data?.success === true,
            );
            expect(finish).toBeDefined();
            const data = (finish![0] as { data: Record<string, unknown> }).data;
            expect(data.finishedAt).toBeInstanceOf(Date);
            expect(typeof data.durationMs).toBe('number');
        });

        it('metrics are JSON-serializable for the cron_runs Json column', async () => {
            scriptBatches([{ jobs: 0, bookmarks: 0 }]);

            await run();

            const metrics = recordedMetrics();
            expect(() => JSON.parse(JSON.stringify(metrics))).not.toThrow();
            expect(JSON.parse(JSON.stringify(metrics))).toEqual(metrics);
        });
    });

    describe('dry run', () => {
        it('reports exactly what would be deleted, by provider, and writes nothing', async () => {
            vi.mocked(prisma.job.groupBy).mockResolvedValue([
                { sourceProvider: 'acme-boards', _count: { _all: 150 } },
                { sourceProvider: null, _count: { _all: 20 } },
            ] as never);
            vi.mocked(prisma.job.findMany).mockResolvedValue(
                Array.from({ length: 170 }, (_, i) => ({ id: `job-${i}` })) as never,
            );
            vi.mocked(prisma.savedJob.count).mockResolvedValue(12 as never);
            vi.mocked(prisma.job.count).mockResolvedValue(4 as never);

            const res = await run('?dryRun=1');
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.dryRun).toBe(true);
            expect(body.wouldDelete).toBe(170);
            expect(body.byProvider).toEqual({ 'acme-boards': 150, unknown: 20 });
            expect(body.protectedApplications).toBe(4);
            expect(body.bookmarksToDelete).toBe(12);
            expect(body.retentionDays).toBe(30);
            // Writes NOTHING: no delete transaction, and not even a cron_runs row.
            expect(transaction).not.toHaveBeenCalled();
            expect(txQueryRaw).not.toHaveBeenCalled();
            expect(txExecuteRaw).not.toHaveBeenCalled();
            expect(cronRunCreate).not.toHaveBeenCalled();
            expect(cronRunUpdate).not.toHaveBeenCalled();
        });

        it('applies the same selection guards as the real delete', async () => {
            await run('?dryRun=1');

            const expectedWhere = expect.objectContaining({
                isPublished: false,
                sourceType: { not: null },
                NOT: { sourceType: 'employer' },
                employerJobs: { is: null },
                jobApplications: { none: {} },
                updatedAt: expect.objectContaining({ lt: expect.any(Date) }),
            });
            expect(prisma.job.groupBy).toHaveBeenCalledWith(
                expect.objectContaining({ by: ['sourceProvider'], where: expectedWhere }),
            );
            expect(prisma.job.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ where: expectedWhere }),
            );
        });

        it('skips the bookmark count entirely when the window is empty', async () => {
            const res = await run('?dryRun=1');
            const body = await res.json();

            expect(body.wouldDelete).toBe(0);
            expect(body.bookmarksToDelete).toBe(0);
            expect(prisma.savedJob.count).not.toHaveBeenCalled();
        });
    });
});
