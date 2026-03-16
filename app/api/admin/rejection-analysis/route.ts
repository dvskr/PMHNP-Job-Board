import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/admin/rejection-analysis
 * 
 * Prisma-powered rejection analysis for the ingestion pipeline.
 * Returns breakdown by reason and by source×reason.
 */
export async function GET(request: Request) {
  // Simple auth check
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Optional date filter (default: last 7 days)
  const daysBack = parseInt(searchParams.get('days') || '7', 10);
  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  // 1. Rejection breakdown by reason
  const byReason = await prisma.rejectedJob.groupBy({
    by: ['rejectionReason'],
    _count: { id: true },
    where: { createdAt: { gte: since } },
    orderBy: { _count: { id: 'desc' } },
  });

  // 2. Breakdown by source × reason
  const bySourceReason = await prisma.rejectedJob.groupBy({
    by: ['sourceProvider', 'rejectionReason'],
    _count: { id: true },
    where: { createdAt: { gte: since } },
    orderBy: { _count: { id: 'desc' } },
  });

  // 3. Total counts
  const totalRejected = await prisma.rejectedJob.count({
    where: { createdAt: { gte: since } },
  });

  const totalPublished = await prisma.job.count({
    where: { isPublished: true },
  });

  // 4. Recent rejections sample (last 20)
  const recentSample = await prisma.rejectedJob.findMany({
    where: { createdAt: { gte: since } },
    select: {
      title: true,
      employer: true,
      sourceProvider: true,
      rejectionReason: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  return NextResponse.json({
    period: `Last ${daysBack} days (since ${since.toISOString().split('T')[0]})`,
    totalRejected,
    totalPublished,
    byReason: byReason.map(r => ({
      reason: r.rejectionReason,
      count: r._count.id,
    })),
    bySourceReason: bySourceReason.map(r => ({
      source: r.sourceProvider,
      reason: r.rejectionReason,
      count: r._count.id,
    })),
    recentSample,
  });
}
