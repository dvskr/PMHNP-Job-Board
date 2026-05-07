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
 * Body: { jobId: string }
 */
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

        await prisma.jobApplication.deleteMany({
            where: { userId: user.id, jobId },
        })

        return NextResponse.json({ success: true })
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
