import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { sanitizeText } from '@/lib/sanitize'

const VALID_CERT_NAMES = [
    'PMHNP-BC', 'FNP-BC', 'FNP-C', 'AGPCNP-BC', 'AGACNP-BC',
    'CAQ-Psych', 'BLS', 'ACLS', 'CPI/CPI-NV', 'CARN',
]
const VALID_BODIES = ['ANCC', 'AANP', 'AHA', 'CPI']

// GET — fetch all certifications for the current user
export async function GET() {
    try {
        const supabase = await createClient()
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const profile = await prisma.userProfile.findUnique({
            where: { supabaseId: user.id },
            select: { id: true },
        })
        if (!profile) {
            return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
        }

        const certs = await prisma.candidateCertification.findMany({
            where: { userId: profile.id },
            orderBy: { createdAt: 'desc' },
        })

        return NextResponse.json(certs)
    } catch (err) {
        console.error('Certifications GET error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// POST — create a new certification
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const profile = await prisma.userProfile.findUnique({
            where: { supabaseId: user.id },
            select: { id: true },
        })
        if (!profile) {
            return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
        }

        const body = await request.json()
        const { certificationName, certifyingBody, certificationNumber, expirationDate } = body

        if (!certificationName) {
            return NextResponse.json({ error: 'Certification name is required' }, { status: 400 })
        }

        const cert = await prisma.candidateCertification.create({
            data: {
                userId: profile.id,
                certificationName: sanitizeText(certificationName, 100),
                certifyingBody: certifyingBody ? sanitizeText(certifyingBody, 100) : null,
                certificationNumber: certificationNumber ? sanitizeText(certificationNumber, 100) : null,
                expirationDate: expirationDate ? new Date(expirationDate) : null,
            },
        })

        return NextResponse.json(cert, { status: 201 })
    } catch (err) {
        console.error('Certification POST error:', err)
        return NextResponse.json({ error: 'Failed to create certification' }, { status: 500 })
    }
}
