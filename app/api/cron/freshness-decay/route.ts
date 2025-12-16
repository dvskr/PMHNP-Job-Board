import { NextRequest, NextResponse } from 'next/server';
import { applyFreshnessDecay } from '@/lib/freshness-decay';

export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel sends this automatically)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    console.log('[CRON] Starting freshness decay process');
    const startTime = Date.now();
    
    // Apply freshness decay to all jobs
    const results = await applyFreshnessDecay();
    
    const duration = Date.now() - startTime;
    const summary = {
      success: true,
      updated: results.updated,
      unpublished: results.unpublished,
      duration: `${(duration / 1000).toFixed(1)}s`,
      timestamp: new Date().toISOString(),
    };
    
    console.log('[CRON] Freshness decay complete:', summary);
    
    return NextResponse.json(summary);
  } catch (error) {
    console.error('[CRON] Freshness decay error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      { 
        success: false,
        error: 'Freshness decay failed',
        details: errorMessage,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

