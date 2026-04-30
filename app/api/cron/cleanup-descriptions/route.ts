import { NextRequest, NextResponse } from 'next/server';
import { cleanAllJobDescriptions } from '@/lib/description-cleaner';
import { verifyCronOrAdmin } from '@/lib/auth/verify-cron-or-admin';
import { sendCronFailureAlert } from '@/lib/discord-notifier';

export const maxDuration = 300; // 5 minutes — cleans all job descriptions

export async function POST(request: NextRequest) {
  try {
    // Verify authorization
    const authError = await verifyCronOrAdmin(request);
    if (authError) return authError;

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
      await sendCronFailureAlert('cleanup-descriptions', error);
    console.error('[CLEANUP API] Error:', error);
    return NextResponse.json(
      { error: 'Cleanup failed' },
      { status: 500 }
    );
  }
}

