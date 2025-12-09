import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel sends this automatically)
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  try {
    // Import and run ingestion for all sources
    const { ingestJobs } = await import('@/lib/ingestion-service')
    
    const results = await Promise.all([
      ingestJobs('adzuna'),
      ingestJobs('usajobs'),
      ingestJobs('greenhouse'),
      ingestJobs('lever'),
    ])
    
    const summary = {
      adzuna: results[0],
      usajobs: results[1],
      greenhouse: results[2],
      lever: results[3],
      timestamp: new Date().toISOString(),
    }
    
    console.log('Job ingestion complete:', summary)
    
    return NextResponse.json({ success: true, summary })
  } catch (error) {
    console.error('Cron ingest-jobs error:', error)
    return NextResponse.json({ error: 'Ingestion failed' }, { status: 500 })
  }
}

