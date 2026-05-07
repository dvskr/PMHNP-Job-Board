import { NextRequest, NextResponse } from 'next/server';
import {
  ingestJobs,
  cleanupExpiredJobs,
  getIngestionStats,
  ALL_SOURCES,
  type JobSource
} from '@/lib/ingestion-service';
import { verifyCronOrAdmin } from '@/lib/auth/verify-cron-or-admin';
import { sendCronFailureAlert } from '@/lib/discord-notifier';
import { withCronTracking } from '@/lib/cron/track';

// Allow maximum execution time for Vercel Pro plan
export const maxDuration = 300; // 5 minutes


/**
 * GET handler for cron job ingestion
 * Can be called by Vercel Cron or manually
 */
export async function GET(request: NextRequest) {
  const authError = await verifyCronOrAdmin(request);
  if (authError) return authError;

  // Wrapped with withCronTracking 2026-05-06 — every run gets logged
  // to `cron_runs` (start/finish/success/duration/metrics) so
  // missed-schedule and outlier-duration anomalies become observable.
  // The wrapper re-throws on error; the outer try/catch keeps the
  // existing user-facing alert path intact.
  try {
    return await withCronTracking('ingest', async () => {
      const startTime = Date.now();
      console.log('\n' + '='.repeat(80));
      console.log('[CRON] JOB INGESTION CRON STARTED');
      console.log('='.repeat(80));

      const searchParams = request.nextUrl.searchParams;
      const sourceParam = searchParams.get('source');
      const chunkParam = searchParams.get('chunk');
      const endpointParam = searchParams.get('endpoint');

      let sources: JobSource[];
      if (sourceParam) {
        if (!ALL_SOURCES.includes(sourceParam as JobSource)) {
          return {
            response: NextResponse.json(
              { error: `Invalid source: "${sourceParam}". Valid: ${ALL_SOURCES.join(', ')}` },
              { status: 400 },
            ),
          };
        }
        sources = [sourceParam as JobSource];
      } else {
        sources = ALL_SOURCES;
      }

      const ingestOptions: { chunk?: number; fantasticEndpoint?: '24h' | '7d' | '6m' } = {};
      if (chunkParam !== null) ingestOptions.chunk = parseInt(chunkParam, 10);
      if (endpointParam === '24h' || endpointParam === '6m' || endpointParam === '7d') ingestOptions.fantasticEndpoint = endpointParam;
      const ingestOption = Object.keys(ingestOptions).length > 0 ? ingestOptions : undefined;

      console.log(`[CRON] Sources to process: ${sources.join(', ')}${ingestOption?.chunk !== undefined ? ` (chunk ${ingestOption.chunk})` : ''}${ingestOption?.fantasticEndpoint ? ` (endpoint ${ingestOption.fantasticEndpoint})` : ''}`);

      console.log('\n[CRON] Step 1: Starting job ingestion...');
      const ingestionResults = await ingestJobs(sources, ingestOption);

      const ingestionSummary = ingestionResults.reduce(
        (acc, r) => ({
          totalFetched: acc.totalFetched + r.fetched,
          totalAdded: acc.totalAdded + r.added,
          totalDuplicates: acc.totalDuplicates + r.duplicates,
          totalErrors: acc.totalErrors + r.errors,
        }),
        { totalFetched: 0, totalAdded: 0, totalDuplicates: 0, totalErrors: 0 },
      );

      console.log('\n[CRON] Ingestion Summary:', ingestionSummary);

      console.log('\n[CRON] Step 2: Cleaning up expired jobs...');
      const expiredJobsRemoved = await cleanupExpiredJobs();

      console.log('\n[CRON] Step 3: Fetching current stats...');
      const currentStats = await getIngestionStats();

      const totalDuration = Date.now() - startTime;

      // Per-cron Discord embed REMOVED 2026-05-06 — replaced by the
      // wave-summary cron at /api/cron/ingest-wave-summary which fires
      // ~once per cron-wave (12:50 UTC + 17:55 UTC) and aggregates
      // per-cron metrics from cron_runs into a single embed. Per-source
      // detail is now persisted in cron_runs.metrics.perSource so the
      // aggregator has the data it needs.

      console.log('\n' + '='.repeat(80));
      console.log('[CRON] JOB INGESTION CRON COMPLETE');
      console.log(`[CRON] Total Duration: ${(totalDuration / 1000).toFixed(1)}s`);
      console.log('='.repeat(80) + '\n');

      return {
        response: NextResponse.json({
          success: true,
          timestamp: new Date().toISOString(),
          duration: totalDuration,
          ingestion: {
            results: ingestionResults,
            summary: ingestionSummary,
          },
          cleanup: { expiredJobsRemoved },
          currentStats,
        }),
        metrics: {
          ...ingestionSummary,
          expiredJobsRemoved,
          sourcesProcessed: ingestionResults.length,
          totalDurationMs: totalDuration,
          // Per-source breakdown. Consumed by the wave-summary cron at
          // /api/cron/ingest-wave-summary to render one Discord embed
          // per cron-wave instead of one per cron firing (Goal #4).
          perSource: ingestionResults.map((r) => ({
            source: r.source,
            chunk: ingestOption?.chunk,
            fetched: r.fetched,
            added: r.added,
            duplicates: r.duplicates,
            errors: r.errors,
            duration: r.duration,
          })),
          // Per-source API quota usage (only sources with a quota — currently
          // fantastic-jobs-db / RapidAPI Ultra). Lets the monthly 20k cap be
          // queried from cron_runs.metrics without external dashboards.
          apiCallsBySource: Object.fromEntries(
            ingestionResults
              .filter((r) => typeof r.apiCallsUsed === 'number')
              .map((r) => [r.source, r.apiCallsUsed]),
          ),
        },
      };
    });
  } catch (error) {
    await sendCronFailureAlert('ingest', error);
    console.error('[CRON] Fatal error during cron execution:', error);
    return NextResponse.json(
      { success: false, error: 'Cron job failed', timestamp: new Date().toISOString() },
      { status: 500 },
    );
  }
}

/**
 * POST handler - supports manual triggers
 * Simply delegates to GET handler
 */
export async function POST(request: NextRequest) {
  console.log('[CRON] POST request received, delegating to GET handler');
  return GET(request);
}

