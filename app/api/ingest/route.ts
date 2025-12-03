import { NextRequest, NextResponse } from 'next/server';
import { ingestJobs } from '@/lib/ingestion-service';

interface IngestRequestBody {
  sources: string[];
}

interface SourceResult {
  source: string;
  added: number;
  skipped: number;
  errors: number;
  total: number;
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
    const body: IngestRequestBody = await request.json();
    
    // Default to all sources if none provided
    const sources = (body.sources && Array.isArray(body.sources) && body.sources.length > 0)
      ? body.sources
      : ['adzuna', 'usajobs', 'greenhouse', 'lever'];

    // Process each source
    const results: SourceResult[] = [];

    for (const source of sources) {
      const result = await ingestJobs(source);
      results.push({
        source,
        ...result,
      });
    }

    // Calculate totals
    const totals = results.reduce(
      (acc, r) => ({
        added: acc.added + r.added,
        skipped: acc.skipped + r.skipped,
        errors: acc.errors + r.errors,
        total: acc.total + r.total,
      }),
      { added: 0, skipped: 0, errors: 0, total: 0 }
    );

    return NextResponse.json({
      success: true,
      results,
      totals,
    });
  } catch (error) {
    console.error('Error in ingest API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

