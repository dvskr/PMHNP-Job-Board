import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyCronOrAdmin } from '@/lib/auth/verify-cron-or-admin';

export const maxDuration = 60 // 1 minute

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authError = await verifyCronOrAdmin(request);
  if (authError) return authError;

  try {
    // Mark expired jobs as unpublished
    const result = await prisma.job.updateMany({
      where: {
        isPublished: true,
        expiresAt: {
          lt: new Date(),
        },
      },
      data: {
        isPublished: false,
      },
    })

    console.log(`Unpublished ${result.count} expired jobs`)

    return NextResponse.json({
      success: true,
      expiredCount: result.count,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Cron cleanup-expired error:', error)
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 })
  }
}

