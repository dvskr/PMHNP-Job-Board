import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendPerformanceReportEmail } from '@/lib/email-service'

export const maxDuration = 120 // 2 minutes — employer report emails

export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        // Find all employers with active jobs
        const employerJobs = await prisma.employerJob.findMany({
            where: {
                job: {
                    isPublished: true,
                    OR: [
                        { expiresAt: null },
                        { expiresAt: { gt: new Date() } },
                    ],
                },
            },
            include: {
                job: {
                    select: {
                        title: true,
                        viewCount: true,
                        applyClickCount: true,
                    },
                },
            },
        })

        // Group by employer email
        const employerMap = new Map<string, {
            employerName: string
            dashboardToken: string
            jobs: Array<{ title: string; views: number; applyClicks: number; applications: number; dashboardToken: string }>
        }>()

        for (const ej of employerJobs) {
            const existing = employerMap.get(ej.contactEmail) || {
                employerName: ej.employerName,
                dashboardToken: ej.dashboardToken || ej.editToken,
                jobs: [],
            }

            // Count applications for this job
            const appCount = await prisma.jobApplication.count({
                where: { jobId: ej.jobId },
            }).catch(() => 0)

            existing.jobs.push({
                title: ej.job.title,
                views: ej.job.viewCount || 0,
                applyClicks: ej.job.applyClickCount || 0,
                applications: appCount,
                dashboardToken: ej.dashboardToken || ej.editToken,
            })

            employerMap.set(ej.contactEmail, existing)
        }

        let sentCount = 0
        const errors: string[] = []

        for (const [email, data] of employerMap) {
            // Only send if there's meaningful activity (at least 1 view)
            const totalViews = data.jobs.reduce((s, j) => s + j.views, 0)
            if (totalViews === 0) continue

            try {
                await sendPerformanceReportEmail(
                    email,
                    data.employerName,
                    data.jobs,
                    'Weekly'
                )
                sentCount++
            } catch (e) {
                errors.push(`${email}: ${e}`)
            }

            if (sentCount % 10 === 0) {
                await new Promise(r => setTimeout(r, 1000))
            }
        }

        return NextResponse.json({
            success: true,
            employersFound: employerMap.size,
            reportsSent: sentCount,
            errors,
            timestamp: new Date().toISOString(),
        })
    } catch (error) {
        console.error('Employer report cron error:', error)
        return NextResponse.json({ error: 'Employer report failed' }, { status: 500 })
    }
}
