import { NextRequest, NextResponse } from 'next/server';
import { parseAllLocations } from '@/lib/location-parser';

/**
 * Verify CRON_SECRET for authentication
 */
function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    console.error('[Parse Locations] CRON_SECRET not set');
    return false;
  }

  if (!authHeader) {
    console.error('[Parse Locations] No authorization header');
    return false;
  }

  const token = authHeader.replace('Bearer ', '');
  return token === secret;
}

/**
 * POST /api/jobs/parse-locations
 * Manually trigger location parsing for all jobs
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    if (!verifyCronSecret(request)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('[Parse Locations] Starting manual location parsing...');
    const startTime = Date.now();

    // Parse all locations
    const results = await parseAllLocations();

    const duration = Date.now() - startTime;

    console.log('[Parse Locations] Complete:', {
      processed: results.processed,
      parsed: results.parsed,
      remote: results.remote,
      duration: `${(duration / 1000).toFixed(1)}s`,
    });

    return NextResponse.json({
      success: true,
      results: {
        processed: results.processed,
        parsed: results.parsed,
        remote: results.remote,
        duration,
      },
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[Parse Locations] Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to parse locations',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/jobs/parse-locations
 * Same as POST (for convenience)
 */
export async function GET(request: NextRequest) {
  return POST(request);
}

