/**
 * Daily Social Media Posting Cron — Facebook
 *
 * Vercel Cron: 0 14 * * *  (9 AM CST)
 *
 * Posts the top PMHNP jobs to Facebook Page.
 * Supports ?dry=true for preview-only mode.
 * Supports ?platform=all to post to Facebook and Instagram.
 */

import { NextRequest, NextResponse } from 'next/server';
import { runSocialPostPipeline, type SocialPlatform } from '@/lib/social-post-generator';
import { verifyCronOrAdmin } from '@/lib/auth/verify-cron-or-admin';

// Allow enough time for image generation + upload
export const maxDuration = 120; // 2 minutes

export async function GET(request: NextRequest) {
    try {
        const authError = await verifyCronOrAdmin(request);
        if (authError) return authError;

        const dryRun = request.nextUrl.searchParams.get('dry') === 'true';
        const platform = (request.nextUrl.searchParams.get('platform') || 'facebook') as SocialPlatform;

        console.log('\n' + '='.repeat(60));
        console.log(`[SOCIAL-CRON] DAILY SOCIAL POST — ${platform.toUpperCase()} ${dryRun ? '(DRY RUN)' : ''}`);
        console.log('='.repeat(60));

        const startTime = Date.now();
        const result = await runSocialPostPipeline(dryRun, platform);
        const duration = Date.now() - startTime;

        console.log(`[SOCIAL-CRON] Completed in ${(duration / 1000).toFixed(1)}s`);
        console.log('[SOCIAL-CRON] Result:', JSON.stringify(result, null, 2));

        const responseBody = {
            ...result,
            timestamp: new Date().toISOString(),
            duration,
        };

        // Return 500 if the pipeline didn't actually post (so Vercel flags it as an error)
        if (!result.success) {
            console.error('[SOCIAL-CRON] Failed:', result.reason ?? 'Unknown reason');
            return NextResponse.json(responseBody, { status: 500 });
        }

        return NextResponse.json(responseBody);
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
