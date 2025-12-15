import { NextRequest, NextResponse } from 'next/server';
import { ingestJobs, type JobSource } from '@/lib/ingestion-service';

interface IngestRequestBody {
  sources?: string[];
}

export async function POST(request: NextRequest) {
  try {
    // Verify authorization
    const authHeader = request.headers.get('Authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error('CRON_SECRET not configured');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse request body
    const body: IngestRequestBody = await request.json().catch(() => ({}));
    
    // Default to all sources if none provided
    const sources = (body.sources && Array.isArray(body.sources) && body.sources.length > 0)
      ? body.sources as JobSource[]
      : ['adzuna', 'usajobs', 'greenhouse', 'lever', 'jooble', 'careerjet'];

    console.log(`[API] Starting ingestion for sources: ${sources.join(', ')}`);

    // Run comprehensive ingestion (new service handles everything)
    const results = await ingestJobs(sources);

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

    return NextResponse.json({
      success: true,
      results,
      totals,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error in ingest API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

