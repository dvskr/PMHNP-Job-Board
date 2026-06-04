/**
 * Daily Instagram Carousel Cron
 *
 * PAUSED 2026-05-08 — schedule entry removed from vercel.json. The route
 * handler stays intact so re-enabling is just a one-line add-back to
 * vercel.json's `crons` array. Reason: pending optimization of social
 * post strategy. Manual triggering (?dry=true / admin auth) still works.
 *
 * To re-enable, add this back to vercel.json (note: the previous entry
 * used `5 14 * * *` in vercel.json even though the comment below says
 * 15:05 UTC; vercel.json wins):
 *   { "path": "/api/cron/instagram-post", "schedule": "5 14 * * *" }
 *
 * Original Vercel Cron: 5 15 * * *  (3:05 PM UTC = 9:05 AM CST)
 *
 * Posts a carousel of branded job card images to Instagram.
 * Runs 5 minutes after the Facebook cron to avoid any race conditions.
 * Supports ?dry=true for preview-only mode.
 */

import { NextRequest, NextResponse } from 'next/server';
import { runSocialPostPipeline } from '@/lib/social-post-generator';
import { verifyCronOrAdmin } from '@/lib/auth/verify-cron-or-admin';
import { sendCronFailureAlert } from '@/lib/discord-notifier';
import { withCronTracking } from '@/lib/cron/track';

// Instagram needs time: generate 10 PNGs + upload 10 images + post carousel
export const maxDuration = 120; // 2 minutes

export async function GET(request: NextRequest) {
    const authError = await verifyCronOrAdmin(request);
    if (authError) return authError;

    try {
        return await withCronTracking('instagram-post', async () => {
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
                return {
                    response: NextResponse.json(responseBody, { status: 500 }),
                    metrics: {
                        dryRun,
                        success: result.success ?? false,
                        posted: result.instagram?.posted ?? false,
                        durationMs: duration,
                    },
                };
            }

            return {
                response: NextResponse.json(responseBody),
                metrics: {
                    dryRun,
                    success: result.success ?? true,
                    posted: result.instagram?.posted ?? true,
                    durationMs: duration,
                },
            };
        });
    } catch (error) {
        await sendCronFailureAlert('instagram-post', error);
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
