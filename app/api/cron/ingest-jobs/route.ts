import { NextRequest, NextResponse } from 'next/server';
import { ingestJobs } from '@/lib/ingestion-service';

export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel sends this automatically)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    console.log('[CRON] Starting scheduled job ingestion');
    
    // Run comprehensive ingestion for all sources
    const results = await ingestJobs(['adzuna', 'usajobs', 'greenhouse', 'lever', 'jooble']);
    
    // Calculate totals
    const totals = results.reduce(
      (acc, r) => ({
        fetched: acc.fetched + r.fetched,
        added: acc.added + r.added,
        duplicates: acc.duplicates + r.duplicates,
        errors: acc.errors + r.errors,
        duration: acc.duration + r.duration,
      }),
      { fetched: 0, added: 0, duplicates: 0, errors: 0, duration: 0 }
    );
    
    const summary = {
      results,
      totals,
      timestamp: new Date().toISOString(),
    };
    
    console.log('[CRON] Job ingestion complete:', summary);
    
    return NextResponse.json({ success: true, ...summary });
  } catch (error) {
    console.error('[CRON] Ingest-jobs error:', error);
    return NextResponse.json({ error: 'Ingestion failed' }, { status: 500 });
  }
}

