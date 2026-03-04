/**
 * Daily Instagram Carousel Cron
 *
 * Vercel Cron: 5 15 * * *  (3:05 PM UTC = 9:05 AM CST)
 *
 * Posts a carousel of branded job card images to Instagram.
 * Runs 5 minutes after the Facebook cron to avoid any race conditions.
 * Supports ?dry=true for preview-only mode.
 */

import { NextRequest, NextResponse } from 'next/server';
import { runSocialPostPipeline } from '@/lib/social-post-generator';

// Instagram needs time: generate 10 PNGs + upload 10 images + post carousel
export const maxDuration = 120; // 2 minutes

function verifyCronSecret(request: NextRequest): boolean {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
        console.error('[INSTA-CRON] CRON_SECRET not configured');
        return false;
    }

    if (process.env.NODE_ENV === 'development') {
        return true;
    }

    return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
    try {
        if (!verifyCronSecret(request)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const dryRun = request.nextUrl.searchParams.get('dry') === 'true';

        console.log('\n' + '='.repeat(60));
        console.log(`[INSTA-CRON] DAILY INSTAGRAM CAROUSEL ${dryRun ? '(DRY RUN)' : ''}`);
        console.log('='.repeat(60));

        const startTime = Date.now();
        const result = await runSocialPostPipeline(dryRun, 'instagram');
        const duration = Date.now() - startTime;

        console.log(`[INSTA-CRON] Completed in ${(duration / 1000).toFixed(1)}s`);
        console.log('[INSTA-CRON] Result:', JSON.stringify(result, null, 2));

        const responseBody = {
            ...result,
            platform: 'instagram',
            timestamp: new Date().toISOString(),
            duration,
        };

        // Return 500 if the pipeline didn't actually post (so Vercel flags it as an error)
        if (!result.success || result.instagram?.posted === false) {
            console.error('[INSTA-CRON] Failed:', result.reason ?? 'Unknown reason');
            return NextResponse.json(responseBody, { status: 500 });
        }

        return NextResponse.json(responseBody);
    } catch (error) {
        console.error('[INSTA-CRON] Fatal error:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: new Date().toISOString(),
            },
            { status: 500 },
        );
    }
}

export async function POST(request: NextRequest) {
    return GET(request);
}
