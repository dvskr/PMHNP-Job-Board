import { NextRequest, NextResponse } from 'next/server';
import { sendExpiryWarnings } from '@/lib/expiry-checker';

export async function POST(request: NextRequest) {
  try {
    // Verify authorization from Vercel Cron
    const authHeader = request.headers.get('authorization');
    const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;

    if (!process.env.CRON_SECRET) {
      console.error('CRON_SECRET not configured');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    if (authHeader !== expectedAuth) {
      console.error('Unauthorized cron request');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('Starting expiry warnings cron job...');
    
    // Run the expiry warnings check
    const result = await sendExpiryWarnings();

    console.log('Expiry warnings cron job completed:', result);

    // Return summary
    return NextResponse.json(
      {
        success: true,
        message: 'Expiry warnings processed',
        summary: {
          checked: result.checked,
          warningsSent: result.warningsSent,
          errors: result.errors,
        },
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error in expiry warnings cron job:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

