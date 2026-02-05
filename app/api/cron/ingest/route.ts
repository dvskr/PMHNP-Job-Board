import { NextRequest, NextResponse } from 'next/server';
import {
  ingestJobs,
  cleanupExpiredJobs,
  getIngestionStats,
  type JobSource
} from '@/lib/ingestion-service';

/**
 * Verify the cron secret from the request headers
 */
function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('[CRON] CRON_SECRET not configured');
    return false;
  }

  if (process.env.NODE_ENV === 'development') {
    return true;
  }

  return authHeader === `Bearer ${cronSecret}`;
}


async function sendDiscordNotification(data: {
  source: string;
  fetched: number;
  added: number;
  duplicates: number;
  errors: number;
  duration: number;
}) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const isWarning = data.fetched === 0 || data.errors > data.added;

  const embed = {
    title: isWarning ? '⚠️ Ingestion Warning' : '✅ Ingestion Complete',
    color: isWarning ? 16776960 : 5763719,
    fields: [
      { name: 'Source', value: data.source.toUpperCase(), inline: true },
      { name: 'Fetched', value: String(data.fetched), inline: true },
      { name: 'New Jobs', value: String(data.added), inline: true },
      { name: 'Duplicates', value: String(data.duplicates), inline: true },
      { name: 'Errors', value: String(data.errors), inline: true },
      { name: 'Duration', value: (data.duration / 1000).toFixed(1) + 's', inline: true },
    ],
    timestamp: new Date().toISOString(),
  };

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });
  } catch (e) {
    console.error('Discord notification failed:', e);
  }
}

/**
 * GET handler for cron job ingestion
 * Can be called by Vercel Cron or manually
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authorization
    if (!verifyCronSecret(request)) {
      console.warn('[CRON] Unauthorized access attempt');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const startTime = Date.now();
    console.log('\n' + '='.repeat(80));
    console.log('[CRON] JOB INGESTION CRON STARTED');
    console.log('='.repeat(80));

    // Get source parameter from URL (optional)
    const searchParams = request.nextUrl.searchParams;
    const sourceParam = searchParams.get('source');

    // Determine which sources to run
    const sources: JobSource[] = sourceParam
      ? [sourceParam as JobSource]
      : ['adzuna', 'jooble', 'greenhouse', 'lever', 'usajobs', 'careerjet', 'jsearch']; // All active sources

    console.log(`[CRON] Sources to process: ${sources.join(', ')}`);

    // Step 1: Ingest jobs from all sources
    console.log('\n[CRON] Step 1: Starting job ingestion...');
    const ingestionResults = await ingestJobs(sources);

    // Send notifications for each source
    for (const result of ingestionResults) {
      await sendDiscordNotification(result);
    }

    // Calculate ingestion summary
    const ingestionSummary = ingestionResults.reduce(
      (acc, r) => ({
        totalFetched: acc.totalFetched + r.fetched,
        totalAdded: acc.totalAdded + r.added,
        totalDuplicates: acc.totalDuplicates + r.duplicates,
        totalErrors: acc.totalErrors + r.errors,
      }),
      { totalFetched: 0, totalAdded: 0, totalDuplicates: 0, totalErrors: 0 }
    );

    console.log('\n[CRON] Ingestion Summary:', ingestionSummary);

    // Step 2: Cleanup expired jobs
    console.log('\n[CRON] Step 2: Cleaning up expired jobs...');
    const expiredJobsRemoved = await cleanupExpiredJobs();

    // Step 3: Get current database stats
    console.log('\n[CRON] Step 3: Fetching current stats...');
    const currentStats = await getIngestionStats();

    const totalDuration = Date.now() - startTime;

    console.log('\n' + '='.repeat(80));
    console.log('[CRON] JOB INGESTION CRON COMPLETE');
    console.log(`[CRON] Total Duration: ${(totalDuration / 1000).toFixed(1)}s`);
    console.log('='.repeat(80) + '\n');

    // Return comprehensive response
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      duration: totalDuration,
      ingestion: {
        results: ingestionResults,
        summary: ingestionSummary,
      },
      cleanup: {
        expiredJobsRemoved,
      },
      currentStats,
    });

  } catch (error) {
    console.error('[CRON] Fatal error during cron execution:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
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

