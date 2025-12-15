import { NextRequest, NextResponse } from 'next/server';
import {
  getSourcePerformance,
  getAllSourcesPerformance,
  getSourceTrends,
  updateDailyStats,
} from '@/lib/source-analytics';

/**
 * GET /api/analytics/sources
 * Returns source performance data
 * 
 * Query params:
 * - source: specific source to query (optional)
 * - days: number of days to look back (default: 30)
 * - includeTrends: include trend data (default: false)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const source = searchParams.get('source');
    const days = parseInt(searchParams.get('days') || '30', 10);
    const includeTrends = searchParams.get('includeTrends') === 'true';

    // Validate days parameter
    if (days < 1 || days > 365) {
      return NextResponse.json(
        { error: 'Days must be between 1 and 365' },
        { status: 400 }
      );
    }

    // Single source performance
    if (source) {
      const performance = await getSourcePerformance(source, days);
      
      if (includeTrends) {
        const trends = await getSourceTrends(source, days);
        return NextResponse.json({
          performance,
          trends,
        });
      }

      return NextResponse.json(performance);
    }

    // All sources performance
    const allPerformance = await getAllSourcesPerformance();

    if (includeTrends) {
      // Get trends for all sources if requested
      const trendsPromises = allPerformance.map(async (perf) => ({
        source: perf.source,
        trends: await getSourceTrends(perf.source, days),
      }));

      const allTrends = await Promise.all(trendsPromises);

      return NextResponse.json({
        sources: allPerformance,
        trends: allTrends,
      });
    }

    return NextResponse.json({ sources: allPerformance });
  } catch (error) {
    console.error('[API] Error getting source analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch source analytics' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/analytics/sources
 * Admin endpoint to update daily stats
 * 
 * Body:
 * - action: 'update-daily'
 */
export async function POST(request: NextRequest) {
  try {
    // Verify CRON_SECRET
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      return NextResponse.json(
        { error: 'CRON_SECRET not configured' },
        { status: 500 }
      );
    }

    const token = authHeader?.replace('Bearer ', '');
    if (token !== cronSecret) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { action } = body;

    if (action === 'update-daily') {
      await updateDailyStats();
      
      return NextResponse.json({
        success: true,
        message: 'Daily stats updated successfully',
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json(
      { error: 'Invalid action. Supported: update-daily' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[API] Error in analytics POST:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}

