/**
 * Ingest wave-summary cron (Goal #4 — "one concise summary per ingest run").
 *
 * Why this exists: each per-source ingest cron used to fire its own Discord
 * embed. With 13 source crons × 2 waves/day = ~26 embeds. We removed the
 * per-cron embed and replaced it with this aggregator that runs once per
 * wave, queries cron_runs.metrics for the recent ingest firings, and posts
 * ONE rolled-up summary embed per wave.
 *
 * Schedule (vercel.json):
 *   12:50 UTC — covers the morning wave (10:00 → 12:30 UTC, ~3h window)
 *   17:55 UTC — covers the afternoon wave (16:00 → 17:35 UTC, ~2h window)
 *
 * Window logic: query cron_runs WHERE name='ingest' AND finishedAt is in
 * [now - WINDOW_MINUTES, now]. WINDOW_MINUTES is set wide enough to cover
 * the longest wave (3h) plus slack.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyCronOrAdmin } from '@/lib/auth/verify-cron-or-admin';
import { sendCronFailureAlert, sendDiscordMessage } from '@/lib/discord-notifier';
import { withCronTracking } from '@/lib/cron/track';

export const maxDuration = 30;

const WINDOW_MINUTES = 200; // 3h20m — covers worst-case morning wave with slack

interface PerSourceMetric {
    source: string;
    chunk?: number | null;
    fetched: number;
    added: number;
    duplicates: number;
    errors: number;
    duration: number;
}

interface IngestMetrics {
    totalFetched?: number;
    totalAdded?: number;
    totalDuplicates?: number;
    totalErrors?: number;
    totalDurationMs?: number;
    expiredJobsRemoved?: number;
    sourcesProcessed?: number;
    perSource?: PerSourceMetric[];
    apiCallsBySource?: Record<string, number>;
}

export async function GET(request: NextRequest) {
    const authError = await verifyCronOrAdmin(request);
    if (authError) return authError;

    try {
        return await withCronTracking('ingest-wave-summary', async () => {
            const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000);

            // Pull all completed ingest runs in the wave window. Failed runs
            // (success=false but finished) are included so errors land in the
            // summary too. Open/hung runs (finishedAt=null) are excluded —
            // we don't want to report on a run that's still going.
            const runs = await prisma.cronRun.findMany({
                where: {
                    name: 'ingest',
                    finishedAt: { gte: windowStart, not: null },
                },
                orderBy: { startedAt: 'asc' },
                select: {
                    id: true,
                    startedAt: true,
                    finishedAt: true,
                    success: true,
                    durationMs: true,
                    error: true,
                    metrics: true,
                },
            });

            if (runs.length === 0) {
                console.log(`[ingest-wave-summary] No ingest runs in last ${WINDOW_MINUTES}m — skipping embed`);
                return {
                    response: NextResponse.json({
                        success: true,
                        runsConsidered: 0,
                        embedSent: false,
                        windowStart: windowStart.toISOString(),
                    }),
                    metrics: { runsConsidered: 0, embedSent: false },
                };
            }

            // Aggregate per-source across all runs in the window. A "source row"
            // sums fetched/added/duplicates/errors across chunks (greenhouse +
            // workday come in 4–5 chunks each).
            const perSource = new Map<string, PerSourceMetric & { chunkCount: number }>();
            let waveFetched = 0;
            let waveAdded = 0;
            let waveDuplicates = 0;
            let waveErrors = 0;
            let runErrors = 0;
            const failedRuns: string[] = [];

            for (const run of runs) {
                if (!run.success) {
                    runErrors++;
                    if (run.error) failedRuns.push(run.error.slice(0, 80));
                }
                const m = (run.metrics as IngestMetrics | null) ?? null;
                if (!m?.perSource) continue;
                for (const r of m.perSource) {
                    const existing = perSource.get(r.source) ?? {
                        source: r.source,
                        fetched: 0,
                        added: 0,
                        duplicates: 0,
                        errors: 0,
                        duration: 0,
                        chunkCount: 0,
                    };
                    existing.fetched += r.fetched;
                    existing.added += r.added;
                    existing.duplicates += r.duplicates;
                    existing.errors += r.errors;
                    existing.duration += r.duration;
                    existing.chunkCount++;
                    perSource.set(r.source, existing);
                    waveFetched += r.fetched;
                    waveAdded += r.added;
                    waveDuplicates += r.duplicates;
                    waveErrors += r.errors;
                }
            }

            const perSourceArr = [...perSource.values()].sort((a, b) => b.added - a.added);

            // Compact per-source line: just `source +N` for adds, `⚠️ source 0/fetched`
            // for warnings. Drops fetched/dup/duration noise — full breakdown lives
            // in cron_runs.metrics for anyone who wants forensics.
            const sourceLine = perSourceArr
                .map((r) => {
                    if (r.errors > r.added) return `⚠️ ${r.source} ${r.added}/${r.fetched}`;
                    if (r.fetched === 0) return `⬜ ${r.source}`;
                    return `${r.source} +${r.added}`;
                })
                .join(' · ')
                .slice(0, 1020);

            const totalErrors = waveErrors + runErrors;
            const hasWarning = perSourceArr.some((r) => r.fetched === 0 || r.errors > r.added) || runErrors > 0;

            // Silent-wave gate: skip the embed entirely when nothing
            // notable happened this wave. We still want the audit row in
            // cron_runs (so the run is observable), we just don't ping
            // Discord with a "0 added · 0 errors · all green" report.
            const isSilentWave = waveAdded === 0 && totalErrors === 0 && !hasWarning;
            if (isSilentWave) {
                console.log(`[ingest-wave-summary] Silent wave (0 added, 0 errors, ${runs.length} runs) — skipping embed`);
                return {
                    response: NextResponse.json({
                        success: true,
                        runsConsidered: runs.length,
                        embedSent: false,
                        reason: 'silent_wave',
                        waveAdded,
                        sources: perSource.size,
                    }),
                    metrics: {
                        runsConsidered: runs.length,
                        waveAdded,
                        embedSent: false,
                        silentWave: true,
                    },
                };
            }

            // Lean embed: title carries the headline, description carries the
            // sources line. No fields, no footer, no totals duplication. Only
            // adds a "failed" field when something actually failed.
            const embed = {
                title: `${hasWarning ? '⚠️' : '✅'} Wave: +${waveAdded}${totalErrors > 0 ? ` · ${totalErrors} errors` : ''}`,
                description: sourceLine || '_no sources_',
                color: hasWarning ? 16776960 : 5763719,
                ...(failedRuns.length > 0
                    ? {
                        fields: [{
                            name: `Failed (${failedRuns.length})`,
                            value: '```' + failedRuns.slice(0, 3).join('\n').slice(0, 800) + '```',
                            inline: false,
                        }],
                    }
                    : {}),
            };

            try {
                await sendDiscordMessage('', [embed]);
            } catch (e) {
                console.error('[ingest-wave-summary] Discord send failed:', e);
            }

            return {
                response: NextResponse.json({
                    success: true,
                    runsConsidered: runs.length,
                    embedSent: true,
                    waveAdded,
                    waveFetched,
                    sources: perSource.size,
                    failedRuns: failedRuns.length,
                }),
                metrics: {
                    runsConsidered: runs.length,
                    waveAdded,
                    waveFetched,
                    waveDuplicates,
                    waveErrors,
                    sources: perSource.size,
                    failedRuns: failedRuns.length,
                },
            };
        });
    } catch (error) {
        await sendCronFailureAlert('ingest-wave-summary', error);
        console.error('[ingest-wave-summary] Fatal:', error);
        return NextResponse.json({ error: 'Wave summary failed' }, { status: 500 });
    }
}
