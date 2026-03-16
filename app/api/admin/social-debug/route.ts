/**
 * GET /api/admin/social-debug
 *
 * Diagnostic endpoint for debugging social media post failures.
 * 
 * Modes:
 *   - Default: checks env vars + job query (fast, no side effects)
 *   - ?test=pipeline: runs full pipeline in dry-run (tests image generation)
 *   - ?test=instagram: runs the actual Instagram pipeline (will post!)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/auth/require-api-admin';
import {
    fetchTopJobsForSocial,
    generateCarouselImages,
    uploadCarouselImages,
    buildInstagramCaption,
    runSocialPostPipeline,
} from '@/lib/social-post-generator';

export async function GET(request: NextRequest) {
    const authError = await requireApiAdmin(request);
    if (authError) return authError;

    const testMode = request.nextUrl.searchParams.get('test');

    const envChecks = {
        POSTIZ_API_KEY: !!process.env.POSTIZ_API_KEY,
        POSTIZ_API_KEY_length: process.env.POSTIZ_API_KEY?.length ?? 0,
        POSTIZ_FB_INTEGRATION_ID: process.env.POSTIZ_FB_INTEGRATION_ID ?? '(not set)',
        POSTIZ_INSTAGRAM_INTEGRATION_ID: process.env.POSTIZ_INSTAGRAM_INTEGRATION_ID ?? '(not set)',
        CRON_SECRET: !!process.env.CRON_SECRET,
    };

    let jobQuery: { count: number; sampleTitles: string[]; error?: string } = {
        count: 0,
        sampleTitles: [],
    };

    try {
        const jobs = await fetchTopJobsForSocial();
        jobQuery = {
            count: jobs.length,
            sampleTitles: jobs.slice(0, 3).map(j => `${j.title} @ ${j.employer}`),
        };
    } catch (err) {
        jobQuery.error = err instanceof Error ? err.message : String(err);
    }

    // Determine the likely failure reason
    const issues: string[] = [];
    if (!envChecks.POSTIZ_API_KEY) issues.push('POSTIZ_API_KEY is not set');
    if (envChecks.POSTIZ_INSTAGRAM_INTEGRATION_ID === '(not set)') issues.push('POSTIZ_INSTAGRAM_INTEGRATION_ID is not set');
    if (envChecks.POSTIZ_INSTAGRAM_INTEGRATION_ID === '') issues.push('POSTIZ_INSTAGRAM_INTEGRATION_ID is set but EMPTY');
    if (envChecks.POSTIZ_FB_INTEGRATION_ID === '(not set)') issues.push('POSTIZ_FB_INTEGRATION_ID is not set');
    if (envChecks.POSTIZ_FB_INTEGRATION_ID === '') issues.push('POSTIZ_FB_INTEGRATION_ID is set but EMPTY');
    if (jobQuery.count === 0 && !jobQuery.error) issues.push('No qualifying jobs found in last 24 hours (query returned 0 results)');
    if (jobQuery.error) issues.push(`Job query failed: ${jobQuery.error}`);

    const baseResult = {
        timestamp: new Date().toISOString(),
        diagnosis: issues.length > 0 ? issues : ['All checks passed — pipeline should work'],
        envVars: envChecks,
        jobQuery,
    };

    // ── ?test=pipeline — test image generation + upload (no posting) ──
    if (testMode === 'pipeline' && jobQuery.count > 0) {
        const pipelineTest: Record<string, unknown> = { steps: {} };
        try {
            const jobs = await fetchTopJobsForSocial();
            const testJobs = jobs.slice(0, 2); // Only test with 2 jobs to be faster

            // Step 1: Generate images
            const imgStart = Date.now();
            const images = await generateCarouselImages(testJobs);
            pipelineTest.steps = {
                ...pipelineTest.steps as object,
                imageGeneration: {
                    success: true,
                    count: images.length,
                    sizes: images.map((b, i) => `image-${i + 1}: ${(b.length / 1024).toFixed(1)}KB`),
                    durationMs: Date.now() - imgStart,
                },
            };

            // Step 2: Upload images
            const uploadStart = Date.now();
            const uploaded = await uploadCarouselImages(images);
            pipelineTest.steps = {
                ...pipelineTest.steps as object,
                imageUpload: {
                    success: true,
                    count: uploaded.length,
                    ids: uploaded.map(u => u.id),
                    durationMs: Date.now() - uploadStart,
                },
            };

            // Step 3: Build caption (no-op, just verify)
            const caption = buildInstagramCaption(testJobs);
            pipelineTest.steps = {
                ...pipelineTest.steps as object,
                captionBuild: { success: true, length: caption.length },
            };

            pipelineTest.overallSuccess = true;
            pipelineTest.note = 'Pipeline test passed! Images generated and uploaded. Did NOT post to Instagram.';
        } catch (err) {
            pipelineTest.overallSuccess = false;
            pipelineTest.error = err instanceof Error ? err.message : String(err);
            pipelineTest.stack = err instanceof Error ? err.stack : undefined;
        }

        return NextResponse.json({ ...baseResult, pipelineTest });
    }

    // ── ?test=instagram — actually run the Instagram cron ──
    if (testMode === 'instagram') {
        try {
            const result = await runSocialPostPipeline(false, 'instagram');
            return NextResponse.json({ ...baseResult, liveTest: result });
        } catch (err) {
            return NextResponse.json({
                ...baseResult,
                liveTest: {
                    success: false,
                    error: err instanceof Error ? err.message : String(err),
                    stack: err instanceof Error ? err.stack : undefined,
                },
            });
        }
    }

    return NextResponse.json(baseResult);
}

