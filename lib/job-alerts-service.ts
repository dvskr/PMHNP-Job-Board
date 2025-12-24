import { prisma } from '@/lib/prisma'
import { sendJobAlertEmail } from '@/lib/email-service'
import { Prisma } from '@prisma/client'

export async function sendJobAlerts(): Promise<{
  sent: number
  skipped: number
  errors: string[]
}> {
  const results = {
    sent: 0,
    skipped: 0,
    errors: [] as string[],
  }

  try {
    // Get all active job alerts that need to be sent
    // For daily alerts: lastSentAt is null or more than 24 hours ago
    // For weekly alerts: lastSentAt is null or more than 7 days ago
    const now = new Date()
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    const alerts = await prisma.jobAlert.findMany({
      where: {
        isActive: true,
        OR: [
          // Never sent
          { lastSentAt: null },
          // Daily alerts not sent in last 24 hours
          {
            frequency: 'daily',
            lastSentAt: { lt: oneDayAgo },
          },
          // Weekly alerts not sent in last 7 days
          {
            frequency: 'weekly',
            lastSentAt: { lt: oneWeekAgo },
          },
        ],
      },
    })

    console.log(`Processing ${alerts.length} job alerts`)

    for (const alert of alerts) {
      try {
        // Build the query based on alert criteria
        const whereClause: Prisma.JobWhereInput = {
          isPublished: true,
          createdAt: {
            gt: alert.lastSentAt || alert.createdAt,
          },
        }

        // Add optional filters
        if (alert.keyword) {
          whereClause.OR = [
            { title: { contains: alert.keyword, mode: 'insensitive' } },
            { description: { contains: alert.keyword, mode: 'insensitive' } },
            { employer: { contains: alert.keyword, mode: 'insensitive' } },
          ]
        }
        if (alert.location) {
          whereClause.location = { contains: alert.location, mode: 'insensitive' }
        }
        if (alert.mode) {
          whereClause.mode = alert.mode
        }
        if (alert.jobType) {
          whereClause.jobType = alert.jobType
        }
        if (alert.minSalary) {
          whereClause.minSalary = { gte: alert.minSalary }
        }

        // Find matching jobs
        const matchingJobs = await prisma.job.findMany({
          where: whereClause,
          orderBy: { createdAt: 'desc' },
          take: 10, // Limit to 10 jobs per alert
        })

        if (matchingJobs.length > 0) {
          // Send the alert email
          await sendJobAlertEmail(alert.email, matchingJobs, alert.token)

          // Update lastSentAt
          await prisma.jobAlert.update({
            where: { id: alert.id },
            data: { lastSentAt: now },
          })

          results.sent++
          console.log(`Sent alert to ${alert.email} with ${matchingJobs.length} jobs`)
        } else {
          results.skipped++
          console.log(`Skipped alert for ${alert.email} - no matching jobs`)
        }
      } catch (alertError) {
        const errorMsg = `Alert ${alert.id} (${alert.email}): ${alertError}`
        results.errors.push(errorMsg)
        console.error(errorMsg)
      }
    }

    return results
  } catch (error) {
    console.error('Job alerts service error:', error)
    throw error
  }
}

