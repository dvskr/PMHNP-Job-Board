import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendExpiryWarningEmail } from '@/lib/email-service'
import { verifyCronOrAdmin } from '@/lib/auth/verify-cron-or-admin';
import { sendCronFailureAlert } from '@/lib/discord-notifier';

export const maxDuration = 120 // 2 minutes — expiry warning emails

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authError = await verifyCronOrAdmin(request);
  if (authError) return authError;

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
        // Only warn once per job (dedup via expiryWarningSentAt)
        employerJobs: {
          expiryWarningSentAt: null,
        },
      },
      include: {
        employerJobs: true,
      },
    })

    let sentCount = 0
    const errors: string[] = []

    for (const job of expiringJobs) {
      const employerJob = job.employerJobs
      if (employerJob?.contactEmail) {
        try {
          await sendExpiryWarningEmail(
            employerJob.contactEmail,
            job.title,
            job.expiresAt!,
            job.viewCount || 0,
            job.applyClickCount || 0,
            employerJob.dashboardToken || employerJob.editToken,
            null // unsubscribeToken — sendExpiryWarningEmail will mint one if null
          )
          sentCount++

          // Mark as warned (dedup)
          await prisma.employerJob.update({
            where: { id: employerJob.id },
            data: { expiryWarningSentAt: new Date() },
          })
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
      await sendCronFailureAlert('expiry-warnings', error);
    console.error('Cron expiry-warnings error:', error)
    return NextResponse.json({ error: 'Expiry warnings failed' }, { status: 500 })
  }
}
