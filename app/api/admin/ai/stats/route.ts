/**
 * GET /api/admin/ai/stats — observability data for the AI dashboard.
 *
 * Returns rolled-up metrics from `ai_call_log` over a configurable window:
 *   - per-task: requests, mean latency, P95 latency, error rate, cache-hit
 *     rate, fallback rate, total cost, cost per call.
 *   - per-day cost time series for the line chart.
 *
 * Query params:
 *   ?days=N       (default 7; clamp 1..90)
 *   ?task=<id>    (optional filter to a single task)
 *
 * Sprint 0.4.1. The dashboard UI is a separate ticket; this is the data source.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireApiAdmin } from '@/lib/auth/require-api-admin';

interface PerTaskStat {
    task: string;
    calls: number;
    successes: number;
    errors: number;
    cacheHits: number;
    fallbacks: number;
    totalCostUsd: number;
    meanLatencyMs: number;
    p95LatencyMs: number;
}

interface PerDayCost {
    day: string; // YYYY-MM-DD
    costUsd: number;
    calls: number;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
    const auth = await requireApiAdmin(request);
    if (auth) return auth;

    const url = new URL(request.url);
    const daysRaw = Number(url.searchParams.get('days') ?? '7');
    const days = Math.max(1, Math.min(90, Number.isFinite(daysRaw) ? daysRaw : 7));
    const taskFilter = url.searchParams.get('task');
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Per-task aggregates. Use raw SQL because Prisma's $aggregate doesn't
    // give us a P95 in one round-trip.
    const taskRows = await prisma.$queryRawUnsafe<
        Array<{
            task: string;
            calls: bigint;
            successes: bigint;
            errors: bigint;
            cache_hits: bigint;
            fallbacks: bigint;
            total_cost: string | null;
            mean_latency_ms: number | null;
            p95_latency_ms: number | null;
        }>
    >(
        `
        SELECT task,
               COUNT(*)                                                AS calls,
               COUNT(*) FILTER (WHERE error IS NULL)                   AS successes,
               COUNT(*) FILTER (WHERE error IS NOT NULL)               AS errors,
               COUNT(*) FILTER (WHERE cache_hit = true)                AS cache_hits,
               COUNT(*) FILTER (WHERE fallback_used = true)            AS fallbacks,
               SUM(cost_usd)                                           AS total_cost,
               AVG(latency_ms)                                         AS mean_latency_ms,
               PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_latency_ms
        FROM ai_call_log
        WHERE created_at >= $1
          ${taskFilter ? 'AND task = $2' : ''}
        GROUP BY task
        ORDER BY calls DESC;
        `,
        ...(taskFilter ? [since, taskFilter] : [since]),
    );

    const perTask: PerTaskStat[] = taskRows.map((r) => ({
        task: r.task,
        calls: Number(r.calls),
        successes: Number(r.successes),
        errors: Number(r.errors),
        cacheHits: Number(r.cache_hits),
        fallbacks: Number(r.fallbacks),
        totalCostUsd: Number(r.total_cost ?? 0),
        meanLatencyMs: Math.round(Number(r.mean_latency_ms ?? 0)),
        p95LatencyMs: Math.round(Number(r.p95_latency_ms ?? 0)),
    }));

    // Per-day cost time series.
    const dayRows = await prisma.$queryRawUnsafe<
        Array<{ day: string; cost: string | null; calls: bigint }>
    >(
        `
        SELECT TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD') AS day,
               SUM(cost_usd) AS cost,
               COUNT(*)      AS calls
        FROM ai_call_log
        WHERE created_at >= $1
          ${taskFilter ? 'AND task = $2' : ''}
        GROUP BY DATE_TRUNC('day', created_at)
        ORDER BY day ASC;
        `,
        ...(taskFilter ? [since, taskFilter] : [since]),
    );

    const perDay: PerDayCost[] = dayRows.map((r) => ({
        day: r.day,
        costUsd: Number(r.cost ?? 0),
        calls: Number(r.calls),
    }));

    const totalCostUsd = perTask.reduce((a, b) => a + b.totalCostUsd, 0);
    const totalCalls   = perTask.reduce((a, b) => a + b.calls, 0);
    const totalErrors  = perTask.reduce((a, b) => a + b.errors, 0);

    return NextResponse.json({
        windowDays: days,
        taskFilter,
        totals: {
            calls: totalCalls,
            errors: totalErrors,
            costUsd: Number(totalCostUsd.toFixed(6)),
            errorRate: totalCalls === 0 ? 0 : totalErrors / totalCalls,
        },
        perTask,
        perDay,
    });
}
