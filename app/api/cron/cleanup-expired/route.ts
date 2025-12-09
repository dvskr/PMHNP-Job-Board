import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
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

