import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { syncToBeehiiv } from '@/lib/beehiiv'
import crypto from 'crypto'

/**
 * ONE-TIME backfill for users affected by the signup bug:
 * 1. JobAlert wasn't created (FK ordering issue)
 * 2. Beehiiv sync was missing from signup flow
 *
 * DELETE this route after running once.
 */
export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const emails = [
        'corbanjoy@gmail.com',
        'pkanchi27@gmail.com',
        'mrs.tlewis31@gmail.com',
    ]

    const results: Record<string, { alert: string; beehiiv: string }> = {}

    for (const email of emails) {
        results[email] = { alert: 'skipped', beehiiv: 'skipped' }

        // 1. Ensure EmailLead exists
        const lead = await prisma.emailLead.findUnique({ where: { email } })
        if (!lead) {
            results[email].alert = 'no EmailLead found — skipped'
            continue
        }

        // 2. Create JobAlert if missing
        const existingAlert = await prisma.jobAlert.findFirst({ where: { email } })
        if (!existingAlert) {
            try {
                await prisma.jobAlert.create({
                    data: {
                        email,
                        name: 'Job Highlights',
                        frequency: 'daily',
                        isActive: true,
                        token: crypto.randomUUID(),
                    },
                })
                results[email].alert = 'CREATED ✅'
            } catch (e) {
                results[email].alert = `FAILED: ${e}`
            }
        } else {
            results[email].alert = 'already exists'
        }

        // 3. Sync to Beehiiv
        try {
            syncToBeehiiv(email, { utmSource: 'signup_backfill' })
            results[email].beehiiv = 'synced ✅'
        } catch (e) {
            results[email].beehiiv = `FAILED: ${e}`
        }
    }

    return NextResponse.json({ success: true, results })
}
