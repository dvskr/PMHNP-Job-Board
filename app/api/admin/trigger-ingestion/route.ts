import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { ingestJobs, cleanupExpiredJobs, type JobSource } from '@/lib/ingestion-service';

/**
 * Admin API wrapper for triggering ingestion
 * Handles authentication server-side
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const source = body.source;

    logger.info(`[Admin] Triggering ingestion for: ${source || 'all sources'}`);

    // Determine sources
    const sources: JobSource[] = source
      ? [source as JobSource]
      : ['usajobs', 'greenhouse', 'lever', 'jsearch'];

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

