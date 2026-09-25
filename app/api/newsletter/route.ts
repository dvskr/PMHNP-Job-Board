import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { syncToBeehiiv, unsubscribeFromBeehiiv } from '@/lib/beehiiv'
import { readJsonBody } from '@/app/api/_lib/json-body'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/newsletter — Capture email for newsletter
 * Body: { email: string, source?: string, optIn?: boolean }
 *
 * Upserts EmailLead: creates if new, flips newsletterOptIn if exists.
 *
 * Opting IN is open to anyone: the worst case is a subscription the address
 * owner did not ask for, and the welcome mail carries an unsubscribe link.
 * Opting OUT is not, because it changes someone else's state: before this
 * check an anonymous caller who knew an address could POST { optIn: false }
 * and silently unsubscribe them, here and in Beehiiv, with no token and no
 * session. Both in-app callers (the candidate settings toggle and the
 * employer settings toggle) are signed in and toggling their own address, so
 * requiring that costs them nothing. Recipients who only have an email in
 * hand use the tokenised /api/email/unsubscribe link instead.
 */
export async function POST(request: NextRequest) {
    // Rate limiting
    const rateLimitResult = await rateLimit(request, 'jobAlerts', RATE_LIMITS.jobAlerts)
    if (rateLimitResult) return rateLimitResult

    const parsed = await readJsonBody(request)
    if (!parsed.ok) return parsed.response

    try {
        const body = parsed.body
        const email = body.email
        const source = typeof body.source === 'string' ? body.source : undefined
        const optIn = body.optIn === undefined ? true : body.optIn !== false

        // Validate email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!email || typeof email !== 'string' || !emailRegex.test(email.trim())) {
            return NextResponse.json(
                { success: false, error: 'Please enter a valid email address' },
                { status: 400 }
            )
        }

        const normalizedEmail = email.trim().toLowerCase()

        if (!optIn && !(await ownsEmail(normalizedEmail))) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Sign in with this address, or use the unsubscribe link in any of our emails.',
                },
                { status: 403 }
            )
        }

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

/**
 * Is the caller signed in as the address they are trying to unsubscribe?
 *
 * Supabase is the identity of record here, not the EmailLead row: the lead
 * table has no owner column, so the only proof of ownership available is a
 * confirmed session whose email matches. An auth failure is treated as "not
 * the owner" rather than an error, so the route stays usable for opt-in.
 */
async function ownsEmail(normalizedEmail: string): Promise<boolean> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        return !!user?.email && user.email.trim().toLowerCase() === normalizedEmail
    } catch (err) {
        console.error('Newsletter ownership check failed:', err)
        return false
    }
}
