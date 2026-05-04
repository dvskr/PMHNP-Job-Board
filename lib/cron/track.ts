/**
 * P4.3: cron run-tracking helper.
 *
 * Wrap a cron handler with this to get:
 *   - automatic start/finish time logging
 *   - success/failure tracking with caught error messages
 *   - per-run metrics blob (URLs submitted, jobs deindexed, etc.)
 *
 * Usage in a cron route handler:
 *
 *     import { withCronTracking } from '@/lib/cron/track';
 *
 *     export async function GET(request: NextRequest) {
 *         const authError = await verifyCronOrAdmin(request);
 *         if (authError) return authError;
 *
 *         return withCronTracking('historical-deindex', async () => {
 *             // ... existing cron body ...
 *             return {
 *                 response: NextResponse.json({ success: true, ... }),
 *                 metrics: { processed: 50, submitted: 38, live: 5 },
 *             };
 *         });
 *     }
 */
import { prisma } from '@/lib/prisma';
import type { NextResponse } from 'next/server';

export interface CronRunResult {
    response: NextResponse;
    /** Optional structured metrics persisted to cron_runs.metrics for trend analysis. */
    metrics?: Record<string, unknown>;
}

/**
 * Execute a cron body and record its start/finish/result to cron_runs.
 *
 * The wrapped function returns a CronRunResult so we can capture both the
 * HTTP response and the structured metrics in one round-trip.
 */
export async function withCronTracking(
    name: string,
    body: () => Promise<CronRunResult>,
): Promise<NextResponse> {
    const startedAt = new Date();

    // Insert the start row immediately so a hung cron is still visible.
    let runId: string | null = null;
    try {
        const row = await prisma.cronRun.create({
            data: { name, startedAt, success: false },
            select: { id: true },
        });
        runId = row.id;
    } catch (err) {
        // Don't block the cron from running if logging fails. Log loudly.
        console.error(`[cron:${name}] Failed to create cron_run row:`, err);
    }

    try {
        const result = await body();
        const finishedAt = new Date();
        const durationMs = finishedAt.getTime() - startedAt.getTime();

        if (runId) {
            try {
                await prisma.cronRun.update({
                    where: { id: runId },
                    data: {
                        finishedAt,
                        success: true,
                        durationMs,
                        metrics: result.metrics ? JSON.parse(JSON.stringify(result.metrics)) : undefined,
                    },
                });
            } catch (err) {
                console.error(`[cron:${name}] Failed to update cron_run row on success:`, err);
            }
        }

        return result.response;
    } catch (err) {
        const finishedAt = new Date();
        const durationMs = finishedAt.getTime() - startedAt.getTime();
        const errorMsg = err instanceof Error ? err.message : String(err);

        if (runId) {
            try {
                await prisma.cronRun.update({
                    where: { id: runId },
                    data: {
                        finishedAt,
                        success: false,
                        durationMs,
                        error: errorMsg.slice(0, 4000),
                    },
                });
            } catch (logErr) {
                console.error(`[cron:${name}] Failed to update cron_run row on error:`, logErr);
            }
        }

        // Re-throw — the route's existing catch + sendCronFailureAlert handles user-facing alerting.
        throw err;
    }
}
