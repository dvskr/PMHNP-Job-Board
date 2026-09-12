import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/lib/supabase/server'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

/**
 * POST /api/applications — Log a job application
 * Body: { jobId: string, sourceUrl?: string }
 */
export async function POST(request: NextRequest) {
    // Rate limiting
    const rateLimitResult = await rateLimit(request, 'applications', RATE_LIMITS.general);
    if (rateLimitResult) return rateLimitResult;

    try {
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json()
        const { jobId, sourceUrl } = body

        if (!jobId || typeof jobId !== 'string') {
            return NextResponse.json({ error: 'jobId is required' }, { status: 400 })
        }

        // Upsert — don't duplicate if user already applied
        const application = await prisma.jobApplication.upsert({
            where: {
                userId_jobId: { userId: user.id, jobId },
            },
            update: {}, // no-op if exists
            create: {
                userId: user.id,
                jobId,
                sourceUrl: sourceUrl || null,
            },
        })

        return NextResponse.json({ success: true, id: application.id })
    } catch (error) {
        console.error('Error logging application:', error)
        return NextResponse.json({ error: 'Failed to log application' }, { status: 500 })
    }
}

/**
 * DELETE /api/applications — Remove an application row by jobId.
 *
 * Distinct from `/withdraw`: this is for "remove from my history" cases —
 * mistaken click-throughs the user never actually submitted, or stale
 * entries the user wants to prune. Hard-deletes the JobApplication row.
 *
 * Withdrawal (GDPR scrub of an actually-submitted in-platform app) is the
 * `/withdraw` endpoint and keeps the record with status='withdrawn'.
 *
 * A submitted in-platform application is NOT prunable here. It carries the
 * cover letter, resume pointer, screening answers and consent record the
 * employer's pipeline reads, and the /saved "Clear history" button walked
 * every tracked id through this endpoint — one confirm dialog hard-deleted
 * real submissions out from under the employer. Those rows answer 409 and
 * have to go through /withdraw, which scrubs the PII but keeps the record.
 *
 * Body: { jobId: string }
 */

/**
 * Marks a row the candidate actually submitted through the platform:
 * apply-direct writes sourceUrl='platform' and consentGiven=true, and
 * consent is never set on a click-through log.
 */
function isSubmittedApplication(row: { sourceUrl: string | null; consentGiven: boolean }): boolean {
    return row.sourceUrl === 'platform' || row.consentGiven === true
}

export async function DELETE(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json()
        const { jobId } = body

        if (!jobId || typeof jobId !== 'string') {
            return NextResponse.json({ error: 'jobId is required' }, { status: 400 })
        }

        const existing = await prisma.jobApplication.findUnique({
            where: { userId_jobId: { userId: user.id, jobId } },
            select: { sourceUrl: true, consentGiven: true },
        })

        // Already gone (or never tracked server-side): the client's local
        // history was simply ahead of us. Idempotent success, not a 404.
        if (!existing) {
            return NextResponse.json({ success: true, deleted: false })
        }

        if (isSubmittedApplication(existing)) {
            return NextResponse.json(
                {
                    error: 'Submitted applications cannot be deleted from your history. Withdraw it from your applications page instead.',
                    code: 'submitted_application',
                },
                { status: 409 }
            )
        }

        // The discriminator is re-asserted in the delete filter, so a submission
        // that lands between the read above and this write is still spared.
        const result = await prisma.jobApplication.deleteMany({
            where: {
                userId: user.id,
                jobId,
                consentGiven: false,
                OR: [{ sourceUrl: null }, { sourceUrl: { not: 'platform' } }],
            },
        })

        return NextResponse.json({ success: true, deleted: result.count > 0 })
    } catch (error) {
        console.error('Error deleting application:', error)
        return NextResponse.json({ error: 'Failed to delete application' }, { status: 500 })
    }
}

/**
 * GET /api/applications — Fetch user's applications with job details
 */
export async function GET() {
    try {
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const applications = await prisma.jobApplication.findMany({
            where: { userId: user.id },
            orderBy: { appliedAt: 'desc' },
            take: 50,
            include: {
                job: {
                    select: {
                        id: true,
                        title: true,
                        slug: true,
                        employer: true,
                        location: true,
                        jobType: true,
                        mode: true,
                        displaySalary: true,
                        isPublished: true,
                    },
                },
            },
        })

        return NextResponse.json(applications)
    } catch (error) {
        console.error('Error fetching applications:', error)
        return NextResponse.json({ error: 'Failed to fetch applications' }, { status: 500 })
    }
}
