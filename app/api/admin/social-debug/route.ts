/**
 * GET /api/admin/social-debug
 *
 * Diagnostic endpoint for debugging social media post failures.
 * Checks env vars, runs the job query, and reports what would happen
 * — without actually posting anything.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/auth/require-api-admin';
import { fetchTopJobsForSocial } from '@/lib/social-post-generator';

export async function GET(request: NextRequest) {
    const authError = await requireApiAdmin(request);
    if (authError) return authError;

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

    return NextResponse.json({
        timestamp: new Date().toISOString(),
        diagnosis: issues.length > 0 ? issues : ['All checks passed — pipeline should work'],
        envVars: envChecks,
        jobQuery,
    });
}
