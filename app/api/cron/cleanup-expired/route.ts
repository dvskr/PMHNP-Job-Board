import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyCronOrAdmin } from '@/lib/auth/verify-cron-or-admin';
import { sendCronFailureAlert } from '@/lib/discord-notifier';
import { HealthRecorder } from '@/lib/health/recorder';

export const maxDuration = 60 // 1 minute

/**
 * Daily cleanup of jobs past their expiresAt date.
 *
 * Closes Gap G1 (2026-05-06): previously did a single `updateMany` and
 * left no audit trail. Each unpublish is now recorded in `job_health_checks`
 * with checkType='expiry' so deindexing decisions are provable (GDPR/SOC2)
 * and dead-rate dashboards can attribute the right cause.
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authError = await verifyCronOrAdmin(request);
  if (authError) return authError;

  try {
    // 1. Snapshot the IDs first so we can write audit rows for the
    //    same set we're about to flip. Selecting + updating is two
    //    statements but the table indexes on (isPublished, expiresAt)
    //    so the read is cheap and gives us per-row context.
    const expiringJobs = await prisma.job.findMany({
      where: {
        isPublished: true,
        expiresAt: { lt: new Date() },
      },
      select: { id: true, sourceProvider: true, expiresAt: true },
    });

    if (expiringJobs.length === 0) {
      return NextResponse.json({
        success: true,
        expiredCount: 0,
        auditRowsWritten: 0,
        timestamp: new Date().toISOString(),
      });
    }

    // 2. Flip the rows.
    const ids = expiringJobs.map((j) => j.id);
    const result = await prisma.job.updateMany({
      where: { id: { in: ids } },
      data: { isPublished: false },
    });

    // 3. Audit each unpublish via HealthRecorder. Failures are non-fatal
    //    — losing an audit row is bad but not as bad as a flaky cron.
    const recorder = new HealthRecorder(prisma);
    for (const j of expiringJobs) {
      await recorder.stageExpiry(j);
    }
    await recorder.flush();
    const recorderStats = recorder.stats();

    console.log(
      `Unpublished ${result.count} expired jobs · audit rows: ${recorderStats.flushed}` +
      (recorderStats.failedFlushes > 0
        ? ` · failed flushes: ${recorderStats.failedFlushes}`
        : ''),
    );

    return NextResponse.json({
      success: true,
      expiredCount: result.count,
      auditRowsWritten: recorderStats.flushed,
      auditFailedFlushes: recorderStats.failedFlushes,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    await sendCronFailureAlert('cleanup-expired', error);
    console.error('Cron cleanup-expired error:', error)
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 })
  }
}
