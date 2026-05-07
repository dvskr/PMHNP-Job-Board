/**
 * rejected_jobs retention cron.
 *
 * The table grows ~10k/wk (mostly `duplicate_*` rows from per-run dedup
 * tracking) and was unbounded. After 2026-05-06 we have aggregate
 * counts on `source_stats.rejected_by_reason`, so the per-row history
 * only needs to live long enough to support spot-check audits and the
 * occasional regex re-classification — 30 days is plenty.
 *
 * Forward-only delete; recoverable from Supabase point-in-time backups
 * if the retention window ever needs to be extended retroactively.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyCronOrAdmin } from '@/lib/auth/verify-cron-or-admin';
import { sendCronFailureAlert } from '@/lib/discord-notifier';

export const maxDuration = 60;

const RETENTION_DAYS = 30;

export async function GET(request: NextRequest) {
  const authError = await verifyCronOrAdmin(request);
  if (authError) return authError;

  try {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const result = await prisma.rejectedJob.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    console.log(`[cleanup-rejected-jobs] Deleted ${result.count} rows older than ${RETENTION_DAYS}d`);
    return NextResponse.json({
      success: true,
      deleted: result.count,
      retentionDays: RETENTION_DAYS,
      cutoff: cutoff.toISOString(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    await sendCronFailureAlert('cleanup-rejected-jobs', error);
    console.error('Cron cleanup-rejected-jobs error:', error);
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
  }
}
