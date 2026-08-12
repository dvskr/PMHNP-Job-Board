import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { pingAllSearchEnginesBatch, summarizeBingResults } from '@/lib/search-indexing';
import { slugify } from '@/lib/utils';
import { verifyCronOrAdmin } from '@/lib/auth/verify-cron-or-admin';
import { sendCronFailureAlert } from '@/lib/discord-notifier';
import { withCronTracking } from '@/lib/cron/track';
import { logger } from '@/lib/logger';

export const maxDuration = 300; // 5 minutes — submits 200+ URLs to search engines

const BASE_URL = 'https://pmhnphiring.com';

/**
 * Daily cron: submit recently created/updated job URLs to
 * Google Indexing API, Bing Webmaster API, and IndexNow.
 *
 * - Fetches jobs created or updated in the last 25 hours (overlap buffer)
 * - Google: up to 200/day (handled by pingAllSearchEnginesBatch)
 * - Bing: batch up to 500 at once
 * - IndexNow: batch up to 10,000 at once
 */
export async function GET(request: NextRequest) {
    // Verify cron secret
    const authError = await verifyCronOrAdmin(request);
    if (authError) return authError;

    const startTime = Date.now();
    logger.info('[CRON:index-urls] Starting daily search engine indexing');

    try {
        return await withCronTracking('index-urls', async () => {
            // Fetch jobs from the last 25 hours (1 hour overlap to avoid missing any)
            const since = new Date();
            since.setHours(since.getHours() - 25);

            const recentJobs = await prisma.job.findMany({
                where: {
                    isPublished: true,
                    OR: [
                        { createdAt: { gte: since } },
                        { updatedAt: { gte: since } },
                    ],
                },
                select: {
                    id: true,
                    title: true,
                    sourceType: true,
                },
                orderBy: { createdAt: 'desc' },
            });

            if (recentJobs.length === 0) {
                logger.info('[CRON:index-urls] No new/updated jobs to index');
                return {
                    response: NextResponse.json({
                        success: true,
                        message: 'No new jobs to index',
                        jobCount: 0,
                        duration: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
                        timestamp: new Date().toISOString(),
                    }),
                    metrics: { jobCount: 0 },
                };
            }

            // Employer-posted jobs claim the Google Indexing API slice FIRST.
            // pingAllSearchEnginesBatch caps Google at 100/day and fills the
            // quota in array order, so pure recency ordering let scraped churn
            // crowd paying employers out of the slice on busy ingest days.
            // Partition keeps the total attempt count within the existing cap.
            const employerJobs = recentJobs.filter((job) => job.sourceType === 'employer');
            const scrapedJobs = recentJobs.filter((job) => job.sourceType !== 'employer');
            const orderedJobs = [...employerJobs, ...scrapedJobs];

            // Build full URLs (employer URLs first — Google slice is positional)
            const urls = orderedJobs.map((job) => {
                const slug = slugify(job.title, job.id);
                return `${BASE_URL}/jobs/${slug}`;
            });

            logger.info('[CRON:index-urls] Submitting URLs to search engines', {
                urlCount: urls.length,
                employerJobCount: employerJobs.length,
            });

            // Submit to all engines (Google, Bing, IndexNow)
            const results = await pingAllSearchEnginesBatch(urls);

            const googleSuccess = results.google.filter((r) => r.success).length;
            const googleFailed = results.google.filter((r) => !r.success).length;
            // Bing splits three ways: submitted, rejected, and never-sent.
            // Lumping the last two together is what made the daily-quota cap
            // read as "500 failures" every run with no reason attached.
            const bing = summarizeBingResults(results.bing);
            const indexNowSuccess = results.indexNow.filter((r) => r.success).length;
            const indexNowFailed = results.indexNow.filter((r) => !r.success).length;
            const indexNowFirstError = results.indexNow.find((r) => !r.success)?.error;

            // IndexNow failures used to vanish: a missing key or endpoint
            // rejection still produced a green run. Total failure now pages the
            // same Discord channel this cron's catch block already alerts.
            if (indexNowFailed > 0 && indexNowSuccess === 0) {
                await sendCronFailureAlert(
                    'index-urls (IndexNow)',
                    new Error(`IndexNow rejected or skipped all ${indexNowFailed} URLs: ${indexNowFirstError ?? 'unknown error'}`)
                );
            }

            const duration = ((Date.now() - startTime) / 1000).toFixed(1);

            const summary = {
                success: true,
                jobCount: urls.length,
                employerJobCount: employerJobs.length,
                google: { submitted: googleSuccess, failed: googleFailed },
                bing: {
                    submitted: bing.submitted,
                    failed: bing.failed,
                    skipped: bing.skipped,
                    ...(bing.reason ? { reason: bing.reason } : {}),
                },
                indexNow: {
                    submitted: indexNowSuccess,
                    failed: indexNowFailed,
                    ...(indexNowFirstError ? { error: indexNowFirstError } : {}),
                },
                duration: `${duration}s`,
                timestamp: new Date().toISOString(),
            };

            logger.info('[CRON:index-urls] Complete', summary);

            return {
                response: NextResponse.json(summary),
                metrics: {
                    jobCount: urls.length,
                    employerJobCount: employerJobs.length,
                    googleSubmitted: googleSuccess,
                    googleFailed,
                    bingSubmitted: bing.submitted,
                    bingFailed: bing.failed,
                    bingSkipped: bing.skipped,
                    ...(bing.reason ? { bingReason: bing.reason } : {}),
                    indexNowSubmitted: indexNowSuccess,
                    indexNowFailed,
                    ...(indexNowFirstError ? { indexNowFirstError } : {}),
                },
            };
        });
    } catch (error) {
        await sendCronFailureAlert('index-urls', error);
        logger.error('[CRON:index-urls] Error', error);

        return NextResponse.json(
            {
                success: false,
                error: 'Indexing cron failed',
                details: error instanceof Error ? error.message : 'Unknown error',
                timestamp: new Date().toISOString(),
            },
            { status: 500 }
        );
    }
}
