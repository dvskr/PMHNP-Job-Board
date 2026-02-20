import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { pingAllSearchEnginesBatch } from '@/lib/search-indexing';
import { slugify } from '@/lib/utils';

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
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const startTime = Date.now();
    console.log('[CRON:index-urls] Starting daily search engine indexing');

    try {
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
            },
            orderBy: { createdAt: 'desc' },
        });

        if (recentJobs.length === 0) {
            console.log('[CRON:index-urls] No new/updated jobs to index');
            return NextResponse.json({
                success: true,
                message: 'No new jobs to index',
                jobCount: 0,
                duration: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
                timestamp: new Date().toISOString(),
            });
        }

        // Build full URLs
        const urls = recentJobs.map((job) => {
            const slug = slugify(job.title, job.id);
            return `${BASE_URL}/jobs/${slug}`;
        });

        console.log(`[CRON:index-urls] Submitting ${urls.length} URLs to search engines`);

        // Submit to all engines (Google, Bing, IndexNow)
        const results = await pingAllSearchEnginesBatch(urls);

        const googleSuccess = results.google.filter((r) => r.success).length;
        const googleFailed = results.google.filter((r) => !r.success).length;
        const bingSuccess = results.bing.filter((r) => r.success).length;
        const bingFailed = results.bing.filter((r) => !r.success).length;
        const indexNowSuccess = results.indexNow.filter((r) => r.success).length;
        const indexNowFailed = results.indexNow.filter((r) => !r.success).length;

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);

        const summary = {
            success: true,
            jobCount: urls.length,
            google: { submitted: googleSuccess, failed: googleFailed },
            bing: { submitted: bingSuccess, failed: bingFailed },
            indexNow: { submitted: indexNowSuccess, failed: indexNowFailed },
            duration: `${duration}s`,
            timestamp: new Date().toISOString(),
        };

        console.log('[CRON:index-urls] Complete:', JSON.stringify(summary));

        return NextResponse.json(summary);
    } catch (error) {
        console.error('[CRON:index-urls] Error:', error);

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
