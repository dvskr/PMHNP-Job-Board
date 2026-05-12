import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { ingestJobs, cleanupExpiredJobs, ALL_SOURCES, type JobSource } from '@/lib/ingestion-service';
import { requireApiAdmin } from '@/lib/auth/require-api-admin';

/**
 * Admin API wrapper for triggering ingestion
 * Handles authentication server-side
 */
export async function POST(request: NextRequest) {
  // Verify admin session
  const authError = await requireApiAdmin();
  if (authError) return authError;

  try {
    const body = await request.json().catch(() => ({}));
    const source = body.source;

    logger.info(`[Admin] Triggering ingestion for: ${source || 'all sources'}`);

    // Determine sources. Previously the "all sources" fallback was
    // hard-coded to `['greenhouse', 'lever']`, which silently excluded
    // every aggregator added since (Ashby, BambooHR, JazzHR, Workable,
    // USAJobs, DocCafe, HealthCareerCenter, etc.). Pull from the
    // registry's `ALL_SOURCES` so new adapters are automatically picked
    // up by the admin "trigger all" action.
    const sources: JobSource[] = source
      ? [source as JobSource]
      : ALL_SOURCES;

    // Direct call (Bypasses HTTP/Vercel Auth issues)
    const ingestionResults = await ingestJobs(sources);

    // Calculate summary
    const ingestionSummary = ingestionResults.reduce(
      (acc, r) => ({
        totalFetched: acc.totalFetched + r.fetched,
        totalAdded: acc.totalAdded + r.added,
        totalDuplicates: acc.totalDuplicates + r.duplicates,
        totalErrors: acc.totalErrors + r.errors,
      }),
      { totalFetched: 0, totalAdded: 0, totalDuplicates: 0, totalErrors: 0 }
    );

    // Cleanup (optional, but good to keep consistent)
    await cleanupExpiredJobs();

    logger.info(`[Admin] Ingestion complete:`, ingestionSummary);

    return NextResponse.json({
      success: true,
      ingestion: {
        results: ingestionResults,
        summary: ingestionSummary,
      },
    });

  } catch (error) {
    logger.error('[Admin] Error triggering ingestion:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to trigger ingestion',
      },
      { status: 500 }
    );
  }
}

