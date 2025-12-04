import { NextRequest, NextResponse } from 'next/server';
import { sendJobAlerts } from '@/lib/alert-sender';

const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  console.log('[Cron: send-alerts] Request received');

  // Verify authorization
  const authHeader = request.headers.get('authorization');
  
  if (!CRON_SECRET) {
    console.error('[Cron: send-alerts] CRON_SECRET not configured');
    return NextResponse.json(
      { success: false, error: 'Server configuration error' },
      { status: 500 }
    );
  }

  if (!authHeader || authHeader !== `Bearer ${CRON_SECRET}`) {
    console.warn('[Cron: send-alerts] Unauthorized request');
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    console.log('[Cron: send-alerts] Starting job alerts processing...');
    
    const summary = await sendJobAlerts();
    
    const duration = Date.now() - startTime;
    
    console.log('[Cron: send-alerts] Completed', {
      alertsProcessed: summary.alertsProcessed,
      emailsSent: summary.emailsSent,
      errorCount: summary.errors.length,
      durationMs: duration,
    });

    // Log individual errors for debugging
    if (summary.errors.length > 0) {
      console.error('[Cron: send-alerts] Errors:', summary.errors);
    }

    return NextResponse.json({
      success: true,
      summary: {
        alertsProcessed: summary.alertsProcessed,
        emailsSent: summary.emailsSent,
        errors: summary.errors,
      },
      durationMs: duration,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('[Cron: send-alerts] Fatal error:', errorMessage);

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        durationMs: duration,
      },
      { status: 500 }
    );
  }
}

// Also support GET for Vercel Cron (which uses GET by default)
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  console.log('[Cron: send-alerts] GET request received');

  // Verify authorization - Vercel Cron sends this header
  const authHeader = request.headers.get('authorization');
  
  if (!CRON_SECRET) {
    console.error('[Cron: send-alerts] CRON_SECRET not configured');
    return NextResponse.json(
      { success: false, error: 'Server configuration error' },
      { status: 500 }
    );
  }

  if (!authHeader || authHeader !== `Bearer ${CRON_SECRET}`) {
    console.warn('[Cron: send-alerts] Unauthorized request');
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    console.log('[Cron: send-alerts] Starting job alerts processing...');
    
    const summary = await sendJobAlerts();
    
    const duration = Date.now() - startTime;
    
    console.log('[Cron: send-alerts] Completed', {
      alertsProcessed: summary.alertsProcessed,
      emailsSent: summary.emailsSent,
      errorCount: summary.errors.length,
      durationMs: duration,
    });

    // Log individual errors for debugging
    if (summary.errors.length > 0) {
      console.error('[Cron: send-alerts] Errors:', summary.errors);
    }

    return NextResponse.json({
      success: true,
      summary: {
        alertsProcessed: summary.alertsProcessed,
        emailsSent: summary.emailsSent,
        errors: summary.errors,
      },
      durationMs: duration,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('[Cron: send-alerts] Fatal error:', errorMessage);

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        durationMs: duration,
      },
      { status: 500 }
    );
  }
}

