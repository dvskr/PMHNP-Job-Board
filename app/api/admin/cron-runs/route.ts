/**
 * GET /api/admin/cron-runs — the most recent run of every tracked cron.
 *
 * /api/admin/cron-list answers "what is scheduled" out of vercel.json, which
 * is why the Cron Health Dashboard could show a schedule and a trigger button
 * and nothing else: there was no endpoint that answered "did it work". The
 * pipeline panel reads cron_runs already, but only as a flat 30-row recent
 * feed, so a cron that last ran a week ago falls off it entirely.
 *
 * Keyed by the name passed to withCronTracking, which is the route's last path
 * segment. Routes that take a query param (ingest?source=...) record one name
 * for every variant, so they share one run history.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireApiAdmin } from '@/lib/auth/require-api-admin';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export interface LatestCronRun {
    name: string;
    startedAt: string;
    finishedAt: string | null;
    durationMs: number | null;
    success: boolean;
    error: string | null;
}

/** Enough of the failure to recognise it; the full text lives in the row. */
const ERROR_PREVIEW_CHARS = 300;

export async function GET(request: NextRequest) {
    const authError = await requireApiAdmin(request);
    if (authError) return authError;

    try {
        const latest = await prisma.cronRun.groupBy({
            by: ['name'],
            _max: { startedAt: true },
        });

        const keys = latest
            .map((row) => ({ name: row.name, startedAt: row._max.startedAt }))
            .filter((row): row is { name: string; startedAt: Date } => row.startedAt !== null);

        if (keys.length === 0) {
            return NextResponse.json({ success: true, runs: [] });
        }

        const rows = await prisma.cronRun.findMany({
            where: { OR: keys.map((k) => ({ name: k.name, startedAt: k.startedAt })) },
            select: {
                name: true, startedAt: true, finishedAt: true,
                durationMs: true, success: true, error: true,
            },
            orderBy: { startedAt: 'desc' },
        });

        // Two rows can share a name and a startedAt if a cron was triggered
        // twice in the same millisecond. Keep the first, which the ordering
        // above makes the newest.
        const byName = new Map<string, LatestCronRun>();
        for (const row of rows) {
            if (byName.has(row.name)) continue;
            byName.set(row.name, {
                name: row.name,
                startedAt: row.startedAt.toISOString(),
                finishedAt: row.finishedAt?.toISOString() ?? null,
                durationMs: row.durationMs,
                success: row.success,
                error: row.error ? row.error.slice(0, ERROR_PREVIEW_CHARS) : null,
            });
        }

        return NextResponse.json({ success: true, runs: [...byName.values()] });
    } catch (err) {
        logger.error('[admin/cron-runs] failed to read cron run history', err);
        return NextResponse.json(
            { success: false, error: 'Failed to read cron run history' },
            { status: 500 },
        );
    }
}
