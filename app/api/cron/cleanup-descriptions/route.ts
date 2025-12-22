import { NextRequest, NextResponse } from 'next/server';
import { cleanAllJobDescriptions } from '@/lib/description-cleaner';

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

    console.log('[CLEANUP API] Starting description cleanup...');
    
    const result = await cleanAllJobDescriptions();
    
    const response = {
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    };
    
    console.log('[CLEANUP API] Complete:', response);
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('[CLEANUP API] Error:', error);
    return NextResponse.json(
      { error: 'Cleanup failed' },
      { status: 500 }
    );
  }
}

