import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendPerformanceReportEmail } from '@/lib/email-service'
import { verifyCronOrAdmin } from '@/lib/auth/verify-cron-or-admin';
import { sendCronFailureAlert } from '@/lib/discord-notifier';

export const maxDuration = 120 // 2 minutes — employer report emails

export async function GET(request: NextRequest) {
    const authError = await verifyCronOrAdmin(request);
    if (authError) return authError;

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

            // Throttle: pause 1s before every 10th send (other than the
            // first batch). Previously the modulo check fired AFTER the
            // increment, so the first 10 sends went out without pause and
            // sends 11-20 paused twice. Net: provider rate-limit risk on
            // the first burst.
            if (sentCount > 0 && sentCount % 10 === 0) {
                await new Promise(r => setTimeout(r, 1000))
            }

            try {
                await sendPerformanceReportEmail(
                    email,
                    data.employerName,
                    data.jobs,
                    'Monthly'
                )
                sentCount++
            } catch (e) {
                errors.push(`${email}: ${e}`)
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
        await sendCronFailureAlert('employer-report', error);
        console.error('Employer report cron error:', error)
        return NextResponse.json({ error: 'Employer report failed' }, { status: 500 })
    }
}
