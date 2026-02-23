/**
 * Daily Social Media Posting Cron
 *
 * Vercel Cron: 0 15 * * *  (3 PM UTC = 9 AM CST)
 *
 * Posts the top PMHNP jobs to:
 *  - Facebook Page (single text + link post)
 *  - Instagram (carousel of branded job card images)
 *
 * Supports ?dry=true for preview-only mode.
 */

import { NextRequest, NextResponse } from 'next/server';
import { runSocialPostPipeline } from '@/lib/social-post-generator';

function verifyCronSecret(request: NextRequest): boolean {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
        console.error('[SOCIAL-CRON] CRON_SECRET not configured');
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
        console.log(`[SOCIAL-CRON] DAILY SOCIAL POST ${dryRun ? '(DRY RUN)' : ''}`);
        console.log('='.repeat(60));

        const startTime = Date.now();
        const result = await runSocialPostPipeline(dryRun);
        const duration = Date.now() - startTime;

        console.log(`[SOCIAL-CRON] Completed in ${(duration / 1000).toFixed(1)}s`);
        console.log('[SOCIAL-CRON] Result:', JSON.stringify(result, null, 2));

        return NextResponse.json({
            ...result,
            timestamp: new Date().toISOString(),
            duration,
        });
    } catch (error) {
        console.error('[SOCIAL-CRON] Fatal error:', error);
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
