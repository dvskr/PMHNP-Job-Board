import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { syncToBeehiiv, unsubscribeFromBeehiiv } from '@/lib/beehiiv'

/**
 * POST /api/newsletter — Capture email for newsletter
 * Body: { email: string, source?: string }
 *
 * Upserts EmailLead: creates if new, flips newsletterOptIn if exists.
 */
export async function POST(request: NextRequest) {
    // Rate limiting
    const rateLimitResult = await rateLimit(request, 'jobAlerts', RATE_LIMITS.jobAlerts)
    if (rateLimitResult) return rateLimitResult

    try {
        const body = await request.json()
        const { email, source, optIn = true } = body

        // Validate email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!email || typeof email !== 'string' || !emailRegex.test(email.trim())) {
            return NextResponse.json(
                { success: false, error: 'Please enter a valid email address' },
                { status: 400 }
            )
        }

        const normalizedEmail = email.trim().toLowerCase()

        if (optIn) {
            // Subscribe: create if new, set true if exists
            await prisma.emailLead.upsert({
                where: { email: normalizedEmail },
                update: { newsletterOptIn: true },
                create: {
                    email: normalizedEmail,
                    source: source || 'newsletter',
                    newsletterOptIn: true,
                },
            })

            // Sync to Beehiiv newsletter (fire-and-forget)
            syncToBeehiiv(normalizedEmail, { utmSource: source || 'newsletter' })
        } else {
            // Unsubscribe: set false if exists (don't create)
            await prisma.emailLead.update({
                where: { email: normalizedEmail },
                data: { newsletterOptIn: false },
            }).catch(() => {
                // Ignore if not found
            })

            // Also push to Beehiiv so they actually stop receiving emails.
            // Fire-and-forget — DB write is the source of truth for the UI.
            unsubscribeFromBeehiiv(normalizedEmail)
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Newsletter signup error:', error)
        return NextResponse.json(
            { success: false, error: 'Something went wrong. Please try again.' },
            { status: 500 }
        )
    }
}
