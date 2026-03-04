/**
 * Daily X (Twitter) Post Cron
 *
 * Vercel Cron: 15 15 * * *  (3:15 PM UTC = 9:15 AM CST)
 *
 * Posts top PMHNP jobs with a summary image to X.
 * Runs 15 minutes after the Facebook cron.
 * Supports ?dry=true for preview-only mode.
 */

import { NextRequest, NextResponse } from 'next/server';
import { runSocialPostPipeline } from '@/lib/social-post-generator';

export const maxDuration = 60; // 1 minute (only 1 image to generate)

function verifyCronSecret(request: NextRequest): boolean {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
        console.error('[X-CRON] CRON_SECRET not configured');
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
        console.log(`[X-CRON] DAILY X POST ${dryRun ? '(DRY RUN)' : ''}`);
        console.log('='.repeat(60));

        const startTime = Date.now();
        const result = await runSocialPostPipeline(dryRun, 'x');
        const duration = Date.now() - startTime;

        console.log(`[X-CRON] Completed in ${(duration / 1000).toFixed(1)}s`);
        console.log('[X-CRON] Result:', JSON.stringify(result, null, 2));

        const responseBody = {
            ...result,
            platform: 'x',
            timestamp: new Date().toISOString(),
            duration,
        };

        if (!result.success || result.x?.posted === false) {
            console.error('[X-CRON] Failed:', result.reason ?? 'Unknown reason');
            return NextResponse.json(responseBody, { status: 500 });
        }

        return NextResponse.json(responseBody);
    } catch (error) {
        console.error('[X-CRON] Fatal error:', error);
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
