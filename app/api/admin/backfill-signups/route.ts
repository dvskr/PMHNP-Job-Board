import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { syncToBeehiiv } from '@/lib/beehiiv'
import crypto from 'crypto'

/**
 * Backfill: Create job alerts + sync to Beehiiv for given emails.
 * Auto-creates EmailLead if missing.
 *
 * GET /api/admin/backfill-signups (auth: Bearer CRON_SECRET)
 */
export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const emails = [
        'jeremysakkas@gmail.com',
        'johnfjamero@gmail.com',
        'rebecca@centeredpsychiatrycare.com',
        'tbini2019@gmail.com',
    ]

    const results: Record<string, { lead: string; alert: string; beehiiv: string }> = {}

    for (const email of emails) {
        results[email] = { lead: 'skipped', alert: 'skipped', beehiiv: 'skipped' }

        // 1. Ensure EmailLead exists (create if missing)
        let lead = await prisma.emailLead.findUnique({ where: { email } })
        if (!lead) {
            try {
                lead = await prisma.emailLead.create({
                    data: { email, source: 'manual_add' },
                })
                results[email].lead = 'CREATED ✅'
            } catch (e) {
                results[email].lead = `FAILED: ${e}`
                continue
            }
        } else {
            results[email].lead = 'already exists'
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
            await syncToBeehiiv(email, { utmSource: 'manual_add' })
            results[email].beehiiv = 'synced ✅'
        } catch (e) {
            results[email].beehiiv = `FAILED: ${e}`
        }
    }

    return NextResponse.json({ success: true, results })
}

