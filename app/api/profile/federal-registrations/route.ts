import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { verifyCsrf } from '@/lib/csrf';
import { sanitizeText } from '@/lib/sanitize'


export async function PUT(request: NextRequest) {
    // Defence in depth on a cross-origin write. Every other mutating surface
    // calls this (PATCH /api/auth/profile, the message routes); the profile
    // sub-resources did not, so a Supabase cookie's SameSite policy was the
    // only thing standing between a cross-site page and a write to this
    // candidate's licences, education, EEO answers or federal registrations.
    // verifyCsrf is a no-op for Bearer callers, so the extension is unaffected.
    const csrfError = verifyCsrf(request);
    if (csrfError) return csrfError;

    try {
        const supabase = await createClient()
        const { data: { user }, error } = await supabase.auth.getUser()

        if (error || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json()
        const {
            npiNumber,
            deaNumber,
            deaExpirationDate,
        } = body

        const updatedProfile = await prisma.userProfile.update({
            where: { supabaseId: user.id },
            data: {
                ...(npiNumber !== undefined && {
                    npiNumber: npiNumber ? sanitizeText(npiNumber, 10) : null,
                }),
                ...(deaNumber !== undefined && {
                    deaNumber: deaNumber ? sanitizeText(deaNumber, 20) : null,
                }),
                ...(deaExpirationDate !== undefined && {
                    deaExpirationDate: deaExpirationDate ? new Date(deaExpirationDate) : null,
                }),
            },
        })

        return NextResponse.json(updatedProfile)
    } catch (err) {
        console.error('Federal registrations update error:', err)
        return NextResponse.json(
            { error: 'Failed to update federal registrations' },
            { status: 500 }
        )
    }
}
