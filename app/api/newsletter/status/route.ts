import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'

/**
 * GET /api/newsletter/status?email=...  — Check newsletter opt-in status.
 * Rate-limited because it distinguishes known vs unknown emails (an enumeration
 * oracle otherwise). Legitimate callers check only their own email once.
 */
export async function GET(request: NextRequest) {
    const limited = await rateLimit(request, 'newsletter-status', RATE_LIMITS.general)
    if (limited) return limited

    const email = request.nextUrl.searchParams.get('email')

    if (!email) {
        return NextResponse.json({ optIn: false })
    }

    const lead = await prisma.emailLead.findUnique({
        where: { email: email.trim().toLowerCase() },
        select: { newsletterOptIn: true },
    })

    return NextResponse.json({ optIn: lead?.newsletterOptIn ?? false })
}
