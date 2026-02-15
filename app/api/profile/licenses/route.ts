import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { sanitizeText } from '@/lib/sanitize'

const VALID_LICENSE_TYPES = ['RN', 'APRN', 'Compact (NLC)', 'Compact (APRN)']
const VALID_STATUSES = ['active', 'inactive', 'restricted']

// GET — fetch all licenses for the current user
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

        const licenses = await prisma.candidateLicense.findMany({
            where: { userId: profile.id },
            orderBy: { createdAt: 'desc' },
        })

        return NextResponse.json(licenses)
    } catch (err) {
        console.error('Licenses GET error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// POST — create a new license
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
        const { licenseType, licenseNumber, licenseState, expirationDate, status } = body

        if (!licenseType || !licenseNumber || !licenseState) {
            return NextResponse.json(
                { error: 'License type, number, and state are required' },
                { status: 400 }
            )
        }

        if (!VALID_LICENSE_TYPES.includes(licenseType)) {
            return NextResponse.json({ error: 'Invalid license type' }, { status: 400 })
        }

        const license = await prisma.candidateLicense.create({
            data: {
                userId: profile.id,
                licenseType: sanitizeText(licenseType, 50),
                licenseNumber: sanitizeText(licenseNumber, 100),
                licenseState: sanitizeText(licenseState, 10),
                expirationDate: expirationDate ? new Date(expirationDate) : null,
                status: status && VALID_STATUSES.includes(status) ? status : 'active',
            },
        })

        return NextResponse.json(license, { status: 201 })
    } catch (err) {
        console.error('License POST error:', err)
        return NextResponse.json({ error: 'Failed to create license' }, { status: 500 })
    }
}
