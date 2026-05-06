/**
 * Pipeline-flow data for the admin Goal-#6 panel.
 *
 * Returns the per-source ingestion funnel for today + last 7 days, plus
 * recent cron run history (start/finish/duration/success), plus top
 * rejection reasons across the catalog.
 *
 * Single endpoint so the client can render the whole pipeline view in
 * one fetch.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireApiAdmin } from '@/lib/auth/require-api-admin';
import { ALL_SOURCES, type JobSource } from '@/lib/ingestion-service';

export interface SourceFunnel {
    source: string;
    fetched: number;
    added: number;
    duplicates: number;
    rejected: number;
    rejectedByReason: Record<string, number>;
    avgQualityScore: number | null;
}

export interface CronRunRow {
    name: string;
    startedAt: string;
    finishedAt: string | null;
    durationMs: number | null;
    success: boolean;
    error: string | null;
    metrics: unknown;
}

interface PipelineFlowResponse {
    today: { funnels: SourceFunnel[]; totals: { fetched: number; added: number; rejected: number } };
    last7d: { funnels: SourceFunnel[]; totals: { fetched: number; added: number; rejected: number } };
    recentRuns: CronRunRow[];
    topRejectionReasons: Array<{ reason: string; n: number }>;
    activeSources: string[];
}

function summarize(rows: Array<{
    source: string;
    jobsFetched: number;
    jobsAdded: number;
    jobsDuplicate: number;
    jobsRejected: number;
    rejectedByReason: unknown;
    avgQualityScore: number | null;
}>): SourceFunnel[] {
    const bySource = new Map<string, SourceFunnel>();
    for (const r of rows) {
        const cur = bySource.get(r.source) ?? {
            source: r.source,
            fetched: 0,
            added: 0,
            duplicates: 0,
            rejected: 0,
            rejectedByReason: {},
            avgQualityScore: null as number | null,
        };
        cur.fetched += r.jobsFetched;
        cur.added += r.jobsAdded;
        cur.duplicates += r.jobsDuplicate;
        cur.rejected += r.jobsRejected;
        if (r.rejectedByReason && typeof r.rejectedByReason === 'object') {
            for (const [reason, n] of Object.entries(r.rejectedByReason as Record<string, number>)) {
                cur.rejectedByReason[reason] = (cur.rejectedByReason[reason] ?? 0) + Number(n);
            }
        }
        // Latest non-null avgQualityScore wins (rows processed in date desc)
        if (cur.avgQualityScore == null && r.avgQualityScore != null) {
            cur.avgQualityScore = r.avgQualityScore;
        }
        bySource.set(r.source, cur);
    }
    return [...bySource.values()].sort((a, b) => b.fetched - a.fetched);
}

export async function GET() {
    const authError = await requireApiAdmin();
    if (authError) return authError;

    try {
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

        const [todayRows, weekRows, recentRuns, rejectionRows] = await Promise.all([
            prisma.sourceStats.findMany({
                where: { date: today },
                orderBy: { jobsFetched: 'desc' },
            }),
            prisma.sourceStats.findMany({
                where: { date: { gte: sevenDaysAgo } },
                orderBy: { date: 'desc' },
            }),
            prisma.cronRun.findMany({
                orderBy: { startedAt: 'desc' },
                take: 30,
            }),
            prisma.$queryRawUnsafe<Array<{ rejection_reason: string; n: bigint }>>(`
        SELECT rejection_reason, COUNT(*)::bigint as n
        FROM rejected_jobs
        WHERE created_at > NOW() - INTERVAL '7 days'
        GROUP BY rejection_reason
        ORDER BY n DESC
        LIMIT 20
      `),
        ]);

        const todayFunnels = summarize(todayRows.map((r) => ({
            source: r.source,
            jobsFetched: r.jobsFetched,
            jobsAdded: r.jobsAdded,
            jobsDuplicate: r.jobsDuplicate,
            jobsRejected: r.jobsRejected,
            rejectedByReason: r.rejectedByReason,
            avgQualityScore: r.avgQualityScore,
        })));
        const weekFunnels = summarize(weekRows.map((r) => ({
            source: r.source,
            jobsFetched: r.jobsFetched,
            jobsAdded: r.jobsAdded,
            jobsDuplicate: r.jobsDuplicate,
            jobsRejected: r.jobsRejected,
            rejectedByReason: r.rejectedByReason,
            avgQualityScore: r.avgQualityScore,
        })));

        const reduceTotals = (fs: SourceFunnel[]) => fs.reduce(
            (acc, f) => ({ fetched: acc.fetched + f.fetched, added: acc.added + f.added, rejected: acc.rejected + f.rejected }),
            { fetched: 0, added: 0, rejected: 0 },
        );

        return NextResponse.json({
            today: { funnels: todayFunnels, totals: reduceTotals(todayFunnels) },
            last7d: { funnels: weekFunnels, totals: reduceTotals(weekFunnels) },
            recentRuns: recentRuns.map((r) => ({
                name: r.name,
                startedAt: r.startedAt.toISOString(),
                finishedAt: r.finishedAt?.toISOString() ?? null,
                durationMs: r.durationMs,
                success: r.success,
                error: r.error,
                metrics: r.metrics,
            })),
            topRejectionReasons: rejectionRows.map((r) => ({ reason: r.rejection_reason, n: Number(r.n) })),
            activeSources: ALL_SOURCES as JobSource[],
        });
    } catch (e) {
        console.error('[admin/pipeline-flow]', e);
        return NextResponse.json({ error: 'Failed to load pipeline data' }, { status: 500 });
    }
}
