/**
 * cleanup-rejected-jobs: the retention cron used to issue one unbounded
 * DELETE and was killed by the function timeout on every single run, so
 * cron_runs held 60+ start rows and not one finished_at. These tests pin the
 * three properties that fix depends on:
 *
 *   1. batch bounding      — a run can never issue an unbounded delete, and
 *                            terminates after a fixed number of batches (or
 *                            the wall-clock budget) no matter how deep the
 *                            backlog is.
 *   2. resumable/idempotent — the predicate is a time window with no cursor or
 *                            offset, so a truncated run leaves the remainder
 *                            for the next invocation and repeated invocations
 *                            converge on an empty backlog.
 *   3. metrics shape        — a partial run is visible in cron_runs (row count
 *                            processed + hasMore), never silent.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const BATCH_SIZE = 5_000;
const MAX_BATCHES = 100;

// File-local prisma mock: the shared tests/setup.ts mock has no rejectedJob or
// $executeRaw surface, and this file must not mutate a shared fixture.
vi.mock('@/lib/prisma', () => ({
    prisma: {
        $executeRaw: vi.fn(),
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

const executeRaw = vi.mocked(prisma.$executeRaw);
const cronRunUpdate = vi.mocked(prisma.cronRun.update);

function req(): Request {
    return new Request('https://example.com/api/cron/cleanup-rejected-jobs', {
        headers: { authorization: 'Bearer test' },
    });
}

async function run(): Promise<Response> {
    const { GET } = await import('@/app/api/cron/cleanup-rejected-jobs/route');
    return GET(req() as never);
}

/** Make the inter-batch pause resolve immediately so a 100-batch run is instant. */
function stubImmediateTimers() {
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void) => {
        fn();
        return 0;
    }) as never);
}

/** SQL text of the Nth $executeRaw call, with `?` where the bind params sit. */
function sqlOf(callIndex: number): string {
    const strings = executeRaw.mock.calls[callIndex][0] as unknown as string[];
    return strings.join('?').replace(/\s+/g, ' ').trim();
}

/** Bind params of the Nth $executeRaw call. */
function paramsOf(callIndex: number): unknown[] {
    return executeRaw.mock.calls[callIndex].slice(1);
}

/** metrics blob handed to cron_runs on the successful finish update. */
function recordedMetrics(): Record<string, unknown> {
    const finish = cronRunUpdate.mock.calls.find(
        (c) => (c[0] as { data?: { success?: boolean } }).data?.success === true,
    );
    expect(finish, 'expected a success update on cron_runs').toBeDefined();
    return (finish![0] as { data: { metrics: Record<string, unknown> } }).data.metrics;
}

describe('cleanup-rejected-jobs cron', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(prisma.cronRun.create).mockResolvedValue({ id: 'cron-run-test' } as never);
        stubImmediateTimers();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('batch bounding', () => {
        it('never issues an unbounded delete: every statement carries a LIMIT and the cutoff', async () => {
            executeRaw.mockResolvedValue(0 as never);

            await run();

            expect(executeRaw).toHaveBeenCalled();
            const sql = sqlOf(0);
            expect(sql).toMatch(/DELETE FROM rejected_jobs/i);
            expect(sql).toMatch(/LIMIT \?/i);
            expect(sql).toMatch(/created_at < \?/i);
            // Overlapping runs (scheduled + admin manual trigger) must step
            // around each other instead of blocking out the time budget.
            expect(sql).toMatch(/FOR UPDATE SKIP LOCKED/i);

            const [cutoff, limit] = paramsOf(0);
            expect(limit).toBe(BATCH_SIZE);
            expect(cutoff).toBeInstanceOf(Date);
            // 30-day retention window, measured back from now.
            const ageDays = (Date.now() - (cutoff as Date).getTime()) / 86_400_000;
            expect(ageDays).toBeGreaterThan(29.9);
            expect(ageDays).toBeLessThan(30.1);
        });

        it('stops at the batch cap against an effectively infinite backlog', async () => {
            // Every batch comes back full => the backlog never runs dry.
            executeRaw.mockResolvedValue(BATCH_SIZE as never);

            const res = await run();
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(executeRaw).toHaveBeenCalledTimes(MAX_BATCHES);
            expect(body.batches).toBe(MAX_BATCHES);
            expect(body.deleted).toBe(BATCH_SIZE * MAX_BATCHES);
            expect(body.stopReason).toBe('batch-cap');
            expect(body.hasMore).toBe(true);
        });

        it('stops on the wall-clock budget before the batch cap when the database is slow', async () => {
            const base = Date.UTC(2026, 7, 13, 4, 45, 0);
            let batchesRun = 0;
            executeRaw.mockImplementation((async () => {
                batchesRun++;
                return BATCH_SIZE;
            }) as never);
            // Clock jumps past the 240s budget once the first batch has run, so
            // the guard trips at the top of the second iteration.
            vi.spyOn(Date, 'now').mockImplementation(() => base + (batchesRun >= 1 ? 250_000 : 0));

            const res = await run();
            const body = await res.json();

            expect(executeRaw).toHaveBeenCalledTimes(1);
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
            // The overshoot hole: checking only "elapsed >= budget" lets a batch
            // begin at 239s and then run to the connection's statement timeout,
            // pushing the handler past maxDuration. The platform kills it, no
            // finish row is written, and the cron is silently broken again.
            const base = Date.UTC(2026, 7, 13, 4, 45, 0);
            let batchesRun = 0;
            executeRaw.mockImplementation((async () => {
                batchesRun++;
                return BATCH_SIZE;
            }) as never);
            // Each batch costs 200s. After one, elapsed is 200s: still inside
            // the 240s budget, so an elapsed-only guard would start a second
            // batch that finishes at 400s.
            vi.spyOn(Date, 'now').mockImplementation(() => base + batchesRun * 200_000);

            const body = await (await run()).json();

            expect(executeRaw).toHaveBeenCalledTimes(1);
            expect(body.stopReason).toBe('time-budget');
            expect(body.hasMore).toBe(true);
            // Observed per-batch cost is reported, so the operator can see
            // whether the clock or the batch cap is the binding constraint.
            expect(body.slowestBatchMs).toBe(200_000);
            expect(recordedMetrics().slowestBatchMs).toBe(200_000);
        });

        it('does not stop early when batches are fast: the cap is still the binding limit', async () => {
            // Guards the predictive check against over-firing. Real clock, so
            // each batch costs ~0ms and the run must reach the batch cap.
            executeRaw.mockResolvedValue(BATCH_SIZE as never);

            const body = await (await run()).json();

            expect(executeRaw).toHaveBeenCalledTimes(MAX_BATCHES);
            expect(body.stopReason).toBe('batch-cap');
        });

        it('stops when a batch comes back empty', async () => {
            const queue = [BATCH_SIZE, BATCH_SIZE, 137, 0];
            executeRaw.mockImplementation((async () => queue.shift() ?? 0) as never);

            const res = await run();
            const body = await res.json();

            expect(executeRaw).toHaveBeenCalledTimes(4);
            expect(body.batches).toBe(4);
            expect(body.deleted).toBe(BATCH_SIZE * 2 + 137);
            expect(body.stopReason).toBe('drained');
            expect(body.hasMore).toBe(false);
        });

        it('does not claim drained on a merely short batch: SKIP LOCKED can shorten one while rows remain', async () => {
            // A concurrent run holds some rows, so batch 1 comes back short even
            // though the window still has plenty left (batch 2 is full again).
            const queue = [137, BATCH_SIZE, 0];
            executeRaw.mockImplementation((async () => queue.shift() ?? 0) as never);

            const body = await (await run()).json();

            expect(executeRaw).toHaveBeenCalledTimes(3);
            expect(body.deleted).toBe(137 + BATCH_SIZE);
            expect(body.stopReason).toBe('drained');
            expect(body.hasMore).toBe(false);
        });

        it('reports hasMore when the cap lands exactly on a short batch', async () => {
            // Short batches all the way to the cap: still bounded, still honest.
            executeRaw.mockResolvedValue(1 as never);

            const body = await (await run()).json();

            expect(executeRaw).toHaveBeenCalledTimes(MAX_BATCHES);
            expect(body.deleted).toBe(MAX_BATCHES);
            expect(body.stopReason).toBe('batch-cap');
            expect(body.hasMore).toBe(true);
        });
    });

    describe('resumable / idempotent', () => {
        it('carries no cursor or offset: each batch re-reads the same time-window predicate', async () => {
            executeRaw.mockResolvedValue(BATCH_SIZE as never);

            await run();

            expect(executeRaw.mock.calls.length).toBeGreaterThan(1);
            const first = sqlOf(0);
            const second = sqlOf(1);
            // Identical statement every batch — progress comes from the rows
            // being gone, not from a moving offset that a killed run would lose.
            expect(second).toBe(first);
            expect(first).not.toMatch(/OFFSET/i);
            expect(paramsOf(1)).toEqual(paramsOf(0));
        });

        it('a truncated run leaves the remainder for the next invocation, which converges', async () => {
            // Run 1: backlog deeper than one invocation can clear.
            executeRaw.mockResolvedValue(BATCH_SIZE as never);
            const first = await (await run()).json();
            expect(first.hasMore).toBe(true);
            expect(first.deleted).toBe(BATCH_SIZE * MAX_BATCHES);

            // Run 2: same predicate, remainder still matches, and it drains.
            vi.clearAllMocks();
            vi.mocked(prisma.cronRun.create).mockResolvedValue({ id: 'cron-run-test-2' } as never);
            const queue = [BATCH_SIZE, 42, 0];
            executeRaw.mockImplementation((async () => queue.shift() ?? 0) as never);

            const second = await (await run()).json();
            expect(second.deleted).toBe(BATCH_SIZE + 42);
            expect(second.hasMore).toBe(false);
            expect(second.stopReason).toBe('drained');
        });

        it('is a successful no-op when nothing is expired', async () => {
            executeRaw.mockResolvedValue(0 as never);

            const res = await run();
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.success).toBe(true);
            expect(body.deleted).toBe(0);
            expect(body.batches).toBe(1);
            expect(body.hasMore).toBe(false);
            // Idempotent: a second immediate invocation is the same no-op.
            vi.clearAllMocks();
            vi.mocked(prisma.cronRun.create).mockResolvedValue({ id: 'cron-run-test-2' } as never);
            executeRaw.mockResolvedValue(0 as never);
            const again = await (await run()).json();
            expect(again.deleted).toBe(0);
            expect(again.hasMore).toBe(false);
        });
    });

    describe('metrics shape', () => {
        it('records rows processed and whether work remains on a partial run', async () => {
            executeRaw.mockResolvedValue(BATCH_SIZE as never);

            await run();

            expect(prisma.cronRun.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ name: 'cleanup-rejected-jobs', success: false }),
                }),
            );

            const metrics = recordedMetrics();
            expect(metrics).toMatchObject({
                deleted: BATCH_SIZE * MAX_BATCHES,
                batches: MAX_BATCHES,
                batchSize: BATCH_SIZE,
                hasMore: true,
                stopReason: 'batch-cap',
                retentionDays: 30,
            });
            expect(typeof metrics.elapsedMs).toBe('number');
        });

        it('records a finished run with duration, so a killed run is distinguishable', async () => {
            executeRaw.mockResolvedValue(0 as never);

            await run();

            const finish = cronRunUpdate.mock.calls.find(
                (c) => (c[0] as { data?: { success?: boolean } }).data?.success === true,
            );
            expect(finish).toBeDefined();
            const data = (finish![0] as { data: Record<string, unknown> }).data;
            expect(data.finishedAt).toBeInstanceOf(Date);
            expect(typeof data.durationMs).toBe('number');

            const metrics = recordedMetrics();
            expect(metrics.hasMore).toBe(false);
            expect(metrics.deleted).toBe(0);
        });

        it('metrics are JSON-serializable for the cron_runs Json column', async () => {
            executeRaw.mockResolvedValue(0 as never);

            await run();

            const metrics = recordedMetrics();
            expect(() => JSON.parse(JSON.stringify(metrics))).not.toThrow();
            expect(JSON.parse(JSON.stringify(metrics))).toEqual(metrics);
        });
    });
});
