/**
 * Daily LinkedIn Carousel Cron
 *
 * Vercel Cron: 10 15 * * *  (3:10 PM UTC = 9:10 AM CST)
 *
 * Posts a carousel of branded job card images to LinkedIn.
 * Runs 10 minutes after the Facebook cron.
 * Supports ?dry=true for preview-only mode.
 */

import { NextRequest, NextResponse } from 'next/server';
import { runSocialPostPipeline } from '@/lib/social-post-generator';

export const maxDuration = 120; // 2 minutes

function verifyCronSecret(request: NextRequest): boolean {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
        console.error('[LINKEDIN-CRON] CRON_SECRET not configured');
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
        console.log(`[LINKEDIN-CRON] DAILY LINKEDIN CAROUSEL ${dryRun ? '(DRY RUN)' : ''}`);
        console.log('='.repeat(60));

        const startTime = Date.now();
        const result = await runSocialPostPipeline(dryRun, 'linkedin');
        const duration = Date.now() - startTime;

        console.log(`[LINKEDIN-CRON] Completed in ${(duration / 1000).toFixed(1)}s`);
        console.log('[LINKEDIN-CRON] Result:', JSON.stringify(result, null, 2));

        const responseBody = {
            ...result,
            platform: 'linkedin',
            timestamp: new Date().toISOString(),
            duration,
        };

        if (!result.success || result.linkedin?.posted === false) {
            console.error('[LINKEDIN-CRON] Failed:', result.reason ?? 'Unknown reason');
            return NextResponse.json(responseBody, { status: 500 });
        }

        return NextResponse.json(responseBody);
    } catch (error) {
        console.error('[LINKEDIN-CRON] Fatal error:', error);
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
