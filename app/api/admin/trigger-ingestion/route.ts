import { NextRequest, NextResponse } from 'next/server';

/**
 * Admin API wrapper for triggering ingestion
 * Handles authentication server-side
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const source = body.source;

    console.log(`[Admin] Triggering ingestion for: ${source || 'all sources'}`);

    // Build the URL for the cron endpoint
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com';
    const cronUrl = source 
      ? `${baseUrl}/api/cron/ingest?source=${source}`
      : `${baseUrl}/api/cron/ingest`;

    // Call the cron endpoint with server-side authentication
    const response = await fetch(cronUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.CRON_SECRET}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ingestion failed: ${response.status} ${errorText}`);
    }

    const result = await response.json();

    console.log(`[Admin] Ingestion complete:`, result.ingestion?.summary);

    return NextResponse.json({
      success: true,
      ...result,
    });

  } catch (error) {
    console.error('[Admin] Error triggering ingestion:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to trigger ingestion',
      },
      { status: 500 }
    );
  }
}

