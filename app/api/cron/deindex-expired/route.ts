import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { pingAllSearchEnginesBatchDeleted } from '@/lib/search-indexing';
import { slugify } from '@/lib/utils';
import { verifyCronOrAdmin } from '@/lib/auth/verify-cron-or-admin';
import { sendCronFailureAlert } from '@/lib/discord-notifier';

export const maxDuration = 300; // 5 minutes — may send up to 100 URL_DELETED to Google

/**
 * Dedicated de-indexing cron for expired jobs.
 * 
 * WHY THIS EXISTS:
 * The cleanup-expired cron marks jobs as unpublished, but its de-indexing
 * is a side-effect that can fail silently if the cron times out.
 * This dedicated cron runs 30 min AFTER cleanup and catches any jobs
 * that were unpublished in the last 48 hours but haven't been de-indexed yet.
 * 
 * It uses the DELETION quota (100/day Google, unlimited IndexNow) which is
 * kept separate from the creation quota used by index-urls.
 * 
 * Schedule: 45 12,18 * * * (runs twice daily, 30 min after cleanup-expired)
 */
export async function GET(request: NextRequest) {
    const authError = await verifyCronOrAdmin(request);
    if (authError) return authError;

    const startTime = Date.now();
    console.log('[CRON:deindex-expired] Starting expired URL de-indexing');

    try {
        // Find all jobs unpublished in the last 48 hours
        // (wider window than cleanup to catch any missed from previous runs)
        const since = new Date();
        since.setHours(since.getHours() - 48);

        const recentlyExpired = await prisma.job.findMany({
            where: {
                isPublished: false,
                updatedAt: { gte: since },
                // Only de-index jobs that were previously published (have a slug)
                slug: { not: null },
                // Only aggregated jobs — employer-posted jobs might be re-published
                sourceProvider: { not: null },
            },
            select: {
                id: true,
                title: true,
                slug: true,
            },
            orderBy: { updatedAt: 'desc' },
            take: 500, // Cap to prevent timeouts
        });

        if (recentlyExpired.length === 0) {
            console.log('[CRON:deindex-expired] No recently expired jobs to de-index');
            return NextResponse.json({
                success: true,
                message: 'No expired jobs to de-index',
                count: 0,
                duration: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
                timestamp: new Date().toISOString(),
            });
        }

        // Build full URLs for de-indexing
        const expiredUrls = recentlyExpired.map(job => {
            // Use slug if available, otherwise build from title+id
            const slug = job.slug || slugify(job.title, job.id);
            return `https://pmhnphiring.com/jobs/${slug}`;
        });

        console.log(`[CRON:deindex-expired] De-indexing ${expiredUrls.length} expired URLs...`);

        // Send URL_DELETED to Google + IndexNow batch
        const results = await pingAllSearchEnginesBatchDeleted(expiredUrls);

        const googleOk = results.google.filter(r => r.success).length;
        const googleFailed = results.google.filter(r => !r.success).length;
        const indexNowOk = results.indexNow.filter(r => r.success).length;
        const indexNowFailed = results.indexNow.filter(r => !r.success).length;

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);

        const summary = {
            success: true,
            expiredCount: recentlyExpired.length,
            google: { deleted: googleOk, failed: googleFailed },
            indexNow: { deleted: indexNowOk, failed: indexNowFailed },
            duration: `${duration}s`,
            timestamp: new Date().toISOString(),
        };

        console.log('[CRON:deindex-expired] Complete:', JSON.stringify(summary));

        return NextResponse.json(summary);
    } catch (error) {
        await sendCronFailureAlert('deindex-expired', error);
        console.error('[CRON:deindex-expired] Error:', error);

        return NextResponse.json(
            {
                success: false,
                error: 'De-indexing cron failed',
                details: error instanceof Error ? error.message : 'Unknown error',
                timestamp: new Date().toISOString(),
            },
            { status: 500 }
        );
    }
}
