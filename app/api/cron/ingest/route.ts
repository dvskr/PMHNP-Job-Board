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

// Allow maximum execution time for Vercel Pro plan
export const maxDuration = 300; // 5 minutes


/** Format a Date as CST/CDT for Discord display (Goal #5). */
function formatCST(d: Date): string {
  return d.toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    hour12: true,
  }) + ' CT';
}

/**
 * Send ONE consolidated summary embed per cron run (Goal #4).
 *
 * Replaced 2026-05-05: previously fired one embed per source — when an
 * ingest run touched 6 sources, the channel got 6 stacked notifications.
 * Now: one summary with a per-source table, sortable at a glance.
 */
/**
 * Group all `duplicate_*` reasons under a single "duplicates" bucket
 * and collapse the rest into 4 funnel-stage buckets so the embed stays
 * inside Discord's 1024-char field cap. The full breakdown is still in
 * `rejected_jobs` for SQL queries.
 */
function bucketRejection(reason: string): 'relevance' | 'normalizer' | 'duplicate' | 'dead' | 'other' {
  if (reason.startsWith('relevance_')) return 'relevance';
  if (reason.startsWith('normalizer_')) return 'normalizer';
  if (reason.startsWith('duplicate_')) return 'duplicate';
  if (reason === 'dead_at_ingest') return 'dead';
  return 'other';
}

async function sendIngestionSummary(args: {
  results: Array<{
    source: string;
    fetched: number;
    added: number;
    duplicates: number;
    errors: number;
    duration: number;
    rejectedByReason: Record<string, number>;
  }>;
  totalDuration: number;
  startTime: Date;
}) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl || args.results.length === 0) return;

  const totalAdded = args.results.reduce((s, r) => s + r.added, 0);
  const totalFetched = args.results.reduce((s, r) => s + r.fetched, 0);
  const totalErrors = args.results.reduce((s, r) => s + r.errors, 0);
  const hasWarning = args.results.some((r) => r.fetched === 0 || r.errors > r.added);

  // Per-source table (≤ Discord embed value cap of 1024 chars)
  const tableLines = args.results.map((r) => {
    const status = r.errors > r.added ? '⚠️' : r.fetched === 0 ? '⬜' : '✅';
    return `${status} \`${r.source.padEnd(18)}\` ${String(r.fetched).padStart(5)} → ${String(r.added).padStart(3)} added · ${String(r.duplicates).padStart(3)} dup · ${(r.duration / 1000).toFixed(0)}s`;
  });
  const tableValue = tableLines.join('\n').slice(0, 1020);

  // Funnel breakdown — answers "where did the 47k go?" for sources where
  // fetched ≫ added. Per-source rolled into 4 buckets to fit in Discord.
  const funnelLines = args.results
    .filter((r) => r.fetched >= 100) // skip tiny sources to keep the embed scannable
    .map((r) => {
      const buckets = { relevance: 0, normalizer: 0, duplicate: 0, dead: 0, other: 0 };
      for (const [reason, n] of Object.entries(r.rejectedByReason ?? {})) {
        buckets[bucketRejection(reason)] += n;
      }
      return `\`${r.source.padEnd(18)}\` rel ${String(buckets.relevance).padStart(5)} · norm ${String(buckets.normalizer).padStart(4)} · dup ${String(buckets.duplicate).padStart(4)} · dead ${String(buckets.dead).padStart(3)}`;
    });
  const funnelValue = funnelLines.join('\n').slice(0, 1020);

  const embed = {
    title: `${hasWarning ? '⚠️' : '✅'} Ingest run complete · ${totalAdded} added`,
    description: `Started ${formatCST(args.startTime)} · ran ${(args.totalDuration / 1000).toFixed(0)}s`,
    color: hasWarning ? 16776960 : 5763719,
    fields: [
      { name: `Per-source (${args.results.length})`, value: tableValue || '_no sources processed_', inline: false },
      ...(funnelLines.length > 0
        ? [{ name: 'Rejection funnel (rel / norm / dup / dead)', value: funnelValue, inline: false }]
        : []),
      { name: 'Totals', value: `**${totalAdded}** added · ${totalFetched.toLocaleString()} fetched · ${totalErrors} errors`, inline: false },
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
    const authError = await verifyCronOrAdmin(request);
    if (authError) return authError;

    const startTime = Date.now();
    const startedAt = new Date();
    console.log('\n' + '='.repeat(80));
    console.log('[CRON] JOB INGESTION CRON STARTED');
    console.log('='.repeat(80));

    // Get source, chunk, and endpoint parameters from URL
    const searchParams = request.nextUrl.searchParams;
    const sourceParam = searchParams.get('source');
    const chunkParam = searchParams.get('chunk');
    const endpointParam = searchParams.get('endpoint'); // '7d' | '6m' (fantastic-jobs-db only)

    // Determine which sources to run
    let sources: JobSource[];
    if (sourceParam) {
      if (!ALL_SOURCES.includes(sourceParam as JobSource)) {
        return NextResponse.json(
          { error: `Invalid source: "${sourceParam}". Valid: ${ALL_SOURCES.join(', ')}` },
          { status: 400 }
        );
      }
      sources = [sourceParam as JobSource];
    } else {
      sources = ALL_SOURCES;
    }

    const ingestOptions: { chunk?: number; fantasticEndpoint?: '7d' | '6m' } = {};
    if (chunkParam !== null) ingestOptions.chunk = parseInt(chunkParam, 10);
    if (endpointParam === '6m' || endpointParam === '7d') ingestOptions.fantasticEndpoint = endpointParam;
    const ingestOption = Object.keys(ingestOptions).length > 0 ? ingestOptions : undefined;

    console.log(`[CRON] Sources to process: ${sources.join(', ')}${ingestOption?.chunk !== undefined ? ` (chunk ${ingestOption.chunk})` : ''}${ingestOption?.fantasticEndpoint ? ` (endpoint ${ingestOption.fantasticEndpoint})` : ''}`);

    // Step 1: Ingest jobs from all sources
    console.log('\n[CRON] Step 1: Starting job ingestion...');
    const ingestionResults = await ingestJobs(sources, ingestOption);

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

    // Single consolidated Discord summary at end of run (Goal #4).
    await sendIngestionSummary({
      results: ingestionResults,
      totalDuration,
      startTime: startedAt,
    });

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
      await sendCronFailureAlert('ingest', error);
    console.error('[CRON] Fatal error during cron execution:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Cron job failed',
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

