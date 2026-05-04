import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { pingAllSearchEnginesBatchDeleted } from '@/lib/search-indexing';
import { verifyCronOrAdmin } from '@/lib/auth/verify-cron-or-admin';
import { sendCronFailureAlert } from '@/lib/discord-notifier';

export const maxDuration = 300; // 5 minutes — may submit up to BATCH_SIZE URL_DELETED to Google

// Drain ~50 URLs per run × 4 runs/day = 200 URLs/day; legacy 25K backlog clears in ~125 days.
// Adjust BATCH_SIZE up if Google's deletion quota allows (currently 100/day shared with deindex-expired).
const BATCH_SIZE = 50;
const HEAD_CHECK_TIMEOUT_MS = 8000;
const MAX_ATTEMPTS = 3;

/**
 * GSC Indexing Crisis (P2.1): historical 404 / soft-404 / crawled-not-indexed
 * URL drainage cron.
 *
 * WHY THIS EXISTS:
 *   The deindex-expired cron only handles jobs unpublished in the last 48h.
 *   This cron drains the legacy backlog (~25k pre-Mar-19 URLs) seeded into
 *   the deindex_queue table from GSC bulk exports + sitemap-diff scrapers.
 *
 * FLOW:
 *   1. Pull oldest N pending rows (oldest first → fairness)
 *   2. HEAD-check each URL with a short timeout
 *      - If 200/3xx → URL is alive; mark 'live' and remove from queue
 *      - If 4xx/5xx → submit URL_DELETED to Google + IndexNow, mark 'submitted'
 *      - If network error → bump attempt counter, leave 'pending' for retry
 *      - If attempt > MAX_ATTEMPTS → mark 'failed', stop trying
 *
 * SAFETY:
 *   - Uses the Google DELETION quota (100/day) — same one as deindex-expired.
 *     We schedule this cron AFTER deindex-expired so live-job removals always
 *     get priority. If deindex-expired uses all 100, this cron will get 429s
 *     and naturally back off via the attempt counter.
 *
 * SCHEDULE: every 6 hours (recommended: 0 1,7,13,19 * * * — offset from
 * deindex-expired which runs at 45 12,18).
 */
export async function GET(request: NextRequest) {
    const authError = await verifyCronOrAdmin(request);
    if (authError) return authError;

    const startTime = Date.now();
    console.log('[CRON:historical-deindex] Starting backlog drainage');

    try {
        const candidates = await prisma.deindexQueue.findMany({
            where: {
                status: 'pending',
                attempt: { lt: MAX_ATTEMPTS },
            },
            orderBy: [
                { addedAt: 'asc' },
            ],
            take: BATCH_SIZE,
        });

        if (candidates.length === 0) {
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log('[CRON:historical-deindex] Queue empty — nothing to drain');
            return NextResponse.json({
                success: true,
                message: 'Queue empty',
                processed: 0,
                duration: `${duration}s`,
                timestamp: new Date().toISOString(),
            });
        }

        // 1. HEAD-check all candidates in parallel.
        //    URLs that return 200/3xx are still live — we should NOT submit
        //    URL_DELETED for them (would actively de-index a working page).
        const headResults = await Promise.all(
            candidates.map(async (row) => {
                try {
                    const controller = new AbortController();
                    const timer = setTimeout(() => controller.abort(), HEAD_CHECK_TIMEOUT_MS);
                    const res = await fetch(row.url, {
                        method: 'HEAD',
                        redirect: 'manual',
                        signal: controller.signal,
                        headers: {
                            // Identify ourselves so edge logs can distinguish this from real crawl.
                            'User-Agent': 'PMHNPHiringIndexer/1.0 (+https://pmhnphiring.com/about)',
                        },
                    });
                    clearTimeout(timer);
                    return { row, status: res.status, error: null as string | null };
                } catch (err) {
                    return {
                        row,
                        status: 0,
                        error: err instanceof Error ? err.message : String(err),
                    };
                }
            })
        );

        // 2. Partition by HEAD result.
        const live: typeof candidates = [];
        const dead: typeof candidates = [];
        const failed: { row: typeof candidates[number]; error: string }[] = [];

        for (const r of headResults) {
            if (r.error) {
                failed.push({ row: r.row, error: r.error });
            } else if (r.status >= 200 && r.status < 400) {
                live.push(r.row);
            } else {
                // 4xx or 5xx — eligible for URL_DELETED.
                dead.push(r.row);
            }
        }

        // 3. Mark live URLs as 'live' (clears them from queue without submitting).
        if (live.length > 0) {
            await prisma.deindexQueue.updateMany({
                where: { id: { in: live.map((r) => r.id) } },
                data: { status: 'live', submittedAt: null },
            });
        }

        // 4. Submit dead URLs to Google + IndexNow.
        //    Success = EITHER engine accepted the submission. Google's deletion
        //    quota (100/day) is shared with deindex-expired and may be exhausted,
        //    but IndexNow still provides Bing/Yandex/Seznam coverage and has no
        //    daily limit. So an IndexNow-only success is still valuable — only
        //    count as failed if BOTH engines rejected.
        let submittedCount = 0;
        let submitFailedCount = 0;
        if (dead.length > 0) {
            const deadUrls = dead.map((r) => r.url);
            const submitResults = await pingAllSearchEnginesBatchDeleted(deadUrls);

            const googleSuccess = new Map(
                submitResults.google.map((g) => [g.url, g.success] as const)
            );
            const indexNowSuccess = new Map(
                submitResults.indexNow.map((i) => [i.url, i.success] as const)
            );

            for (const row of dead) {
                const gOk = googleSuccess.get(row.url) ?? false;
                const iOk = indexNowSuccess.get(row.url) ?? false;
                if (gOk || iOk) {
                    await prisma.deindexQueue.update({
                        where: { id: row.id },
                        data: {
                            status: 'submitted',
                            submittedAt: new Date(),
                            attempt: { increment: 1 },
                            lastError: gOk && iOk ? null : (gOk ? 'IndexNow rejected' : 'Google rejected (likely quota)'),
                        },
                    });
                    submittedCount++;
                } else {
                    const gErr = submitResults.google.find((g) => g.url === row.url)?.error || 'no result';
                    const nextAttempt = row.attempt + 1;
                    await prisma.deindexQueue.update({
                        where: { id: row.id },
                        data: {
                            status: nextAttempt >= MAX_ATTEMPTS ? 'failed' : 'pending',
                            attempt: nextAttempt,
                            lastError: gErr.slice(0, 1000),
                        },
                    });
                    submitFailedCount++;
                }
            }
        }

        // 5. Bump retry counter on HEAD-check network failures.
        for (const f of failed) {
            const nextAttempt = f.row.attempt + 1;
            await prisma.deindexQueue.update({
                where: { id: f.row.id },
                data: {
                    status: nextAttempt >= MAX_ATTEMPTS ? 'failed' : 'pending',
                    attempt: nextAttempt,
                    lastError: f.error.slice(0, 1000),
                },
            });
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        const summary = {
            success: true,
            processed: candidates.length,
            live: live.length,
            submitted: submittedCount,
            submitFailed: submitFailedCount,
            headFailed: failed.length,
            duration: `${duration}s`,
            timestamp: new Date().toISOString(),
        };

        console.log('[CRON:historical-deindex] Complete:', JSON.stringify(summary));
        return NextResponse.json(summary);
    } catch (error) {
        await sendCronFailureAlert('historical-deindex', error);
        console.error('[CRON:historical-deindex] Error:', error);
        return NextResponse.json(
            {
                success: false,
                error: 'Historical de-indexing cron failed',
                details: error instanceof Error ? error.message : 'Unknown error',
                timestamp: new Date().toISOString(),
            },
            { status: 500 }
        );
    }
}
