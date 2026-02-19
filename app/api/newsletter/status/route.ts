import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/newsletter/status?email=...  — Check newsletter opt-in status
 */
export async function GET(request: NextRequest) {
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
