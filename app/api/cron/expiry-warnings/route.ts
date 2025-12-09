import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendExpiryWarningEmail } from '@/lib/email-service'

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  try {
    // Find jobs expiring in 5 days
    const fiveDaysFromNow = new Date()
    fiveDaysFromNow.setDate(fiveDaysFromNow.getDate() + 5)
    
    const fourDaysFromNow = new Date()
    fourDaysFromNow.setDate(fourDaysFromNow.getDate() + 4)
    
    const expiringJobs = await prisma.job.findMany({
      where: {
        isPublished: true,
        sourceType: 'employer',
        expiresAt: {
          gte: fourDaysFromNow,
          lte: fiveDaysFromNow,
        },
      },
      include: {
        employerJobs: true,
      },
    })
    
    let sentCount = 0
    const errors: string[] = []
    
    for (const job of expiringJobs) {
      const employerJob = job.employerJobs[0]
      if (employerJob?.contactEmail) {
        try {
          await sendExpiryWarningEmail(
            employerJob.contactEmail,
            job.title,
            job.expiresAt!,
            job.viewCount || 0,
            job.applyClickCount || 0,
            employerJob.dashboardToken || employerJob.editToken,
            employerJob.editToken,
            employerJob.unsubscribeToken || ''
          )
          sentCount++
        } catch (e) {
          errors.push(`Job ${job.id}: ${e}`)
          console.error(`Failed to send expiry warning for job ${job.id}:`, e)
        }
      }
    }
    
    return NextResponse.json({ 
      success: true, 
      warningsSent: sentCount,
      errors,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Cron expiry-warnings error:', error)
    return NextResponse.json({ error: 'Expiry warnings failed' }, { status: 500 })
  }
}
